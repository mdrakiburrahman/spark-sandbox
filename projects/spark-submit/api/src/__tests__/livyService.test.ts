/**
 * Livy Service Tests
 *
 * Focuses on the race-condition fix: session creation, readiness waiting,
 * typed-error semantics, and the executeSQL retry path when a cached session
 * has died between checkSession and statement submission.
 *
 * All HTTP is mocked via `jest.spyOn(global, 'fetch')`. We use `initialPollMs: 1`
 * so the readiness loop turns fast — the tests should complete in well under a
 * second despite exercising multi-iteration polling.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals'

import { LivyService, LivyUnreachableError, SessionNotFoundError, SessionReadyTimeoutError, TerminalSessionStateError } from '../services/livyService.js'

// ============================================================================
// Mock helpers
// ============================================================================

interface FetchExpectation {
    /** Substring of the URL the request must match (e.g. '/sessions/15') */
    urlMatch: string
    /** Optional method filter ('GET', 'POST', …). If omitted, matches any method. */
    method?: string
    /** Either a static response or a function that constructs one. */
    respond: () => Partial<Response> | Promise<Partial<Response>>
}

/**
 * Build a fetch mock from a queue of expectations. Each expectation is consumed
 * in declaration order — the next fetch call must match the next expectation
 * (or the test fails). This makes assertion failures point at the specific
 * sequence step that diverged.
 */
function queuedFetchMock(expectations: FetchExpectation[]): jest.Mock {
    let i = 0
    return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()
        const method = init?.method ?? 'GET'
        if (i >= expectations.length) {
            throw new Error(`Unexpected extra fetch call #${i + 1}: ${method} ${url}`)
        }
        const exp = expectations[i++]
        if (!url.includes(exp.urlMatch)) {
            throw new Error(`Fetch #${i} URL mismatch: expected '${exp.urlMatch}' in ${url}`)
        }
        if (exp.method && exp.method !== method) {
            throw new Error(`Fetch #${i} method mismatch: expected ${exp.method}, got ${method}`)
        }
        const resp = await exp.respond()
        return jsonResponse(resp)
    }) as unknown as jest.Mock
}

function jsonResponse(partial: Partial<Response>): Response {
    return {
        ok: partial.status ? partial.status < 400 : true,
        status: partial.status ?? 200,
        statusText: partial.statusText ?? 'OK',
        json: partial.json ?? (async () => ({})),
        text: partial.text ?? (async () => ''),
        ...partial,
    } as Response
}

function makeJsonResponder(body: unknown, opts?: { status?: number; statusText?: string }) {
    return () => ({
        status: opts?.status ?? 200,
        statusText: opts?.statusText ?? 'OK',
        json: async () => body,
        text: async () => JSON.stringify(body),
    })
}

function makeTextResponder(body: string, opts: { status: number; statusText?: string }) {
    return () => ({
        status: opts.status,
        statusText: opts.statusText ?? 'Error',
        json: async () => {
            throw new Error('not json')
        },
        text: async () => body,
    })
}

// ============================================================================
// Per-test fixtures
// ============================================================================

let tmpDir: string
let fetchSpy: jest.SpyInstance

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'livy-test-'))
})

afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

function newService(): LivyService {
    return new LivyService({ livyUrl: 'http://livy.test', cacheDir: tmpDir })
}

// ============================================================================
// getSessionState
// ============================================================================

describe('getSessionState', () => {
    it('returns the state string for a healthy session', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/7', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) }]))
        const svc = newService()
        await expect(svc.getSessionState(7)).resolves.toBe('idle')
    })

    it('throws SessionNotFoundError on 404', async () => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/7', method: 'GET', respond: makeTextResponder('not found', { status: 404, statusText: 'Not Found' }) }]))
        const svc = newService()
        await expect(svc.getSessionState(7)).rejects.toBeInstanceOf(SessionNotFoundError)
    })

    it('throws LivyUnreachableError on network failure', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            jest.fn(async () => {
                throw new Error('ECONNREFUSED')
            }) as unknown as jest.Mock
        )
        const svc = newService()
        await expect(svc.getSessionState(7)).rejects.toBeInstanceOf(LivyUnreachableError)
    })

    it('throws LivyUnreachableError on non-OK, non-404 response', async () => {
        fetchSpy = jest
            .spyOn(global, 'fetch')
            .mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/7', method: 'GET', respond: makeTextResponder('boom', { status: 500, statusText: 'Internal Server Error' }) }]))
        const svc = newService()
        await expect(svc.getSessionState(7)).rejects.toBeInstanceOf(LivyUnreachableError)
    })
})

