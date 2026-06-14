/**
 * Execution Controller
 *
 * Central controller for DAG execution. Manages:
 * - Execution sessions (submit, poll, stop)
 * - Job state management
 * - Parallel execution with configurable limits
 * - Process lifecycle
 *
 * This is the main entry point for all execution logic.
 * The UI should only interact with this controller via API routes.
 */

import { ChildProcess, spawn } from 'child_process'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { JobsConfig, JobStatus, JobState, ExecutionSession, ExecutionStatus, ExecutionRequest } from './types'
import { computeEffectiveDag, getJobsByLevel } from './dagService'

/**
 * Interface for job executor - allows mocking in tests
 */
export interface JobExecutor {
    execute(
        jobName: string,
        config: JobsConfig
    ): Promise<{
        process: ChildProcess
        exitCode: Promise<number>
    }>
}

/**
 * Default job executor that spawns tsx processes
 */
export class DefaultJobExecutor implements JobExecutor {
    private projectRoot: string

    constructor(projectRoot?: string) {
        // Default: ui is inside projects/spark-submit/ui — go one level up to the spark-submit root.
        this.projectRoot = projectRoot || path.resolve(process.cwd(), '..')
    }

    async execute(
        jobName: string,
        config: JobsConfig
    ): Promise<{
        process: ChildProcess
        exitCode: Promise<number>
    }> {
        const args = ['index.ts', `--job=${jobName}`, '--no-dag']

        const child = spawn('npx', ['tsx', ...args], {
            cwd: this.projectRoot,
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

/**
 * Main Execution Controller class
 */
export class ExecutionController {
    private config: JobsConfig | null = null
    private session: ExecutionSession | null = null
    private runningProcesses: Map<string, ChildProcess> = new Map()
    private jobExecutor: JobExecutor
    private executionPromise: Promise<void> | null = null

    constructor(jobExecutor?: JobExecutor) {
        this.jobExecutor = jobExecutor || new DefaultJobExecutor()
    }

    /**
     * Load jobs configuration
     */
    setConfig(config: JobsConfig): void {
        this.config = config
    }

    /**
     * Get current configuration
     */
    getConfig(): JobsConfig | null {
        return this.config
    }

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
     * @param request - The execution request containing selected jobs
     * @returns The created session
     */
    async submit(request: ExecutionRequest): Promise<ExecutionSession> {
        if (!this.config) {
            throw new Error('Configuration not loaded')
        }

        if (this.isExecuting()) {
            throw new Error('An execution is already in progress')
        }

        const { selectedJobs, maxParallel = 8, noDag = false } = request

        if (selectedJobs.length === 0) {
            throw new Error('No jobs selected')
        }

        const effectiveDag = noDag ? [...selectedJobs] : computeEffectiveDag(this.config, new Set(selectedJobs))
        const jobsByLevel = getJobsByLevel(this.config, effectiveDag)
        const totalLevels = Math.max(...Array.from(jobsByLevel.keys())) + 1

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
        this.executionPromise = this.executeSession()

        return this.session
    }

    /**
     * Execute the current session using true DAG-based execution.
     * Jobs start as soon as their specific dependencies complete,
     * rather than waiting for all jobs at the same "level" to finish.
     */
    private async executeSession(): Promise<void> {
        if (!this.session || !this.config) return

        const { effectiveDag, maxParallel } = this.session

        // Build dependency map for jobs in the effective DAG
        const dagSet = new Set(effectiveDag)
        const dependencies = new Map<string, Set<string>>()
        for (const job of effectiveDag) {
            const jobConfig = this.config.jobs[job]
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

        // Track completed jobs
        const completed = new Set<string>()
        const failed = new Set<string>()

        // Running jobs: map from job name to its completion promise
        const running = new Map<string, Promise<{ jobName: string; success: boolean }>>()

        try {
            while (this.session.status === 'running') {
                // Find jobs that are ready to run (all dependencies completed successfully)
                const ready: string[] = []
                for (const job of effectiveDag) {
                    if (completed.has(job) || failed.has(job) || running.has(job)) continue

                    const state = this.session.jobStates[job]
                    if (state.status === 'success') {
                        // Already succeeded (from previous run)
                        completed.add(job)
                        continue
                    }

                    const deps = dependencies.get(job) || new Set()
                    const allDepsCompleted = [...deps].every((d) => completed.has(d))
                    const anyDepFailed = [...deps].some((d) => failed.has(d))

                    if (anyDepFailed) {
                        // Cancel this job because a dependency failed
                        this.session.jobStates[job] = {
                            ...this.session.jobStates[job],
                            status: 'cancelled',
                            endTime: Date.now(),
                        }
                        failed.add(job)
                    } else if (allDepsCompleted) {
                        ready.push(job)
                    }
                }

                // Start ready jobs up to maxParallel limit
                while (ready.length > 0 && running.size < maxParallel) {
                    if (this.session.status !== 'running') break

                    const jobName = ready.shift()!
                    const promise = this.executeJob(jobName).then((success) => ({
                        jobName,
                        success,
                    }))
                    running.set(jobName, promise)
                }

                // If nothing is running and nothing is ready, we're done
                if (running.size === 0) {
                    break
                }

                // Wait for any job to complete
                const result = await Promise.race(running.values())
                running.delete(result.jobName)

                if (result.success) {
                    completed.add(result.jobName)
                } else {
                    failed.add(result.jobName)
                }
            }

            // Determine final status
            if (this.session.status === 'running') {
                if (failed.size > 0) {
                    this.session.status = 'failed'
                    this.session.error = 'One or more jobs failed'
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

    /**
     * Execute a single job
     */
    private async executeJob(jobName: string): Promise<boolean> {
        if (!this.session || !this.config) return false
        if (this.session.status !== 'running') return false

        // Update state to running
        this.session.jobStates[jobName] = {
            ...this.session.jobStates[jobName],
            status: 'running',
            startTime: Date.now(),
            output: '',
            error: '',
        }

        try {
            const { process, exitCode } = await this.jobExecutor.execute(jobName, this.config)
            this.runningProcesses.set(jobName, process)

            // Collect output
            process.stdout?.on('data', (data: Buffer) => {
                if (this.session) {
                    this.session.jobStates[jobName].output += data.toString()
                }
            })

            process.stderr?.on('data', (data: Buffer) => {
                if (this.session) {
                    this.session.jobStates[jobName].error += data.toString()
                }
            })

            const code = await exitCode
            this.runningProcesses.delete(jobName)

            if (this.session) {
                const success = code === 0
                this.session.jobStates[jobName] = {
                    ...this.session.jobStates[jobName],
                    status: success ? 'success' : 'failed',
                    endTime: Date.now(),
                    exitCode: code,
                }
                return success
            }

            return code === 0
        } catch (error) {
            this.runningProcesses.delete(jobName)

            if (this.session) {
                this.session.jobStates[jobName] = {
                    ...this.session.jobStates[jobName],
                    status: 'failed',
                    endTime: Date.now(),
                    error: error instanceof Error ? error.message : 'Unknown error',
                }
            }

            return false
        }
    }

    /**
     * Cancel remaining jobs after a failure at a given level
     */
    private cancelRemainingJobs(afterLevel: number): void {
        if (!this.session || !this.config) return

        // Mark all pending jobs as cancelled
        for (const [jobName, state] of Object.entries(this.session.jobStates) as [string, JobState][]) {
            if (state.status === 'pending') {
                this.session.jobStates[jobName] = {
                    ...state,
                    status: 'cancelled',
                    endTime: Date.now(),
                }
            }
        }
    }

    /**
     * Stop the current execution
     */
    async stop(): Promise<void> {
        if (!this.session) return

        this.session.status = 'cancelled'

        // Kill all running processes
        for (const [jobName, process] of this.runningProcesses) {
            try {
                process.kill('SIGTERM')
            } catch (e) {
                console.error(`Failed to kill process for job ${jobName}:`, e)
            }
        }
        this.runningProcesses.clear()

        // Mark running jobs as cancelled
        for (const [jobName, state] of Object.entries(this.session.jobStates) as [string, JobState][]) {
            if (state.status === 'running' || state.status === 'pending') {
                this.session.jobStates[jobName] = {
                    ...state,
                    status: 'cancelled',
                    endTime: Date.now(),
                }
            }
        }

        this.session.endTime = Date.now()

        // Wait for execution to finish
        if (this.executionPromise) {
            await this.executionPromise
        }
    }

    /**
     * Reset to allow new execution
     */
    reset(): void {
        if (this.isExecuting()) {
            throw new Error('Cannot reset while execution is in progress')
        }

        // Preserve config and job states (for "green" jobs that should be skipped)
        // but reset session
        this.session = null
        this.executionPromise = null
    }

    /**
     * Clear all state (including job history)
     */
    clearAll(): void {
        if (this.isExecuting()) {
            throw new Error('Cannot clear while execution is in progress')
        }

        this.session = null
        this.executionPromise = null
    }

    /**
     * Get logs for a specific job
     */
    getJobLogs(jobName: string): { output: string; error: string } | null {
        if (!this.session) return null
        const state = this.session.jobStates[jobName]
        if (!state) return null
        return { output: state.output, error: state.error }
    }

    /**
     * Get running job count
     */
    getRunningCount(): number {
        return this.runningProcesses.size
    }
}

// Singleton instance for use across API routes
let controllerInstance: ExecutionController | null = null

export function getExecutionController(): ExecutionController {
    if (!controllerInstance) {
        controllerInstance = new ExecutionController()
    }
    return controllerInstance
}

export function resetExecutionController(): void {
    controllerInstance = null
}
