package me.rakirahman.secret.entra.credential.providers

import com.azure.core.credential.TokenCredential

/** Provides access to [[TokenCredential]] objects.
  */
trait TokenCredentialProvider {

  /** Retrieves a token credential.
    *
    * @param tenantId
    *   The ID of the tenant.
    * @param clientId
    *   The ID of the client.
    * @return
    *   The token credential.
    */
  def getTokenCredential(
      tenantId: String,
      clientId: String
  ): TokenCredential
}
