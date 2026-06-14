/**
 * Livy Service
 *
 * Centralized Livy session management for the API server.
 * Single entry point for all Livy business logic — both CLI and UI
 * proxy through these endpoints.
 *
 * Manages:
 * - Session lifecycle (create, reuse, cache to disk)
 * - SQL statement execution and polling
 * - Statement cancellation
 * - Metastore discovery (databases, tables, columns)
 */

import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Types
// ============================================================================

export interface ColumnInfo {
    name: string
    type: string
    nullable?: boolean
}

export interface QueryResult {
    statementId: number
    status: string
    columns: ColumnInfo[]
    rows: any[][]
    executionTime: number
    rowCount: number
}

export interface MetastoreTable {
    name: string
    columns: ColumnInfo[]
}

export interface MetastoreDatabase {
    name: string
    tables: MetastoreTable[]
}

export interface MetastoreSchema {
    databases: MetastoreDatabase[]
}

interface CachedSession {
    sessionId: number
    kind: string
    createdAt: string
    lastUsed: string
}

interface LivyField {
    name: string
    type: string | LivyComplexType
    nullable: boolean
}

interface LivyComplexType {
    type: string
    fields?: LivyField[]
    elementType?: string | LivyComplexType
    keyType?: string | LivyComplexType
    valueType?: string | LivyComplexType
    containsNull?: boolean
}

interface LivySchema {
    type: string
    fields: LivyField[]
}

interface LivyStatementOutput {
    status: string
    data?: {
        'application/json'?: {
            schema: LivySchema
            data: any[][]
        }
    }
    evalue?: string
    traceback?: string[]
}

export type ProgressCallback = (message: string) => void

// ============================================================================
// Typed errors — callers can branch on these for precise retry semantics.
// String-matching on `Error.message` is a code smell; use `instanceof` instead.
// ============================================================================

/** The Livy session reached a state from which it cannot recover (dead, error, killed, …). */
export class TerminalSessionStateError extends Error {
    constructor(public readonly sessionId: number, public readonly state: string) {
        super(`Livy session ${sessionId} is in terminal state '${state}'`)
        this.name = 'TerminalSessionStateError'
    }
}

/** Livy returned 404 for the session — it was GC'd or never existed. */
export class SessionNotFoundError extends Error {
    constructor(public readonly sessionId: number) {
        super(`Livy session ${sessionId} not found (404)`)
        this.name = 'SessionNotFoundError'
    }
}

/** Timed out waiting for the session to reach a ready state (idle/busy). */
export class SessionReadyTimeoutError extends Error {
    constructor(public readonly sessionId: number, public readonly lastState: string, public readonly waitedMs: number) {
        super(`Timed out after ${waitedMs}ms waiting for Livy session ${sessionId} to become ready (last state: '${lastState}')`)
        this.name = 'SessionReadyTimeoutError'
    }
}

