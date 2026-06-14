'use client'

import { SelectAllOn20Regular, SelectAllOff20Regular, ArrowReset20Regular, Add20Regular, Subtract20Regular, Play20Regular } from '@fluentui/react-icons'
import { useThemeContext } from './ThemeProvider'
import { JobCategory, JobCategoryColors } from '@/lib/types'

interface ControlPanelProps {
    selectedCount: number
    totalCount: number
    pendingJobsCount: number
    isExecuting: boolean
    maxParallel: number
    onMaxParallelChange: (value: number) => void
    onSelectAll: () => void
    onDeselectAll: () => void
    onResetAll: () => void
    onAddCategory: (category: JobCategory) => void
    categoryCounts: Record<JobCategory, { total: number; selected: number }>
    onSpreadAndFit: () => void
}

// Category button component for adding all jobs of a category
function CategoryAddButton({
    category,
    color,
    count,
    selectedCount,
    isDisabled,
    onClick,
    isDark,
}: {
    category: string
    color: { bg: string; text: string; border: string }
    count: number
    selectedCount: number
    isDisabled: boolean
    onClick: () => void
    isDark: boolean
}) {
    const allSelected = selectedCount === count && count > 0

    return (
        <button
            onClick={onClick}
            disabled={isDisabled || count === 0}
            title={`Add all ${category} jobs to selection (${count})`}
            style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: `2px solid ${color.border}`,
                background: allSelected ? color.bg : isDisabled ? (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)') : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                color: allSelected ? color.text : isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: isDisabled || count === 0 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                opacity: count === 0 ? 0.3 : isDisabled ? 0.5 : 1,
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
            }}
        >
            <span>{category}</span>
            <span
                style={{
                    background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.5)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                }}
            >
                {selectedCount}/{count}
            </span>
        </button>
    )
}

export default function ControlPanel({
    selectedCount,
    totalCount,
    pendingJobsCount,
    isExecuting,
    maxParallel,
    onMaxParallelChange,
    onSelectAll,
    onDeselectAll,
    onResetAll,
    onAddCategory,
    categoryCounts,
    onSpreadAndFit,
}: ControlPanelProps) {
    const { isDark } = useThemeContext()

    return (
        <div
            style={{
                position: 'fixed',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '16px 24px',
                background: isDark ? 'rgba(10, 10, 10, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '16px',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset' : '0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.5) inset',
            }}
        >
            {/* Top row: Category buttons */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                }}
            >
                <span
                    style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                    }}
                >
                    Add by Category
                </span>
                <CategoryAddButton
                    category="Bronze"
                    color={JobCategoryColors[JobCategory.Bronze]}
                    count={categoryCounts[JobCategory.Bronze]?.total || 0}
                    selectedCount={categoryCounts[JobCategory.Bronze]?.selected || 0}
                    isDisabled={isExecuting}
                    onClick={() => onAddCategory(JobCategory.Bronze)}
                    isDark={isDark}
                />
                <CategoryAddButton
                    category="Silver"
                    color={JobCategoryColors[JobCategory.Silver]}
                    count={categoryCounts[JobCategory.Silver]?.total || 0}
                    selectedCount={categoryCounts[JobCategory.Silver]?.selected || 0}
                    isDisabled={isExecuting}
                    onClick={() => onAddCategory(JobCategory.Silver)}
                    isDark={isDark}
                />
                <CategoryAddButton
                    category="Gold"
                    color={JobCategoryColors[JobCategory.Gold]}
                    count={categoryCounts[JobCategory.Gold]?.total || 0}
                    selectedCount={categoryCounts[JobCategory.Gold]?.selected || 0}
                    isDisabled={isExecuting}
                    onClick={() => onAddCategory(JobCategory.Gold)}
                    isDark={isDark}
                />
            </div>

            {/* Divider */}
            <div
                style={{
                    height: '1px',
                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                    margin: '0 -8px',
                }}
            />

            {/* Bottom row: Selection controls + Max Parallel */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                }}
            >
                {/* Selection info */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <span
                        style={{
                            fontSize: '12px',
                            color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)',
                        }}
                    >
                        <strong style={{ color: isDark ? '#f97316' : '#ea580c' }}>{selectedCount}</strong> selected
                        {pendingJobsCount > selectedCount && <span style={{ color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)' }}> ({pendingJobsCount} with deps)</span>}
                    </span>
                </div>

                {/* Quick actions */}
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                        onClick={onSelectAll}
                        disabled={isExecuting}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            color: isDark ? '#ffffff' : '#242424',
                            fontSize: '11px',
                            cursor: isExecuting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: isExecuting ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                        }}
                        title="Select all jobs"
                    >
                        <SelectAllOn20Regular style={{ fontSize: '14px' }} />
                        All
                    </button>
                    <button
                        onClick={onDeselectAll}
                        disabled={isExecuting}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: 'none',
                            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            color: isDark ? '#ffffff' : '#242424',
                            fontSize: '11px',
                            cursor: isExecuting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: isExecuting ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                        }}
                        title="Deselect all jobs"
                    >
                        <SelectAllOff20Regular style={{ fontSize: '14px' }} />
                        None
                    </button>
                    <button
                        onClick={onResetAll}
                        disabled={isExecuting}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isDark ? 'rgba(239, 68, 68, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                            background: 'transparent',
                            color: isDark ? '#f87171' : '#dc2626',
                            fontSize: '11px',
                            cursor: isExecuting ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            opacity: isExecuting ? 0.5 : 1,
                            transition: 'all 0.2s ease',
                        }}
                        title="Reset all job states"
                    >
                        <ArrowReset20Regular style={{ fontSize: '14px' }} />
                        Reset
                    </button>
                    <button
                        onClick={onSpreadAndFit}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
                            background: 'transparent',
                            color: isDark ? '#60a5fa' : '#2563eb',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s ease',
                        }}
                        title="Spread nodes to fill canvas"
                    >
                        ⊞ Spread &amp; Fit
                    </button>
                </div>

                {/* Separator */}
                <div
                    style={{
                        width: '1px',
                        height: '24px',
                        background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
                    }}
                />

                {/* Max Parallel Control */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <span
                        style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)',
                            textTransform: 'uppercase',
                        }}
                    >
                        Parallel
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                            onClick={() => onMaxParallelChange(Math.max(1, maxParallel - 1))}
                            disabled={maxParallel <= 1 || isExecuting}
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                border: 'none',
                                background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                color: maxParallel <= 1 || isExecuting ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)') : isDark ? '#fff' : '#000',
                                cursor: maxParallel <= 1 || isExecuting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                            }}
                        >
                            <Subtract20Regular />
                        </button>
                        <span
                            style={{
                                width: '28px',
                                textAlign: 'center',
                                fontSize: '14px',
                                fontWeight: 700,
                                color: isDark ? '#fff' : '#000',
                                fontFamily: 'monospace',
                            }}
                        >
                            {maxParallel}
                        </span>
                        <button
                            onClick={() => onMaxParallelChange(Math.min(16, maxParallel + 1))}
                            disabled={maxParallel >= 16 || isExecuting}
                            style={{
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                border: 'none',
                                background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                color: maxParallel >= 16 || isExecuting ? (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)') : isDark ? '#fff' : '#000',
                                cursor: maxParallel >= 16 || isExecuting ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '14px',
                            }}
                        >
                            <Add20Regular />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
