import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SPARK_API_URL || 'http://localhost:4000'

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        // If client accepts SSE, forward the stream from backend
        if (request.headers.get('accept')?.includes('text/event-stream')) {
            const upstream = await fetch(`${API_BASE}/api/sql/query`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'text/event-stream',
                },
                body: JSON.stringify(body),
            })

            return new Response(upstream.body, {
                headers: {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    Connection: 'keep-alive',
                },
            })
        }

        // Non-SSE: regular JSON request
        const response = await fetch(`${API_BASE}/api/sql/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const result = await response.json()

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Query failed' }, { status: 500 })
        }
        return NextResponse.json(result.data)
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Query execution failed' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json()
        const response = await fetch(`${API_BASE}/api/sql/query`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        const result = await response.json()

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Cancel failed' }, { status: 500 })
        }
        return NextResponse.json({ success: true })
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to cancel statement' }, { status: 500 })
    }
}
