/**
 * DAG Service Tests
 */

import { resolveDag, getJobLevels, getJobsByLevel, computeEffectiveDag, getEdges, validateConfig, getJobsByCategory, filterJobsByCategory } from '../services/dagService.js'
import type { JobsConfig } from '../types.js'

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
        'job-d': {
            module: 'module1',
            class: 'com.example.JobD',
            category: 'gold',
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
        'job-standalone': {
            module: 'module1',
            class: 'com.example.Standalone',
            category: 'utility',
            description: 'Standalone job - no dependencies',
        },
    },
})

// ============================================================================
// resolveDag Tests
// ============================================================================

describe('resolveDag', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should resolve a single job with no dependencies', () => {
        const result = resolveDag(config, 'job-a')
        expect(result).toEqual(['job-a'])
    })

    it('should resolve a job with one dependency', () => {
        const result = resolveDag(config, 'job-b')
        expect(result).toEqual(['job-a', 'job-b'])
    })

    it('should resolve a job with multiple dependencies', () => {
        const result = resolveDag(config, 'job-d')
        expect(result).toContain('job-a')
        expect(result).toContain('job-b')
        expect(result).toContain('job-c')
        expect(result).toContain('job-d')
        // job-a must come before job-b and job-c
        expect(result.indexOf('job-a')).toBeLessThan(result.indexOf('job-b'))
        expect(result.indexOf('job-a')).toBeLessThan(result.indexOf('job-c'))
        // job-b and job-c must come before job-d
        expect(result.indexOf('job-b')).toBeLessThan(result.indexOf('job-d'))
        expect(result.indexOf('job-c')).toBeLessThan(result.indexOf('job-d'))
    })

    it('should resolve deep dependency chains', () => {
        const result = resolveDag(config, 'job-e')
        expect(result).toHaveLength(5)
        expect(result).toContain('job-a')
        expect(result).toContain('job-b')
        expect(result).toContain('job-c')
        expect(result).toContain('job-d')
        expect(result).toContain('job-e')
        expect(result.indexOf('job-d')).toBeLessThan(result.indexOf('job-e'))
    })

    it('should throw for non-existent job', () => {
        expect(() => resolveDag(config, 'non-existent')).toThrow("Job 'non-existent' not found in configuration")
    })

    it('should throw for circular dependency', () => {
        config.jobs['job-a'].dependsOn = ['job-b']
        expect(() => resolveDag(config, 'job-a')).toThrow('Circular dependency')
    })

    it('should throw for missing dependency', () => {
        config.jobs['job-a'].dependsOn = ['missing-job']
        expect(() => resolveDag(config, 'job-a')).toThrow("Dependency 'missing-job' not found in configuration")
    })
})

// ============================================================================
// getJobLevels Tests
// ============================================================================

describe('getJobLevels', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should assign level 0 to jobs with no dependencies', () => {
        const effectiveDag = ['job-a']
        const levels = getJobLevels(config, effectiveDag)
        expect(levels.get('job-a')).toBe(0)
    })

    it('should assign correct levels in a chain', () => {
        const effectiveDag = ['job-a', 'job-b']
        const levels = getJobLevels(config, effectiveDag)
        expect(levels.get('job-a')).toBe(0)
        expect(levels.get('job-b')).toBe(1)
    })

    it('should handle diamond dependencies', () => {
        const effectiveDag = ['job-a', 'job-b', 'job-c', 'job-d']
        const levels = getJobLevels(config, effectiveDag)
        expect(levels.get('job-a')).toBe(0)
        expect(levels.get('job-b')).toBe(1)
        expect(levels.get('job-c')).toBe(1)
        expect(levels.get('job-d')).toBe(2)
    })

    it('should only consider dependencies in the effective DAG', () => {
        // job-b depends on job-a, but if job-a isn't in the DAG, job-b is level 0
        const effectiveDag = ['job-b']
        const levels = getJobLevels(config, effectiveDag)
        expect(levels.get('job-b')).toBe(0)
    })
})

// ============================================================================
// getJobsByLevel Tests
// ============================================================================

describe('getJobsByLevel', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should group jobs by level', () => {
        const effectiveDag = ['job-a', 'job-b', 'job-c', 'job-d']
        const byLevel = getJobsByLevel(config, effectiveDag)

        expect(byLevel.get(0)).toEqual(['job-a'])
        expect(byLevel.get(1)?.sort()).toEqual(['job-b', 'job-c'])
        expect(byLevel.get(2)).toEqual(['job-d'])
    })

    it('should handle single job', () => {
        const effectiveDag = ['job-a']
        const byLevel = getJobsByLevel(config, effectiveDag)

        expect(byLevel.size).toBe(1)
        expect(byLevel.get(0)).toEqual(['job-a'])
    })

    it('should handle complex DAG', () => {
        const effectiveDag = ['job-a', 'job-b', 'job-c', 'job-d', 'job-e']
        const byLevel = getJobsByLevel(config, effectiveDag)

        expect(byLevel.get(0)).toEqual(['job-a'])
        expect(byLevel.get(1)?.sort()).toEqual(['job-b', 'job-c'])
        expect(byLevel.get(2)).toEqual(['job-d'])
        expect(byLevel.get(3)).toEqual(['job-e'])
    })
})

// ============================================================================
// computeEffectiveDag Tests
// ============================================================================

