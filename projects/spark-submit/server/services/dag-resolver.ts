/**
 * DAG Resolver Implementation
 *
 * Concrete implementation of IDagResolver interface.
 * Resolves the dependency DAG for job execution.
 */

import type { JobsConfig, IDagResolver } from "../../interface/index.js";
import { SystemLogger } from "../../logging/logger.js";

/**
 * Default implementation of DAG resolver.
 */
export class DagResolver implements IDagResolver {
  private readonly config: JobsConfig;

  constructor(config: JobsConfig) {
    this.config = config;
  }

  /**
   * Resolve all dependencies for a job and return them in topological order.
   * Jobs with no dependencies between them can theoretically run in parallel,
   * but for simplicity we return a flat list in order.
   *
   * @param jobName The target job to resolve dependencies for
   * @returns Array of job names in execution order (dependencies first)
   */
  resolve(jobName: string): string[] {
    if (!this.config.jobs[jobName]) {
      throw new Error(`Job '${jobName}' not found in configuration`);
    }

    const visited = new Set<string>();
    const visiting = new Set<string>(); // For cycle detection
    const result: string[] = [];

    this.dfs(jobName, visited, visiting, result);

    return result;
  }

  /**
   * Depth-first search to build topological order.
   */
  private dfs(
    jobName: string,
    visited: Set<string>,
    visiting: Set<string>,
    result: string[],
  ): void {
    if (visited.has(jobName)) {
      return;
    }

    if (visiting.has(jobName)) {
      throw new Error(
        `Circular dependency detected involving job '${jobName}'`,
      );
    }

    const job = this.config.jobs[jobName];
    if (!job) {
      throw new Error(`Dependency '${jobName}' not found in configuration`);
    }

    visiting.add(jobName);

    // Process dependencies first
    if (job.dependsOn && job.dependsOn.length > 0) {
      for (const dep of job.dependsOn) {
        this.dfs(dep, visited, visiting, result);
      }
    }

    visiting.delete(jobName);
    visited.add(jobName);
    result.push(jobName);
  }

  /**
   * Resolve the union DAG for multiple target jobs in topological order.
   *
   * Walks each target's dependency chain via `resolve`, then dedupes while
   * preserving order. The result is suitable to hand to a level-aware
   * executor (jobs at the same level run in parallel).
   *
   * @param jobNames Target jobs to fan out.
   */
  resolveAll(jobNames: string[]): string[] {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const jobName of jobNames) {
      for (const j of this.resolve(jobName)) {
        if (!seen.has(j)) {
          seen.add(j);
          merged.push(j);
        }
      }
    }
    return merged;
  }

  /**
   * Print the DAG execution plan for each of the given target jobs.
   *
   * @param jobNames Target jobs to print plans for.
   */
  printPlanAll(jobNames: string[]): void {
    for (const jobName of jobNames) {
      this.printPlan(jobName);
    }
  }

  /**
   * Print the DAG execution plan for a job.
   */
  printPlan(jobName: string): void {
    const plan = this.resolve(jobName);

    SystemLogger.info(`\nExecution plan for '${jobName}':`);
    SystemLogger.info("═".repeat(60));

    // Build level map (how deep in the DAG each job is)
    const levels = this.buildLevelMap(jobName);
    let currentLevel = -1; // Start at -1 so Level 0 gets printed

    for (const job of plan) {
      const level = levels.get(job) ?? 0;
      if (level > currentLevel) {
        SystemLogger.info(`\n--- Level ${level} ---`);
        currentLevel = level;
      }

      const jobConfig = this.config.jobs[job];
      const deps = jobConfig?.dependsOn?.join(", ") || "none";
      SystemLogger.info(`  ${job}`);
      SystemLogger.info(`    └─ depends on: ${deps}`);
    }

    SystemLogger.info("\n" + "═".repeat(60));
    SystemLogger.info(`Total jobs: ${plan.length}`);
  }

  /**
   * Build a map of job -> level in the DAG.
   * Level 0 = no dependencies, Level 1 = depends only on level 0, etc.
   */
  private buildLevelMap(jobName: string): Map<string, number> {
    const levels = new Map<string, number>();

    const calculateLevel = (job: string, visited: Set<string>): number => {
      if (levels.has(job)) {
        return levels.get(job)!;
      }

      if (visited.has(job)) {
        return 0; // Cycle, shouldn't happen if dfs passed
      }

      visited.add(job);

      const jobConfig = this.config.jobs[job];
      if (
        !jobConfig ||
        !jobConfig.dependsOn ||
        jobConfig.dependsOn.length === 0
      ) {
        levels.set(job, 0);
        return 0;
      }

      const maxDepLevel = Math.max(
        ...jobConfig.dependsOn.map((d) => calculateLevel(d, visited)),
      );
      const level = maxDepLevel + 1;
      levels.set(job, level);
      return level;
    };

    calculateLevel(jobName, new Set());
    return levels;
  }

  /**
   * Get jobs organized by their level in the DAG.
   */
  getJobsByLevel(jobNames: string[]): Map<number, string[]> {
    const levels = new Map<number, string[]>();
    const levelMap = new Map<string, number>();

    const calculateLevel = (job: string, visited: Set<string>): number => {
      if (levelMap.has(job)) {
        return levelMap.get(job)!;
      }

      if (visited.has(job)) {
        return 0;
      }

      visited.add(job);

      const jobConfig = this.config.jobs[job];
      if (
        !jobConfig ||
        !jobConfig.dependsOn ||
        jobConfig.dependsOn.length === 0
      ) {
        levelMap.set(job, 0);
        return 0;
      }

      // Only consider dependencies that are in jobNames
      const relevantDeps = jobConfig.dependsOn.filter((d) =>
        jobNames.includes(d),
      );
      if (relevantDeps.length === 0) {
        levelMap.set(job, 0);
        return 0;
      }

      const maxDepLevel = Math.max(
        ...relevantDeps.map((d) => calculateLevel(d, new Set(visited))),
      );
      const level = maxDepLevel + 1;
      levelMap.set(job, level);
      return level;
    };

    // Calculate levels for all jobs
    for (const job of jobNames) {
      calculateLevel(job, new Set());
    }

    // Group jobs by level
    for (const job of jobNames) {
      const level = levelMap.get(job) ?? 0;
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(job);
    }

    return levels;
  }

  /**
   * Validate all jobs in the configuration have valid dependencies.
   */
  validateAllJobs(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const [jobName, job] of Object.entries(this.config.jobs)) {
      if (job.dependsOn) {
        for (const dep of job.dependsOn) {
          if (!this.config.jobs[dep]) {
            errors.push(`Job '${jobName}' depends on unknown job '${dep}'`);
          }
        }
      }
    }

    // Check for cycles
    for (const jobName of Object.keys(this.config.jobs)) {
      try {
        this.resolve(jobName);
      } catch (e) {
        if (e instanceof Error && e.message.includes("Circular dependency")) {
          errors.push(e.message);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
