/* =======================================
   Crypto Donation Support — Custom Errors
   ======================================= */

class ExchangeRateUnavailableError extends Error {
    constructor(message = 'Exchange rate unavailable from all sources') {
        super(message);
        this.name = 'ExchangeRateUnavailableError';
    }
}

class SeedDecryptionError extends Error {
    constructor(message = 'Failed to decrypt wallet seed phrase') {
        super(message);
        this.name = 'SeedDecryptionError';
    }
}

class InsufficientBalanceError extends Error {
    constructor(required, available) {
        super(`Insufficient balance: required ${required}, available ${available}`);
        this.name = 'InsufficientBalanceError';
        this.required = required;
        this.available = available;
    }
}

class InvalidMnemonicError extends Error {
    constructor(message = 'Invalid BIP39 mnemonic phrase') {
        super(message);
        this.name = 'InvalidMnemonicError';
    }
}

class WebhookSignatureError extends Error {
    constructor(message = 'Webhook signature verification failed') {
        super(message);
        this.name = 'WebhookSignatureError';
    }
}

class IntentExpiredError extends Error {
    constructor(intentId) {
        super(`Payment intent ${intentId} has expired`);
        this.name = 'IntentExpiredError';
        this.intentId = intentId;
    }
}

class DuplicateTransactionError extends Error {
    constructor(txHash) {
        super(`Transaction ${txHash} has already been processed`);
        this.name = 'DuplicateTransactionError';
        this.txHash = txHash;
    }
}

module.exports = {
    ExchangeRateUnavailableError,
    SeedDecryptionError,
    InsufficientBalanceError,
    InvalidMnemonicError,
    WebhookSignatureError,
    IntentExpiredError,
    DuplicateTransactionError,
};
