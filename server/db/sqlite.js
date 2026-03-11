/* =======================================
   Venary — SQLite Adapter
   Wraps better-sqlite3 to provide a unified
   async interface identical to the Postgres adapter.
   ======================================= */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class SQLiteAdapter {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'data', 'venary.db');
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        this.db = new Database(this.dbPath);

        // Enable WAL mode for better concurrent performance
        this.db.pragma('journal_mode = WAL');
        // Enable foreign keys
        this.db.pragma('foreign_keys = ON');

        this.type = 'sqlite';
    }

    async init(schemaSql) {
        // better-sqlite3 can exec multi-statement SQL directly
        this.db.exec(schemaSql);
    }

    /**
     * Execute a query.
     * @param {string} sql - SQL with ? placeholders (native to SQLite)
     * @param {Array} params - Parameter values
     * @returns {Promise<{rows: Array, rowCount: number}>}
     */
    async query(sql, params = []) {
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH') || trimmed.startsWith('PRAGMA')) {
            const rows = this.db.prepare(sql).all(...params);
            return { rows, rowCount: rows.length, changes: 0 };
        }
        const result = this.db.prepare(sql).run(...params);
        return { rows: [], rowCount: result.changes, changes: result.changes };
    }

    /**
     * Get a single row.
     */
    async get(sql, params = []) {
        return this.db.prepare(sql).get(...params) || null;
    }

    /**
     * Get all rows.
     */
    async all(sql, params = []) {
        return this.db.prepare(sql).all(...params);
    }

    /**
     * Run a mutation (INSERT/UPDATE/DELETE).
     */
    async run(sql, params = []) {
        const result = this.db.prepare(sql).run(...params);
        return { changes: result.changes };
    }

    async close() {
        this.db.close();
    }
}

module.exports = SQLiteAdapter;
