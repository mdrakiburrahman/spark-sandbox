/**
 * Execution Reset API Route
 *
 * POST /api/execution/reset - Reset execution state
 */

import { NextRequest, NextResponse } from 'next/server'
import { getExecutionController } from '@/server/executionController'

export async function POST(request: NextRequest) {
    try {
        const controller = getExecutionController()

        if (controller.isExecuting()) {
            return NextResponse.json({ error: 'Cannot reset while execution is in progress' }, { status: 400 })
        }

        controller.clearAll()

        return NextResponse.json({
            success: true,
            message: 'Execution state reset',
        })
    } catch (error) {
        console.error('Error resetting execution:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to reset execution' }, { status: 500 })
    }
}
