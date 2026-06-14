import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SPARK_API_URL || 'http://localhost:4000'

// Metastore discovery queries every DB/table — can take 60s+
export const maxDuration = 120

// Always re-execute — never serve a cached metastore response
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    // If the client wants SSE, proxy the SSE stream from the API server
    if (request.headers.get('accept')?.includes('text/event-stream')) {
        try {
            const upstream = await fetch(`${API_BASE}/api/sql/metastore`, {
                headers: { Accept: 'text/event-stream' },
                cache: 'no-store',
            })

            if (!upstream.ok || !upstream.body) {
                return NextResponse.json({ error: 'Failed to connect to API server for metastore streaming' }, { status: 502 })
            }

            return new Response(upstream.body, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-store',
                    Connection: 'keep-alive',
                },
            })
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to stream metastore' }, { status: 500 })
        }
    }

    // Non-SSE JSON fallback
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 120_000)
        const response = await fetch(`${API_BASE}/api/sql/metastore`, {
            signal: controller.signal,
            cache: 'no-store',
        })
        clearTimeout(timeout)
        const result = await response.json()

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Failed to fetch metastore' }, { status: 500 })
        }
        return NextResponse.json(result.data)
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch metastore' }, { status: 500 })
    }
}
