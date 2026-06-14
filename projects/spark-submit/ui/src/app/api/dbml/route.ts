import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

interface DbmlField {
    name: string
    type: string
    pk: boolean
    unique: boolean
    notNull: boolean
    note: string | null
    dbdefault: string | null
    increment: boolean
}

interface DbmlTable {
    name: string
    note: string | null
    fields: DbmlField[]
}

interface DbmlRefEndpoint {
    tableName: string
    fieldNames: string[]
    relation: string // '1', '*'
}

interface DbmlRef {
    name: string | null
    endpoints: DbmlRefEndpoint[]
}

interface DbmlSchema {
    tables: DbmlTable[]
    refs: DbmlRef[]
}

function serializeSchema(db: any): DbmlSchema {
    const schema = db.schemas?.[0]
    if (!schema) {
        return { tables: [], refs: [] }
    }

    const tables: DbmlTable[] = (schema.tables || []).map((t: any) => ({
        name: t.name,
        note: t.note || null,
        fields: (t.fields || []).map((f: any) => ({
            name: f.name,
            type: f.type?.type_name || f.type?.schemaName || String(f.type || 'unknown'),
            pk: !!f.pk,
            unique: !!f.unique,
            notNull: !!f.not_null,
            note: f.note || null,
            dbdefault: f.dbdefault?.value != null ? String(f.dbdefault.value) : null,
            increment: !!f.increment,
        })),
    }))

    const refs: DbmlRef[] = (schema.refs || []).map((r: any) => ({
        name: r.name || null,
        endpoints: (r.endpoints || []).map((ep: any) => ({
            tableName: ep.tableName,
            fieldNames: ep.fieldNames || [],
            relation: ep.relation,
        })),
    }))

    return { tables, refs }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { filePath } = body

        if (!filePath || typeof filePath !== 'string') {
            return NextResponse.json({ error: 'filePath is required' }, { status: 400 })
        }

        const resolvedPath = path.resolve(filePath)

        if (!fs.existsSync(resolvedPath)) {
            return NextResponse.json({ error: `File not found: ${resolvedPath}` }, { status: 404 })
        }

        if (!resolvedPath.endsWith('.dbml')) {
            return NextResponse.json({ error: 'File must have .dbml extension' }, { status: 400 })
        }

        const content = fs.readFileSync(resolvedPath, 'utf-8')

        // Dynamic import to avoid SSR issues with @dbml/core
        const { Parser } = await import('@dbml/core')
        const parser = new Parser()
        const db = parser.parse(content, 'dbmlv2')
        const schema = serializeSchema(db)

        return NextResponse.json({
            filePath: resolvedPath,
            schema,
            stats: {
                tables: schema.tables.length,
                refs: schema.refs.length,
                totalFields: schema.tables.reduce((sum, t) => sum + t.fields.length, 0),
            },
        })
    } catch (err: any) {
        const message = err?.message || 'Unknown error parsing DBML'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
