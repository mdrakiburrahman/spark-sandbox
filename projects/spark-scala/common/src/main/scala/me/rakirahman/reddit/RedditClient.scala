package me.rakirahman.reddit

import org.json4s.JsonAST.{JArray, JNothing, JNull, JValue}
import org.json4s.jackson.JsonMethods

import scala.collection.JavaConverters._
import scala.util.Try

/** Interface for fetching Reddit content via the `oauth.reddit.com` JSON surface. Implementations carry their own transport, retry, and rate-limit concerns; the trait is intentionally minimal so the [[me.rakirahman.reddit.RedditClient.RedditWalker]] driving the comment tree stays test-friendly.
  */
trait RedditClient {

  /** Iterate over a subreddit listing, yielding raw `t3` post `data` maps in page order (max [[me.rakirahman.reddit.RedditClient.ListingHardCapDefault]] items).
    *
    * @param subreddit
    *   Name without `r/` prefix.
    * @param listingType
    *   Reddit listing endpoint (top / new / hot / rising / controversial).
    * @param timeWindow
    *   Optional `t=` window — applied only for listings where [[RedditListingTypes.acceptsTimeWindow]] is true.
    * @param limit
    *   Caller-requested page count cap.
    */
  def paginateListing(
      subreddit: String,
      listingType: RedditListingTypes.ListingType,
      timeWindow: Option[RedditTimeWindows.TimeWindow],
      limit: Int
  ): Iterator[Map[String, Any]]

  /** Fetch a single post + its top-level comment listing. Returns `(post-data, top-level-comment-things)` mirroring the Python POC's `fetch_comments` shape.
    *
    * @param shortId
    *   The post `id` (base36, e.g. `1tgps74`); the `t3_` prefix is added by Reddit's URL template.
    */
  def fetchComments(shortId: String): (Map[String, Any], Seq[Map[String, Any]])

  /** Expand a `more` comment-tree stub via the `GET /api/morechildren.json` endpoint. Returns the flat list of `things` (a mix of `t1` and nested `more`). MUST be a GET — POST returns HTML-rendered fragments.
    *
    * @param linkId
    *   The owning post fullname (`t3_*`).
    * @param childIds
    *   Comment id36s to expand, batched internally at [[RedditClient.RedditWalker.moreChildrenBatch]].
    */
  def expandMore(linkId: String, childIds: Seq[String]): Seq[Map[String, Any]]

  /** Count of `morechildren` API calls observed since this client was constructed. Mirrors the Python POC's `more_call_count` for parity in the fetch-run summary.
    */
  def moreCallCount: Long
}

/** Companion holding shared constants + json4s navigation helpers used by all `RedditClient` implementations and downstream transformers.
  */
object RedditClient {

  /** Reddit caps each `top` / `controversial` listing at 1000 items. */
  val ListingHardCapDefault: Int = 1000

  /** Default page size — matches the URL the Python POC builds. */
  val ListingPageSizeDefault: Int = 100

  /** Default `morechildren` batch — Reddit accepts up to 100 children per call. */
  val MoreChildrenBatchDefault: Int = 100

  /** Default `/comments/<id>.json` `limit` param. */
  val CommentsLimitDefault: Int = 500

  /** Default `/comments/<id>.json` `depth` param. */
  val CommentsDepthDefault: Int = 10

  /** Default `/comments/<id>.json` `sort` param. */
  val CommentsSortDefault: String = "top"

  /** Default per-call polite sleep before each request (seconds). */
  val BaseSleepSecondsDefault: Double = 1.0

  /** Default jitter added on top of the base sleep (seconds). */
  val JitterMaxSecondsDefault: Double = 0.2

  /** Default per-request HTTP timeout (seconds). */
  val RequestTimeoutSecondsDefault: Int = 30

  /** Default maximum retry attempts (matches `tenacity.stop_after_attempt(8)`). */
  val RetryMaxAttemptsDefault: Int = 8

  /** Default min wait between retries (seconds). */
  val RetryWaitMinSecondsDefault: Double = 2.0

  /** Default max wait between retries (seconds). */
  val RetryWaitMaxSecondsDefault: Double = 60.0

  /** Default exponential backoff multiplier. */
  val RetryWaitMultiplierDefault: Double = 2.0

  /** Default max recursion depth when walking the comment tree. */
  val MaxRecursionDepthDefault: Int = 50

  /** Reddit's public host. */
  val BaseUrlDefault: String = "https://oauth.reddit.com"

  // ─── json4s navigation helpers ────────────────────────────────────────────

  /** Coerce a json4s parse result into a Map[String, Any], normalizing `null` / non-object responses to an empty map.
    *
    * @param value
    *   The parsed JSON value.
    */
  def asMap(value: Any): Map[String, Any] = value match {
    case m: Map[_, _] => m.asInstanceOf[Map[String, Any]]
    case _            => Map.empty[String, String].asInstanceOf[Map[String, Any]]
  }

