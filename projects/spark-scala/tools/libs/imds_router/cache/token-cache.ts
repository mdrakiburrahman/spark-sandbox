import { AccessToken } from '../domain/token'

/** Route- and expiry-aware token cache.
 *
 * Keyed by the resolved request identity (route profile params + resource), so different
 * routes never share an entry. A token within `expirySkewSec` of expiry is treated
 * as stale so callers refetch ahead of expiry.
 */
export class TokenCache {
    private readonly entries = new Map<string, AccessToken>()

    constructor(private readonly expirySkewSec: number, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}

    isFresh(token: AccessToken): boolean {
        return token.expires_on - this.now() > this.expirySkewSec
    }

    get(key: string): AccessToken | undefined {
        const hit = this.entries.get(key)
        if (!hit) return undefined
        if (this.isFresh(hit)) return hit
        this.entries.delete(key)
        return undefined
    }

    set(key: string, token: AccessToken): void {
        this.entries.set(key, token)
    }

    get size(): number {
        return this.entries.size
    }
}
