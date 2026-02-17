package me.rakirahman.feeds.schema

/** Represents a versioned SQL schema.
  */
// @formatter:off
trait VersionedSlowlyChangingSqlSchema
    extends SqlSchema
    with UniqueKeyTableSchema {

  /** The version of the key hash, this value is used to tweak the hash
    * function.
    */
  val primaryKeyHashVersionValue: Double

  /** The key hash version column.
    */
  lazy val primaryKeyHashVersionColumn: (String, String) = (s"${primaryKey._1}_hash_version", "DOUBLE")
}
// @formatter:on
