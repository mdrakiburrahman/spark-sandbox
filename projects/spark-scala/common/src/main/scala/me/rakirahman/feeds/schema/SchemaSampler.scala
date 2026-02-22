package me.rakirahman.feeds.schema

/** Represents a trait for sampling a schema.
  */
trait SchemaSampler {

  /** The sample payload.
    */
  val Sample: Seq[String]
}
