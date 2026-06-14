/**
 * System Stats Service
 *
 * Provides system resource monitoring (CPU, memory, I/O, file handles).
 */

import * as fs from 'fs'
import * as os from 'os'
import type { SystemStats } from '../types.js'

// ============================================================================
// State for tracking deltas
// ============================================================================

interface CpuTimes {
    user: number
    nice: number
    sys: number
    idle: number
    irq: number
}

let previousCpuTimes: CpuTimes[] | null = null
let previousIoStats: { read: number; write: number; timestamp: number } | null = null

// ============================================================================
// CPU Stats
// ============================================================================

/**
 * Get CPU usage for all cores
 */
export function getCpuUsage(): { cores: Array<{ id: number; usage: number }>; overall: number } {
    const cpus = os.cpus()
    const cores: Array<{ id: number; usage: number }> = []

    const currentTimes = cpus.map((cpu) => ({
        user: cpu.times.user,
        nice: cpu.times.nice,
        sys: cpu.times.sys,
        idle: cpu.times.idle,
        irq: cpu.times.irq,
    }))

    for (let i = 0; i < cpus.length; i++) {
        let usage = 0

        if (previousCpuTimes && previousCpuTimes[i]) {
            const prev = previousCpuTimes[i]
            const curr = currentTimes[i]

            const totalDiff = curr.user - prev.user + curr.nice - prev.nice + curr.sys - prev.sys + curr.idle - prev.idle + curr.irq - prev.irq

            const idleDiff = curr.idle - prev.idle

            if (totalDiff > 0) {
                usage = Math.round(((totalDiff - idleDiff) / totalDiff) * 100)
            }
        }

        cores.push({ id: i, usage })
    }

    previousCpuTimes = currentTimes

    // Calculate overall usage
    const overall = cores.length > 0 ? Math.round(cores.reduce((sum, c) => sum + c.usage, 0) / cores.length) : 0

    return { cores, overall }
}

// ============================================================================
// Memory Stats
// ============================================================================

/**
 * Get memory usage statistics
 */
export function getMemoryUsage(): {
    total: number
    used: number
    free: number
    usedPercent: number
} {
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free
    const usedPercent = Math.round((used / total) * 100)

    return { total, used, free, usedPercent }
}

// ============================================================================
// I/O Stats
// ============================================================================

/**
 * Get disk I/O statistics (Linux only, returns zeros on other platforms)
 */
export function getIoStats(): {
    readBytes: number
    writeBytes: number
    readBytesPerSec: number
    writeBytesPerSec: number
} {
    const defaultStats = {
        readBytes: 0,
        writeBytes: 0,
        readBytesPerSec: 0,
        writeBytesPerSec: 0,
    }

    try {
        if (process.platform !== 'linux') {
            return defaultStats
        }

        // Read /proc/diskstats
        const diskstats = fs.readFileSync('/proc/diskstats', 'utf-8')
        const lines = diskstats.trim().split('\n')

        let totalRead = 0
        let totalWrite = 0

        for (const line of lines) {
            const parts = line.trim().split(/\s+/)
            if (parts.length < 14) continue

            const deviceName = parts[2]
            // Filter to main devices (sd*, nvme*, vd*)
            if (!deviceName.startsWith('sd') && !deviceName.startsWith('nvme') && !deviceName.startsWith('vd')) {
                continue
            }

            // Skip partitions (e.g., sda1, nvme0n1p1)
            if (/\d+$/.test(deviceName) && !deviceName.includes('n1')) {
                continue
            }

            // Fields 6 and 10 are sectors read/written (512 bytes per sector)
            const sectorsRead = parseInt(parts[5], 10) || 0
            const sectorsWritten = parseInt(parts[9], 10) || 0

            totalRead += sectorsRead * 512
            totalWrite += sectorsWritten * 512
        }

        const now = Date.now()
        let readBytesPerSec = 0
        let writeBytesPerSec = 0

        if (previousIoStats) {
            const timeDiff = (now - previousIoStats.timestamp) / 1000
            if (timeDiff > 0) {
                readBytesPerSec = Math.round((totalRead - previousIoStats.read) / timeDiff)
                writeBytesPerSec = Math.round((totalWrite - previousIoStats.write) / timeDiff)
            }
        }

        previousIoStats = { read: totalRead, write: totalWrite, timestamp: now }

        return {
            readBytes: totalRead,
            writeBytes: totalWrite,
            readBytesPerSec: Math.max(0, readBytesPerSec),
            writeBytesPerSec: Math.max(0, writeBytesPerSec),
        }
    } catch (e) {
        return defaultStats
    }
}

// ============================================================================
// File Handle Stats
// ============================================================================

/**
 * Get file handle usage (Linux only)
 */
export function getFileHandles(): { used: number; max: number } {
    const defaultStats = { used: 0, max: 0 }

    try {
        if (process.platform !== 'linux') {
            return defaultStats
        }

        const fileNr = fs.readFileSync('/proc/sys/fs/file-nr', 'utf-8')
        const parts = fileNr.trim().split(/\s+/)

        if (parts.length >= 3) {
            return {
                used: parseInt(parts[0], 10) || 0,
                max: parseInt(parts[2], 10) || 0,
            }
        }

        return defaultStats
    } catch (e) {
        return defaultStats
    }
}

// ============================================================================
// Combined Stats
// ============================================================================

/**
 * Get all system stats in one call
 */
export function getSystemStats(): SystemStats {
    return {
        timestamp: Date.now(),
        cpu: getCpuUsage(),
        memory: getMemoryUsage(),
        io: getIoStats(),
        fileHandles: getFileHandles(),
    }
}

/**
 * Reset stats state (for testing)
 */
export function resetStats(): void {
    previousCpuTimes = null
    previousIoStats = null
}
