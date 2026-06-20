import { TokenCache } from './token-cache'
import { AccessToken } from '../domain/token'

const tok = (expires_on: number): AccessToken => ({ access_token: 'x', expires_on })

describe('TokenCache', () => {
    it('returns a token that is fresh beyond the skew', () => {
        const now = 1000
        const cache = new TokenCache(300, () => now)
        cache.set('k', tok(now + 600))
        expect(cache.get('k')).toEqual(tok(1600))
    })

    it('evicts a token within the expiry skew', () => {
        const now = 1000
        const cache = new TokenCache(300, () => now)
        cache.set('k', tok(now + 240)) // 4 min remaining < 5 min skew
        expect(cache.get('k')).toBeUndefined()
        expect(cache.size).toBe(0)
    })

    it('treats exactly-skew as stale and skew+1 as fresh', () => {
        const now = 1000
        const cache = new TokenCache(300, () => now)
        cache.set('a', tok(now + 300))
        cache.set('b', tok(now + 301))
        expect(cache.get('a')).toBeUndefined()
        expect(cache.get('b')).toEqual(tok(1301))
    })

    it('returns undefined for a missing key', () => {
        const cache = new TokenCache(300, () => 0)
        expect(cache.get('missing')).toBeUndefined()
    })

    it('isolates entries by key (route-aware)', () => {
        const cache = new TokenCache(300, () => 0)
        cache.set('keyA', tok(10_000))
        cache.set('keyB', tok(20_000))
        expect(cache.get('keyA')?.expires_on).toBe(10_000)
        expect(cache.get('keyB')?.expires_on).toBe(20_000)
        expect(cache.size).toBe(2)
    })
})
