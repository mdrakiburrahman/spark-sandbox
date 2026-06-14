/**
 * API Routes
 *
 * Express routes for the Spark Orchestrator API.
 */

import { Router, Request, Response, NextFunction } from 'express'
import type { ApiResponse, ExecutionRequest, ExecutionStateResponse, JobLogsResponse, DagResponse, JobsConfig } from './types.js'
import { getConfig, isConfigLoaded } from './services/configService.js'
import { computeEffectiveDag, getJobsByLevel, getEdges, getJobsByCategory, filterJobsByCategory } from './services/dagService.js'
import { getExecutionService } from './services/executionService.js'
import { getSystemStats } from './services/systemStatsService.js'
import { getLivyService } from './services/livyService.js'
import { getMetastoreService } from './services/metastoreService.js'

export const router = Router()

// ============================================================================
// Middleware
// ============================================================================

/**
 * Ensure config is loaded before processing requests
 */
function requireConfig(req: Request, res: Response, next: NextFunction): void {
    if (!isConfigLoaded()) {
        res.status(503).json({
            success: false,
            error: 'Configuration not loaded. Server is initializing.',
        } as ApiResponse)
        return
    }
    next()
}

// ============================================================================
// Config Routes
// ============================================================================

/**
 * GET /api/config - Get the jobs configuration
 */
router.get('/config', requireConfig, (req: Request, res: Response) => {
    try {
        const config = getConfig()
        res.json({
            success: true,
            data: config,
        } as ApiResponse<JobsConfig>)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get config',
        } as ApiResponse)
    }
})

/**
 * GET /api/config/jobs - Get list of all jobs
 */
router.get('/config/jobs', requireConfig, (req: Request, res: Response) => {
    try {
        const config = getConfig()
        const jobs = Object.entries(config.jobs).map(([name, job]) => {
            return typeof job === 'object' && job !== null ? { name, ...job } : { name }
        })
        res.json({
            success: true,
            data: jobs,
        } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get jobs',
        } as ApiResponse)
    }
})

/**
 * GET /api/config/jobs/by-category - Get jobs grouped by category
 */
router.get('/config/jobs/by-category', requireConfig, (req: Request, res: Response) => {
    try {
        const config = getConfig()
        const byCategory = getJobsByCategory(config)
        res.json({
            success: true,
            data: byCategory,
        } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get jobs by category',
        } as ApiResponse)
    }
})

// ============================================================================
// DAG Routes
// ============================================================================

/**
 * POST /api/dag/compute - Compute effective DAG for selected jobs
 */
router.post('/dag/compute', requireConfig, (req: Request, res: Response) => {
    try {
        const { selectedJobs } = req.body as { selectedJobs: string[] }

        if (!selectedJobs || !Array.isArray(selectedJobs) || selectedJobs.length === 0) {
            res.status(400).json({
                success: false,
                error: 'selectedJobs is required and must be a non-empty array',
            } as ApiResponse)
            return
        }

        const config = getConfig()

        // Validate all jobs exist
        for (const job of selectedJobs) {
            if (!config.jobs[job]) {
                res.status(400).json({
                    success: false,
                    error: `Job '${job}' not found in configuration`,
                } as ApiResponse)
                return
            }
        }

        const effectiveDag = computeEffectiveDag(config, new Set(selectedJobs))
        const jobsByLevel = getJobsByLevel(config, effectiveDag)
        const edges = getEdges(config, effectiveDag)

        // Convert Map to Record for JSON serialization
        const jobsByLevelRecord: Record<number, string[]> = {}
        for (const [level, jobs] of jobsByLevel) {
            jobsByLevelRecord[level] = jobs
        }

        res.json({
            success: true,
            data: {
                effectiveDag,
                jobsByLevel: jobsByLevelRecord,
                edges,
            },
        } as ApiResponse<DagResponse>)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to compute DAG',
        } as ApiResponse)
    }
})

/**
 * POST /api/dag/filter - Filter jobs by category
 */
router.post('/dag/filter', requireConfig, (req: Request, res: Response) => {
    try {
        const { categories } = req.body as { categories: string[] }

        if (!categories || !Array.isArray(categories)) {
            res.status(400).json({
                success: false,
                error: 'categories is required and must be an array',
            } as ApiResponse)
            return
        }

        const config = getConfig()
        const jobs = filterJobsByCategory(config, categories)

        res.json({
            success: true,
            data: jobs,
        } as ApiResponse<string[]>)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to filter jobs',
        } as ApiResponse)
    }
})

