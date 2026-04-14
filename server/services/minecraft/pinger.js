/* =======================================
   Minecraft Extension — Native Server Pinger
   Implements MC Server List Ping protocol
   over TCP using Node's net module.
   ======================================= */
const net = require('net');

const PING_TIMEOUT = 5000;
const CACHE_TTL = 30000;
const pingCache = new Map();

function readVarInt(buffer, offset) {
    let value = 0, position = 0, bytesRead = 0;
    while (true) {
        if (offset + bytesRead >= buffer.length) throw new Error('VarInt overflow');
        const byte = buffer[offset + bytesRead];
        value |= (byte & 0x7F) << position;
        bytesRead++;
        if ((byte & 0x80) === 0) break;
        position += 7;
        if (position >= 32) throw new Error('VarInt too big');
    }
    return [value, bytesRead];
}

function writeVarInt(value) {
    const bytes = [];
    while (true) {
        if ((value & ~0x7F) === 0) { bytes.push(value); break; }
        bytes.push((value & 0x7F) | 0x80);
        value >>>= 7;
    }
    return Buffer.from(bytes);
}

function createHandshakePacket(host, port) {
    const protocolVersion = writeVarInt(-1);
    const hostBytes = Buffer.from(host, 'utf8');
    const hostLength = writeVarInt(hostBytes.length);
    const portBuffer = Buffer.alloc(2);
    portBuffer.writeUInt16BE(port);
    const nextState = writeVarInt(1);
    const payload = Buffer.concat([protocolVersion, hostLength, hostBytes, portBuffer, nextState]);
    const packetId = writeVarInt(0x00);
    const packetData = Buffer.concat([packetId, payload]);
    return Buffer.concat([writeVarInt(packetData.length), packetData]);
}

function createStatusPacket() {
    const packetId = writeVarInt(0x00);
    return Buffer.concat([writeVarInt(packetId.length), packetId]);
}

function parseResponse(jsonStr) {
    try {
        const data = JSON.parse(jsonStr);
        const players = {
            online: data.players?.online ?? 0,
            max: data.players?.max ?? 0,
            list: (data.players?.sample || []).map(p => ({ uuid: p.id || '', name: p.name || 'Unknown' }))
        };
        let version = null;
        if (data.version) version = (data.version.name || '').replace(/§[0-9a-fk-or]/gi, '');
        let motd = '';
        if (data.description) {
            if (typeof data.description === 'string') motd = data.description;
            else if (data.description.text) motd = data.description.text;
            else if (data.description.extra) motd = data.description.extra.map(e => e.text || '').join('');
            motd = motd.replace(/§[0-9a-fk-or]/gi, '');
        }
        return { online: true, players, version, motd, icon: data.favicon || null };
    } catch {
        return { online: true, players: { online: 0, max: 0, list: [] }, version: null, motd: '', icon: null };
    }
}

/**
 * Ping a Minecraft server using the native SLP protocol.
 * Returns { online, players, version, motd, icon, responseTimeMs }
 */
function pingServer(host, port = 25565) {
    const cacheKey = `${host}:${port}`;
    const cached = pingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return Promise.resolve(cached.data);
    }

    return new Promise(resolve => {
        const startTime = Date.now();
        const socket = new net.Socket();
        let responseData = Buffer.alloc(0);
        let resolved = false;

        const finish = (result) => {
            if (resolved) return;
            resolved = true;
            socket.destroy();
            clearTimeout(timeout);
            result.responseTimeMs = Date.now() - startTime;
            if (result.online) pingCache.set(cacheKey, { data: result, timestamp: Date.now() });
            resolve(result);
        };

        const timeout = setTimeout(() => {
            finish({ online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: '', icon: null });
        }, PING_TIMEOUT);

        socket.on('connect', () => {
            socket.write(createHandshakePacket(host, port));
            socket.write(createStatusPacket());
        });

        socket.on('data', chunk => {
            responseData = Buffer.concat([responseData, chunk]);
            try {
                let offset = 0;
                const [packetLength, lb] = readVarInt(responseData, offset); offset += lb;
                if (responseData.length >= offset + packetLength) {
                    const [packetId, ib] = readVarInt(responseData, offset); offset += ib;
                    if (packetId === 0x00) {
                        const [jsonLength, jb] = readVarInt(responseData, offset); offset += jb;
                        const jsonStr = responseData.toString('utf8', offset, offset + jsonLength);
                        finish(parseResponse(jsonStr));
                    }
                }
            } catch { /* wait for more data */ }
        });

        socket.on('error', () => {
            finish({ online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: '', icon: null });
        });

        socket.on('close', () => {
            finish({ online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: '', icon: null });
        });

        socket.connect(port, host);
    });
}

/**
 * Fallback: use mcstatus.io API
 */
async function pingServerAPI(address, port = 25565, isBedrock = false) {
    const endpoint = isBedrock ? 'bedrock' : 'java';
    const target = port === 25565 ? encodeURIComponent(address) : encodeURIComponent(`${address}:${port}`);
    const url = `https://api.mcstatus.io/v2/status/${endpoint}/${target}`;
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Venary/1.0' } });
        clearTimeout(tid);
        if (!res.ok) throw new Error('API ' + res.status);
        const data = await res.json();
        return {
            online: !!data.online,
            players: { online: data.players?.online || 0, max: data.players?.max || 0, list: (data.players?.list || []).map(p => ({ uuid: p.uuid || '', name: p.name_clean || p.name_raw || '' })) },
            version: data.version?.name_clean || data.version?.name_raw || null,
            motd: (data.motd?.clean || []).join(' ').trim(),
            icon: data.icon || null,
            responseTimeMs: 0
        };
    } catch {
        return { online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: '', icon: null, responseTimeMs: 0 };
    }
}

/**
 * Smart ping: try native first, fall back to API.
 * For Geyser/hybrid servers (is_bedrock=true), try Java first then Bedrock fallback.
 */
async function smartPing(address, port = 25565, isBedrock = false) {
    // Try Java ping first (native then API)
    const javaResult = await pingServer(address, port);
    if (javaResult.online) {
        // Java server is online - return it
        return javaResult;
    }

    // Java ping failed - try Java via API fallback
    const javaApiResult = await pingServerAPI(address, port, false);
    if (javaApiResult.online) {
        return javaApiResult;
    }

    // Java completely offline - try Bedrock as fallback (for Geyser/hybrid servers)
    if (isBedrock || port === 19132) {
        const bedrockResult = await pingServerAPI(address, port, true);
        if (bedrockResult.online) return bedrockResult;
    }

    // Both Java and Bedrock are offline
    return javaApiResult;
}

module.exports = { pingServer, pingServerAPI, smartPing };
