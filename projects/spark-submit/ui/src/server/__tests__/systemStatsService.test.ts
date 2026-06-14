/**
 * Unit tests for System Stats Service
 */

import { getCpuUsage, getMemoryUsage, getIoStats, getFileHandles, getSystemStats, resetStats } from '../systemStatsService'

describe('systemStatsService', () => {
    beforeEach(() => {
        resetStats()
    })

    describe('getCpuUsage', () => {
        it('should return cores array with usage values', () => {
            const result = getCpuUsage()

            expect(Array.isArray(result.cores)).toBe(true)
            expect(result.cores.length).toBeGreaterThan(0)

            for (const core of result.cores) {
                expect(typeof core.id).toBe('number')
                expect(typeof core.usage).toBe('number')
                expect(core.usage).toBeGreaterThanOrEqual(0)
                expect(core.usage).toBeLessThanOrEqual(100)
            }
        })

        it('should return overall usage', () => {
            const result = getCpuUsage()

            expect(typeof result.overall).toBe('number')
            expect(result.overall).toBeGreaterThanOrEqual(0)
            expect(result.overall).toBeLessThanOrEqual(100)
        })

        it('should return 0 usage on first call (no previous data)', () => {
            const result = getCpuUsage()

            // First call should return 0 since we don't have previous data
            expect(result.overall).toBe(0)
            for (const core of result.cores) {
                expect(core.usage).toBe(0)
            }
        })

        it('should return calculated usage on subsequent calls', async () => {
            // First call to establish baseline
            getCpuUsage()

            // Wait a bit and call again
            await new Promise((r) => setTimeout(r, 100))

            const result = getCpuUsage()

            // Second call should have calculated values (may still be low if CPU is idle)
            expect(typeof result.overall).toBe('number')
        })
    })

    describe('getMemoryUsage', () => {
        it('should return memory statistics', () => {
            const result = getMemoryUsage()

            expect(typeof result.total).toBe('number')
            expect(typeof result.used).toBe('number')
            expect(typeof result.free).toBe('number')
            expect(typeof result.usedPercent).toBe('number')
        })

        it('should have valid memory values', () => {
            const result = getMemoryUsage()

            expect(result.total).toBeGreaterThan(0)
            expect(result.free).toBeGreaterThanOrEqual(0)
            expect(result.used).toBeGreaterThan(0)
            expect(result.usedPercent).toBeGreaterThanOrEqual(0)
            expect(result.usedPercent).toBeLessThanOrEqual(100)
        })

        it('should have consistent values (used + free = total)', () => {
            const result = getMemoryUsage()

            // Allow for small rounding differences
            const calculatedTotal = result.used + result.free
            expect(Math.abs(calculatedTotal - result.total)).toBeLessThan(1024 * 1024) // Within 1MB
        })
    })

    describe('getIoStats', () => {
        it('should return I/O statistics', () => {
            const result = getIoStats()

            expect(typeof result.readBytes).toBe('number')
            expect(typeof result.writeBytes).toBe('number')
            expect(typeof result.readBytesPerSec).toBe('number')
            expect(typeof result.writeBytesPerSec).toBe('number')
        })

        it('should return non-negative values', () => {
            const result = getIoStats()

            expect(result.readBytes).toBeGreaterThanOrEqual(0)
            expect(result.writeBytes).toBeGreaterThanOrEqual(0)
            expect(result.readBytesPerSec).toBeGreaterThanOrEqual(0)
            expect(result.writeBytesPerSec).toBeGreaterThanOrEqual(0)
        })
    })

    describe('getFileHandles', () => {
        it('should return file handle statistics', () => {
            const result = getFileHandles()

            expect(typeof result.used).toBe('number')
            expect(typeof result.max).toBe('number')
        })

        it('should return non-negative values', () => {
            const result = getFileHandles()

            expect(result.used).toBeGreaterThanOrEqual(0)
            expect(result.max).toBeGreaterThanOrEqual(0)
        })
    })

    describe('getSystemStats', () => {
        it('should return complete system statistics', () => {
            const result = getSystemStats()

            expect(result.timestamp).toBeDefined()
            expect(result.cpu).toBeDefined()
            expect(result.memory).toBeDefined()
            expect(result.io).toBeDefined()
            expect(result.fileHandles).toBeDefined()
        })

        it('should have current timestamp', () => {
            const before = Date.now()
            const result = getSystemStats()
            const after = Date.now()

            expect(result.timestamp).toBeGreaterThanOrEqual(before)
            expect(result.timestamp).toBeLessThanOrEqual(after)
        })

        it('should include all CPU data', () => {
            const result = getSystemStats()

            expect(Array.isArray(result.cpu.cores)).toBe(true)
            expect(typeof result.cpu.overall).toBe('number')
        })

        it('should include all memory data', () => {
            const result = getSystemStats()

            expect(typeof result.memory.total).toBe('number')
            expect(typeof result.memory.used).toBe('number')
            expect(typeof result.memory.free).toBe('number')
            expect(typeof result.memory.usedPercent).toBe('number')
        })

        it('should include all I/O data', () => {
            const result = getSystemStats()

            expect(typeof result.io.readBytes).toBe('number')
            expect(typeof result.io.writeBytes).toBe('number')
            expect(typeof result.io.readBytesPerSec).toBe('number')
            expect(typeof result.io.writeBytesPerSec).toBe('number')
        })

        it('should include all file handle data', () => {
            const result = getSystemStats()

            expect(typeof result.fileHandles.used).toBe('number')
            expect(typeof result.fileHandles.max).toBe('number')
        })
    })

    describe('resetStats', () => {
        it('should reset internal state', () => {
            // Get stats twice to establish state
            getCpuUsage()
            getIoStats()

            // Reset
            resetStats()

            // After reset, first call should return 0 for CPU usage
            const cpuResult = getCpuUsage()
            expect(cpuResult.overall).toBe(0)
        })
    })
})
