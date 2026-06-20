import { AzCliTokenProvider } from './az-cli-token-provider'
import { ILogger } from '../logging/logger'

const noopLogger: ILogger = { log: () => {} }

describe('AzCliTokenProvider', () => {
    it('shells out to az with the requested resource and maps the result', async () => {
        const calls: string[] = []
        const exec = (cmd: string) => {
            calls.push(cmd)
            return JSON.stringify({ accessToken: 'az-token', expiresOn: '2030-01-01T00:00:00.000Z' })
        }
        const provider = new AzCliTokenProvider(noopLogger, exec)

        const token = await provider.getToken('https://storage.azure.com', {})

        expect(calls[0]).toContain("az account get-access-token --resource 'https://storage.azure.com'")
        expect(token.access_token).toBe('az-token')
        expect(token.expires_on).toBe(Math.floor(new Date('2030-01-01T00:00:00.000Z').getTime() / 1000))
    })

    it('ignores profile params (default credential)', async () => {
        const exec = () => JSON.stringify({ accessToken: 't', expiresOn: '2030-01-01T00:00:00.000Z' })
        const provider = new AzCliTokenProvider(noopLogger, exec)
        const token = await provider.getToken('https://management.azure.com', { credType: 'SNI' })
        expect(token.access_token).toBe('t')
    })
})
