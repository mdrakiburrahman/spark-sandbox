package me.rakirahman.metastore

import org.apache.spark.sql.DataFrame

/** Trait representing comparison operations.
  */
trait ComparisonOperations {

  /** Compare if 2 DataFrames are equal.
    *
    * @param left
    *   The first DataFrame.
    * @param right
    *   The second DataFrame.
    * @return
    *   true if DataFrames are equal, false otherwise.
    */
  def isEqual(left: DataFrame, right: DataFrame): Boolean

}
