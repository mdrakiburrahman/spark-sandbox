# dbt-partners

A minimal dbt project that proves the **`AdlsOAuthTokenProviderPlugin`** lets Spark talk to
**ADLS Gen2 / OneLake directly over `abfss://`** — no `blobfuse` mount, no metastore
pre-registration — with **per-storage-account authentication** selected modularly through
`spark-defaults.conf`.

## What it proves

1. The plugin is configurable **per storage account** (DFS endpoint) to target different auth
   approaches, via modular `spark.plugin.adlsoauth.account.<N>.*` injection in
   `config/spark-defaults.conf`.
2. The same plugin serves **SNI** and **Azure CLI** (or anything else) at a per-target level.
3. A net-new dbt project, with the plugin initiated on its Spark session, reads Delta tables
   straight off `abfss://` and materializes them on disk.

## The two source tables

| Model           | ABFS path (aliased as a dbt var)                                                           | Account                                   | Auth                        |
| --------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------- |
| `date_dim`      | `abfss://onelake@fabricdevmdrrahman.dfs.core.windows.net/raw/demo/date_dim`                | `fabricdevmdrrahman.dfs.core.windows.net` | **SNI** Service Principal   |
| `raw_customers` | `abfss://3ea60ae5-…@msit-onelake.dfs.fabric.microsoft.com/1dcd407d-…/Tables/raw_customers` | `msit-onelake.dfs.fabric.microsoft.com`   | **Devcontainer** (`az` CLI) |

Both models are a plain `SELECT * FROM delta.\`<abfss-path>\``, materialized as managed Delta
tables in the `dbt_partners_dwh`schema. The paths are aliased in`dbt_project.yml`under`vars:` (`date_dim_delta_path`, `raw_customers_delta_path`).

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
