/**
 * Type definitions for the Execution Controller
 */
// Re-export runtime values
export { JobCategory, JobCategoryColors, ValidCategories, parseJobCategory, isValidJobCategory } from '@interface/types'

// Re-export types
export type {
    SparkConfigEntry,
    Module,
    Job,
    JobsConfigDefaults,
    JobsConfig,
    RuntimeContext,
    SparkResourceConfigs,
    CliArgs,
    JobStatus,
    ExecutionStatus,
    JobState,
    ExecutionRequest,
    ExecutionResult,
    ExecutionSummary,
    ExecutionSession,
    ApiResponse,
    ExecutionStateResponse,
    JobLogsResponse,
    DagResponse,
    SystemStats,
    LogEvent,
    JobStatusEvent,
} from '@interface/types'

// ============================================================================
// Server-Specific Types
// ============================================================================

export interface ExecutionPlan {
    jobsToRun: string[]
    levels: Map<string, number>
}
