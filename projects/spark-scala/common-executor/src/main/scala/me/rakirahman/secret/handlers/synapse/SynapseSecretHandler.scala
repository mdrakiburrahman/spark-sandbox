package me.rakirahman.secret.handlers.synapse

import me.rakirahman.secret.handlers.SecretHandler
import mssparkutils.credentials

/** A handler for retrieving secrets from a linked AKV in Synapse.
  *
  * @param keyVaultName
  *   The name of the Azure Key Vault.
  * @param linkedServiceName
  *   The name of the Synapse linked service.
  */
class SynapseSecretHandler(
    keyVaultName: String,
    linkedServiceName: String
) extends SecretHandler {

  /** @inheritdoc
    */
  override def getSecret(key: String): String = {
    credentials.getSecret(keyVaultName, key, linkedServiceName)
  }
}

/* Companion object for SynapseSecretHandler.
 */
object SynapseSecretHandler {

  /** Constructor.
    *
    * @param keyVaultName
    *   The name of the Azure Key Vault.
    * @param linkedServiceName
    *   The name of the Synapse linked service.
    * @return
    *   A new instance of SynapseSecretHandler.
    */
  def apply(
      keyVaultName: String,
      linkedServiceName: String
  ): SynapseSecretHandler =
    new SynapseSecretHandler(keyVaultName, linkedServiceName)
}
