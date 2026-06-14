/**
 * DAG Service
 *
 * Pure functions for DAG resolution and computation.
 * No side effects - all functions take inputs and return outputs.
 */

import type { JobsConfig, Job } from '../types.js'

/**
 * Resolve all dependencies for a job and return them in topological order.
 * @param config - The jobs configuration
 * @param jobName - The job to resolve dependencies for
 * @returns Array of job names in topological order (dependencies first)
 * @throws Error if job not found or circular dependency detected
 */
export function resolveDag(config: JobsConfig, jobName: string): string[] {
    if (!config.jobs[jobName]) {
        throw new Error(`Job '${jobName}' not found in configuration`)
    }

    const visited = new Set<string>()
    const visiting = new Set<string>()
    const result: string[] = []

    function dfs(job: string): void {
        if (visited.has(job)) {
            return
        }

        if (visiting.has(job)) {
            throw new Error(`Circular dependency detected involving job '${job}'`)
        }

        const jobConfig = config.jobs[job]
        if (!jobConfig) {
            throw new Error(`Dependency '${job}' not found in configuration`)
        }

        visiting.add(job)

        if (jobConfig.dependsOn && jobConfig.dependsOn.length > 0) {
            for (const dep of jobConfig.dependsOn) {
                dfs(dep)
            }
        }

        visiting.delete(job)
        visited.add(job)
        result.push(job)
    }

    dfs(jobName)
    return result
}

/**
 * Get the level (depth) of each job in the DAG.
 * Level 0 = no dependencies, Level 1 = depends only on level 0, etc.
 */
export function getJobLevels(config: JobsConfig, effectiveDag: string[]): Map<string, number> {
    const dagSet = new Set(effectiveDag)
    const levels = new Map<string, number>()

    function calculateLevel(job: string, visited: Set<string>): number {
        if (levels.has(job)) {
            return levels.get(job)!
        }

        if (visited.has(job)) {
            // Circular dependency - shouldn't happen after resolveDag, but be safe
            return 0
        }

        visited.add(job)

        const jobConfig = config.jobs[job]
        if (!jobConfig || !jobConfig.dependsOn || jobConfig.dependsOn.length === 0) {
            levels.set(job, 0)
            return 0
        }

        // Only consider dependencies that are in the effective DAG
        const relevantDeps = jobConfig.dependsOn.filter((d: string) => dagSet.has(d))
        if (relevantDeps.length === 0) {
            levels.set(job, 0)
            return 0
        }

        const maxDepLevel = Math.max(...relevantDeps.map((d: string) => calculateLevel(d, new Set(visited))))
        const level = maxDepLevel + 1
        levels.set(job, level)
        return level
    }

    for (const job of effectiveDag) {
        calculateLevel(job, new Set())
    }

    return levels
}

/**
 * Group jobs by their level in the DAG.
 */
export function getJobsByLevel(config: JobsConfig, effectiveDag: string[]): Map<number, string[]> {
    const levels = getJobLevels(config, effectiveDag)
    const byLevel = new Map<number, string[]>()

    for (const job of effectiveDag) {
        const level = levels.get(job) ?? 0
        if (!byLevel.has(level)) {
            byLevel.set(level, [])
        }
        byLevel.get(level)!.push(job)
    }

    return byLevel
}

/**
 * Compute the effective DAG for a set of selected jobs.
 * This unions all dependencies for all selected jobs.
 */
export function computeEffectiveDag(config: JobsConfig, selectedJobs: Set<string>): string[] {
    const allJobs = new Set<string>()

    for (const job of selectedJobs) {
        const dag = resolveDag(config, job)
        for (const j of dag) {
            allJobs.add(j)
        }
    }

    // Sort by dependency order (topological sort)
    const sorted: string[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    function visit(job: string): void {
        if (visited.has(job)) return
        if (visiting.has(job)) return // Already being processed

        visiting.add(job)
        const jobConfig = config.jobs[job]
        if (jobConfig?.dependsOn) {
            for (const dep of jobConfig.dependsOn) {
                if (allJobs.has(dep)) {
                    visit(dep)
                }
            }
        }
        visiting.delete(job)
        visited.add(job)
        sorted.push(job)
    }

    for (const job of allJobs) {
        visit(job)
    }

    return sorted
}

/**
 * Get edges for visualization (source -> target pairs)
 */
export function getEdges(config: JobsConfig, effectiveDag: string[]): Array<{ source: string; target: string }> {
    const dagSet = new Set(effectiveDag)
    const edges: Array<{ source: string; target: string }> = []

    for (const job of effectiveDag) {
        const jobConfig = config.jobs[job]
        if (jobConfig?.dependsOn) {
            for (const dep of jobConfig.dependsOn) {
                if (dagSet.has(dep)) {
                    edges.push({ source: dep, target: job })
                }
            }
        }
    }

    return edges
}

/**
 * Validate that the configuration is valid.
 * @returns Array of error messages (empty if valid)
 */
export function validateConfig(config: JobsConfig): string[] {
    const errors: string[] = []

    if (!config.jobs || Object.keys(config.jobs).length === 0) {
        errors.push('Configuration must have at least one job')
        return errors
    }

    // Check all dependencies exist
    for (const [jobName, job] of Object.entries(config.jobs)) {
        if (job.dependsOn) {
            for (const dep of job.dependsOn) {
                if (!config.jobs[dep]) {
                    errors.push(`Job '${jobName}' depends on non-existent job '${dep}'`)
                }
            }
        }

        // Check module exists (only if modules are defined)
        if (job.module && config.modules && Object.keys(config.modules).length > 0 && !config.modules[job.module]) {
            errors.push(`Job '${jobName}' references non-existent module '${job.module}'`)
        }

        // Check sparkConfigSet exists (only if sparkConfigSets are defined)
        if (job.sparkConfigSet && config.sparkConfigSets && Object.keys(config.sparkConfigSets).length > 0 && !config.sparkConfigSets[job.sparkConfigSet]) {
            errors.push(`Job '${jobName}' references non-existent sparkConfigSet '${job.sparkConfigSet}'`)
        }
    }

    // Check for circular dependencies
    for (const jobName of Object.keys(config.jobs)) {
        try {
            resolveDag(config, jobName)
        } catch (e) {
            if (e instanceof Error && e.message.includes('Circular')) {
                errors.push(e.message)
            }
        }
    }

    return errors
}

/**
 * Get jobs grouped by category
 */
export function getJobsByCategory(config: JobsConfig): Record<string, string[]> {
    const byCategory: Record<string, string[]> = {}

    for (const [jobName, job] of Object.entries(config.jobs)) {
        const category = job.category || 'other'
        if (!byCategory[category]) {
            byCategory[category] = []
        }
        byCategory[category].push(jobName)
    }

    // Sort each category
    for (const category of Object.keys(byCategory)) {
        byCategory[category].sort()
    }

    return byCategory
}

/**
 * Filter jobs by category
 */
export function filterJobsByCategory(config: JobsConfig, categories: string[]): string[] {
    const categorySet = new Set(categories.map((c) => c.toLowerCase()))
    return Object.entries(config.jobs)
        .filter(([_, job]) => categorySet.has(job.category?.toLowerCase() || 'other'))
        .map(([name]) => name)
        .sort()
}
