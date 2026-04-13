/* =======================================
   Crypto Donation Support — HD Wallet
   Migrated from extensions/donations/server/crypto/wallet.js
   Now uses the shared db instead of extDb parameter.
   ======================================= */
'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../../db');
const { SeedDecryptionError, InvalidMnemonicError } = require('./errors');

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
        _bs58 = mod.default ?? mod;
    }
    return _bs58;
}

const LITECOIN_NETWORK = {
    messagePrefix: '\x19Litecoin Signed Message:\n',
    bech32: 'ltc',
    bip32: { public: 0x019da462, private: 0x019d9cfe },
    pubKeyHash: 0x30,
    scriptHash: 0x32,
    wif: 0xb0,
};

const LEGACY_STATIC_SALT = 'crypto-wallet-salt-v1';

function _deriveKeyV1() {
    const secret = (process.env.JWT_SECRET || 'venary-gaming-platform-secret-key-2024') + LEGACY_STATIC_SALT;
    return crypto.pbkdf2Sync(secret, LEGACY_STATIC_SALT, 100000, 32, 'sha256');
}

function _deriveKeyV2(saltBuf) {
    const password = process.env.JWT_SECRET || 'venary-gaming-platform-secret-key-2024';
    return crypto.pbkdf2Sync(password, saltBuf, 100000, 32, 'sha256');
}

function encryptSeed(mnemonic) {
    const salt = crypto.randomBytes(16);
    const key  = _deriveKeyV2(salt);
    const iv   = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(mnemonic, 'utf8'), cipher.final()]);
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSeed(ciphertext) {
    try {
        const parts = ciphertext.split(':');
        if (parts.length === 3) {
            const [saltHex, ivHex, encHex] = parts;
            const key = _deriveKeyV2(Buffer.from(saltHex, 'hex'));
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
            return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
        } else if (parts.length === 2) {
            const [ivHex, encHex] = parts;
            if (!ivHex || !encHex) throw new Error('malformed ciphertext');
            const key = _deriveKeyV1();
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
            const plaintext = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
            console.warn('[Donations/Crypto] ⚠ Legacy v1 seed format detected. Re-save the seed phrase in Crypto Settings to upgrade to v2 encryption.');
            return plaintext;
        } else {
            throw new Error('malformed ciphertext');
        }
    } catch {
        throw new SeedDecryptionError();
    }
}

function validateMnemonic(mnemonic) {
    return getBip39().validateMnemonic(mnemonic);
}

function generateMnemonic() {
    return getBip39().generateMnemonic(256);
}

function deriveSolanaAddress(mnemonic, index) {
    const bip39 = getBip39();
    const { derivePath, getPublicKey } = getEd25519HdKey();
    const bs58 = getBs58();

    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const path = `m/44'/501'/0'/0'/${index}'`;
    const { key } = derivePath(path, seed.toString('hex'));
    const publicKey = getPublicKey(key, false);

    if (publicKey.length !== 32 || publicKey.every(b => b === 0)) {
        throw new Error(`Invalid Solana public key derived at index ${index}`);
    }

    const address = bs58.encode(publicKey);
    return { address, publicKey: Buffer.from(publicKey) };
}

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

async function getOrCreateUserAddresses(userId, Config) {
    const existing = await db.get(
        'SELECT sol_address, ltc_address, derivation_index FROM user_crypto_addresses WHERE user_id = ?',
        [userId]
    );
    if (existing) return existing;

    const maxRow = await db.get('SELECT MAX(derivation_index) as max_idx FROM user_crypto_addresses');
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

    await db.run(
        `INSERT OR IGNORE INTO user_crypto_addresses (id, user_id, derivation_index, sol_address, ltc_address)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), userId, index, sol_address, ltc_address]
    );

    return db.get(
        'SELECT sol_address, ltc_address, derivation_index FROM user_crypto_addresses WHERE user_id = ?',
        [userId]
    );
}

function deriveIntentAddress(coin, Config) {
    const counterKey = `donations.crypto.intent_address_counter_${coin}`;
    const current = Config.get(counterKey, 10000);
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
