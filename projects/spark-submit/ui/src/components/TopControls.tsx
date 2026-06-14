'use client'

import { Play24Filled, Stop24Filled } from '@fluentui/react-icons'
import { useThemeContext } from './ThemeProvider'

interface TopControlsProps {
    canPlay: boolean
    isExecuting: boolean
    runningCount: number
    pendingJobsCount: number
    onPlay: () => void
    onStop: () => void
}

export default function TopControls({ canPlay, isExecuting, runningCount, pendingJobsCount, onPlay, onStop }: TopControlsProps) {
    const { isDark } = useThemeContext()

    return (
        <div
            style={{
                position: 'fixed',
                top: '70px',
                right: '24px',
                zIndex: 50,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '12px',
            }}
        >
            {/* Play/Stop buttons */}
            <div
                style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '8px',
                    background: isDark ? 'rgba(10, 10, 10, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: '12px',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.4)' : '0 4px 20px rgba(0,0,0,0.1)',
                }}
            >
                {/* Play button */}
                <button
                    onClick={onPlay}
                    disabled={!canPlay || isExecuting}
                    title={isExecuting ? 'Execution in progress...' : canPlay ? `Run ${pendingJobsCount} jobs` : 'Select jobs to run'}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '10px',
                        border: 'none',
                        background: canPlay && !isExecuting ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        color: canPlay && !isExecuting ? '#ffffff' : isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                        cursor: canPlay && !isExecuting ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: canPlay && !isExecuting ? '0 4px 12px rgba(34, 197, 94, 0.4)' : 'none',
                    }}
                >
                    <Play24Filled />
                </button>

                {/* Stop button */}
                <button
                    onClick={onStop}
                    disabled={!isExecuting}
                    title={isExecuting ? 'Stop all jobs' : 'No jobs running'}
                    style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isExecuting ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        color: isExecuting ? '#ffffff' : isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                        cursor: isExecuting ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        boxShadow: isExecuting ? '0 4px 12px rgba(239, 68, 68, 0.4)' : 'none',
                    }}
                >
                    <Stop24Filled />
                </button>
            </div>

            {/* Running indicator */}
            {(isExecuting || runningCount > 0) && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: isDark ? 'rgba(10, 10, 10, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderRadius: '10px',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.15)',
                    }}
                >
                    <div
                        style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#3b82f6',
                            animation: 'pulse 1.5s infinite',
                            boxShadow: '0 0 8px rgba(59, 130, 246, 0.5)',
                        }}
                    />
                    <span
                        style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#60a5fa',
                        }}
                    >
                        {runningCount} job{runningCount !== 1 ? 's' : ''} running
                    </span>
                </div>
            )}

            {/* Pending jobs indicator (when not executing) */}
            {!isExecuting && pendingJobsCount > 0 && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 14px',
                        background: isDark ? 'rgba(10, 10, 10, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderRadius: '10px',
                        border: '1px solid rgba(249, 115, 22, 0.3)',
                        boxShadow: '0 4px 12px rgba(249, 115, 22, 0.1)',
                    }}
                >
                    <div
                        style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: '#f97316',
                        }}
                    />
                    <span
                        style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#fb923c',
                        }}
                    >
                        {pendingJobsCount} job{pendingJobsCount !== 1 ? 's' : ''} queued
                    </span>
                </div>
            )}

            <style jsx global>{`
                @keyframes pulse {
                    0%,
                    100% {
                        opacity: 1;
                        transform: scale(1);
                    }
                    50% {
                        opacity: 0.6;
                        transform: scale(0.9);
                    }
                }
            `}</style>
        </div>
    )
}
