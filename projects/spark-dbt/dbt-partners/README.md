# dbt-partners

A minimal dbt project that proves the **`AdlsOAuthTokenProviderPlugin`** lets Spark talk to
**ADLS Gen2 / OneLake directly over `abfss://`** — no `blobfuse` mount, no metastore
pre-registration — with **per-storage-account authentication** selected modularly through
`spark-defaults.conf`.

## How the auth is wired

The local Livy Spark session inherits `/opt/spark/conf/spark-defaults.conf`, which enables the
plugin and declares the two accounts. At session startup the plugin stamps, per account:

```
fs.azure.account.auth.type.<account>          = Custom
fs.azure.account.oauth.provider.type.<account> = me.rakirahman.feeds.authentication.callback.storage.{sni|devcontainer}.OAuthTokenProvider
```

…plus the per-account params the provider needs (SNI: client id + a Key-Vault-sourced PFX +
runtime password; Devcontainer: tenant id). The `CustomTokenProviderAdaptee` then mints cached
Entra **storage** tokens at IO time. See the
[plugin README](../../spark-scala/common-executor/src/main/scala/me/rakirahman/spark/plugin/adlsoauthtokenproviderplugin/README.md).

## Run it

```bash
# Local dbt client + local Livy Spark (default TARGET=local-local)
npx nx run dbt-partners:test

# Lint (black + sqlfluff)
npx nx run dbt-partners:lint
```

Prerequisites (already provided by the devcontainer): a running metastore + local Livy, an
active `az login`, the assembled `commonExecutor.jar`, and the rendered
`/opt/spark/conf/spark-defaults.conf`. After changing the plugin/jar/conf, delete
`projects/spark-dbt/livy-session-id.txt` to force a fresh Livy session that re-initializes the
plugin.
