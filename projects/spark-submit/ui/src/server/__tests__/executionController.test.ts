/**
 * Unit tests for Execution Controller
 */

import { ExecutionController, JobExecutor, resetExecutionController } from '../executionController'
import { JobsConfig, JobStatus, ExecutionStatus } from '../types'
import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

// Mock job executor for testing
class MockJobExecutor implements JobExecutor {
    public executedJobs: string[] = []
    public jobResults: Map<string, { exitCode: number; delay: number }> = new Map()
    private defaultDelay = 10
    private defaultExitCode = 0

    setJobResult(jobName: string, exitCode: number, delay: number = 10): void {
        this.jobResults.set(jobName, { exitCode, delay })
    }

    setDefaultResult(exitCode: number, delay: number = 10): void {
        this.defaultExitCode = exitCode
        this.defaultDelay = delay
    }

    async execute(
        jobName: string,
        config: JobsConfig
    ): Promise<{
        process: ChildProcess
        exitCode: Promise<number>
    }> {
        this.executedJobs.push(jobName)

        const result = this.jobResults.get(jobName) || {
            exitCode: this.defaultExitCode,
            delay: this.defaultDelay,
        }

        // Create a mock process
        const mockProcess = new EventEmitter() as ChildProcess
        mockProcess.stdout = new EventEmitter() as any
        mockProcess.stderr = new EventEmitter() as any
        mockProcess.kill = jest.fn(() => true)

        // Simulate async execution
        const exitCode = new Promise<number>((resolve) => {
            setTimeout(() => {
                mockProcess.stdout?.emit('data', Buffer.from(`Output for ${jobName}\n`))
                resolve(result.exitCode)
            }, result.delay)
        })

        return { process: mockProcess, exitCode }
    }

    reset(): void {
        this.executedJobs = []
        this.jobResults.clear()
    }
}

// Test fixtures
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
    modules: {},
    sparkConfigSets: {},
    jobs: {
        'job-a': {
            module: 'module1',
            class: 'com.example.JobA',
            category: 'bronze',
            description: 'Job A - no dependencies',
        },
        'job-b': {
            module: 'module1',
            class: 'com.example.JobB',
            category: 'bronze',
            description: 'Job B - depends on A',
            dependsOn: ['job-a'],
        },
        'job-c': {
            module: 'module1',
            class: 'com.example.JobC',
            category: 'silver',
            description: 'Job C - depends on A',
            dependsOn: ['job-a'],
        },
        'job-d': {
            module: 'module1',
            class: 'com.example.JobD',
            category: 'gold',
            description: 'Job D - depends on B and C',
            dependsOn: ['job-b', 'job-c'],
        },
    },
})

