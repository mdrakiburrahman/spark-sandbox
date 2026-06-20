package me.rakirahman.secret.entra.credential.providers

import com.azure.core.credential.{AccessToken, TokenCredential, TokenRequestContext}
import com.azure.core.implementation.AccessTokenCache
import reactor.core.publisher.Mono

/** CachedAccessTokenProvider holds the objects required to generate an Entra ID access token agnostic of authentication type.
  *
  * @param tokenCredential
  *   The TokenCredential instance holding the specific credential class object.
  * @param tokenRequestContext
  *   The TokenRequestContext instance holding the scopes for the authentication.
  */
case class CachedAccessTokenProvider(
    tokenCredential: TokenCredential,
    tokenRequestContext: TokenRequestContext
) extends AccessTokenProvider[Mono] {

  /** Custom Token Cache implementation.
    */
  private val tokenCache = new AccessTokenCache(tokenCredential)

  /** @inheritdoc
    */
  override def getAccessToken: AccessToken = getAccessTokenAsync.block()

  /** @inheritdoc
    */
  override def getAccessTokenAsync: Mono[AccessToken] =
    tokenCache.getToken(tokenRequestContext, false)
}