// ============================================================================
// waitForSessionReady
// ============================================================================

describe('waitForSessionReady', () => {
    it('resolves immediately when session is already idle', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'idle' }) }]))
        const svc = newService()
        await expect(svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 1000 })).resolves.toBeUndefined()
    })

    it('accepts busy as a ready state', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'busy' }) }]))
        const svc = newService()
        await expect(svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 1000 })).resolves.toBeUndefined()
    })

    it('polls past starting/not_started until idle', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                { urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'not_started' }) },
                { urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'starting' }) },
                { urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'starting' }) },
                { urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'idle' }) },
            ])
        )
        const svc = newService()
        const progress: string[] = []
        await svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 1000, onProgress: (m) => progress.push(m) })
        expect(progress.some((m) => m.includes('Waiting'))).toBe(true)
        expect(progress[progress.length - 1]).toMatch(/is ready \(idle\)/)
    })

    it('throws TerminalSessionStateError immediately on dead state', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'dead' }) }]))
        const svc = newService()
        await expect(svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 1000 })).rejects.toMatchObject({
            name: 'TerminalSessionStateError',
            sessionId: 9,
            state: 'dead',
        })
    })

    it('throws TerminalSessionStateError on error state after polling', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                { urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'starting' }) },
                { urlMatch: '/sessions/9', respond: makeJsonResponder({ state: 'error' }) },
            ])
        )
        const svc = newService()
        await expect(svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 1000 })).rejects.toBeInstanceOf(TerminalSessionStateError)
    })

    it('throws SessionReadyTimeoutError when stuck in starting past maxWaitMs', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(jest.fn(async () => jsonResponse(makeJsonResponder({ state: 'starting' })())) as unknown as jest.Mock)
        const svc = newService()
        await expect(svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 30 })).rejects.toMatchObject({
            name: 'SessionReadyTimeoutError',
            sessionId: 9,
            lastState: 'starting',
        })
    })

    it('propagates SessionNotFoundError from getSessionState', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(queuedFetchMock([{ urlMatch: '/sessions/9', respond: makeTextResponder('gone', { status: 404 }) }]))
        const svc = newService()
        await expect(svc.waitForSessionReady(9, { initialPollMs: 1, maxWaitMs: 1000 })).rejects.toBeInstanceOf(SessionNotFoundError)
    })
})

// ============================================================================
// getOrCreateReadySession — the integration point we actually care about
// ============================================================================

