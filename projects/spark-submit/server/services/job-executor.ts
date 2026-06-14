/**
 * Job Executor Implementation
 *
 * Concrete implementation of IJobExecutor interface.
 * Supports both serial (CLI with interleaved logs) and parallel (file-based logs) execution modes.
 */

import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import type {
  Job,
  JobsConfig,
  RuntimeContext,
  ExecutionResult,
  ExecutionSummary,
  IJobExecutor,
  ExecutionOptions,
} from "../../interface/index.js";
import { SparkSubmitCommandBuilder } from "./command-builder.js";
import { SystemLogger } from "../../logging/logger.js";

/**
 * Default implementation of job executor.
 */
export class JobExecutor implements IJobExecutor {
  private readonly commandBuilder: SparkSubmitCommandBuilder;
  private readonly baseLogDir: string;
  private readonly sessionId: string;
  private globalLogStream: fs.WriteStream | null = null;
  private readonly globalLogPath: string;

  constructor(
    private readonly config: JobsConfig,
    private readonly ctx: RuntimeContext,
  ) {
    this.commandBuilder = new SparkSubmitCommandBuilder(config, ctx);

    this.sessionId =
      new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "") + "Z";
    this.baseLogDir = path.join(ctx.logsDir, `session-${this.sessionId}`);
    this.globalLogPath = path.join(this.baseLogDir, "orchestrator.log");

