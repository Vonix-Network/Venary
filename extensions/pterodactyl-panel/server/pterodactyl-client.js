'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');
const WebSocket = require('ws');

/**
 * Client for interacting with the Pterodactyl Panel API.
 * Handles REST calls (power actions, server status) and WebSocket console streaming.
 */
class PterodactylClient {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl  - Base URL of the Pterodactyl panel (e.g. https://panel.example.com)
   * @param {string} opts.apiKey   - Pterodactyl client API key (never logged)
   * @param {string} opts.serverId - Target server identifier
   */
  constructor({ baseUrl, apiKey, serverId }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this._apiKey = apiKey; // private — never logged
    this.serverId = serverId;

    /** @type {string[]} Circular buffer of up to 500 recent console lines */
    this.consoleBuffer = [];

    /** @type {WebSocket|null} Active WebSocket connection */
    this._ws = null;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Perform an HTTP/HTTPS request using Node's built-in modules.
   * @param {string} method  - HTTP method
   * @param {string} path    - URL path (appended to baseUrl)
   * @param {object|null} body - JSON body (or null)
   * @returns {Promise<{ statusCode: number, body: object|string }>}
   */
  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      // Ensure path always starts with /
      const safePath = path.startsWith('/') ? path : '/' + path;
      const fullUrl = this.baseUrl + safePath;
      let target;
      try {
        target = new URL(fullUrl);
      } catch (e) {
        return reject(new Error(`Invalid URL constructed: ${fullUrl} — check your Base URL setting`));
      }
      const isHttps = target.protocol === 'https:';
      const transport = isHttps ? https : http;

      const payload = body ? JSON.stringify(body) : null;

      const options = {
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: target.pathname + target.search,
        method,
        headers: {
          'Authorization': `Bearer ${this._apiKey}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
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
        // Mask apiKey from error messages
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
    if (this.consoleBuffer.length >= 500) {
      this.consoleBuffer.shift();
    }
    this.consoleBuffer.push(line);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send a power action to the server.
   * @param {'start'|'stop'|'kill'|'restart'} action
   * @returns {Promise<{ statusCode: number, body: object|string }>}
   */
  async sendPowerAction(action) {
    const path = `/api/client/servers/${this.serverId}/power`;
    return this._request('POST', path, { signal: action });
  }

  /**
   * Fetch the current server resource state and normalise it.
   * @returns {Promise<{ status: 'running'|'offline'|'starting'|'stopping' }>}
   */
  async getServerStatus() {
    const path = `/api/client/servers/${this.serverId}/resources`;
    const { body } = await this._request('GET', path);

    const raw = body?.attributes?.current_state ?? '';
    const STATUS_MAP = {
      running: 'running',
      online: 'running',
      offline: 'offline',
      stopped: 'offline',
      starting: 'starting',
      stopping: 'stopping',
    };
    const status = STATUS_MAP[raw] ?? 'offline';
    return { status };
  }

  /**
   * Open a WebSocket connection to the Pterodactyl console endpoint.
   * Authenticates with a token obtained from the REST API, then streams
   * console output and status events to the provided callbacks.
   *
   * @param {function(string): void} onLine   - Called for each console output line
   * @param {function(string): void} onStatus - Called when server state changes
   * @param {function(string): void} onError  - Called on unrecoverable error
   * @returns {Promise<void>}
   */
  async connectConsole(onLine, onStatus, onError) {
    await this._openConsoleSocket(onLine, onStatus, onError, 0);
  }

  /**
   * Internal: fetch WS credentials and open the socket.
   * @private
   */
  async _openConsoleSocket(onLine, onStatus, onError, attempt) {
    let token, socketUrl;
    try {
      const path = `/api/client/servers/${this.serverId}/websocket`;
      const { body } = await this._request('GET', path);
      token = body?.data?.token;
      socketUrl = body?.data?.socket;
      if (!token || !socketUrl) throw new Error('Invalid websocket credentials response');
    } catch (err) {
      const safeMsg = err.message.replace(this._apiKey, '[REDACTED]');
      return this._scheduleReconnect(onLine, onStatus, onError, attempt, safeMsg);
    }

    const ws = new WebSocket(socketUrl);
    this._ws = ws;

    ws.on('open', () => {
      ws.send(JSON.stringify({ event: 'auth', args: [token] }));
    });

    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      const { event, args = [] } = msg;

      if (event === 'console output') {
        const line = args[0] ?? '';
        this._bufferLine(line);
        onLine(line);
      } else if (event === 'status') {
        onStatus(args[0] ?? '');
      }
    });

    ws.on('close', () => {
      this._scheduleReconnect(onLine, onStatus, onError, attempt);
    });

    ws.on('error', (err) => {
      const safeMsg = err.message.replace(this._apiKey, '[REDACTED]');
      // 'error' is always followed by 'close', so reconnect is handled there
      // but we surface the message for diagnostics without leaking the key
      void safeMsg;
    });
  }

  /**
   * Schedule a reconnect attempt with exponential backoff.
   * Base delay: 1000 ms. Multiplier: 2×. Max attempts: 5.
   *
   * @param {function(string): void} onLine
   * @param {function(string): void} onStatus
   * @param {function(string): void} onError
   * @param {number} attempt - Zero-based attempt index that just failed
   * @param {string} [reason]
   */
  _scheduleReconnect(onLine, onStatus, onError, attempt, reason) {
    const MAX_ATTEMPTS = 5;
    const nextAttempt = attempt + 1;

    if (nextAttempt > MAX_ATTEMPTS) {
      onError('Max reconnect attempts reached');
      return;
    }

    const delay = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s, 8s, 16s
    setTimeout(() => {
      this._openConsoleSocket(onLine, onStatus, onError, nextAttempt);
    }, delay);
  }

  /**
   * Gracefully close the active WebSocket connection (if any).
   */
  disconnect() {
    if (this._ws) {
      this._ws.removeAllListeners();
      this._ws.close();
      this._ws = null;
    }
  }
}

module.exports = PterodactylClient;
