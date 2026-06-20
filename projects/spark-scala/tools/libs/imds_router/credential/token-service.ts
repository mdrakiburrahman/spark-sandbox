import { AccessToken } from '../domain/token'
import { RouteParams } from '../domain/routing'
import { ILogger } from '../logging/logger'
import { TokenCache } from '../cache/token-cache'
import { TokenProvider } from './token-provider'

export type Sleep = (ms: number) => Promise<void>

const defaultSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Mints and serves resource tokens, dispatching to a credential provider by the matched
 * profile (`credType`) and caching results route-aware with bounded retry/backoff. */
export class TokenService {
    constructor(
        private readonly cache: TokenCache,
        private readonly defaultProvider: TokenProvider,
        private readonly sniProvider: TokenProvider,
        private readonly logger: ILogger,
        private readonly maxRetries: number = 25,
        private readonly backoffCapMs: number = 1000,
        private readonly sleep: Sleep = defaultSleep
    ) {}

    /** Stable, route-aware cache key: resource + sorted profile params. */
    cacheKey(resource: string, params: RouteParams): string {
        const sorted = Object.keys(params)
            .sort()
            .map((k) => `${k}=${params[k]}`)
            .join('&')
        return sorted ? `${resource}|${sorted}` : resource
    }

    private providerFor(params: RouteParams): TokenProvider {
        return params.credType === 'SNI' ? this.sniProvider : this.defaultProvider
    }

    /** Get an access token for a resource via the matched route's profile.
     *
     * Serves a cached token when fresh; otherwise mints via the dispatched provider
     * with bounded retry/backoff, caching the result.
     *
     * @param resource The AAD resource/audience to mint a token for.
     * @param params   The matched route's profile parameters (selects the provider).
     */
    async getToken(resource: string, params: RouteParams): Promise<AccessToken> {
        const key = this.cacheKey(resource, params)

        const cached = this.cache.get(key)
        if (cached) {
            this.logger.log(`Cache hit: ${key} (expires: ${new Date(cached.expires_on * 1000).toISOString()})`)
            return cached
        }

        const provider = this.providerFor(params)
        this.logger.log(`Minting token: key=${key} credType=${params.credType ?? 'default'}`)

        let lastErr: Error = new Error('Token error: no attempts made')
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const token = await provider.getToken(resource, params)
                this.cache.set(key, token)
                return token
            } catch (err) {
                lastErr = err instanceof Error ? err : new Error(String(err))
            }
            if (attempt === this.maxRetries) break
            const delayMs = Math.min(this.backoffCapMs, 100 * 2 ** attempt)
            this.logger.log(`getToken attempt ${attempt + 1}/${this.maxRetries + 1} failed: ${lastErr.message}; retrying in ${delayMs}ms`)
            await this.sleep(delayMs)
        }
        throw lastErr
    }
}