/** Network/transport failure talking to Livy — distinct from a known protocol response. */
export class LivyUnreachableError extends Error {
    constructor(message: string, public readonly cause?: unknown) {
        super(message)
        this.name = 'LivyUnreachableError'
    }
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Quote a Spark SQL identifier (database, table, column) with backticks,
 * doubling any embedded backticks. Use for any identifier that comes from
 * user input or external sources so reserved words / special characters
 * don't break the SQL.
 */
export function quoteIdent(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``
}

/**
 * Convert a Livy type (string or complex object) to a Spark SQL type string.
 * Livy returns simple types as strings ("string", "timestamp") but complex
 * types as JSON objects (e.g. {type: "struct", fields: [...]}).
 */
export function formatSparkType(t: string | LivyComplexType): string {
    if (typeof t === 'string') return t

    switch (t.type) {
        case 'struct': {
            const fields = (t.fields || []).map((f) => `${f.name}:${formatSparkType(f.type)}`)
            return `struct<${fields.join(',')}>`
        }
        case 'array':
            return `array<${formatSparkType(t.elementType || 'unknown')}>`
        case 'map':
            return `map<${formatSparkType(t.keyType || 'unknown')},${formatSparkType(t.valueType || 'unknown')}>`
        default:
            return t.type || 'unknown'
    }
}

/**
 * Recursively convert Livy's struct representation
 * `{schema: [{name, ...}], values: [...]}` into a plain object
 * `{fieldName: value, ...}` for human-readable display.
 */
function normalizeStructValue(value: any): any {
    if (value === null || value === undefined) return value
    if (typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(normalizeStructValue)

    // Detect Livy struct format: {schema: [{name, ...}], values: [...]}
    if (Array.isArray(value.schema) && Array.isArray(value.values) && value.schema.length === value.values.length && value.schema.every((f: any) => typeof f === 'object' && 'name' in f)) {
        const obj: Record<string, any> = {}
        for (let i = 0; i < value.schema.length; i++) {
            obj[value.schema[i].name] = normalizeStructValue(value.values[i])
        }
        return obj
    }

    // Regular object — recurse into values
    const result: Record<string, any> = {}
    for (const [k, v] of Object.entries(value)) {
        result[k] = normalizeStructValue(v)
    }
    return result
}

// ============================================================================
// Livy Service
// ============================================================================

export class LivyService {
    private livyUrl: string
    private cacheDir: string
    private cacheFile: string
    private lockFile: string
    /** In-flight session acquisition — deduplicates concurrent async callers */
    private sessionPromise: Promise<number> | null = null
    /** In-flight ready-session acquisition — separate guard so a failed readiness
     *  wait can recover with a fresh `getOrCreateSession` cycle without serializing
     *  unrelated session lookups. */
    private readySessionPromise: Promise<number> | null = null

    /** Livy session states where the session can accept new statement submissions.
     *  `busy` is included because Livy queues statements server-side and processes
     *  them sequentially per session — submitting while busy is the intended path
     *  for serializing work over a single SQL session. */
    private static readonly READY_STATES = new Set<string>(['idle', 'busy'])

    /** Terminal Livy states — no future statement can succeed against the session. */
    private static readonly TERMINAL_STATES = new Set<string>(['dead', 'error', 'killed', 'shutting_down', 'gone', 'success'])

    constructor(options?: { livyUrl?: string; cacheDir?: string }) {
        this.livyUrl = options?.livyUrl || process.env.LIVY_URL || 'http://localhost:8998'
        this.cacheDir = options?.cacheDir || path.join(process.cwd(), '.cache')
        this.cacheFile = path.join(this.cacheDir, 'livy-session.json')
        this.lockFile = path.join(this.cacheDir, 'livy-session.lock')
    }

    /**
     * Get or create a Livy SQL session.
     *
     * Returns a session ID as soon as one is known to exist in Livy — does NOT
     * guarantee the session is ready to accept statements. Use
     * `getOrCreateReadySession()` if you need a session you can immediately
     * submit work to.
     *
     * Uses an in-memory promise guard so concurrent in-process callers share the
     * same session acquisition, and a file lock so multiple processes (API + CLI)
     * don't race to create separate Livy sessions.
     */
    async getOrCreateSession(onProgress?: ProgressCallback): Promise<number> {
        if (this.sessionPromise) {
            return this.sessionPromise
        }
        this.sessionPromise = this.acquireSession(onProgress)
        try {
            return await this.sessionPromise
        } finally {
            this.sessionPromise = null
        }
    }

    /**
     * Get or create a Livy SQL session that is ready to accept statement submissions
     * (state ∈ {idle, busy}).
     *
     * Composes `getOrCreateSession` with `waitForSessionReady` and adds a single
     * recovery retry if the cached session is found to be in a terminal state or
     * has been GC'd (404). Does NOT retry on timeout or network errors —
     * those represent infrastructure issues the caller should surface.
     *
     * @param opts.maxWaitMs    Total readiness budget (default 120s).
     * @param opts.initialPollMs Initial poll interval — exponential backoff up to 5s.
     * @param opts.onProgress    Streamed progress messages.
     */
    async getOrCreateReadySession(opts?: { maxWaitMs?: number; initialPollMs?: number; onProgress?: ProgressCallback }): Promise<number> {
        if (this.readySessionPromise) {
            return this.readySessionPromise
        }
        this.readySessionPromise = this.acquireReadySession(opts, false)
        try {
            return await this.readySessionPromise
        } finally {
            this.readySessionPromise = null
        }
    }

    private async acquireReadySession(opts: { maxWaitMs?: number; initialPollMs?: number; onProgress?: ProgressCallback } | undefined, isRetry: boolean): Promise<number> {
        const sessionId = await this.getOrCreateSession(opts?.onProgress)
        try {
            await this.waitForSessionReady(sessionId, opts)
            return sessionId
        } catch (err) {
            const recoverable = err instanceof TerminalSessionStateError || err instanceof SessionNotFoundError
            if (recoverable && !isRetry) {
                opts?.onProgress?.(`Session ${sessionId} unusable (${err.name}) — invalidating cache and recreating…`)
                this.invalidateCacheIfMatches(sessionId)
                return this.acquireReadySession(opts, true)
            }
            throw err
        }
    }

    /**
     * Fetch a Livy session's current state.
     *
     * @throws {SessionNotFoundError} when Livy returns 404 for the session.
     * @throws {LivyUnreachableError} on network errors or non-OK, non-404 responses.
     */
    async getSessionState(id: number): Promise<string> {
        let response: Response
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5_000)
            response = await fetch(`${this.livyUrl}/sessions/${id}`, { signal: controller.signal })
            clearTimeout(timeout)
        } catch (err) {
            throw new LivyUnreachableError(`Failed to reach Livy at ${this.livyUrl}/sessions/${id}`, err)
        }

        if (response.status === 404) {
            throw new SessionNotFoundError(id)
        }
        if (!response.ok) {
            throw new LivyUnreachableError(`Livy returned ${response.status} ${response.statusText} for /sessions/${id}`)
        }

        const data = (await response.json()) as { state: string }
        return data.state
    }