describe('ExecutionController', () => {
    let controller: ExecutionController
    let mockExecutor: MockJobExecutor
    let config: JobsConfig

    beforeEach(() => {
        resetExecutionController()
        mockExecutor = new MockJobExecutor()
        controller = new ExecutionController(mockExecutor)
        config = createTestConfig()
        controller.setConfig(config)
    })

    afterEach(() => {
        mockExecutor.reset()
    })

    describe('configuration', () => {
        it('should set and get configuration', () => {
            expect(controller.getConfig()).toEqual(config)
        })

        it('should return null when no config is set', () => {
            const emptyController = new ExecutionController(mockExecutor)
            expect(emptyController.getConfig()).toBeNull()
        })
    })

    describe('session management', () => {
        it('should return null session initially', () => {
            expect(controller.getSession()).toBeNull()
        })

        it('should not be executing initially', () => {
            expect(controller.isExecuting()).toBe(false)
        })
    })

    describe('submit', () => {
        it('should throw error when config not loaded', async () => {
            const emptyController = new ExecutionController(mockExecutor)
            await expect(emptyController.submit({ selectedJobs: ['job-a'] })).rejects.toThrow('Configuration not loaded')
        })

        it('should throw error when no jobs selected', async () => {
            await expect(controller.submit({ selectedJobs: [] })).rejects.toThrow('No jobs selected')
        })

        it('should create session with correct effective DAG', async () => {
            const session = await controller.submit({ selectedJobs: ['job-d'] })

            expect(session.selectedJobs).toEqual(['job-d'])
            // Effective DAG should include all dependencies
            expect(session.effectiveDag).toContain('job-a')
            expect(session.effectiveDag).toContain('job-b')
            expect(session.effectiveDag).toContain('job-c')
            expect(session.effectiveDag).toContain('job-d')
        })

        it('should initialize job states for all jobs in DAG', async () => {
            const session = await controller.submit({ selectedJobs: ['job-b'] })

            // All jobs in the effective DAG should have states
            for (const jobName of session.effectiveDag) {
                expect(session.jobStates[jobName]).toBeDefined()
                // Jobs can be pending, running, or even success (for fast mock jobs)
                expect(['pending', 'running', 'success']).toContain(session.jobStates[jobName].status)
            }
        })

        it('should set default maxParallel to 8', async () => {
            const session = await controller.submit({ selectedJobs: ['job-a'] })
            expect(session.maxParallel).toBe(8)
        })

        it('should use provided maxParallel', async () => {
            const session = await controller.submit({
                selectedJobs: ['job-a'],
                maxParallel: 4,
            })
            expect(session.maxParallel).toBe(4)
        })

        it('should resolve dependencies by default when noDag is false', async () => {
            const session = await controller.submit({ selectedJobs: ['job-d'] })

            // Effective DAG should include all dependencies
            expect(session.effectiveDag).toContain('job-a')
            expect(session.effectiveDag).toContain('job-b')
            expect(session.effectiveDag).toContain('job-c')
            expect(session.effectiveDag).toContain('job-d')
        })

        it('should only run selected jobs when noDag is true', async () => {
            const session = await controller.submit({
                selectedJobs: ['job-d'],
                noDag: true,
            })

            // Effective DAG should only include the selected job, not dependencies
            expect(session.effectiveDag).toEqual(['job-d'])
            expect(session.effectiveDag).not.toContain('job-a')
            expect(session.effectiveDag).not.toContain('job-b')
            expect(session.effectiveDag).not.toContain('job-c')
        })

        it('should run multiple selected jobs without dependencies when noDag is true', async () => {
            const session = await controller.submit({
                selectedJobs: ['job-b', 'job-c'],
                noDag: true,
            })

            // Effective DAG should only include selected jobs
            expect(session.effectiveDag).toContain('job-b')
            expect(session.effectiveDag).toContain('job-c')
            expect(session.effectiveDag).not.toContain('job-a')
            expect(session.effectiveDag).not.toContain('job-d')
        })

        it('should throw error if execution already in progress', async () => {
            mockExecutor.setDefaultResult(0, 1000) // Slow execution

            const firstSubmit = controller.submit({ selectedJobs: ['job-a'] })

            // Wait a bit for execution to start
            await new Promise((r) => setTimeout(r, 10))

            await expect(controller.submit({ selectedJobs: ['job-b'] })).rejects.toThrow('An execution is already in progress')

            // Clean up
            await controller.stop()
            await firstSubmit
        })
    })

    describe('execution flow', () => {
        it('should execute single job successfully', async () => {
            mockExecutor.setDefaultResult(0, 10)

            await controller.submit({ selectedJobs: ['job-a'] })

            // Wait for execution to complete
            await waitForSessionStatus(controller, 'completed')

            const session = controller.getSession()
            expect(session?.status).toBe('completed')
            expect(session?.jobStates['job-a'].status).toBe('success')
            expect(mockExecutor.executedJobs).toContain('job-a')
        })

        it('should execute jobs in dependency order', async () => {
            mockExecutor.setDefaultResult(0, 10)

            await controller.submit({ selectedJobs: ['job-b'] })

            await waitForSessionStatus(controller, 'completed')

            // job-a should have been executed before job-b
            const aIndex = mockExecutor.executedJobs.indexOf('job-a')
            const bIndex = mockExecutor.executedJobs.indexOf('job-b')
            expect(aIndex).toBeLessThan(bIndex)
        })

        it('should execute independent jobs in parallel', async () => {
            mockExecutor.setDefaultResult(0, 10)

            await controller.submit({ selectedJobs: ['job-d'], maxParallel: 4 })

            await waitForSessionStatus(controller, 'completed')

            // job-b and job-c should both be executed (they're at the same level)
            expect(mockExecutor.executedJobs).toContain('job-b')
            expect(mockExecutor.executedJobs).toContain('job-c')
        })

        it('should stop execution when job fails', async () => {
            mockExecutor.setJobResult('job-a', 1, 10) // job-a fails
            mockExecutor.setDefaultResult(0, 10)

            await controller.submit({ selectedJobs: ['job-b'] })

            await waitForSessionStatus(controller, 'failed')

            const session = controller.getSession()
            expect(session?.status).toBe('failed')
            expect(session?.jobStates['job-a'].status).toBe('failed')
            // job-b should be cancelled because job-a failed
            expect(session?.jobStates['job-b'].status).toBe('cancelled')
        })

        it('should respect maxParallel limit', async () => {
            let concurrentJobs = 0
            let maxConcurrent = 0

            const trackingExecutor: JobExecutor = {
                async execute(jobName: string, config: JobsConfig) {
                    concurrentJobs++
                    maxConcurrent = Math.max(maxConcurrent, concurrentJobs)

                    const mockProcess = new EventEmitter() as ChildProcess
                    mockProcess.stdout = new EventEmitter() as any
                    mockProcess.stderr = new EventEmitter() as any
                    mockProcess.kill = jest.fn(() => true)

                    const exitCode = new Promise<number>((resolve) => {
                        setTimeout(() => {
                            concurrentJobs--
                            resolve(0)
                        }, 50)
                    })

                    return { process: mockProcess, exitCode }
                },
            }

            const limitedController = new ExecutionController(trackingExecutor)
            limitedController.setConfig(config)

            await limitedController.submit({ selectedJobs: ['job-d'], maxParallel: 1 })

            await waitForSessionStatus(limitedController, 'completed')

            // With maxParallel=1, only 1 job should run at a time
            expect(maxConcurrent).toBe(1)
        })
    })

    describe('stop', () => {
        it('should cancel running execution', async () => {
            mockExecutor.setDefaultResult(0, 1000) // Slow execution

            await controller.submit({ selectedJobs: ['job-d'] })

            // Wait a bit for execution to start
            await new Promise((r) => setTimeout(r, 50))

            await controller.stop()

            const session = controller.getSession()
            expect(session?.status).toBe('cancelled')
        })

        it('should mark running jobs as cancelled', async () => {
            mockExecutor.setDefaultResult(0, 1000) // Slow execution

            await controller.submit({ selectedJobs: ['job-b'] })

            // Wait for job-a to complete and job-b to potentially start
            await new Promise((r) => setTimeout(r, 50))

            await controller.stop()

            const session = controller.getSession()
            // Any job that was running or pending should be cancelled
            const statuses = Object.values(session?.jobStates || {}).map((s) => s.status)
            expect(statuses.every((s) => s === 'success' || s === 'cancelled')).toBe(true)
        })
    })

    describe('reset', () => {
        it('should throw error if execution in progress', async () => {
            mockExecutor.setDefaultResult(0, 1000)
            await controller.submit({ selectedJobs: ['job-a'] })

            await new Promise((r) => setTimeout(r, 10))

            expect(() => controller.reset()).toThrow('Cannot reset while execution is in progress')

            await controller.stop()
        })

        it('should clear session after execution completes', async () => {
            mockExecutor.setDefaultResult(0, 10)
            await controller.submit({ selectedJobs: ['job-a'] })

            await waitForSessionStatus(controller, 'completed')

            controller.reset()

            expect(controller.getSession()).toBeNull()
        })
    })

    describe('getJobLogs', () => {
        it('should return null when no session', () => {
            expect(controller.getJobLogs('job-a')).toBeNull()
        })

        it('should return null for non-existent job', async () => {
            mockExecutor.setDefaultResult(0, 10)
            await controller.submit({ selectedJobs: ['job-a'] })

            await waitForSessionStatus(controller, 'completed')

            expect(controller.getJobLogs('non-existent')).toBeNull()
        })

        it('should return logs for executed job', async () => {
            mockExecutor.setDefaultResult(0, 10)
            await controller.submit({ selectedJobs: ['job-a'] })

            await waitForSessionStatus(controller, 'completed')

            const logs = controller.getJobLogs('job-a')
            expect(logs).not.toBeNull()
            expect(logs?.output).toContain('Output for job-a')
        })
    })

    describe('getRunningCount', () => {
        it('should return 0 when no execution', () => {
            expect(controller.getRunningCount()).toBe(0)
        })
    })
})

