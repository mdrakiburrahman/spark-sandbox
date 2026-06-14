/**
 * Job Logs API Route
 *
 * GET /api/execution/logs/[jobName] - Get logs for a specific job
 */

import { NextRequest, NextResponse } from 'next/server'
import { getExecutionController } from '@/server/executionController'

export async function GET(request: NextRequest, { params }: { params: Promise<{ jobName: string }> }) {
    try {
        const { jobName } = await params
        const controller = getExecutionController()

        const logs = controller.getJobLogs(jobName)

        if (!logs) {
            return NextResponse.json({ error: 'Job not found or no logs available' }, { status: 404 })
        }

        return NextResponse.json(logs)
    } catch (error) {
        console.error('Error getting job logs:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to get job logs' }, { status: 500 })
    }
}
