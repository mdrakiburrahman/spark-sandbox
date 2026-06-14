/**
 * Spark Submit API Server
 *
 * Standalone API server for Spark job orchestration.
 *
 * Usage:
 *   npx tsx src/server.ts                     # Start server on default port (4000)
 *   PORT=5000 npx tsx src/server.ts           # Start server on port 5000
 *   PROJECT_ROOT=/path/to/project npx tsx ... # Override project root
 */

import * as path from 'path'
import { createApp } from './app.js'
import { loadConfig, getExecutionService } from './services/index.js'

const PORT = parseInt(process.env.PORT || '4000', 10)
// api/ is inside projects/spark-submit/api — go one level up to the spark-submit root.
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '..')

async function main(): Promise<void> {
    console.log('🚀 Starting Spark Submit API Server...')
    console.log(`📁 Project root: ${PROJECT_ROOT}`)

    // Load configuration
    try {
        const config = loadConfig(PROJECT_ROOT)
        console.log(`📋 Loaded ${Object.keys(config.jobs).length} jobs from configuration`)
    } catch (error) {
        console.error('❌ Failed to load configuration:', error)
        process.exit(1)
    }

    // Initialize execution service
    try {
        getExecutionService(PROJECT_ROOT)
        console.log('✅ Execution service initialized')
    } catch (error) {
        console.error('❌ Failed to initialize execution service:', error)
        process.exit(1)
    }

    // Create and start Express app
    const app = createApp()

    app.listen(PORT, () => {
        console.log(`\n🌟 API Server running on http://localhost:${PORT}`)
        console.log('\nAvailable endpoints:')
        console.log('  GET  /api/health          - Health check')
        console.log('  GET  /api/config          - Get jobs configuration')
        console.log('  GET  /api/config/jobs     - List all jobs')
        console.log('  POST /api/dag/compute     - Compute effective DAG')
        console.log('  POST /api/execution       - Submit execution')
        console.log('  GET  /api/execution       - Get execution state')
        console.log('  DELETE /api/execution     - Stop execution')
        console.log('  GET  /api/system-stats    - Get system statistics')
        console.log('\nSQL / Livy endpoints:')
        console.log('  GET  /api/sql/session                       - Get or create Livy session')
        console.log('  POST /api/sql/query                         - Execute SQL query')
        console.log('  DELETE /api/sql/query                       - Cancel running statement')
        console.log('  GET  /api/sql/metastore                     - Database + table names (no columns)')
        console.log('  GET  /api/sql/metastore/databases/:db/tables/:table  - Refresh one table via Livy')
        console.log('\nSSE endpoints (real-time streaming):')
        console.log('  GET  /api/sse/execution   - Stream execution state and logs')
        console.log('  GET  /api/sse/logs/:job   - Stream logs for specific job')
        console.log('  GET  /api/sse/system-stats - Stream system statistics')
        console.log('')
    })

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...')
        const executionService = getExecutionService()
        await executionService.stop()
        process.exit(0)
    })

    process.on('SIGINT', async () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...')
        const executionService = getExecutionService()
        await executionService.stop()
        process.exit(0)
    })
}

main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
})
