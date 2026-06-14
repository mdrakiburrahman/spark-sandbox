'use client'

import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Dismiss24Regular, Copy16Regular, Checkmark16Regular } from '@fluentui/react-icons'
import { Job } from '@/lib/types'

interface JobDetailsModalProps {
    isOpen: boolean
    onClose: () => void
    jobName: string
    job: Job
    isDark: boolean
}

export default function JobDetailsModal({ isOpen, onClose, jobName, job, isDark }: JobDetailsModalProps) {
    const [copiedCommand, setCopiedCommand] = useState(false)
    const [copiedInline, setCopiedInline] = useState(false)
    const [sparkCommand, setSparkCommand] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // Decode inlineConfig if present
    const decodedInlineConfig = useMemo(() => {
        if (!job.inlineConfig) return null
        try {
            // inlineConfig is stored as plain text in the job config
            return job.inlineConfig
        } catch {
            return null
        }
    }, [job.inlineConfig])

    // Fetch the spark-submit command from API
    useEffect(() => {
        if (isOpen && !sparkCommand) {
            setLoading(true)
            fetch('/api/spark-command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobName }),
            })
                .then((res) => res.json())
                .then((data) => {
                    setSparkCommand(data.command || 'Failed to generate command')
                })
                .catch(() => {
                    setSparkCommand('Error fetching spark-submit command')
                })
                .finally(() => {
                    setLoading(false)
                })
        }
    }, [isOpen, jobName, sparkCommand])

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleEscape)
        }

        return () => {
            document.removeEventListener('keydown', handleEscape)
        }
    }, [isOpen, onClose])

    // Reset state when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSparkCommand(null)
            setCopiedCommand(false)
            setCopiedInline(false)
        }
    }, [isOpen])

    const handleCopyCommand = async () => {
        if (sparkCommand) {
            await navigator.clipboard.writeText(sparkCommand)
            setCopiedCommand(true)
            setTimeout(() => setCopiedCommand(false), 2000)
        }
    }

    const handleCopyInline = async () => {
        if (decodedInlineConfig) {
            await navigator.clipboard.writeText(decodedInlineConfig)
            setCopiedInline(true)
            setTimeout(() => setCopiedInline(false), 2000)
        }
    }

    if (!isOpen) return null

    // Use portal to render modal at document body level, escaping any parent constraints
    return createPortal(
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: '100vw',
                height: '100vh',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                backdropFilter: 'blur(4px)',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '96vw',
                    height: '94vh',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    background: isDark ? 'linear-gradient(180deg, #1a1a1a 0%, #0d0d0d 100%)' : 'linear-gradient(180deg, #ffffff 0%, #f5f5f5 100%)',
                    borderRadius: '16px',
                    border: `2px solid ${isDark ? 'rgba(249, 115, 22, 0.4)' : 'rgba(249, 115, 22, 0.6)'}`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(249, 115, 22, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 24px',
                        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        background: isDark ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.05)',
                    }}
                >
                    <div>
                        <h2
                            style={{
                                margin: 0,
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '18px',
                                fontWeight: 700,
                                color: isDark ? '#ffffff' : '#242424',
                            }}
                        >
                            ⚡ Job Details: {jobName}
                        </h2>
                        <p
                            style={{
                                margin: '4px 0 0 0',
                                fontSize: '12px',
                                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                            }}
                        >
                            Press ESC or click outside to close
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            border: 'none',
                            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                            color: isDark ? '#ffffff' : '#242424',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                        }}
                        title="Close (ESC)"
                    >
                        <Dismiss24Regular />
                    </button>
                </div>

                {/* Content */}
                <div
                    style={{
                        flex: 1,
                        overflow: 'auto',
                        padding: '20px 24px',
                    }}
                >
                    {/* Job Metadata */}
                    <div
                        style={{
                            marginBottom: '24px',
                            padding: '16px',
                            background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                            borderRadius: '12px',
                            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 12px 0',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: isDark ? '#ffffff' : '#242424',
                            }}
                        >
                            📋 Job Metadata
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 16px', fontSize: '13px' }}>
                            <span style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>Module:</span>
                            <span style={{ color: isDark ? '#ffffff' : '#242424', fontFamily: "'JetBrains Mono', monospace" }}>{job.module}</span>

                            <span style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>Class:</span>
                            <span style={{ color: isDark ? '#ffffff' : '#242424', fontFamily: "'JetBrains Mono', monospace" }}>{job.class}</span>

                            <span style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>Category:</span>
                            <span style={{ color: isDark ? '#ffffff' : '#242424' }}>{job.category}</span>

                            <span style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>Description:</span>
                            <span style={{ color: isDark ? '#ffffff' : '#242424' }}>{job.description}</span>

                            {job.dependsOn && job.dependsOn.length > 0 && (
                                <>
                                    <span style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)' }}>Depends On:</span>
                                    <span style={{ color: isDark ? '#f97316' : '#ea580c' }}>{job.dependsOn.join(', ')}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Spark Submit Command */}
                    <div
                        style={{
                            marginBottom: '24px',
                            padding: '16px',
                            background: isDark ? 'rgba(59, 130, 246, 0.1)' : 'rgba(59, 130, 246, 0.05)',
                            borderRadius: '12px',
                            border: `1px solid ${isDark ? 'rgba(59, 130, 246, 0.3)' : 'rgba(59, 130, 246, 0.2)'}`,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <h3
                                style={{
                                    margin: 0,
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    color: isDark ? '#60a5fa' : '#2563eb',
                                }}
                            >
                                🚀 Spark Submit Command
                            </h3>
                            <button
                                onClick={handleCopyCommand}
                                disabled={loading || !sparkCommand}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: copiedCommand ? (isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)') : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                    color: copiedCommand ? (isDark ? '#4ade80' : '#16a34a') : isDark ? '#ffffff' : '#242424',
                                    fontSize: '12px',
                                    cursor: loading || !sparkCommand ? 'not-allowed' : 'pointer',
                                    opacity: loading || !sparkCommand ? 0.5 : 1,
                                }}
                            >
                                {copiedCommand ? <Checkmark16Regular /> : <Copy16Regular />}
                                {copiedCommand ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        <pre
                            style={{
                                margin: 0,
                                padding: '16px',
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '12px',
                                lineHeight: '1.6',
                                background: isDark ? 'rgba(0,0,0,0.4)' : '#ffffff',
                                color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                                borderRadius: '8px',
                                overflow: 'auto',
                                maxHeight: '300px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                            }}
                        >
                            {loading ? 'Loading command...' : sparkCommand || 'No command available'}
                        </pre>
                    </div>

                    {/* Inline Config (if present) */}
                    {decodedInlineConfig && (
                        <div
                            style={{
                                padding: '16px',
                                background: isDark ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.05)',
                                borderRadius: '12px',
                                border: `1px solid ${isDark ? 'rgba(249, 115, 22, 0.3)' : 'rgba(249, 115, 22, 0.2)'}`,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <h3
                                    style={{
                                        margin: 0,
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        color: isDark ? '#f97316' : '#ea580c',
                                    }}
                                >
                                    📝 Inline Configuration
                                </h3>
                                <button
                                    onClick={handleCopyInline}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: copiedInline ? (isDark ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.2)') : isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                                        color: copiedInline ? (isDark ? '#4ade80' : '#16a34a') : isDark ? '#ffffff' : '#242424',
                                        fontSize: '12px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {copiedInline ? <Checkmark16Regular /> : <Copy16Regular />}
                                    {copiedInline ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <pre
                                style={{
                                    margin: 0,
                                    padding: '16px',
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontSize: '12px',
                                    lineHeight: '1.6',
                                    background: isDark ? 'rgba(0,0,0,0.4)' : '#ffffff',
                                    color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.8)',
                                    borderRadius: '8px',
                                    overflow: 'auto',
                                    maxHeight: '250px',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                }}
                            >
                                {decodedInlineConfig}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    )
}
