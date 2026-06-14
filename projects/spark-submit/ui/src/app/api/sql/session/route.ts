import { NextRequest, NextResponse } from 'next/server'

const API_BASE = process.env.SPARK_API_URL || 'http://localhost:4000'

export async function GET(request: NextRequest) {
    try {
        const response = await fetch(`${API_BASE}/api/sql/session`)
        const result = await response.json()

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Failed to get session' }, { status: 500 })
        }
        return NextResponse.json(result.data)
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to get session' }, { status: 500 })
    }
}
