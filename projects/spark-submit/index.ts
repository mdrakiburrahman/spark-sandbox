/**
 * Spark Submit - Entry Point
 *
 * This is a simple, "stupid" entry point that orchestrates:
 * 1. Always spin up the server
 * 2. Run UI if user asked for UI
 * 3. Else fire CLI
 * 4. On exit, close server
 *
 * Usage:
 *   npx tsx projects/spark-submit/index.ts --job=<job-name>            # Run job via CLI
 *   npx tsx projects/spark-submit/index.ts --job=<job-name> --dry-run  # Show execution plan
 *   npx tsx projects/spark-submit/index.ts --list                      # List all jobs
 *   npx tsx projects/spark-submit/index.ts --ui                        # Launch web UI
 *   npx tsx projects/spark-submit/index.ts --job=all                   # Run every job (full DAG)
 *
 * Preferred entry: `nx run spark-submit:run --JOB=<job-name>` (see README).
 */

import { SystemLogger, ActionLogger } from "./logging/logger.js";

// Interface imports (types only)
import type { CliArgs, IServer } from "./interface/index.js";

// Client imports
import { CliParser, CliRunner, ApiClient } from "./client/index.js";

// Server imports (concrete implementations)
import {
  EmbeddedServer,
  ConfigLoader,
  RuntimeContextFactory,
  DagResolver,
  JobExecutor,
  JobLister,
  JobClassMapper,
  ApiAutoLauncher,
} from "./server/index.js";

/**
 * Application Coordinator
 *
 * Simple orchestration: server → CLI/UI → cleanup
 */
class AppCoordinator {
  private server: IServer | null = null;
  private apiLauncher: ApiAutoLauncher | null = null;

  /**
   * Run the application.
   */
  async run(args: CliArgs): Promise<void> {
    const projectRoot = process.cwd();

    // SQL mode: auto-start the Express API server (which owns /api/sql/query →
    // Livy) if it isn't already up on the target URL. Skip if user explicitly
    // pointed at a remote API with --api-url.
    if (args.sql !== undefined || args.sqlFile !== undefined) {
      const apiUrl =
        args.apiUrl || process.env.SPARK_API_URL || "http://localhost:4000";
      if (!args.apiUrl) {
        this.apiLauncher = new ApiAutoLauncher({ apiUrl, projectRoot });
        try {
          await this.apiLauncher.ensureReady();
        } catch (err) {
          SystemLogger.error(
            `Failed to start API server: ${err instanceof Error ? err.message : String(err)}`,
          );
          throw err;
        }
      }
      try {
        await this.runCLI(args, projectRoot);
      } finally {
        await this.shutdown();
      }
      return;
    }

    // 1. Always spin up the embedded server
    this.server = new EmbeddedServer({
      projectRoot,
      debug: false,
    });

    try {
      await this.server.start();
      SystemLogger.debug(`Server started at ${this.server.getUrl()}`);

      // 2. Run UI if user asked for UI
      if (args.ui) {
        await this.runUI();
      }
      // 3. Else fire CLI
      else {
        await this.runCLI(args, projectRoot);
      }
    } finally {
      // 4. On exit, close server
      await this.shutdown();
    }
  }

  /**
   * Run the web UI.
   */
  private async runUI(): Promise<void> {
    // For now, just inform the user to run the UI separately
    // In future, we could spawn the Next.js dev server here
    SystemLogger.info("\n🌐 Web UI Mode");
    SystemLogger.info("═".repeat(60));
    SystemLogger.info(`API Server running at: ${this.server?.getUrl()}`);
    SystemLogger.info("");
    SystemLogger.info("To start the UI, run in a separate terminal:");
    SystemLogger.info("  cd tools/libs/spark_submit/ui && npm run dev");
    SystemLogger.info("");
    SystemLogger.info("Press Ctrl+C to stop the server.");
    SystemLogger.info("═".repeat(60));

    // Keep the server running
    await new Promise<void>((resolve) => {
      process.on("SIGINT", () => {
        SystemLogger.info("\nShutting down...");
        resolve();
      });
      process.on("SIGTERM", () => {
        SystemLogger.info("\nShutting down...");
        resolve();
      });
    });
  }

  /**
   * Run the CLI.
   */
  private async runCLI(args: CliArgs, projectRoot: string): Promise<void> {
    // Create CLI runner with injected dependencies (using interfaces)
    const runner = new CliRunner({
      apiClient: new ApiClient({ baseUrl: this.server?.getUrl() }),
      createJobExecutor: (config, ctx) => new JobExecutor(config, ctx),
      createDagResolver: (config) => new DagResolver(config),
      createJobClassMapper: (config) => new JobClassMapper(config),
      jobLister: new JobLister(),
      configLoader: ConfigLoader.getInstance(),
      runtimeContextFactory: RuntimeContextFactory.getInstance(),
    });

    await runner.run(args, projectRoot);
  }

  /**
   * Shutdown the application gracefully.
   */
  async shutdown(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
    }
    if (this.apiLauncher) {
      await this.apiLauncher.stop();
      this.apiLauncher = null;
    }
  }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  try {
    SystemLogger.setLogger(new ActionLogger(true));

    const args = CliParser.parse();
    SystemLogger.debug(`CLI args: ${JSON.stringify(args)}`);

    const coordinator = new AppCoordinator();
    await coordinator.run(args);
  } catch (e) {
    SystemLogger.error(`Irrecoverable exception occurred: ${e}`);
    throw e;
  }
}

// Run
main()
  .then(() => {
    SystemLogger.success("Spark submit completed.");
    process.exit(0);
  })
  .catch((err: Error) => {
    SystemLogger.error(`Spark submit failed: ${err.message}`);
    process.exit(1);
  });
