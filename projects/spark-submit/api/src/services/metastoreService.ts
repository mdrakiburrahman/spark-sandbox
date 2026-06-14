/**
 * Metastore Service
 *
 * Direct SQL Server connection to the Hive metastore for fast schema
 * discovery. Replaces the slow Livy-based N+1 approach with a single
 * JOIN query that returns all databases, tables, and columns at once.
 *
 * Requires METASTORE_URL env var (e.g. mssql://sa:Hive@Pass123@localhost:11434/metastore).
 * Falls back gracefully — callers should check isMetastoreAvailable() first.
 */

import sql from 'mssql'
import type { MetastoreSchema, MetastoreDatabase, MetastoreTable, ColumnInfo, ProgressCallback } from './livyService.js'

// ============================================================================
// Types
// ============================================================================

interface MetastoreRow {
    db_name: string
    table_name: string
    col_name: string
    col_type: string
    col_idx: number
    col_source: string
}

interface NamesOnlyRow {
    db_name: string
    table_name: string
}

// ============================================================================
// Connection config
// ============================================================================

/**
 * Parse a METASTORE_URL into an mssql config object.
 */
function parseConnectionUrl(urlStr: string): sql.config {
    // ADO-style connection string
    if (urlStr.includes('=') && !urlStr.startsWith('mssql://')) {
        const parts = Object.fromEntries(
            urlStr
                .split(';')
                .filter(Boolean)
                .map((p) => {
                    const [k, ...v] = p.split('=')
                    return [k.trim().toLowerCase(), v.join('=').trim()]
                })
        )
        const serverParts = (parts['server'] || 'localhost').split(',')
        return {
            server: serverParts[0],
            port: serverParts.length > 1 ? parseInt(serverParts[1], 10) : 1433,
            database: parts['database'] || parts['initial catalog'] || 'metastore',
            user: parts['user id'] || parts['user'] || 'sa',
            password: parts['password'] || '',
            options: { encrypt: false, trustServerCertificate: true },
        }
    }

    // URL-style: mssql://user:password@host:port/database
    const url = new URL(urlStr)
    return {
        server: url.hostname || 'localhost',
        port: url.port ? parseInt(url.port, 10) : 1433,
        database: url.pathname.replace(/^\//, '') || 'metastore',
        user: decodeURIComponent(url.username || 'sa'),
        password: decodeURIComponent(url.password || ''),
        options: { encrypt: false, trustServerCertificate: true },
    }
}

// ============================================================================
// Schema query
// ============================================================================

const SCHEMA_QUERY = `
SELECT
    d.NAME        AS db_name,
    t.TBL_NAME    AS table_name,
    c.COLUMN_NAME AS col_name,
    c.TYPE_NAME   AS col_type,
    c.INTEGER_IDX AS col_idx,
    'column'      AS col_source
FROM DBS d
JOIN TBLS t ON t.DB_ID = d.DB_ID
JOIN SDS s ON s.SD_ID = t.SD_ID
JOIN COLUMNS_V2 c ON c.CD_ID = s.CD_ID

UNION ALL

SELECT
    d.NAME        AS db_name,
    t.TBL_NAME    AS table_name,
    pk.PKEY_NAME  AS col_name,
    pk.PKEY_TYPE  AS col_type,
    pk.INTEGER_IDX + 10000 AS col_idx,
    'partition'   AS col_source
FROM DBS d
JOIN TBLS t ON t.DB_ID = d.DB_ID
JOIN PARTITION_KEYS pk ON pk.TBL_ID = t.TBL_ID

ORDER BY db_name, table_name, col_idx
`

/**
 * Names-only query — returns just database + table identifiers, no
 * columns. This is what page load uses; column schemas are loaded
 * on-demand per-table via Livy.
 *
 * The two-table JOIN runs in sub-second time on a Hive metastore with
 * thousands of tables — no SDS / COLUMNS_V2 / PARTITION_KEYS scan.
 */
const NAMES_ONLY_QUERY = `
SELECT
    d.NAME     AS db_name,
    t.TBL_NAME AS table_name
FROM DBS d
JOIN TBLS t ON t.DB_ID = d.DB_ID
ORDER BY db_name, table_name
`

// ============================================================================
// Row → Tree transformation
// ============================================================================

/**
 * Transform flat query rows into the nested MetastoreSchema tree.
 * Exported for testability.
 */
export function buildSchemaTree(rows: MetastoreRow[]): MetastoreSchema {
    const dbMap = new Map<string, Map<string, ColumnInfo[]>>()

    for (const row of rows) {
        let tableMap = dbMap.get(row.db_name)
        if (!tableMap) {
            tableMap = new Map()
            dbMap.set(row.db_name, tableMap)
        }

        let columns = tableMap.get(row.table_name)
        if (!columns) {
            columns = []
            tableMap.set(row.table_name, columns)
        }

        columns.push({
            name: row.col_name,
            type: row.col_type,
        })
    }

    const databases: MetastoreDatabase[] = []
    for (const [dbName, tableMap] of dbMap) {
        const tables: MetastoreTable[] = []
        for (const [tableName, columns] of tableMap) {
            tables.push({ name: tableName, columns })
        }
        tables.sort((a, b) => a.name.localeCompare(b.name))
        databases.push({ name: dbName, tables })
    }
    databases.sort((a, b) => a.name.localeCompare(b.name))

    return { databases }
}

/**
 * Transform names-only query rows into a MetastoreSchema where every
 * table has an empty `columns: []`. Sorts databases and tables
 * alphabetically. Exported for testability.
 */
export function buildNamesOnlyTree(rows: NamesOnlyRow[]): MetastoreSchema {
    const dbMap = new Map<string, MetastoreTable[]>()

    for (const row of rows) {
        let tables = dbMap.get(row.db_name)
        if (!tables) {
            tables = []
            dbMap.set(row.db_name, tables)
        }
        tables.push({ name: row.table_name, columns: [] })
    }

    const databases: MetastoreDatabase[] = []
    for (const [dbName, tables] of dbMap) {
        tables.sort((a, b) => a.name.localeCompare(b.name))
        databases.push({ name: dbName, tables })
    }
    databases.sort((a, b) => a.name.localeCompare(b.name))

    return { databases }
}

// ============================================================================
// Metastore Service
// ============================================================================

export class MetastoreService {
    private config: sql.config
    private pool: sql.ConnectionPool | null = null

    constructor(connectionUrl: string) {
        this.config = parseConnectionUrl(connectionUrl)
    }

    private async getPool(): Promise<sql.ConnectionPool> {
        if (!this.pool || !this.pool.connected) {
            this.pool = await new sql.ConnectionPool(this.config).connect()
        }
        return this.pool
    }

    /**
     * Test whether the metastore is reachable.
     */
    async testConnection(): Promise<boolean> {
        try {
            const pool = await this.getPool()
            await pool.request().query('SELECT 1')
            return true
        } catch {
            return false
        }
    }

    /**
     * Get the full schema tree in a single query.
     */
    async getSchema(): Promise<MetastoreSchema> {
        const pool = await this.getPool()
        const result = await pool.request().query<MetastoreRow>(SCHEMA_QUERY)
        return buildSchemaTree(result.recordset)
    }

    /**
     * Get the full schema tree with progress callbacks.
     */
    async getSchemaWithProgress(onProgress: ProgressCallback): Promise<MetastoreSchema> {
        onProgress('Connecting to metastore SQL Server…')

        const pool = await this.getPool()
        onProgress('Querying metastore schema (single query)…')

        const result = await pool.request().query<MetastoreRow>(SCHEMA_QUERY)
        onProgress(`Received ${result.recordset.length} rows, building schema tree…`)

        const schema = buildSchemaTree(result.recordset)

        const tableCount = schema.databases.reduce((sum, db) => sum + db.tables.length, 0)
        onProgress(`Metastore discovery complete — ${schema.databases.length} databases, ${tableCount} tables`)

        return schema
    }

    /**
     * Get a names-only tree (database + table names, no columns). Page
     * load uses this — it's a tiny `DBS ⋈ TBLS` JOIN that typically
     * returns in well under a second. Column schemas are loaded
     * on-demand per-table via the Livy `DESCRIBE` endpoint.
     */
    async getNamesOnly(): Promise<MetastoreSchema> {
        const pool = await this.getPool()
        const result = await pool.request().query<NamesOnlyRow>(NAMES_ONLY_QUERY)
        return buildNamesOnlyTree(result.recordset)
    }

    /**
     * Get a names-only tree with progress callbacks (page-load entry point).
     */
    async getNamesWithProgress(onProgress: ProgressCallback): Promise<MetastoreSchema> {
        onProgress('Connecting to metastore SQL Server…')

        const pool = await this.getPool()
        onProgress('Querying metastore for database and table names…')

        const result = await pool.request().query<NamesOnlyRow>(NAMES_ONLY_QUERY)
        const schema = buildNamesOnlyTree(result.recordset)

        const tableCount = schema.databases.reduce((sum, db) => sum + db.tables.length, 0)
        onProgress(`Discovered ${schema.databases.length} databases, ${tableCount} tables (column schemas are loaded on-demand per table)`)

        return schema
    }

    /**
     * Close the connection pool.
     */
    async close(): Promise<void> {
        if (this.pool) {
            await this.pool.close()
            this.pool = null
        }
    }
}

// ============================================================================
// Singleton
// ============================================================================

const DEFAULT_METASTORE_URL = Buffer.from('bXNzcWw6Ly9zYTpIaXZlJTQwUGFzczEyM0Bob3N0LmRvY2tlci5pbnRlcm5hbDoxMTQzNC9tZXRhc3RvcmU=', 'base64').toString('utf-8')

let instance: MetastoreService | null = null

/**
 * Get the MetastoreService singleton.
 * Uses METASTORE_URL env var if set, otherwise defaults to the local
 * docker SQL Server metastore.
 */
export function getMetastoreService(): MetastoreService {
    if (!instance) {
        const url = process.env.METASTORE_URL || DEFAULT_METASTORE_URL
        instance = new MetastoreService(url)
    }
    return instance
}

/**
 * Reset the singleton (for testing).
 */
export function resetMetastoreService(): void {
    if (instance) {
        instance.close().catch(() => {})
    }
    instance = null
}
