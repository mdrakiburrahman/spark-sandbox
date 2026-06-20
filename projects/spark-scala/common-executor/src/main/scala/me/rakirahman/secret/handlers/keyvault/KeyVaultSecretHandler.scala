package me.rakirahman.secret.handlers.keyvault

import com.azure.core.credential.TokenCredential
import com.azure.core.http.HttpClient
import com.azure.security.keyvault.secrets.{SecretClient, SecretClientBuilder}
import me.rakirahman.secret.handlers.SecretHandler

/** A handler for retrieving secrets from an Azure Key Vault.
  *
  * @param secretClient
  *   The Key Vault Secret retrieval client.
  */
class KeyVaultSecretHandler(
    secretClient: SecretClient
) extends SecretHandler {

  /** @inheritdoc
    */
  override def getSecret(key: String): String = {
    secretClient
      .getSecret(key)
      .getValue
  }

}

/* Companion object for KeyVaultSecretHandler.
 */
object KeyVaultSecretHandler {

  /** Constructor.
    *
    * @param httpClient
    *   The HTTP client.
    * @param vaultUrl
    *   The fully qualified url of the Azure Key Vault.
    * @param credential
    *   The token credential.
    * @return
    *   A new instance of KeyVaultSecretHandler.
    */
  def apply(
      httpClient: HttpClient,
      vaultUrl: String,
      credential: TokenCredential
  ): KeyVaultSecretHandler =
    new KeyVaultSecretHandler(
      new SecretClientBuilder()
        .httpClient(httpClient)
        .vaultUrl(vaultUrl)
        .credential(credential)
        .buildClient()
    )
}
