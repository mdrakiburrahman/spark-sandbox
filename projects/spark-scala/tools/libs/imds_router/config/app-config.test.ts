import { AppConfig } from './app-config'
import { ILogger } from '../logging/logger'

const noopLogger: ILogger = { log: () => {} }

describe('AppConfig.fromRaw', () => {
    it('reads server, cache and routing from the config object', () => {
        const c = AppConfig.fromRaw(
            {
                server: { port: 7000, expectedHeader: 'secret' },
                cache: { expirySkewSec: 60 },
                routing: { profiles: { default: {} }, routes: [], default: 'default' },
            },
            noopLogger
        )
        expect(c.port).toBe(7000)
        expect(c.expectedHeader).toBe('secret')
        expect(c.cacheExpirySkewSec).toBe(60)
        expect(c.routing.default).toBe('default')
    })

    it('applies defaults for omitted fields', () => {
        const c = AppConfig.fromRaw({}, noopLogger)
        expect(c.port).toBe(6020)
        expect(c.expectedHeader).toBe('local-dev-secret')
        expect(c.cacheExpirySkewSec).toBe(300)
        expect(c.routing.routes).toEqual([])
    })
})

describe('AppConfig.fromFile', () => {
    it('falls back to defaults when the file is missing', () => {
        const c = AppConfig.fromFile('/no/such/config.json', noopLogger)
        expect(c.port).toBe(6020)
        expect(c.cacheExpirySkewSec).toBe(300)
        expect(c.routing.routes).toEqual([])
    })
})
