/**
 * System Stats API Route
 *
 * GET /api/system-stats - Get current system statistics
 */

import { NextResponse } from 'next/server'
import { getSystemStats } from '@/server/systemStatsService'

export async function GET() {
    const stats = getSystemStats()
    return NextResponse.json(stats)
}