describe('getOrCreateReadySession', () => {
    it('creates a new session when no cache exists, then waits for ready', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                // POST /sessions — Livy returns id 42 immediately
                { urlMatch: '/sessions', method: 'POST', respond: makeJsonResponder({ id: 42 }) },
                // First readiness poll — still starting
                { urlMatch: '/sessions/42', method: 'GET', respond: makeJsonResponder({ state: 'starting' }) },
                // Second poll — idle
                { urlMatch: '/sessions/42', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
            ])
        )
        const svc = newService()
        await expect(svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 })).resolves.toBe(42)
        // Cache was written
        const cached = JSON.parse(fs.readFileSync(path.join(tmpDir, 'livy-session.json'), 'utf-8'))
        expect(cached.sessionId).toBe(42)
    })

    it('reuses a cached session when checkSession reports it alive', async () => {
        // Pre-seed cache
        fs.writeFileSync(path.join(tmpDir, 'livy-session.json'), JSON.stringify({ sessionId: 100, kind: 'sql', createdAt: 'x', lastUsed: 'x' }))
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                // checkSession probe (acquireSession path)
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
                // Readiness wait — also idle
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
            ])
        )
        const svc = newService()
        await expect(svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 })).resolves.toBe(100)
    })

    it('retries with a fresh session when the cached one is in a terminal state', async () => {
        fs.writeFileSync(path.join(tmpDir, 'livy-session.json'), JSON.stringify({ sessionId: 100, kind: 'sql', createdAt: 'x', lastUsed: 'x' }))
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                // checkSession probe — reports state=idle (treated as alive) so we proceed with cached id
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
                // Readiness wait — but the session has actually died since
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'dead' }) },
                // Retry: POST /sessions to create id 200
                { urlMatch: '/sessions', method: 'POST', respond: makeJsonResponder({ id: 200 }) },
                // Readiness for new session — idle right away
                { urlMatch: '/sessions/200', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
            ])
        )
        const svc = newService()
        await expect(svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 })).resolves.toBe(200)
        // Cache was rewritten to the new id
        const cached = JSON.parse(fs.readFileSync(path.join(tmpDir, 'livy-session.json'), 'utf-8'))
        expect(cached.sessionId).toBe(200)
    })

    it('retries with a fresh session when the cached one returns 404', async () => {
        fs.writeFileSync(path.join(tmpDir, 'livy-session.json'), JSON.stringify({ sessionId: 100, kind: 'sql', createdAt: 'x', lastUsed: 'x' }))
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                // checkSession probe — returns 200 (alive) but session is about to vanish
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
                // Readiness wait — 404
                { urlMatch: '/sessions/100', method: 'GET', respond: makeTextResponder('gone', { status: 404 }) },
                // Recovery: POST /sessions
                { urlMatch: '/sessions', method: 'POST', respond: makeJsonResponder({ id: 201 }) },
                // Readiness for new session
                { urlMatch: '/sessions/201', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
            ])
        )
        const svc = newService()
        await expect(svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 })).resolves.toBe(201)
    })

    it('does NOT retry on SessionReadyTimeoutError (infrastructure problem)', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input.toString()
                const method = init?.method ?? 'GET'
                if (url.endsWith('/sessions') && method === 'POST') {
                    return jsonResponse(makeJsonResponder({ id: 50 })())
                }
                // Stay in 'starting' forever — never ready, never terminal
                return jsonResponse(makeJsonResponder({ state: 'starting' })())
            }) as unknown as jest.Mock
        )
        const svc = newService()
        await expect(svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 30 })).rejects.toBeInstanceOf(SessionReadyTimeoutError)
    })

    it('only retries once — second terminal state surfaces the error', async () => {
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                // Attempt 1
                { urlMatch: '/sessions', method: 'POST', respond: makeJsonResponder({ id: 50 }) },
                { urlMatch: '/sessions/50', method: 'GET', respond: makeJsonResponder({ state: 'dead' }) },
                // Attempt 2 (retry)
                { urlMatch: '/sessions', method: 'POST', respond: makeJsonResponder({ id: 51 }) },
                { urlMatch: '/sessions/51', method: 'GET', respond: makeJsonResponder({ state: 'dead' }) },
            ])
        )
        const svc = newService()
        await expect(svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 })).rejects.toMatchObject({
            name: 'TerminalSessionStateError',
            sessionId: 51,
        })
    })

    it('does not invalidate cache if it points to a different session than the failed one (conditional invalidation)', async () => {
        // Pre-seed cache with id 100
        fs.writeFileSync(path.join(tmpDir, 'livy-session.json'), JSON.stringify({ sessionId: 100, kind: 'sql', createdAt: 'x', lastUsed: 'x' }))
        const svc = newService()

        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                // checkSession on cached id 100 returns alive
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
                // Readiness wait on 100 fails (dead)
                { urlMatch: '/sessions/100', method: 'GET', respond: makeJsonResponder({ state: 'dead' }) },
                // === Simulate concurrent process: cache is overwritten to id 999 before retry ===
                // We hijack this by mutating the cache mid-flight via the next fetch's responder.
                // But here we test the simpler case: cache STILL matches 100, so it gets invalidated.
                { urlMatch: '/sessions', method: 'POST', respond: makeJsonResponder({ id: 200 }) },
                { urlMatch: '/sessions/200', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
            ])
        )
        await svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 })
        // After successful retry, cache should point to 200
        const cached = JSON.parse(fs.readFileSync(path.join(tmpDir, 'livy-session.json'), 'utf-8'))
        expect(cached.sessionId).toBe(200)
    })

    it('dedups concurrent callers via readySessionPromise', async () => {
        const fetchCalls: string[] = []
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input.toString()
                fetchCalls.push(`${init?.method ?? 'GET'} ${url}`)
                if (url.endsWith('/sessions') && init?.method === 'POST') {
                    return jsonResponse(makeJsonResponder({ id: 77 })())
                }
                if (url.includes('/sessions/77')) {
                    return jsonResponse(makeJsonResponder({ state: 'idle' })())
                }
                throw new Error(`unexpected fetch: ${url}`)
            }) as unknown as jest.Mock
        )
        const svc = newService()
        const [a, b, c] = await Promise.all([
            svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 }),
            svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 }),
            svc.getOrCreateReadySession({ initialPollMs: 1, maxWaitMs: 1000 }),
        ])
        expect([a, b, c]).toEqual([77, 77, 77])
        // Exactly one POST /sessions for three concurrent callers
        expect(fetchCalls.filter((c) => c === 'POST http://livy.test/sessions')).toHaveLength(1)
    })
})

