import { execSync } from 'child_process'
import { AccessToken } from '../domain/token'
import { RouteParams } from '../domain/routing'
import { ILogger } from '../logging/logger'
import { TokenProvider } from './token-provider'

export type Exec = (command: string) => string

const defaultExec: Exec = (command) => execSync(command, { encoding: 'utf-8' }).trim()

/** Default credential: mints tokens via `az account get-access-token` using the
 * signed-in identity (used for OneLake). */
export class AzCliTokenProvider implements TokenProvider {
    constructor(private readonly logger: ILogger, private readonly exec: Exec = defaultExec) {}

    /** @inheritdoc */
    async getToken(resource: string, _params: RouteParams): Promise<AccessToken> {
        const json = this.exec(`az account get-access-token --resource '${resource}' -o json`)
        const result = JSON.parse(json) as { accessToken: string; expiresOn: string }
        return {
            access_token: result.accessToken,
            expires_on: Math.floor(new Date(result.expiresOn).getTime() / 1000),
        }
    }
}
