/**
 * Execution API Routes
 *
 * POST /api/execution - Submit a new execution
 * GET /api/execution - Get current execution state
 * DELETE /api/execution - Stop current execution
 * POST /api/execution/reset - Reset execution state
 */

import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import yaml from 'yaml'
import { getExecutionController } from '@/server/executionController'
import { JobsConfig } from '@/server/types'

// Load config if not already loaded
async function ensureConfigLoaded(): Promise<JobsConfig> {
    const controller = getExecutionController()
    let config = controller.getConfig()

    if (!config) {
        // Load from file - navigate up from ui to spark_submit/config
        const configPath = path.join(process.cwd(), '..', 'config', 'spark-jobs.yaml')

        if (!fs.existsSync(configPath)) {
            throw new Error(`Configuration file not found: ${configPath}`)
        }

        const configContent = fs.readFileSync(configPath, 'utf-8')
        config = yaml.parse(configContent) as JobsConfig
        controller.setConfig(config)
    }

    return config
}

/**
 * POST /api/execution - Submit a new execution
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { selectedJobs, maxParallel, noDag } = body

        if (!selectedJobs || !Array.isArray(selectedJobs) || selectedJobs.length === 0) {
            return NextResponse.json({ error: 'selectedJobs is required and must be a non-empty array' }, { status: 400 })
        }

        await ensureConfigLoaded()
        const controller = getExecutionController()

        const session = await controller.submit({
            selectedJobs,
            maxParallel: maxParallel || 8,
            noDag: noDag ?? false,
        })

        return NextResponse.json({
            success: true,
            session,
        })
    } catch (error) {
        console.error('Error submitting execution:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to submit execution' }, { status: 500 })
    }
}

/**
 * GET /api/execution - Get current execution state
 */
export async function GET(request: NextRequest) {
    try {
        await ensureConfigLoaded()
        const controller = getExecutionController()

        const session = controller.getSession()
        const config = controller.getConfig()

        return NextResponse.json({
            session,
            config,
            runningCount: controller.getRunningCount(),
        })
    } catch (error) {
        console.error('Error getting execution state:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to get execution state' }, { status: 500 })
    }
}

/**
 * DELETE /api/execution - Stop current execution
 */
export async function DELETE(request: NextRequest) {
    try {
        const controller = getExecutionController()
        await controller.stop()

        return NextResponse.json({
            success: true,
            message: 'Execution stopped',
            session: controller.getSession(),
        })
    } catch (error) {
        console.error('Error stopping execution:', error)
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to stop execution' }, { status: 500 })
    }
}
