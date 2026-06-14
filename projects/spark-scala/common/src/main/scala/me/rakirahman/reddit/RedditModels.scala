package me.rakirahman.reddit

/** Reddit "thing" kind prefixes — fullnames carry a `kindPrefix_id36` shape.
  *
  * Documented at <https://www.reddit.com/dev/api/#fullnames>.
  */
object RedditKinds {
  val Comment: String = "t1_"
  val Account: String = "t2_"
  val Link: String = "t3_"
  val Message: String = "t4_"
  val Subreddit: String = "t5_"
  val Award: String = "t6_"

  val DeletedAuthorId: String = "deleted"
  val DeletedAuthorName: String = "[deleted]"
}

/** Listing types supported by Reddit's public listing endpoints.
  */
object RedditListingTypes extends Enumeration {
  type ListingType = Value

  val Top: ListingType = Value("top")
  val New: ListingType = Value("new")
  val Hot: ListingType = Value("hot")
  val Rising: ListingType = Value("rising")
  val Controversial: ListingType = Value("controversial")

  /** Listings that honor the `t=` time-window query parameter. */
  def acceptsTimeWindow(listing: ListingType): Boolean =
    listing == Top || listing == Controversial
}

/** Time-window values accepted by `top` and `controversial` listings.
  */
object RedditTimeWindows extends Enumeration {
  type TimeWindow = Value

  val Hour: TimeWindow = Value("hour")
  val Day: TimeWindow = Value("day")
  val Week: TimeWindow = Value("week")
  val Month: TimeWindow = Value("month")
  val Year: TimeWindow = Value("year")
  val All: TimeWindow = Value("all")
}

/** Raw row that the [[me.rakirahman.reddit.RedditClient]] emits for each upstream API response. Persisted as a single DataFrame before being split by [[me.rakirahman.reddit.RedditKinds]] downstream.
  *
  * @param fetchRunId
  *   The synthetic epoch-millis run identifier.
  * @param subreddit
  *   The requested subreddit display name (without the `r/` prefix).
  * @param kind
  *   One of `t1` / `t3` / `t5` (the typed body), or `more_ref` for an internal hand-off carrying the post fullname being expanded.
  * @param parentId
  *   For comments, the immediate parent fullname (post or comment); null for posts and standalone subreddits.
  * @param postId
  *   For comments, the owning post fullname (`t3_*`); null for posts and standalone subreddits.
  * @param depth
  *   For comments, the depth in the tree (0 = top-level); null for posts.
  * @param fetchedAtEpochMs
  *   When this row was materialized.
  * @param payloadJson
  *   The raw Reddit `data` blob as JSON text.
  */
case class RedditRawRow(
    fetchRunId: Long,
    subreddit: String,
    kind: String,
    parentId: String,
    postId: String,
    depth: java.lang.Integer,
    fetchedAtEpochMs: Long,
    payloadJson: String
)
