-- Add balance_applied column to crypto_payment_intents for partial balance payments
ALTER TABLE crypto_payment_intents ADD COLUMN balance_applied REAL DEFAULT 0;
