/**
 * CLI Runner
 *
 * Main CLI execution logic.
 * Uses interfaces for all service dependencies.
 */

import type {
  CliArgs,
  IApiClient,
  IJobExecutor,
  IJobLister,
  IDagResolver,
  IJobClassMapper,
  JobsConfig,
  RuntimeContext,
} from "../../interface/index.js";
import { SystemLogger } from "../../logging/logger.js";
import { CliParser } from "./parser.js";
import { resolveSqlSource } from "./sql-source.js";

/**
 * Dependencies for CLI execution.
 */
export interface CliDependencies {
  apiClient: IApiClient;
  createJobExecutor: (config: JobsConfig, ctx: RuntimeContext) => IJobExecutor;
  createDagResolver: (config: JobsConfig) => IDagResolver;
  createJobClassMapper: (config: JobsConfig) => IJobClassMapper;
  jobLister: IJobLister;
  configLoader: { loadJobsConfig(projectRoot: string): JobsConfig };
  runtimeContextFactory: {
    create(config: JobsConfig, projectRoot: string): RuntimeContext;
  };
}

/**
 * CLI Runner - executes CLI commands.
 */
export class CliRunner {
  constructor(private readonly deps: CliDependencies) {}

  /**
   * Execute CLI based on parsed arguments.
   */
  async run(args: CliArgs, projectRoot: string): Promise<void> {
    // SQL mode — always goes through the API server
    if (args.sql !== undefined || args.sqlFile !== undefined) {
      await this.executeSql(args);
      return;
    }

    // Use API mode if --api flag is set
    if (args.api) {
      await this.executeViaApi(args);
    } else {
      await this.executeDirect(args, projectRoot);
    }
  }

  /**
   * Expand `--job=all` (or any list that includes `all`) into the union of every job in the config.
   * Returns the expanded list and prints a banner so the user sees what happened.
   */
  private expandAllSentinel(
    jobs: string[] | undefined,
    config: JobsConfig,
  ): string[] | undefined {
    if (!jobs || jobs.length === 0) return jobs;
    const hasAll = jobs.some((j) => j.toLowerCase() === "all");
    if (!hasAll) return jobs;

    const allJobs = Object.keys(config.jobs).sort();
    SystemLogger.info(
      `📦 Expanding --job=all → ${allJobs.length} job(s): ${allJobs.join(", ")}`,
    );
    return allJobs;
  }

  /**
   * Execute jobs via the API server.
   */
  private async executeViaApi(args: CliArgs): Promise<void> {
    const apiUrl =
      args.apiUrl || process.env.SPARK_API_URL || "http://localhost:4000";

    SystemLogger.info(`🌐 Connecting to API server at ${apiUrl}...`);

    // Check if server is running
    const { healthy, configLoaded } = await this.deps.apiClient.checkHealth();
    if (!healthy) {
      SystemLogger.error(`❌ API server is not available at ${apiUrl}`);
      SystemLogger.info(
        "   Start the server with: nx run spark-submit:run-api",
      );
      process.exit(1);
    }
    if (!configLoaded) {
      SystemLogger.error("❌ API server configuration is not loaded");
      process.exit(1);
    }

    SystemLogger.success("✅ Connected to API server");

    // Handle --list
    if (args.list) {
      const jobs = await this.deps.apiClient.listJobs();
      SystemLogger.info("\nAvailable jobs:");
      for (const job of jobs) {
        SystemLogger.info(`  - ${job.name}`);
      }
      return;
    }

    // Expand `--job=all` against the API's job list.
    if (args.jobs && args.jobs.some((j) => j.toLowerCase() === "all")) {
      const apiJobs = await this.deps.apiClient.listJobs();
      const allJobs = apiJobs.map((j) => j.name).sort();
      SystemLogger.info(
        `📦 Expanding --job=all → ${allJobs.length} job(s): ${allJobs.join(", ")}`,
      );
      args.jobs = allJobs;
    }

    if (!args.jobs || args.jobs.length === 0) {
      CliParser.printUsage();
      return;
    }

    // For dry-run, compute DAG and display
    if (args.dryRun) {
      const selectedJobs = args.jobs;
      const dag = await this.deps.apiClient.computeDag(selectedJobs);
      if (dag) {
        SystemLogger.info("\n📊 Execution Plan (via API):");
        SystemLogger.info(`   Targets: ${selectedJobs.join(", ")}`);
        SystemLogger.info(`   Jobs in DAG: ${dag.effectiveDag.length}`);
        SystemLogger.info(
          `   Execution order: ${dag.effectiveDag.join(" → ")}`,
        );

        SystemLogger.info("\n   Jobs by level:");
        for (const [level, jobs] of Object.entries(dag.jobsByLevel).sort(
          (a, b) => Number(a[0]) - Number(b[0]),
        )) {
          SystemLogger.info(
            `     Level ${level}: ${(jobs as string[]).join(", ")}`,
          );
        }
      }
      return;
    }

    // Submit execution
    const selectedJobs = args.jobs;
    const targetLabel =
      selectedJobs.length === 1
        ? `'${selectedJobs[0]}'`
        : `[${selectedJobs.join(", ")}]`;

    SystemLogger.info(
      `\n🚀 Submitting ${targetLabel}${args.noDag ? " (no-dag)" : " with DAG resolution"}...`,
    );

    const result = await this.deps.apiClient.executeAndWait(
      { selectedJobs, maxParallel: args.parallel ? 8 : 1 },
      {
        pollIntervalMs: 1000,
        onProgress: (session) => {
          const runningJobs = Object.entries(session.jobStates)
            .filter(([_, state]) => state.status === "running")
            .map(([name]) => name);

          if (runningJobs.length > 0) {
            SystemLogger.debug(`Running: ${runningJobs.join(", ")}`);
          }
        },
        onLog: (jobName, line, isError) => {
          const prefix = isError ? "❌" : "📝";
          SystemLogger.info(`${prefix} [${jobName}] ${line}`);
        },
      },
    );

    if (!result.session) {
      SystemLogger.error("❌ No execution session returned");
      process.exit(1);
    }

    // Print summary
    this.printApiSummary(result.session);

    if (!result.success) {
      process.exit(1);
    }
  }

