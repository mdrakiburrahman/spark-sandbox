package me.rakirahman.secret.entra.credential.implementations

import java.time.{Instant, OffsetDateTime, ZoneOffset}
import java.util.concurrent.ConcurrentHashMap

import com.azure.core.credential.{AccessToken, TokenCredential, TokenRequestContext}
import reactor.core.publisher.Mono

import scala.collection.JavaConverters._
import scala.sys.process._
import scala.util.Try

/** A [[TokenCredential]] that shells out to `az account get-access-token`.
  *
  * Pre-requisite: `az login` must have been run before.
  */
class AzureCliLoggedInCredential(forceRefresh: Boolean = false) extends TokenCredential {

  private val EarlyRefreshSeconds = 180L
  private val cache = new ConcurrentHashMap[String, AccessToken]()

  override def getToken(request: TokenRequestContext): Mono[AccessToken] = {
    val scopes = Option(request.getScopes).map(_.asScala.toList).getOrElse(Nil)
    val resource = scopes match {
      case Nil         => ""
      case head :: Nil => head.stripSuffix("/.default")
      case _ =>
        return Mono.error(
          new IllegalArgumentException("Maximum of one scope is supported")
        )
    }

    Option(cache.get(resource))
      .filterNot { c =>
        forceRefresh || c.getExpiresAt.isBefore(
          OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(EarlyRefreshSeconds)
        )
      }
      .foreach(c => return Mono.just(c))

    Try {
      val token = Seq(
        "az",
        "account",
        "get-access-token",
        "--resource",
        resource,
        "--query",
        "accessToken",
        "-o",
        "tsv"
      ).!!.trim

      require(token.nonEmpty, "az CLI returned an empty access token")

      val expiresAt = """"exp"\s*:\s*(\d+)""".r
        .findFirstMatchIn(
          new String(java.util.Base64.getUrlDecoder.decode(token.split('.')(1)))
        )
        .map { m =>
          OffsetDateTime.ofInstant(
            Instant.ofEpochSecond(m.group(1).toLong),
            ZoneOffset.UTC
          )
        }
        .getOrElse(OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(3600))

      val result = new AccessToken(token, expiresAt)
      cache.put(resource, result)
      result
    }.fold(Mono.error[AccessToken], Mono.just[AccessToken])
  }
}