    /**
     * Block until a Livy session is in a READY state (idle or busy) — i.e.,
     * able to accept statement submissions.
     *
     * @throws {TerminalSessionStateError} if the session reaches a terminal state.
     * @throws {SessionNotFoundError}      if Livy returns 404 for the session.
     * @throws {SessionReadyTimeoutError}  if `opts.maxWaitMs` elapses with the
     *         session still warming up (e.g. stuck in `starting`).
     * @throws {LivyUnreachableError}      on network failures.
     */
    async waitForSessionReady(sessionId: number, opts?: { maxWaitMs?: number; initialPollMs?: number; onProgress?: ProgressCallback }): Promise<void> {
        const maxWaitMs = opts?.maxWaitMs ?? 120_000
        let pollInterval = opts?.initialPollMs ?? 500
        const startTime = Date.now()
        let lastState = 'unknown'

        while (Date.now() - startTime < maxWaitMs) {
            const state = await this.getSessionState(sessionId)
            lastState = state

            if (LivyService.READY_STATES.has(state)) {
                opts?.onProgress?.(`Livy session ${sessionId} is ready (${state})`)
                return
            }
            if (LivyService.TERMINAL_STATES.has(state)) {
                throw new TerminalSessionStateError(sessionId, state)
            }

            opts?.onProgress?.(`Waiting for Livy session ${sessionId} (state: ${state})…`)
            await sleep(pollInterval)
            pollInterval = Math.min(pollInterval * 1.5, 5_000)
        }

        throw new SessionReadyTimeoutError(sessionId, lastState, Date.now() - startTime)
    }

    /**
     * Actual session acquisition logic — called at most once at a time
     * within a single process thanks to the promise guard above.
     *
     * Holds the file lock ONLY for cache I/O and the Livy session-create POST.
     * Does NOT wait for the session to become ready inside the lock — that's
     * minutes of waiting that would block every other process from even
     * checking the cache. Readiness is the caller's responsibility (see
     * `getOrCreateReadySession`).
     */
    private async acquireSession(onProgress?: ProgressCallback): Promise<number> {
        const unlock = await this.acquireLock()
        try {
            const cached = this.readCache()

            if (cached) {
                onProgress?.(`Checking cached Livy session ${cached.sessionId}…`)
                const alive = await this.checkSession(cached.sessionId)
                if (alive) {
                    onProgress?.(`Reusing existing Livy session ${cached.sessionId}`)
                    this.writeCache({
                        ...cached,
                        lastUsed: new Date().toISOString(),
                    })
                    return cached.sessionId
                }
                onProgress?.(`Cached session ${cached.sessionId} is dead, creating new one…`)
            }

            onProgress?.('Creating new Livy SQL session…')
            const sessionId = await this.postCreateSession()
            // Write cache immediately (before readiness wait) so any other process
            // waiting on the lock can pick up and reuse this still-starting session
            // instead of asking Livy to spawn yet another one.
            this.writeCache({
                sessionId,
                kind: 'sql',
                createdAt: new Date().toISOString(),
                lastUsed: new Date().toISOString(),
            })
            return sessionId
        } finally {
            unlock()
        }
    }