// Helper function to wait for session status
async function waitForSessionStatus(controller: ExecutionController, status: ExecutionStatus, timeout: number = 5000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const session = controller.getSession()
        if (session?.status === status) {
            return
        }
        if (session?.status === 'failed' || session?.status === 'cancelled') {
            if (status !== 'failed' && status !== 'cancelled') {
                // Unexpected terminal state
                break
            }
        }
        await new Promise((r) => setTimeout(r, 10))
    }
}

// Helper function to wait for a specific job to reach a status
async function waitForJobStatus(controller: ExecutionController, jobName: string, status: JobStatus, timeout: number = 5000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        const session = controller.getSession()
        if (session?.jobStates[jobName]?.status === status) {
            return
        }
        await new Promise((r) => setTimeout(r, 10))
    }
}

/**
 * Test configuration that mimics the real spark-jobs.yaml structure:
 *
 * Independent bronze jobs (level 0):
 *   - bronze-a (no deps) -> silver-a (depends on bronze-a) -> gold-a
 *   - bronze-b (no deps) -> silver-b (depends on bronze-b) -> gold-b
 *
 * These are two completely independent pipelines that happen to share
 * the same level structure but have no cross-dependencies.
 *
 * BUG: When bronze-a is slow/stuck, silver-b should still be able to start
 * after bronze-b completes. Currently, the level-based execution blocks
 * ALL level 1 jobs (including silver-b) until ALL level 0 jobs complete.
 */
