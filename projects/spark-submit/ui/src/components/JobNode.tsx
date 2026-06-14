'use client'

import { memo, useRef, useEffect, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Add16Regular, AddCircle16Regular, ChevronDown16Regular, ChevronUp16Regular, Checkmark16Regular, FullScreenMaximize16Regular, Info16Regular, Copy16Regular } from '@fluentui/react-icons'
import { JobStatus, Job, JobCategory, JobCategoryColors, parseJobCategory } from '@/lib/types'
import LogModal from './LogModal'
import JobDetailsModal from './JobDetailsModal'

interface JobNodeData {
    jobName: string
    job: Job
    status: JobStatus
    output: string
    error: string
    expanded: boolean
    onAddThisOnly: (jobName: string) => void
    onAddDag: (jobName: string) => void
    onToggleExpand: (jobName: string) => void
    onToggleSelect: (jobName: string) => void
    isSelected: boolean
    isInPendingDag: boolean
    isExecuting: boolean
    isDark: boolean
    isHighlighted?: boolean
    isDimmed?: boolean
}

const statusColors = {
    idle: {
        bg: 'linear-gradient(135deg, rgba(107, 114, 128, 0.15) 0%, rgba(75, 85, 99, 0.25) 100%)',
        border: 'rgba(107, 114, 128, 0.4)',
        glow: 'none',
        text: '#9ca3af',
    },
    pending: {
        bg: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15) 0%, rgba(202, 138, 4, 0.25) 100%)',
        border: 'rgba(234, 179, 8, 0.4)',
        glow: 'none',
        text: '#fbbf24',
    },
    running: {
        bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.35) 100%)',
        border: 'rgba(59, 130, 246, 0.6)',
        glow: '0 0 12px rgba(59, 130, 246, 0.2), 0 0 24px rgba(59, 130, 246, 0.1)',
        text: '#60a5fa',
    },
    success: {
        bg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(22, 163, 74, 0.35) 100%)',
        border: 'rgba(34, 197, 94, 0.6)',
        glow: '0 0 20px rgba(34, 197, 94, 0.3), 0 0 40px rgba(34, 197, 94, 0.15)',
        text: '#4ade80',
    },
    failed: {
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.35) 100%)',
        border: 'rgba(239, 68, 68, 0.6)',
        glow: '0 0 20px rgba(239, 68, 68, 0.3), 0 0 40px rgba(239, 68, 68, 0.15)',
        text: '#f87171',
    },
    cancelled: {
        bg: 'linear-gradient(135deg, rgba(156, 163, 175, 0.15) 0%, rgba(107, 114, 128, 0.25) 100%)',
        border: 'rgba(156, 163, 175, 0.4)',
        glow: 'none',
        text: '#9ca3af',
    },
}

const statusColorsLight = {
    idle: {
        bg: 'linear-gradient(135deg, rgba(156, 163, 175, 0.1) 0%, rgba(107, 114, 128, 0.15) 100%)',
        border: 'rgba(107, 114, 128, 0.3)',
        glow: 'none',
        text: '#6b7280',
    },
    pending: {
        bg: 'linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, rgba(202, 138, 4, 0.15) 100%)',
        border: 'rgba(234, 179, 8, 0.3)',
        glow: 'none',
        text: '#ca8a04',
    },
    running: {
        bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(37, 99, 235, 0.25) 100%)',
        border: 'rgba(59, 130, 246, 0.5)',
        glow: '0 0 10px rgba(59, 130, 246, 0.12)',
        text: '#2563eb',
    },
    success: {
        bg: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.25) 100%)',
        border: 'rgba(34, 197, 94, 0.5)',
        glow: '0 0 15px rgba(34, 197, 94, 0.2)',
        text: '#16a34a',
    },
    failed: {
        bg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.25) 100%)',
        border: 'rgba(239, 68, 68, 0.5)',
        glow: '0 0 15px rgba(239, 68, 68, 0.2)',
        text: '#dc2626',
    },
    cancelled: {
        bg: 'linear-gradient(135deg, rgba(156, 163, 175, 0.1) 0%, rgba(107, 114, 128, 0.15) 100%)',
        border: 'rgba(156, 163, 175, 0.3)',
        glow: 'none',
        text: '#6b7280',
    },
}

