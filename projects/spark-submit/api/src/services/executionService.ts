/**
 * Execution Service
 *
 * Core business logic for job execution.
 * Manages execution sessions, job state, and process lifecycle.
 */

import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { JobsConfig, JobStatus, JobState, ExecutionSession, ExecutionStatus, ExecutionRequest, LogEvent, JobStatusEvent } from '../types.js'
import { computeEffectiveDag, getJobsByLevel } from './dagService.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Interface for job executor - allows mocking in tests
 */
export interface JobExecutor {
    execute(
        jobName: string,
        config: JobsConfig,
        projectRoot: string
    ): Promise<{
        process: ChildProcess
        exitCode: Promise<number>
    }>
}

/**
 * Callback for log events (for SSE streaming)
 */
export type LogCallback = (event: LogEvent) => void

/**
 * Callback for job status changes
 */
export type StatusCallback = (event: JobStatusEvent) => void

// ============================================================================
// Default Job Executor
// ============================================================================

/**
 * Default job executor that spawns tsx processes
 */
export class DefaultJobExecutor implements JobExecutor {
    async execute(
        jobName: string,
        config: JobsConfig,
        projectRoot: string
    ): Promise<{
        process: ChildProcess
        exitCode: Promise<number>
    }> {
        const args = ['index.ts', `--job=${jobName}`, '--no-dag']

        const child = spawn('npx', ['tsx', ...args], {
            cwd: projectRoot,
            env: {
                ...process.env,
                FORCE_COLOR: '0',
            },
        })

        const exitCode = new Promise<number>((resolve) => {
            child.on('close', (code) => resolve(code ?? 1))
            child.on('error', () => resolve(1))
        })

        return { process: child, exitCode }
    }
}

// ============================================================================
// Execution Service
// ============================================================================

/**
 * Main execution service class
 */
export class ExecutionService {
    private session: ExecutionSession | null = null
    private runningProcesses = new Map<string, ChildProcess>()
    private jobExecutor: JobExecutor
    private projectRoot: string
    private executionPromise: Promise<void> | null = null

    // Callbacks for real-time streaming
    private logCallbacks: Set<LogCallback> = new Set()
    private statusCallbacks: Set<StatusCallback> = new Set()

    constructor(projectRoot: string, jobExecutor?: JobExecutor) {
        this.projectRoot = projectRoot
        this.jobExecutor = jobExecutor || new DefaultJobExecutor()
    }

    // ========================================================================
    // Session Management
    // ========================================================================

    /**
     * Get current execution session
     */
    getSession(): ExecutionSession | null {
        return this.session
    }

    /**
     * Check if an execution is currently running
     */
    isExecuting(): boolean {
        return this.session?.status === 'running'
    }

    /**
     * Submit a new execution request
     */
    async submit(request: ExecutionRequest, config: JobsConfig): Promise<ExecutionSession> {
        if (this.isExecuting()) {
            throw new Error('An execution is already in progress')
        }

        const { selectedJobs, maxParallel = 8 } = request

        if (selectedJobs.length === 0) {
            throw new Error('No jobs selected')
        }

        // Validate all selected jobs exist
        for (const job of selectedJobs) {
            if (!config.jobs[job]) {
                throw new Error(`Job '${job}' not found in configuration`)
            }
        }

        // Compute effective DAG
        const effectiveDag = computeEffectiveDag(config, new Set(selectedJobs))
        const jobsByLevel = getJobsByLevel(config, effectiveDag)
        const totalLevels = Math.max(0, ...Array.from(jobsByLevel.keys())) + 1

        // Initialize job states
        const jobStates: Record<string, JobState> = {}
        for (const jobName of effectiveDag) {
            jobStates[jobName] = {
                status: 'pending',
                output: '',
                error: '',
            }
        }

        // Create session
        this.session = {
            id: uuidv4(),
            status: 'running',
            selectedJobs,
            effectiveDag,
            jobStates,
            maxParallel,
            currentLevel: 0,
            totalLevels,
            startTime: Date.now(),
        }

        // Start execution asynchronously
        this.executionPromise = this.executeSession(config).catch((error) => {
            if (this.session) {
                this.session.status = 'failed'
                this.session.error = error instanceof Error ? error.message : 'Execution failed'
                this.session.endTime = Date.now()
            }
        })

        return this.session
    }

