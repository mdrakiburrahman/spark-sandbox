import { AccessToken } from '../domain/token'
import { RouteParams } from '../domain/routing'

/** A credential strategy that mints an {@link AccessToken} for a resource using a
 * matched route's profile parameters. */
export interface TokenProvider {
    /** Mint a token for `resource` using the supplied profile `params`.
     *
     * @param resource The AAD resource/audience the caller needs a token for.
     * @param params   The matched route's profile parameters (may be empty).
     */
    getToken(resource: string, params: RouteParams): Promise<AccessToken>
}
