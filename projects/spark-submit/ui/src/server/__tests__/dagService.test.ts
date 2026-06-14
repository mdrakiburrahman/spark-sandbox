/**
 * Unit tests for DAG Service
 */

import { resolveDag, getJobsByLevel, computeEffectiveDag, getEdges, validateConfig } from '../dagService'
import { JobsConfig } from '../types'

// Test fixtures
const createSimpleConfig = (): JobsConfig => ({
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
            category: 'silver',
            description: 'Job D - depends on B and C',
            dependsOn: ['job-b', 'job-c'],
        },
        'job-e': {
            module: 'module1',
            class: 'com.example.JobE',
            category: 'gold',
            description: 'Job E - depends on D',
            dependsOn: ['job-d'],
        },
    },
})

const createConfigWithCircularDep = (): JobsConfig => ({
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
        'job-x': {
            module: 'module1',
            class: 'com.example.JobX',
            category: 'bronze',
            description: 'Job X - depends on Z (circular)',
            dependsOn: ['job-z'],
        },
        'job-y': {
            module: 'module1',
            class: 'com.example.JobY',
            category: 'bronze',
            description: 'Job Y - depends on X',
            dependsOn: ['job-x'],
        },
        'job-z': {
            module: 'module1',
            class: 'com.example.JobZ',
            category: 'bronze',
            description: 'Job Z - depends on Y (circular)',
            dependsOn: ['job-y'],
        },
    },
})

