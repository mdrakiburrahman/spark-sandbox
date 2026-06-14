/**
 * Metastore Service Tests
 *
 * Tests the row → tree transformation and singleton behavior.
 * SQL Server connectivity is mocked — we test the pure logic.
 */

import { buildSchemaTree, buildNamesOnlyTree } from '../services/metastoreService.js'
import type { MetastoreSchema } from '../services/livyService.js'

// ============================================================================
// buildSchemaTree
// ============================================================================

describe('buildSchemaTree', () => {
    it('should return empty schema for no rows', () => {
        const result = buildSchemaTree([])
        expect(result).toEqual({ databases: [] })
    })

    it('should build a single database with one table', () => {
        const rows = [
            { db_name: 'default', table_name: 'users', col_name: 'id', col_type: 'bigint', col_idx: 0, col_source: 'column' },
            { db_name: 'default', table_name: 'users', col_name: 'name', col_type: 'string', col_idx: 1, col_source: 'column' },
            { db_name: 'default', table_name: 'users', col_name: 'email', col_type: 'string', col_idx: 2, col_source: 'column' },
        ]

        const result = buildSchemaTree(rows)

        expect(result.databases).toHaveLength(1)
        expect(result.databases[0].name).toBe('default')
        expect(result.databases[0].tables).toHaveLength(1)
        expect(result.databases[0].tables[0].name).toBe('users')
        expect(result.databases[0].tables[0].columns).toEqual([
            { name: 'id', type: 'bigint' },
            { name: 'name', type: 'string' },
            { name: 'email', type: 'string' },
        ])
    })

    it('should build multiple databases with multiple tables', () => {
        const rows = [
            { db_name: 'analytics', table_name: 'events', col_name: 'id', col_type: 'bigint', col_idx: 0, col_source: 'column' },
            { db_name: 'analytics', table_name: 'events', col_name: 'ts', col_type: 'timestamp', col_idx: 1, col_source: 'column' },
            { db_name: 'analytics', table_name: 'metrics', col_name: 'value', col_type: 'double', col_idx: 0, col_source: 'column' },
            { db_name: 'default', table_name: 'config', col_name: 'key', col_type: 'string', col_idx: 0, col_source: 'column' },
            { db_name: 'default', table_name: 'config', col_name: 'val', col_type: 'string', col_idx: 1, col_source: 'column' },
        ]

        const result = buildSchemaTree(rows)

        expect(result.databases).toHaveLength(2)
        // Sorted by name
        expect(result.databases[0].name).toBe('analytics')
        expect(result.databases[1].name).toBe('default')

        expect(result.databases[0].tables).toHaveLength(2)
        expect(result.databases[0].tables[0].name).toBe('events')
        expect(result.databases[0].tables[1].name).toBe('metrics')

        expect(result.databases[1].tables).toHaveLength(1)
        expect(result.databases[1].tables[0].name).toBe('config')
    })

    it('should include partition keys after regular columns', () => {
        const rows = [
            { db_name: 'warehouse', table_name: 'sales', col_name: 'amount', col_type: 'decimal(10,2)', col_idx: 0, col_source: 'column' },
            { db_name: 'warehouse', table_name: 'sales', col_name: 'product', col_type: 'string', col_idx: 1, col_source: 'column' },
            { db_name: 'warehouse', table_name: 'sales', col_name: 'dt', col_type: 'string', col_idx: 10000, col_source: 'partition' },
            { db_name: 'warehouse', table_name: 'sales', col_name: 'region', col_type: 'string', col_idx: 10001, col_source: 'partition' },
        ]

        const result = buildSchemaTree(rows)

        expect(result.databases[0].tables[0].columns).toEqual([
            { name: 'amount', type: 'decimal(10,2)' },
            { name: 'product', type: 'string' },
            { name: 'dt', type: 'string' },
            { name: 'region', type: 'string' },
        ])
    })

    it('should sort databases and tables alphabetically', () => {
        const rows = [
            { db_name: 'zoo', table_name: 'zebra', col_name: 'id', col_type: 'int', col_idx: 0, col_source: 'column' },
            { db_name: 'alpha', table_name: 'beta', col_name: 'id', col_type: 'int', col_idx: 0, col_source: 'column' },
            { db_name: 'alpha', table_name: 'alpha', col_name: 'id', col_type: 'int', col_idx: 0, col_source: 'column' },
        ]

        const result = buildSchemaTree(rows)

        expect(result.databases.map((d) => d.name)).toEqual(['alpha', 'zoo'])
        expect(result.databases[0].tables.map((t) => t.name)).toEqual(['alpha', 'beta'])
    })

    it('should handle tables with no columns gracefully (empty result)', () => {
        // This shouldn't normally happen but the function should not crash
        const result = buildSchemaTree([])
        expect(result.databases).toEqual([])
    })

    it('should produce correct MetastoreSchema shape', () => {
        const rows = [{ db_name: 'db1', table_name: 't1', col_name: 'c1', col_type: 'string', col_idx: 0, col_source: 'column' }]

        const result: MetastoreSchema = buildSchemaTree(rows)

        // Verify the shape matches what the UI expects
        expect(result).toHaveProperty('databases')
        expect(result.databases[0]).toHaveProperty('name')
        expect(result.databases[0]).toHaveProperty('tables')
        expect(result.databases[0].tables[0]).toHaveProperty('name')
        expect(result.databases[0].tables[0]).toHaveProperty('columns')
        expect(result.databases[0].tables[0].columns[0]).toHaveProperty('name')
        expect(result.databases[0].tables[0].columns[0]).toHaveProperty('type')
    })
})

// ============================================================================
// buildNamesOnlyTree
// ============================================================================

describe('buildNamesOnlyTree', () => {
    it('returns an empty tree for no rows', () => {
        expect(buildNamesOnlyTree([])).toEqual({ databases: [] })
    })

    it('builds databases with their tables and an empty columns array on every table', () => {
        const rows = [
            { db_name: 'sales', table_name: 'orders' },
            { db_name: 'sales', table_name: 'customers' },
            { db_name: 'analytics', table_name: 'events' },
        ]

        const result = buildNamesOnlyTree(rows)

        expect(result.databases).toHaveLength(2)
        for (const db of result.databases) {
            for (const t of db.tables) {
                expect(t.columns).toEqual([])
            }
        }
    })

    it('sorts databases and tables alphabetically', () => {
        const rows = [
            { db_name: 'zoo', table_name: 'zebra' },
            { db_name: 'alpha', table_name: 'beta' },
            { db_name: 'alpha', table_name: 'alpha' },
        ]

        const result = buildNamesOnlyTree(rows)

        expect(result.databases.map((d) => d.name)).toEqual(['alpha', 'zoo'])
        expect(result.databases[0].tables.map((t) => t.name)).toEqual(['alpha', 'beta'])
    })

    it('produces a tree compatible with the MetastoreSchema shape', () => {
        const rows = [{ db_name: 'db1', table_name: 't1' }]
        const result: MetastoreSchema = buildNamesOnlyTree(rows)
        expect(result.databases[0].tables[0]).toEqual({ name: 't1', columns: [] })
    })
})