    /**
     * Stop the current execution
     */
    async stop(): Promise<void> {
        if (!this.session) return

        const previousStatus = this.session.status
        this.session.status = 'cancelled'

        // Kill all running processes
        for (const [jobName, process] of this.runningProcesses) {
            try {
                process.kill('SIGTERM')
            } catch (e) {
                // Process may already be dead
            }
        }
        this.runningProcesses.clear()

        // Mark running/pending jobs as cancelled
        for (const [jobName, state] of Object.entries(this.session.jobStates)) {
            if (state.status === 'running' || state.status === 'pending') {
                this.updateJobStatus(jobName, 'cancelled')
            }
        }

        this.session.endTime = Date.now()

        // Wait for execution promise to settle
        if (this.executionPromise) {
            try {
                await this.executionPromise
            } catch (e) {
                // Ignore errors during cancellation
            }
            this.executionPromise = null
        }
    }

    /**
     * Reset execution state (clear session)
     */
    reset(): void {
        // Stop any running execution first
        if (this.isExecuting()) {
            this.stop()
        }

        this.session = null
        this.runningProcesses.clear()
        this.executionPromise = null
    }

    // ========================================================================
    // Log Streaming
    // ========================================================================

    /**
     * Register a callback for log events
     */
    onLog(callback: LogCallback): () => void {
        this.logCallbacks.add(callback)
        return () => this.logCallbacks.delete(callback)
    }

    /**
     * Register a callback for status changes
     */
    onStatusChange(callback: StatusCallback): () => void {
        this.statusCallbacks.add(callback)
        return () => this.statusCallbacks.delete(callback)
    }

    /**
     * Get logs for a specific job
     */
    getJobLogs(jobName: string): { output: string; error: string } | null {
        if (!this.session || !this.session.jobStates[jobName]) {
            return null
        }
        const state = this.session.jobStates[jobName]
        return { output: state.output, error: state.error }
    }

    // ========================================================================
    // Internal Execution
    // ========================================================================

    /**
     * True DAG-based execution: jobs start as soon as their specific dependencies complete,
     * rather than waiting for all jobs at the same "level" to finish.
     */
    private async executeSession(config: JobsConfig): Promise<void> {
        if (!this.session) return

        const { effectiveDag, maxParallel } = this.session

        // Build dependency map for jobs in the effective DAG
        const dagSet = new Set(effectiveDag)
        const dependencies = new Map<string, Set<string>>()
        for (const job of effectiveDag) {
            const jobConfig = config.jobs[job]
            const deps = new Set<string>()
            if (jobConfig?.dependsOn) {
                for (const dep of jobConfig.dependsOn) {
                    // Only include dependencies that are in the effective DAG
                    if (dagSet.has(dep)) {
                        deps.add(dep)
                    }
                }
            }
            dependencies.set(job, deps)
        }

        // Track state
        const completed = new Set<string>()
        const failed = new Set<string>()
        const running = new Map<string, Promise<{ jobName: string; success: boolean }>>()
        const pending = new Set(effectiveDag)

        try {
            while (pending.size > 0 || running.size > 0) {
                if (this.session.status !== 'running') break

                // Find jobs that are ready to run (all dependencies completed successfully)
                const ready: string[] = []
                for (const job of pending) {
                    const deps = dependencies.get(job) || new Set()
                    const allDepsCompleted = Array.from(deps).every((d) => completed.has(d))
                    const anyDepFailed = Array.from(deps).some((d) => failed.has(d))

                    if (anyDepFailed) {
                        // Skip this job - a dependency failed
                        pending.delete(job)
                        this.updateJobStatus(job, 'cancelled')
                    } else if (allDepsCompleted) {
                        ready.push(job)
                    }
                }

                // Start ready jobs up to maxParallel limit
                while (ready.length > 0 && running.size < maxParallel) {
                    if (this.session.status !== 'running') break

                    const jobName = ready.shift()!
                    pending.delete(jobName)

                    const promise = this.executeJob(jobName, config).then((success) => ({
                        jobName,
                        success,
                    }))
                    running.set(jobName, promise)
                }

                // If nothing is running and nothing is ready but jobs are pending,
                // they must be blocked by unmet/failed dependencies
                if (running.size === 0) {
                    if (pending.size > 0) {
                        // Jobs remain but none can run - cancel them
                        for (const job of pending) {
                            this.updateJobStatus(job, 'cancelled')
                        }
                        pending.clear()
                    }
                    break
                }

                // Wait for any running job to complete
                const result = await Promise.race(running.values())
                running.delete(result.jobName)

                if (result.success) {
                    completed.add(result.jobName)
                } else {
                    failed.add(result.jobName)
                    // Don't stop immediately - let other independent branches continue
                    // Jobs that depend on this failed job will be cancelled when we check deps
                }

                // Update current level for UI (approximate based on max completed depth)
                const jobsByLevel = getJobsByLevel(config, effectiveDag)
                let maxCompletedLevel = 0
                for (const [level, jobs] of jobsByLevel) {
                    if (jobs.some((j) => completed.has(j) || running.has(j))) {
                        maxCompletedLevel = Math.max(maxCompletedLevel, level)
                    }
                }
                this.session.currentLevel = maxCompletedLevel
            }

            // Determine final status
            if (this.session.status === 'running') {
                if (failed.size > 0) {
                    this.session.status = 'failed'
                    this.session.error = `${failed.size} job(s) failed: ${Array.from(failed).join(', ')}`
                } else {
                    this.session.status = 'completed'
                }
            }
        } catch (error) {
            if (this.session) {
                this.session.status = 'failed'
                this.session.error = error instanceof Error ? error.message : 'Unknown error'
            }
        } finally {
            if (this.session) {
                this.session.endTime = Date.now()
            }
        }
    }

