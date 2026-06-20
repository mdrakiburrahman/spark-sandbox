import { ILogger } from '../logging/logger'
import { RoutingConfig } from '../domain/routing'

export const DEFAULT_ROUTING: RoutingConfig = { profiles: { default: {} }, routes: [], default: 'default' }

/** Validate a parsed routing section, falling back to default-only.
 *
 * Missing/invalid routing (no profiles, or a `default` that names no profile)
 * yields the default-only config so the router never crashes a dependent flow.
 */
export function validateRoutingConfig(raw: Partial<RoutingConfig> | undefined, logger: ILogger): RoutingConfig {
    if (!raw) {
        logger.log('No routing section in config; using default-only')
        return DEFAULT_ROUTING
    }
    const defaultProfile = raw.default ?? 'default'
    if (!raw.profiles || !raw.profiles[defaultProfile]) {
        logger.log(`Routing invalid (missing profiles or default profile '${defaultProfile}'); using default-only`)
        return DEFAULT_ROUTING
    }
    const routes = raw.routes ?? []
    for (const route of routes) {
        if (!raw.profiles[route.profile]) {
            logger.log(`Route '${route.name}' references unknown profile '${route.profile}'; it will yield empty params`)
        }
    }
    logger.log(`Loaded ${routes.length} route(s)`)
    return { profiles: raw.profiles, routes, default: defaultProfile }
}
