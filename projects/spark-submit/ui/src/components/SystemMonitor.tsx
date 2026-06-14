'use client'

import { useEffect, useState, useRef } from 'react'
import { useThemeContext } from './ThemeProvider'

interface CpuCore {
    id: number
    usage: number
}

interface SystemStats {
    timestamp: number
    cpu: {
        cores: CpuCore[]
        overall: number
    }
    memory: {
        total: number
        used: number
        free: number
        usedPercent: number
    }
    io: {
        readBytes: number
        writeBytes: number
        readBytesPerSec: number
        writeBytesPerSec: number
    }
    fileHandles: {
        used: number
        max: number
    }
}

interface DataPoint {
    timestamp: number
    cpuCores: number[]
    cpuOverall: number
    memoryPercent: number
    ioReadPerSec: number
    ioWritePerSec: number
    fileHandles: number
}

const HISTORY_DURATION = 10 * 60 * 1000 // 10 minutes in ms
const UPDATE_INTERVAL = 10 * 1000 // 10 seconds

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatBytesPerSec(bytes: number): string {
    return formatBytes(bytes) + '/s'
}

// Mini sparkline component
function Sparkline({ data, color, height = 30, maxValue = 100 }: { data: number[]; color: string; height?: number; maxValue?: number }) {
    const width = 120
    const padding = 2
    const effectiveWidth = width - padding * 2
    const effectiveHeight = height - padding * 2

    if (data.length < 2) {
        return (
            <svg width={width} height={height}>
                <rect width={width} height={height} fill="transparent" />
            </svg>
        )
    }

    const points = data.map((value, i) => {
        const x = padding + (i / (data.length - 1)) * effectiveWidth
        const y = padding + effectiveHeight - (value / maxValue) * effectiveHeight
        return `${x},${y}`
    })

    const areaPoints = [`${padding},${padding + effectiveHeight}`, ...points, `${padding + effectiveWidth},${padding + effectiveHeight}`].join(' ')

    return (
        <svg width={width} height={height}>
            {/* Area fill */}
            <polygon points={areaPoints} fill={color} fillOpacity={0.2} />
            {/* Line */}
            <polyline points={points.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
        </svg>
    )
}

export default function SystemMonitor() {
    const { isDark } = useThemeContext()
    const [history, setHistory] = useState<DataPoint[]>([])
    const [currentStats, setCurrentStats] = useState<SystemStats | null>(null)
    const [isExpanded, setIsExpanded] = useState(true)
    const intervalRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        async function fetchStats() {
            try {
                const res = await fetch('/api/system-stats')
                if (!res.ok) return
                const stats: SystemStats = await res.json()
                setCurrentStats(stats)

                setHistory((prev) => {
                    const now = Date.now()
                    const cutoff = now - HISTORY_DURATION
                    const filtered = prev.filter((p) => p.timestamp > cutoff)

                    const newPoint: DataPoint = {
                        timestamp: stats.timestamp,
                        cpuCores: stats.cpu.cores.map((c) => c.usage),
                        cpuOverall: stats.cpu.overall,
                        memoryPercent: stats.memory.usedPercent,
                        ioReadPerSec: stats.io.readBytesPerSec,
                        ioWritePerSec: stats.io.writeBytesPerSec,
                        fileHandles: stats.fileHandles.used,
                    }

                    return [...filtered, newPoint]
                })
            } catch (e) {
                console.error('Failed to fetch system stats:', e)
            }
        }

        // Fetch immediately
        fetchStats()

        // Then fetch every UPDATE_INTERVAL
        intervalRef.current = setInterval(fetchStats, UPDATE_INTERVAL)

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current)
            }
        }
    }, [])

    if (!currentStats) {
        return null
    }

    const cpuOverallHistory = history.map((h) => h.cpuOverall)
    const memoryHistory = history.map((h) => h.memoryPercent)
    const ioReadHistory = history.map((h) => h.ioReadPerSec)
    const ioWriteHistory = history.map((h) => h.ioWritePerSec)
    const maxIo = Math.max(1, ...ioReadHistory, ...ioWriteHistory)

    return (
        <div
            style={{
                position: 'fixed',
                top: '70px',
                right: '220px',
                zIndex: 50,
                background: isDark ? 'rgba(20, 20, 20, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '12px',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                overflow: 'hidden',
                width: isExpanded ? '280px' : '120px',
                transition: 'width 0.3s ease',
            }}
        >
            {/* Header */}
            <div
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                    padding: '10px 12px',
                    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                    borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                }}
            >
                <span
                    style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: isDark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.9)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}
                >
                    📊 System Monitor
                </span>
                <span style={{ fontSize: '10px', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>{isExpanded ? '◀' : '▶'}</span>
            </div>

            {isExpanded && (
                <div style={{ padding: '12px' }}>
                    {/* CPU Section */}
                    <div style={{ marginBottom: '16px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '8px',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                CPU ({currentStats.cpu.cores.length} cores)
                            </span>
                            <span
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: currentStats.cpu.overall >= 80 ? '#ef4444' : currentStats.cpu.overall >= 50 ? '#f59e0b' : '#22c55e',
                                    fontFamily: 'monospace',
                                }}
                            >
                                {currentStats.cpu.overall.toFixed(1)}%
                            </span>
                        </div>

                        {/* Overall CPU sparkline */}
                        <Sparkline data={cpuOverallHistory} color="#3b82f6" />
                    </div>

                    {/* Memory Section */}
                    <div style={{ marginBottom: '16px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '8px',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Memory
                            </span>
                            <span
                                style={{
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: currentStats.memory.usedPercent >= 90 ? '#ef4444' : currentStats.memory.usedPercent >= 70 ? '#f59e0b' : '#22c55e',
                                    fontFamily: 'monospace',
                                }}
                            >
                                {currentStats.memory.usedPercent.toFixed(1)}%
                            </span>
                        </div>

                        <Sparkline data={memoryHistory} color="#a855f7" />

                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                fontSize: '9px',
                                color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
                                marginTop: '4px',
                            }}
                        >
                            <span>Used: {formatBytes(currentStats.memory.used)}</span>
                            <span>Total: {formatBytes(currentStats.memory.total)}</span>
                        </div>
                    </div>

                    {/* I/O Section */}
                    <div style={{ marginBottom: '16px' }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '8px',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                Disk I/O
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <div
                                    style={{
                                        fontSize: '9px',
                                        color: '#22c55e',
                                        marginBottom: '2px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <span>↓ Read</span>
                                    <span style={{ fontFamily: 'monospace' }}>{formatBytesPerSec(currentStats.io.readBytesPerSec)}</span>
                                </div>
                                <Sparkline data={ioReadHistory} color="#22c55e" height={20} maxValue={maxIo} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div
                                    style={{
                                        fontSize: '9px',
                                        color: '#f59e0b',
                                        marginBottom: '2px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                    }}
                                >
                                    <span>↑ Write</span>
                                    <span style={{ fontFamily: 'monospace' }}>{formatBytesPerSec(currentStats.io.writeBytesPerSec)}</span>
                                </div>
                                <Sparkline data={ioWriteHistory} color="#f59e0b" height={20} maxValue={maxIo} />
                            </div>
                        </div>
                    </div>

                    {/* File Handles Section */}
                    <div>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '4px',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                                    textTransform: 'uppercase',
                                }}
                            >
                                File Handles
                            </span>
                            <span
                                style={{
                                    fontSize: '11px',
                                    fontFamily: 'monospace',
                                    color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)',
                                }}
                            >
                                {currentStats.fileHandles.used.toLocaleString()}
                            </span>
                        </div>

                        {currentStats.fileHandles.max > 0 && (
                            <div
                                style={{
                                    height: '4px',
                                    background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${(currentStats.fileHandles.used / currentStats.fileHandles.max) * 100}%`,
                                        height: '100%',
                                        background: '#60a5fa',
                                        transition: 'width 0.3s ease',
                                    }}
                                />
                            </div>
                        )}

                        <div
                            style={{
                                fontSize: '9px',
                                color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)',
                                marginTop: '2px',
                                textAlign: 'right',
                            }}
                        >
                            Max: {currentStats.fileHandles.max.toLocaleString()}
                        </div>
                    </div>

                    {/* Update indicator */}
                    <div
                        style={{
                            marginTop: '12px',
                            paddingTop: '8px',
                            borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                            fontSize: '9px',
                            color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                            textAlign: 'center',
                        }}
                    >
                        Updates every 10s • 10 min history
                    </div>
                </div>
            )}
        </div>
    )
}
