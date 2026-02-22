package me.rakirahman.etl.loader

import org.apache.spark.sql.DataFrame

/** Loads data into DataFrame.
  */
trait DataLoader {

  /** Performs load.
    *
    * @return
    *   The data loaded as a DataFrame.
    */
  def load(): DataFrame
}
