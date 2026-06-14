import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import yaml from 'yaml'

export async function GET() {
    try {
        // Navigate up from ui/src/app/api/config to spark_submit/config
        const configPath = path.join(process.cwd(), '..', 'config', 'spark-jobs.yaml')

        if (!fs.existsSync(configPath)) {
            return NextResponse.json({ error: `Configuration file not found: ${configPath}` }, { status: 404 })
        }

        const content = fs.readFileSync(configPath, 'utf-8')
        const config = yaml.parse(content)

        return NextResponse.json(config)
    } catch (error) {
        console.error('Error loading config:', error)
        return NextResponse.json({ error: 'Failed to load configuration' }, { status: 500 })
    }
}
