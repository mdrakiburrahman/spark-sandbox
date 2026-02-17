package me.rakirahman.etl.transformer.extensions

import org.apache.spark.sql.expressions.Window
import org.apache.spark.sql.functions._
import org.apache.spark.sql.{DataFrame}

object DataFrameExtensions {

  implicit class DataFrameTransformer(dataFrame: DataFrame) {

    /** Sort the columns of a DataFrame alphabetically.
      *
      * @return
      *   A new DataFrame with columns sorted alphabetically.
      */
    def sortColumnsAlphabetically(): DataFrame = {
      val sortedColumns = dataFrame.columns.sorted
      dataFrame.select(sortedColumns.head, sortedColumns.tail: _*)
    }

    /** Return DataFrame with unique, latest natural key.
      *
      * @param naturalKeyCol
      *   The name of the natural key column.
      * @param orderCol
      *   The name of the column used for ordering.
      * @return
      *   A new DataFrame containing the latest updates for each unique natural
      *   key.
      */
    def withUniqueLatestNaturalKey(
        naturalKeyCol: String,
        orderCol: String
    ): DataFrame = {
      val windowSpec =
        Window.partitionBy(naturalKeyCol).orderBy(col(orderCol).desc)

      dataFrame
        .withColumn("row_number", row_number().over(windowSpec))
        .filter(col("row_number") === 1)
        .drop("row_number")
        .dropDuplicates(naturalKeyCol)
    }
  }
}
