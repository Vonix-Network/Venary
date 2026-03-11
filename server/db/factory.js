/* =======================================
   Venary — Database Factory
   Creates database adapter instances.
   Reusable for core and extensions.
   ======================================= */
const path = require('path');

/**
 * Create a database adapter based on type.
 * @param {Object} opts
 * @param {string} opts.type - 'sqlite' or 'postgres'
 * @param {string} [opts.name] - Database name (used for file naming in SQLite)
 * @param {string} [opts.connectionString] - PostgreSQL connection URL
 * @param {string} [opts.sqlitePath] - Override SQLite file path
 * @returns {Object} Adapter with get/all/run/init/close methods
 */
function createAdapter(opts = {}) {
    const type = (opts.type || 'sqlite').toLowerCase();

    if (type === 'postgres' || type === 'postgresql') {
        const PostgresAdapter = require('./postgres');
        if (!opts.connectionString) {
            throw new Error('connectionString is required for PostgreSQL adapter');
        }
        return new PostgresAdapter(opts.connectionString);
    }

    const SQLiteAdapter = require('./sqlite');
    const dbPath = opts.sqlitePath || path.join(
        __dirname, '..', '..', 'data',
        (opts.name || 'venary') + '.db'
    );
    return new SQLiteAdapter(dbPath);
}

/**
 * Create a fully initialized database instance with schema.
 * @param {Object} opts - Same as createAdapter
 * @param {string} schemaSql - SQL schema to execute
 * @returns {Promise<Object>} Initialized adapter
 */
async function createDatabase(opts, schemaSql) {
    const adapter = createAdapter(opts);
    if (schemaSql) {
        await adapter.init(schemaSql);
    }
    return adapter;
}

module.exports = { createAdapter, createDatabase };
