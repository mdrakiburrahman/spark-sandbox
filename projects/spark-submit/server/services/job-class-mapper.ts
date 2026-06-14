/**
 * Job-Class Mapper Implementation
 *
 * Maps driver class names to their corresponding jobs in the registry,
 * and computes upstream impact (reverse DAG traversal).
 */

import type {
  JobsConfig,
  IJobClassMapper,
  ClassJobMapping,
} from "../../interface/index.js";

/**
 * Maps driver classes to jobs and computes upstream dependency impact.
 *
 * This service builds two key data structures from the JobsConfig:
 * 1. A class→job index for O(1) lookups
 * 2. A reverse dependency graph for upstream impact analysis
 */
export class JobClassMapper implements IJobClassMapper {
  private readonly config: JobsConfig;
  /** class name (lowercase) → ClassJobMapping */
  private readonly classIndex: Map<string, ClassJobMapping>;
  /** job name → set of jobs that directly depend on it */
  private readonly reverseDeps: Map<string, Set<string>>;

  constructor(config: JobsConfig) {
    this.config = config;
    this.classIndex = this.buildClassIndex();
    this.reverseDeps = this.buildReverseDependencyGraph();
  }

  /**
   * Get the complete driver class → job mapping.
   */
  getClassToJobMap(): ClassJobMapping[] {
    return Array.from(this.classIndex.values());
  }

  /**
   * Find the job for a given fully qualified driver class name.
   * Matching is case-insensitive for robustness.
   */
  getJobForClass(className: string): ClassJobMapping | null {
    if (!className) return null;
    return this.classIndex.get(className.toLowerCase()) ?? null;
  }

  /**
   * Find all jobs that are transitively impacted upstream by a change
   * to the given driver class.
   *
   * Uses BFS on the reverse dependency graph starting from the job
   * that owns the given class.
   */
  getUpstreamDependents(className: string): string[] {
    const mapping = this.getJobForClass(className);
    if (!mapping) return [];

    const sourceJob = mapping.jobName;
    const visited = new Set<string>();
    const queue: string[] = [sourceJob];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const dependents = this.reverseDeps.get(current);
      if (dependents) {
        for (const dep of dependents) {
          if (!visited.has(dep)) {
            queue.push(dep);
          }
        }
      }
    }

    // Remove the source job itself — we only want the upstream dependents
    visited.delete(sourceJob);
    return Array.from(visited).sort();
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build an index from lowercase class name → ClassJobMapping.
   */
  private buildClassIndex(): Map<string, ClassJobMapping> {
    const index = new Map<string, ClassJobMapping>();
    for (const [jobName, job] of Object.entries(this.config.jobs)) {
      const mapping: ClassJobMapping = {
        driverClass: job.class,
        jobName,
        category: job.category,
        description: job.description,
      };
      index.set(job.class.toLowerCase(), mapping);
    }
    return index;
  }

  /**
   * Build a reverse dependency graph: for each job, who directly depends on it?
   *
   * Forward:  jobA.dependsOn = [jobB]   means  jobA depends on jobB
   * Reverse:  reverseDeps[jobB] = {jobA} means  jobB is depended on by jobA
   */
  private buildReverseDependencyGraph(): Map<string, Set<string>> {
    const reverse = new Map<string, Set<string>>();
    for (const [jobName, job] of Object.entries(this.config.jobs)) {
      if (job.dependsOn) {
        for (const dep of job.dependsOn) {
          if (!reverse.has(dep)) {
            reverse.set(dep, new Set());
          }
          reverse.get(dep)!.add(jobName);
        }
      }
    }
    return reverse;
  }
}
