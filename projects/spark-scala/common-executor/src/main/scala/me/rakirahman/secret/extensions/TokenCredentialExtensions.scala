package me.rakirahman.secret.extensions

import com.azure.core.credential.TokenCredential
import me.rakirahman.secret.entra.credential.implementations.RelayTokenCredential

object TokenCredentialExtensions {

  /** Provides extension methods for working with [[TokenCredential]].
    */
  implicit class TokenCredentialExtensions(some: TokenCredential) {

    /** Converts this [[TokenCredential]] to a [[RelayTokenCredential]].
      *
      * @param relayEndpoint
      *   the Azure Relay endpoint URL
      * @return
      *   a new [[RelayTokenCredential]]
      */
    def toRelayCredential(relayEndpoint: String): TokenCredential =
      new RelayTokenCredential(some, relayEndpoint)
  }
}
