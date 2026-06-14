/**
 * Service Interfaces for Spark Submit
 *
 * This module defines the contracts (interfaces) for all services.
 * The client layer depends on these interfaces, NOT concrete implementations.
 * The server layer provides the concrete implementations.
 */

import type {
  CliArgs,
  JobsConfig,
  RuntimeContext,
  ExecutionResult,
  ExecutionSummary,
  ExecutionSession,
  ExecutionRequest,
  DagResponse,
  JobLogsResponse,
  SystemStats,
  JobState,
  LogEvent,
  JobStatusEvent,
} from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Job-Class Mapping Services
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mapping entry from a driver class to its job name.
 */
export interface ClassJobMapping {
  /** Fully qualified driver class name */
  driverClass: string;
  /** Job name in spark-jobs.yaml */
  jobName: string;
  /** Job category (bronze, silver, gold, etc.) */
  category: string;
  /** Job description */
  description: string;
}

/**
 * Interface for mapping driver classes to jobs and computing upstream impact.
 */
export interface IJobClassMapper {
  /**
   * Get the complete driver class → job mapping.
   * @returns Array of all class-to-job mappings
   */
  getClassToJobMap(): ClassJobMapping[];

  /**
   * Find the job for a given fully qualified driver class name.
   * @param className - Fully qualified class name (e.g. com.microsoft.azurearcdata.sparkmsit.etl.drivers.gold.ArnGoldDriver)
   * @returns The matching mapping, or null if not found
   */
  getJobForClass(className: string): ClassJobMapping | null;

  /**
   * Find all jobs that are transitively impacted upstream by a change to the given driver class.
   *
   * "Upstream" means: if driver class X belongs to job A, and jobs B and C depend on A
   * (directly or transitively), then B and C are upstream dependents — they would be
   * affected by a change in X because their execution chain includes job A.
   *
   * @param className - Fully qualified driver class name
   * @returns Array of job names that transitively depend on the job containing this class
   */
  getUpstreamDependents(className: string): string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Services
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for loading job configuration.
 */
export interface IConfigLoader {
  /**
   * Load the jobs configuration from the config file.
   * @param projectRoot - The project root directory
   */
  loadJobsConfig(projectRoot: string): JobsConfig;
}

/**
 * Interface for creating runtime contexts.
 */
export interface IRuntimeContextFactory {
  /**
   * Create a runtime context from configuration.
   * @param config - The jobs configuration
   * @param projectRoot - The project root directory
   */
  create(config: JobsConfig, projectRoot: string): RuntimeContext;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAG Services
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for resolving job dependency graphs.
 */
export interface IDagResolver {
  /**
   * Resolve all dependencies for a job and return them in topological order.
   * @param jobName - The target job to resolve dependencies for
   * @returns Array of job names in execution order (dependencies first)
   */
  resolve(jobName: string): string[];

  /**
   * Resolve the union DAG for multiple target jobs in topological order.
   * Used by the CLI to fan out `--job=a,b,c` across DAGs in parallel.
   * @param jobNames - The target jobs
   */
  resolveAll(jobNames: string[]): string[];

  /**
   * Print the DAG execution plan for a job.
   * @param jobName - The job to print the plan for
   */
  printPlan(jobName: string): void;

  /**
   * Print the DAG execution plan for each of the given target jobs.
   * @param jobNames - The jobs to print plans for
   */
  printPlanAll(jobNames: string[]): void;

  /**
   * Validate all jobs in the configuration have valid dependencies.
   */
  validateAllJobs(): { valid: boolean; errors: string[] };

  /**
   * Get jobs organized by their level in the DAG.
   * @param jobNames - Jobs to organize
   */
  getJobsByLevel(jobNames: string[]): Map<number, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Services
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Options for job execution.
 */
export interface ExecutionOptions {
  /** Run jobs in parallel by level */
  parallel: boolean;
  /** Whether to stream output to console */
  streamToConsole: boolean;
}

/**
 * Interface for job execution.
 */
export interface IJobExecutor {
  /**
   * Execute a list of jobs.
   * @param jobNames - Jobs to execute
   * @param dryRun - If true, only show what would run
   * @param options - Execution options
   */
  executeJobs(
    jobNames: string[],
    dryRun: boolean,
    options?: ExecutionOptions,
  ): Promise<ExecutionSummary>;

