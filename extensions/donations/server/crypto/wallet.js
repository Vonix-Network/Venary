/* =======================================
   Crypto Donation Support — HD Wallet
   BIP39 mnemonic management, AES-256 encryption,
   and deterministic address derivation for Solana + Litecoin.
   ======================================= */
'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { SeedDecryptionError, InvalidMnemonicError } = require('./errors');

// ── Lazy-load heavy crypto deps to avoid startup cost when crypto is disabled ──
let _bip39, _ed25519HdKey, _bitcoin, _ecc, _bs58;

function getBip39() {
    if (!_bip39) _bip39 = require('bip39');
    return _bip39;
}

function getEd25519HdKey() {
    if (!_ed25519HdKey) _ed25519HdKey = require('ed25519-hd-key');
    return _ed25519HdKey;
}

function getBitcoin() {
    if (!_bitcoin) {
        _ecc = require('tiny-secp256k1');
        const { BIP32Factory } = require('bip32');
        _bitcoin = { lib: require('bitcoinjs-lib'), bip32: BIP32Factory(_ecc) };
    }
    return _bitcoin;
}

function getBs58() {
    if (!_bs58) {
        const mod = require('bs58');
        // bs58 v6+ ships as ESM with a default export; handle both layouts
        _bs58 = mod.default ?? mod;
    }
    return _bs58;
}

// ── Litecoin network params ──
const LITECOIN_NETWORK = {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'ltc',
    bip32: { public: 0x019da462, private: 0x019d9cfe },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0,
};

// ── Encryption key derivation ──
// v2 (current): PBKDF2(JWT_SECRET, unique_random_salt, 100000 iterations, SHA-256)
//   Ciphertext format: salt_hex:iv_hex:ciphertext_hex  (3 colon-delimited parts)
// v1 (legacy):  PBKDF2(JWT_SECRET+static_salt, static_salt, 100000 iterations, SHA-256)
//   Ciphertext format: iv_hex:ciphertext_hex             (2 colon-delimited parts)
const LEGACY_STATIC_SALT = 'crypto-wallet-salt-v1';

function _deriveKeyV1() {
    // Legacy key derivation — used only for decrypting seeds stored before v2 upgrade.
    // The original code incorrectly used the same constant as both the password suffix and PBKDF2 salt.
    const secret = (process.env.JWT_SECRET || 'venary-gaming-platform-secret-key-2024') + LEGACY_STATIC_SALT;
    return crypto.pbkdf2Sync(secret, LEGACY_STATIC_SALT, 100000, 32, 'sha256');
}

function _deriveKeyV2(saltBuf) {
    // Current key derivation — per-seed random salt, correct PBKDF2 usage.
    const password = process.env.JWT_SECRET || 'venary-gaming-platform-secret-key-2024';
    return crypto.pbkdf2Sync(password, saltBuf, 100000, 32, 'sha256');
}

/**
 * Encrypt a BIP39 mnemonic with AES-256-CBC using a per-seed random PBKDF2 salt (v2).
 * Returns `salt_hex:iv_hex:ciphertext_hex` — never logs the plaintext.
 * @param {string} mnemonic
 * @returns {string}
 */
function encryptSeed(mnemonic) {
    const salt = crypto.randomBytes(16); // unique per seed — correct PBKDF2 usage
    const key  = _deriveKeyV2(salt);
    const iv   = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()]);
    // v2 format: 3 parts — salt:iv:ciphertext
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt an AES-256-CBC encrypted seed.
 * Supports both v2 (salt:iv:ciphertext) and v1 (iv:ciphertext) formats for backward compat.
 * Throws SeedDecryptionError on any failure — never logs keys or plaintext.
 * @param {string} ciphertext
 * @returns {string} mnemonic
 */
function decryptSeed(ciphertext) {
    try {
        const parts = ciphertext.split(':');
        if (parts.length === 3) {
            // v2: salt:iv:ciphertext
            const [saltHex, ivHex, encHex] = parts;
            const key = _deriveKeyV2(Buffer.from(saltHex, 'hex'));
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
            return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
        } else if (parts.length === 2) {
            // v1 legacy: iv:ciphertext — decrypt with static key, log upgrade advisory
            const [ivHex, encHex] = parts;
            if (!ivHex || !encHex) throw new Error('malformed ciphertext');
            const key = _deriveKeyV1();
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
            const plaintext = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
            // Advisory only — do not log the plaintext
            console.warn('[Donations/Crypto] ⚠ Legacy v1 seed format detected. Re-save the seed phrase in Crypto Settings to upgrade to v2 encryption.');
            return plaintext;
        } else {
            throw new Error('malformed ciphertext');
        }
    } catch {
        throw new SeedDecryptionError();
    }
}

/**
 * Validate a BIP39 mnemonic (12 or 24 words).
 * @param {string} mnemonic
 * @returns {boolean}
 */
function validateMnemonic(mnemonic) {
    return getBip39().validateMnemonic(mnemonic);
}

/**
 * Generate a new random BIP39 mnemonic (24 words).
 * @returns {string}
 */
function generateMnemonic() {
    return getBip39().generateMnemonic(256); // 256 bits = 24 words
}

/**
 * Derive a Solana address from a BIP39 mnemonic at the given index.
 * Path: m/44'/501'/0'/0'/{index}'
 * @param {string} mnemonic
 * @param {number} index
 * @returns {{ address: string, publicKey: Buffer }}
 */
