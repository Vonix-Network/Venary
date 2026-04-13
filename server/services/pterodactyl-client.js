'use strict';

const https = require('https');
const http  = require('http');
const { URL } = require('url');
const WebSocket = require('ws');

/**
 * Client for interacting with the Pterodactyl Panel API.
 * Handles REST calls (power actions, server status) and WebSocket console streaming.
 *
 * Migrated from extensions/pterodactyl-panel/server/pterodactyl-client.js
 */
class PterodactylClient {
    /**
     * @param {object} opts
     * @param {string} opts.baseUrl  - Base URL of the Pterodactyl panel (e.g. https://panel.example.com)
     * @param {string} opts.apiKey   - Pterodactyl client API key (never logged)
     * @param {string} opts.serverId - Target server identifier
     */
    constructor({ baseUrl, apiKey, serverId }) {
        this.baseUrl   = baseUrl.replace(/\/$/, '');
        this._apiKey   = apiKey; // private — never logged
        this.serverId  = serverId;

        /** @type {string[]} Circular buffer of up to 500 recent console lines */
        this.consoleBuffer = [];

        /** @type {WebSocket|null} Active WebSocket connection */
        this._ws = null;
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /**
     * Perform an HTTP/HTTPS request using Node's built-in modules.
     * @param {string} method
     * @param {string} path
     * @param {object|null} body
     * @returns {Promise<{ statusCode: number, body: object|string }>}
     */
    _request(method, path, body = null) {
        return new Promise((resolve, reject) => {
            const safePath = path.startsWith('/') ? path : '/' + path;
            const fullUrl  = this.baseUrl + safePath;
            let target;
            try {
                target = new URL(fullUrl);
            } catch (e) {
                return reject(new Error(`Invalid URL constructed: ${fullUrl} — check your Base URL setting`));
            }

            const isHttps   = target.protocol === 'https:';
            const transport = isHttps ? https : http;
            const payload   = body ? JSON.stringify(body) : null;

            const options = {
                hostname: target.hostname,
                port:     target.port || (isHttps ? 443 : 80),
                path:     target.pathname + target.search,
                method,
                headers: {
                    'Authorization': `Bearer ${this._apiKey}`,
                    'Accept':        'application/json, application/vnd.pterodactyl.v1+json',
                    'Content-Type':  'application/json',
                    ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
                },
            };

            const req = transport.request(options, (res) => {
                let raw = '';
                res.on('data', (chunk) => { raw += chunk; });
                res.on('end', () => {
                    let parsed;
                    try { parsed = JSON.parse(raw); } catch { parsed = raw; }
                    resolve({ statusCode: res.statusCode, body: parsed });
                });
            });

            req.on('error', (err) => {
                const safeMsg = err.message.replace(this._apiKey, '[REDACTED]');
                reject(new Error(safeMsg));
            });

            if (payload) req.write(payload);
            req.end();
        });
    }

    /**
     * Push a line into the circular console buffer (max 500 entries).
     * @param {string} line
     */
    _bufferLine(line) {
        if (this.consoleBuffer.length >= 500) this.consoleBuffer.shift();
        this.consoleBuffer.push(line);
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Send a power action to the server.
     * @param {'start'|'stop'|'kill'|'restart'} action
     */
    async sendPowerAction(action) {
        return this._request('POST', `/api/client/servers/${this.serverId}/power`, { signal: action });
    }

    /**
     * Fetch the current server resource state and full stats.
     */
    async getServerStatus() {
        const { body } = await this._request('GET', `/api/client/servers/${this.serverId}/resources`);
        const attrs = body?.attributes || {};
        const raw   = attrs.current_state ?? '';
        const STATUS_MAP = {
            running: 'running', online:   'running',
            offline: 'offline', stopped:  'offline',
            starting: 'starting', stopping: 'stopping',
        };
        return { status: STATUS_MAP[raw] ?? 'offline', resources: attrs.resources || {} };
    }

    /**
     * Open a WebSocket connection to the Pterodactyl console endpoint.
     * @param {function(string): void} onLine
     * @param {function(string): void} onStatus
     * @param {function(string): void} onError
     * @param {function(object): void} [onStats]
     */
    async connectConsole(onLine, onStatus, onError, onStats) {
        this._onStats = onStats || null;
        await this._openConsoleSocket(onLine, onStatus, onError, 0);
    }

    /** @private */
    async _openConsoleSocket(onLine, onStatus, onError, attempt) {
        let token, socketUrl;
        try {
            const { body } = await this._request('GET', `/api/client/servers/${this.serverId}/websocket`);
            token     = body?.data?.token;
            socketUrl = body?.data?.socket;
            if (!token || !socketUrl) throw new Error('Invalid websocket credentials response');
        } catch (err) {
            const safeMsg = err.message.replace(this._apiKey, '[REDACTED]');
            return this._scheduleReconnect(onLine, onStatus, onError, attempt, safeMsg);
        }

        const ws = new WebSocket(socketUrl, { headers: { 'Origin': this.baseUrl } });
        this._ws = ws;

        ws.on('open', () => {
            ws.send(JSON.stringify({ event: 'auth', args: [token] }));
        });

        ws.on('message', (data) => {
            let msg;
            try { msg = JSON.parse(data); } catch { return; }
            const { event, args = [] } = msg;

            if (event === 'auth success') {
                ws.send(JSON.stringify({ event: 'send logs',  args: [] }));
                ws.send(JSON.stringify({ event: 'send stats', args: [] }));
                if (this._statsInterval) clearInterval(this._statsInterval);
                this._statsInterval = setInterval(() => {
                    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ event: 'send stats', args: [] }));
                }, 1000);
            } else if (event === 'console output') {
                const line = args[0] ?? '';
                this._bufferLine(line);
                onLine(line);
            } else if (event === 'status') {
                onStatus(args[0] ?? '');
            } else if (event === 'stats') {
                const state = args[0] && args[0].state;
                if (state) onStatus(state);
                if (this._onStats && args[0]) this._onStats(args[0]);
            } else if (event === 'token expiring') {
                this._refreshWsToken(ws);
            } else if (event === 'token expired') {
                ws.close();
            }
        });

