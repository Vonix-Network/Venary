# Crypto Donation Support Requirements Document

## Introduction

This document specifies requirements for adding Solana and Litecoin cryptocurrency payment support to the donations extension. The feature enables users to donate using blockchain-based currencies while maintaining automatic donation tracking, rank assignment, and webhook notifications consistent with the existing Stripe payment system.

The system must support:
- Solana (SOL) and Litecoin (LTC) payment processing
- Automatic blockchain confirmation detection
- Seamless integration with existing donation ranks and user rank management
- Real-time webhook handling for transaction confirmations
- Guest and authenticated user donations
- Parity with Stripe payment flow and user experience

---

## Glossary

- **Blockchain**: Distributed ledger technology used by Solana and Litecoin for transaction recording
- **Confirmation**: Blockchain network validation of a transaction (typically 1+ blocks for Litecoin, 1+ slots for Solana)
- **Wallet Address**: Unique identifier on blockchain where cryptocurrency is received (e.g., Solana public key, Litecoin address)
- **RPC Endpoint**: Remote Procedure Call endpoint for querying blockchain state and transaction status
- **Webhook**: HTTP callback mechanism for receiving real-time blockchain event notifications
- **Stale Transaction**: A transaction that has not received sufficient confirmations within an acceptable timeframe
- **Donation Rank**: Tiered membership level granted based on donation amount (Supporter, Patron, Omega, Legend)
- **Payment Intent**: Unique identifier tracking a single donation transaction from initiation to completion
- **Cryptocurrency**: Digital currency secured by cryptography (Solana or Litecoin in this context)
- **Exchange Rate**: Current market price of cryptocurrency in USD
- **Dust Limit**: Minimum transaction amount accepted by the blockchain network
- **Mempool**: Pending transaction pool awaiting blockchain confirmation
- **Signature**: Cryptographic proof of transaction authorization on blockchain
- **Escrow**: Temporary holding of funds pending confirmation before rank assignment
- **Idempotency**: Property ensuring repeated operations produce same result without side effects
- **BIP39**: Bitcoin Improvement Proposal 39 — standard for generating deterministic wallets from a mnemonic seed phrase
- **HD Wallet**: Hierarchical Deterministic wallet — derives unlimited child addresses from a single master seed
- **Derivation Path**: Structured path (e.g. m/44'/501'/0'/0'/n) used to derive a specific child key from an HD wallet
- **Anytime Address**: A permanent, user-specific blockchain address derived from the HD wallet, used for open-ended donations without a checkout flow
- **Balance**: A user's accumulated USD-denominated credit from custom donations, spendable on ranks
- **Locked Price**: The cryptocurrency amount fixed at payment intent creation time, immune to subsequent exchange rate fluctuations
- **Superadmin**: The highest privilege role, restricted to the server owner, with exclusive access to wallet seed configuration

---

## Requirements

### Requirement 1: Solana Payment Processing

**User Story:** As a user, I want to donate using Solana cryptocurrency, so that I can support the server using my preferred blockchain asset.

#### Acceptance Criteria

1. WHEN a user selects Solana as payment method during checkout, THE Crypto_Processor SHALL generate a unique Solana wallet address for receiving the donation
2. WHEN a Solana wallet address is generated, THE Crypto_Processor SHALL store the address with a unique payment_intent_id and expiration timestamp (240 hours)
3. WHEN a user scans the QR code or copies the wallet address, THE Crypto_Processor SHALL display the exact SOL amount required (converted from USD at current exchange rate)
4. WHEN a Solana transaction is broadcast to the blockchain, THE Blockchain_Monitor SHALL detect the transaction within 30 seconds of mempool entry
5. WHEN a Solana transaction receives 1 or more slot confirmations, THE Blockchain_Monitor SHALL mark the transaction as confirmed
6. WHEN a transaction is confirmed, THE Donation_Processor SHALL create a completed donation record and grant the associated rank
7. WHEN a payment_intent expires without receiving a transaction, THE Crypto_Processor SHALL mark it as expired and allow the user to generate a new address
8. WHEN a user provides an incorrect amount (±5% tolerance), THE Crypto_Processor SHALL accept the transaction if within tolerance, otherwise reject and notify the user

