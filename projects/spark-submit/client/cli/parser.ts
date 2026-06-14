/**
 * CLI Argument Parser
 *
 * Parses command line arguments for spark-submit.
 */

import type { CliArgs } from "../../interface/index.js";
import { SystemLogger } from "../../logging/logger.js";

/**
 * Parse command line arguments.
 */
export class CliParser {
  /**
   * Parse command line arguments.
   */
  static parse(): CliArgs {
    const args = process.argv.slice(2);
    const result: CliArgs = {
      dryRun: false,
      list: false,
      noDag: false,
      parallel: true,
      api: false,
      ui: false,
    };

    for (const rawArg of args) {
      // Normalize: lowercase the *flag name* (before `=`) so both --JOB=foo and --job=foo work.
      const arg = rawArg.startsWith("--")
        ? rawArg.includes("=")
          ? rawArg.slice(0, rawArg.indexOf("=")).toLowerCase() +
            rawArg.slice(rawArg.indexOf("="))
          : rawArg.toLowerCase()
        : rawArg;

      if (arg.startsWith("--job=")) {
        const raw = arg.substring("--job=".length);
        result.job = raw;
        result.jobs = raw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
      } else if (arg === "--dry-run" || arg === "--dry-run=true") {
        result.dryRun = true;
      } else if (arg === "--dry-run=false") {
        result.dryRun = false;
      } else if (arg === "--list") {
        result.list = true;
      } else if (arg === "--no-dag") {
        result.noDag = true;
      } else if (arg === "--parallel" || arg === "--parallel=true") {
        result.parallel = true;
      } else if (arg === "--parallel=false" || arg === "--serial") {
        result.parallel = false;
      } else if (arg === "--api") {
        result.api = true;
      } else if (arg.startsWith("--api-url=")) {
        result.apiUrl = arg.split("=")[1];
        result.api = true;
      } else if (arg === "--ui") {
        result.ui = true;
      } else if (arg === "--class-map") {
        result.classMap = true;
      } else if (arg.startsWith("--class-to-job=")) {
        result.classToJob = arg.split("=")[1];
      } else if (arg.startsWith("--upstream=")) {
        result.upstream = arg.split("=")[1];
      } else if (arg.startsWith("--sql=")) {
        result.sql = arg.substring("--sql=".length);
      } else if (arg.startsWith("--sql-file=")) {
        result.sqlFile = arg.substring("--sql-file=".length);
      }
    }

    return result;
  }

  /**
   * Print usage information.
   */
  static printUsage(): void {
    SystemLogger.info("Usage:");
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<job-name>            # Run job with full DAG (parallel by default)",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=all                   # Run every job in spark-jobs.yaml as one DAG",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<a>,<b>,<c>           # Run multiple jobs + their DAGs, fanned out in parallel (UI parity)",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<job-name> --serial   # Run job with full DAG (serial execution)",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<job-name> --no-dag   # Run single job without dependencies",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<job-name> --dry-run  # Show execution plan",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --list                      # List all available jobs",
    );
    SystemLogger.info("");
    SystemLogger.info("Job-Class Mapping (for CI/agent automation):");
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --class-map                               # Print driver class → job mapping (JSON)",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --class-to-job=<fully.qualified.Class>     # Find job for a driver class",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --upstream=<fully.qualified.Class>         # Find all upstream dependent jobs",
    );
    SystemLogger.info("");
    SystemLogger.info("API Mode (uses API server for execution):");
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<job-name> --api      # Run via API server (default: localhost:4000)",
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --job=<job-name> --api-url=http://host:port",
    );
    SystemLogger.info("");
    SystemLogger.info("UI Mode:");
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --ui                        # Launch the web UI",
    );
    SystemLogger.info("");
    SystemLogger.info("SQL Mode (query Livy via API server):");
    SystemLogger.info(
      '  npx tsx projects/spark-submit/index.ts --sql="SHOW DATABASES"          # Short single-line SQL (avoid through nx if SQL has quotes)',
    );
    SystemLogger.info(
      "  npx tsx projects/spark-submit/index.ts --sql-file=/path/to/query.sql   # Read SQL from a file — bulletproof for complex/multi-line SQL",
    );
  }
}