// ============================================================================
// Execution Routes
// ============================================================================

/**
 * POST /api/execution - Submit a new execution
 */
router.post('/execution', requireConfig, async (req: Request, res: Response) => {
    try {
        const { selectedJobs, maxParallel } = req.body as ExecutionRequest

        if (!selectedJobs || !Array.isArray(selectedJobs) || selectedJobs.length === 0) {
            res.status(400).json({
                success: false,
                error: 'selectedJobs is required and must be a non-empty array',
            } as ApiResponse)
            return
        }

        const config = getConfig()
        const executionService = getExecutionService()
        const session = await executionService.submit({ selectedJobs, maxParallel: maxParallel || 8 }, config)

        res.json({
            success: true,
            data: session,
        } as ApiResponse)
    } catch (error) {
        const statusCode = (error as Error).message?.includes('already in progress') ? 409 : 500
        res.status(statusCode).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to submit execution',
        } as ApiResponse)
    }
})

/**
 * GET /api/execution - Get current execution state
 */
router.get('/execution', requireConfig, (req: Request, res: Response) => {
    try {
        const executionService = getExecutionService()
        const session = executionService.getSession()
        const isExecuting = executionService.isExecuting()

        res.json({
            success: true,
            data: {
                session,
                isExecuting,
            },
        } as ApiResponse<ExecutionStateResponse>)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get execution state',
        } as ApiResponse)
    }
})

/**
 * DELETE /api/execution - Stop current execution
 */
router.delete('/execution', requireConfig, async (req: Request, res: Response) => {
    try {
        const executionService = getExecutionService()
        await executionService.stop()

        res.json({
            success: true,
            data: { message: 'Execution stopped' },
        } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to stop execution',
        } as ApiResponse)
    }
})

/**
 * POST /api/execution/reset - Reset execution state
 */
router.post('/execution/reset', requireConfig, (req: Request, res: Response) => {
    try {
        const executionService = getExecutionService()
        executionService.reset()

        res.json({
            success: true,
            data: { message: 'Execution state reset' },
        } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to reset execution',
        } as ApiResponse)
    }
})

/**
 * GET /api/execution/logs/:jobName - Get logs for a specific job
 */
router.get('/execution/logs/:jobName', requireConfig, (req: Request, res: Response) => {
    try {
        const jobName = req.params.jobName as string
        const executionService = getExecutionService()
        const logs = executionService.getJobLogs(jobName)

        if (!logs) {
            res.status(404).json({
                success: false,
                error: `Logs not found for job '${jobName}'`,
            } as ApiResponse)
            return
        }

        const session = executionService.getSession()
        const status = session?.jobStates[jobName]?.status || 'pending'

        res.json({
            success: true,
            data: {
                jobName,
                output: logs.output,
                error: logs.error,
                status,
            },
        } as ApiResponse<JobLogsResponse>)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get job logs',
        } as ApiResponse)
    }
})

// ============================================================================
// System Stats Routes
// ============================================================================

/**
 * GET /api/system-stats - Get current system statistics
 */
router.get('/system-stats', (req: Request, res: Response) => {
    try {
        const stats = getSystemStats()
        res.json({
            success: true,
            data: stats,
        } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get system stats',
        } as ApiResponse)
    }
})

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/health - Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
    res.json({
        success: true,
        data: {
            status: 'healthy',
            timestamp: Date.now(),
            configLoaded: isConfigLoaded(),
        },
    } as ApiResponse)
})

// ============================================================================
// SQL / Livy Routes
// ============================================================================

/**
 * GET /api/sql/session - Get or create a Livy session
 */
router.get('/sql/session', async (req: Request, res: Response) => {
    try {
        const livy = getLivyService()
        const status = await livy.getSessionStatus()
        res.json({ success: true, data: status } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get Livy session',
        } as ApiResponse)
    }
})

/**
 * POST /api/sql/query - Execute a SQL query
 */
