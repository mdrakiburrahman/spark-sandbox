export type RouteParams = Record<string, string>

export interface Route {
    name: string
    match: Record<string, string>
    profile: string
}

export interface RoutingConfig {
    profiles: Record<string, RouteParams>
    routes: Route[]
    default: string
}

export interface RouteDecision {
    routeName: string
    profileName: string
    params: RouteParams
}
