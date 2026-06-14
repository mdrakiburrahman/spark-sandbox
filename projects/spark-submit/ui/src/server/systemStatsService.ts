/**
 * System Stats Service
 *
 * Provides system resource monitoring (CPU, memory, I/O, file handles).
 * Isolated for easy mocking in tests.
 */

import * as os from 'os'
import * as fs from 'fs'
import { SystemStats } from './types'

// Store previous CPU times for calculating usage
let prevCpuTimes: os.CpuInfo[] | null = null
let prevTimestamp: number | null = null

// Store previous I/O stats for rate calculation
let prevIoStats: { readBytes: number; writeBytes: number } | null = null
let prevIoTimestamp: number | null = null

/**
 * Get CPU usage for all cores and overall.
 */
export function getCpuUsage(): { cores: Array<{ id: number; usage: number }>; overall: number } {
    const cpus = os.cpus()
    const currentTime = Date.now()

    if (!prevCpuTimes || !prevTimestamp) {
        prevCpuTimes = cpus
        prevTimestamp = currentTime
        // Return 0 usage on first call
        return {
            cores: cpus.map((_, i) => ({ id: i, usage: 0 })),
            overall: 0,
        }
    }

    const cores: Array<{ id: number; usage: number }> = []
    let totalUsage = 0

    for (let i = 0; i < cpus.length; i++) {
        const prev = prevCpuTimes[i]
        const curr = cpus[i]

        const prevTotal = prev.times.user + prev.times.nice + prev.times.sys + prev.times.idle + prev.times.irq
        const currTotal = curr.times.user + curr.times.nice + curr.times.sys + curr.times.idle + curr.times.irq

        const prevIdle = prev.times.idle
        const currIdle = curr.times.idle

        const totalDiff = currTotal - prevTotal
        const idleDiff = currIdle - prevIdle

        const usage = totalDiff > 0 ? ((totalDiff - idleDiff) / totalDiff) * 100 : 0
        cores.push({ id: i, usage: Math.round(usage * 10) / 10 })
        totalUsage += usage
    }

    prevCpuTimes = cpus
    prevTimestamp = currentTime

    return {
        cores,
        overall: Math.round((totalUsage / cpus.length) * 10) / 10,
    }
}

/**
 * Get memory usage statistics.
 */
export function getMemoryUsage(): { total: number; used: number; free: number; usedPercent: number } {
    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free

    return {
        total,
        used,
        free,
        usedPercent: Math.round((used / total) * 1000) / 10,
    }
}

/**
 * Get I/O statistics (Linux only, returns zeros on other platforms).
 */
export function getIoStats(): { readBytes: number; writeBytes: number; readBytesPerSec: number; writeBytesPerSec: number } {
    const currentTime = Date.now()
    let readBytes = 0
    let writeBytes = 0
    let readBytesPerSec = 0
    let writeBytesPerSec = 0

    try {
        // Read /proc/diskstats for Linux
        if (fs.existsSync('/proc/diskstats')) {
            const diskstats = fs.readFileSync('/proc/diskstats', 'utf8')
            const lines = diskstats.trim().split('\n')

            for (const line of lines) {
                const parts = line.trim().split(/\s+/)
                if (parts.length >= 14) {
                    const deviceName = parts[2]
                    // Only count main block devices (sda, nvme0n1, etc.), not partitions
                    if (/^(sd[a-z]|nvme\d+n\d+|vd[a-z]|xvd[a-z])$/.test(deviceName)) {
                        // Field 6: sectors read, Field 10: sectors written
                        // Sector size is typically 512 bytes
                        readBytes += parseInt(parts[5], 10) * 512
                        writeBytes += parseInt(parts[9], 10) * 512
                    }
                }
            }
        }
    } catch (e) {
        // Ignore errors, return 0
    }

    // Calculate rate
    if (prevIoStats && prevIoTimestamp) {
        const timeDiff = (currentTime - prevIoTimestamp) / 1000 // seconds
        if (timeDiff > 0) {
            readBytesPerSec = Math.round((readBytes - prevIoStats.readBytes) / timeDiff)
            writeBytesPerSec = Math.round((writeBytes - prevIoStats.writeBytes) / timeDiff)
        }
    }

    prevIoStats = { readBytes, writeBytes }
    prevIoTimestamp = currentTime

    return {
        readBytes,
        writeBytes,
        readBytesPerSec: Math.max(0, readBytesPerSec),
        writeBytesPerSec: Math.max(0, writeBytesPerSec),
    }
}

/**
 * Get file handle statistics (Linux only).
 */
export function getFileHandles(): { used: number; max: number } {
    let used = 0
    let max = 0

    try {
        // Read /proc/sys/fs/file-nr for Linux
        if (fs.existsSync('/proc/sys/fs/file-nr')) {
            const fileNr = fs.readFileSync('/proc/sys/fs/file-nr', 'utf8')
            const parts = fileNr.trim().split(/\s+/)
            if (parts.length >= 3) {
                used = parseInt(parts[0], 10)
                max = parseInt(parts[2], 10)
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return { used, max }
}

/**
 * Get all system statistics.
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
 * Reset internal state (useful for testing).
 */
export function resetStats(): void {
    prevCpuTimes = null
    prevTimestamp = null
    prevIoStats = null
    prevIoTimestamp = null
}
