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
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Update media settings (Admin only)
    router.put('/settings', authenticateToken, async (req, res) => {
        try {
            const db = require('../../../server/db');
            const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
            if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

            const updates = req.body;
            for (const key in updates) {
                await extDb.run('INSERT OR REPLACE INTO image_settings (key, value) VALUES (?, ?)', [key, String(updates[key])]);
            }
            res.json({ message: 'Settings updated' });
        } catch (err) {
            res.status(500).json({ error: 'Server error' });
        }
    });

    // Server-side Upload Proxy (For Catbox / Local)
    router.post('/upload', authenticateToken, upload.single('media'), async (req, res) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

            const settingsRows = await extDb.all('SELECT * FROM image_settings');
            const settings = {};
            settingsRows.forEach(r => settings[r.key] = r.value);

            if (settings.allow_direct_upload === '0') {
                return res.status(403).json({ error: 'Uploads are disabled' });
            }

            // 1. Catbox Strategy
            if (settings.storage_type === 'catbox') {
                const formData = new FormData();
                formData.append('reqtype', 'fileupload');

                // Convert buffer to File for fetch since FormData in Node sometimes drops the filename with just Blob
                const fileObj = new File([req.file.buffer], req.file.originalname || 'upload.png', { type: req.file.mimetype || 'image/png' });
                formData.append('fileToUpload', fileObj);

                const response = await fetch('https://catbox.moe/user/api.php', {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'User-Agent': 'Venary-Forum/1.0',
                        'Accept': '*/*'
                    }
                });

                const url = await response.text();
                if (response.ok && url && url.startsWith('http')) {
                    return res.json({ url: url.trim() });
                } else {
                    throw new Error('Catbox error: HTTP ' + response.status + ' - ' + url);
                }
            }

            // 1b. ImgBB Strategy
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

                const result = await response.json();
                if (result.success && result.data && result.data.url) {
                    return res.json({ url: result.data.url });
                } else {
                    const errMsg = (result.error && result.error.message) ? result.error.message : 'Unknown ImgBB error';
                    throw new Error('ImgBB error: ' + errMsg);
                }
            }

            // 1c. Local Strategy
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