const createIndependentPipelinesConfig = (): JobsConfig => ({
    defaults: {
        sparkHome: '/spark',
        sparkConfDir: '/conf',
        ivyDir: '/ivy',
        tempDir: '/tmp',
        heapDumpDir: '/dumps',
        logsDir: '/logs',
    },
    additionalJars: [],
    modules: {},
    sparkConfigSets: {},
    jobs: {
        // Pipeline A: bronze-a -> silver-a -> gold-a
        'bronze-a': {
            module: 'module1',
            class: 'com.example.BronzeA',
            category: 'bronze',
            description: 'Bronze A - no dependencies',
        },
        'silver-a': {
            module: 'module1',
            class: 'com.example.SilverA',
            category: 'silver',
            description: 'Silver A - depends only on bronze-a',
            dependsOn: ['bronze-a'],
        },
        'gold-a': {
            module: 'module1',
            class: 'com.example.GoldA',
            category: 'gold',
            description: 'Gold A - depends only on silver-a',
            dependsOn: ['silver-a'],
        },
        // Pipeline B: bronze-b -> silver-b -> gold-b (completely independent from A)
        'bronze-b': {
            module: 'module1',
            class: 'com.example.BronzeB',
            category: 'bronze',
            description: 'Bronze B - no dependencies',
        },
        'silver-b': {
            module: 'module1',
            class: 'com.example.SilverB',
            category: 'silver',
            description: 'Silver B - depends only on bronze-b',
            dependsOn: ['bronze-b'],
        },
        'gold-b': {
            module: 'module1',
            class: 'com.example.GoldB',
            category: 'gold',
            description: 'Gold B - depends only on silver-b',
            dependsOn: ['silver-b'],
        },
    },
})

/**
 * Mock executor that tracks when each job STARTS executing (not when it finishes).
 * This is crucial for demonstrating the blocking bug.
 */
class TimingMockExecutor implements JobExecutor {
    public jobStartTimes: Map<string, number> = new Map()
    public jobEndTimes: Map<string, number> = new Map()
    public jobDurations: Map<string, number> = new Map()
    private startTime: number = 0
    private defaultDuration = 10
    private defaultExitCode = 0

    reset(): void {
        this.jobStartTimes.clear()
        this.jobEndTimes.clear()
        this.jobDurations.clear()
    }

    setStartTime(time: number): void {
        this.startTime = time
    }

    setJobDuration(jobName: string, duration: number): void {
        this.jobDurations.set(jobName, duration)
    }

    setDefaultDuration(duration: number): void {
        this.defaultDuration = duration
    }

    async execute(
        jobName: string,
        _config: JobsConfig
    ): Promise<{
        process: ChildProcess
        exitCode: Promise<number>
    }> {
        // Record when this job STARTED (relative to test start)
        const relativeStartTime = Date.now() - this.startTime
        this.jobStartTimes.set(jobName, relativeStartTime)

        const duration = this.jobDurations.get(jobName) ?? this.defaultDuration

        const mockProcess = new EventEmitter() as ChildProcess
        mockProcess.stdout = new EventEmitter() as any
        mockProcess.stderr = new EventEmitter() as any
        mockProcess.kill = jest.fn(() => true)

        const exitCode = new Promise<number>((resolve) => {
            setTimeout(() => {
                const relativeEndTime = Date.now() - this.startTime
                this.jobEndTimes.set(jobName, relativeEndTime)
                mockProcess.stdout?.emit('data', Buffer.from(`Output for ${jobName}\n`))
                resolve(this.defaultExitCode)
            }, duration)
        })

        return { process: mockProcess, exitCode }
    }
}

