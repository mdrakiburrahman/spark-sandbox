/**
 * DAG resolution utilities for the UI
 */

import { JobsConfig, ExecutionPlan } from './types'

/**
 * Resolve all dependencies for a job and return them in topological order.
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
 * Build a map of job -> level in the DAG.
 * Level 0 = no dependencies, Level 1 = depends only on level 0, etc.
 */
export function buildLevelMap(config: JobsConfig, jobName: string): Map<string, number> {
    const levels = new Map<string, number>()

    function calculateLevel(job: string, visited: Set<string>): number {
        if (levels.has(job)) {
            return levels.get(job)!
        }

        if (visited.has(job)) {
            return 0
        }

        visited.add(job)

        const jobConfig = config.jobs[job]
        if (!jobConfig || !jobConfig.dependsOn || jobConfig.dependsOn.length === 0) {
            levels.set(job, 0)
            return 0
        }

        const maxDepLevel = Math.max(...jobConfig.dependsOn.map((d) => calculateLevel(d, visited)))
        const level = maxDepLevel + 1
        levels.set(job, level)
        return level
    }

    calculateLevel(jobName, new Set())
    return levels
}

/**
 * Get execution plan for a job (DAG resolution with levels)
 */
export function getExecutionPlan(config: JobsConfig, jobName: string): ExecutionPlan {
    const jobsToRun = resolveDag(config, jobName)
    const levels = buildLevelMap(config, jobName)
    return { jobsToRun, levels }
}

/**
 * Get all jobs organized by their level for parallel execution
 */
export function getJobsByLevel(config: JobsConfig, jobsToRun: string[]): Map<number, string[]> {
    const jobsByLevel = new Map<number, string[]>()

    // Calculate level for each job
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
        const relevantDeps = jobConfig.dependsOn.filter((d) => jobsToRun.includes(d))
        if (relevantDeps.length === 0) {
            levelMap.set(job, 0)
            return 0
        }

        const maxDepLevel = Math.max(...relevantDeps.map((d) => calculateLevel(d, new Set(visited))))
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
 * Get all edges (dependencies) for visualization
 */
export function getEdges(config: JobsConfig): Array<{ source: string; target: string }> {
    const edges: Array<{ source: string; target: string }> = []

    for (const [jobName, job] of Object.entries(config.jobs)) {
        if (job.dependsOn) {
            for (const dep of job.dependsOn) {
                edges.push({ source: dep, target: jobName })
            }
        }
    }

    return edges
}

/**
 * Compute the effective DAG for a set of selected jobs.
 * Returns the union of all dependencies needed to run all selected jobs,
 * de-duplicated and in topological order.
 */
export function computeEffectiveDag(config: JobsConfig, selectedJobs: Set<string>): string[] {
    const allJobsToRun = new Set<string>()

    // For each selected job, resolve its full DAG and add to the set
    for (const jobName of selectedJobs) {
        const deps = resolveDag(config, jobName)
        deps.forEach((job) => allJobsToRun.add(job))
    }

    // Get jobs organized by level for proper ordering
    const jobsArray = Array.from(allJobsToRun)
    const jobsByLevel = getJobsByLevel(config, jobsArray)

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
 * For a given job, get all its predecessor jobs (dependencies, recursively).
 * This is the same as resolveDag but excluding the job itself.
 */
export function getPredecessors(config: JobsConfig, jobName: string): string[] {
    const allDeps = resolveDag(config, jobName)
    // Remove the job itself from the list
    return allDeps.filter((j) => j !== jobName)
}
