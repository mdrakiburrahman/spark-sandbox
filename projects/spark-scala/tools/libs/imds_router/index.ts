#!/usr/bin/env node
/**
 * IMDS Router - Serves tokens via `az account get-access-token` (App Service mode).
 * Set IDENTITY_ENDPOINT=http://localhost:6020/token and IDENTITY_HEADER=<secret>
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = 6020
const EXPECTED_HEADER = 'local-dev-secret'
const LOG_DIR = path.join(__dirname, '../../../.logs')
const LOG_FILE = path.join(LOG_DIR, 'imds-router.log')

fs.mkdirSync(LOG_DIR, { recursive: true })
const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(LOG_FILE, line)
}

function fetchToken(resource: string): { access_token: string; expires_on: number } {
    const json = execSync(`az account get-access-token --resource '${resource}' -o json`, { encoding: 'utf-8' }).trim()
    const result = JSON.parse(json)
    return {
        access_token: result.accessToken,
        expires_on: Math.floor(new Date(result.expiresOn).getTime() / 1000),
    }
}

http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

    log(`${req.method} ${req.url}`)

    if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ Healthy: true }))
    }

    const resource = url.searchParams.get('resource') ?? 'https://storage.azure.com/'
    const identityHeader = req.headers['x-identity-header']
    if (identityHeader !== EXPECTED_HEADER) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        return res.end(JSON.stringify({ error: 'Invalid or missing X-IDENTITY-HEADER' }))
    }

    try {
        const token = fetchToken(resource)
        log(`Token acquired (expires: ${new Date(token.expires_on * 1000).toISOString()})`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ access_token: token.access_token, expires_on: String(token.expires_on), resource, token_type: 'Bearer' }))
    } catch (e) {
        log(`Error: ${e}`)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: String(e) }))
    }
}).listen(PORT, 'localhost', () => {
    log(`IMDS Router on http://localhost:${PORT}`)
    log(`Log file: ${LOG_FILE}`)
})

process.on('SIGTERM', () => {
    log('Received SIGTERM, shutting down')
    process.exit(0)
})
process.on('SIGINT', () => {
    log('Received SIGINT, shutting down')
    process.exit(0)
})
