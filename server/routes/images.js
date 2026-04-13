/**
 * Venary — Images / Media Upload Routes
 * Migrated from extensions/images/server/routes.js
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const db = require('../db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =============================================================================
// Provider Upload Functions
// Each returns a public URL string or throws with err.status set.
// =============================================================================

/**
 * Cloudflare R2 / Backblaze B2 — AWS Signature V4 S3-compatible PUT
 */
async function uploadS3(cfg, buffer, filename, contentType) {
    const { endpoint, bucket, keyId, appKey, region = 'auto' } = cfg;
    const host = new URL(endpoint).host;
    const objectKey = filename;
    const putUrl = `${endpoint.replace(/\/$/, '')}/${bucket}/${objectKey}`;

    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate  = now.toISOString().replace(/[:-]/g, '').replace(/\.\d+/, '');
    const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const canonicalHeaders =
        `content-type:${contentType}\n` +
        `host:${host}\n` +
        `x-amz-content-sha256:${payloadHash}\n` +
        `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = ['PUT', `/${bucket}/${objectKey}`, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope,
        crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');

    const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(hmac(hmac(hmac('AWS4' + appKey, dateStamp), region), 's3'), 'aws4_request');
    const signature  = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${keyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType, 'Host': host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, 'Authorization': authHeader },
        body: buffer
    });

    if (!response.ok) {
        const text = await response.text();
        const err = new Error(`${cfg.provider.toUpperCase()} PUT failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
        err.status = response.status;
        throw err;
    }

    const publicBase = cfg.publicUrl
        ? cfg.publicUrl.replace(/\/$/, '')
        : `${endpoint.replace(/\/$/, '')}/${bucket}`;
    return `${publicBase}/${objectKey}`;
}

/**
 * Cloudinary — multipart POST with HMAC-SHA1 signature
 */
async function uploadCloudinary(cfg, buffer, filename, contentType) {
    const { cloudName, apiKey, apiSecret } = cfg;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const publicId = path.parse(filename).name;

    const sigStr = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = crypto.createHash('sha1').update(sigStr).digest('hex');

    const formData = new FormData();
    const blob = new Blob([buffer], { type: contentType });
    formData.append('file', blob, filename);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('public_id', publicId);
    formData.append('signature', signature);

    const resourceType = contentType.startsWith('video/') ? 'video' : 'image';
    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`, {
        method: 'POST',
        body: formData
    });

    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch {
        const err = new Error(`Cloudinary returned non-JSON (HTTP ${response.status})`);
        err.status = response.status;
        throw err;
    }

    if (!response.ok || !result.secure_url) {
        const err = new Error(`Cloudinary upload failed: ${result.error?.message || text.slice(0, 200)}`);
        err.status = response.status;
        throw err;
    }

    return result.secure_url;
}

/**
 * Bunny.net Storage — simple PUT with AccessKey header
 */
async function uploadBunny(cfg, buffer, filename, contentType) {
    const { accessKey, storageZone, region = 'de', publicHostname } = cfg;
    const host = region === 'de' ? 'storage.bunnycdn.com' : `${region}.storage.bunnycdn.com`;
    const putUrl = `https://${host}/${storageZone}/${filename}`;

    const response = await fetch(putUrl, {
        method: 'PUT',
        headers: {
            'AccessKey': accessKey,
            'Content-Type': contentType
        },
        body: buffer
    });

    if (!response.ok) {
        const text = await response.text();
        const err = new Error(`Bunny.net PUT failed (HTTP ${response.status}): ${text.slice(0, 200)}`);
        err.status = response.status;
        throw err;
    }

    const base = publicHostname
        ? `https://${publicHostname.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
        : `https://${storageZone}.b-cdn.net`;
    return `${base}/${filename}`;
}

/**
 * Dispatch to the correct upload function based on provider type.
 */
async function uploadToProvider(cfg, buffer, filename, contentType) {
    switch (cfg.provider) {
        case 'r2':
        case 'b2':
            return uploadS3(cfg, buffer, filename, contentType);
        case 'cloudinary':
            return uploadCloudinary(cfg, buffer, filename, contentType);
        case 'bunny':
            return uploadBunny(cfg, buffer, filename, contentType);
        default:
            throw Object.assign(new Error(`Unknown provider: ${cfg.provider}`), { status: 400 });
    }
}

/**
 * Try all keys sequentially in priority order: R2 → B2 → Cloudinary → Bunny
 */