### Requirement 2: Litecoin Payment Processing

**User Story:** As a user, I want to donate using Litecoin cryptocurrency, so that I can support the server using an alternative blockchain asset.

#### Acceptance Criteria

1. WHEN a user selects Litecoin as payment method during checkout, THE Crypto_Processor SHALL generate a unique Litecoin address for receiving the donation
2. WHEN a Litecoin address is generated, THE Crypto_Processor SHALL store the address with a unique payment_intent_id and expiration timestamp (240 hours)
3. WHEN a user scans the QR code or copies the wallet address, THE Crypto_Processor SHALL display the exact LTC amount required (converted from USD at current exchange rate)
4. WHEN a Litecoin transaction is broadcast to the blockchain, THE Blockchain_Monitor SHALL detect the transaction within 60 seconds of mempool entry
5. WHEN a Litecoin transaction receives 3 or more block confirmations, THE Blockchain_Monitor SHALL mark the transaction as confirmed
6. WHEN a transaction is confirmed, THE Donation_Processor SHALL create a completed donation record and grant the associated rank
7. WHEN a payment_intent expires without receiving a transaction, THE Crypto_Processor SHALL mark it as expired and allow the user to generate a new address
8. WHEN a user provides an incorrect amount (±5% tolerance), THE Crypto_Processor SHALL accept the transaction if within tolerance, otherwise reject and notify the user

### Requirement 3: Exchange Rate Management

**User Story:** As an administrator, I want accurate real-time exchange rates, so that users are charged the correct cryptocurrency amount for their donation.

#### Acceptance Criteria

1. THE Exchange_Rate_Manager SHALL fetch current SOL/USD and LTC/USD rates from at least two independent price sources
2. WHEN exchange rates are fetched, THE Exchange_Rate_Manager SHALL cache rates for 60 seconds to minimize API calls
3. WHEN a user initiates checkout, THE Crypto_Processor SHALL calculate cryptocurrency amount using the most recent cached rate
4. WHEN exchange rate sources disagree by more than 2%, THE Exchange_Rate_Manager SHALL log a warning and use the median rate
5. WHEN an exchange rate source becomes unavailable, THE Exchange_Rate_Manager SHALL fall back to the next available source
6. WHEN all exchange rate sources are unavailable, THE Crypto_Processor SHALL reject new checkouts and display an error message
7. WHEN a rate is calculated for a payment_intent, THE Crypto_Processor SHALL store the rate used for audit purposes
8. WHEN a payment intent is created, THE Crypto_Processor SHALL lock and store the exact cryptocurrency amount required at that moment, regardless of subsequent price changes — the locked amount SHALL be used for the lifetime of the payment intent

### Requirement 4: Blockchain Monitoring and Confirmation Detection

**User Story:** As a system, I want to automatically detect and confirm blockchain transactions, so that donations are processed without manual intervention.

#### Acceptance Criteria

1. THE Blockchain_Monitor SHALL poll the Solana RPC endpoint every 5 seconds for pending transactions
2. THE Blockchain_Monitor SHALL poll the Litecoin RPC endpoint every 10 seconds for pending transactions
3. WHEN a transaction is detected for a known payment_intent, THE Blockchain_Monitor SHALL record the transaction signature/hash and initial detection timestamp
4. WHEN a Solana transaction reaches 1 confirmation, THE Blockchain_Monitor SHALL mark it as confirmed and trigger donation completion
5. WHEN a Litecoin transaction reaches 3 confirmations, THE Blockchain_Monitor SHALL mark it as confirmed and trigger donation completion
6. WHEN a transaction is not detected within the payment_intent expiration window, THE Blockchain_Monitor SHALL mark the payment_intent as expired
7. WHEN a transaction is detected but amount is outside tolerance, THE Blockchain_Monitor SHALL log the discrepancy and notify administrators
8. WHEN RPC endpoint becomes unavailable, THE Blockchain_Monitor SHALL retry with exponential backoff (max 5 retries) before alerting administrators

