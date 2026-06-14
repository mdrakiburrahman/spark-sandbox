import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SPARK_API_URL || 'http://localhost:4000'

// A single DESCRIBE is fast, but keep a generous timeout for cold Livy sessions.
export const maxDuration = 60

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ db: string; table: string }> }) {
    const { db, table } = await ctx.params
    const upstreamUrl = `${API_BASE}/api/sql/metastore/databases/${encodeURIComponent(db)}/tables/${encodeURIComponent(table)}`

    if (request.headers.get('accept')?.includes('text/event-stream')) {
        try {
            const upstream = await fetch(upstreamUrl, {
                headers: { Accept: 'text/event-stream' },
                cache: 'no-store',
                signal: request.signal,
            })

            if (!upstream.ok || !upstream.body) {
                return NextResponse.json({ error: `Failed to connect to API server for table refresh (${upstream.status})` }, { status: 502 })
            }

            return new Response(upstream.body, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-store',
                    Connection: 'keep-alive',
                },
            })
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to stream table refresh' }, { status: 500 })
        }
    }

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 60_000)
        const response = await fetch(upstreamUrl, {
            signal: controller.signal,
            cache: 'no-store',
        })
        clearTimeout(timeout)
        const result = await response.json()

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Failed to refresh table' }, { status: 500 })
        }
        return NextResponse.json(result.data)
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to refresh table' }, { status: 500 })
    }
}
