# ADLS OAuth Token Provider Plugin

Wires per-storage-account ABFS OAuth at driver startup so Spark talks to ADLS Gen2 / OneLake directly over `abfss://` — no mount required. For each configured account, the driver plugin stamps the Hadoop `Configuration` to use a `Custom` ABFS auth scheme backed by a `CustomTokenProviderAdaptee`; the token provider then mints cached Entra storage tokens at IO time.

Two auth types are supported:

| `authType`     | Target           | Credential                                                                                                          |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `sni`          | ADLS Gen2        | SNI Service Principal — cert resolved from Key Vault and converted to a password-protected PFX lazily at query time |
| `devcontainer` | OneLake / Fabric | Local `az login` identity (developer's Azure CLI credential)                                                        |

For `sni`, the certificate is resolved through `SparkPluginSecretManager`, which selects a runtime-appropriate `SecretHandler`:

| `spark.cluster.type` | Runtime      | Handler                 | Auth                                              |
| -------------------- | ------------ | ----------------------- | ------------------------------------------------- |
| absent / other       | Devcontainer | `KeyVaultSecretHandler` | `DevcontainerCredentialProvider` → `az` CLI login |
| `synapse`            | Synapse      | `SynapseSecretHandler`  | `mssparkutils` linked service                     |
| `trident`            | Fabric       | `FabricSecretHandler`   | `mssparkutils`                                    |

Locally, `az login` must have been run; the plugin reaches the real Key Vault using the developer's Azure CLI identity.

## Configuration

Each account is a self-contained, indexed block (`spark.plugin.adlsoauth.account.<N>.<suffix>`). With no accounts configured, the plugin is a no-op.

| Suffix     | Required   | Description                                                     |
| ---------- | ---------- | --------------------------------------------------------------- |
| `endpoint` | always     | Storage account DFS endpoint (e.g. `acct.dfs.core.windows.net`) |
| `authType` | always     | `sni` or `devcontainer`                                         |
| `tenantId` | always     | Entra tenant id                                                 |
| `clientId` | `sni` only | Service Principal client id                                     |
| `vaultUrl` | `sni` only | Fully qualified Key Vault url holding the SNI certificate       |
| `certName` | `sni` only | Key Vault certificate/secret name                               |

## Enabling

Add the plugin to `spark.plugins` and declare one indexed block per account, e.g. in `config/spark-defaults.conf.tmpl`:

```properties
spark.plugins=me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.AdlsOAuthTokenProviderPlugin

# Account 0: ADLS Gen2 via SNI Service Principal
spark.plugin.adlsoauth.account.0.endpoint=fabricdevmdrrahman.dfs.core.windows.net
spark.plugin.adlsoauth.account.0.authType=sni
spark.plugin.adlsoauth.account.0.tenantId=72f988bf-86f1-41af-91ab-2d7cd011db47
spark.plugin.adlsoauth.account.0.clientId=d1bae74d-c1c3-48cb-a38b-89633965bc2f
spark.plugin.adlsoauth.account.0.vaultUrl=https://sandboxmdrrahman.vault.azure.net
spark.plugin.adlsoauth.account.0.certName=sandboxmdrrahman-sni

# Account 1: OneLake via local Azure CLI (devcontainer) identity
spark.plugin.adlsoauth.account.1.endpoint=msit-onelake.dfs.fabric.microsoft.com
spark.plugin.adlsoauth.account.1.authType=devcontainer
spark.plugin.adlsoauth.account.1.tenantId=72f988bf-86f1-41af-91ab-2d7cd011db47
```

---

[All plugins](../README.md)
