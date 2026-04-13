/**
 * Venary — Security Middleware Bundle
 *
 * Centralises all non-Helmet, non-CORS security concerns:
 *   • HPP      — prevents HTTP Parameter Pollution (array injection in query strings)
 *   • slowDown — progressive delay on auth endpoints (brute-force friction before hard block)
 *
 * Usage in server/index.js:
 *   const { hppProtection, authSlowDown, resetSlowDown } = require('./middleware/security');
 *   app.use(hppProtection);
 *   app.use('/api/auth/login', authSlowDown);
 *   app.use('/api/auth/register', authSlowDown);
 *   app.use('/api/auth/forgot-password', resetSlowDown);
 *   app.use('/api/auth/reset-password', resetSlowDown);
 */
'use strict';

const hpp         = require('hpp');
const { slowDown } = require('express-slow-down');

// ── HTTP Parameter Pollution ─────────────────────────────────────────────────
//
// When the same query/body param appears multiple times, Express creates an
// array.  Unguarded code that passes req.query.id directly to a DB call then
// gets an array instead of a string — a common injection vector.
// HPP collapses duplicates to the last value and exposes the original array
// as req.queryPolluted / req.bodyPolluted for logging if needed.
//
// Whitelist params that legitimately accept arrays in this platform.
const hppProtection = hpp({
    whitelist: ['tags', 'ids', 'roles', 'games'],
});

// ── Progressive slow-down for auth ──────────────────────────────────────────
//
// Works in tandem with express-rate-limit:
//   - slow-down starts adding delay after N attempts (friction)
//   - rate-limit hard-blocks after M attempts (enforcement)
//
// The v3 API: delayMs is a function(used, req) → ms.
// Delay is cumulative: attempt 6 = +500ms, 7 = +1000ms, 8 = +1500ms …

/** Auth endpoints: login, register — delays after 5 hits in 15m window. */
const authSlowDown = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 5,
    delayMs: (used, req) => {
        const delayAfter = req.slowDown.limit;
        return (used - delayAfter) * 500; // +500ms per request above threshold
    },
    maxDelayMs: 5000,
    legacyHeaders: false,
    standardHeaders: true,
    validate: { delayMs: false }, // suppress v2→v3 migration warning
});

/** Password reset — tighter: delays after 3 hits, up to 10s max. */
const resetSlowDown = slowDown({
    windowMs: 15 * 60 * 1000,
    delayAfter: 3,
    delayMs: (used, req) => {
        const delayAfter = req.slowDown.limit;
        return (used - delayAfter) * 1000; // +1000ms per request above threshold
    },
    maxDelayMs: 10000,
    legacyHeaders: false,
    standardHeaders: true,
    validate: { delayMs: false },
});

/** Upload rate slow-down to prevent upload flood. */
const uploadSlowDown = slowDown({
    windowMs: 60 * 1000,
    delayAfter: 10,
    delayMs: (used, req) => {
        const delayAfter = req.slowDown.limit;
        return (used - delayAfter) * 200;
    },
    maxDelayMs: 3000,
    legacyHeaders: false,
    standardHeaders: false,
    validate: { delayMs: false },
});

module.exports = { hppProtection, authSlowDown, resetSlowDown, uploadSlowDown };
