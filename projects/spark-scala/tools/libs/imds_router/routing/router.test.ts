import { Router } from './router'
import { validateRoutingConfig, DEFAULT_ROUTING } from './routing-config'
import { ILogger } from '../logging/logger'
import { RoutingConfig } from '../domain/routing'

const noopLogger: ILogger = { log: () => {} }

const config: RoutingConfig = {
    profiles: {
        default: {},
        SNI: { credType: 'SNI', vaultUrl: 'https://v/', certName: 'c', clientId: 'id', tenantId: 't' },
    },
    routes: [
        { name: 'fabricdev-adls-sni', match: { resource: 'https://storage.azure.com', endpoint: 'fabricdevmdrrahman.dfs.core.windows.net' }, profile: 'SNI' },
        { name: 'onelake-default', match: { resource: 'https://storage.azure.com', endpoint: 'onelake.dfs.fabric.microsoft.com' }, profile: 'default' },
    ],
    default: 'default',
}

const url = (qs: string) => new URL(`http://localhost:6020/token?${qs}`)

describe('Router.chooseRoute', () => {
    const router = new Router(config, noopLogger)

    it('routes fabricdevmdrrahman to the SNI profile', () => {
        const d = router.chooseRoute(url('resource=https://storage.azure.com&endpoint=fabricdevmdrrahman.dfs.core.windows.net&container=onelake'), {})
        expect(d.routeName).toBe('fabricdev-adls-sni')
        expect(d.profileName).toBe('SNI')
        expect(d.params.credType).toBe('SNI')
    })

    it('routes any fabricdevmdrrahman container to SNI (omitted match key = wildcard)', () => {
        const d = router.chooseRoute(url('resource=https://storage.azure.com&endpoint=fabricdevmdrrahman.dfs.core.windows.net&container=somethingelse'), {})
        expect(d.routeName).toBe('fabricdev-adls-sni')
    })

    it('routes onelake to the default profile (empty params)', () => {
        const d = router.chooseRoute(url('resource=https://storage.azure.com&endpoint=onelake.dfs.fabric.microsoft.com'), {})
        expect(d.routeName).toBe('onelake-default')
        expect(d.params).toEqual({})
    })

    it('falls back to default for an unmatched resource', () => {
        const d = router.chooseRoute(url('resource=https://management.azure.com'), {})
        expect(d.routeName).toBe('(default)')
        expect(d.profileName).toBe('default')
    })

    it('matches on arbitrary headers', () => {
        const cfg: RoutingConfig = {
            profiles: { default: {}, hdr: { credType: 'X' } },
            routes: [{ name: 'by-header', match: { 'x-team': 'tina' }, profile: 'hdr' }],
            default: 'default',
        }
        const r = new Router(cfg, noopLogger)
        const d = r.chooseRoute(url('resource=foo'), { 'x-team': 'tina' })
        expect(d.routeName).toBe('by-header')
        expect(d.profileName).toBe('hdr')
    })
})

describe('Router.attributesFrom', () => {
    it('lowercases header names and merges curated query attrs', () => {
        const attrs = Router.attributesFrom(url('resource=R&endpoint=E&account=A&container=C'), { 'X-Foo': 'bar' })
        expect(attrs).toMatchObject({ resource: 'R', endpoint: 'E', account: 'A', container: 'C', 'x-foo': 'bar' })
    })
})

describe('validateRoutingConfig', () => {
    it('accepts a valid routing config', () => {
        const cfg = validateRoutingConfig(config, noopLogger)
        expect(cfg.routes).toHaveLength(2)
        expect(cfg.default).toBe('default')
    })

    it('falls back to default-only when routing is absent', () => {
        expect(validateRoutingConfig(undefined, noopLogger)).toEqual(DEFAULT_ROUTING)
    })

    it('falls back when the default profile is missing', () => {
        expect(validateRoutingConfig({ profiles: {}, routes: [], default: 'nope' }, noopLogger)).toEqual(DEFAULT_ROUTING)
    })

    it('warns when a route references an unknown profile', () => {
        const logger = { log: jest.fn() }
        validateRoutingConfig({ profiles: { default: {} }, routes: [{ name: 'r', match: {}, profile: 'ghost' }], default: 'default' }, logger)
        expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("unknown profile 'ghost'"))
    })
})