router.post('/sql/query', async (req: Request, res: Response) => {
    try {
        const { sql } = req.body as { sql: string }

        if (!sql || typeof sql !== 'string' || !sql.trim()) {
            res.status(400).json({
                success: false,
                error: 'sql is required and must be a non-empty string',
            } as ApiResponse)
            return
        }

        const livy = getLivyService()

        // If client accepts SSE, stream progress events
        if (req.headers.accept?.includes('text/event-stream')) {
            res.setHeader('Content-Type', 'text/event-stream')
            res.setHeader('Cache-Control', 'no-cache')
            res.setHeader('Connection', 'keep-alive')
            res.setHeader('X-Accel-Buffering', 'no')
            res.flushHeaders()

            const send = (type: string, data: unknown) => {
                res.write(`data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`)
            }

            try {
                const result = await livy.executeSQLWithProgress(sql.trim(), (message) => {
                    send('progress', { message })
                })
                send('complete', result)
            } catch (error) {
                send('error', { message: error instanceof Error ? error.message : 'Query failed' })
            } finally {
                res.end()
            }
            return
        }

        // Non-SSE: blocking request
        const result = await livy.executeSQL(sql.trim())
        res.json({ success: true, data: result } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to execute SQL',
        } as ApiResponse)
    }
})

/**
 * DELETE /api/sql/query - Cancel a running statement
 */
router.delete('/sql/query', async (req: Request, res: Response) => {
    try {
        const { statementId } = req.body as { statementId: number }

        if (statementId === undefined || statementId === null) {
            res.status(400).json({
                success: false,
                error: 'statementId is required',
            } as ApiResponse)
            return
        }

        const livy = getLivyService()
        await livy.cancelStatement(statementId)
        res.json({ success: true, data: { message: 'Statement cancelled' } } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to cancel statement',
        } as ApiResponse)
    }
})

/**
 * GET /api/sql/metastore/databases/:db/tables/:table - Refresh a single table via Livy.
 *
 * Always invokes Livy DESCRIBE directly — returns the live Spark column list
 * for the table. Use this to bypass the cached metastore for a known-stale
 * table without paying for a full refresh.
 */
router.get('/sql/metastore/databases/:db/tables/:table', async (req: Request, res: Response) => {
    const livy = getLivyService()
    const db = req.params.db as string
    const table = req.params.table as string

    const controller = new AbortController()
    req.on('close', () => controller.abort())

    if (req.headers.accept?.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()

        const send = (type: string, data: unknown) => {
            res.write(`data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`)
        }

        try {
            send('progress', { message: `DESCRIBE ${db}.${table}` })
            const columns = await livy.describeTable(db, table)
            if (!controller.signal.aborted) {
                send('progress', { message: `✓ ${db}.${table} — ${columns.length} columns` })
                send('complete', { name: table, columns })
            }
        } catch (error) {
            if (!controller.signal.aborted) {
                send('error', { message: error instanceof Error ? error.message : `Failed to refresh table ${db}.${table}` })
            }
        } finally {
            res.end()
        }
        return
    }

    try {
        const columns = await livy.describeTable(db, table)
        res.json({ success: true, data: { name: table, columns } } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : `Failed to refresh table ${db}.${table}`,
        } as ApiResponse)
    }
})

/**
 * GET /api/sql/metastore - Get database + table names only.
 *
 * Page-load entry point. Runs a tiny `DBS ⋈ TBLS` JOIN against the Hive
 * metastore SQL Server — returns sub-second on a metastore with thousands
 * of tables. **Does not** query column metadata and **never** invokes
 * Livy. Column schemas are loaded on-demand per table via the
 * `/api/sql/metastore/databases/:db/tables/:table` endpoint.
 */
router.get('/sql/metastore', async (req: Request, res: Response) => {
    const ms = getMetastoreService()

    // If client accepts SSE, stream progress events
    if (req.headers.accept?.includes('text/event-stream')) {
        res.setHeader('Content-Type', 'text/event-stream')
        res.setHeader('Cache-Control', 'no-cache')
        res.setHeader('Connection', 'keep-alive')
        res.setHeader('X-Accel-Buffering', 'no')
        res.flushHeaders()

        const send = (type: string, data: unknown) => {
            res.write(`data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`)
        }

        try {
            const metastore = await ms.getNamesWithProgress((message) => {
                send('progress', { message })
            })
            send('complete', metastore)
        } catch (error) {
            send('error', { message: error instanceof Error ? error.message : 'Metastore discovery failed' })
        } finally {
            res.end()
        }
        return
    }

    // Non-SSE: return names-only result as JSON
    try {
        const metastore = await ms.getNamesOnly()
        res.json({ success: true, data: metastore } as ApiResponse)
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to get metastore',
        } as ApiResponse)
    }
})
