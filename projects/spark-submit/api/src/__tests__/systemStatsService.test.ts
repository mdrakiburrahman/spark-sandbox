/**
 * System Stats Service Tests
 */

import { getCpuUsage, getMemoryUsage, getIoStats, getFileHandles, getSystemStats, resetStats } from '../services/systemStatsService.js'

describe('systemStatsService', () => {
    beforeEach(() => {
        resetStats()
    })

    describe('getCpuUsage', () => {
        it('should return cores array', () => {
            const result = getCpuUsage()
            expect(Array.isArray(result.cores)).toBe(true)
            expect(result.cores.length).toBeGreaterThan(0)
        })

        it('should return core objects with id and usage', () => {
            const result = getCpuUsage()
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
            expect(result.overall).toBe(0)
            for (const core of result.cores) {
                expect(core.usage).toBe(0)
            }
        })

        it('should calculate usage on subsequent calls', async () => {
            // First call to establish baseline
            getCpuUsage()

            // Wait a bit for CPU times to change
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Second call should have actual usage values
            const result = getCpuUsage()
            // Values should be numbers, may or may not be 0
            expect(typeof result.overall).toBe('number')
        })
    })

    describe('getMemoryUsage', () => {
        it('should return total memory', () => {
            const result = getMemoryUsage()
            expect(typeof result.total).toBe('number')
            expect(result.total).toBeGreaterThan(0)
        })

        it('should return used memory', () => {
            const result = getMemoryUsage()
            expect(typeof result.used).toBe('number')
            expect(result.used).toBeGreaterThanOrEqual(0)
            expect(result.used).toBeLessThanOrEqual(result.total)
        })

        it('should return free memory', () => {
            const result = getMemoryUsage()
            expect(typeof result.free).toBe('number')
            expect(result.free).toBeGreaterThanOrEqual(0)
            expect(result.free).toBeLessThanOrEqual(result.total)
        })

        it('should return usedPercent', () => {
            const result = getMemoryUsage()
            expect(typeof result.usedPercent).toBe('number')
            expect(result.usedPercent).toBeGreaterThanOrEqual(0)
            expect(result.usedPercent).toBeLessThanOrEqual(100)
        })

        it('should have used + free = total (approximately)', () => {
            const result = getMemoryUsage()
            // Allow small margin due to timing differences
            const sum = result.used + result.free
            const diff = Math.abs(sum - result.total)
            const tolerance = result.total * 0.01 // 1% tolerance
            expect(diff).toBeLessThan(tolerance)
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

        it('should return 0 for per-second rates on first call', () => {
            const result = getIoStats()
            expect(result.readBytesPerSec).toBe(0)
            expect(result.writeBytesPerSec).toBe(0)
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

        // On Linux, we should have actual values
        if (process.platform === 'linux') {
            it('should return actual values on Linux', () => {
                const result = getFileHandles()
                expect(result.used).toBeGreaterThan(0)
                expect(result.max).toBeGreaterThan(0)
            })
        }
    })

    describe('getSystemStats', () => {
        it('should return combined stats', () => {
            const result = getSystemStats()
            expect(result.cpu).toBeDefined()
            expect(result.memory).toBeDefined()
            expect(result.io).toBeDefined()
            expect(result.fileHandles).toBeDefined()
        })

        it('should include timestamp', () => {
            const before = Date.now()
            const result = getSystemStats()
            const after = Date.now()

            expect(result.timestamp).toBeGreaterThanOrEqual(before)
            expect(result.timestamp).toBeLessThanOrEqual(after)
        })

        it('should have CPU cores array', () => {
            const result = getSystemStats()
            expect(Array.isArray(result.cpu.cores)).toBe(true)
            expect(typeof result.cpu.overall).toBe('number')
        })

        it('should have memory fields', () => {
            const result = getSystemStats()
            expect(typeof result.memory.total).toBe('number')
            expect(typeof result.memory.used).toBe('number')
            expect(typeof result.memory.free).toBe('number')
            expect(typeof result.memory.usedPercent).toBe('number')
        })

        it('should have I/O fields', () => {
            const result = getSystemStats()
            expect(typeof result.io.readBytes).toBe('number')
            expect(typeof result.io.writeBytes).toBe('number')
            expect(typeof result.io.readBytesPerSec).toBe('number')
            expect(typeof result.io.writeBytesPerSec).toBe('number')
        })

        it('should have file handle fields', () => {
            const result = getSystemStats()
            expect(typeof result.fileHandles.used).toBe('number')
            expect(typeof result.fileHandles.max).toBe('number')
        })
    })

    describe('resetStats', () => {
        it('should reset CPU baseline', () => {
            // Get first reading to establish baseline
            getCpuUsage()

            // Reset
            resetStats()

            // Next call should be like first call (0 usage)
            const result = getCpuUsage()
            expect(result.overall).toBe(0)
        })

        it('should reset I/O baseline', () => {
            // Get first reading
            getIoStats()

            // Reset
            resetStats()

            // Next call should have 0 per-second rates
            const result = getIoStats()
            expect(result.readBytesPerSec).toBe(0)
            expect(result.writeBytesPerSec).toBe(0)
        })
    })
})