    // Ensure logs directory structure exists
    this.ensureLogDirectories();
  }

  /**
   * Ensure log directory structure exists.
   */
  private ensureLogDirectories(): void {
    if (!fs.existsSync(this.baseLogDir)) {
      fs.mkdirSync(this.baseLogDir, { recursive: true });
    }
    const consoleLogDir = path.join(this.baseLogDir, "console");
    const sparkLogDir = path.join(this.baseLogDir, "spark");
    if (!fs.existsSync(consoleLogDir)) {
      fs.mkdirSync(consoleLogDir, { recursive: true });
    }
    if (!fs.existsSync(sparkLogDir)) {
      fs.mkdirSync(sparkLogDir, { recursive: true });
    }
  }

  /**
   * Write to global orchestrator log file.
   */
  private logGlobal(message: string): void {
    if (!this.globalLogStream) {
      this.globalLogStream = fs.createWriteStream(this.globalLogPath, {
        flags: "a",
      });
    }
    const timestamp = new Date().toISOString();
    this.globalLogStream.write(`[${timestamp}] ${message}\n`);
  }

  /**
   * Execute jobs either serially or in parallel by level.
   */
  async executeJobs(
    jobNames: string[],
    dryRun: boolean,
    options: ExecutionOptions = { parallel: false, streamToConsole: true },
  ): Promise<ExecutionSummary> {
    const results: ExecutionResult[] = [];

    if (dryRun) {
      SystemLogger.info(
        `\n[DRY RUN] Jobs that would run (${jobNames.length}):\n`,
      );
      for (const jobName of jobNames) {
        const job = this.config.jobs[jobName];
        const result = await this.executeJob(jobName, job, true, true);
        results.push(result);
      }
    } else if (options.parallel) {
      await this.executeParallel(jobNames, results, options);
    } else {
      await this.executeSerial(jobNames, results, options);
    }

    // Close global log stream
    if (this.globalLogStream) {
      this.globalLogStream.end();
    }

    return {
      total: results.length,
      passed: results.filter((r) => r.success).map((r) => r.jobName),
      failed: results.filter((r) => !r.success).map((r) => r.jobName),
    };
  }

  /**
   * Execute jobs in parallel by level.
   */
  private async executeParallel(
    jobNames: string[],
    results: ExecutionResult[],
    options: ExecutionOptions,
  ): Promise<void> {
    const jobsByLevel = this.organizeJobsByLevel(jobNames);
    const levels = Array.from(jobsByLevel.keys()).sort((a, b) => a - b);

    SystemLogger.info(
      `\n📊 Parallel execution: ${jobNames.length} jobs across ${levels.length} levels`,
    );
    SystemLogger.info(`📁 Session logs: ${this.baseLogDir}\n`);
    this.logGlobal(`Starting parallel execution of ${jobNames.length} jobs`);

    for (const level of levels) {
      const jobsAtLevel = jobsByLevel.get(level) || [];
      SystemLogger.info(`\n${"─".repeat(60)}`);
      SystemLogger.info(
        `Level ${level}: Running ${jobsAtLevel.length} job(s) in parallel`,
      );
      SystemLogger.info(`Jobs: ${jobsAtLevel.join(", ")}`);
      SystemLogger.info(`${"─".repeat(60)}\n`);
      this.logGlobal(`Level ${level}: Starting ${jobsAtLevel.join(", ")}`);

      // Run all jobs at this level in parallel
      const levelResults = await Promise.all(
        jobsAtLevel.map((jobName) => this.executeJobToFile(jobName)),
      );

      results.push(...levelResults);

      // Print status for each job
      for (const result of levelResults) {
        const statusIcon = result.success ? "✅" : "❌";
        const duration = result.duration
          ? ` (${(result.duration / 1000).toFixed(1)}s)`
          : "";
        const logFile = path.join(
          this.baseLogDir,
          "console",
          `${result.jobName}.log`,
        );
        SystemLogger.info(`${statusIcon} ${result.jobName}${duration}`);
        SystemLogger.info(`   └─ Log: ${logFile}`);
        this.logGlobal(
          `${result.success ? "SUCCESS" : "FAILED"}: ${result.jobName}${duration}`,
        );
      }

      // Check if any failed - stop execution
      const anyFailed = levelResults.some((r) => !r.success);
      if (anyFailed) {
        SystemLogger.error(
          `\n⚠️  Some jobs at level ${level} failed. Stopping DAG execution.`,
        );
        this.logGlobal(`Stopping execution due to failures at level ${level}`);
        break;
      }
    }
  }

  /**
   * Execute jobs serially.
   */
  private async executeSerial(
    jobNames: string[],
    results: ExecutionResult[],
    options: ExecutionOptions,
  ): Promise<void> {
    SystemLogger.info(`\nRunning ${jobNames.length} job(s) serially...\n`);
    SystemLogger.info(`📝 Session logs: ${this.baseLogDir}\n`);

    for (const jobName of jobNames) {
      const job = this.config.jobs[jobName];
      const result = await this.executeJob(
        jobName,
        job,
        false,
        options.streamToConsole,
      );
      results.push(result);

      // Stop on failure in serial mode
      if (!result.success) {
        SystemLogger.error(`Job '${jobName}' failed. Stopping execution.`);
        break;
      }
    }
  }

  /**
   * Organize jobs by their level in the DAG for parallel execution.
   */
  private organizeJobsByLevel(jobNames: string[]): Map<number, string[]> {
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
   * Execute a job with output going to a file (for parallel mode).
   */
  private async executeJobToFile(jobName: string): Promise<ExecutionResult> {
    const job = this.config.jobs[jobName];
    if (!job) {
      return { jobName, success: false, error: `Job '${jobName}' not found` };
    }

    const logFilePath = path.join(this.baseLogDir, "console", `${jobName}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: "w" });

    const writeLog = (message: string) => {
      logStream.write(message);
    };

    // Write header to log file
    writeLog(`${"═".repeat(80)}\n`);
    writeLog(`Job: ${jobName}\n`);
    writeLog(`Class: ${job.class}\n`);
    writeLog(`Module: ${job.module}\n`);
    writeLog(`Description: ${job.description || "N/A"}\n`);
    writeLog(`Started: ${new Date().toISOString()}\n`);
    writeLog(`${"═".repeat(80)}\n\n`);

    try {
      const cmd = this.commandBuilder.build(jobName, job);
      writeLog(`Command: ${cmd.join(" ")}\n\n`);

      const startTime = Date.now();

      const result = await new Promise<{
        status: number | null;
        error?: Error;
      }>((resolve) => {
        const child = spawn(cmd[0], cmd.slice(1), {
          cwd: this.ctx.projectRoot,
          env: this.buildSparkEnv(jobName),
        });

        child.stdout?.on("data", (data: Buffer) => {
          writeLog(data.toString());
        });

        child.stderr?.on("data", (data: Buffer) => {
          writeLog(data.toString());
        });

        child.on("error", (error) => {
          resolve({ status: null, error });
        });

        child.on("close", (code) => {
          resolve({ status: code });
        });
      });

      const duration = Date.now() - startTime;

      // Write footer to log file
      writeLog(`\n${"═".repeat(80)}\n`);
      writeLog(`Completed: ${new Date().toISOString()}\n`);
      writeLog(`Duration: ${(duration / 1000).toFixed(1)}s\n`);
      writeLog(`Exit Code: ${result.status}\n`);
      writeLog(`Status: ${result.status === 0 ? "SUCCESS" : "FAILED"}\n`);
      writeLog(`${"═".repeat(80)}\n`);

      logStream.end();

      if (result.error) {
        return {
          jobName,
          success: false,
          duration,
          error: result.error.message,
        };
      }

      return { jobName, success: result.status === 0, duration };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      writeLog(`\nError: ${errorMessage}\n`);
      logStream.end();
      return { jobName, success: false, error: errorMessage };
    }
  }

  /**
   * Execute a single job with optional console streaming.
   */
  private async executeJob(
    jobName: string,
    job: Job,
    dryRun: boolean,
    streamToConsole: boolean,
  ): Promise<ExecutionResult> {
    this.printJobHeader(jobName, job, streamToConsole);

    // Create per-job log file
    const logFilePath = path.join(this.baseLogDir, "console", `${jobName}.log`);
    const logStream = fs.createWriteStream(logFilePath, { flags: "w" });

    const writeLog = (message: string) => {
      logStream.write(message);
    };

    // Write header to log file
    writeLog(`${"═".repeat(80)}\n`);
    writeLog(`Job: ${jobName}\n`);
    writeLog(`Class: ${job.class}\n`);
    writeLog(`Module: ${job.module}\n`);
    writeLog(`Description: ${job.description || "N/A"}\n`);
    writeLog(`Started: ${new Date().toISOString()}\n`);
    writeLog(`${"═".repeat(80)}\n\n`);

    try {
      const cmd = this.commandBuilder.build(jobName, job);

      if (dryRun) {
        const dryRunMsg = "\n[DRY RUN] Would execute:\n" + cmd.join(" \\\n  ");
        if (streamToConsole) {
          SystemLogger.info(dryRunMsg);
        }
        writeLog(dryRunMsg + "\n");
        logStream.end();
        return { jobName, success: true };
      }

      if (streamToConsole) {
        SystemLogger.info("\nExecuting spark-submit...\n");
        SystemLogger.info(`📝 Job log: ${logFilePath}\n`);
      }
      writeLog(`Command: ${cmd.join(" ")}\n\n`);

      const startTime = Date.now();

      const result = await new Promise<{
        status: number | null;
        error?: Error;
      }>((resolve) => {
        const child = spawn(cmd[0], cmd.slice(1), {
          cwd: this.ctx.projectRoot,
          env: this.buildSparkEnv(jobName),
        });

        child.stdout?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (streamToConsole) {
            process.stdout.write(text);
          }
          writeLog(text);
        });

        child.stderr?.on("data", (data: Buffer) => {
          const text = data.toString();
          if (streamToConsole) {
            process.stderr.write(text);
          }
          writeLog(text);
        });

        child.on("error", (error) => {
          resolve({ status: null, error });
        });

        child.on("close", (code) => {
          resolve({ status: code });
        });
      });

      const duration = Date.now() - startTime;

      // Write footer to log file
      writeLog(`\n${"═".repeat(80)}\n`);
      writeLog(`Completed: ${new Date().toISOString()}\n`);
      writeLog(`Duration: ${(duration / 1000).toFixed(1)}s\n`);
      writeLog(`Exit Code: ${result.status}\n`);
      writeLog(`Status: ${result.status === 0 ? "SUCCESS" : "FAILED"}\n`);
      writeLog(`${"═".repeat(80)}\n`);

      logStream.end();

      if (result.error) {
        throw result.error;
      }

      if (result.status !== 0) {
        const errorMsg = `\n❌ Job '${jobName}' failed with exit code ${result.status}`;
        if (streamToConsole) {
          SystemLogger.error(errorMsg);
        }
        return {
          jobName,
          success: false,
          duration,
          error: `Exit code: ${result.status}`,
        };
      }

      const successMsg = `\n✅ Job '${jobName}' completed successfully (${(duration / 1000).toFixed(1)}s)`;
      if (streamToConsole) {
        SystemLogger.success(successMsg);
      }
      return { jobName, success: true, duration };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorMsg = `\n❌ Job '${jobName}' failed: ${errorMessage}`;
      if (streamToConsole) {
        SystemLogger.error(errorMsg);
      }
      writeLog(`\nError: ${errorMessage}\n`);
      logStream.end();
      return { jobName, success: false, error: errorMessage };
    }
  }

  /**
   * Build environment variables for Spark process.
   */
  private buildSparkEnv(jobName: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      SPARK_HOME: this.ctx.sparkHome,
      SPARK_CONF_DIR: this.ctx.sparkConfDir,
      HADOOP_HOME: process.env.HADOOP_HOME || "/usr/lib/hadoop",
      HADOOP_CONF_DIR: process.env.HADOOP_CONF_DIR || "/etc/hadoop/conf",
      HDP_VERSION: process.env.HDP_VERSION || "5.4.20250511.1",
      SPARK_LOG_DIR: this.baseLogDir,
      LOG_FILE_NAME: jobName,
    };
  }

  /**
   * Print job execution header.
   */
  private printJobHeader(jobName: string, job: Job, toConsole: boolean): void {
    const header = [
      `\n${"═".repeat(80)}`,
      `Job: ${jobName}`,
      `Class: ${job.class}`,
      `Module: ${job.module}`,
      job.description ? `Description: ${job.description}` : null,
      "═".repeat(80),
    ]
      .filter(Boolean)
      .join("\n");

    if (toConsole) {
      SystemLogger.info(header);
    }
  }

  /**
   * Print execution summary.
   */
  printSummary(summary: ExecutionSummary): void {
    const summaryLines = [
      `\n${"═".repeat(80)}`,
      "Summary",
      "═".repeat(80),
      `Total: ${summary.total}`,
      `Passed: ${summary.passed.length}`,
      summary.failed.length > 0
        ? `Failed: ${summary.failed.length}`
        : "Failed: 0",
      summary.failed.length > 0
        ? `\nFailed jobs: ${summary.failed.join(", ")}`
        : null,
      `\n📁 Logs: ${this.baseLogDir}`,
    ]
      .filter(Boolean)
      .join("\n");

    SystemLogger.info(summaryLines);

    if (summary.failed.length > 0) {
      SystemLogger.error(`Failed: ${summary.failed.length}`);
    }
  }
}