  /** Coerce a json4s parse result into a Seq[Map[String, Any]].
    */
  def asMapSeq(value: Any): Seq[Map[String, Any]] = value match {
    case s: Seq[_] => s.collect { case m: Map[_, _] => m.asInstanceOf[Map[String, Any]] }
    case _         => Seq.empty[Map[String, Any]]
  }

  /** Read a nested field as a string, returning empty when absent / null.
    */
  def getString(obj: Map[String, Any], field: String): String = obj.get(field) match {
    case Some(null) => ""
    case Some(v)    => v.toString
    case None       => ""
  }

  /** Read a nested field as `Option[Long]`. Handles `Number` and numeric-string forms.
    */
  def getLongOpt(obj: Map[String, Any], field: String): Option[Long] = obj.get(field).flatMap {
    case null      => None
    case n: Number => Some(n.longValue())
    case d: Double => Some(d.toLong)
    case s: String => Try(s.toLong).toOption.orElse(Try(s.toDouble.toLong).toOption)
    case _         => None
  }

  /** Read a nested field as `Option[Int]`.
    */
  def getIntOpt(obj: Map[String, Any], field: String): Option[Int] = getLongOpt(obj, field).map(_.toInt)

  /** Read a nested field as `Option[Double]`.
    */
  def getDoubleOpt(obj: Map[String, Any], field: String): Option[Double] = obj.get(field).flatMap {
    case null      => None
    case n: Number => Some(n.doubleValue())
    case s: String => Try(s.toDouble).toOption
    case _         => None
  }

  /** Read a nested field as `Option[Boolean]`.
    */
  def getBoolOpt(obj: Map[String, Any], field: String): Option[Boolean] = obj.get(field).flatMap {
    case null       => None
    case b: Boolean => Some(b)
    case s: String  => Try(s.toBoolean).toOption
    case _          => None
  }

  /** Walk into a child map, returning an empty map when the field is absent or not a map. Used heavily for `data.children` / `data.replies.data` etc.
    */
  def getNestedMap(obj: Map[String, Any], field: String): Map[String, Any] = obj.get(field) match {
    case Some(m: Map[_, _]) => m.asInstanceOf[Map[String, Any]]
    case _                  => Map.empty[String, Any]
  }

  /** Walk into a child array, returning an empty seq when the field is absent or not an array.
    */
  def getNestedSeq(obj: Map[String, Any], field: String): Seq[Any] = obj.get(field) match {
    case Some(s: Seq[_]) => s
    case _               => Seq.empty[Any]
  }

  /** Serialize a parsed JSON sub-value back to a compact JSON string so it can be persisted verbatim on a [[me.rakirahman.reddit.RedditRawRow]].
    *
    * @param value
    *   The parsed JSON sub-value (typically the `data` map of a thing).
    */
  def toCompactJson(value: Any): String =
    JsonMethods.compact(JsonMethods.render(toJValue(value)))

  /** Convert an Any-typed parsed JSON value back into a json4s JValue so it can be re-rendered. Handles maps, lists, numbers, booleans, and strings.
    */
  private def toJValue(value: Any): JValue = value match {
    case null => JNull
    case m: Map[_, _] =>
      import org.json4s.JsonAST.JObject
      JObject(m.asInstanceOf[Map[String, Any]].toList.map { case (k, v) => k -> toJValue(v) })
    case s: Seq[_]               => JArray(s.toList.map(toJValue))
    case it: Iterable[_]         => JArray(it.toList.map(toJValue))
    case jl: java.util.List[_]   => JArray(jl.asScala.toList.map(toJValue))
    case b: Boolean              => org.json4s.JsonAST.JBool(b)
    case n: Int                  => org.json4s.JsonAST.JInt(n)
    case n: Long                 => org.json4s.JsonAST.JLong(n)
    case n: BigInt               => org.json4s.JsonAST.JInt(n)
    case n: java.math.BigInteger => org.json4s.JsonAST.JInt(BigInt(n))
    case n: Double               => org.json4s.JsonAST.JDouble(n)
    case n: Float                => org.json4s.JsonAST.JDouble(n.toDouble)
    case n: BigDecimal           => org.json4s.JsonAST.JDecimal(n)
    case n: java.math.BigDecimal => org.json4s.JsonAST.JDecimal(BigDecimal(n))
    case s: String               => org.json4s.JsonAST.JString(s)
    case other                   => org.json4s.JsonAST.JString(other.toString)
  }
}

/** Sealed hierarchy describing the typed errors a [[RedditClient]] can throw.
  */
sealed abstract class RedditClientException(msg: String, cause: Throwable = null) extends RuntimeException(msg, cause)

/** Thrown for any non-retryable HTTP failure (other than 401/403).
  */
final class RedditHttpException(msg: String, cause: Throwable = null) extends RedditClientException(msg, cause)

/** Thrown on 401/403 — Reddit invalidated the session cookies. Callers should re-mint the envelope; retries will not help.
  */
final class RedditCookieExpiredException(msg: String) extends RedditClientException(msg)
