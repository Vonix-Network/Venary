/* =======================================
   Crypto Payment Providers — Dispatcher
   ======================================= */
'use strict';

/** Metadata displayed in the admin UI provider selection cards. */
const PROVIDERS = [
    {
        id:       'manual',
        name:     'Manual HD Wallet',
        fee:      '0%',
        coins:    ['sol', 'ltc'],
        color:    '#ef4444',
        docsUrl:  null,
        sandbox:  false,
        warning:  'Experimental. Self-custody: you control your keys but must manage seed security and blockchain polling. Not recommended for production.',
    },
    {
        id:       'nowpayments',
        name:     'NOWPayments',
        fee:      '0.5%',
        coins:    ['sol', 'ltc'],
        color:    '#29b6f6',
        docsUrl:  'https://nowpayments.io/docs',
        sandbox:  true,
        warning:  null,
    },
    {
        id:       'coinpayments',
        name:     'CoinPayments',
        fee:      '0.5%',
        coins:    ['sol', 'ltc'],
        color:    '#22c55e',
        docsUrl:  'https://www.coinpayments.net/apidoc',
        sandbox:  false,
        warning:  null,
    },
    {
        id:       'plisio',
        name:     'Plisio',
        fee:      '0.5%',
        coins:    ['sol', 'ltc'],
        color:    '#a78bfa',
        docsUrl:  'https://plisio.net/documentation',
        sandbox:  false,
        warning:  null,
    },
    {
        id:       'oxapay',
        name:     'Oxapay',
        fee:      '0.4%',
        coins:    ['sol', 'ltc'],
        color:    '#fb923c',
        docsUrl:  'https://docs.oxapay.com',
        sandbox:  false,
        warning:  null,
    },
];

/** Return the provider module for the currently configured provider. */
function getProvider(Config) {
    const id = Config.get('donations.crypto.provider', 'manual');
    switch (id) {
        case 'nowpayments':  return require('./nowpayments');
        case 'coinpayments': return require('./coinpayments');
        case 'plisio':       return require('./plisio');
        case 'oxapay':       return require('./oxapay');
        default:             return require('./manual');
    }
}

/** Return the provider module by explicit ID (used by test endpoint). */
function getProviderById(id) {
    switch (id) {
        case 'nowpayments':  return require('./nowpayments');
        case 'coinpayments': return require('./coinpayments');
        case 'plisio':       return require('./plisio');
        case 'oxapay':       return require('./oxapay');
        default:             return require('./manual');
    }
}

module.exports = { getProvider, getProviderById, PROVIDERS };
