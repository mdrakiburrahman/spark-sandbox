#!/usr/bin/env node
/**
 * IMDS Router - Emulates the Azure App Service Managed Identity (IMDS) token endpoint and
 * serves tokens per request via a routing table:
 *   - `default` profile  → `az account get-access-token` (the signed-in identity; OneLake)
 *   - `SNI` profile       → a Key Vault certificate (subject-name/issuer) for an SPN (ADLS)
 *
 * Set IDENTITY_ENDPOINT=http://localhost:6020/token and IDENTITY_HEADER=<secret>.
 *
 * Composition root: wires config + logging + routing + cache + credential providers into
 * the server, and on boot downloads each SNI cert and warms its token cache.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { AppConfig } from './config/app-config'
import { Logger } from './logging/logger'
import { Router } from './routing/router'
import { TokenCache } from './cache/token-cache'
import { AzCliTokenProvider } from './credential/az-cli-token-provider'
import { SniTokenProvider } from './credential/sni-token-provider'
import { TokenService } from './credential/token-service'
import { ImdsRouterServer } from './server/imds-router-server'

const WARMUP_RESOURCE = 'https://storage.azure.com'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const projectDir = path.join(moduleDir, '../../..')
const logDir = path.join(projectDir, '.logs')
fs.mkdirSync(logDir, { recursive: true })
const logFile = path.join(logDir, 'imds-router.log')
const logger = new Logger(logFile)

const configFile = process.env.IMDS_ROUTER_CONFIG ?? path.join(moduleDir, 'config', 'config.json')
const config = AppConfig.fromFile(configFile, logger)

const certCacheDir = path.join(projectDir, '.temp', 'sni')
const cache = new TokenCache(config.cacheExpirySkewSec)
const router = new Router(config.routing, logger)
const azProvider = new AzCliTokenProvider(logger)
const sniProvider = new SniTokenProvider(logger, { cacheDir: certCacheDir })
const tokens = new TokenService(cache, azProvider, sniProvider, logger)
const server = new ImdsRouterServer(config, logger, router, tokens)

/** Download each SNI cert and pre-mint a storage token so the first mount is a cache hit. */
async function warmSniProfiles(): Promise<void> {
    const sniProfiles = Object.values(config.routing.profiles).filter((p) => p.credType === 'SNI')
    for (const params of sniProfiles) {
        try {
            await sniProvider.ensureReady(params)
            await tokens.getToken(WARMUP_RESOURCE, params)
            logger.log(`Warmed SNI profile: certName=${params.certName} clientId=${params.clientId}`)
        } catch (e) {
            logger.log(`SNI warmup failed for certName=${params.certName}: ${e}`)
        }
    }
}

function start(): void {
    server.start()
    logger.log(`Config: ${configFile}`)
    logger.log(`Log file: ${logFile}`)
    // Warm SNI certs/tokens in the background so /healthz is available immediately;
    // on-demand minting covers any request that races the warmup.
    void warmSniProfiles()
    process.on('SIGTERM', () => {
        logger.log('Received SIGTERM, shutting down')
        process.exit(0)
    })
    process.on('SIGINT', () => {
        logger.log('Received SIGINT, shutting down')
        process.exit(0)
    })
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) start()
