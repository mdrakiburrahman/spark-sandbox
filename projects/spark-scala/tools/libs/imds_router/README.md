# IMDS Router

A tiny local-dev HTTP service that **emulates the Azure App Service Managed Identity
(IMDS) token endpoint** and serves token requests by selecting the right credential
**per request** via a routing table — **no relay required**.

It exists because tools like **blobfuse2** (and the Azure SDKs) only know how to ask a
local MSI endpoint for tokens (`GET /token?api-version=2019-08-01&resource=…` with an
`X-IDENTITY-HEADER`). In a Codespace/dev box there is no real MSI, so this router answers
that contract and mints the actual token locally — either with the signed-in `az`
identity (OneLake) or with an SNI certificate for a service principal (ADLS Gen2).

## How it works

```
blobfuse2 / azidentity ── GET /token?resource=…&endpoint=…──▶ imds-router ──┬─ default ─▶ az account get-access-token
        (IDENTITY_ENDPOINT)                                  route + cache  └─ SNI ─────▶ ClientCertificateCredential (x5c)
                                                                            returns {access_token, expires_on}
```

1. **Route** — each request's attributes (`resource`, `endpoint`, `account`, `container`,
   plus any HTTP header) are matched against `config/config.json` `routing.routes`
   (first match wins; omitted match keys are wildcards). The matched **profile** decides
   which credential mints the token (e.g. `default` vs an `SNI` cert identity).
2. **Cache** — successful tokens are cached, keyed route-aware (resource + profile
   params), and reused until `cacheExpirySkewSec` before expiry.
3. **Mint** — on a cache miss the dispatched credential provider mints a token with
   bounded retry/backoff:
   - **default** → `az account get-access-token --resource <resource>` (the signed-in
     identity; used for OneLake).
   - **SNI** → a Key Vault certificate is used with `ClientCertificateCredential` +
     `sendCertificateChain: true` (subject-name/issuer auth) to mint a token for
     `<resource>/.default` on behalf of a service principal (used for ADLS Gen2). This is
     the TypeScript equivalent of the C# `ClientCertificateCredential { SendCertificateChain = true }`.

On **boot**, every `SNI` profile's certificate is downloaded from Key Vault (via `az`,
converted to PEM with `openssl`) and a storage token is pre-minted so the first mount is a
cache hit.

> The `endpoint`/`account`/`container` hints are smuggled in by the mount script via
> `IDENTITY_ENDPOINT` query params (see `.scripts/mount-onelake.sh`).

## Layout (one domain per folder)

| Path          | Responsibility                                                           |
| ------------- | ------------------------------------------------------------------------ |
| `index.ts`    | composition root — wires everything, downloads + warms SNI certs, starts |
| `config/`     | `AppConfig` + `config/config.json` (server, cache, routing)              |
| `domain/`     | pure models (`AccessToken`, routing types)                               |
| `logging/`    | `Logger` / `ILogger`                                                     |
| `routing/`    | `Router` (match) + `routing-config` (validate)                           |
| `cache/`      | `TokenCache` (route- & expiry-aware)                                     |
| `credential/` | `TokenService` (cache + dispatch) + `AzCli`/`Sni` token providers        |
| `server/`     | `ImdsRouterServer` (HTTP layer)                                          |

## Configuration — `config/config.json`

```jsonc
{
  "server": { "port": 6020, "expectedHeader": "local-dev-secret" },
  "cache": { "expirySkewSec": 300 },
  "routing": {
    "profiles": {
      "default": {},
      "<name>": {
        "credType": "SNI",
        "vaultUrl": "https://<vault>.vault.azure.net/",
        "certName": "<cert>",
        "clientId": "<spn-app-id>",
        "tenantId": "<tenant>",
      },
    },
    "routes": [
      { "name": "…", "match": { "endpoint": "…" }, "profile": "<name>" },
    ],
    "default": "default",
  },
}
```

Override the config path with `IMDS_ROUTER_CONFIG`. A missing/invalid file falls back to
safe defaults (default-only routing).

## Run

```bash
bash .scripts/imds-router.sh                 # start + health-check on :6020
curl -sf http://localhost:6020/healthz | jq  # {"Healthy":true}
```

Or via Nx:

```bash
npx nx run spark-scala:imds-router-up        # start the router
npx nx run spark-scala:test-jest             # unit tests (run with the rest of the Jest suite)
```

## Reference

- Azure Instance Metadata Service: https://learn.microsoft.com/azure/virtual-machines/instance-metadata-service
- Managed identity over HTTP (the App Service contract this emulates): https://learn.microsoft.com/azure/app-service/overview-managed-identity?tabs=portal%2Chttp
- Subject Name and Issuer (SNI) authentication: https://learn.microsoft.com/entra/identity-platform/certificate-credentials
