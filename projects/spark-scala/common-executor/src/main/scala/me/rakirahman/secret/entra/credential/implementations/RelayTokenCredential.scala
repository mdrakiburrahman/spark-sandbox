package me.rakirahman.secret.entra.credential.implementations

// @formatter:off
import java.io.IOException
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI
import java.net.URLEncoder
import java.time.{Duration => JDuration, Instant, OffsetDateTime, ZoneOffset}
import java.util.concurrent.{CompletionException, ConcurrentHashMap, ExecutionException, TimeoutException}

import com.azure.core.credential.{AccessToken, TokenCredential, TokenRequestContext}
import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.spark.internal.Logging
import reactor.core.publisher.Mono
import reactor.util.retry.Retry

import scala.annotation.tailrec
import scala.collection.JavaConverters._

object RelayTokenCredential {

  /** Entra scope the inner credential authenticates against to call the relay itself. */
  val RelayResourceScope: String = "https://relay.azure.net/.default"

  /** Default maximum number of retries (in addition to the initial attempt) for transient relay failures. */
  val DefaultMaxRetries: Long = 4

  /** Default initial backoff before the first retry. */
  val DefaultMinBackoff: JDuration = JDuration.ofMillis(500)

  /** Default maximum backoff between retries. */
  val DefaultMaxBackoff: JDuration = JDuration.ofSeconds(3)

  /** Default per-attempt HTTP request timeout. Ensures hung connections fail and trigger a retry. */
  val DefaultRequestTimeout: JDuration = JDuration.ofSeconds(30)

  /** HTTP status codes that indicate transient failures and should be retried. */
  val RetryableStatusCodes: Set[Int] = Set(408, 429, 500, 502, 503, 504)

  /** Exception thrown when the relay service responds with a non-success status code.
    *
    * The message format is preserved for backward compatibility with existing log scrapers / catchers
    * (`"Relay responded with ${statusCode}: ${body}"`).
    */
  final class RelayHttpException(val statusCode: Int, val body: String)
      extends RuntimeException(s"Relay responded with ${statusCode}: ${body}")

  /** Returns true if the given throwable represents a transient failure that should be retried. */
  def isRetryable(throwable: Throwable): Boolean = rootCause(throwable) match {
    case e: RelayHttpException => RetryableStatusCodes.contains(e.statusCode)
    case _: IOException        => true
    case _: TimeoutException   => true
    case _                     => false
  }

  // CompletableFuture surfaces failures wrapped in CompletionException / ExecutionException; unwrap so
  // the retry filter can inspect the real cause.
  @tailrec
  private def rootCause(throwable: Throwable): Throwable = throwable match {
    case e: CompletionException if e.getCause != null && (e.getCause ne e) => rootCause(e.getCause)
    case e: ExecutionException if e.getCause != null && (e.getCause ne e)  => rootCause(e.getCause)
    case other                                                             => other
  }
}

/** A [[TokenCredential]] implementation that asks a relay service for an access token.
  *
  * Transient failures from the relay (HTTP 408/429/5xx, network errors, timeouts) are retried with
  * exponential backoff and jitter. Non-transient failures (e.g. 401, 403, 404, malformed responses)
  * surface immediately.
  *
  * @param inner
  *   the underlying credential used to authenticate to the relay itself
  * @param relayEndpoint
  *   the relay service URL
  * @param forceRefresh
  *   if true, bypass the in-memory access-token cache
  * @param maxRetries
  *   maximum number of retry attempts on transient failures (initial attempt not counted)
  * @param minBackoff
  *   initial backoff before the first retry
  * @param maxBackoff
  *   maximum backoff between retries (caps the exponential growth)
  * @param requestTimeout
  *   per-attempt HTTP request timeout
  * @param httpClient
  *   the HTTP client used for relay requests; exposed for testability
  */
