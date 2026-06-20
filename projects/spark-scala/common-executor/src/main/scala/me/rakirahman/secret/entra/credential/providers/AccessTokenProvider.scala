package me.rakirahman.secret.entra.credential.providers

import com.azure.core.credential.AccessToken

/** An access token provider.
  *
  * @tparam T
  *   The type of the asynchronous computation.
  */
trait AccessTokenProvider[T[_]] {

  /** Retrieves the access token synchronously.
    *
    * @return
    *   The access token.
    */
  def getAccessToken: AccessToken

  /** Retrieves the access token asynchronously.
    *
    * @return
    *   A computation that will eventually yield the access token.
    */
  def getAccessTokenAsync: T[AccessToken]
}