describe('dagService', () => {
    describe('resolveDag', () => {
        it('should return single job for job with no dependencies', () => {
            const config = createSimpleConfig()
            const result = resolveDag(config, 'job-a')
            expect(result).toEqual(['job-a'])
        })

        it('should return job and its dependency in correct order', () => {
            const config = createSimpleConfig()
            const result = resolveDag(config, 'job-b')
            expect(result).toEqual(['job-a', 'job-b'])
        })

        it('should return full dependency chain in topological order', () => {
            const config = createSimpleConfig()
            const result = resolveDag(config, 'job-d')

            // job-a must come before job-b and job-c
            // job-b and job-c must come before job-d
            expect(result.indexOf('job-a')).toBeLessThan(result.indexOf('job-b'))
            expect(result.indexOf('job-a')).toBeLessThan(result.indexOf('job-c'))
            expect(result.indexOf('job-b')).toBeLessThan(result.indexOf('job-d'))
            expect(result.indexOf('job-c')).toBeLessThan(result.indexOf('job-d'))
            expect(result).toContain('job-d')
        })

        it('should throw error for non-existent job', () => {
            const config = createSimpleConfig()
            expect(() => resolveDag(config, 'non-existent')).toThrow("Job 'non-existent' not found in configuration")
        })

        it('should throw error for circular dependency', () => {
            const config = createConfigWithCircularDep()
            expect(() => resolveDag(config, 'job-x')).toThrow(/Circular dependency/)
        })
    })

    describe('getJobsByLevel', () => {
        it('should group jobs by dependency level', () => {
            const config = createSimpleConfig()
            const jobsToRun = ['job-a', 'job-b', 'job-c', 'job-d']
            const result = getJobsByLevel(config, jobsToRun)

            expect(result.get(0)).toEqual(['job-a'])
            expect(result.get(1)?.sort()).toEqual(['job-b', 'job-c'])
            expect(result.get(2)).toEqual(['job-d'])
        })

        it('should handle single job with no dependencies', () => {
            const config = createSimpleConfig()
            const result = getJobsByLevel(config, ['job-a'])

            expect(result.get(0)).toEqual(['job-a'])
            expect(result.size).toBe(1)
        })

        it('should handle empty jobs array', () => {
            const config = createSimpleConfig()
            const result = getJobsByLevel(config, [])

            expect(result.size).toBe(0)
        })

        it('should only consider dependencies within jobsToRun', () => {
            const config = createSimpleConfig()
            // If we only include job-d without its dependencies,
            // it should be at level 0 since its deps aren't in the list
            const result = getJobsByLevel(config, ['job-d'])

            expect(result.get(0)).toEqual(['job-d'])
        })
    })

    describe('computeEffectiveDag', () => {
        it('should compute union of dependencies for multiple selected jobs', () => {
            const config = createSimpleConfig()
            const result = computeEffectiveDag(config, new Set(['job-b', 'job-c']))

            // Should include job-a (shared dep), job-b, job-c
            expect(result).toContain('job-a')
            expect(result).toContain('job-b')
            expect(result).toContain('job-c')
            expect(result.length).toBe(3)
        })

        it('should deduplicate shared dependencies', () => {
            const config = createSimpleConfig()
            const result = computeEffectiveDag(config, new Set(['job-d', 'job-e']))

            // job-a should appear only once even though it's a dependency of multiple jobs
            const jobACount = result.filter((j) => j === 'job-a').length
            expect(jobACount).toBe(1)
        })

        it('should return jobs in topological order', () => {
            const config = createSimpleConfig()
            const result = computeEffectiveDag(config, new Set(['job-e']))

            // Level 0 jobs should come first
            expect(result[0]).toBe('job-a')
            // Level 3 job should come last
            expect(result[result.length - 1]).toBe('job-e')
        })

        it('should accept array input', () => {
            const config = createSimpleConfig()
            const result = computeEffectiveDag(config, ['job-b'])

            expect(result).toEqual(['job-a', 'job-b'])
        })

        it('should throw error for non-existent selected job', () => {
            const config = createSimpleConfig()
            expect(() => computeEffectiveDag(config, new Set(['non-existent']))).toThrow("Selected job 'non-existent' not found in configuration")
        })
    })

    describe('getEdges', () => {
        it('should return all dependency edges', () => {
            const config = createSimpleConfig()
            const edges = getEdges(config)

            expect(edges).toContainEqual({ source: 'job-a', target: 'job-b' })
            expect(edges).toContainEqual({ source: 'job-a', target: 'job-c' })
            expect(edges).toContainEqual({ source: 'job-b', target: 'job-d' })
            expect(edges).toContainEqual({ source: 'job-c', target: 'job-d' })
            expect(edges).toContainEqual({ source: 'job-d', target: 'job-e' })
        })

        it('should handle jobs with no dependencies', () => {
            const config: JobsConfig = {
                ...createSimpleConfig(),
                jobs: {
                    standalone: {
                        module: 'module1',
                        class: 'com.example.Standalone',
                        category: 'bronze',
                        description: 'Standalone job',
                    },
                },
            }
            const edges = getEdges(config)

            expect(edges.length).toBe(0)
        })
    })

    describe('validateConfig', () => {
        it('should return no errors for valid config', () => {
            const config = createSimpleConfig()
            const errors = validateConfig(config)

            expect(errors).toEqual([])
        })

        it('should detect missing module field', () => {
            const config = createSimpleConfig()
            ;(config.jobs['job-a'] as any).module = undefined
            const errors = validateConfig(config)

            expect(errors).toContain("Job 'job-a' is missing required field 'module'")
        })

        it('should detect missing class field', () => {
            const config = createSimpleConfig()
            ;(config.jobs['job-a'] as any).class = undefined
            const errors = validateConfig(config)

            expect(errors).toContain("Job 'job-a' is missing required field 'class'")
        })

        it('should detect missing category field', () => {
            const config = createSimpleConfig()
            ;(config.jobs['job-a'] as any).category = undefined
            const errors = validateConfig(config)

            expect(errors).toContain("Job 'job-a' is missing required field 'category'")
        })

        it('should detect unknown dependency', () => {
            const config = createSimpleConfig()
            config.jobs['job-a'].dependsOn = ['unknown-job']
            const errors = validateConfig(config)

            expect(errors).toContain("Job 'job-a' depends on unknown job 'unknown-job'")
        })

        it('should detect circular dependency', () => {
            const config = createConfigWithCircularDep()
            const errors = validateConfig(config)

            expect(errors.some((e) => e.includes('Circular dependency'))).toBe(true)
        })
    })
})
