-- =======================================
-- Images Extension — Schema
-- =======================================

CREATE TABLE IF NOT EXISTS image_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Default settings
INSERT OR IGNORE INTO image_settings (key, value) VALUES ('allow_direct_upload', '1');
INSERT OR IGNORE INTO image_settings (key, value) VALUES ('storage_type', 'local'); -- local, s3, imgur, etc.
INSERT OR IGNORE INTO image_settings (key, value) VALUES ('external_storage_config', '{}');