### Requirement 5: Webhook Integration for Real-Time Confirmations

**User Story:** As a system, I want to receive real-time blockchain event notifications, so that donations are confirmed immediately without polling delays.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL accept POST requests from blockchain monitoring services (e.g., Helius for Solana, BlockCypher for Litecoin)
2. WHEN a webhook is received, THE Webhook_Handler SHALL verify the webhook signature using the service's secret key
3. WHEN a webhook signature is invalid, THE Webhook_Handler SHALL reject the request and log the attempt
4. WHEN a valid webhook indicates transaction confirmation, THE Webhook_Handler SHALL trigger donation completion immediately
5. WHEN a webhook is received for an unknown payment_intent, THE Webhook_Handler SHALL log the event and ignore it
6. WHEN a webhook delivery fails, THE Webhook_Handler SHALL implement exponential backoff retry (max 5 attempts over 24 hours)
7. WHEN a webhook is received, THE Webhook_Handler SHALL respond with HTTP 200 within 5 seconds to acknowledge receipt
8. THE Webhook_Handler SHALL maintain an idempotency key to prevent duplicate processing of the same webhook event

### Requirement 6: Automatic Donation Tracking and Database Schema

**User Story:** As an administrator, I want to track all cryptocurrency donations in the database, so that I can audit transactions and manage user ranks.

#### Acceptance Criteria

1. THE Database_Schema SHALL extend the donations table to include cryptocurrency-specific fields: blockchain_type, wallet_address, transaction_hash, confirmations, exchange_rate_used
2. WHEN a cryptocurrency donation is created, THE Donation_Processor SHALL store all transaction metadata in the donations table
3. WHEN a transaction is confirmed, THE Donation_Processor SHALL update the donation record with transaction_hash, confirmations, and status='completed'
4. WHEN a donation is completed, THE Donation_Processor SHALL create a user_rank record if the user doesn't have an active rank
5. WHEN a donation is completed, THE Donation_Processor SHALL update the user_rank expiration date if the user already has an active rank
6. WHEN a donation is completed, THE Donation_Processor SHALL create a rank_conversion record if the user is upgrading to a higher tier
7. THE Database_Schema SHALL include indices on blockchain_type, transaction_hash, and wallet_address for efficient querying
8. WHEN querying donations, THE Donation_Processor SHALL support filtering by blockchain_type, status, and confirmation_status

### Requirement 7: User Experience - Checkout Flow

**User Story:** As a user, I want a seamless checkout experience for cryptocurrency donations, so that I can complete my donation quickly.

#### Acceptance Criteria

1. WHEN a user selects a donation rank, THE Checkout_UI SHALL display payment method options including Stripe, Solana, and Litecoin
2. WHEN a user selects Solana or Litecoin, THE Checkout_UI SHALL display a QR code containing the wallet address and amount
3. WHEN a user scans the QR code with a mobile wallet, THE Checkout_UI SHALL display the exact amount in both USD and cryptocurrency
4. WHEN a user completes the blockchain transaction, THE Checkout_UI SHALL display a "Waiting for confirmation" message with estimated confirmation time
5. WHEN a transaction is confirmed, THE Checkout_UI SHALL display a success message and redirect to the donation receipt page
6. WHEN a payment_intent expires, THE Checkout_UI SHALL display an expiration message and offer to generate a new address
7. WHEN a user is a guest (not logged in), THE Checkout_UI SHALL require a Minecraft username for rank assignment
8. WHEN a user is authenticated, THE Checkout_UI SHALL pre-populate their Minecraft username if available from linked accounts

### Requirement 8: User Experience - Donation Receipt and History

**User Story:** As a user, I want to view my cryptocurrency donation receipt and history, so that I can verify my transactions and track my rank status.

#### Acceptance Criteria