  /**
   * Execute jobs directly (original mode).
   */
  private async executeDirect(
    args: CliArgs,
    projectRoot: string,
  ): Promise<void> {
    const config = this.deps.configLoader.loadJobsConfig(projectRoot);

    if (args.classMap || args.classToJob || args.upstream) {
      this.handleClassMappingQueries(args, config);
      return;
    }

    const ctx = this.deps.runtimeContextFactory.create(config, projectRoot);

    if (args.list) {
      this.deps.jobLister.list(config);
      return;
    }

    // Expand `--job=all` sentinel before validating job names.
    args.jobs = this.expandAllSentinel(args.jobs, config);

    if (!args.jobs || args.jobs.length === 0) {
      CliParser.printUsage();
      return;
    }

    // Validate every requested job exists
    const missing = args.jobs.filter((j) => !config.jobs[j]);
    if (missing.length > 0) {
      SystemLogger.error(`Job(s) not found: ${missing.join(", ")}`);
      SystemLogger.info("\nAvailable jobs:");
      Object.keys(config.jobs)
        .sort()
        .forEach((j) => SystemLogger.info(`  - ${j}`));
      process.exit(1);
    }

    // Resolve the DAG to get execution order (or just the listed jobs if --no-dag)
    let jobsToRun: string[];
    const targetLabel =
      args.jobs.length === 1
        ? `'${args.jobs[0]}'`
        : `[${args.jobs.join(", ")}]`;

    if (args.noDag) {
      // Run exactly the listed jobs in parallel — no DAG resolution
      jobsToRun = args.jobs;
      SystemLogger.info(
        `\nRunning ${jobsToRun.length} job(s) ${targetLabel} (--no-dag mode)`,
      );
    } else {
      // Full DAG resolution — union dependency chains across all targets
      const dagResolver = this.deps.createDagResolver(config);
      jobsToRun = dagResolver.resolveAll(args.jobs);

      // Always print the execution plan(s)
      dagResolver.printPlanAll(args.jobs);

      if (args.dryRun) {
        return;
      }

      const executionMode = args.parallel ? "parallel" : "serial";
      SystemLogger.info(
        `\nResolved ${jobsToRun.length} jobs for ${targetLabel} (${executionMode} mode)`,
      );
      SystemLogger.info("Execution order: " + jobsToRun.join(" → "));
    }

    const executor = this.deps.createJobExecutor(config, ctx);
    const runInParallel = args.parallel && jobsToRun.length > 1;
    const results = await executor.executeJobs(jobsToRun, false, {
      parallel: runInParallel,
      streamToConsole: !runInParallel,
    });

    executor.printSummary(results);

    if (results.failed.length > 0) {
      process.exit(1);
    }
  }

