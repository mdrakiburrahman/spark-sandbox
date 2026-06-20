package me.rakirahman.secret.entra.credential.providers.secure

import com.azure.core.credential.TokenCredential
import me.rakirahman.secret.entra.credential.implementations.AzureCliLoggedInCredential
import me.rakirahman.secret.entra.credential.providers.TokenCredentialProvider

/** Distributes credentials for the devcontainer using the local Azure CLI login.
  */
class DevcontainerCredentialProvider extends TokenCredentialProvider {

  /** @inheritdoc
    *
    * Neither tenantId nor clientId is relevant for the devcontainer: the underlying [[AzureCliLoggedInCredential]] derives the identity from the active `az login` session.
    */
  override def getTokenCredential(
      tenantId: String = null,
      clientId: String = null
  ): TokenCredential = new AzureCliLoggedInCredential()
}

/* Companion object for DevcontainerCredentialProvider.
 */
object DevcontainerCredentialProvider {

  /** Constructor.
    *
    * @return
    *   A new instance of DevcontainerCredentialProvider.
    */
  def apply(): DevcontainerCredentialProvider =
    new DevcontainerCredentialProvider()
}