1. WHEN a cryptocurrency donation is completed, THE Receipt_Generator SHALL create a receipt showing donation amount, rank granted, and transaction hash
2. WHEN a user views their donation history, THE History_View SHALL display all cryptocurrency donations with blockchain type, amount, status, and confirmation count
3. WHEN a user views a cryptocurrency donation detail, THE Detail_View SHALL display the transaction hash as a clickable link to the blockchain explorer
4. WHEN a user views their active rank, THE Rank_Display SHALL show the rank name, expiration date, and payment method used
5. WHEN a user converts to a different rank, THE Conversion_Record SHALL show the previous rank, new rank, and prorated value calculation
6. WHEN a cryptocurrency donation is pending confirmation, THE History_View SHALL display the confirmation progress (e.g., "1/3 confirmations")
7. WHEN a cryptocurrency donation fails or expires, THE History_View SHALL display the reason and offer to retry

### Requirement 9: Admin Dashboard and Monitoring

**User Story:** As an administrator, I want to monitor cryptocurrency donations and manage payment settings, so that I can ensure system health and troubleshoot issues.

#### Acceptance Criteria

1. THE Admin_Dashboard SHALL display statistics for cryptocurrency donations: total revenue by blockchain, transaction count, average confirmation time
2. WHEN an administrator views the donations list, THE Admin_Dashboard SHALL allow filtering by blockchain_type, status, and date range
3. WHEN an administrator views a cryptocurrency donation, THE Admin_Dashboard SHALL display full transaction details including wallet address, transaction hash, and confirmations
4. WHEN an administrator views settings, THE Admin_Dashboard SHALL display configuration options for Solana RPC endpoint, Litecoin RPC endpoint, and webhook secrets
5. WHEN an administrator updates RPC endpoints, THE Admin_Dashboard SHALL validate connectivity before saving
6. WHEN an administrator updates webhook secrets, THE Admin_Dashboard SHALL test webhook signature verification before saving
7. WHEN a blockchain monitoring error occurs, THE Admin_Dashboard SHALL display an alert with error details and recovery options
8. WHEN an administrator manually confirms a stale transaction, THE Admin_Dashboard SHALL update the donation status and grant the rank

### Requirement 10: Security and Validation

**User Story:** As a system, I want to validate all cryptocurrency transactions and prevent fraud, so that donations are legitimate and secure.

#### Acceptance Criteria

1. WHEN a wallet address is generated, THE Crypto_Processor SHALL validate the address format for the target blockchain (Solana base58, Litecoin base58check)
2. WHEN a transaction is detected, THE Blockchain_Monitor SHALL verify the transaction signature using the blockchain's cryptographic verification
3. WHEN a transaction amount is received, THE Donation_Processor SHALL verify the amount matches the payment_intent within the 5% tolerance
4. WHEN a transaction is received at the wallet address, THE Donation_Processor SHALL verify the wallet address matches the payment_intent
5. WHEN a webhook is received, THE Webhook_Handler SHALL verify the webhook signature using HMAC-SHA256 with the service's secret key
6. WHEN a payment_intent is created, THE Crypto_Processor SHALL store it with a cryptographically secure random ID
7. WHEN a transaction is confirmed, THE Donation_Processor SHALL prevent duplicate rank assignment by checking for existing completed donations with the same transaction_hash
8. WHEN a user attempts to claim a donation, THE Donation_Processor SHALL verify the user owns the wallet address (if applicable)

### Requirement 11: Error Handling and Recovery

**User Story:** As a system, I want to handle errors gracefully and recover from failures, so that donations are not lost and users are informed of issues.

#### Acceptance Criteria

1. WHEN a blockchain RPC call fails, THE Blockchain_Monitor SHALL retry with exponential backoff (1s, 2s, 4s, 8s, 16s) before alerting administrators
2. WHEN an exchange rate fetch fails, THE Exchange_Rate_Manager SHALL use the last known rate and log a warning
3. WHEN a webhook delivery fails, THE Webhook_Handler SHALL queue the event for retry with exponential backoff over 24 hours
4. WHEN a transaction is detected but the payment_intent is not found, THE Blockchain_Monitor SHALL log the orphaned transaction and alert administrators
5. WHEN a donation record cannot be created due to database error, THE Donation_Processor SHALL log the error and retry up to 3 times before alerting administrators
6. WHEN a rank assignment fails, THE Donation_Processor SHALL mark the donation as 'completed_pending_rank' and retry rank assignment hourly
7. WHEN a user's rank assignment fails, THE Admin_Dashboard SHALL display the failed donation and provide a manual grant option
8. WHEN a critical error occurs, THE Error_Handler SHALL send an alert to administrators with error details and recovery steps