describe('computeEffectiveDag', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should compute DAG for single job', () => {
        const result = computeEffectiveDag(config, new Set(['job-a']))
        expect(result).toEqual(['job-a'])
    })

    it('should compute DAG for job with dependencies', () => {
        const result = computeEffectiveDag(config, new Set(['job-d']))
        expect(result).toContain('job-a')
        expect(result).toContain('job-b')
        expect(result).toContain('job-c')
        expect(result).toContain('job-d')
    })

    it('should union DAGs for multiple selected jobs', () => {
        const result = computeEffectiveDag(config, new Set(['job-b', 'job-c']))
        // Both depend on job-a
        expect(result).toContain('job-a')
        expect(result).toContain('job-b')
        expect(result).toContain('job-c')
        // job-d is not included
        expect(result).not.toContain('job-d')
    })

    it('should dedupe when jobs share dependencies', () => {
        const result = computeEffectiveDag(config, new Set(['job-b', 'job-c']))
        // job-a should only appear once
        expect(result.filter((j) => j === 'job-a')).toHaveLength(1)
    })

    it('should handle standalone jobs', () => {
        const result = computeEffectiveDag(config, new Set(['job-standalone', 'job-a']))
        expect(result).toContain('job-standalone')
        expect(result).toContain('job-a')
        expect(result).toHaveLength(2)
    })

    it('should maintain topological order', () => {
        const result = computeEffectiveDag(config, new Set(['job-e']))
        // Verify order
        for (let i = 0; i < result.length; i++) {
            const job = result[i]
            const deps = config.jobs[job].dependsOn || []
            for (const dep of deps) {
                if (result.includes(dep)) {
                    expect(result.indexOf(dep)).toBeLessThan(i)
                }
            }
        }
    })
})

// ============================================================================
// getEdges Tests
// ============================================================================

describe('getEdges', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should return empty array for single job', () => {
        const result = getEdges(config, ['job-a'])
        expect(result).toEqual([])
    })

    it('should return edges for simple chain', () => {
        const result = getEdges(config, ['job-a', 'job-b'])
        expect(result).toEqual([{ source: 'job-a', target: 'job-b' }])
    })

    it('should return all edges for diamond DAG', () => {
        const result = getEdges(config, ['job-a', 'job-b', 'job-c', 'job-d'])
        expect(result).toContainEqual({ source: 'job-a', target: 'job-b' })
        expect(result).toContainEqual({ source: 'job-a', target: 'job-c' })
        expect(result).toContainEqual({ source: 'job-b', target: 'job-d' })
        expect(result).toContainEqual({ source: 'job-c', target: 'job-d' })
        expect(result).toHaveLength(4)
    })

    it('should only include edges within effective DAG', () => {
        // job-b depends on job-a, but if job-a isn't in the DAG, no edge
        const result = getEdges(config, ['job-b'])
        expect(result).toEqual([])
    })
})

// ============================================================================
// validateConfig Tests
// ============================================================================

describe('validateConfig', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should return empty array for valid config', () => {
        const errors = validateConfig(config)
        expect(errors).toEqual([])
    })

    it('should detect missing dependency', () => {
        config.jobs['job-a'].dependsOn = ['non-existent']
        const errors = validateConfig(config)
        expect(errors).toContainEqual("Job 'job-a' depends on non-existent job 'non-existent'")
    })

    it('should detect circular dependency', () => {
        config.jobs['job-a'].dependsOn = ['job-b']
        const errors = validateConfig(config)
        expect(errors.some((e) => e.includes('Circular'))).toBe(true)
    })

    it('should detect missing module', () => {
        config.jobs['job-a'].module = 'non-existent-module'
        const errors = validateConfig(config)
        expect(errors).toContainEqual("Job 'job-a' references non-existent module 'non-existent-module'")
    })

    it('should detect missing sparkConfigSet', () => {
        config.jobs['job-a'].sparkConfigSet = 'non-existent-set'
        const errors = validateConfig(config)
        expect(errors).toContainEqual("Job 'job-a' references non-existent sparkConfigSet 'non-existent-set'")
    })

    it('should detect empty jobs', () => {
        config.jobs = {}
        const errors = validateConfig(config)
        expect(errors).toContainEqual('Configuration must have at least one job')
    })
})

// ============================================================================
// getJobsByCategory Tests
// ============================================================================

describe('getJobsByCategory', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should group jobs by category', () => {
        const result = getJobsByCategory(config)
        expect(result['bronze']?.sort()).toEqual(['job-a', 'job-b'])
        expect(result['silver']).toEqual(['job-c'])
        expect(result['gold']?.sort()).toEqual(['job-d', 'job-e'])
        expect(result['utility']).toEqual(['job-standalone'])
    })

    it('should return empty object for empty config', () => {
        config.jobs = {}
        const result = getJobsByCategory(config)
        expect(result).toEqual({})
    })

    it('should sort jobs within each category', () => {
        const result = getJobsByCategory(config)
        for (const jobs of Object.values(result)) {
            const sorted = [...jobs].sort()
            expect(jobs).toEqual(sorted)
        }
    })
})

// ============================================================================
// filterJobsByCategory Tests
// ============================================================================

describe('filterJobsByCategory', () => {
    let config: JobsConfig

    beforeEach(() => {
        config = createTestConfig()
    })

    it('should filter by single category', () => {
        const result = filterJobsByCategory(config, ['bronze'])
        expect(result.sort()).toEqual(['job-a', 'job-b'])
    })

    it('should filter by multiple categories', () => {
        const result = filterJobsByCategory(config, ['bronze', 'silver'])
        expect(result.sort()).toEqual(['job-a', 'job-b', 'job-c'])
    })

    it('should be case-insensitive', () => {
        const result = filterJobsByCategory(config, ['BRONZE', 'Silver'])
        expect(result.sort()).toEqual(['job-a', 'job-b', 'job-c'])
    })

    it('should return empty array for non-existent category', () => {
        const result = filterJobsByCategory(config, ['non-existent'])
        expect(result).toEqual([])
    })

    it('should return sorted results', () => {
        const result = filterJobsByCategory(config, ['gold'])
        expect(result).toEqual(['job-d', 'job-e'])
    })
})
