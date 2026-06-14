import { NextRequest, NextResponse } from 'next/server'
import { spawn, ChildProcess } from 'child_process'
import * as path from 'path'
import { runningProcesses } from '@/lib/processManager'

export async function POST(request: NextRequest) {
    try {
        const { jobName, noDag } = await request.json()

        if (!jobName) {
            return NextResponse.json({ error: 'Job name is required' }, { status: 400 })
        }

        // Get the spark-submit project root (this Next.js app lives in projects/spark-submit/ui).
        // When `npm run dev` runs, process.cwd() === projects/spark-submit/ui — so we go up one
        // level to invoke the CLI's index.ts with the right config + JAR resolution.
        const projectRoot = path.resolve(process.cwd(), '..')

        // Build the command
        const args = ['index.ts', `--job=${jobName}`]
        if (noDag) {
            args.push('--no-dag')
        }

        // Create a response stream
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
            start(controller) {
                const child = spawn('npx', ['tsx', ...args], {
                    cwd: projectRoot,
                    env: {
                        ...process.env,
                        FORCE_COLOR: '0', // Disable colors for cleaner output
                    },
                })

                runningProcesses.set(jobName, child)

                child.stdout?.on('data', (data: Buffer) => {
                    const text = data.toString()
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stdout', data: text })}\n\n`))
                })

                child.stderr?.on('data', (data: Buffer) => {
                    const text = data.toString()
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'stderr', data: text })}\n\n`))
                })

                child.on('error', (error) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', data: error.message })}\n\n`))
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'exit', code: 1 })}\n\n`))
                    runningProcesses.delete(jobName)
                    controller.close()
                })

                child.on('close', (code) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'exit', code: code ?? 0 })}\n\n`))
                    runningProcesses.delete(jobName)
                    controller.close()
                })
            },
            cancel() {
                const process = runningProcesses.get(jobName)
                if (process) {
                    process.kill('SIGTERM')
                    runningProcesses.delete(jobName)
                }
            },
        })

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            },
        })
    } catch (error) {
        console.error('Error running job:', error)
        return NextResponse.json({ error: 'Failed to run job' }, { status: 500 })
    }
}

// Cancel a running job
export async function DELETE(request: NextRequest) {
    try {
        const { jobName } = await request.json()

        if (!jobName) {
            return NextResponse.json({ error: 'Job name is required' }, { status: 400 })
        }

        const process = runningProcesses.get(jobName)
        if (process) {
            process.kill('SIGTERM')
            runningProcesses.delete(jobName)
            return NextResponse.json({ success: true, message: `Job ${jobName} cancelled` })
        }

        return NextResponse.json({ success: false, message: 'Job not running' })
    } catch (error) {
        console.error('Error cancelling job:', error)
        return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 })
    }
}
