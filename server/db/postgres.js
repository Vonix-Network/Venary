/* =======================================
   Venary — PostgreSQL Adapter
   Wraps the 'pg' Pool to provide a unified
   interface identical to the SQLite adapter.
   ======================================= */
const { Pool } = require('pg');
const logger = require('../logger');

class PostgresAdapter {
    constructor(connectionString, schemaName = 'public') {
        this.schemaName = schemaName;
        this.pool = new Pool({
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });

        // Set search_path for all clients in the pool
        if (this.schemaName && this.schemaName !== 'public') {
            this.pool.on('connect', client => {
                client.query(`SET search_path TO "${this.schemaName}", public`).catch(err => {
                    logger.error("[Postgres] Failed to set search_path", { schema: this.schemaName, err: err.message });
                });
            });
        }

        this.type = 'postgres';
    }

    async init(schemaSql) {
        const client = await this.pool.connect();
        try {
            // Ensure schema exists if isolated
            if (this.schemaName && this.schemaName !== 'public') {
                await client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schemaName}";`);
                await client.query(`SET search_path TO "${this.schemaName}", public;`);
            }

            // Strip SQL comments (single-line and multi-line)
            let cleanSql = schemaSql
                .replace(/--.*$/gm, '') // Strip -- comments
                .replace(/\/\*[\s\S]*?\*\//g, ''); // Strip /* */ comments

            // SQLite uses (CURRENT_TIMESTAMP) with parens for DEFAULT
            // Convert SQLite-specific syntax to PostgreSQL
            let pgSchema = cleanSql
                // Cast timestamp to text so TEXT columns with timestamp defaults work
                .replace(/DEFAULT \(CURRENT_TIMESTAMP\)/gi, "DEFAULT (NOW()::TEXT)")
                .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, "SERIAL PRIMARY KEY")
                .replace(/AUTOINCREMENT/gi, "")
                // SQLite strftime('%s','now') → PostgreSQL epoch integer
                .replace(/strftime\s*\(\s*'%s'\s*,\s*'now'\s*\)/gi, "EXTRACT(EPOCH FROM NOW())::INTEGER")
                // SQLite REAL type → DOUBLE PRECISION
                .replace(/\bREAL\b/g, "DOUBLE PRECISION")
                // SQLite BLOB type → BYTEA
                .replace(/\bBLOB\b/g, "BYTEA")
                ;

            // Split and execute each statement
            const statements = pgSchema.split(';').filter(s => s.trim());
            for (const stmt of statements) {
                let sql = stmt.trim();
                if (!sql) continue;

                // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
                if (/^INSERT OR IGNORE INTO/i.test(sql)) {
                    sql = sql.replace(/^INSERT OR IGNORE INTO/i, 'INSERT INTO');
                    await client.query(sql + ' ON CONFLICT DO NOTHING;');
                // INSERT OR REPLACE → INSERT ... ON CONFLICT DO UPDATE (generic update all non-PK cols)
                // We handle this at the query level; in schema init it shouldn't appear, but guard anyway
                } else if (/^INSERT OR REPLACE INTO/i.test(sql)) {
                    sql = sql.replace(/^INSERT OR REPLACE INTO/i, 'INSERT INTO');
                    await client.query(sql + ' ON CONFLICT DO NOTHING;');
                } else {
                    await client.query(sql + ';');
                }
            }
        } finally {
            client.release();
        }
    }

    /**
     * Execute a query. Converts ? placeholders to $1, $2, ... for pg.
     * @param {string} sql - SQL with ? placeholders
     * @param {Array} params - Parameter values
     * @returns {Promise<{rows: Array, rowCount: number}>}
     */
    async query(sql, params = []) {
        let s = sql.trim();

        // INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
        if (/^INSERT OR IGNORE INTO/i.test(s)) {
            s = s.replace(/^INSERT OR IGNORE INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
        }
        // INSERT OR REPLACE → INSERT ... ON CONFLICT DO NOTHING
        // (callers that need true upsert should use explicit ON CONFLICT syntax)
        else if (/^INSERT OR REPLACE INTO/i.test(s)) {
            s = s.replace(/^INSERT OR REPLACE INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
        }

        // Translate SQLite-specific functions to PostgreSQL equivalents
        s = s.replace(/strftime\s*\(\s*'%s'\s*,\s*'now'\s*\)/gi, "EXTRACT(EPOCH FROM NOW())::INTEGER");

        // Convert ? placeholders to $1, $2, ... for pg
        let paramIdx = 0;
        const pgSql = s.replace(/\?/g, () => `$${++paramIdx}`);

        const result = await this.pool.query(pgSql, params);
        return {
            rows: result.rows,
            rowCount: result.rowCount,
            changes: result.rowCount
        };
    }

    /**
     * Get a single row.
     */
    async get(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows[0] || null;
    }

    /**
     * Get all rows.
     */
    async all(sql, params = []) {
        const result = await this.query(sql, params);
        return result.rows;
    }

    /**
     * Run a mutation (INSERT/UPDATE/DELETE).
     */
    async run(sql, params = []) {
        const result = await this.query(sql, params);
        return { changes: result.rowCount };
    }

    async close() {
        await this.pool.end();
    }
}

module.exports = PostgresAdapter;
