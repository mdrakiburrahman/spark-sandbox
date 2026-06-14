/**
 * Unit tests for the pure schema-merge helpers used by SchemaBrowser.
 */

import { mergeTable, buildSchemaMap, type MetastoreDatabase } from '../schemaMerge'

const db = (name: string, tables: { name: string; cols: string[] }[]): MetastoreDatabase => ({
    name,
    tables: tables.map((t) => ({
        name: t.name,
        columns: t.cols.map((c) => ({ name: c, type: 'string' })),
    })),
})

describe('mergeTable', () => {
    it('replaces a matching table inside the matching DB', () => {
        const prev = [
            db('a', [
                { name: 't1', cols: ['x'] },
                { name: 't2', cols: ['y'] },
            ]),
        ]
        const newT2 = {
            name: 't2',
            columns: [
                { name: 'y', type: 'string' },
                { name: 'z', type: 'int' },
            ],
        }

        const next = mergeTable(prev, 'a', newT2)

        expect(next[0].tables.map((t) => t.name)).toEqual(['t1', 't2'])
        expect(next[0].tables[1].columns.map((c) => c.name)).toEqual(['y', 'z'])
        expect(next[0].tables[0]).toBe(prev[0].tables[0])
    })

    it('inserts a new table and re-sorts siblings alphabetically', () => {
        const prev = [
            db('a', [
                { name: 'a_first', cols: ['x'] },
                { name: 'c_third', cols: ['z'] },
            ]),
        ]
        const newMid = { name: 'b_second', columns: [{ name: 'm', type: 'int' }] }

        const next = mergeTable(prev, 'a', newMid)

        expect(next[0].tables.map((t) => t.name)).toEqual(['a_first', 'b_second', 'c_third'])
    })

    it('returns prev unchanged if the DB is missing', () => {
        const prev = [db('a', [{ name: 't1', cols: ['x'] }])]
        const next = mergeTable(prev, 'nonexistent', { name: 't1', columns: [] })
        expect(next).toBe(prev)
    })

    it('does not modify the original input arrays', () => {
        const prev = [
            db('a', [
                { name: 't1', cols: ['x'] },
                { name: 't2', cols: ['y'] },
            ]),
        ]
        const snapshot = JSON.parse(JSON.stringify(prev))

        mergeTable(prev, 'a', { name: 't2', columns: [{ name: 'completely_different', type: 'int' }] })

        expect(prev).toEqual(snapshot)
    })
})

describe('buildSchemaMap', () => {
    it('flattens the databases tree into a {"db.table": [columns]} map', () => {
        const dbs = [
            db('sales', [
                { name: 'orders', cols: ['id', 'amount'] },
                { name: 'customers', cols: ['id', 'name'] },
            ]),
            db('analytics', [{ name: 'events', cols: ['ts', 'kind'] }]),
        ]

        const map = buildSchemaMap(dbs)

        expect(map).toEqual({
            'sales.orders': ['id', 'amount'],
            'sales.customers': ['id', 'name'],
            'analytics.events': ['ts', 'kind'],
        })
    })

    it('returns an empty object for an empty tree', () => {
        expect(buildSchemaMap([])).toEqual({})
    })
})
