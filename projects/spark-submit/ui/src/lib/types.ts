/**
 * Type definitions for Spark Orchestrator UI
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

import type { Job, JobStatus } from '@interface/types'

// ============================================================================
// UI-Specific Types
// ============================================================================

export interface DagNode {
    id: string
    data: {
        jobName: string
        job: Job
        status: JobStatus
        output: string
        error: string
        expanded: boolean
        onRunOnce: (jobName: string) => void
        onRunDag: (jobName: string) => void
        onToggleExpand: (jobName: string) => void
        onToggleSelect: (jobName: string) => void
        isSelected: boolean
        isDark: boolean
    }
    position: { x: number; y: number }
    type: string
}

export interface DagEdge {
    id: string
    source: string
    target: string
    animated?: boolean
    style?: React.CSSProperties
}

export interface ExecutionPlan {
    jobsToRun: string[]
    levels: Map<string, number>
}
