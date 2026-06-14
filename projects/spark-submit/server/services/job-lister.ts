/**
 * Job Lister Implementation
 *
 * Concrete implementation of IJobLister interface.
 */

import type { JobsConfig, IJobLister } from "../../interface/index.js";
import { SystemLogger } from "../../logging/logger.js";

/**
 * Default implementation of job lister.
 */
export class JobLister implements IJobLister {
  /**
   * List all available jobs grouped by category.
   */
  list(config: JobsConfig): void {
    SystemLogger.info("\nAvailable Jobs:\n");

    // Group by category
    const byCategory: Record<string, string[]> = {};

    for (const [name, job] of Object.entries(config.jobs)) {
      const category = job.category || "uncategorized";
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(name);
    }

    for (const [category, jobs] of Object.entries(byCategory).sort()) {
      SystemLogger.info(`  ${category}:`);
      for (const jobName of jobs.sort()) {
        const desc = config.jobs[jobName].description || "";
        SystemLogger.info(`    - ${jobName}${desc ? `: ${desc}` : ""}`);
      }
      SystemLogger.info("");
    }

    SystemLogger.info(`Total: ${Object.keys(config.jobs).length} jobs`);
  }

  /**
   * Static method for backward compatibility.
   */
  static list(config: JobsConfig): void {
    new JobLister().list(config);
  }
}
