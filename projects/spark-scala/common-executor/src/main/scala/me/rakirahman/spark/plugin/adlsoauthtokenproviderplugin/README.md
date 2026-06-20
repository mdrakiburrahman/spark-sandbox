# ADLS OAuth Token Provider Plugin

Fetches a secret from Azure Key Vault on the driver at startup and writes its value to a local file. The secret is resolved through `SparkPluginSecretManager`, which selects a runtime-appropriate `SecretHandler`:

| `spark.cluster.type` | Runtime      | Handler                 | Auth                                                  |
| -------------------- | ------------ | ----------------------- | ----------------------------------------------------- |
| absent / other       | Devcontainer | `KeyVaultSecretHandler` | `DevcontainerCredentialProvider` → `az` CLI login     |
| `synapse`            | Synapse      | `SynapseSecretHandler`  | `mssparkutils` linked service                         |
| `trident`            | Fabric       | `FabricSecretHandler`   | `mssparkutils`                                        |

Locally, `az login` must have been run; the plugin reaches the real Key Vault using the developer's Azure CLI identity.

## Configuration

| Key                                              | Default           | Description                                                     |
| ------------------------------------------------ | ----------------- | -------------------------------------------------------------- |
| `spark.plugin.adlsoauth.vault.url`               | `""`              | Fully qualified Key Vault url (e.g. `https://v.vault.azure.net`)|
| `spark.plugin.adlsoauth.secret.name`             | `""`              | Name of the secret to fetch                                    |
| `spark.plugin.adlsoauth.output.path`             | `/tmp/secret.txt` | Local path the secret value is written to                      |
| `spark.plugin.adlsoauth.synapse.linkedServiceName` | `""`            | Synapse linked service name (Synapse runtime only)             |

## Output

A single file at `output.path` containing the raw secret value (no trailing newline).

## Enabling

Add the plugin to `spark.plugins` (comma-separated) and set the keys above, e.g. in `config/spark-defaults.conf.tmpl`:

```properties
spark.plugins=me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.AdlsOAuthTokenProviderPlugin
spark.plugin.adlsoauth.vault.url=https://sandboxmdrrahman.vault.azure.net
spark.plugin.adlsoauth.secret.name=foo
```

---

[All plugins](../README.md)