    /**
     * Execute a SQL statement against the Livy session.
     */
    async executeSQL(sql: string): Promise<QueryResult> {
        const sessionId = await this.getOrCreateReadySession()
        const startTime = Date.now()

        const response = await fetch(`${this.livyUrl}/sessions/${sessionId}/statements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: sql }),
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`Failed to submit statement: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`)
        }

        const statement = (await response.json()) as { id: number }
        const statementId: number = statement.id

        const output = await this.pollStatement(sessionId, statementId)
        const executionTime = Date.now() - startTime

        return this.transformOutput(statementId, output, executionTime)
    }

    /**
     * Cancel a running statement.
     */
    async cancelStatement(statementId: number): Promise<void> {
        const sessionId = await this.getOrCreateSession()

        const response = await fetch(`${this.livyUrl}/sessions/${sessionId}/statements/${statementId}/cancel`, { method: 'POST' })

        if (!response.ok) {
            throw new Error(`Failed to cancel statement: ${response.status} ${response.statusText}`)
        }
    }

    /**
     * Get session status info.
     */
    async getSessionStatus(): Promise<{ sessionId: number; state: string; kind: string }> {
        const sessionId = await this.getOrCreateSession()

        const response = await fetch(`${this.livyUrl}/sessions/${sessionId}`)
        if (!response.ok) {
            throw new Error(`Failed to get session: ${response.status}`)
        }

        const data = (await response.json()) as { id: number; state: string; kind?: string }
        return {
            sessionId: data.id,
            state: data.state,
            kind: data.kind || 'sql',
        }
    }

    /**
     * Get all databases from the metastore.
     */
    async getDatabases(): Promise<string[]> {
        const result = await this.executeSQL('SHOW DATABASES')
        return result.rows.map((row) => row[0] as string)
    }

    /**
     * Get all tables in a database.
     *
     * @param database Database name (will be backtick-quoted).
     */
    async getTables(database: string): Promise<string[]> {
        const result = await this.executeSQL(`SHOW TABLES IN ${quoteIdent(database)}`)
        const nameColIndex = result.columns.findIndex((col) => col.name === 'tableName' || col.name === 'table_name')
        const idx = nameColIndex >= 0 ? nameColIndex : 0
        return result.rows.map((row) => row[idx] as string)
    }

    /**
     * Describe a table's schema.
     *
     * @param database Database name (will be backtick-quoted).
     * @param table    Table name (will be backtick-quoted).
     */
    async describeTable(database: string, table: string): Promise<ColumnInfo[]> {
        const result = await this.executeSQL(`DESCRIBE ${quoteIdent(database)}.${quoteIdent(table)}`)
        const columns: ColumnInfo[] = []
        for (const row of result.rows) {
            const name = row[0] as string
            // Stop at partition info section (rows after are duplicates)
            if (!name || name.startsWith('#') || name.trim() === '') break
            columns.push({
                name,
                type: row[1] as string,
                nullable: row[2] !== 'false',
            })
        }
        return columns
    }

    /**
     * Get the full metastore schema tree: databases → tables → columns.
     */
    async getMetastore(): Promise<MetastoreSchema> {
        const databases = await this.getDatabases()
        const result: MetastoreDatabase[] = []

        for (const db of databases) {
            const tableNames = await this.getTables(db)
            const tables: MetastoreTable[] = []

            for (const tableName of tableNames) {
                const columns = await this.describeTable(db, tableName)
                tables.push({ name: tableName, columns })
            }

            result.push({ name: db, tables })
        }

        return { databases: result }
    }

    /**
     * Get the full metastore schema tree with progress callbacks.
     */
    async getMetastoreWithProgress(onProgress: ProgressCallback): Promise<MetastoreSchema> {
        // Warm up the session up-front so the user sees progress instead of
        // a silent pause before "Querying databases…".
        await this.getOrCreateReadySession({ onProgress })

        onProgress('Querying databases…')
        const dbResult = await this.executeSQL('SHOW DATABASES')
        const dbNames = dbResult.rows.map((row) => row[0] as string)
        onProgress(`Found ${dbNames.length} databases`)

        const result: MetastoreDatabase[] = []

        for (let di = 0; di < dbNames.length; di++) {
            const db = dbNames[di]
            onProgress(`[${di + 1}/${dbNames.length}] Querying tables in ${db}…`)

            const tablesResult = await this.executeSQL(`SHOW TABLES IN ${db}`)
            const nameColIndex = tablesResult.columns.findIndex((col) => col.name === 'tableName' || col.name === 'table_name')
            const idx = nameColIndex >= 0 ? nameColIndex : 0
            const tableNames = tablesResult.rows.map((row) => row[idx] as string)

            const tables: MetastoreTable[] = []

            for (let ti = 0; ti < tableNames.length; ti++) {
                const tableName = tableNames[ti]
                onProgress(`[${di + 1}/${dbNames.length}] Describing ${db}.${tableName} (${ti + 1}/${tableNames.length})…`)

                const descResult = await this.executeSQL(`DESCRIBE ${db}.${tableName}`)
                const columns = descResult.rows.map((row) => ({
                    name: row[0] as string,
                    type: row[1] as string,
                    nullable: row[2] !== 'false',
                }))
                tables.push({ name: tableName, columns })
            }

            result.push({ name: db, tables })
            onProgress(`[${di + 1}/${dbNames.length}] ✓ ${db} — ${tableNames.length} tables`)
        }

        onProgress('Metastore discovery complete')
        return { databases: result }
    }

    /**
     * Execute a SQL statement with progress callbacks for SSE streaming.
     */
    async executeSQLWithProgress(sql: string, onProgress: (message: string) => void): Promise<QueryResult> {
        onProgress('Ensuring Spark session is ready…')
        const sessionId = await this.getOrCreateReadySession({ onProgress })
        const startTime = Date.now()

        onProgress('Submitting query to Spark…')
        const response = await fetch(`${this.livyUrl}/sessions/${sessionId}/statements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: sql }),
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`Failed to submit statement: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`)
        }

        const statement = (await response.json()) as { id: number }
        const statementId = statement.id
        onProgress(`Statement ${statementId} submitted, waiting for results…`)

        const output = await this.pollStatementWithProgress(sessionId, statementId, startTime, onProgress)
        const executionTime = Date.now() - startTime

        onProgress('Processing results…')
        return this.transformOutput(statementId, output, executionTime)
    }

    // ========================================================================
    // Private methods
    // ========================================================================

    /**
     * Check if a session exists and is usable (idle, busy, or starting).
     * A "busy" session is still alive — Livy queues statements.
     * Only "dead", "error", "shutting_down", "gone", or unreachable means dead.
     */
    private async checkSession(id: number): Promise<boolean> {
        try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 5_000)
            const response = await fetch(`${this.livyUrl}/sessions/${id}`, {
                signal: controller.signal,
            })
            clearTimeout(timeout)
            if (!response.ok) return false

            const data = (await response.json()) as { state: string }
            const aliveStates = new Set(['idle', 'busy', 'starting', 'not_started'])
            return aliveStates.has(data.state)
        } catch {
            return false
        }
    }

    /**
     * Create a new Livy SQL session — POST only, no readiness wait. The caller
     * is responsible for waiting via `waitForSessionReady` if the session must
     * be ready before submitting work.
     */
    private async postCreateSession(): Promise<number> {
        const response = await fetch(`${this.livyUrl}/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'sql' }),
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            throw new Error(`Failed to create Livy session: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`)
        }

        const session = (await response.json()) as { id: number }
        return session.id
    }

    /**
     * Remove the on-disk session cache entry IFF it still points to `sessionId`.
     * Conditional invalidation avoids stomping a fresh session that another
     * process wrote between our read and our recovery.
     */
    private invalidateCacheIfMatches(sessionId: number): void {
        try {
            const cached = this.readCache()
            if (cached?.sessionId === sessionId && fs.existsSync(this.cacheFile)) {
                fs.unlinkSync(this.cacheFile)
            }
        } catch {
            // Best-effort — if cache I/O is broken the next acquireSession
            // will surface it.
        }
    }

    /**
     * Poll a statement with progress callbacks for SSE streaming.
     */
    private async pollStatementWithProgress(sessionId: number, statementId: number, startTime: number, onProgress: (message: string) => void): Promise<LivyStatementOutput> {
        const maxWait = 300_000
        let pollInterval = 200

        while (Date.now() - startTime < maxWait) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
            onProgress(`Waiting for results… (${elapsed}s)`)

            const result = await fetch(`${this.livyUrl}/sessions/${sessionId}/statements/${statementId}`)
            const data = (await result.json()) as { state: string; output: LivyStatementOutput }

            if (data.state === 'available') {
                return data.output
            }

            if (data.state === 'error' || data.state === 'cancelled') {
                const output = data.output
                const message = output?.evalue || output?.status || 'Statement failed'
                const traceback = output?.traceback?.join('\n') || ''
                throw new Error(traceback ? `${message}\n${traceback}` : message)
            }

            await sleep(pollInterval)
            pollInterval = Math.min(pollInterval * 1.5, 2000)
        }

        throw new Error('Query timed out')
    }

    /**
     * Poll a statement until it completes, errors, or times out.
     */
    private async pollStatement(sessionId: number, statementId: number): Promise<LivyStatementOutput> {
        const maxWait = 300_000
        const startTime = Date.now()
        let pollInterval = 200

        while (Date.now() - startTime < maxWait) {
            const result = await fetch(`${this.livyUrl}/sessions/${sessionId}/statements/${statementId}`)
            const data = (await result.json()) as { state: string; output: LivyStatementOutput }

            if (data.state === 'available') {
                return data.output
            }

            if (data.state === 'error' || data.state === 'cancelled') {
                const output = data.output
                const message = output?.evalue || output?.status || 'Statement failed'
                const traceback = output?.traceback?.join('\n') || ''
                throw new Error(traceback ? `${message}\n${traceback}` : message)
            }

            await sleep(pollInterval)
            pollInterval = Math.min(pollInterval * 1.5, 2000)
        }

        throw new Error('Query timed out')
    }

    /**
     * Transform Livy output into a QueryResult.
     */
    private transformOutput(statementId: number, output: LivyStatementOutput, executionTime: number): QueryResult {
        if (output.status !== 'ok') {
            throw new Error(output.evalue || 'Statement execution failed')
        }

        const jsonData = output.data?.['application/json']

        if (!jsonData) {
            return {
                statementId,
                status: output.status,
                columns: [],
                rows: [],
                executionTime,
                rowCount: 0,
            }
        }

        const columns: ColumnInfo[] = jsonData.schema.fields.map((field) => ({
            name: field.name,
            type: formatSparkType(field.type),
            nullable: field.nullable,
        }))

        const rows = jsonData.data.map((row: any[]) => row.map(normalizeStructValue))

        return {
            statementId,
            status: output.status,
            columns,
            rows,
            executionTime,
            rowCount: rows.length,
        }
    }

    /**
     * Acquire an exclusive file lock for session creation.
     * Returns an unlock function. Uses a lockfile with O_EXCL (atomic create)
     * and polls with backoff if another process holds the lock.
     */
    private async acquireLock(): Promise<() => void> {
        fs.mkdirSync(this.cacheDir, { recursive: true })
        const maxWait = 30_000
        const startTime = Date.now()
        let pollInterval = 50

        while (Date.now() - startTime < maxWait) {
            try {
                // O_CREAT | O_EXCL | O_WRONLY — atomic create, fails if exists
                const fd = fs.openSync(this.lockFile, 'wx')
                fs.writeSync(fd, `${process.pid}\n`)
                fs.closeSync(fd)
                return () => {
                    try {
                        fs.unlinkSync(this.lockFile)
                    } catch {
                        // Lock already cleaned up
                    }
                }
            } catch (err: any) {
                if (err.code !== 'EEXIST') throw err

                // Check for stale lock (process that created it is gone)
                try {
                    const lockPid = parseInt(fs.readFileSync(this.lockFile, 'utf-8').trim(), 10)
                    if (lockPid && !this.isProcessAlive(lockPid)) {
                        fs.unlinkSync(this.lockFile)
                        continue // Retry immediately
                    }
                } catch {
                    // Lock file gone between check and read — retry
                    continue
                }
            }

            await sleep(pollInterval)
            pollInterval = Math.min(pollInterval * 1.5, 1000)
        }

        // Timeout — force-remove stale lock and proceed
        try {
            fs.unlinkSync(this.lockFile)
        } catch {
            // Already gone
        }
        throw new Error('Timed out acquiring Livy session lock')
    }

    private isProcessAlive(pid: number): boolean {
        try {
            process.kill(pid, 0)
            return true
        } catch {
            return false
        }
    }

    /**
     * Read the cached session from disk.
     */
    private readCache(): CachedSession | null {
        try {
            if (!fs.existsSync(this.cacheFile)) return null
            const raw = fs.readFileSync(this.cacheFile, 'utf-8')
            return JSON.parse(raw) as CachedSession
        } catch {
            return null
        }
    }

    /**
     * Write the session to the cache file on disk.
     */
    private writeCache(session: CachedSession): void {
        fs.mkdirSync(this.cacheDir, { recursive: true })
        fs.writeFileSync(this.cacheFile, JSON.stringify(session, null, 2), 'utf-8')
    }
}

// ============================================================================
// Singleton
// ============================================================================

let instance: LivyService | null = null

export function getLivyService(): LivyService {
    if (!instance) {
        instance = new LivyService()
    }
    return instance
}

export function resetLivyService(): void {
    instance = null
}
