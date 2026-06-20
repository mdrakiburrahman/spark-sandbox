package me.rakirahman.secret.entra.credential.implementations

import java.time.{Instant, OffsetDateTime, ZoneOffset}
import java.util.concurrent.ConcurrentHashMap

import com.azure.core.credential.{AccessToken, TokenCredential, TokenRequestContext}
import reactor.core.publisher.Mono

import scala.util.Try

import mssparkutils.credentials

/** A [[TokenCredential]] that resolves a Fabric workspace User-Assigned Managed Identity (UAMI) token via `mssparkutils.credentials.getToken`.
  *
  * Fabric-only: the underlying `mssparkutils` token library is present on the Synapse / Fabric runtime but not locally. The notebookutils token audience is a short name (e.g. `storage`), so the requested scope on the [[TokenRequestContext]] is ignored in favor of [[audience]].
  *
  * @param audience
  *   The notebookutils token audience (e.g. `storage`).
  * @param forceRefresh
  *   If true, bypass the in-memory access-token cache.
  */
class FabricUamiCredential(audience: String = "storage", forceRefresh: Boolean = false) extends TokenCredential {

  private val EarlyRefreshSeconds = 180L
  private val cache = new ConcurrentHashMap[String, AccessToken]()

  override def getToken(request: TokenRequestContext): Mono[AccessToken] = {
    Option(cache.get(audience))
      .filterNot { c =>
        forceRefresh || c.getExpiresAt.isBefore(
          OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(EarlyRefreshSeconds)
        )
      }
      .foreach(c => return Mono.just(c))

    Try {
      val token = credentials.getToken(audience)
      require(token != null && token.nonEmpty, "mssparkutils returned an empty access token")

      val expiresAt = """"exp"\s*:\s*(\d+)""".r
        .findFirstMatchIn(
          new String(java.util.Base64.getUrlDecoder.decode(token.split('.')(1)))
        )
        .map { m =>
          OffsetDateTime.ofInstant(Instant.ofEpochSecond(m.group(1).toLong), ZoneOffset.UTC)
        }
        .getOrElse(OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(3600))

      val result = new AccessToken(token, expiresAt)
      cache.put(audience, result)
      result
    }.fold(Mono.error[AccessToken], Mono.just[AccessToken])
  }
}