### Requirement 12: Compliance and Regulatory Considerations

**User Story:** As an organization, I want to comply with cryptocurrency regulations and maintain audit trails, so that we operate legally and transparently.

#### Acceptance Criteria

1. THE Audit_Logger SHALL record all cryptocurrency transactions with timestamp, user_id, amount, blockchain_type, and transaction_hash
2. WHEN a cryptocurrency donation is received, THE Audit_Logger SHALL log the transaction for compliance reporting
3. WHEN an administrator manually confirms a transaction, THE Audit_Logger SHALL record the admin action with timestamp and reason
4. THE System SHALL support exporting donation records in CSV format for tax and compliance reporting
5. WHEN a donation is exported, THE Export_Generator SHALL include all required fields: date, user, amount, blockchain_type, transaction_hash, rank_granted
6. THE System SHALL maintain a transaction log for at least 7 years for regulatory compliance
7. WHEN a user requests their donation history, THE Data_Export SHALL include all cryptocurrency transactions in a user-friendly format
8. THE System SHALL display a disclaimer that cryptocurrency donations may have tax implications and users should consult a tax professional

### Requirement 13: Integration with Existing Donation System

**User Story:** As a system, I want cryptocurrency donations to integrate seamlessly with existing Stripe donations, so that users have a unified donation experience.

#### Acceptance Criteria

1. WHEN a user views available payment methods, THE Checkout_UI SHALL display Stripe, Solana, and Litecoin as equal options
2. WHEN a user completes a donation via any payment method, THE Donation_Processor SHALL apply the same rank assignment logic
3. WHEN a user has an active rank from Stripe, THE Rank_Manager SHALL allow rank conversion using cryptocurrency donations
4. WHEN a user converts from a Stripe rank to a cryptocurrency rank, THE Conversion_Processor SHALL calculate prorated value using the same formula
5. WHEN a user views their rank history, THE History_View SHALL display all rank changes regardless of payment method
6. WHEN an administrator views donation statistics, THE Admin_Dashboard SHALL aggregate statistics across all payment methods
7. WHEN a user receives a receipt email, THE Email_Generator SHALL include payment method information (Stripe, Solana, or Litecoin)
8. WHEN a Discord webhook is sent, THE Discord_Notifier SHALL include payment method information in the notification

### Requirement 14: Performance and Scalability

**User Story:** As a system, I want to handle multiple concurrent cryptocurrency donations efficiently, so that the system remains responsive under load.

#### Acceptance Criteria

1. WHEN a blockchain monitoring cycle completes, THE Blockchain_Monitor SHALL process all pending transactions within 10 seconds
2. WHEN multiple webhooks are received simultaneously, THE Webhook_Handler SHALL process each webhook within 2 seconds
3. WHEN exchange rates are fetched, THE Exchange_Rate_Manager SHALL complete the operation within 3 seconds
4. WHEN a user initiates checkout, THE Checkout_Processor SHALL generate a wallet address and QR code within 1 second
5. WHEN a donation is completed, THE Donation_Processor SHALL update all related records (donation, user_rank, rank_conversion) within 2 seconds
6. THE System SHALL support at least 100 concurrent pending payment_intents without performance degradation
7. THE System SHALL cache exchange rates to minimize API calls and reduce latency
8. THE System SHALL use database indices to ensure donation queries complete within 500ms

### Requirement 15: Configuration and Deployment

**User Story:** As an administrator, I want to configure cryptocurrency payment settings, so that I can customize the system for my deployment.

#### Acceptance Criteria

