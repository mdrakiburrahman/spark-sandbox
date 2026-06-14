package me.rakirahman.reddit.rest

import me.rakirahman.reddit._

import org.apache.spark.internal.Logging
import org.json4s.jackson.JsonMethods

import java.net.{HttpURLConnection, URL, URLEncoder}
import java.nio.charset.StandardCharsets

import scala.io.Source
import scala.util.{Failure, Random, Success, Try}

/** HTTP-based [[me.rakirahman.reddit.RedditClient]] implementation that mirrors the Python `reddit_client.py` semantics 1:1.
  *
  *   - Polite jittered sleep before every call.
  *   - Exponential backoff with cap on 429 / 5xx (honors `Retry-After`).
  *   - Fast-fail on 401/403 — Reddit invalidated the session cookies.
  *   - GET-only — `morechildren.json` MUST be a GET (POST returns HTML-rendered fragments).
  *
  * Tunables map 1:1 to the Python POC + `tenacity` retry configuration; all defaults align with [[me.rakirahman.reddit.RedditClient]] companion constants.
  *
  * @param envelope
  *   The cookie envelope used to authenticate every call.
  * @param baseUrl
  *   The Reddit host (default `https://www.reddit.com`).
  * @param listingPageSize
  *   `limit=` on listing requests.
  * @param listingHardCap
  *   Caller-side guard against absurd Limit values (Reddit caps at 1000).
  * @param commentsLimit
  *   `limit=` on `/comments/<id>.json`.
  * @param commentsDepth
  *   `depth=` on `/comments/<id>.json`.
  * @param commentsSort
  *   `sort=` on `/comments/<id>.json`.
  * @param moreChildrenBatch
  *   `children=` batch size on `/api/morechildren.json`.
  * @param requestTimeoutSeconds
  *   Per-request connect + read timeout.
  * @param baseSleepSeconds
  *   Polite sleep before each request.
  * @param jitterMaxSeconds
  *   Random jitter added on top of `baseSleepSeconds`.
  * @param retryMaxAttempts
  *   Total attempts (1 = no retry).
  * @param retryWaitMinSeconds
  *   Lower bound on the exponential wait (seconds).
  * @param retryWaitMaxSeconds
  *   Upper bound on the exponential wait (seconds).
  * @param retryWaitMultiplier
  *   Exponential base (matches `tenacity.wait_exponential(multiplier=…)`).
  * @param random
  *   Random source for jitter (injected for testability).
  * @param sleeper
  *   Sleep callback in millis (injected so tests can fast-forward).
  */
