/**
 * Venary — Input Validation Middleware
 * Uses express-validator (v7) for declarative, chain-based validation.
 * Each export is an array of validator chains + the final `validate` check
 * that returns 422 with the first error message on failure.
 */
'use strict';

const { body, param, query, validationResult } = require('express-validator');

// ── Core checker ─────────────────────────────────────────────────────────────

/**
 * Reads the validation result and short-circuits with a 422 on error.
 * Always the last element in every validator array.
 */
function validate(req, res, next) {
    const result = validationResult(req);
    if (!result.isEmpty()) {
        return res.status(422).json({ error: result.array()[0].msg });
    }
    next();
}

// ── Reusable field definitions ────────────────────────────────────────────────

const fields = {
    username: body('username')
        .trim()
        .notEmpty().withMessage('Username is required')
        .isLength({ min: 3, max: 32 }).withMessage('Username must be 3–32 characters')
        .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Username may only contain letters, numbers, underscores, and hyphens'),

    email: body('email')
        .trim()
        .isEmail().withMessage('Invalid email address')
        .isLength({ max: 254 }).withMessage('Email too long')
        .normalizeEmail({ gmail_remove_dots: false }),

    password: (field = 'password') => body(field)
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 8, max: 200 }).withMessage('Password must be at least 8 characters')
        .matches(/[a-zA-Z]/).withMessage('Password must contain at least one letter')
        .matches(/[0-9]/).withMessage('Password must contain at least one number'),

    hexToken: (field = 'token') => body(field)
        .trim()
        .notEmpty().withMessage('Token is required')
        .isHexadecimal().withMessage('Invalid token format')
        .isLength({ min: 64, max: 64 }).withMessage('Invalid token length'),

    uuidParam: (field = 'id') => param(field)
        .trim()
        .isUUID(4).withMessage(`Invalid ${field}`),

    uuidBody: (field) => body(field)
        .trim()
        .isUUID(4).withMessage(`Invalid ${field}`),
};

// ── Auth ─────────────────────────────────────────────────────────────────────

const login = [
    body('username').trim().notEmpty().withMessage('Username is required').isLength({ max: 100 }),
    body('password').notEmpty().withMessage('Password is required').isLength({ max: 200 }),
    validate,
];

const register = [
    fields.username,
    fields.email,
    fields.password(),
    body('display_name').optional().trim().isLength({ max: 50 }).withMessage('Display name too long').escape(),
    validate,
];

const forgotPassword = [
    fields.email,
    validate,
];

const resetPassword = [
    body('id').trim().notEmpty().withMessage('id is required'),
    fields.hexToken('token'),
    fields.password('newPassword'),
    validate,
];

// ── Posts ─────────────────────────────────────────────────────────────────────

const createPost = [
    body('content').trim().notEmpty().withMessage('Post content is required').isLength({ max: 5000 }).withMessage('Post too long (max 5000 chars)'),
    body('visibility').optional().isIn(['public', 'friends', 'private']).withMessage('Invalid visibility'),
    validate,
];

const createComment = [
    body('content').trim().notEmpty().withMessage('Comment is required').isLength({ max: 2000 }).withMessage('Comment too long (max 2000 chars)'),
    validate,
];

// ── Messages ──────────────────────────────────────────────────────────────────

const sendMessage = [
    body('content').trim().notEmpty().withMessage('Message is required').isLength({ max: 2000 }).withMessage('Message too long (max 2000 chars)'),
    fields.uuidBody('receiver_id'),
    validate,
];

// ── Friends ───────────────────────────────────────────────────────────────────

const friendAction = [
    fields.uuidBody('userId').optional(),
    fields.uuidParam('id').optional(),
    validate,
];

// ── Profile ───────────────────────────────────────────────────────────────────

const updateProfile = [
    body('display_name').optional().trim().isLength({ max: 50 }).withMessage('Display name too long'),
    body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio too long (max 500 chars)'),
    validate,
];

// ── Admin ─────────────────────────────────────────────────────────────────────

const adminUserLookup = [
    fields.uuidParam('id'),
    validate,
];

const adminBan = [
    fields.uuidParam('id'),
    body('reason').optional().trim().isLength({ max: 500 }).withMessage('Reason too long'),
    body('until').optional().isISO8601().withMessage('Invalid date format for banned_until'),
    validate,
];

// ── Donations ────────────────────────────────────────────────────────────────

const purchaseRank = [
    body('rankId').notEmpty().withMessage('rankId is required'),
    body('method').isIn(['balance', 'crypto', 'stripe']).withMessage('Invalid payment method'),
    validate,
];

// ── Minecraft ─────────────────────────────────────────────────────────────────

const addMcServer = [
    body('name').trim().notEmpty().withMessage('Server name is required').isLength({ max: 100 }),
    body('address').trim().notEmpty().withMessage('Server address is required').isLength({ max: 253 }),
    body('port').isInt({ min: 1, max: 65535 }).withMessage('Port must be 1–65535'),
    validate,
];

// ── Pterodactyl ───────────────────────────────────────────────────────────────

const pteroSettings = [
    body('base_url').trim().notEmpty().withMessage('base_url is required').isURL({ require_protocol: true }).withMessage('base_url must be a valid URL'),
    body('api_key').optional().trim().isLength({ min: 1, max: 300 }),
    validate,
];

const pteroCommand = [
    body('command').trim().notEmpty().withMessage('command is required').isLength({ max: 2000 }),
    body('server').trim().notEmpty().withMessage('server is required'),
    validate,
];

const pteroPower = [
    body('action').isIn(['start', 'stop', 'kill', 'restart']).withMessage('action must be start|stop|kill|restart'),
    body('server').trim().notEmpty().withMessage('server is required'),
    validate,
];

// ── Forum ────────────────────────────────────────────────────────────────────

const createThread = [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }).withMessage('Title too long'),
    body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 20000 }).withMessage('Post too long'),
    validate,
];

const createForumPost = [
    body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 20000 }).withMessage('Post too long'),
    validate,
];

// ── Messenger ─────────────────────────────────────────────────────────────────

const createSpace = [
    body('name').trim().notEmpty().withMessage('Space name is required').isLength({ max: 100 }).withMessage('Name too long'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description too long'),
    validate,
];

const messengerMessage = [
    body('content').trim().notEmpty().withMessage('Message is required').isLength({ max: 4000 }).withMessage('Message too long'),
    validate,
];

// ── Query param helpers ───────────────────────────────────────────────────────

const paginationQuery = [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1–100'),
    validate,
];

module.exports = {
    validate,
    auth: { login, register, forgotPassword, resetPassword },
    posts: { createPost, createComment },
    messages: { sendMessage },
    friends: { friendAction },
    users: { updateProfile, adminUserLookup, adminBan },
    donations: { purchaseRank },
    minecraft: { addMcServer },
    pterodactyl: { pteroSettings, pteroCommand, pteroPower },
    forum: { createThread, createForumPost },
    messenger: { createSpace, messengerMessage },
    pagination: paginationQuery,
};
