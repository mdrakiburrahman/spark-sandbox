package me.rakirahman.feeds.schema.extensions

/** Represents a hash based key generator.
  */
// @formatter:off
trait HashedKeyGenerator {

  /** Generates a primary key hash for the specified columns. Sorts the columns
    * before hashing so we always get a consistent hash for a given set of
    * columns, even if called with a different order.
    *
    * @param columns
    *   An array of column names as array of strings.
    * @param distinct
    *   A boolean indicating whether to deduplicate the columns before hashing, default is true.
    * @return
    *   A String representing the SHA-512 hash of the concatenated columns.
    */
  def toUniqueHash(
      columns: Array[String],
      distinct: Boolean = true
  ): String = s"""SHA2(concat_ws('|', ${(if (distinct) columns.distinct else columns).sorted.mkString(", ")}), 512)"""
}
// @formatter:on