function deriveSolanaAddress(mnemonic, index) {
    const bip39 = getBip39();
    const { derivePath, getPublicKey } = getEd25519HdKey();
    const bs58 = getBs58();

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = `m/44'/501'/0'/0'/${index}'`;
    const { key } = derivePath(path, seed.toString('hex'));
    const publicKey = getPublicKey(key, false);

    // Validate: 32-byte non-zero public key
    if (publicKey.length !== 32 || publicKey.every(b => b === 0)) {
        throw new Error(`Invalid Solana public key derived at index ${index}`);
    }

    const address = bs58.encode(publicKey);
    return { address, publicKey: Buffer.from(publicKey) };
}

/**
 * Derive a Litecoin P2PKH address from a BIP39 mnemonic at the given index.
 * Path: m/44'/2'/0'/0/{index}
 * @param {string} mnemonic
 * @param {number} index
 * @returns {{ address: string }}
 */
function deriveLitecoinAddress(mnemonic, index) {
    const bip39 = getBip39();
    const { lib: bitcoin, bip32 } = getBitcoin();

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, LITECOIN_NETWORK);
    const child = root.derivePath(`m/44'/2'/0'/0/${index}`);
    const { address } = bitcoin.payments.p2pkh({
        pubkey: child.publicKey,
        network: LITECOIN_NETWORK,
    });

    if (!address) throw new Error(`Failed to derive Litecoin address at index ${index}`);
    return { address };
}

/**
 * Get or create deterministic crypto addresses for a user.
 * Atomically allocates a derivation index and derives both SOL + LTC addresses.
 * Index 0 is reserved — user indices start at 1.
 *
 * @param {string} userId
 * @param {object} extDb  Extension database handle
 * @param {object} Config  Config module
 * @returns {Promise<{ sol_address: string, ltc_address: string, derivation_index: number }>}
 */
async function getOrCreateUserAddresses(userId, extDb, Config) {
    // Return existing if already derived
    const existing = await extDb.get(
        'SELECT sol_address, ltc_address, derivation_index FROM user_crypto_addresses WHERE user_id = ?',
        [userId]
    );
    if (existing) return existing;

    // Allocate next index (start at 1, 0 is reserved)
    const maxRow = await extDb.get('SELECT MAX(derivation_index) as max_idx FROM user_crypto_addresses');
    const index = Math.max(1, (maxRow?.max_idx ?? 0) + 1);

    const solSeedEnc = Config.get('donations.crypto.solana_seed_encrypted');
    const ltcSeedEnc = Config.get('donations.crypto.litecoin_seed_encrypted');

    let sol_address = null;
    let ltc_address = null;

    if (solSeedEnc) {
        const mnemonic = decryptSeed(solSeedEnc);
        sol_address = deriveSolanaAddress(mnemonic, index).address;
    }

    if (ltcSeedEnc) {
        const mnemonic = decryptSeed(ltcSeedEnc);
        ltc_address = deriveLitecoinAddress(mnemonic, index).address;
    }

    await extDb.run(
        `INSERT OR IGNORE INTO user_crypto_addresses (id, user_id, derivation_index, sol_address, ltc_address)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), userId, index, sol_address, ltc_address]
    );

    // Re-fetch in case of race (INSERT OR IGNORE means another process may have won)
    return extDb.get(
        'SELECT sol_address, ltc_address, derivation_index FROM user_crypto_addresses WHERE user_id = ?',
        [userId]
    );
}

/**
 * Derive a one-time address for a payment intent.
 * Uses a sequential counter stored in config to avoid reuse.
 *
 * @param {'sol'|'ltc'} coin
 * @param {object} Config
 * @returns {{ address: string, index: number }}
 */
function deriveIntentAddress(coin, Config) {
    const counterKey = `donations.crypto.intent_address_counter_${coin}`;
    const current = Config.get(counterKey, 10000); // intent addresses start at 10000
    const index = current + 1;
    Config.set(counterKey, index);

    const seedKey = coin === 'sol'
        ? 'donations.crypto.solana_seed_encrypted'
        : 'donations.crypto.litecoin_seed_encrypted';

    const seedEnc = Config.get(seedKey);
    if (!seedEnc) throw new Error(`No ${coin} seed configured`);

    const mnemonic = decryptSeed(seedEnc);
    const { address } = coin === 'sol'
        ? deriveSolanaAddress(mnemonic, index)
        : deriveLitecoinAddress(mnemonic, index);

    return { address, index };
}

/**
 * Return a masked display of the seed phrase (first + last word only).
 * Never returns the full phrase.
 * @param {string} encryptedSeed
 * @returns {string}  e.g. "abandon *** *** ... *** zoo"
 */
function getMaskedSeedDisplay(encryptedSeed) {
    try {
        const mnemonic = decryptSeed(encryptedSeed);
        const words = mnemonic.trim().split(/\s+/);
        if (words.length < 2) return '*** (invalid)';
        const masked = [words[0], ...Array(words.length - 2).fill('***'), words[words.length - 1]];
        return masked.join(' ');
    } catch {
        return '*** (error reading seed)';
    }
}

module.exports = {
    encryptSeed,
    decryptSeed,
    validateMnemonic,
    generateMnemonic,
    deriveSolanaAddress,
    deriveLitecoinAddress,
    getOrCreateUserAddresses,
    deriveIntentAddress,
    getMaskedSeedDisplay,
};
