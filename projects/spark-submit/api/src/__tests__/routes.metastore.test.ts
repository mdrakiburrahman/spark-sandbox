/**
 * Tests for the metastore endpoints.
 *
 * - `GET /api/sql/metastore` is the page-load route: names-only, no Livy.
 * - `GET /api/sql/metastore/databases/:db/tables/:table` always invokes Livy
 *   and must propagate client disconnect through the AbortController so an
 *   aborted fetch stops further DESCRIBE calls from being submitted.
 */

import request from 'supertest'
import { createApp } from '../app.js'
import { setConfig, clearConfig } from '../services/configService.js'
import { resetExecutionService, getExecutionService } from '../services/executionService.js'
import { getLivyService, resetLivyService, quoteIdent } from '../services/livyService.js'
import { getMetastoreService, resetMetastoreService } from '../services/metastoreService.js'
import type { JobsConfig } from '../types.js'
import type { Express } from 'express'

const createTestConfig = (): JobsConfig => ({
    defaults: {
        sparkHome: '/spark',
        sparkConfDir: '/conf',
        ivyDir: '/ivy',
        tempDir: '/tmp',
        heapDumpDir: '/dumps',
        logsDir: '/logs',
    },
    additionalJars: [],
    modules: { module1: { jarPath: '/jars/module1.jar' } },
    sparkConfigSets: { default: {} },
    jobs: {},
})

/** Patch the singleton's methods so we never touch real Livy. */
function patchLivy(
    overrides: Partial<{
        describeTable: (db: string, table: string) => Promise<unknown>
    }>
): void {
    const livy = getLivyService() as unknown as Record<string, unknown>
    if (overrides.describeTable) livy.describeTable = overrides.describeTable
}

/** Install a stub on the LivyService singleton that fails the test if invoked. */
function forbidLivy(): void {
    const livy = getLivyService() as unknown as Record<string, unknown>
    const fail = () => {
        throw new Error('Livy must NOT be invoked from GET /api/sql/metastore')
    }
    livy.describeTable = fail
    ;(livy as { getDatabases?: unknown }).getDatabases = fail
    ;(livy as { getTables?: unknown }).getTables = fail
    ;(livy as { getOrCreateSession?: unknown }).getOrCreateSession = fail
}

/** Patch the MetastoreService singleton so we never touch real SQL Server. */
function patchMetastore(
    overrides: Partial<{
        getNamesOnly: () => Promise<unknown>
        getNamesWithProgress: (onProgress: (msg: string) => void) => Promise<unknown>
    }>
): void {
    const ms = getMetastoreService() as unknown as Record<string, unknown>
    if (overrides.getNamesOnly) ms.getNamesOnly = overrides.getNamesOnly
    if (overrides.getNamesWithProgress) ms.getNamesWithProgress = overrides.getNamesWithProgress
}

/** Parse `data: {...}\n\n` SSE frames out of a response body. */
function parseSseFrames(body: string): { type: string; data: unknown }[] {
    const frames: { type: string; data: unknown }[] = []
    for (const block of body.split(/\r?\n\r?\n/)) {
        const dataLines = block
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trimStart())
        if (dataLines.length === 0) continue
        try {
            const parsed = JSON.parse(dataLines.join('\n')) as { type: string; data: unknown }
            frames.push(parsed)
        } catch {
            // skip unparseable frames
        }
    }
    return frames
}