  /**
   * Handle class-mapping CLI queries (--class-map, --class-to-job, --upstream).
   * These are lightweight queries that don't require runtime context or execution.
   */
  private handleClassMappingQueries(args: CliArgs, config: JobsConfig): void {
    const mapper = this.deps.createJobClassMapper(config);

    if (args.classMap) {
      const mappings = mapper.getClassToJobMap();
      SystemLogger.info(JSON.stringify(mappings, null, 2));
      return;
    }

    if (args.classToJob) {
      const mapping = mapper.getJobForClass(args.classToJob);
      if (mapping) {
        SystemLogger.info(JSON.stringify(mapping, null, 2));
      } else {
        SystemLogger.error(`No job found for class '${args.classToJob}'`);
        process.exit(1);
      }
      return;
    }

    if (args.upstream) {
      const mapping = mapper.getJobForClass(args.upstream);
      if (!mapping) {
        SystemLogger.error(`No job found for class '${args.upstream}'`);
        process.exit(1);
        return;
      }

      const upstreamJobs = mapper.getUpstreamDependents(args.upstream);
      SystemLogger.info(
        JSON.stringify(
          {
            sourceClass: args.upstream,
            sourceJob: mapping.jobName,
            upstreamDependents: upstreamJobs,
          },
          null,
          2,
        ),
      );
      return;
    }
  }

  /**
   * Execute a SQL query via the API server and print the result as a markdown table.
   */
  private async executeSql(args: CliArgs): Promise<void> {
    const apiUrl =
      args.apiUrl || process.env.SPARK_API_URL || "http://localhost:4000";

    let sql: string;
    try {
      sql = await resolveSqlSource(args);
    } catch (err) {
      SystemLogger.error(
        `❌ ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }

    SystemLogger.info(`🗄️  Executing SQL via ${apiUrl}...`);
    SystemLogger.info(`   ${sql}\n`);

    try {
      const response = await fetch(`${apiUrl}/api/sql/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        SystemLogger.error(
          `❌ Query failed (${response.status}): ${errorText}`,
        );
        process.exit(1);
      }

      const contentType = response.headers.get("Content-Type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        SystemLogger.error(
          `❌ Unexpected response format: ${text.slice(0, 200)}`,
        );
        process.exit(1);
      }

      const body = (await response.json()) as {
        success: boolean;
        data?: {
          columns: { name: string }[];
          rows: any[][];
          executionTime: number;
          rowCount: number;
        };
        error?: string;
      };

      if (!body.success || !body.data) {
        SystemLogger.error(`❌ ${body.error || "Query failed"}`);
        process.exit(1);
      }

      const { columns, rows, executionTime, rowCount } = body.data;

      if (columns.length === 0) {
        SystemLogger.info("(no results)");
        return;
      }

      // Format as markdown table
      const table = this.formatMarkdownTable(
        columns.map((c) => c.name),
        rows,
      );
      console.log(table);
      SystemLogger.info(`\n${rowCount} row(s) in ${executionTime}ms`);
    } catch (error) {
      SystemLogger.error(`❌ Failed to connect to API server at ${apiUrl}`);
      SystemLogger.info("   Start the API server first, or check --api-url");
      process.exit(1);
    }
  }

  /**
   * Format data as a markdown table string.
   */
  private formatMarkdownTable(headers: string[], rows: any[][]): string {
    const stringify = (v: any): string => {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    };

    // Compute column widths
    const widths = headers.map((h, i) => {
      const cellWidths = rows.map((r) => stringify(r[i]).length);
      return Math.max(h.length, ...cellWidths);
    });

    const pad = (s: string, w: number) =>
      s + " ".repeat(Math.max(0, w - s.length));

    const headerLine =
      "| " + headers.map((h, i) => pad(h, widths[i])).join(" | ") + " |";
    const separatorLine =
      "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
    const dataLines = rows.map(
      (row) =>
        "| " +
        row.map((cell, i) => pad(stringify(cell), widths[i])).join(" | ") +
        " |",
    );

    return [headerLine, separatorLine, ...dataLines].join("\n");
  }

  /**
   * Print execution summary from API.
   */
  private printApiSummary(session: {
    status: string;
    effectiveDag: string[];
    jobStates: Record<string, { status: string }>;
    startTime: number;
    endTime?: number;
    error?: string;
  }): void {
    SystemLogger.info("\n" + "═".repeat(60));
    SystemLogger.info("📊 Execution Summary");
    SystemLogger.info("═".repeat(60));

    const successful = Object.entries(session.jobStates)
      .filter(([_, state]) => state.status === "success")
      .map(([name]) => name);
    const failed = Object.entries(session.jobStates)
      .filter(([_, state]) => state.status === "failed")
      .map(([name]) => name);

    SystemLogger.info(`Status: ${session.status.toUpperCase()}`);
    SystemLogger.info(`Total jobs: ${session.effectiveDag.length}`);
    SystemLogger.info(`Passed: ${successful.length}`);
    SystemLogger.info(`Failed: ${failed.length}`);

    if (session.startTime && session.endTime) {
      const duration = (session.endTime - session.startTime) / 1000;
      SystemLogger.info(`Duration: ${duration.toFixed(1)}s`);
    }

    if (failed.length > 0) {
      SystemLogger.error(`\nFailed jobs: ${failed.join(", ")}`);
    }
  }
}