class RelayTokenCredential(
    private val inner: TokenCredential,
    relayEndpoint: String,
    forceRefresh: Boolean = false,
    maxRetries: Long = RelayTokenCredential.DefaultMaxRetries,
    minBackoff: JDuration = RelayTokenCredential.DefaultMinBackoff,
    maxBackoff: JDuration = RelayTokenCredential.DefaultMaxBackoff,
    requestTimeout: JDuration = RelayTokenCredential.DefaultRequestTimeout,
    httpClient: HttpClient = HttpClient.newHttpClient()
) extends TokenCredential with Logging {

  import RelayTokenCredential._

  require(relayEndpoint != null && relayEndpoint.nonEmpty, "Relay endpoint cannot be null or empty.")
  require(maxRetries >= 0, "maxRetries cannot be negative.")

  private val EARLY_REFRESH_SECONDS: Long = 180
  private val mapper = new ObjectMapper()
  private val cache = new ConcurrentHashMap[String, AccessToken]()

  override def getToken(request: TokenRequestContext): Mono[AccessToken] = {
    val scopes = Option(request.getScopes).map(_.asScala.toList).getOrElse(Nil)

    val resource = scopes match {
      case Nil         => ""
      case head :: Nil =>
        if (head.endsWith("/.default")) head.substring(0, head.length - "/.default".length)
        else head
      case _ => return Mono.error(new IllegalArgumentException("Maximum of one scope is supported for RelayTokenCredential"))
    }

    val cached = cache.get(resource)
    if (cached != null) {
      val now = OffsetDateTime.now(ZoneOffset.UTC)
      val shouldRefresh = forceRefresh || cached.getExpiresAt.isBefore(now.plusSeconds(EARLY_REFRESH_SECONDS))
      if (!shouldRefresh) return Mono.just(cached)
    }

    val relayRequestContext = new TokenRequestContext().addScopes(RelayResourceScope)

    inner.getToken(relayRequestContext).flatMap { relayAccessToken =>
      val relayToken = relayAccessToken.getToken
      val encodedResource = URLEncoder.encode(resource, "UTF-8")
      val uri = URI.create(s"${relayEndpoint}?resource=${encodedResource}")

      val httpReq = HttpRequest
        .newBuilder()
        .uri(uri)
        .timeout(requestTimeout)
        .GET()
        .header("Authorization", s"Bearer ${relayToken}")
        .build()

      val retrySpec = Retry
        .backoff(maxRetries, minBackoff)
        .maxBackoff(maxBackoff)
        .filter(t => isRetryable(t))
        .doBeforeRetry { sig =>
          val attempt = sig.totalRetries() + 1
          logWarning(
            s"Retrying relay token request (attempt ${attempt} of ${maxRetries}) for resource '${resource}' " +
              s"after transient failure: ${sig.failure().getMessage}"
          )
        }
        // Surface the original failure (e.g. RelayHttpException) rather than Reactor's RetryExhaustedException.
        .onRetryExhaustedThrow((_, sig) => sig.failure())

      Mono
        .defer { () =>
          val cf = httpClient
            .sendAsync(httpReq, HttpResponse.BodyHandlers.ofString())
            .thenApply[String] { response =>
              if (response.statusCode() >= 400) {
                throw new RelayHttpException(response.statusCode(), response.body())
              }
              response.body()
            }
          Mono.fromFuture(cf)
        }
        .retryWhen(retrySpec)
        // Parsing happens outside the retry: a malformed 200 body must not be treated as transient.
        .map[AccessToken](body => parseToken(body))
        .doOnNext(token => cache.put(resource, token))
    }
  }

  private def parseToken(body: String): AccessToken = {
    val node = mapper.readTree(body)
    val accessTokenNode = Option(node.get("access_token")).getOrElse(
      throw new RuntimeException("relay response did not contain access_token")
    )
    val tokenString = accessTokenNode.asText()
    val expiresAt: OffsetDateTime = Option(node.get("expires_on")) match {
      case Some(n) if !n.isNull =>
        val secondsStr = n.asText()
        val seconds = secondsStr.toLong
        OffsetDateTime.ofInstant(Instant.ofEpochSecond(seconds), ZoneOffset.UTC)
      case _ =>
        Option(node.get("expires_in")) match {
          case Some(n2) if !n2.isNull =>
            val secs = n2.asText().toLong
            OffsetDateTime.now(ZoneOffset.UTC).plusSeconds(secs)
          case _ => throw new RuntimeException("relay response did not contain expires_on or expires_in")
        }
    }

    new AccessToken(tokenString, expiresAt)
  }
}
// @formatter:on
