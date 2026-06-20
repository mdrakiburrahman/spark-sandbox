import { SniTokenProvider } from './sni-token-provider'
import { ILogger } from '../logging/logger'
import { RouteParams } from '../domain/routing'

const noopLogger: ILogger = { log: () => {} }

const sniParams: RouteParams = {
    credType: 'SNI',
    vaultUrl: 'https://sandboxmdrrahman.vault.azure.net/',
    certName: 'sandboxmdrrahman-sni',
    clientId: 'client-id',
    tenantId: 'tenant-id',
}

describe('SniTokenProvider', () => {
    it('fetches the cert once and reuses it across calls (ensureReady is idempotent)', async () => {
        const certFetcher = jest.fn(async () => 'PEM')
        const tokenMinter = jest.fn(async () => ({ access_token: 'sni-token', expires_on: 10_000 }))
        const provider = new SniTokenProvider(noopLogger, { cacheDir: '/tmp/unused', certFetcher, tokenMinter })

        await provider.getToken('https://storage.azure.com', sniParams)
        await provider.getToken('https://storage.azure.com', sniParams)

        expect(certFetcher).toHaveBeenCalledTimes(1)
        expect(tokenMinter).toHaveBeenCalledTimes(2)
    })

    it('mints with the .default scope derived from the resource (no double slash)', async () => {
        const certFetcher = jest.fn(async () => 'PEM')
        const scopes: string[] = []
        const tokenMinter = jest.fn(async (_pem: string, _params: RouteParams, scope: string) => {
            scopes.push(scope)
            return { access_token: 't', expires_on: 10_000 }
        })
        const provider = new SniTokenProvider(noopLogger, { cacheDir: '/tmp/unused', certFetcher, tokenMinter })

        await provider.getToken('https://storage.azure.com/', sniParams)

        expect(scopes[0]).toBe('https://storage.azure.com/.default')
    })

    it('passes the PEM and profile through to the minter', async () => {
        const certFetcher = jest.fn(async () => 'PEM-CONTENTS')
        const tokenMinter = jest.fn(async () => ({ access_token: 't', expires_on: 10_000 }))
        const provider = new SniTokenProvider(noopLogger, { cacheDir: '/tmp/unused', certFetcher, tokenMinter })

        await provider.getToken('https://storage.azure.com', sniParams)

        expect(tokenMinter).toHaveBeenCalledWith('PEM-CONTENTS', sniParams, 'https://storage.azure.com/.default')
    })

    it('throws when the profile is missing certName', async () => {
        const provider = new SniTokenProvider(noopLogger, { cacheDir: '/tmp/unused', certFetcher: async () => 'PEM', tokenMinter: async () => ({ access_token: 't', expires_on: 0 }) })
        await expect(provider.getToken('https://storage.azure.com', { credType: 'SNI' })).rejects.toThrow("missing required 'certName'")
    })
})