1. THE Configuration_Manager SHALL support environment variables for Solana RPC endpoint, Litecoin RPC endpoint, and webhook secrets
2. WHEN the system starts, THE Configuration_Manager SHALL validate all required configuration values are present
3. WHEN a configuration value is missing, THE Configuration_Manager SHALL log an error and disable cryptocurrency payments
4. WHEN an administrator updates configuration, THE Configuration_Manager SHALL validate the new values before applying
5. THE Configuration_Manager SHALL support multiple RPC endpoints for failover (primary and secondary)
6. WHEN a primary RPC endpoint fails, THE Blockchain_Monitor SHALL automatically switch to the secondary endpoint
7. THE Configuration_Manager SHALL support enabling/disabling individual blockchains (Solana and Litecoin independently)
8. WHEN a blockchain is disabled, THE Checkout_UI SHALL not display that payment method as an option

### Requirement 16: Testing and Validation

**User Story:** As a developer, I want comprehensive test coverage for cryptocurrency payment processing, so that the system is reliable and bug-free.

#### Acceptance Criteria

1. THE Test_Suite SHALL include unit tests for exchange rate calculation with various market conditions
2. THE Test_Suite SHALL include integration tests for the complete donation flow (checkout → confirmation → rank assignment)
3. THE Test_Suite SHALL include tests for blockchain monitoring with simulated transactions and confirmations
4. THE Test_Suite SHALL include tests for webhook handling with valid and invalid signatures
5. THE Test_Suite SHALL include tests for error scenarios (RPC failures, stale transactions, expired payment_intents)
6. THE Test_Suite SHALL include tests for idempotency (duplicate webhook events, duplicate transactions)
7. THE Test_Suite SHALL include tests for security (invalid addresses, incorrect amounts, signature verification)
8. THE Test_Suite SHALL achieve at least 85% code coverage for cryptocurrency-related modules

### Requirement 17: Documentation and Support

**User Story:** As a user or administrator, I want clear documentation and support resources, so that I can use and troubleshoot the cryptocurrency donation system.

#### Acceptance Criteria

1. THE Documentation SHALL include a user guide for donating with Solana and Litecoin
2. THE Documentation SHALL include step-by-step instructions for setting up cryptocurrency payment processing
3. THE Documentation SHALL include troubleshooting guides for common issues (expired payment_intents, stale transactions, RPC failures)
4. THE Documentation SHALL include API documentation for cryptocurrency payment endpoints
5. THE Documentation SHALL include configuration examples for different deployment scenarios
6. THE Documentation SHALL include security best practices for managing wallet addresses and RPC endpoints
7. THE Documentation SHALL include FAQ addressing common questions about cryptocurrency donations
8. THE Documentation SHALL include links to blockchain explorers for transaction verification

### Requirement 18: Parser and Serializer Requirements

**User Story:** As a system, I want to parse and serialize cryptocurrency transaction data, so that transactions can be stored, retrieved, and displayed correctly.

#### Acceptance Criteria

1. WHEN a blockchain transaction is received, THE Transaction_Parser SHALL parse the transaction data into a standardized Transaction object
2. WHEN a Transaction object is serialized, THE Transaction_Serializer SHALL format it into JSON for storage and API responses
3. WHEN a transaction is retrieved from storage, THE Transaction_Parser SHALL parse the JSON back into a Transaction object
4. FOR ALL valid Transaction objects, parsing then serializing then parsing SHALL produce an equivalent object (round-trip property)
5. WHEN a transaction contains optional fields, THE Transaction_Parser SHALL handle missing fields gracefully with default values
6. WHEN a transaction contains invalid data, THE Transaction_Parser SHALL return a descriptive error message
7. THE Transaction_Serializer SHALL include all required fields: blockchain_type, transaction_hash, amount, confirmations, timestamp
8. WHEN a transaction is displayed to a user, THE Transaction_Formatter SHALL format amounts with appropriate decimal places and currency symbols

### Requirement 19: HD Wallet Setup and Management (Superadmin Only)

**User Story:** As a superadmin, I want to configure the server's HD wallet using a 12 or 24-word BIP39 seed phrase, so that the system can derive unique addresses for each user and payment intent.

#### Acceptance Criteria

