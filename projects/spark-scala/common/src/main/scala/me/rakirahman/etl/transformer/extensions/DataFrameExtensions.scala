package me.rakirahman.etl.transformer.extensions

import org.apache.spark.sql.expressions.Window
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types.{ArrayType, StructField}
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
      *   A new DataFrame containing the latest updates for each unique natural key.
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

    /** Adds JSON-ized versions of all array columns, optionally dropping the original array columns.
      *
      * @param suffix
      *   Suffix to append to the new JSON column names.
      * @param dropArrayCol
      *   If true, drops the original array columns after conversion.
      * @return
      *   [[DataFrame]] with JSON-ized array columns.
      */
    def withJsonizedArrays(
        suffix: String = "_json",
        dropArrayCol: Boolean = false
    ): DataFrame = {
      val arrayCols = dataFrame.schema.fields.collect { case StructField(name, ArrayType(_, _), _, _) =>
        name
      }
      val jsonizedCols =
        arrayCols.map(name => name + suffix -> to_json(col(name))).toMap

      val withJsonCols =
        if (jsonizedCols.nonEmpty) dataFrame.withColumns(jsonizedCols)
        else dataFrame

      if (dropArrayCol && arrayCols.nonEmpty) {
        withJsonCols.drop(arrayCols: _*)
      } else {
        withJsonCols
      }
    }
  }
}
