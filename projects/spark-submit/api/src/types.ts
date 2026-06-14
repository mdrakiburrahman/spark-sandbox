/**
 * Core Types for Spark Orchestrator API
 */
export {
    JobCategory,
    JobCategoryColors,
    ValidCategories,
    parseJobCategory,
    isValidJobCategory,
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
} from '../../interface/index.js'

// ============================================================================
// API-Specific Types
// ============================================================================

/**
 * Server-Sent Event types
 */
export type SSEEventType = 'state' | 'log' | 'job-status' | 'complete' | 'error' | 'heartbeat'

/**
 * SSE event payload
 */
export interface SSEEvent {
    type: SSEEventType
    data: unknown
    timestamp: number
}