async function multiCloudUpload(allKeys, buffer, filename, contentType) {
    if (!allKeys || allKeys.length === 0) throw new Error('No storage keys configured.');

    const priority = { r2: 0, b2: 1, cloudinary: 2, bunny: 3 };
    const ordered = [...allKeys].sort((a, b) =>
        (priority[a.provider] ?? 99) - (priority[b.provider] ?? 99)
    );

    for (let i = 0; i < ordered.length; i++) {
        const cfg = ordered[i];
        try {
            const url = await uploadToProvider(cfg, buffer, filename, contentType);
            console.log(`[MultiCloud] ✓ key ${i + 1}/${ordered.length} provider=${cfg.provider} label="${cfg.label || ''}"`);
            return url;
        } catch (err) {
            console.warn(`[MultiCloud] ✗ key ${i + 1}/${ordered.length} provider=${cfg.provider} HTTP=${err.status || 'net'}: ${err.message}`);
            if (err.status === 400 || err.status === 404) {
                throw new Error(`Storage key #${i + 1} (${cfg.provider}) has a configuration problem (HTTP ${err.status}). Check settings.`);
            }
        }
    }

    throw new Error('All storage accounts are currently full or unavailable. Please add more storage keys in the admin settings.');
}

// =============================================================================
// Multer setup
// =============================================================================

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 200 * 1024 * 1024 } // 200MB
});

const uploadsDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (_) {}
}

// =============================================================================
// Routes
// =============================================================================

