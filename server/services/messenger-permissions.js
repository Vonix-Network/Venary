/**
 * Venary — Messenger Permissions System
 * Discord-style bitfield permissions.
 * Migrated from extensions/messenger/server/permissions.js
 */
'use strict';

const Permissions = {
    VIEW_CHANNEL:         1n << 0n,
    SEND_MESSAGES:        1n << 1n,
    EMBED_LINKS:          1n << 2n,
    ATTACH_FILES:         1n << 3n,
    ADD_REACTIONS:        1n << 4n,
    USE_EXTERNAL_EMOJI:   1n << 5n,
    MENTION_EVERYONE:     1n << 6n,
    MANAGE_MESSAGES:      1n << 7n,
    READ_MESSAGE_HISTORY: 1n << 8n,
    SEND_TTS:             1n << 9n,
    MANAGE_CHANNELS:      1n << 10n,
    MANAGE_ROLES:         1n << 11n,
    MANAGE_WEBHOOKS:      1n << 12n,
    MANAGE_EMOJIS:        1n << 13n,
    KICK_MEMBERS:         1n << 14n,
    BAN_MEMBERS:          1n << 15n,
    MANAGE_SPACE:         1n << 16n,
    ADMINISTRATOR:        1n << 17n,
    CREATE_INVITES:       1n << 18n,
    MANAGE_THREADS:       1n << 19n,
    CREATE_THREADS:       1n << 20n,
};

const DEFAULT_PERMISSIONS =
    Permissions.VIEW_CHANNEL |
    Permissions.SEND_MESSAGES |
    Permissions.EMBED_LINKS |
    Permissions.ATTACH_FILES |
    Permissions.ADD_REACTIONS |
    Permissions.READ_MESSAGE_HISTORY |
    Permissions.CREATE_INVITES |
    Permissions.CREATE_THREADS;

function hasPermission(computed, permission) {
    if (computed & Permissions.ADMINISTRATOR) return true;
    return (computed & permission) === permission;
}

/**
 * Compute a member's effective permissions in a space.
 * @param {object} db
 * @param {string} spaceId
 * @param {string} userId
 * @param {string} ownerId
 * @returns {Promise<bigint>}
 */
async function computePermissions(db, spaceId, userId, ownerId) {
    if (userId === ownerId) return Permissions.ADMINISTRATOR;

    const member = await db.get(
        'SELECT id FROM members WHERE space_id = ? AND user_id = ?',
        [spaceId, userId]
    );
    if (!member) return 0n;

    const roles = await db.all(
        `SELECT r.permissions FROM roles r
         LEFT JOIN member_roles mr ON mr.role_id = r.id AND mr.member_id = ?
         WHERE r.space_id = ? AND (r.is_default = 1 OR mr.member_id IS NOT NULL)`,
        [member.id, spaceId]
    );

    let computed = 0n;
    for (const role of roles) {
        try { computed |= BigInt(role.permissions || '0'); } catch { /* ignore */ }
    }
    return computed;
}

function serializePerms(bigintVal) { return bigintVal.toString(); }
function deserializePerms(str) { try { return BigInt(str || '0'); } catch { return 0n; } }

module.exports = {
    Permissions, DEFAULT_PERMISSIONS,
    hasPermission, computePermissions,
    serializePerms, deserializePerms,
};
