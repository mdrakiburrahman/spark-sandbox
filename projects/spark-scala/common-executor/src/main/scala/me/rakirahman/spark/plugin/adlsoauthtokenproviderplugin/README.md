# ADLS OAuth Token Provider Plugin

Wires per-storage-account ABFS OAuth at driver startup so Spark talks to ADLS Gen2 / OneLake directly over `abfss://` — no mount required. For each configured account, the driver plugin stamps the Hadoop `Configuration` to use a `Custom` ABFS auth scheme backed by a `CustomTokenProviderAdaptee`; the token provider then mints cached Entra storage tokens at IO time.

Four auth types are supported:

| `authType`     | Target           | Credential                                                                                                                |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `sni`          | ADLS Gen2        | SNI Service Principal — cert resolved from Key Vault and converted to a password-protected PFX lazily at query time       |
| `relay`        | ADLS Gen2        | SNI Service Principal brokered through an Azure Relay endpoint that mints the storage token (for an identity with access) |
| `devcontainer` | OneLake / Fabric | Local `az login` identity (developer's Azure CLI credential)                                                              |
| `uami`         | OneLake / Fabric | Fabric workspace User-Assigned Managed Identity via `mssparkutils.credentials.getToken("storage")` (Fabric runtime only)  |

The `sni` and `relay` credentials share one SNI Service Principal. Their creds (and, for `relay`, the relay endpoint) are declared **once** in a base64-encoded YAML Key Vault secret rather than repeated per account. For these two types the certificate is resolved through `SparkPluginSecretManager`, which selects a runtime-appropriate `SecretHandler`:

| `spark.cluster.type` | Runtime      | Handler                 | Auth                                              |
| -------------------- | ------------ | ----------------------- | ------------------------------------------------- |
| absent / other       | Devcontainer | `KeyVaultSecretHandler` | `DevcontainerCredentialProvider` → `az` CLI login |
| `synapse`            | Synapse      | `SynapseSecretHandler`  | `mssparkutils` linked service                     |
| `trident`            | Fabric       | `FabricSecretHandler`   | `mssparkutils`                                    |

Locally, `az login` must have been run; the plugin reaches the real Key Vault using the developer's Azure CLI identity. The `relay` flow additionally requires the SNI Service Principal to have access to the Azure Relay endpoint, and the relay's backing identity to have storage access (a token-broker pattern). `uami` is Fabric-only.

## Configuration

Two global keys plus a terse, self-contained, indexed block per account. The DFS endpoint is always a value, never part of a Spark conf key. With no accounts configured, the plugin is a no-op.

| Key                                             | Required                 | Description                                                        |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------ |
| `spark.plugin.adlsoauth.vaultUrl`               | when any `sni` / `relay` | Fully qualified Key Vault url holding the config secret + SNI cert |
| `spark.plugin.adlsoauth.configSecretBase64Name` | when any `sni` / `relay` | Key Vault secret name holding the base64-encoded YAML (see below)  |
| `spark.plugin.adlsoauth.account.<N>.endpoint`   | always                   | Storage account DFS endpoint (e.g. `acct.dfs.core.windows.net`)    |
| `spark.plugin.adlsoauth.account.<N>.authType`   | always                   | `sni`, `relay`, `devcontainer`, or `uami`                          |

### Key Vault config secret (`configSecretBase64Name`)

The secret value is the **base64 encoding** of this YAML. It carries the shared SNI creds and the relay endpoint, so neither is committed to source control:

```yaml
sni:
  tenantId: <entra-tenant-guid>
  clientId: <service-principal-client-guid>
  certName: <key-vault-cert-secret-name>
relay:
  endpoint: https://<relay-namespace>/<path>/token # only required when an account uses `relay`
```

- The `sni` block is required when any account uses `sni` or `relay`.
- The `relay` block is required when any account uses `relay`.
- The SNI certificate (`certName`) is resolved from the same `vaultUrl`.

## Enabling

Add the plugin to `spark.plugins`, set the two globals, and declare one indexed block per account, e.g. in `config/spark-defaults.conf.tmpl`:

```properties
spark.plugins=me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.AdlsOAuthTokenProviderPlugin

# Shared Key Vault coordinates (SNI creds + relay endpoint live in the base64 YAML secret)
spark.plugin.adlsoauth.vaultUrl=https://sandboxmdrrahman.vault.azure.net
spark.plugin.adlsoauth.configSecretBase64Name=adlsoauth-base64

# Account 0: ADLS Gen2 via SNI Service Principal brokered through an Azure Relay
spark.plugin.adlsoauth.account.0.endpoint=ivmbenchdbrx.dfs.core.windows.net
spark.plugin.adlsoauth.account.0.authType=relay

# Account 1: OneLake via local Azure CLI (devcontainer) identity
spark.plugin.adlsoauth.account.1.endpoint=msit-onelake.dfs.fabric.microsoft.com
spark.plugin.adlsoauth.account.1.authType=devcontainer
```

In Fabric (`Sparkcompute.yml`), the OneLake account typically switches to `uami` so the workspace identity is used instead of the local `az` login.

---

[All plugins](../README.md)
