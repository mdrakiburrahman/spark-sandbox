package me.rakirahman.secret.handlers.fabric

import me.rakirahman.secret.handlers.SecretHandler
import mssparkutils.credentials

/** A handler for retrieving secrets from an AKV in Fabric.
  *
  * @param keyVaultName
  *   The name of the Azure Key Vault.
  */
class FabricSecretHandler(
    keyVaultName: String
) extends SecretHandler {

  /** @inheritdoc
    */
  override def getSecret(key: String): String = {
    credentials.getSecret(s"https://${keyVaultName}.vault.azure.net/", key)
  }
}

/** Companion object for [[FabricSecretHandler]].
  */
object FabricSecretHandler {

  /** Constructor.
    *
    * @param keyVaultName
    *   The name of the Azure Key Vault.
    * @return
    *   A new instance of FabricSecretHandler.
    */
  def apply(
      keyVaultName: String
  ): FabricSecretHandler =
    new FabricSecretHandler(keyVaultName)
}
