/**
 * Server-Sent Events (SSE) Routes
 *
 * Provides real-time streaming of execution state and logs.
 */

import { Router, Request, Response } from 'express'
import { getExecutionService } from './services/executionService.js'
import { isConfigLoaded } from './services/configService.js'
import { getSystemStats } from './services/systemStatsService.js'
import type { SSEEvent, LogEvent, JobStatusEvent } from './types.js'

export const sseRouter = Router()

// ============================================================================
// SSE Helpers
// ============================================================================

/**
 * Format data as SSE event
 */
function formatSSE(event: SSEEvent): string {
    const data = JSON.stringify(event)
    return `data: ${data}\n\n`
}

/**
 * Send SSE event
 */
function sendEvent(res: Response, event: SSEEvent): void {
    res.write(formatSSE(event))
}

// ============================================================================
// SSE Endpoints
// ============================================================================

/**
 * GET /api/sse/execution - Stream execution state and logs
 *
 * This endpoint uses Server-Sent Events to stream real-time updates:
 * - state: Full execution state (sent periodically and on changes)
 * - log: Individual log lines from running jobs
 * - job-status: Job status changes
 * - heartbeat: Keep-alive ping
 * - complete: Execution completed
 * - error: Error occurred
 */
sseRouter.get('/execution', (req: Request, res: Response) => {
    // Check if config is loaded
    if (!isConfigLoaded()) {
        res.status(503).json({
            success: false,
            error: 'Configuration not loaded. Server is initializing.',
        })
        return
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable nginx buffering
    res.flushHeaders()

    const executionService = getExecutionService()

    // Send initial state
    const initialSession = executionService.getSession()
    sendEvent(res, {
        type: 'state',
        data: {
            session: initialSession,
            isExecuting: executionService.isExecuting(),
        },
        timestamp: Date.now(),
    })

    // Register log callback
    const unsubscribeLog = executionService.onLog((event: LogEvent) => {
        sendEvent(res, {
            type: 'log',
            data: event,
            timestamp: Date.now(),
        })
    })

    // Register status callback
    const unsubscribeStatus = executionService.onStatusChange((event: JobStatusEvent) => {
        sendEvent(res, {
            type: 'job-status',
            data: event,
            timestamp: Date.now(),
        })

        // Also send full state on status change
        const session = executionService.getSession()
        sendEvent(res, {
            type: 'state',
            data: {
                session,
                isExecuting: executionService.isExecuting(),
            },
            timestamp: Date.now(),
        })

        // Check if execution completed
        if (session && ['completed', 'failed', 'cancelled'].includes(session.status)) {
            sendEvent(res, {
                type: 'complete',
                data: {
                    status: session.status,
                    error: session.error,
                },
                timestamp: Date.now(),
            })
        }
    })

    // Heartbeat to keep connection alive
    const heartbeatInterval = setInterval(() => {
        try {
            sendEvent(res, {
                type: 'heartbeat',
                data: { timestamp: Date.now() },
                timestamp: Date.now(),
            })
        } catch (e) {
            // Connection closed
            clearInterval(heartbeatInterval)
        }
    }, 30000) // Every 30 seconds

    // Periodic state updates (in case status callbacks miss something)
    const stateInterval = setInterval(() => {
        try {
            const session = executionService.getSession()
            sendEvent(res, {
                type: 'state',
                data: {
                    session,
                    isExecuting: executionService.isExecuting(),
                },
                timestamp: Date.now(),
            })
        } catch (e) {
            clearInterval(stateInterval)
        }
    }, 1000) // Every 1 second

    // Clean up on close
    req.on('close', () => {
        unsubscribeLog()
        unsubscribeStatus()
        clearInterval(heartbeatInterval)
        clearInterval(stateInterval)
    })
})

/**
 * GET /api/sse/logs/:jobName - Stream logs for a specific job
 */
sseRouter.get('/logs/:jobName', (req: Request, res: Response) => {
    if (!isConfigLoaded()) {
        res.status(503).json({
            success: false,
            error: 'Configuration not loaded. Server is initializing.',
        })
        return
    }

    const jobName: string = req.params.jobName as string

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    const executionService = getExecutionService()

    // Send existing logs first
    const existingLogs = executionService.getJobLogs(jobName)
    if (existingLogs) {
        if (existingLogs.output) {
            for (const line of existingLogs.output.split('\n')) {
                if (line) {
                    sendEvent(res, {
                        type: 'log',
                        data: {
                            jobName,
                            stream: 'stdout',
                            line,
                            timestamp: Date.now(),
                        },
                        timestamp: Date.now(),
                    })
                }
            }
        }
        if (existingLogs.error) {
            for (const line of existingLogs.error.split('\n')) {
                if (line) {
                    sendEvent(res, {
                        type: 'log',
                        data: {
                            jobName,
                            stream: 'stderr',
                            line,
                            timestamp: Date.now(),
                        },
                        timestamp: Date.now(),
                    })
                }
            }
        }
    }

    // Register log callback for this job only
    const unsubscribe = executionService.onLog((event: LogEvent) => {
        if (event.jobName === jobName) {
            sendEvent(res, {
                type: 'log',
                data: event,
                timestamp: Date.now(),
            })
        }
    })

    // Register status callback
    const unsubscribeStatus = executionService.onStatusChange((event: JobStatusEvent) => {
        if (event.jobName === jobName) {
            sendEvent(res, {
                type: 'job-status',
                data: event,
                timestamp: Date.now(),
            })

            // Send complete event if job finished
            if (['success', 'failed', 'cancelled'].includes(event.newStatus)) {
                sendEvent(res, {
                    type: 'complete',
                    data: {
                        jobName,
                        status: event.newStatus,
                    },
                    timestamp: Date.now(),
                })
            }
        }
    })

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
        try {
            sendEvent(res, {
                type: 'heartbeat',
                data: { timestamp: Date.now() },
                timestamp: Date.now(),
            })
        } catch (e) {
            clearInterval(heartbeatInterval)
        }
    }, 30000)

    // Clean up
    req.on('close', () => {
        unsubscribe()
        unsubscribeStatus()
        clearInterval(heartbeatInterval)
    })
})

/**
 * GET /api/sse/system-stats - Stream system statistics
 */
sseRouter.get('/system-stats', (req: Request, res: Response) => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders()

    // Send stats every second
    const statsInterval = setInterval(() => {
        try {
            const stats = getSystemStats()
            sendEvent(res, {
                type: 'state',
                data: stats,
                timestamp: Date.now(),
            })
        } catch (e) {
            clearInterval(statsInterval)
        }
    }, 1000)

    // Heartbeat
    const heartbeatInterval = setInterval(() => {
        try {
            sendEvent(res, {
                type: 'heartbeat',
                data: { timestamp: Date.now() },
                timestamp: Date.now(),
            })
        } catch (e) {
            clearInterval(heartbeatInterval)
        }
    }, 30000)

    // Clean up
    req.on('close', () => {
        clearInterval(statsInterval)
        clearInterval(heartbeatInterval)
    })
})
