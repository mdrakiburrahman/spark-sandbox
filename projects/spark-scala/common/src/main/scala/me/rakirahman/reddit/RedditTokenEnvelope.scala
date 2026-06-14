package me.rakirahman.reddit

import org.json4s.jackson.JsonMethods

import java.nio.charset.StandardCharsets
import java.util.Base64

import scala.util.{Failure, Success, Try}

/** Decoded Reddit cookie envelope, equivalent to the Python POC's `CookieEnvelope` dataclass.
  *
  * @param cookies
  *   The Reddit session cookies; rendered into the `Cookie:` header verbatim.
  * @param userAgent
  *   The User-Agent that minted these cookies; must be re-sent on every call to avoid Reddit's UA-mismatch lockout.
  * @param bearer
  *   The Reddit OAuth bearer token (currently unused by this client — the `www.reddit.com` host accepts cookie auth and ignores the bearer; kept so the same envelope can drive future oauth.reddit.com flows).
  * @param expiresAtEpochSeconds
  *   When the cookie set will be invalidated by Reddit (Unix epoch seconds). Zero ⇒ unknown lifetime.
  */
case class RedditTokenEnvelope(
    cookies: Map[String, String],
    userAgent: String,
    bearer: String,
    expiresAtEpochSeconds: Long
) {

  /** Build the `Cookie:` HTTP header value (`k1=v1; k2=v2; …`).
    */
  def cookieHeader: String =
    cookies.map { case (k, v) => s"$k=$v" }.mkString("; ")

  /** Seconds until [[expiresAtEpochSeconds]]. Negative when the envelope is already expired; zero when no expiry was supplied.
    *
    * @param nowEpochSeconds
    *   The reference time (injected for testability).
    */
  def secondsRemaining(nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): Long =
    if (expiresAtEpochSeconds <= 0L) 0L
    else expiresAtEpochSeconds - nowEpochSeconds

  /** Whether the envelope has already expired against the supplied clock.
    *
    * @param nowEpochSeconds
    *   The reference time (injected for testability).
    */
  def isExpired(nowEpochSeconds: Long = System.currentTimeMillis() / 1000L): Boolean =
    expiresAtEpochSeconds > 0L && secondsRemaining(nowEpochSeconds) <= 0L
}

/** Failure shapes surfaced by [[RedditTokenEnvelope.parse]] / [[RedditTokenLoader]].
  */
sealed trait RedditTokenLoadFailure { def message: String }
object RedditTokenLoadFailure {
  final case class MissingFile(message: String) extends RedditTokenLoadFailure
  final case class Malformed(message: String) extends RedditTokenLoadFailure
  final case class Expired(message: String, envelope: RedditTokenEnvelope) extends RedditTokenLoadFailure
}

/** Companion factory + JSON parser for [[RedditTokenEnvelope]].
  */
object RedditTokenEnvelope {

  /** Parse the same outer-JSON-wrapping-inner-base64-JSON envelope that CredentialBridge prints on stdout. Returns either a typed envelope or a typed [[RedditTokenLoadFailure]].
    *
    * @param rawJson
    *   The full JSON document, e.g. `{"access_token":"<base64>"}`.
    */
  def parse(rawJson: String): Either[RedditTokenLoadFailure, RedditTokenEnvelope] = {
    val outerResult = Try(JsonMethods.parse(rawJson).values.asInstanceOf[Map[String, Any]])
    outerResult match {
      case Failure(ex) =>
        Left(RedditTokenLoadFailure.Malformed(s"Token envelope is not valid JSON: ${ex.getMessage}"))
      case Success(outer) =>
        outer.get("access_token") match {
          case Some(token: String) if token.nonEmpty => decodeInner(token)
          case _ =>
            Left(RedditTokenLoadFailure.Malformed("Token envelope JSON has no `access_token` field"))
        }
    }
  }

  /** Decode the base64-wrapped inner payload and map it onto [[RedditTokenEnvelope]].
    */
  private def decodeInner(base64Token: String): Either[RedditTokenLoadFailure, RedditTokenEnvelope] = {
    val bytesResult = Try(Base64.getDecoder.decode(base64Token))
    bytesResult match {
      case Failure(ex) =>
        Left(RedditTokenLoadFailure.Malformed(s"`access_token` is not base64: ${ex.getMessage}"))
      case Success(bytes) =>
        val innerJson = new String(bytes, StandardCharsets.UTF_8)
        Try(JsonMethods.parse(innerJson).values.asInstanceOf[Map[String, Any]]) match {
          case Failure(ex) =>
            Left(RedditTokenLoadFailure.Malformed(s"Inner token payload is not JSON: ${ex.getMessage}"))
          case Success(inner) =>
            val cookies: Map[String, String] = inner.get("cookies") match {
              case Some(m: Map[_, _]) => m.asInstanceOf[Map[String, Any]].map { case (k, v) => k -> String.valueOf(v) }
              case _                  => Map.empty[String, String]
            }
            val userAgent = inner.get("user_agent").map(_.toString).getOrElse("")
            val bearer = inner.get("bearer").map(_.toString).getOrElse("")
            val expiresAt = inner.get("expires_at") match {
              case Some(n: Number) => n.longValue()
              case Some(s: String) => Try(s.toDouble.toLong).getOrElse(0L)
              case _               => 0L
            }
            if (cookies.isEmpty || userAgent.isEmpty)
              Left(RedditTokenLoadFailure.Malformed("Decoded token payload is missing `cookies` or `user_agent`"))
            else
              Right(RedditTokenEnvelope(cookies, userAgent, bearer, expiresAt))
        }
    }
  }
}
