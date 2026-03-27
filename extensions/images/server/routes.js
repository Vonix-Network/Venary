/**
 * Media & Embeds Extension — Routes
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../../../server/middleware/auth');
const fs = require('fs');
const path = require('path');

// Setup multer for memory storage (we'll stream it to Catbox)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit
});

module.exports = (extDb) => {

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
        try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
    }

    // Get media settings
    router.get('/settings', authenticateToken, async (req, res) => {
        try {
            const rows = await extDb.all('SELECT * FROM image_settings');
            const settings = {};
            rows.forEach(r => settings[r.key] = r.value);
            res.json(settings);
        } catch (err) {
            console.error('[Images Settings] Error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Update media settings (Admin only)
    router.put('/settings', authenticateToken, async (req, res) => {
        try {
            const db = require('../../../server/db');
            if (!db) throw new Error('Core DB module not found');

            const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (!user || user.role !== 'admin') {
                console.warn('[Images Settings] Unauthorized access attempt by user:', req.user.id);
                return res.status(403).json({ error: 'Admin only' });
            }

            const updates = req.body;
            if (!updates) throw new Error('No updates provided in body');

            if (!extDb) throw new Error('Extension DB not initialized');

            for (const key in updates) {
                if (extDb.type === 'postgres') {
                    await extDb.run('INSERT INTO image_settings ("key", "value") VALUES (?, ?) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value"', [key, String(updates[key])]);
                } else {
                    await extDb.run('INSERT OR REPLACE INTO image_settings ("key", "value") VALUES (?, ?)', [key, String(updates[key])]);
                }
            }
            res.json({ message: 'Settings updated' });
        } catch (err) {
            console.error('[Images Settings] Detailed Error:', err);
            res.status(500).json({ error: 'Server error: ' + err.message });
        }
    });

    // Server-side Upload Proxy (For Catbox / Local)
    // Multer error handler wrapper — converts multer's LIMIT_FILE_SIZE into a clean JSON 413
    const uploadMiddleware = (req, res, next) => {
        upload.single('media')(req, res, (err) => {
            if (err && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'File exceeds the 200MB upload limit.' });
            }
            if (err) {
                return res.status(400).json({ error: 'Upload error: ' + err.message });
            }
            next();
        });
    };

    router.post('/upload', authenticateToken, uploadMiddleware, async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const settingsRows = await extDb.all('SELECT * FROM image_settings');
            const settings = {};
            settingsRows.forEach(r => settings[r.key] = r.value);

            if (settings.allow_direct_upload === '0') {
                return res.status(403).json({ error: 'Uploads are disabled' });
            }

            // 1. 0x0.st Strategy (no API key required, 512MB max, 30d–1yr retention)
            if (settings.storage_type === 'nullpointer') {
                const formData = new FormData();
                const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' });
                formData.append('file', blob, req.file.originalname || 'upload');

                const response = await fetch('https://0x0.st', {
                    method: 'POST',
                    body: formData,
                    headers: { 'User-Agent': 'Venary-Forum/1.0' }
                });

                const rawText = await response.text();
                const url = rawText ? rawText.trim() : '';
                if (response.ok && url.startsWith('http')) {
                    return res.json({ url });
                } else {
                    const isHtml = url.trimStart().startsWith('<');
                    const reason = isHtml || !url
                        ? `0x0.st returned an unexpected response (HTTP ${response.status}). The service may be temporarily unavailable.`
                        : url;
                    throw new Error(reason);
                }
            }

            // 2. Catbox Strategy
            if (settings.storage_type === 'catbox') {
                const formData = new FormData();
                formData.append('reqtype', 'fileupload');

                // Use Blob + Filename for maximum Node.js version compatibility
                const blob = new Blob([req.file.buffer], { type: req.file.mimetype || 'image/png' });
                formData.append('fileToUpload', blob, req.file.originalname || 'upload.png');

                const response = await fetch('https://catbox.moe/user/api.php', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'User-Agent': 'Venary-Forum/1.0',
                        'Accept': '*/*'
                    }
                });

                const rawText = await response.text();
                const url = rawText ? rawText.trim() : '';
                if (response.ok && url.startsWith('http')) {
                    return res.json({ url });
                } else {
                    // Strip HTML from Catbox error responses (e.g. Cloudflare pages, 5xx pages)
                    const isHtml = url.trimStart().startsWith('<');
                    let reason;
                    if (isHtml) {
                        reason = `Catbox returned an unexpected response (HTTP ${response.status}). The service may be down or rate-limiting requests.`;
                    } else if (response.status === 412) {
                        reason = 'Catbox uploads are temporarily paused. Please try again later or use an external link.';
                    } else if (response.status === 429) {
                        reason = 'Catbox rate limit reached. Please wait a moment before uploading again.';
                    } else if (response.status >= 500) {
                        reason = `Catbox service error (HTTP ${response.status}). Please try again later.`;
                    } else {
                        reason = url || `Catbox upload failed (HTTP ${response.status}).`;
                    }
                    throw new Error(reason);
                }
            }

            // 3. ImgBB Strategy
            if (settings.storage_type === 'imgbb') {
                const config = JSON.parse(settings.external_storage_config || '{}');
                if (!config.imgbb_key) throw new Error('ImgBB API Key is not configured in Admin settings.');

                const formData = new FormData();
                // ImgBB accepts base64
                formData.append('image', req.file.buffer.toString('base64'));

                const response = await fetch(`https://api.imgbb.com/1/upload?key=${config.imgbb_key}`, {
                    method: 'POST',
                    body: formData
                });

                const imgbbText = await response.text();
                let result;
                try { result = JSON.parse(imgbbText); } catch {
                    throw new Error(`ImgBB returned an unexpected response (HTTP ${response.status}). The service may be unavailable.`);
                }
                if (result.success && result.data && result.data.url) {
                    return res.json({ url: result.data.url });
                } else {
                    const errMsg = (result.error && result.error.message) ? result.error.message : 'Unknown ImgBB error';
                    throw new Error('ImgBB upload failed: ' + errMsg);
                }
            }

            // 4. Local Strategy
            if (settings.storage_type === 'local' || !settings.storage_type) {
                const ext = path.extname(req.file.originalname) || '.png';
                const fileName = uuidv4() + ext;
                const filePath = path.join(uploadsDir, fileName);

                fs.writeFileSync(filePath, req.file.buffer);
                return res.json({ url: '/uploads/' + fileName });
            }

            // 2. Default fallback (if an unknown strategy is selected)
            res.status(501).json({ error: 'Storage strategy not fully implemented on server yet.' });

        } catch (err) {
            console.error('[Media Upload] Error:', err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