describe('ExecutionController - Independent Pipeline Bug', () => {
    let controller: ExecutionController
    let timingExecutor: TimingMockExecutor

    beforeEach(() => {
        resetExecutionController()
        timingExecutor = new TimingMockExecutor()
        controller = new ExecutionController(timingExecutor)
        controller.setConfig(createIndependentPipelinesConfig())
    })

    afterEach(() => {
        timingExecutor.reset()
    })

    /**
     * Test that the session waits for ALL jobs to complete before marking as completed.
     * This verifies that jobs are not orphaned.
     */
    it('should wait for all jobs to complete before marking session as completed', async () => {
        // bronze-a is slow (300ms), bronze-b is fast (20ms)
        timingExecutor.setJobDuration('bronze-a', 300)
        timingExecutor.setJobDuration('bronze-b', 20)
        timingExecutor.setDefaultDuration(20)

        const testStartTime = Date.now()
        timingExecutor.setStartTime(testStartTime)

        await controller.submit({ selectedJobs: ['gold-a', 'gold-b'], maxParallel: 8 })

        // Wait for session to complete
        await waitForSessionStatus(controller, 'completed', 3000)

        const session = controller.getSession()
        const bronzeAState = session?.jobStates['bronze-a']

        console.log('Session status:', session?.status)
        console.log('bronze-a state:', bronzeAState?.status)

        // Session should be completed AND bronze-a should be success (not running/orphaned)
        expect(session?.status).toBe('completed')
        expect(bronzeAState?.status).toBe('success')
    })

    /**
     * Test true DAG execution: silver-b should start immediately after bronze-b completes,
     * without waiting for bronze-a (which it doesn't depend on).
     */
    it('should allow silver-b to start immediately after bronze-b completes (true DAG execution)', async () => {
        // Setup: bronze-a slow (300ms), bronze-b fast (20ms)
        timingExecutor.setJobDuration('bronze-a', 300)
        timingExecutor.setJobDuration('bronze-b', 20)
        timingExecutor.setDefaultDuration(20)

        const testStartTime = Date.now()
        timingExecutor.setStartTime(testStartTime)

        await controller.submit({ selectedJobs: ['gold-a', 'gold-b'], maxParallel: 8 })
        await waitForSessionStatus(controller, 'completed', 3000)

        const silverBStartTime = timingExecutor.jobStartTimes.get('silver-b')!
        const bronzeBEndTime = timingExecutor.jobEndTimes.get('bronze-b')!
        const bronzeAEndTime = timingExecutor.jobEndTimes.get('bronze-a')!

        console.log('silver-b started at:', silverBStartTime)
        console.log('bronze-b ended at:', bronzeBEndTime)
        console.log('bronze-a ended at:', bronzeAEndTime)

        // silver-b should start shortly after bronze-b ends (~20ms), not after bronze-a (~300ms)
        // Allow some overhead but it should definitely be < 100ms
        expect(silverBStartTime).toBeLessThan(100)

        // silver-b should start BEFORE bronze-a ends (true DAG execution)
        expect(silverBStartTime).toBeLessThan(bronzeAEndTime)
    })

    /**
     * Test that all jobs complete successfully with no orphaned jobs.
     */
    it('should complete all jobs successfully with no orphaned jobs', async () => {
        timingExecutor.setJobDuration('bronze-a', 300)
        timingExecutor.setJobDuration('bronze-b', 20)
        timingExecutor.setDefaultDuration(20)

        const testStartTime = Date.now()
        timingExecutor.setStartTime(testStartTime)

        await controller.submit({ selectedJobs: ['gold-a', 'gold-b'], maxParallel: 8 })
        await waitForSessionStatus(controller, 'completed', 3000)

        const session = controller.getSession()
        const allJobStates = Object.entries(session?.jobStates || {})

        console.log('All job states:')
        allJobStates.forEach(([name, state]) => {
            console.log(`  ${name}: ${state.status}`)
        })

        // All jobs should be 'success', none should be 'running' or 'pending'
        const nonSuccessJobs = allJobStates.filter(([_, state]) => state.status !== 'success')

        expect(nonSuccessJobs.length).toBe(0)
    })

    /**
     * Test that pipeline B completes quickly while pipeline A is still running.
     */
    it('should allow pipeline B to complete quickly while pipeline A is still running', async () => {
        timingExecutor.setJobDuration('bronze-a', 300)
        timingExecutor.setJobDuration('bronze-b', 20)
        timingExecutor.setDefaultDuration(20)

        const testStartTime = Date.now()
        timingExecutor.setStartTime(testStartTime)

        await controller.submit({ selectedJobs: ['gold-a', 'gold-b'], maxParallel: 8 })
        await waitForSessionStatus(controller, 'completed', 3000)

        const goldBEndTime = timingExecutor.jobEndTimes.get('gold-b')!

        console.log('gold-b completed at:', goldBEndTime)

        // With true DAG execution:
        // - bronze-b: 0-20ms
        // - silver-b: 20-40ms  (starts immediately after bronze-b)
        // - gold-b: 40-60ms
        // So gold-b should complete around 60-80ms
        expect(goldBEndTime).toBeLessThan(150)
    })
})
