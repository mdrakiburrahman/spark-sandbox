/**
 * Pure helpers for merging incremental schema-refresh results into the
 * SchemaBrowser's `databases` tree state.
 *
 * Kept in this file (separate from the React component) so they can be
 * exercised by Jest without rendering the whole component.
 */

export interface MetastoreColumn {
    name: string
    type: string
    nullable?: boolean
}

export interface MetastoreTable {
    name: string
    columns: MetastoreColumn[]
}

export interface MetastoreDatabase {
    name: string
    tables: MetastoreTable[]
}

/**
 * Replace the matching table (by name) inside its DB with `newTable`.
 * If the DB is missing from `prev`, returns `prev` unchanged — the caller's
 * names-only refresh has erased the DB and the scoped refresh result is
 * stale; we deliberately do NOT inject the DB back into the tree to avoid
 * resurrecting a deleted database. If the table is missing from the DB
 * (e.g. new table created since last names refresh), it is added to the DB
 * and sibling tables are re-sorted alphabetically.
 *
 * Preserves sibling DB order.
 */
export function mergeTable(prev: MetastoreDatabase[], dbName: string, newTable: MetastoreTable): MetastoreDatabase[] {
    let dbFound = false
    const next = prev.map((db) => {
        if (db.name !== dbName) return db
        dbFound = true
        let tableFound = false
        const tables = db.tables.map((t) => {
            if (t.name !== newTable.name) return t
            tableFound = true
            return newTable
        })
        if (!tableFound) {
            tables.push(newTable)
            tables.sort((a, b) => a.name.localeCompare(b.name))
        }
        return { ...db, tables }
    })
    return dbFound ? next : prev
}

/**
 * Build the flat `{ "db.table": [columnNames] }` map used by the SQL
 * editor's autocomplete from the nested databases tree.
 */
export function buildSchemaMap(databases: MetastoreDatabase[]): Record<string, string[]> {
    const map: Record<string, string[]> = {}
    for (const db of databases) {
        for (const t of db.tables) {
            map[`${db.name}.${t.name}`] = t.columns.map((c) => c.name)
        }
    }
    return map
}