1. THE Wallet_Manager SHALL support importing a 12 or 24-word BIP39 mnemonic seed phrase for both Solana and Litecoin
2. WHEN a superadmin enters a seed phrase, THE Wallet_Manager SHALL validate it against the BIP39 wordlist before saving
3. WHEN a seed phrase is saved, THE Wallet_Manager SHALL encrypt it using AES-256 with a server-side secret before storing it in config.json
4. THE seed phrase and derived private keys SHALL never be transmitted to the client or logged in plaintext
5. WHEN a superadmin views the wallet settings page, THE Admin_UI SHALL display only the first and last word of the seed phrase as a masked confirmation, never the full phrase
6. THE Wallet_Manager SHALL support generating a new random BIP39 seed phrase from within the admin UI if the superadmin does not have one
7. WHEN a seed phrase is updated, THE Wallet_Manager SHALL re-derive all existing user addresses from the new seed and update stored address mappings
8. THE wallet configuration (encrypted seed, derivation paths) SHALL be stored exclusively in config.json and SHALL NOT be stored in the database
9. ONLY users with the superadmin role SHALL be able to view or modify wallet settings — all other admin roles SHALL receive a 403 response
10. THE Wallet_Manager SHALL support separate seed phrases for Solana and Litecoin, or a single shared BIP39 seed with chain-specific derivation paths (e.g. m/44'/501'/0'/0'/userId for Solana, m/44'/2'/0'/0/userId for Litecoin)

### Requirement 20: Donations Extension Admin Management Page

**User Story:** As an administrator, I want a dedicated management section in the Donations extension admin page for all crypto and balance settings, so that I can configure and monitor everything from one place.

#### Acceptance Criteria

1. THE Donations_Admin_Page SHALL include a "Crypto Settings" tab with sub-sections for: Solana wallet, Litecoin wallet, RPC endpoints, webhook secrets, and blockchain enable/disable toggles
2. THE Donations_Admin_Page SHALL include a "Balance Settings" tab for configuring balance display currency, minimum balance thresholds, and balance expiry rules
3. WHEN a superadmin accesses the Crypto Settings tab, THE Admin_UI SHALL display wallet setup status (configured / not configured) for each blockchain
4. WHEN a non-superadmin accesses wallet setup fields, THE Admin_UI SHALL hide those fields entirely and display a "Superadmin only" notice
5. THE Donations_Admin_Page SHALL include a "User Balances" tab where admins can view, search, and manually adjust user balances with an audit reason
6. WHEN an admin manually adjusts a balance, THE Audit_Logger SHALL record the admin user, amount changed, reason, and timestamp
7. THE Donations_Admin_Page SHALL display live blockchain connectivity status (connected / degraded / offline) for each enabled chain
8. THE Donations_Admin_Page SHALL display a summary of pending payment intents, confirmed donations, and failed/expired intents per blockchain

### Requirement 21: Per-User "Anytime" Crypto Address

**User Story:** As a user, I want a permanent, unique crypto address tied to my account, so that I can donate at any time without initiating a checkout flow.

#### Acceptance Criteria

1. WHEN a user account is created or first visits the donations page, THE Address_Deriver SHALL derive a unique Solana address and a unique Litecoin address for that user using the HD wallet and the user's account index
2. THE derived addresses SHALL be deterministic — the same user SHALL always produce the same address from the same seed
3. WHEN a user views their profile or donations page, THE UI SHALL display their personal Solana and Litecoin "Anytime" addresses with QR codes
4. THE Blockchain_Monitor SHALL poll each user's Anytime addresses every 3 minutes to detect new incoming transactions
5. WHEN a new transaction is detected on a user's Anytime address, THE Donation_Processor SHALL convert the received cryptocurrency amount to USD at the current exchange rate and credit that USD value to the user's balance
6. WHEN an Anytime address transaction is processed, THE Donation_Processor SHALL record it in the donations table with source='anytime_address' and the transaction hash for deduplication
7. WHEN the same transaction hash is detected again on a subsequent poll, THE Donation_Processor SHALL skip it (idempotent processing)
8. WHEN a user's Anytime address receives a transaction, THE Discord_Notifier and email system SHALL notify the user and administrators as configured

### Requirement 22: User Balance System

**User Story:** As a user, I want a donation balance that accumulates from custom donations and can be spent on ranks, so that I have flexibility in how I use my contributions.

#### Acceptance Criteria

1. EVERY user account SHALL have a balance stored internally in USD with 8 decimal places of precision
2. WHEN a user completes a custom donation (no rank selected) via Stripe, THE Balance_Manager SHALL credit the donated USD amount to the user's balance
3. WHEN a user completes a custom donation via Solana or Litecoin, THE Balance_Manager SHALL convert the received crypto amount to USD at the time of confirmation and credit that value to the user's balance
4. WHEN a user's Anytime address receives a donation, THE Balance_Manager SHALL credit the converted USD value to the user's balance
5. WHEN a user selects a rank to purchase, THE Checkout_UI SHALL display a "Pay with Balance" option if the user's balance is sufficient to cover the rank price
6. WHEN a user pays for a rank using balance, THE Balance_Manager SHALL deduct the rank price in USD from the user's balance and grant the rank immediately
7. WHEN a user's balance is insufficient to cover a rank, THE Checkout_UI SHALL display the shortfall and offer to top up via Stripe or crypto
8. THE Balance_Manager SHALL maintain a full transaction ledger for each user showing all credits (donations) and debits (rank purchases) with timestamps
9. WHEN a user views their balance, THE UI SHALL display the balance in their preferred display currency (user-selectable: USD, SOL, LTC, or other supported currencies)
10. THE system SHALL store all balance values internally in USD and convert to the user's preferred display currency using current exchange rates at display time
11. WHEN a user changes their preferred display currency, THE UI SHALL immediately re-render all balance values in the new currency without requiring a page reload
12. THE Balance_Manager SHALL support admin-initiated balance adjustments (credit or debit) with a mandatory reason field for audit purposes

### Requirement 23: Balance Display Currency Preference

**User Story:** As a user, I want to choose what currency my balance is displayed in, so that I can view it in the denomination most meaningful to me.

#### Acceptance Criteria

1. THE User_Preferences SHALL include a balance_display_currency field supporting: USD, SOL, LTC, EUR, GBP, and any other currencies configured by the admin
2. WHEN a user selects a display currency, THE Balance_Display SHALL convert the stored USD balance to the selected currency using the current exchange rate
3. WHEN exchange rates are unavailable, THE Balance_Display SHALL fall back to displaying the balance in USD with a notice
4. THE user's currency preference SHALL be persisted in their user profile and restored on next login
5. WHEN displaying a balance in a non-USD currency, THE Balance_Display SHALL show a tooltip or label indicating the approximate USD equivalent
6. THE admin SHALL be able to restrict which display currencies are available to users from the Balance Settings tab

---

## Acceptance Criteria Testing Strategy

### Property-Based Testing Approach

The following acceptance criteria will be validated using property-based testing:

**Exchange Rate Calculation (Requirement 3)**
- Property: For any valid USD amount and exchange rate, the calculated cryptocurrency amount should be reversible (amount_usd = crypto_amount * rate)
- Property: Exchange rate calculations should be consistent across multiple calls with the same inputs
- Property: Median rate selection should always fall within the range of input rates

**Transaction Amount Validation (Requirement 10)**
- Property: For any transaction within ±5% tolerance, the system should accept it
- Property: For any transaction outside ±5% tolerance, the system should reject it
- Property: Amount validation should be idempotent (validating the same transaction multiple times produces the same result)

**Blockchain Confirmation Detection (Requirement 4)**
- Property: Once a transaction reaches the required confirmation threshold, it should remain confirmed
- Property: Confirmation count should never decrease
- Property: Transactions should transition from pending → confirmed → completed in order

**Webhook Idempotency (Requirement 5)**
- Property: Processing the same webhook event multiple times should produce the same result as processing it once
- Property: Duplicate webhook events should not create duplicate donations
- Property: Webhook processing should be commutative (order of webhook processing should not affect final state)

**Round-Trip Serialization (Requirement 18)**
- Property: For all valid Transaction objects, parse(serialize(obj)) == obj
- Property: Serialized transactions should be valid JSON
- Property: Deserialized transactions should contain all required fields