// GET /api/images/settings
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const rows = await db.all('SELECT * FROM image_settings');
        const settings = {};
        rows.forEach(r => settings[r.key] = r.value);
        res.json(settings);
    } catch (err) {
        console.error('[Images Settings] Error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// PUT /api/images/settings  (admin only)
router.put('/settings', authenticateToken, async (req, res) => {
    try {
        const user = await db.get('SELECT role FROM users WHERE id = ?', [req.user.id]);
        if (!user || !['admin', 'superadmin', 'moderator'].includes(user.role)) {
            return res.status(403).json({ error: 'Admin only' });
        }

        const updates = req.body;
        if (!updates) throw new Error('No updates provided');

        for (const key in updates) {
            if (db.type === 'postgres') {
                await db.run('INSERT INTO image_settings ("key","value") VALUES (?,?) ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value"', [key, String(updates[key])]);
            } else {
                await db.run('INSERT OR REPLACE INTO image_settings ("key","value") VALUES (?,?)', [key, String(updates[key])]);
            }
        }
        res.json({ message: 'Settings updated' });
    } catch (err) {
        console.error('[Images Settings] Error:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// POST /api/images/upload
const uploadMiddleware = (req, res, next) => {
    upload.single('media')(req, res, (err) => {
        if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 200MB upload limit.' });
        if (err) return res.status(400).json({ error: 'Upload error: ' + err.message });
        next();
    });
};

router.post('/upload', authenticateToken, uploadMiddleware, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const settingsRows = await db.all('SELECT * FROM image_settings');
        const settings = {};
        settingsRows.forEach(r => settings[r.key] = r.value);

        if (settings.allow_direct_upload === '0') return res.status(403).json({ error: 'Uploads are disabled' });

        const mime = req.file.mimetype || 'application/octet-stream';
        const ext  = path.extname(req.file.originalname) || '.bin';

        if (settings.storage_type === 'multicloud') {
            const config = JSON.parse(settings.external_storage_config || '{}');
            const allKeys = config.multicloud_keys || [];
            if (allKeys.length === 0) return res.status(500).json({ error: 'No storage keys configured. Add keys in admin settings.' });
            const filename = uuidv4() + ext;
            const url = await multiCloudUpload(allKeys, req.file.buffer, filename, mime);
            return res.json({ url });
        }

        if (settings.storage_type === 'nullpointer') {
            const formData = new FormData();
            formData.append('file', new Blob([req.file.buffer], { type: mime }), req.file.originalname || 'upload');
            const response = await fetch('https://0x0.st', { method: 'POST', body: formData, headers: { 'User-Agent': 'Venary-Forum/1.0' } });
            const rawText = await response.text();
            const url = rawText ? rawText.trim() : '';
            if (response.ok && url.startsWith('http')) return res.json({ url });
            const isHtml = url.trimStart().startsWith('<');
            throw new Error(isHtml || !url ? `0x0.st error (HTTP ${response.status}). Service may be unavailable.` : url);
        }

        if (settings.storage_type === 'catbox') {
            const formData = new FormData();
            formData.append('reqtype', 'fileupload');
            formData.append('fileToUpload', new Blob([req.file.buffer], { type: mime }), req.file.originalname || 'upload');
            const response = await fetch('https://catbox.moe/user/api.php', { method: 'POST', body: formData, headers: { 'User-Agent': 'Venary-Forum/1.0', 'Accept': '*/*' } });
            const rawText = await response.text();
            const url = rawText ? rawText.trim() : '';
            if (response.ok && url.startsWith('http')) return res.json({ url });
            const isHtml = url.trimStart().startsWith('<');
            if (isHtml) throw new Error(`Catbox error (HTTP ${response.status}). Service may be down.`);
            if (response.status === 412) throw new Error('Catbox uploads are temporarily paused. Try again later.');
            if (response.status === 429) throw new Error('Catbox rate limit reached. Wait a moment and try again.');
            if (response.status >= 500) throw new Error(`Catbox service error (HTTP ${response.status}). Try again later.`);
            throw new Error(url || `Catbox upload failed (HTTP ${response.status}).`);
        }

        if (settings.storage_type === 'imgbb') {
            const config = JSON.parse(settings.external_storage_config || '{}');
            if (!config.imgbb_key) throw new Error('ImgBB API Key not configured.');
            const formData = new FormData();
            formData.append('image', req.file.buffer.toString('base64'));
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${config.imgbb_key}`, { method: 'POST', body: formData });
            const text = await response.text();
            let result;
            try { result = JSON.parse(text); } catch { throw new Error(`ImgBB error (HTTP ${response.status}). Service may be unavailable.`); }
            if (result.success && result.data?.url) return res.json({ url: result.data.url });
            throw new Error('ImgBB upload failed: ' + (result.error?.message || 'Unknown error'));
        }

        if (settings.storage_type === 'r2') {
            const c = JSON.parse(settings.external_storage_config || '{}');
            if (!c.r2_key_id || !c.r2_app_key || !c.r2_bucket || !c.r2_endpoint) throw new Error('R2 configuration incomplete. Check admin settings.');
            const filename = uuidv4() + ext;
            const url = await uploadS3({ provider: 'r2', keyId: c.r2_key_id, appKey: c.r2_app_key, bucket: c.r2_bucket, endpoint: c.r2_endpoint, publicUrl: c.r2_public_url }, req.file.buffer, filename, mime);
            return res.json({ url });
        }

        if (settings.storage_type === 'b2') {
            const c = JSON.parse(settings.external_storage_config || '{}');
            if (!c.b2_key_id || !c.b2_app_key || !c.b2_bucket || !c.b2_endpoint) throw new Error('B2 configuration incomplete. Check admin settings.');
            const filename = uuidv4() + ext;
            const url = await uploadS3({ provider: 'b2', keyId: c.b2_key_id, appKey: c.b2_app_key, bucket: c.b2_bucket, endpoint: c.b2_endpoint, publicUrl: c.b2_public_url }, req.file.buffer, filename, mime);
            return res.json({ url });
        }

        if (settings.storage_type === 'cloudinary') {
            const c = JSON.parse(settings.external_storage_config || '{}');
            if (!c.cld_cloud_name || !c.cld_api_key || !c.cld_api_secret) throw new Error('Cloudinary configuration incomplete. Check admin settings.');
            const filename = uuidv4() + ext;
            const url = await uploadCloudinary({ cloudName: c.cld_cloud_name, apiKey: c.cld_api_key, apiSecret: c.cld_api_secret }, req.file.buffer, filename, mime);
            return res.json({ url });
        }

        if (settings.storage_type === 'bunny') {
            const c = JSON.parse(settings.external_storage_config || '{}');
            if (!c.bunny_access_key || !c.bunny_storage_zone) throw new Error('Bunny.net configuration incomplete. Check admin settings.');
            const filename = uuidv4() + ext;
            const url = await uploadBunny({ accessKey: c.bunny_access_key, storageZone: c.bunny_storage_zone, region: c.bunny_region || 'de', publicHostname: c.bunny_public_hostname }, req.file.buffer, filename, mime);
            return res.json({ url });
        }

        if (settings.storage_type === 'local' || !settings.storage_type) {
            const fileName = uuidv4() + ext;
            fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
            return res.json({ url: '/uploads/' + fileName });
        }

        res.status(501).json({ error: 'Storage strategy not implemented.' });

    } catch (err) {
        console.error('[Media Upload] Error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
