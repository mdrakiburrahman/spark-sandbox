import http from 'http'
import { AppConfig } from '../config/app-config'
import { ILogger } from '../logging/logger'
import { TokenService } from '../credential/token-service'
import { Router } from '../routing/router'

/** HTTP server exposing the IMDS token endpoint backed by routing + credential providers. */
export class ImdsRouterServer {
    private readonly server: http.Server

    constructor(private readonly config: AppConfig, private readonly logger: ILogger, private readonly router: Router, private readonly tokens: TokenService) {
        this.server = http.createServer((req, res) => this.handle(req, res))
    }

    /** Structured dump logged for every incoming request. */
    static requestDump(req: http.IncomingMessage, url: URL) {
        return {
            method: req.method,
            url: req.url,
            pathname: url.pathname,
            query: Object.fromEntries(url.searchParams.entries()),
            headers: req.headers,
        }
    }

    private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        const url = new URL(req.url ?? '/', `http://localhost:${this.config.port}`)
        this.logger.log(`Incoming request:\n${JSON.stringify(ImdsRouterServer.requestDump(req, url), null, 2)}`)

        if (url.pathname === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ Healthy: true }))
            return
        }

        if (req.headers['x-identity-header'] !== this.config.expectedHeader) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid or missing X-IDENTITY-HEADER' }))
            return
        }

        const resource = url.searchParams.get('resource') ?? 'https://storage.azure.com/'
        const decision = this.router.chooseRoute(url, req.headers)

        try {
            const token = await this.tokens.getToken(resource, decision.params)
            this.logger.log(`Token acquired (expires: ${new Date(token.expires_on * 1000).toISOString()})`)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ access_token: token.access_token, expires_on: String(token.expires_on), resource, token_type: 'Bearer' }))
        } catch (e) {
            this.logger.log(`Error: ${e}`)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: String(e) }))
        }
    }

    start(): void {
        this.server.listen(this.config.port, 'localhost', () => {
            this.logger.log(`IMDS Router on http://localhost:${this.config.port}`)
            this.logger.log(`Routes: ${this.config.routing.routes.length}, default profile: ${this.config.routing.default}`)
        })
    }

    close(): void {
        this.server.close()
    }
}
