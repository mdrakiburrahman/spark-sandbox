import { TokenService } from './token-service'
import { TokenCache } from '../cache/token-cache'
import { ILogger } from '../logging/logger'
import { TokenProvider } from './token-provider'
import { AccessToken } from '../domain/token'
import { RouteParams } from '../domain/routing'

const noopLogger: ILogger = { log: () => {} }
const noSleep = async () => {}

const provider = (fn: (resource: string, params: RouteParams) => Promise<AccessToken>): TokenProvider => ({ getToken: fn })

describe('TokenService.cacheKey', () => {
    const svc = new TokenService(new TokenCache(300, () => 0), provider(async () => ({ access_token: '', expires_on: 0 })), provider(async () => ({ access_token: '', expires_on: 0 })), noopLogger)

    it('uses the bare resource for the default profile (no params)', () => {
        expect(svc.cacheKey('https://storage.azure.com', {})).toBe('https://storage.azure.com')
    })

    it('produces distinct, stable keys for different profiles', () => {
        const def = svc.cacheKey('https://storage.azure.com', {})
        const sni = svc.cacheKey('https://storage.azure.com', { credType: 'SNI', certName: 'c' })
        expect(sni).toContain('credType=SNI')
        expect(def).not.toBe(sni)
        expect(svc.cacheKey('https://storage.azure.com', { certName: 'c', credType: 'SNI' })).toBe(sni)
    })
})

describe('TokenService.getToken', () => {
    it('dispatches SNI params to the SNI provider, default otherwise', async () => {
        const def = jest.fn(async () => ({ access_token: 'default', expires_on: 10_000 }))
        const sni = jest.fn(async () => ({ access_token: 'sni', expires_on: 10_000 }))
        const svc = new TokenService(new TokenCache(300, () => 0), provider(def), provider(sni), noopLogger)

        const a = await svc.getToken('https://storage.azure.com', {})
        const b = await svc.getToken('https://storage.azure.com', { credType: 'SNI', certName: 'c' })

        expect(a.access_token).toBe('default')
        expect(b.access_token).toBe('sni')
        expect(def).toHaveBeenCalledTimes(1)
        expect(sni).toHaveBeenCalledTimes(1)
    })

    it('mints once then serves from cache on the second call', async () => {
        const now = 1000
        const cache = new TokenCache(300, () => now)
        const def = jest.fn(async () => ({ access_token: 'a', expires_on: now + 3600 }))
        const svc = new TokenService(cache, provider(def), provider(async () => ({ access_token: 'x', expires_on: 0 })), noopLogger)

        const t1 = await svc.getToken('https://storage.azure.com', {})
        const t2 = await svc.getToken('https://storage.azure.com', {})

        expect(t1.access_token).toBe('a')
        expect(t2.access_token).toBe('a')
        expect(def).toHaveBeenCalledTimes(1)
    })

    it('uses separate cache entries for different resources', async () => {
        const cache = new TokenCache(300, () => 0)
        const def = jest.fn(async (resource: string) => ({ access_token: resource, expires_on: 10_000 }))
        const svc = new TokenService(cache, provider(def), provider(async () => ({ access_token: 'x', expires_on: 0 })), noopLogger)

        await svc.getToken('https://storage.azure.com', {})
        await svc.getToken('https://management.azure.com', {})

        expect(def).toHaveBeenCalledTimes(2)
        expect(cache.size).toBe(2)
    })

    it('retries on a thrown error then succeeds', async () => {
        const def = jest
            .fn<Promise<AccessToken>, [string, RouteParams]>()
            .mockRejectedValueOnce(new Error('transient'))
            .mockResolvedValueOnce({ access_token: 'a', expires_on: 10_000 })
        const svc = new TokenService(new TokenCache(300, () => 0), provider(def), provider(async () => ({ access_token: 'x', expires_on: 0 })), noopLogger, 25, 1000, noSleep)

        const t = await svc.getToken('r', {})
        expect(t.access_token).toBe('a')
        expect(def).toHaveBeenCalledTimes(2)
    })

    it('throws after exhausting retries', async () => {
        const def = jest.fn(async () => {
            throw new Error('always-fails')
        })
        const svc = new TokenService(new TokenCache(300, () => 0), provider(def), provider(async () => ({ access_token: 'x', expires_on: 0 })), noopLogger, 2, 10, noSleep)

        await expect(svc.getToken('r', {})).rejects.toThrow('always-fails')
        expect(def).toHaveBeenCalledTimes(3) // attempts 0, 1, 2
    })
})