    private async executeJob(jobName: string, config: JobsConfig): Promise<boolean> {
        if (!this.session) return false
        if (this.session.status !== 'running') return false

        // Update status to running
        this.updateJobStatus(jobName, 'running')
        this.session.jobStates[jobName].startTime = Date.now()

        try {
            const { process, exitCode } = await this.jobExecutor.execute(jobName, config, this.projectRoot)

            this.runningProcesses.set(jobName, process)

            // Stream stdout
            process.stdout?.on('data', (data: Buffer) => {
                if (this.session) {
                    const line = data.toString()
                    this.session.jobStates[jobName].output += line
                    this.emitLog({
                        jobName,
                        stream: 'stdout',
                        line,
                        timestamp: Date.now(),
                    })
                }
            })

            // Stream stderr
            process.stderr?.on('data', (data: Buffer) => {
                if (this.session) {
                    const line = data.toString()
                    this.session.jobStates[jobName].error += line
                    this.emitLog({
                        jobName,
                        stream: 'stderr',
                        line,
                        timestamp: Date.now(),
                    })
                }
            })

            const code = await exitCode
            this.runningProcesses.delete(jobName)

            if (this.session) {
                const success = code === 0
                this.updateJobStatus(jobName, success ? 'success' : 'failed')
                this.session.jobStates[jobName].endTime = Date.now()
                this.session.jobStates[jobName].exitCode = code
                return success
            }

            return code === 0
        } catch (error) {
            this.runningProcesses.delete(jobName)

            if (this.session) {
                this.updateJobStatus(jobName, 'failed')
                this.session.jobStates[jobName].endTime = Date.now()
                this.session.jobStates[jobName].error += error instanceof Error ? error.message : 'Unknown error'
            }

            return false
        }
    }

    private updateJobStatus(jobName: string, newStatus: JobStatus): void {
        if (!this.session) return

        const previousStatus = this.session.jobStates[jobName]?.status
        if (previousStatus === newStatus) return

        this.session.jobStates[jobName] = {
            ...this.session.jobStates[jobName],
            status: newStatus,
        }

        // Emit status change event
        this.emitStatusChange({
            jobName,
            previousStatus: previousStatus || 'pending',
            newStatus,
            timestamp: Date.now(),
        })
    }

    private cancelRemainingJobs(): void {
        if (!this.session) return

        for (const [jobName, state] of Object.entries(this.session.jobStates)) {
            if (state.status === 'pending') {
                this.updateJobStatus(jobName, 'cancelled')
            }
        }
    }

    private emitLog(event: LogEvent): void {
        for (const callback of this.logCallbacks) {
            try {
                callback(event)
            } catch (e) {
                // Ignore callback errors
            }
        }
    }

    private emitStatusChange(event: JobStatusEvent): void {
        for (const callback of this.statusCallbacks) {
            try {
                callback(event)
            } catch (e) {
                // Ignore callback errors
            }
        }
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let executionService: ExecutionService | null = null

/**
 * Get the singleton execution service instance
 */
export function getExecutionService(projectRoot?: string): ExecutionService {
    if (!executionService) {
        if (!projectRoot) {
            throw new Error('Project root must be provided for initial creation')
        }
        executionService = new ExecutionService(projectRoot)
    }
    return executionService
}

/**
 * Create a new execution service (for testing)
 */
export function createExecutionService(projectRoot: string, jobExecutor?: JobExecutor): ExecutionService {
    return new ExecutionService(projectRoot, jobExecutor)
}

/**
 * Reset the singleton (for testing)
 */
export function resetExecutionService(): void {
    if (executionService) {
        executionService.reset()
    }
    executionService = null
}
