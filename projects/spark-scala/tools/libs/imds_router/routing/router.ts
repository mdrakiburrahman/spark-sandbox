import type { IncomingHttpHeaders } from 'http'
import { ILogger } from '../logging/logger'
import { RouteDecision, RoutingConfig } from '../domain/routing'

/** Routing table mapping request attributes to a credential profile. */
export class Router {
    constructor(private readonly config: RoutingConfig, private readonly logger: ILogger) {}

    /** Choose the route (credential param set) for a request.
     *
     * Matches the request's attribute bag against each route's `match` entries
     * (exact equality; omitted keys are wildcards). First match wins; no match
     * falls back to the default profile.
     */
    chooseRoute(url: URL, headers: IncomingHttpHeaders): RouteDecision {
        const attributes = Router.attributesFrom(url, headers)
        let decision: RouteDecision = {
            routeName: '(default)',
            profileName: this.config.default,
            params: this.config.profiles[this.config.default] ?? {},
        }
        for (const route of this.config.routes) {
            const matched = Object.entries(route.match).every(([k, expected]) => attributes[k.toLowerCase()] === expected)
            if (matched) {
                decision = {
                    routeName: route.name,
                    profileName: route.profile,
                    params: this.config.profiles[route.profile] ?? {},
                }
                break
            }
        }
        const ctx = ['resource', 'endpoint', 'account', 'container']
            .filter((k) => attributes[k])
            .map((k) => `${k}=${attributes[k]}`)
            .join(' ')
        this.logger.log(`Route matched: route=${decision.routeName} profile=${decision.profileName}${ctx ? ` ${ctx}` : ''}`)
        return decision
    }

    /** Lowercased attribute bag: all HTTP headers plus curated query params. */
    static attributesFrom(url: URL, headers: IncomingHttpHeaders): Record<string, string> {
        const attributes: Record<string, string> = {}
        for (const [k, v] of Object.entries(headers)) {
            if (typeof v === 'string') attributes[k.toLowerCase()] = v
            else if (Array.isArray(v)) attributes[k.toLowerCase()] = v.join(',')
        }
        for (const key of ['resource', 'account', 'container', 'endpoint']) {
            const val = url.searchParams.get(key)
            if (val !== null) attributes[key] = val
        }
        return attributes
    }
}