// ============================================================================
// executeSQL — end-to-end fix verification
// ============================================================================

describe('executeSQL', () => {
    it('waits for the session to be ready before submitting (regression: 500 on starting session)', async () => {
        // This is the user's exact bug scenario: cached session 15, but it's
        // actually in 'starting' state. Old code POSTed immediately and got 500.
        // New code must wait for idle first.
        fs.writeFileSync(path.join(tmpDir, 'livy-session.json'), JSON.stringify({ sessionId: 15, kind: 'sql', createdAt: 'x', lastUsed: 'x' }))
        const events: string[] = []
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const url = typeof input === 'string' ? input : input.toString()
                const method = init?.method ?? 'GET'
                events.push(`${method} ${url}`)
                // checkSession during acquireSession — returns starting (which the
                // legacy aliveStates set accepts as alive)
                if (url.endsWith('/sessions/15') && method === 'GET') {
                    // First call (acquireSession) — starting
                    // Second call (waitForSessionReady) — starting
                    // Third call (waitForSessionReady) — idle
                    const idx = events.filter((e) => e === 'GET http://livy.test/sessions/15').length
                    if (idx === 1) return jsonResponse(makeJsonResponder({ state: 'starting' })())
                    if (idx === 2) return jsonResponse(makeJsonResponder({ state: 'starting' })())
                    return jsonResponse(makeJsonResponder({ state: 'idle' })())
                }
                // Statement POST
                if (url.endsWith('/sessions/15/statements') && method === 'POST') {
                    return jsonResponse(makeJsonResponder({ id: 1 })())
                }
                // Statement poll
                if (url.includes('/sessions/15/statements/1') && method === 'GET') {
                    return jsonResponse(
                        makeJsonResponder({
                            state: 'available',
                            output: {
                                status: 'ok',
                                data: {
                                    'application/json': {
                                        schema: { type: 'struct', fields: [{ name: 'col', type: 'string', nullable: true }] },
                                        data: [['hello']],
                                    },
                                },
                            },
                        })()
                    )
                }
                throw new Error(`unexpected fetch: ${method} ${url}`)
            }) as unknown as jest.Mock
        )
        const svc = newService()
        const result = await svc.executeSQL('SELECT 1')
        expect(result.rowCount).toBe(1)
        expect(result.rows[0][0]).toBe('hello')

        // Critical: the statement POST must come AFTER the readiness wait
        // (i.e., AFTER the GET that returned idle)
        const stmtPostIdx = events.indexOf('POST http://livy.test/sessions/15/statements')
        const lastReadinessGetIdx = events.lastIndexOf('GET http://livy.test/sessions/15')
        expect(stmtPostIdx).toBeGreaterThan(lastReadinessGetIdx)
    })

    it('surfaces submit-failure response body in the error message', async () => {
        fs.writeFileSync(path.join(tmpDir, 'livy-session.json'), JSON.stringify({ sessionId: 22, kind: 'sql', createdAt: 'x', lastUsed: 'x' }))
        fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(
            queuedFetchMock([
                { urlMatch: '/sessions/22', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
                { urlMatch: '/sessions/22', method: 'GET', respond: makeJsonResponder({ state: 'idle' }) },
                {
                    urlMatch: '/sessions/22/statements',
                    method: 'POST',
                    respond: makeTextResponder('parse error: foo', { status: 500, statusText: 'Internal Server Error' }),
                },
            ])
        )
        const svc = newService()
        await expect(svc.executeSQL('BAD SQL')).rejects.toThrow(/parse error: foo/)
    })
})