function JobNode({ data }: { data: JobNodeData }) {
    const {
        jobName,
        job,
        status,
        output,
        error,
        expanded,
        onAddThisOnly,
        onAddDag,
        onToggleExpand,
        onToggleSelect,
        isSelected,
        isInPendingDag,
        isExecuting,
        isDark,
        isHighlighted = false,
        isDimmed = false,
    } = data

    const [showLogModal, setShowLogModal] = useState(false)
    const [showDetailsModal, setShowDetailsModal] = useState(false)

    const colors = isDark ? statusColors[status] : statusColorsLight[status]
    const outputRef = useRef<HTMLPreElement>(null)

    // Parse job category for header display
    const jobCategory = parseJobCategory(job.category)
    const categoryColors = jobCategory ? JobCategoryColors[jobCategory] : null

    // Auto-scroll output
    useEffect(() => {
        if (outputRef.current && expanded) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight
        }
    }, [output, expanded])

    const isRunning = status === 'running'

    // Determine DAG highlight glow color based on job status
    // Green = done, Orange = running, Yellow = will run
    const getDagHighlightGlow = (): { boxShadow: string; borderColor: string } | null => {
        if (!isHighlighted || isDimmed) return null

        if (status === 'success') {
            // Green glow for completed jobs (subtle)
            return {
                boxShadow: '0 0 8px rgba(34, 197, 94, 0.4), 0 0 16px rgba(34, 197, 94, 0.25)',
                borderColor: '#22c55e',
            }
        } else if (status === 'running') {
            // Orange glow for running jobs (subtle)
            return {
                boxShadow: '0 0 8px rgba(249, 115, 22, 0.4), 0 0 16px rgba(249, 115, 22, 0.25)',
                borderColor: '#f97316',
            }
        } else {
            // Yellow glow for pending jobs (will run) (subtle)
            return {
                boxShadow: '0 0 8px rgba(234, 179, 8, 0.4), 0 0 16px rgba(234, 179, 8, 0.25)',
                borderColor: '#eab308',
            }
        }
    }

    const dagHighlightGlow = getDagHighlightGlow()

    // Dimmed styling for nodes not in active DAG
    const dimmedOpacity = isDimmed ? 0.4 : 1

    return (
        <>
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    opacity: dimmedOpacity,
                    transition: 'all 0.3s ease',
                }}
            >
                {/* Category Header */}
                {jobCategory && categoryColors && (
                    <div
                        style={{
                            background: categoryColors.bg,
                            color: categoryColors.text,
                            borderTop: dagHighlightGlow ? `3px solid ${dagHighlightGlow.borderColor}` : `2px solid ${categoryColors.border}`,
                            borderLeft: dagHighlightGlow ? `3px solid ${dagHighlightGlow.borderColor}` : `2px solid ${categoryColors.border}`,
                            borderRight: dagHighlightGlow ? `3px solid ${dagHighlightGlow.borderColor}` : `2px solid ${categoryColors.border}`,
                            borderBottom: 'none',
                            borderRadius: '12px 12px 0 0',
                            padding: '6px 16px',
                            textAlign: 'center',
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: '11px',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            textTransform: 'uppercase',
                        }}
                    >
                        {jobCategory}
                    </div>
                )}

                {/* Main Job Card */}
                <div
                    style={{
                        minWidth: '320px',
                        maxWidth: '400px',
                        background: colors.bg,
                        border: dagHighlightGlow ? `3px solid ${dagHighlightGlow.borderColor}` : `2px solid ${colors.border}`,
                        borderRadius: jobCategory ? '0 0 12px 12px' : '12px',
                        boxShadow: dagHighlightGlow ? dagHighlightGlow.boxShadow : colors.glow,
                        overflow: 'hidden',
                        transition: 'all 0.3s ease',
                        position: 'relative',
                    }}
                >
                    {/* Running animation bar */}
                    {isRunning && (
                        <div
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                height: '3px',
                                background: 'linear-gradient(90deg, transparent, #3b82f6, transparent)',
                                animation: 'shimmer 1.5s infinite',
                            }}
                        />
                    )}

                    {/* Handles for edges */}
                    <Handle
                        type="target"
                        position={Position.Left}
                        style={{
                            background: isDark ? '#6b7280' : '#9ca3af',
                            border: 'none',
                            width: '8px',
                            height: '8px',
                        }}
                    />
                    <Handle
                        type="source"
                        position={Position.Right}
                        style={{
                            background: isDark ? '#6b7280' : '#9ca3af',
                            border: 'none',
                            width: '8px',
                            height: '8px',
                        }}
                    />

                    {/* Header with checkbox */}
                    <div
                        style={{
                            padding: '12px 16px',
                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '12px',
                        }}
                    >
                        {/* Checkbox */}
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onToggleSelect(jobName)
                            }}
                            style={{
                                width: '20px',
                                height: '20px',
                                borderRadius: '4px',
                                border: `2px solid ${isSelected ? '#f97316' : isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'}`,
                                background: isSelected ? '#f97316' : 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                marginTop: '2px',
                            }}
                        >
                            {isSelected && <Checkmark16Regular style={{ color: '#fff', fontSize: '12px' }} />}
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '13px',
                                    fontWeight: 600,
                                    color: isDark ? '#ffffff' : '#242424',
                                    marginBottom: '4px',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {jobName}
                            </div>
                            <div
                                style={{
                                    fontSize: '11px',
                                    color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                                    marginBottom: '2px',
                                }}
                            >
                                {job.module}
                            </div>
                            <div
                                style={{
                                    fontSize: '10px',
                                    color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    wordBreak: 'break-all',
                                }}
                            >
                                {job.class.split('.').pop()}
                            </div>
                        </div>

                        {/* Status indicator */}
                        <div
                            style={{
                                width: '12px',
                                height: '12px',
                                borderRadius: '50%',
                                background: colors.text,
                                boxShadow: status !== 'idle' ? `0 0 8px ${colors.text}` : 'none',
                                animation: isRunning ? 'pulse 1.5s infinite' : 'none',
                                flexShrink: 0,
                            }}
                        />
                    </div>

                    {/* Description */}
                    <div
                        style={{
                            padding: '8px 16px',
                            fontSize: '11px',
                            color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                            borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                        }}
                    >
                        {job.description}
                    </div>

                    {/* Action buttons */}
                    <div
                        style={{
                            padding: '8px 16px',
                            display: 'flex',
                            gap: '8px',
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onAddThisOnly(jobName)
                            }}
                            disabled={isExecuting}
                            style={{
                                flex: 1,
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: isSelected ? '2px solid #f97316' : 'none',
                                background: isSelected ? (isDark ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.15)') : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                color: isSelected ? '#f97316' : isDark ? '#ffffff' : '#242424',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: isExecuting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                opacity: isExecuting ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                            }}
                            title={isSelected ? 'Remove from selection' : 'Add only this job to selection'}
                        >
                            <Add16Regular />
                            {isSelected ? 'Selected' : 'Add This'}
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onAddDag(jobName)
                            }}
                            disabled={isExecuting}
                            style={{
                                flex: 1,
                                padding: '6px 12px',
                                borderRadius: '6px',
                                border: 'none',
                                background: isInPendingDag && !isSelected ? (isDark ? 'rgba(234, 179, 8, 0.2)' : 'rgba(234, 179, 8, 0.15)') : '#f97316',
                                color: isInPendingDag && !isSelected ? '#eab308' : '#ffffff',
                                fontSize: '11px',
                                fontWeight: 500,
                                cursor: isExecuting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                opacity: isExecuting ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                            }}
                            title="Add this job and all its dependencies to selection"
                        >
                            <AddCircle16Regular />
                            Add DAG
                        </button>
                    </div>

                    {/* Expand/collapse for output */}
                    <div
                        style={{
                            display: 'flex',
                            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`,
                        }}
                    >
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onToggleExpand(jobName)
                            }}
                            style={{
                                flex: 1,
                                padding: '6px 16px',
                                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                                border: 'none',
                                color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                                fontSize: '10px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                            }}
                        >
                            {expanded ? <ChevronUp16Regular /> : <ChevronDown16Regular />}
                            {expanded ? 'Hide Output' : 'Show Output'}
                        </button>
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                setShowDetailsModal(true)
                            }}
                            style={{
                                padding: '6px 12px',
                                background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                                border: 'none',
                                borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)',
                                fontSize: '10px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                            }}
                            title="View job details & spark-submit command"
                        >
                            <Info16Regular />
                        </button>
                    </div>

                    {/* Output panel */}
                    {expanded && (
                        <div
                            style={{
                                borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                                maxHeight: '200px',
                                overflow: 'hidden',
                                position: 'relative',
                            }}
                        >
                            {/* Expand button */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setShowLogModal(true)
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: '#FFE500',
                                    color: '#000000',
                                    fontSize: '9px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    zIndex: 10,
                                    transition: 'filter 0.2s ease',
                                }}
                                title="Expand logs to full screen"
                            >
                                <FullScreenMaximize16Regular />
                                Expand
                            </button>
                            <pre
                                ref={outputRef}
                                style={{
                                    margin: 0,
                                    padding: '12px',
                                    fontSize: '10px',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.02)',
                                    color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)',
                                    overflow: 'auto',
                                    maxHeight: '180px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {output || error || 'No output yet. Run the job to see output here.'}
                            </pre>
                        </div>
                    )}

                    {/* CSS Animations */}
                    <style jsx global>{`
                        @keyframes shimmer {
                            0% {
                                transform: translateX(-100%);
                            }
                            100% {
                                transform: translateX(100%);
                            }
                        }
                        @keyframes pulse {
                            0%,
                            100% {
                                opacity: 1;
                            }
                            50% {
                                opacity: 0.5;
                            }
                        }
                        @keyframes glow-pulse {
                            0%,
                            100% {
                                filter: brightness(1);
                            }
                            50% {
                                filter: brightness(1.2);
                            }
                        }
                    `}</style>
                </div>
            </div>

            {/* Log Modal */}
            <LogModal isOpen={showLogModal} onClose={() => setShowLogModal(false)} jobName={jobName} output={output} error={error} isDark={isDark} />

            {/* Job Details Modal */}
            <JobDetailsModal isOpen={showDetailsModal} onClose={() => setShowDetailsModal(false)} jobName={jobName} job={job} isDark={isDark} />
        </>
    )
}

export default memo(JobNode)
