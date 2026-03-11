/* =======================================
   Venary — PostgreSQL Adapter
   Wraps the 'pg' Pool to provide a unified
   interface identical to the SQLite adapter.
   ======================================= */
const { Pool } = require('pg');

class PostgresAdapter {
    constructor(connectionString) {
        this.pool = new Pool({
            connectionString,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000
        });
        this.type = 'postgres';
    }

    async init(schemaSql) {
        // PostgreSQL uses $1, $2 etc. but our schema uses standard SQL
        // Convert SQLite-specific syntax to PostgreSQL
        let pgSchema = schemaSql
            // SQLite uses (CURRENT_TIMESTAMP) with parens for DEFAULT
            .replace(/DEFAULT \(CURRENT_TIMESTAMP\)/g, "DEFAULT NOW()")
            // INTEGER for booleans is fine in PostgreSQL too
            // TEXT is compatible
            // CREATE INDEX IF NOT EXISTS is supported
            ;

        const client = await this.pool.connect();
        try {
            // Split and execute each statement
            const statements = pgSchema.split(';').filter(s => s.trim());
            for (const stmt of statements) {
                await client.query(stmt.trim() + ';');
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
        // Convert ? to $1, $2, ... for pg
        let paramIdx = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++paramIdx}`);

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
