#!/usr/bin/env node
/**
 * IMDS Router - Bridges MSI auth to a token relay (App Service mode).
 * Set IDENTITY_ENDPOINT=http://localhost:6020/token and IDENTITY_HEADER=<secret>
 */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PORT = parseInt(process.env.IMDS_ROUTER_PORT ?? '6020', 10)
const RELAY_URL = process.env.IMDS_RELAY_URL ?? 'https://monitoring-1es.servicebus.windows.net/mdrrahman/token'
const EXPECTED_HEADER = 'local-dev-secret'
const LOG_DIR = path.join(__dirname, '../../../.logs')
const LOG_FILE = path.join(LOG_DIR, 'imds-router.log')

fs.mkdirSync(LOG_DIR, { recursive: true })
const log = (msg: string) => {
    const line = `[${new Date().toISOString()}] ${msg}\n`
    fs.appendFileSync(LOG_FILE, line)
}

async function fetchToken(resource: string): Promise<{ access_token: string; expires_on: number }> {
    const relayToken = execSync("az account get-access-token --resource 'https://relay.azure.net' -o tsv --query accessToken", { encoding: 'utf-8' }).trim()
    const res = await fetch(`${RELAY_URL}?resource=${encodeURIComponent(resource)}`, {
        headers: { Authorization: `Bearer ${relayToken}` },
    })
    if (!res.ok) throw new Error(`Relay error: ${res.status}`)
    return res.json() as Promise<{ access_token: string; expires_on: number }>
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
        const token = await fetchToken(resource)
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
    log(`Relay: ${RELAY_URL}`)
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
