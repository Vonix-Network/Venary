/* =======================================
   Venary — Centralized Logger
   Outputs to console + rotating log files:
     logs/combined.log  — all levels
     logs/error.log     — errors only
     logs/security.log  — auth & admin events
   ======================================= */
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const isDev = process.env.NODE_ENV !== 'production';

// ── Formatters ──────────────────────────────────────────────────────────────
const timestampFmt = winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' });

const consoleFmt = winston.format.combine(
    timestampFmt,
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
        return `[${timestamp}] ${level}: ${message}${extra}`;
    })
);

const fileFmt = winston.format.combine(
    timestampFmt,
    winston.format.errors({ stack: true }),
    winston.format.json()
);

// ── Transports ───────────────────────────────────────────────────────────────
const transports = [
    // Console — colorized in dev, plain JSON in prod
    new winston.transports.Console({
        level: isDev ? 'debug' : 'info',
        format: isDev ? consoleFmt : fileFmt,
        silent: process.env.LOG_SILENT === 'true'
    }),

    // Combined log — all levels (daily rotation, keep 14 days)
    new DailyRotateFile({
        level: 'debug',
        filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '14d',
        maxSize: '20m',
        format: fileFmt,
        zippedArchive: true
    }),

    // Error log — errors only (daily rotation, keep 30 days)
    new DailyRotateFile({
        level: 'error',
        filename: path.join(LOG_DIR, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxFiles: '30d',
        maxSize: '10m',
        format: fileFmt,
        zippedArchive: true
    })
];

// ── Main logger ──────────────────────────────────────────────────────────────
const logger = winston.createLogger({
    level: isDev ? 'debug' : 'info',
    transports,
    exitOnError: false
});

// ── Security / audit logger ──────────────────────────────────────────────────
// Writes to a dedicated security.log file — never silenced, always retained 90d
const securityLogger = winston.createLogger({
    level: 'info',
    transports: [
        new DailyRotateFile({
            filename: path.join(LOG_DIR, 'security-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles: '90d',
            maxSize: '20m',
            format: fileFmt,
            zippedArchive: true
        }),
        // Mirror security events to console as well
        new winston.transports.Console({
            format: consoleFmt,
            silent: process.env.LOG_SILENT === 'true'
        })
    ],
    exitOnError: false
});

/**
 * Log a security-relevant event (auth, admin action, rate limit, etc.)
 * @param {string} event  — machine-readable event name, e.g. 'login_failed'
 * @param {object} meta   — extra context: ip, userId, username, detail, etc.
 */
function security(event, meta = {}) {
    securityLogger.info(event, { event, ...meta });
}

module.exports = logger;
module.exports.security = security;
module.exports.securityLogger = securityLogger;
