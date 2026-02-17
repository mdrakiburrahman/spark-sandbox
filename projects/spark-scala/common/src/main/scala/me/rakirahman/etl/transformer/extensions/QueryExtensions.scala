package me.rakirahman.etl.transformer.extensions

/** Extension object that provides extension methods for applying
  * transformations to query conditions.
  */
object QueryExtensions {

  implicit class QueryExtensions(query: String) {

    /** Applies null equality to the condition string.
      *
      * Transforms `<>` comparisons to null-safe `<=>` comparisons.
      *
      * @return
      *   The modified condition string with null equality applied.
      */
    def withNullEqualityApplied(): String = {
      """(\w+\.\w+)\s*<>\s*(\w+\.\w+)""".r.replaceAllIn(
        query,
        m => s"NOT (${m.group(1)} <=> ${m.group(2)})"
      )
    }
  }
}
