/**
 * Config Service Tests
 */

import * as fs from 'fs'
import * as path from 'path'
import { loadConfig, getConfig, setConfig, clearConfig, isConfigLoaded, getConfigPath } from '../services/configService.js'
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
    modules: {},
    sparkConfigSets: {},
    jobs: {
        'job-a': {
            module: 'module1',
            class: 'com.example.JobA',
            category: 'bronze',
            description: 'Job A',
        },
    },
})

// ============================================================================
// Tests
// ============================================================================

describe('configService', () => {
    afterEach(() => {
        clearConfig()
    })

    describe('setConfig/getConfig', () => {
        it('should store and retrieve config', () => {
            const config = createTestConfig()
            setConfig(config)

            expect(getConfig()).toBe(config)
        })

        it('should throw when getting config before setting', () => {
            expect(() => getConfig()).toThrow('not loaded')
        })
    })

    describe('clearConfig', () => {
        it('should clear stored config', () => {
            setConfig(createTestConfig())
            clearConfig()

            expect(isConfigLoaded()).toBe(false)
        })
    })

    describe('isConfigLoaded', () => {
        it('should return false when not loaded', () => {
            expect(isConfigLoaded()).toBe(false)
        })

        it('should return true after setting config', () => {
            setConfig(createTestConfig())
            expect(isConfigLoaded()).toBe(true)
        })
    })

    describe('getConfigPath', () => {
        it('should return null when config set directly', () => {
            setConfig(createTestConfig())
            expect(getConfigPath()).toBeNull()
        })
    })

    describe('loadConfig', () => {
        // Create a temporary directory with test config
        let tempDir: string

        beforeEach(() => {
            tempDir = fs.mkdtempSync('/tmp/config-test-')
            fs.mkdirSync(path.join(tempDir, 'config'), { recursive: true })
        })

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true })
        })

        it('should load YAML config', () => {
            const configPath = path.join(tempDir, 'config/jobs.yaml')
            const config = createTestConfig()
            fs.writeFileSync(
                configPath,
                `
defaults:
  sparkHome: /spark
  sparkConfDir: /conf
  ivyDir: /ivy
  tempDir: /tmp
  heapDumpDir: /dumps
  logsDir: /logs
additionalJars: []
modules: {}
sparkConfigSets: {}
jobs:
  job-a:
    module: module1
    class: com.example.JobA
    category: bronze
    description: Job A
`
            )

            const loaded = loadConfig(tempDir)
            expect(loaded.jobs['job-a']).toBeDefined()
            expect(loaded.jobs['job-a'].class).toBe('com.example.JobA')
        })

        it('should load JSON config', () => {
            const configPath = path.join(tempDir, 'config/jobs.json')
            const config = createTestConfig()
            fs.writeFileSync(configPath, JSON.stringify(config))

            const loaded = loadConfig(tempDir)
            expect(loaded.jobs['job-a']).toBeDefined()
        })

        it('should throw for missing config file', () => {
            expect(() => loadConfig('/nonexistent/path')).toThrow('not found')
        })

        it('should cache loaded config', () => {
            const configPath = path.join(tempDir, 'config/jobs.json')
            const config = createTestConfig()
            fs.writeFileSync(configPath, JSON.stringify(config))

            const loaded1 = loadConfig(tempDir)
            const loaded2 = loadConfig(tempDir)
            expect(loaded1).toBe(loaded2)
        })

        it('should reload when forceReload is true', () => {
            const configPath = path.join(tempDir, 'config/jobs.json')
            const config1 = createTestConfig()
            fs.writeFileSync(configPath, JSON.stringify(config1))

            loadConfig(tempDir)

            // Modify config
            const config2 = createTestConfig()
            config2.jobs['job-b'] = {
                module: 'module1',
                class: 'com.example.JobB',
                category: 'bronze',
                description: 'Job B',
            }
            fs.writeFileSync(configPath, JSON.stringify(config2))

            const reloaded = loadConfig(tempDir, true)
            expect(reloaded.jobs['job-b']).toBeDefined()
        })

        it('should validate config on load', () => {
            const configPath = path.join(tempDir, 'config/jobs.json')
            // Create invalid config with circular dependency
            const config = createTestConfig()
            config.jobs['job-a'].dependsOn = ['job-b']
            config.jobs['job-b'] = {
                module: 'module1',
                class: 'com.example.JobB',
                category: 'bronze',
                description: 'Job B',
                dependsOn: ['job-a'],
            }
            fs.writeFileSync(configPath, JSON.stringify(config))

            expect(() => loadConfig(tempDir, true)).toThrow('Circular')
        })
    })
})
