/**
 * Shared Type Definitions for Spark Submit
 *
 * This module contains all shared types used by both the client (CLI/UI) and server.
 * These types form the contract between client and server layers.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Category Enum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Job category enum for visual grouping and color coding.
 */
export enum JobCategory {
  Bronze = "bronze",
  Silver = "silver",
  Gold = "gold",
  Staging = "staging",
  App = "app",
  Demo = "demo",
  Ops = "ops",
}

/**
 * Color definitions for each job category.
 */
export const JobCategoryColors: Record<
  JobCategory,
  { bg: string; text: string; border: string }
> = {
  [JobCategory.Bronze]: { bg: "#CD7F32", text: "#FFFFFF", border: "#8B4513" },
  [JobCategory.Silver]: { bg: "#C0C0C0", text: "#1F2937", border: "#808080" },
  [JobCategory.Gold]: { bg: "#FFD700", text: "#1F2937", border: "#DAA520" },
  [JobCategory.Staging]: { bg: "#1F2937", text: "#FFFFFF", border: "#111827" },
  [JobCategory.App]: { bg: "#8B0000", text: "#FFFFFF", border: "#5C0000" },
  [JobCategory.Demo]: { bg: "#00008B", text: "#FFFFFF", border: "#000066" },
  [JobCategory.Ops]: { bg: "#6B7280", text: "#FFFFFF", border: "#4B5563" },
};

/**
 * Valid category values that can appear in the YAML.
 */
export const ValidCategories: Set<string> = new Set([
  JobCategory.Bronze,
  JobCategory.Silver,
  JobCategory.Gold,
  JobCategory.Staging,
  JobCategory.App,
  JobCategory.Demo,
  JobCategory.Ops,
]);

/**
 * Parse a category string from YAML and return the corresponding JobCategory.
 */
export function parseJobCategory(category: string): JobCategory {
  if (!category || typeof category !== "string") {
    throw new Error(
      `Invalid category: category must be a non-empty string, got: ${category}`,
    );
  }

  const normalized = category.toLowerCase().trim();

  if (ValidCategories.has(normalized)) {
    return normalized as JobCategory;
  }

  throw new Error(
    `Unknown category "${category}". Valid categories are: ${Array.from(ValidCategories).join(", ")}`,
  );
}

/**
 * Validate that a category string is a valid JobCategory.
 */
export function isValidJobCategory(category: string): boolean {
  if (!category || typeof category !== "string") {
    return false;
  }
  return ValidCategories.has(category.toLowerCase().trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SparkConfigEntry {
  key: string;
  value: string;
}

export interface Module {
  jarPattern: string;
  configPath: string;
  useSparkConfigs: boolean;
  useAdditionalJars: boolean;
}

export interface Job {
  module: string;
  class: string;
  category: string;
  description: string;
  args?: string[];
  sparkConfigSets?: string[];
  useAdditionalJars?: boolean;
  /** Inline YAML config to be base64 encoded and passed to the driver */
  inlineConfig?: string;
  /** Jobs that must complete before this job can run */
  dependsOn?: string[];
}

export interface JobsConfigDefaults {
  sparkHome: string;
  sparkConfDir: string;
  ivyDir: string;
  tempDir: string;
  heapDumpDir: string;
  logsDir: string;
  /** Optional path to a sibling spark-scala project (where JARs / log4j2.properties live). */
  sparkScalaDir?: string;
}

export interface JobsConfig {
  defaults: JobsConfigDefaults;
  additionalJars: string[];
  modules: Record<string, Module>;
  sparkConfigSets: Record<string, SparkConfigEntry[]>;
  jobs: Record<string, Job>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RuntimeContext {
  projectRoot: string;
  home: string;
  sparkHome: string;
  sparkConfDir: string;
  sparkScalaDir: string;
  ivyDir: string;
  tempDir: string;
  heapDumpDir: string;
  logsDir: string;
}

export interface SparkResourceConfigs {
  driverMemory: string;
  executorMemory: string;
  driverCores: number;
  executorCores: number;
  numExecutors: number;
  /** Extra `-X...` options merged into spark.driver.extraJavaOptions */
  driverDefaultJavaOptions?: string;
  /** Extra `-X...` options merged into spark.executor.extraJavaOptions */
  executorDefaultJavaOptions?: string;
  offHeapEnabled?: boolean;
  offHeapMemory?: string;
  shufflePartitions?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CliArgs {
  /** Raw `--job=` value as passed on the CLI (may be comma-separated). */
  job?: string;
  /** Parsed list of job names from `--job=a,b,c` — fans out across DAGs in parallel like the UI. */
  jobs?: string[];
  dryRun: boolean;
  list: boolean;
  /** When true, run only the specified job without resolving DAG dependencies */
  noDag: boolean;
  /** When true, run jobs in parallel by level (default: true) */
  parallel: boolean;
  /** When true, use the API server instead of direct execution */
  api: boolean;
  /** API server URL (default: http://localhost:4000) */
  apiUrl?: string;
  /** When true, launch the UI instead of CLI */
  ui?: boolean;
  /** When true, print the full driver class → job mapping as JSON */
  classMap?: boolean;
  /** Fully qualified driver class name to look up the corresponding job */
  classToJob?: string;
  /** Fully qualified driver class name to find all upstream dependent jobs */
  upstream?: string;
  /** SQL query to execute via Livy (e.g. --sql="SHOW DATABASES") */
  sql?: string;
  /** Path to a `.sql` file whose contents are sent verbatim — use for
   *  complex multi-line SQL that nx's shell forwarding would mangle. */
  sqlFile?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Types
// ─────────────────────────────────────────────────────────────────────────────

export type JobStatus =
  | "idle"
  | "pending"
  | "running"
  | "success"
  | "failed"
  | "cancelled";

export type ExecutionStatus =
  | "idle"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface JobState {
  status: JobStatus;
  output: string;
  error: string;
  startTime?: number;
  endTime?: number;
  exitCode?: number;
}

export interface ExecutionRequest {
  selectedJobs: string[];
  maxParallel?: number;
  noDag?: boolean;
}

export interface ExecutionResult {
  jobName: string;
  success: boolean;
  duration?: number;
  error?: string;
}

export interface ExecutionSummary {
  total: number;
  passed: string[];
  failed: string[];
}

export interface ExecutionSession {
  id: string;
  status: ExecutionStatus;
  selectedJobs: string[];
  effectiveDag: string[];
  jobStates: Record<string, JobState>;
  maxParallel: number;
  currentLevel: number;
  totalLevels: number;
  startTime: number;
  endTime?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Response Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ExecutionStateResponse {
  session: ExecutionSession | null;
  isExecuting: boolean;
}

export interface JobLogsResponse {
  jobName: string;
  output: string;
  error: string;
  status: JobStatus;
}

export interface DagResponse {
  effectiveDag: string[];
  jobsByLevel: Record<number, string[]>;
  edges: Array<{ source: string; target: string }>;
}

export interface SystemStats {
  timestamp: number;
  cpu: {
    cores: Array<{ id: number; usage: number }>;
    overall: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usedPercent: number;
  };
  io: {
    readBytes: number;
    writeBytes: number;
    readBytesPerSec: number;
    writeBytesPerSec: number;
  };
  fileHandles: {
    used: number;
    max: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Types (for SSE/streaming)
// ─────────────────────────────────────────────────────────────────────────────

export interface LogEvent {
  type: "log";
  jobName: string;
  line: string;
  isError: boolean;
  timestamp: number;
}

export interface JobStatusEvent {
  type: "status";
  jobName: string;
  status: JobStatus;
  timestamp: number;
}
