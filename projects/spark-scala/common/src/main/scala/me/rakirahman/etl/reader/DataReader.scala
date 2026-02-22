package me.rakirahman.etl.reader

import org.apache.spark.sql.DataFrame

/** Reads from source into DataFrame.
  */
trait DataReader {

  /** Performs read.
    *
    * @return
    *   The read data as a DataFrame.
    */
  def read(): DataFrame
}
