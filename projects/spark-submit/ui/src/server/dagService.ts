/**
 * DAG Resolution Service
 *
 * Pure functions for DAG resolution - no side effects, easily testable.
 */

import type { JobsConfig, Job } from './types'

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
 * Get all jobs organized by their level for parallel execution.
 * Level 0 = no dependencies, Level 1 = depends only on level 0, etc.
 * @param config - The jobs configuration
 * @param jobsToRun - Array of jobs to organize
 * @returns Map of level number to array of jobs at that level
 */
export function getJobsByLevel(config: JobsConfig, jobsToRun: string[]): Map<number, string[]> {
    const jobsByLevel = new Map<number, string[]>()
    const levelMap = new Map<string, number>()

    function calculateLevel(job: string, visited: Set<string>): number {
        if (levelMap.has(job)) {
            return levelMap.get(job)!
        }

        if (visited.has(job)) {
            return 0
        }

        visited.add(job)

        const jobConfig = config.jobs[job]
        if (!jobConfig || !jobConfig.dependsOn || jobConfig.dependsOn.length === 0) {
            levelMap.set(job, 0)
            return 0
        }

        // Only consider dependencies that are in jobsToRun
        const relevantDeps = jobConfig.dependsOn.filter((d: string) => jobsToRun.includes(d))
        if (relevantDeps.length === 0) {
            levelMap.set(job, 0)
            return 0
        }

        const maxDepLevel = Math.max(...relevantDeps.map((d: string) => calculateLevel(d, new Set(visited))))
        const level = maxDepLevel + 1
        levelMap.set(job, level)
        return level
    }

    // Calculate levels for all jobs
    for (const job of jobsToRun) {
        calculateLevel(job, new Set())
    }

    // Group jobs by level
    for (const job of jobsToRun) {
        const level = levelMap.get(job) ?? 0
        if (!jobsByLevel.has(level)) {
            jobsByLevel.set(level, [])
        }
        jobsByLevel.get(level)!.push(job)
    }

    return jobsByLevel
}

/**
 * Compute the effective DAG for a set of selected jobs.
 * Returns the union of all dependencies needed to run all selected jobs,
 * de-duplicated and in topological order.
 * @param config - The jobs configuration
 * @param selectedJobs - Set of job names selected by user
 * @returns Array of all jobs needed (including dependencies) in topological order
 */
export function computeEffectiveDag(config: JobsConfig, selectedJobs: Set<string> | string[]): string[] {
    const allJobsToRun = new Set<string>()
    const jobsArray = selectedJobs instanceof Set ? Array.from(selectedJobs) : selectedJobs

    // For each selected job, resolve its full DAG and add to the set
    for (const jobName of jobsArray) {
        if (!config.jobs[jobName]) {
            throw new Error(`Selected job '${jobName}' not found in configuration`)
        }
        const deps = resolveDag(config, jobName)
        deps.forEach((job) => allJobsToRun.add(job))
    }

    // Get jobs organized by level for proper ordering
    const jobsList = Array.from(allJobsToRun)
    const jobsByLevel = getJobsByLevel(config, jobsList)

    // Flatten in level order (topological)
    const result: string[] = []
    const levels = Array.from(jobsByLevel.keys()).sort((a, b) => a - b)
    for (const level of levels) {
        const jobsAtLevel = jobsByLevel.get(level) || []
        result.push(...jobsAtLevel)
    }

    return result
}

/**
 * Get all edges (dependencies) for visualization.
 * @param config - The jobs configuration
 * @returns Array of edges representing dependencies
 */
export function getEdges(config: JobsConfig): Array<{ source: string; target: string }> {
    const edges: Array<{ source: string; target: string }> = []

    for (const [jobName, job] of Object.entries(config.jobs) as [string, Job][]) {
        if (job.dependsOn) {
            for (const dep of job.dependsOn) {
                edges.push({ source: dep, target: jobName })
            }
        }
    }

    return edges
}

/**
 * Validate a jobs configuration.
 * @param config - The jobs configuration to validate
 * @returns Array of validation errors (empty if valid)
 */
export function validateConfig(config: JobsConfig): string[] {
    const errors: string[] = []

    if (!config.jobs || typeof config.jobs !== 'object') {
        errors.push('Configuration must have a jobs object')
        return errors
    }

    const jobNames = new Set(Object.keys(config.jobs))

    for (const [jobName, job] of Object.entries(config.jobs) as [string, Job][]) {
        if (!job.module) {
            errors.push(`Job '${jobName}' is missing required field 'module'`)
        }
        if (!job.class) {
            errors.push(`Job '${jobName}' is missing required field 'class'`)
        }
        if (!job.category) {
            errors.push(`Job '${jobName}' is missing required field 'category'`)
        }

        // Validate dependencies exist
        if (job.dependsOn) {
            for (const dep of job.dependsOn) {
                if (!jobNames.has(dep)) {
                    errors.push(`Job '${jobName}' depends on unknown job '${dep}'`)
                }
            }
        }
    }

    // Check for circular dependencies
    for (const jobName of jobNames) {
        try {
            resolveDag(config, jobName)
        } catch (e) {
            if (e instanceof Error && e.message.includes('Circular dependency')) {
                errors.push(e.message)
            }
        }
    }

    return errors
}
