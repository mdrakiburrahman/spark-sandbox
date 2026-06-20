package me.rakirahman.secret.entra.credential.providers.secure

import com.azure.core.credential.TokenCredential
import me.rakirahman.secret.entra.credential.implementations.FabricUamiCredential
import me.rakirahman.secret.entra.credential.providers.TokenCredentialProvider

/** Distributes credentials for the Fabric workspace User-Assigned Managed Identity (UAMI).
  */
class UamiCredentialProvider extends TokenCredentialProvider {

  /** @inheritdoc
    *
    * Neither tenantId nor clientId is relevant for the UAMI: the underlying [[FabricUamiCredential]] derives the identity from the Fabric runtime via `mssparkutils.credentials.getToken`.
    */
  override def getTokenCredential(
      tenantId: String = null,
      clientId: String = null
  ): TokenCredential = new FabricUamiCredential()
}

/* Companion object for UamiCredentialProvider.
 */
object UamiCredentialProvider {

  /** Constructor.
    *
    * @return
    *   A new instance of UamiCredentialProvider.
    */
  def apply(): UamiCredentialProvider =
    new UamiCredentialProvider()
}