class RedditRestClient(
    envelope: RedditTokenEnvelope,
    baseUrl: String = RedditClient.BaseUrlDefault,
    listingPageSize: Int = RedditClient.ListingPageSizeDefault,
    listingHardCap: Int = RedditClient.ListingHardCapDefault,
    commentsLimit: Int = RedditClient.CommentsLimitDefault,
    commentsDepth: Int = RedditClient.CommentsDepthDefault,
    commentsSort: String = RedditClient.CommentsSortDefault,
    moreChildrenBatch: Int = RedditClient.MoreChildrenBatchDefault,
    requestTimeoutSeconds: Int = RedditClient.RequestTimeoutSecondsDefault,
    baseSleepSeconds: Double = RedditClient.BaseSleepSecondsDefault,
    jitterMaxSeconds: Double = RedditClient.JitterMaxSecondsDefault,
    retryMaxAttempts: Int = RedditClient.RetryMaxAttemptsDefault,
    retryWaitMinSeconds: Double = RedditClient.RetryWaitMinSecondsDefault,
    retryWaitMaxSeconds: Double = RedditClient.RetryWaitMaxSecondsDefault,
    retryWaitMultiplier: Double = RedditClient.RetryWaitMultiplierDefault,
    random: Random = new Random(),
    sleeper: Long => Unit = ms => Thread.sleep(ms)
) extends RedditClient
    with Logging {

  private val csrfHeader: Option[String] = envelope.cookies.get("csrf_token")
  private val bearerHeader: Option[String] = Option(envelope.bearer).map(_.trim).filter(_.nonEmpty)
  @volatile private var moreCalls: Long = 0L

  /** @inheritdoc */
  override def moreCallCount: Long = moreCalls

  /** @inheritdoc */
  override def paginateListing(
      subreddit: String,
      listingType: RedditListingTypes.ListingType,
      timeWindow: Option[RedditTimeWindows.TimeWindow],
      limit: Int
  ): Iterator[Map[String, Any]] = {
    val effectiveLimit = if (limit > listingHardCap) {
      logWarning(s"Clamping requested limit=$limit to Reddit listing cap=$listingHardCap")
      listingHardCap
    } else limit

    new Iterator[Map[String, Any]] {
      private var after: Option[String] = None
      private var seen: Int = 0
      private val buffer = scala.collection.mutable.Queue.empty[Map[String, Any]]
      private var exhausted: Boolean = false

      override def hasNext: Boolean = {
        while (buffer.isEmpty && !exhausted && seen < effectiveLimit) loadNextPage()
        buffer.nonEmpty
      }

      override def next(): Map[String, Any] = {
        if (!hasNext) throw new NoSuchElementException("Reddit listing exhausted")
        val item = buffer.dequeue()
        seen += 1
        item
      }

      private def loadNextPage(): Unit = {
        val pageSize = math.min(listingPageSize, effectiveLimit - seen)
        val params = scala.collection.mutable.LinkedHashMap[String, String]("limit" -> pageSize.toString, "raw_json" -> "1")
        if (RedditListingTypes.acceptsTimeWindow(listingType)) {
          timeWindow.foreach(t => params("t") = t.toString)
        }
        after.foreach { a =>
          params("after") = a
          params("count") = seen.toString
        }
        val url = s"$baseUrl/r/$subreddit/${listingType.toString}.json"
        val doc = getJson(url, params.toMap)
        val data = RedditClient.getNestedMap(RedditClient.asMap(doc), "data")
        val children = RedditClient.getNestedSeq(data, "children")
        if (children.isEmpty) {
          logInfo(s"Listing /r/$subreddit/$listingType exhausted at $seen posts (no children)")
          exhausted = true
        } else {
          children.foreach {
            case childMap: Map[_, _] =>
              val m = childMap.asInstanceOf[Map[String, Any]]
              if (RedditClient.getString(m, "kind") == "t3") {
                buffer.enqueue(RedditClient.getNestedMap(m, "data"))
              }
            case _ => ()
          }
          after = RedditClient.getString(data, "after") match {
            case s if s.nonEmpty => Some(s)
            case _ =>
              logInfo(s"Listing /r/$subreddit/$listingType exhausted at $seen posts (after=null)")
              exhausted = true
              None
          }
        }
      }
    }
  }

  /** @inheritdoc */
  override def fetchComments(shortId: String): (Map[String, Any], Seq[Map[String, Any]]) = {
    val url = s"$baseUrl/comments/$shortId.json"
    val params = Map(
      "limit" -> commentsLimit.toString,
      "depth" -> commentsDepth.toString,
      "threaded" -> "false",
      "sort" -> commentsSort,
      "raw_json" -> "1"
    )
    val doc = getJson(url, params)
    doc match {
      case s: Seq[_] if s.length >= 2 =>
        val listingMaps = s.collect { case m: Map[_, _] => m.asInstanceOf[Map[String, Any]] }
        val postListing = listingMaps.headOption.getOrElse(Map.empty[String, Any])
        val postChildren = RedditClient.getNestedSeq(RedditClient.getNestedMap(postListing, "data"), "children")
        val post = postChildren.headOption
          .collect { case m: Map[_, _] =>
            RedditClient.getNestedMap(m.asInstanceOf[Map[String, Any]], "data")
          }
          .getOrElse(Map.empty[String, Any])
        val commentListing = listingMaps.lift(1).getOrElse(Map.empty[String, Any])
        val comments = RedditClient.getNestedSeq(RedditClient.getNestedMap(commentListing, "data"), "children")
        val commentMaps = comments.collect { case m: Map[_, _] => m.asInstanceOf[Map[String, Any]] }
        (post, commentMaps)
      case other =>
        throw new RedditHttpException(s"Unexpected /comments/$shortId.json shape: ${other.getClass.getName}")
    }
  }

  /** @inheritdoc */
  override def expandMore(linkId: String, childIds: Seq[String]): Seq[Map[String, Any]] = {
    val out = scala.collection.mutable.ArrayBuffer.empty[Map[String, Any]]
    childIds.grouped(moreChildrenBatch).foreach { batch =>
      val params = Map(
        "api_type" -> "json",
        "link_id" -> linkId,
        "children" -> batch.mkString(","),
        "sort" -> commentsSort,
        "raw_json" -> "1"
      )
      val doc = getJson(s"$baseUrl/api/morechildren.json", params)
      val json = RedditClient.getNestedMap(RedditClient.asMap(doc), "json")
      val data = RedditClient.getNestedMap(json, "data")
      val things = RedditClient.getNestedSeq(data, "things")
      out ++= things.collect { case m: Map[_, _] => m.asInstanceOf[Map[String, Any]] }
      moreCalls += 1L
    }
    out.toSeq
  }

  // ─── transport + retry ─────────────────────────────────────────────────────

  /** Polite jittered sleep before every request — mirrors `_polite_sleep`. */
  private def politeSleep(): Unit = {
    val jitter = if (jitterMaxSeconds > 0.0) random.nextDouble() * jitterMaxSeconds else 0.0
    val totalMs = math.max(0L, ((baseSleepSeconds + jitter) * 1000.0).toLong)
    if (totalMs > 0L) sleeper(totalMs)
  }

  /** Compute the exponential-backoff wait in ms for retry attempt `n`. Matches `tenacity.wait_exponential(multiplier, min, max)` arithmetic.
    *
    * @param attempt
    *   The 1-based attempt counter (so the wait *before* attempt 2 is `computeWaitMs(1)`).
    */
  private[rest] def computeWaitMs(attempt: Int): Long = {
    val rawSeconds = retryWaitMultiplier * math.pow(2.0, attempt.toDouble - 1.0)
    val clamped = math.min(retryWaitMaxSeconds, math.max(retryWaitMinSeconds, rawSeconds))
    (clamped * 1000.0).toLong
  }

  /** Issue a GET, retrying transient 429/5xx with exponential backoff.
    *
    * @return
    *   the parsed JSON document (a `Map[String, Any]` for object responses, `Seq[Map[String, Any]]` for arrays — the caller knows which to expect).
    */
  private def getJson(url: String, params: Map[String, String]): Any = {
    val full = buildUrl(url, params)
    var attempt = 0
    var lastError: Throwable = null
    while (attempt < retryMaxAttempts) {
      attempt += 1
      politeSleep()
      val outcome = Try(issueGet(full))
      outcome match {
        case Success(Right(json)) => return json
        case Success(Left(retryAfter)) =>
          lastError = retryAfter.cause
          if (attempt < retryMaxAttempts) {
            val wait = math.max(retryAfter.retryAfterMs.getOrElse(0L), computeWaitMs(attempt))
            logWarning(s"GET $full -> ${retryAfter.reason}; retry $attempt/$retryMaxAttempts in ${wait}ms")
            if (wait > 0L) sleeper(wait)
          }
        case Failure(ex: RedditCookieExpiredException) => throw ex
        case Failure(ex: RedditHttpException)          => throw ex
        case Failure(ex) =>
          lastError = ex
          if (attempt < retryMaxAttempts) {
            val wait = computeWaitMs(attempt)
            logWarning(s"GET $full -> ${ex.getClass.getSimpleName}: ${ex.getMessage}; retry $attempt/$retryMaxAttempts in ${wait}ms")
            if (wait > 0L) sleeper(wait)
          }
      }
    }
    throw new RedditHttpException(s"GET $full failed after $retryMaxAttempts attempts", lastError)
  }

  private case class TransientFailure(reason: String, retryAfterMs: Option[Long], cause: Throwable)

  /** Single-shot GET. Returns `Right(jsonValue)` on 2xx with JSON, or `Left(TransientFailure)` on 429/5xx / network glitches; throws for permanent failures (401/403, 4xx, malformed content).
    */
  private def issueGet(fullUrl: String): Either[TransientFailure, Any] = {
    val conn = new URL(fullUrl).openConnection().asInstanceOf[HttpURLConnection]
    try {
      conn.setRequestMethod("GET")
      conn.setInstanceFollowRedirects(true)
      conn.setConnectTimeout(requestTimeoutSeconds * 1000)
      conn.setReadTimeout(requestTimeoutSeconds * 1000)
      conn.setRequestProperty("User-Agent", envelope.userAgent)
      conn.setRequestProperty("Accept", "application/json")
      conn.setRequestProperty("Cookie", envelope.cookieHeader)
      csrfHeader.foreach(c => conn.setRequestProperty("x-reddit-csrf", c))
      bearerHeader.foreach(b => conn.setRequestProperty("Authorization", s"Bearer $b"))

      val code = conn.getResponseCode
      if (code == 429 || code >= 500) {
        val retryAfter = Option(conn.getHeaderField("Retry-After")).flatMap(s => Try(s.toDouble).toOption).map(s => (s * 1000.0).toLong)
        val body = readBody(conn, code)
        return Left(TransientFailure(s"HTTP $code (Retry-After=${retryAfter.getOrElse(0L)}ms): ${body.take(200)}", retryAfter, new RedditHttpException(s"HTTP $code")))
      }
      if (code == 401 || code == 403) {
        val body = readBody(conn, code)
        throw new RedditCookieExpiredException(s"HTTP $code from $fullUrl — cookies likely stale; re-mint the token envelope. Body: ${body.take(200)}")
      }
      if (code >= 400) {
        val body = readBody(conn, code)
        throw new RedditHttpException(s"HTTP $code from $fullUrl: ${body.take(300)}")
      }
      val contentType = Option(conn.getContentType).getOrElse("")
      if (!contentType.toLowerCase.contains("json")) {
        val body = readBody(conn, code)
        throw new RedditHttpException(s"Non-JSON response from $fullUrl (Content-Type=$contentType): ${body.take(200)}")
      }
      val body = Source.fromInputStream(conn.getInputStream, StandardCharsets.UTF_8.name()).mkString
      Right(JsonMethods.parse(body).values)
    } catch {
      case ex: RedditClientException => throw ex
      case ex: java.io.IOException =>
        Left(TransientFailure(s"network error: ${ex.getMessage}", None, ex))
    } finally {
      conn.disconnect()
    }
  }

  /** Best-effort body read; pulls from `errorStream` on >= 400. */
  private def readBody(conn: HttpURLConnection, code: Int): String = {
    val stream = if (code >= 400) Option(conn.getErrorStream) else Option(conn.getInputStream)
    stream
      .map { is =>
        Try(Source.fromInputStream(is, StandardCharsets.UTF_8.name()).mkString).getOrElse("")
      }
      .getOrElse("")
  }

  /** Render the URL with URL-encoded query params. Iteration order is preserved when callers pass a LinkedHashMap, which keeps the wire shape deterministic for the contract tests.
    */
  private[rest] def buildUrl(base: String, params: Map[String, String]): String = {
    if (params.isEmpty) base
    else {
      val qs = params
        .map { case (k, v) => s"${URLEncoder.encode(k, StandardCharsets.UTF_8.name())}=${URLEncoder.encode(v, StandardCharsets.UTF_8.name())}" }
        .mkString("&")
      s"$base?$qs"
    }
  }
}