        ws.on('close', (code) => {
            this._ws = null;
            if (this._statsInterval) { clearInterval(this._statsInterval); this._statsInterval = null; }
            if (code === 1000) return;
            this._scheduleReconnect(onLine, onStatus, onError, attempt);
        });

        ws.on('error', (err) => {
            void err.message.replace(this._apiKey, '[REDACTED]');
        });
    }

    /** @private */
    async _refreshWsToken(ws) {
        try {
            const { body } = await this._request('GET', `/api/client/servers/${this.serverId}/websocket`);
            const token = body?.data?.token;
            if (token && ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify({ event: 'auth', args: [token] }));
            }
        } catch { /* if refresh fails the socket closes and reconnects */ }
    }

    /**
     * Exponential backoff reconnect. Max 5 attempts (1s, 2s, 4s, 8s, 16s).
     * @private
     */
    _scheduleReconnect(onLine, onStatus, onError, attempt, reason) {
        const MAX = 5;
        const next = attempt + 1;
        if (next > MAX) {
            onError(`Console stream disconnected after ${MAX} reconnect attempts.`);
            return;
        }
        const delay = 1000 * Math.pow(2, attempt);
        console.log(`[Pterodactyl] Reconnecting in ${delay}ms (attempt ${next}/${MAX})`);
        setTimeout(() => this._openConsoleSocket(onLine, onStatus, onError, next), delay);
    }

    /** Gracefully close the active WebSocket connection. */
    disconnect() {
        if (this._statsInterval) { clearInterval(this._statsInterval); this._statsInterval = null; }
        if (this._ws) {
            this._ws.removeAllListeners();
            this._ws.close();
            this._ws = null;
        }
    }
}

module.exports = PterodactylClient;
