import fs from 'fs'
import { ILogger } from '../logging/logger'
import { RoutingConfig } from '../domain/routing'
import { DEFAULT_ROUTING, validateRoutingConfig } from '../routing/routing-config'

const DEFAULT_PORT = 6020
const DEFAULT_HEADER = 'local-dev-secret'
const DEFAULT_CACHE_SKEW_SEC = 300

interface RawConfig {
    server?: { port?: number; expectedHeader?: string }
    cache?: { expirySkewSec?: number }
    routing?: RoutingConfig
}

/** Aggregate application configuration, loaded from a single JSON config file. */
export class AppConfig {
    readonly port: number
    readonly expectedHeader: string
    readonly cacheExpirySkewSec: number
    readonly routing: RoutingConfig

    constructor(init: { port: number; expectedHeader: string; cacheExpirySkewSec: number; routing: RoutingConfig }) {
        this.port = init.port
        this.expectedHeader = init.expectedHeader
        this.cacheExpirySkewSec = init.cacheExpirySkewSec
        this.routing = init.routing
    }

    /** Built-in fallback used when the config file is missing or unreadable. */
    static defaults(): AppConfig {
        return new AppConfig({
            port: DEFAULT_PORT,
            expectedHeader: DEFAULT_HEADER,
            cacheExpirySkewSec: DEFAULT_CACHE_SKEW_SEC,
            routing: DEFAULT_ROUTING,
        })
    }

    /** Build config from a parsed JSON object, applying defaults per field. */
    static fromRaw(raw: RawConfig, logger: ILogger): AppConfig {
        return new AppConfig({
            port: raw.server?.port ?? DEFAULT_PORT,
            expectedHeader: raw.server?.expectedHeader ?? DEFAULT_HEADER,
            cacheExpirySkewSec: raw.cache?.expirySkewSec ?? DEFAULT_CACHE_SKEW_SEC,
            routing: validateRoutingConfig(raw.routing, logger),
        })
    }

    /** Load + validate config from a JSON file, falling back to safe defaults. */
    static fromFile(configFile: string, logger: ILogger): AppConfig {
        let raw: RawConfig
        try {
            raw = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as RawConfig
        } catch (e) {
            const code = (e as NodeJS.ErrnoException).code
            logger.log(code === 'ENOENT' ? `Config file not found at ${configFile}; using defaults` : `Config load error at ${configFile}: ${e}; using defaults`)
            return AppConfig.defaults()
        }
        return AppConfig.fromRaw(raw, logger)
    }
}