describe('Metastore endpoints', () => {
    let app: Express

    beforeEach(() => {
        setConfig(createTestConfig())
        getExecutionService('/project/root')
        app = createApp()
    })

    afterEach(() => {
        resetExecutionService()
        clearConfig()
        resetLivyService()
        resetMetastoreService()
    })

    // ========================================================================
    // GET /api/sql/metastore — names-only, must not invoke Livy
    // ========================================================================

    describe('GET /api/sql/metastore', () => {
        const namesOnlyResult = {
            databases: [
                {
                    name: 'analytics',
                    tables: [
                        { name: 'events', columns: [] },
                        { name: 'sessions', columns: [] },
                    ],
                },
                {
                    name: 'sales',
                    tables: [{ name: 'orders', columns: [] }],
                },
            ],
        }

        it('streams progress and a complete event carrying the names-only tree (SSE)', async () => {
            forbidLivy()
            patchMetastore({
                getNamesWithProgress: async (onProgress) => {
                    onProgress('Connecting to metastore SQL Server…')
                    onProgress('Discovered 2 databases, 3 tables (column schemas are loaded on-demand per table)')
                    return namesOnlyResult
                },
            })

            const response = await request(app).get('/api/sql/metastore').set('Accept', 'text/event-stream')

            expect(response.status).toBe(200)
            expect(response.headers['content-type']).toMatch(/text\/event-stream/)
            const frames = parseSseFrames(response.text)
            const types = frames.map((f) => f.type)
            expect(types).toContain('progress')
            expect(types).toContain('complete')
            const completeFrame = frames.find((f) => f.type === 'complete')!
            expect(completeFrame.data).toEqual(namesOnlyResult)
            for (const db of (completeFrame.data as typeof namesOnlyResult).databases) {
                for (const t of db.tables) {
                    expect(t.columns).toEqual([])
                }
            }
        })

        it('returns names-only JSON when SSE is not requested', async () => {
            forbidLivy()
            patchMetastore({ getNamesOnly: async () => namesOnlyResult })

            const response = await request(app).get('/api/sql/metastore')

            expect(response.status).toBe(200)
            expect(response.body).toEqual({ success: true, data: namesOnlyResult })
            for (const db of response.body.data.databases) {
                for (const t of db.tables) {
                    expect(t.columns).toEqual([])
                }
            }
        })

        it('returns 500 JSON on metastore failure', async () => {
            forbidLivy()
            patchMetastore({
                getNamesOnly: async () => {
                    throw new Error('SQL Server unreachable')
                },
            })

            const response = await request(app).get('/api/sql/metastore')

            expect(response.status).toBe(500)
            expect(response.body.success).toBe(false)
            expect(response.body.error).toContain('SQL Server unreachable')
        })
    })

    // ========================================================================
    // GET /api/sql/metastore/databases/:db/tables/:table
    // ========================================================================

    describe('GET /api/sql/metastore/databases/:db/tables/:table', () => {
        it('streams complete event with table columns (SSE)', async () => {
            const columns = [
                { name: 'id', type: 'int' },
                { name: 'name', type: 'string' },
            ]
            patchLivy({
                describeTable: async (db, table) => {
                    expect(db).toBe('sales')
                    expect(table).toBe('orders')
                    return columns
                },
            })

            const response = await request(app).get('/api/sql/metastore/databases/sales/tables/orders').set('Accept', 'text/event-stream')

            expect(response.status).toBe(200)
            const frames = parseSseFrames(response.text)
            const completeFrame = frames.find((f) => f.type === 'complete')
            expect(completeFrame).toBeDefined()
            expect(completeFrame!.data).toEqual({ name: 'orders', columns })
        })

        it('returns JSON when SSE is not requested', async () => {
            const columns = [{ name: 'id', type: 'int' }]
            patchLivy({ describeTable: async () => columns })

            const response = await request(app).get('/api/sql/metastore/databases/sales/tables/orders')

            expect(response.status).toBe(200)
            expect(response.body).toEqual({
                success: true,
                data: { name: 'orders', columns },
            })
        })

        it('returns SSE error frame on Livy failure', async () => {
            patchLivy({
                describeTable: async () => {
                    throw new Error('table not found')
                },
            })

            const response = await request(app).get('/api/sql/metastore/databases/sales/tables/orders').set('Accept', 'text/event-stream')

            const frames = parseSseFrames(response.text)
            const errFrame = frames.find((f) => f.type === 'error') as { type: string; data: { message: string } } | undefined
            expect(errFrame).toBeDefined()
            expect(errFrame!.data.message).toContain('table not found')
        })

        it('URL-decodes both :db and :table params when passed encoded', async () => {
            let receivedDb = ''
            let receivedTable = ''
            patchLivy({
                describeTable: async (db, table) => {
                    receivedDb = db
                    receivedTable = table
                    return []
                },
            })
            await request(app).get('/api/sql/metastore/databases/db%2Bone/tables/t%2Btwo')
            expect(receivedDb).toBe('db+one')
            expect(receivedTable).toBe('t+two')
        })
    })

    // ========================================================================
    // quoteIdent
    // ========================================================================

    describe('quoteIdent', () => {
        it('wraps a plain name in backticks', () => {
            expect(quoteIdent('orders')).toBe('`orders`')
        })
        it('doubles embedded backticks', () => {
            expect(quoteIdent('weird`name')).toBe('`weird``name`')
        })
        it('handles names with dots (e.g. reserved-looking identifiers)', () => {
            expect(quoteIdent('my.db')).toBe('`my.db`')
        })
        it('handles empty string', () => {
            expect(quoteIdent('')).toBe('``')
        })
    })
})
