import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { ClientCertificateCredential } from '@azure/identity'
import { AccessToken } from '../domain/token'
import { RouteParams } from '../domain/routing'
import { ILogger } from '../logging/logger'
import { TokenProvider } from './token-provider'

/** Fetches a PEM (cert chain + unencrypted private key) for an SNI profile. */
export type CertFetcher = (params: RouteParams) => Promise<string>

/** Mints an AAD token from a PEM using subject-name/issuer (x5c) auth. */
export type TokenMinter = (pem: string, params: RouteParams, scope: string) => Promise<AccessToken>

export interface SniTokenProviderOptions {
    cacheDir: string
    certFetcher?: CertFetcher
    tokenMinter?: TokenMinter
}

function requireParam(params: RouteParams, key: string): string {
    const value = params[key]
    if (!value) throw new Error(`SNI profile missing required '${key}'`)
    return value
}

function vaultNameFromUrl(vaultUrl: string): string {
    return new URL(vaultUrl).hostname.split('.')[0]
}

/** Default fetcher: download the PFX from Key Vault via `az`, convert to PEM via `openssl`. */
function makeAzOpensslCertFetcher(cacheDir: string, logger: ILogger): CertFetcher {
    return async (params) => {
        const vaultUrl = requireParam(params, 'vaultUrl')
        const certName = requireParam(params, 'certName')
        const vault = vaultNameFromUrl(vaultUrl)
        fs.mkdirSync(cacheDir, { recursive: true })
        const pfxPath = path.join(cacheDir, `${certName}.pfx`)
        const leafPath = path.join(cacheDir, `${certName}.leaf.pem`)
        const chainPath = path.join(cacheDir, `${certName}.chain.pem`)
        const pemPath = path.join(cacheDir, `${certName}.pem`)
        logger.log(`Downloading SNI cert '${certName}' from vault '${vault}' via az`)
        execSync(`az keyvault secret download --vault-name '${vault}' --name '${certName}' --encoding base64 --file '${pfxPath}' --overwrite`, { stdio: 'pipe' })
        // Emit a leaf-first PEM: ClientCertificateCredential (sendCertificateChain/x5c) uses the
        // first certificate block as the signing cert, so the end-entity cert must precede the CA
        // chain — otherwise AAD rejects the intermediate's subject (AADSTS700030). PKCS#12 bags are
        // not guaranteed leaf-first, so split client (-clcerts, with key) from CA (-cacerts) and join.
        execSync(`openssl pkcs12 -in '${pfxPath}' -nodes -passin pass: -clcerts -out '${leafPath}'`, { stdio: 'pipe' })
        execSync(`openssl pkcs12 -in '${pfxPath}' -nodes -passin pass: -cacerts -nokeys -out '${chainPath}'`, { stdio: 'pipe' })
        fs.writeFileSync(pemPath, fs.readFileSync(leafPath, 'utf-8') + fs.readFileSync(chainPath, 'utf-8'))
        return fs.readFileSync(pemPath, 'utf-8')
    }
}

/** Default minter: TS equivalent of `ClientCertificateCredential` with `SendCertificateChain`. */
const defaultTokenMinter: TokenMinter = async (pem, params, scope) => {
    const tenantId = requireParam(params, 'tenantId')
    const clientId = requireParam(params, 'clientId')
    const credential = new ClientCertificateCredential(tenantId, clientId, { certificate: pem }, { sendCertificateChain: true })
    const token = await credential.getToken(scope)
    if (!token) throw new Error(`SNI credential returned no token for scope ${scope}`)
    return { access_token: token.token, expires_on: Math.floor(token.expiresOnTimestamp / 1000) }
}

/** SNI credential: authenticates an SPN with a Key Vault certificate (subject-name/issuer)
 * and mints storage tokens (used for ADLS Gen2). The cert is fetched once per `certName`
 * and cached in memory; tokens are minted per requested resource.
 */
export class SniTokenProvider implements TokenProvider {
    private readonly pemByCert = new Map<string, Promise<string>>()
    private readonly certFetcher: CertFetcher
    private readonly tokenMinter: TokenMinter

    constructor(private readonly logger: ILogger, opts: SniTokenProviderOptions) {
        this.certFetcher = opts.certFetcher ?? makeAzOpensslCertFetcher(opts.cacheDir, logger)
        this.tokenMinter = opts.tokenMinter ?? defaultTokenMinter
    }

    /** Idempotently fetch + cache the PEM for a profile's cert (called at boot and lazily).
     *
     * Concurrent calls share a single in-flight download; a failed download is evicted so
     * the next call retries.
     *
     * @param params The SNI profile parameters (`vaultUrl`, `certName`, …).
     */
    async ensureReady(params: RouteParams): Promise<string> {
        const certName = requireParam(params, 'certName')
        let pending = this.pemByCert.get(certName)
        if (!pending) {
            pending = this.certFetcher(params)
                .then((pem) => {
                    this.logger.log(`SNI cert ready: ${certName}`)
                    return pem
                })
                .catch((e) => {
                    this.pemByCert.delete(certName)
                    throw e
                })
            this.pemByCert.set(certName, pending)
        }
        return pending
    }

    /** @inheritdoc */
    async getToken(resource: string, params: RouteParams): Promise<AccessToken> {
        const pem = await this.ensureReady(params)
        const scope = `${resource.replace(/\/+$/, '')}/.default`
        return this.tokenMinter(pem, params, scope)
    }
}
