import { NextRequest, NextResponse } from 'next/server'
import { runningProcesses, stopAllProcesses } from '@/lib/processManager'

export async function POST(request: NextRequest) {
    try {
        const count = runningProcesses.size
        stopAllProcesses()

        return NextResponse.json({
            success: true,
            message: `Stopped ${count} running job(s)`,
            stoppedCount: count,
        })
    } catch (error) {
        console.error('Error stopping jobs:', error)
        return NextResponse.json({ error: 'Failed to stop jobs' }, { status: 500 })
    }
}
