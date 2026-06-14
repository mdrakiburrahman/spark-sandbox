'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useThemeContext } from '@/components/ThemeProvider'
import ControlPanel from '@/components/ControlPanel'
import TopControls from '@/components/TopControls'
import SearchBar from '@/components/SearchBar'
import SystemMonitor from '@/components/SystemMonitor'
import OnboardingOverlay from '@/components/OnboardingOverlay'
import { JobCategory, parseJobCategory, JobStatus, ExecutionStatus, JobState, ExecutionSession, JobsConfig } from '@/lib/types'
import { resolveDag } from '@/lib/dag'

// Dynamic import for DagVisualizer to avoid SSR issues with React Flow
const DagVisualizer = dynamic(() => import('@/components/DagVisualizer'), {
    ssr: false,
    loading: () => (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'rgba(255,255,255,0.5)',
            }}
        >
            Loading DAG visualization...
        </div>
    ),
})

// Polling interval in milliseconds
const POLL_INTERVAL = 1000

export default function Home() {
    const { isDark } = useThemeContext()

    // Server state (fetched from API)
    const [config, setConfig] = useState<JobsConfig | null>(null)
    const [session, setSession] = useState<ExecutionSession | null>(null)
    const [runningCount, setRunningCount] = useState(0)

    // Local UI state (not persisted to server)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
    const [highlightedJob, setHighlightedJob] = useState<string | null>(null)
    const [maxParallel, setMaxParallel] = useState(8)
    const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set())
    const [spreadTrigger, setSpreadTrigger] = useState(0)

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

    // Derived state
    const isExecuting = session?.status === 'running'

    const pendingDagJobs = useMemo(() => {
        return selectedJobs
    }, [selectedJobs])

    // Convert server job states to UI format
    const jobStates = useMemo(() => {
        const states: Record<string, { status: JobStatus; output: string; error: string; expanded: boolean }> = {}

        if (config) {
            // Initialize all jobs as idle
            for (const jobName of Object.keys(config.jobs)) {
                states[jobName] = {
                    status: 'idle',
                    output: '',
                    error: '',
                    expanded: expandedJobs.has(jobName),
                }
            }
        }

        // Overlay session state if exists
        if (session?.jobStates) {
            for (const [jobName, state] of Object.entries(session.jobStates)) {
                if (states[jobName]) {
                    states[jobName] = {
                        status: state.status,
                        output: state.output,
                        error: state.error,
                        expanded: expandedJobs.has(jobName),
                    }
                }
            }
        }

        return states
    }, [config, session, expandedJobs])

    // Calculate category counts
    const categoryCounts = useMemo(() => {
        const counts: Record<JobCategory, { total: number; selected: number }> = {
            [JobCategory.Bronze]: { total: 0, selected: 0 },
            [JobCategory.Silver]: { total: 0, selected: 0 },
            [JobCategory.Gold]: { total: 0, selected: 0 },
            [JobCategory.Staging]: { total: 0, selected: 0 },
            [JobCategory.App]: { total: 0, selected: 0 },
            [JobCategory.Demo]: { total: 0, selected: 0 },
            [JobCategory.Ops]: { total: 0, selected: 0 },
        }

        if (config) {
            for (const [jobName, job] of Object.entries(config.jobs)) {
                const category = parseJobCategory(job.category)
                if (category) {
                    counts[category].total++
                    if (selectedJobs.has(jobName)) {
                        counts[category].selected++
                    }
                }
            }
        }

        return counts
    }, [config, selectedJobs])

    // Fetch execution state from API
    const fetchState = useCallback(async () => {
        try {
            const res = await fetch('/api/execution')
            if (!res.ok) throw new Error('Failed to fetch state')

            const data = await res.json()
            setConfig(data.config)
            setSession(data.session)
            setRunningCount(data.runningCount || 0)
            setError(null)
        } catch (err) {
            console.error('Error fetching state:', err)
            // Don't set error for polling failures after initial load
            if (loading) {
                setError(err instanceof Error ? err.message : 'Unknown error')
            }
        } finally {
            setLoading(false)
        }
    }, [loading])

    // Initial fetch and polling setup
    useEffect(() => {
        fetchState()

        // Start polling
        pollIntervalRef.current = setInterval(fetchState, POLL_INTERVAL)

        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current)
            }
        }
    }, [])

    // Restore selected jobs from sessionStorage
    useEffect(() => {
        const saved = sessionStorage.getItem('spark-orchestrator-selected')
        if (saved) {
            try {
                setSelectedJobs(new Set(JSON.parse(saved)))
            } catch {}
        }
    }, [])

    // Save selected jobs to sessionStorage
    useEffect(() => {
        sessionStorage.setItem('spark-orchestrator-selected', JSON.stringify(Array.from(selectedJobs)))
    }, [selectedJobs])

    // API actions
    const handlePlay = useCallback(async () => {
        if (selectedJobs.size === 0) return

        try {
            const res = await fetch('/api/execution', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selectedJobs: Array.from(selectedJobs),
                    maxParallel,
                    noDag: true, // Always use noDag since UI selection already determines what to run
                }),
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Failed to start execution')
            }

            // Immediately fetch state to get new session
            await fetchState()
        } catch (err) {
            console.error('Error starting execution:', err)
            setError(err instanceof Error ? err.message : 'Failed to start execution')
        }
    }, [selectedJobs, maxParallel, fetchState])

    const handleStop = useCallback(async () => {
        try {
            const res = await fetch('/api/execution', { method: 'DELETE' })
            if (!res.ok) throw new Error('Failed to stop execution')
            await fetchState()
        } catch (err) {
            console.error('Error stopping execution:', err)
        }
    }, [fetchState])

    const handleResetAll = useCallback(async () => {
        try {
            const res = await fetch('/api/execution/reset', { method: 'POST' })
            if (!res.ok) throw new Error('Failed to reset')
            setSelectedJobs(new Set())
            await fetchState()
        } catch (err) {
            console.error('Error resetting:', err)
        }
    }, [fetchState])

    // Local UI actions (no API calls)
    const handleAddThisOnly = useCallback(
        (jobName: string) => {
            if (isExecuting) return
            setSelectedJobs((prev) => {
                const newSet = new Set(prev)
                if (newSet.has(jobName)) {
                    newSet.delete(jobName)
                } else {
                    newSet.add(jobName)
                }
                return newSet
            })
        },
        [isExecuting]
    )

    const handleAddDag = useCallback(
        (jobName: string) => {
            if (!config || isExecuting) return
            try {
                const dagJobs = resolveDag(config as any, jobName)
                setSelectedJobs((prev) => {
                    const newSet = new Set(prev)
                    dagJobs.forEach((job) => newSet.add(job))
                    return newSet
                })
            } catch (err) {
                console.error('Error resolving DAG:', err)
            }
        },
        [config, isExecuting]
    )

    const handleToggleExpand = useCallback((jobName: string) => {
        setExpandedJobs((prev) => {
            const newSet = new Set(prev)
            if (newSet.has(jobName)) {
                newSet.delete(jobName)
            } else {
                newSet.add(jobName)
            }
            return newSet
        })
    }, [])

    const handleToggleSelect = useCallback(
        (jobName: string) => {
            if (isExecuting) return
            handleAddThisOnly(jobName)
        },
        [isExecuting, handleAddThisOnly]
    )

    const handleSelectAll = useCallback(() => {
        if (config && !isExecuting) {
            setSelectedJobs(new Set(Object.keys(config.jobs)))
        }
    }, [config, isExecuting])

    const handleDeselectAll = useCallback(() => {
        if (!isExecuting) {
            setSelectedJobs(new Set())
        }
    }, [isExecuting])

    const handleAddCategory = useCallback(
        (category: JobCategory) => {
            if (!config || isExecuting) return
            const categoryJobs = Object.entries(config.jobs)
                .filter(([_, job]) => parseJobCategory(job.category) === category)
                .map(([name]) => name)
            setSelectedJobs((prev) => {
                const newSet = new Set(prev)
                categoryJobs.forEach((job) => newSet.add(job))
                return newSet
            })
        },
        [config, isExecuting]
    )

    const handleHighlightJob = useCallback((jobName: string | null) => {
        setHighlightedJob(jobName)
    }, [])

    const handleFocusJob = useCallback((jobName: string) => {
        setHighlightedJob(jobName)
    }, [])

    const handleMaxParallelChange = useCallback((value: number) => {
        setMaxParallel(value)
    }, [])

    // Find focused failed job
    const focusedFailedJob = useMemo(() => {
        if (!session?.jobStates) return null
        const failed = Object.entries(session.jobStates).find(([_, s]) => s.status === 'failed')
        return failed ? failed[0] : null
    }, [session])

    // Loading state
    if (loading) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'calc(100vh - 120px)',
                    color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                }}
            >
                <div style={{ textAlign: 'center' }}>
                    <div
                        style={{
                            width: '40px',
                            height: '40px',
                            border: `3px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            borderTopColor: '#f97316',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            margin: '0 auto 16px',
                        }}
                    />
                    Loading Spark Jobs Configuration...
                </div>
                <style jsx>{`
                    @keyframes spin {
                        to {
                            transform: rotate(360deg);
                        }
                    }
                `}</style>
            </div>
        )
    }

    // Error state
    if (error && !config) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 'calc(100vh - 120px)',
                    color: '#ef4444',
                }}
            >
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                    <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Failed to load configuration</div>
                    <div style={{ color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>{error}</div>
                </div>
            </div>
        )
    }

    if (!config) {
        return null
    }

    return (
        <div style={{ height: 'calc(100vh - 100px)', width: '100vw', position: 'relative' }}>
            <DagVisualizer
                config={config as any}
                jobStates={jobStates}
                selectedJobs={selectedJobs}
                pendingDagJobs={pendingDagJobs}
                highlightedJob={highlightedJob}
                focusedFailedJob={focusedFailedJob}
                isExecuting={isExecuting}
                onAddThisOnly={handleAddThisOnly}
                onAddDag={handleAddDag}
                onToggleExpand={handleToggleExpand}
                onToggleSelect={handleToggleSelect}
                spreadTrigger={spreadTrigger}
            />
            <SearchBar config={config as any} onHighlightJob={handleHighlightJob} onFocusJob={handleFocusJob} isDark={isDark} />
            <SystemMonitor />
            <TopControls
                canPlay={pendingDagJobs.size > 0 && !isExecuting && runningCount === 0}
                isExecuting={isExecuting || runningCount > 0}
                runningCount={runningCount}
                pendingJobsCount={pendingDagJobs.size}
                onPlay={handlePlay}
                onStop={handleStop}
            />
            <ControlPanel
                selectedCount={selectedJobs.size}
                totalCount={Object.keys(config.jobs).length}
                pendingJobsCount={pendingDagJobs.size}
                isExecuting={isExecuting}
                maxParallel={maxParallel}
                onMaxParallelChange={handleMaxParallelChange}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onResetAll={handleResetAll}
                onAddCategory={handleAddCategory}
                categoryCounts={categoryCounts}
                onSpreadAndFit={() => setSpreadTrigger((n) => n + 1)}
            />
            <OnboardingOverlay />
        </div>
    )
}
