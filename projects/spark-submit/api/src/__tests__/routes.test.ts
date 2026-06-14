/**
 * API Routes Tests
 */

import request from 'supertest'
import { createApp } from '../app.js'
import { setConfig, clearConfig } from '../services/configService.js'
import { resetExecutionService, getExecutionService } from '../services/executionService.js'
import type { JobsConfig } from '../types.js'
import type { Express } from 'express'

// ============================================================================
// Test Fixtures
// ============================================================================

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
    modules: {
        module1: { jarPath: '/jars/module1.jar' },
    },
    sparkConfigSets: {
        default: { 'spark.executor.memory': '2g' },
    },
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
    },
})

// ============================================================================
// Test Setup
// ============================================================================

describe('API Routes', () => {
    let app: Express
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
        setConfig(config)
        // Initialize execution service
        getExecutionService('/project/root')
        app = createApp()
    })

    afterEach(() => {
        resetExecutionService()
        clearConfig()
    })

    // ========================================================================
    // Health Check
    // ========================================================================

    describe('GET /api/health', () => {
        it('should return healthy status', async () => {
            const response = await request(app).get('/api/health')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data.status).toBe('healthy')
            expect(response.body.data.configLoaded).toBe(true)
        })

        it('should include timestamp', async () => {
            const before = Date.now()
            const response = await request(app).get('/api/health')
            const after = Date.now()

            expect(response.body.data.timestamp).toBeGreaterThanOrEqual(before)
            expect(response.body.data.timestamp).toBeLessThanOrEqual(after)
        })
    })

    // ========================================================================
    // Config Routes
    // ========================================================================

    describe('GET /api/config', () => {
        it('should return configuration', async () => {
            const response = await request(app).get('/api/config')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data).toMatchObject(config)
        })

        it('should return 503 when config not loaded', async () => {
            clearConfig()
            const response = await request(app).get('/api/config')

            expect(response.status).toBe(503)
            expect(response.body.success).toBe(false)
            expect(response.body.error).toContain('not loaded')
        })
    })

    describe('GET /api/config/jobs', () => {
        it('should return list of jobs', async () => {
            const response = await request(app).get('/api/config/jobs')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(Array.isArray(response.body.data)).toBe(true)
            expect(response.body.data.length).toBe(3)
        })

        it('should include job names in response', async () => {
            const response = await request(app).get('/api/config/jobs')

            const jobNames = response.body.data.map((j: { name: string }) => j.name)
            expect(jobNames).toContain('job-a')
            expect(jobNames).toContain('job-b')
            expect(jobNames).toContain('job-c')
        })
    })

    describe('GET /api/config/jobs/by-category', () => {
        it('should return jobs grouped by category', async () => {
            const response = await request(app).get('/api/config/jobs/by-category')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data.bronze).toContain('job-a')
            expect(response.body.data.bronze).toContain('job-b')
            expect(response.body.data.silver).toContain('job-c')
        })
    })

    // ========================================================================
    // DAG Routes
    // ========================================================================

    describe('POST /api/dag/compute', () => {
        it('should compute effective DAG', async () => {
            const response = await request(app)
                .post('/api/dag/compute')
                .send({ selectedJobs: ['job-b'] })

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data.effectiveDag).toContain('job-a')
            expect(response.body.data.effectiveDag).toContain('job-b')
        })

        it('should return jobs by level', async () => {
            const response = await request(app)
                .post('/api/dag/compute')
                .send({ selectedJobs: ['job-b'] })

            expect(response.body.data.jobsByLevel['0']).toContain('job-a')
            expect(response.body.data.jobsByLevel['1']).toContain('job-b')
        })

        it('should return edges', async () => {
            const response = await request(app)
                .post('/api/dag/compute')
                .send({ selectedJobs: ['job-b'] })

            expect(response.body.data.edges).toContainEqual({
                source: 'job-a',
                target: 'job-b',
            })
        })

        it('should return 400 for empty selectedJobs', async () => {
            const response = await request(app).post('/api/dag/compute').send({ selectedJobs: [] })

            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
        })

        it('should return 400 for non-existent job', async () => {
            const response = await request(app)
                .post('/api/dag/compute')
                .send({ selectedJobs: ['non-existent'] })

            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
            expect(response.body.error).toContain('not found')
        })
    })

    describe('POST /api/dag/filter', () => {
        it('should filter jobs by category', async () => {
            const response = await request(app)
                .post('/api/dag/filter')
                .send({ categories: ['bronze'] })

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data).toContain('job-a')
            expect(response.body.data).toContain('job-b')
            expect(response.body.data).not.toContain('job-c')
        })

        it('should return 400 for missing categories', async () => {
            const response = await request(app).post('/api/dag/filter').send({})

            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
        })
    })

    // ========================================================================
    // Execution Routes
    // ========================================================================

    describe('GET /api/execution', () => {
        it('should return null session when not executing', async () => {
            const response = await request(app).get('/api/execution')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data.session).toBeNull()
            expect(response.body.data.isExecuting).toBe(false)
        })
    })

    describe('POST /api/execution', () => {
        it('should return 400 for empty selectedJobs', async () => {
            const response = await request(app).post('/api/execution').send({ selectedJobs: [] })

            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
        })

        it('should return 400 for missing selectedJobs', async () => {
            const response = await request(app).post('/api/execution').send({})

            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
        })
    })

    describe('DELETE /api/execution', () => {
        it('should succeed even when not executing', async () => {
            const response = await request(app).delete('/api/execution')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
        })
    })

    describe('POST /api/execution/reset', () => {
        it('should reset execution state', async () => {
            const response = await request(app).post('/api/execution/reset')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
        })
    })

    describe('GET /api/execution/logs/:jobName', () => {
        it('should return 404 when no session', async () => {
            const response = await request(app).get('/api/execution/logs/job-a')

            expect(response.status).toBe(404)
            expect(response.body.success).toBe(false)
        })
    })

    // ========================================================================
    // System Stats Routes
    // ========================================================================

    describe('GET /api/system-stats', () => {
        it('should return system statistics', async () => {
            const response = await request(app).get('/api/system-stats')

            expect(response.status).toBe(200)
            expect(response.body.success).toBe(true)
            expect(response.body.data.cpu).toBeDefined()
            expect(response.body.data.memory).toBeDefined()
            expect(response.body.data.io).toBeDefined()
            expect(response.body.data.fileHandles).toBeDefined()
        })

        it('should include timestamp', async () => {
            const before = Date.now()
            const response = await request(app).get('/api/system-stats')
            const after = Date.now()

            expect(response.body.data.timestamp).toBeGreaterThanOrEqual(before)
            expect(response.body.data.timestamp).toBeLessThanOrEqual(after)
        })
    })

    // ========================================================================
    // 404 Handler
    // ========================================================================

    describe('404 Handler', () => {
        it('should return 404 for unknown routes', async () => {
            const response = await request(app).get('/api/unknown')

            expect(response.status).toBe(404)
            expect(response.body.success).toBe(false)
            expect(response.body.error).toContain('Not found')
        })
    })
})
