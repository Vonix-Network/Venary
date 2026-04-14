-- Migration 003: Ban Appeals System
-- Run against your database to add the ban_appeals table
-- ================================================

CREATE TABLE IF NOT EXISTS ban_appeals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    ban_reason_display TEXT,
    appeal_message TEXT NOT NULL,
    status TEXT DEFAULT 'submitted',
    decline_reason TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    cooldown_until TEXT,
    previous_appeal_id TEXT,
    created_at TEXT DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (reviewed_by) REFERENCES users(id),
    FOREIGN KEY (previous_appeal_id) REFERENCES ban_appeals(id)
);

-- Indices for ban appeals
CREATE INDEX IF NOT EXISTS idx_appeals_user ON ban_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON ban_appeals(status);
CREATE INDEX IF NOT EXISTS idx_appeals_created ON ban_appeals(created_at);