  /**
   * Print execution summary.
   * @param summary - The execution summary
   */
  printSummary(summary: ExecutionSummary): void;
}

/**
 * Interface for listing available jobs.
 */
export interface IJobLister {
  /**
   * List all available jobs from configuration.
   * @param config - The jobs configuration
   */
  list(config: JobsConfig): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Client Interface (for CLI/UI to communicate with server)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result from API execution.
 */
export interface ApiExecutionResult {
  success: boolean;
  session?: ExecutionSession;
  error?: string;
}

/**
 * Options for waiting on execution completion.
 */
export interface WaitOptions {
  pollIntervalMs?: number;
  onProgress?: (session: ExecutionSession) => void;
  onLog?: (jobName: string, line: string, isError: boolean) => void;
}

/**
 * Interface for the API client.
 * This is what the CLI and UI depend on to communicate with the server.
 */
export interface IApiClient {
  // Health & Config
  checkHealth(): Promise<{ healthy: boolean; configLoaded: boolean }>;
  waitForReady(maxWaitMs?: number, pollIntervalMs?: number): Promise<boolean>;
  getConfig(): Promise<JobsConfig | null>;
  listJobs(): Promise<Array<{ name: string; [key: string]: unknown }>>;
  getJobsByCategory(): Promise<Record<string, string[]>>;

  // DAG Operations
  computeDag(selectedJobs: string[]): Promise<DagResponse | null>;
  filterJobsByCategory(categories: string[]): Promise<string[]>;

  // Execution Operations
  submitExecution(request: ExecutionRequest): Promise<ExecutionSession>;
  getExecutionState(): Promise<{
    session: ExecutionSession | null;
    isExecuting: boolean;
  }>;
  stopExecution(): Promise<void>;
  resetExecution(): Promise<void>;
  getJobLogs(jobName: string): Promise<JobLogsResponse | null>;
  waitForCompletion(
    pollIntervalMs?: number,
    onProgress?: (session: ExecutionSession) => void,
  ): Promise<ExecutionSession | null>;
  executeAndWait(
    request: ExecutionRequest,
    options?: WaitOptions,
  ): Promise<ApiExecutionResult>;

  // System Stats
  getSystemStats(): Promise<SystemStats | null>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Interface (for the API server to implement)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Callback types for real-time streaming.
 */
export type LogCallback = (event: LogEvent) => void;
export type StatusCallback = (event: JobStatusEvent) => void;

/**
 * Interface for the execution service on the server side.
 */
export interface IExecutionService {
  /**
   * Get current execution session.
   */
  getSession(): ExecutionSession | null;

  /**
   * Check if an execution is currently running.
   */
  isExecuting(): boolean;

  /**
   * Submit a new execution request.
   */
  submit(
    request: ExecutionRequest,
    config: JobsConfig,
  ): Promise<ExecutionSession>;

  /**
   * Stop the current execution.
   */
  stop(): Promise<void>;

  /**
   * Reset execution state (clear session).
   */
  reset(): void;

  /**
   * Register a callback for log events.
   */
  onLog(callback: LogCallback): () => void;

  /**
   * Register a callback for status changes.
   */
  onStatusChange(callback: StatusCallback): () => void;

  /**
   * Get logs for a specific job.
   */
  getJobLogs(jobName: string): { output: string; error: string } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server Lifecycle Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for the server lifecycle management.
 */
export interface IServer {
  /**
   * Start the server.
   * @returns Promise that resolves when server is ready
   */
  start(): Promise<void>;

  /**
   * Stop the server gracefully.
   */
  stop(): Promise<void>;

  /**
   * Get the server URL.
   */
  getUrl(): string;

  /**
   * Check if the server is running.
   */
  isRunning(): boolean;
}
