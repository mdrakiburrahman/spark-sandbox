/**
 * Config Service
 *
 * Handles loading and caching of the jobs configuration.
 */

import * as fs from 'fs'
import * as path from 'path'
import { parse as parseYaml } from 'yaml'
import type { JobsConfig } from '../types.js'
import { validateConfig } from './dagService.js'

let cachedConfig: JobsConfig | null = null
let configPath: string | null = null

/**
 * Load jobs configuration from file
 */
export function loadConfig(projectRoot: string, forceReload = false): JobsConfig {
    const sparkJobsYamlPath = path.join(projectRoot, 'config/spark-jobs.yaml')
    const yamlPath = path.join(projectRoot, 'config/jobs.yaml')
    const jsonPath = path.join(projectRoot, 'config/jobs.json')

    // Check if we can use cached config
    if (!forceReload && cachedConfig && configPath) {
        return cachedConfig
    }

    let config: JobsConfig

    // Try spark-jobs.yaml first, then jobs.yaml, then JSON
    if (fs.existsSync(sparkJobsYamlPath)) {
        const content = fs.readFileSync(sparkJobsYamlPath, 'utf-8')
        config = parseYaml(content) as JobsConfig
        configPath = sparkJobsYamlPath
    } else if (fs.existsSync(yamlPath)) {
        const content = fs.readFileSync(yamlPath, 'utf-8')
        config = parseYaml(content) as JobsConfig
        configPath = yamlPath
    } else if (fs.existsSync(jsonPath)) {
        const content = fs.readFileSync(jsonPath, 'utf-8')
        config = JSON.parse(content) as JobsConfig
        configPath = jsonPath
    } else {
        throw new Error(`Configuration file not found. Tried:\n  - ${sparkJobsYamlPath}\n  - ${yamlPath}\n  - ${jsonPath}`)
    }

    // Validate config
    const errors = validateConfig(config)
    if (errors.length > 0) {
        throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`)
    }

    cachedConfig = config
    return config
}

/**
 * Get cached config or throw if not loaded
 */
export function getConfig(): JobsConfig {
    if (!cachedConfig) {
        throw new Error('Configuration not loaded. Call loadConfig first.')
    }
    return cachedConfig
}

/**
 * Set config directly (for testing)
 */
export function setConfig(config: JobsConfig): void {
    cachedConfig = config
    configPath = null
}

/**
 * Clear cached config
 */
export function clearConfig(): void {
    cachedConfig = null
    configPath = null
}

/**
 * Check if config is loaded
 */
export function isConfigLoaded(): boolean {
    return cachedConfig !== null
}

/**
 * Get the path to the loaded config file
 */
export function getConfigPath(): string | null {
    return configPath
}
