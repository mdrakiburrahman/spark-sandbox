package me.rakirahman.etl.transformer.extensions

import org.apache.spark.sql.{DataFrame}
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

object DataFrameArrayExtensions {

  implicit class DataFrameArrayTransformer(dataFrames: Array[DataFrame]) {

    /** Merges schemas from multiple [[DataFrame]]s and performs a union operation, filling missing columns with NULL values.
      *
      * @return
      *   Single [[DataFrame]] with merged schema containing all rows
      */
    def unionWithMergedSchema(): DataFrame = {
      require(dataFrames.nonEmpty, "Array of DataFrames cannot be empty")

      val columnTypeMap = scala.collection.mutable.Map[String, DataType]()

      dataFrames.foreach { df =>
        df.schema.fields.foreach { field =>
          columnTypeMap.get(field.name) match {
            case Some(existingType) =>
              if (existingType != field.dataType) {
                throw new IllegalArgumentException(
                  s"Column '${field.name}' has conflicting data types: " +
                    s"${existingType.typeName} vs ${field.dataType.typeName}"
                )
              }
            case None =>
              columnTypeMap(field.name) = field.dataType
          }
        }
      }

      val mergedSchema = StructType(
        columnTypeMap
          .map { case (name, dataType) =>
            StructField(name, dataType, nullable = true)
          }
          .toArray
          .sortBy(_.name)
      )

      dataFrames
        .map { df =>
          normalizeToSchema(df, mergedSchema)
        }
        .reduce(_.union(_))
    }

    /** Normalizes a [[DataFrame]] to match a target schema by adding missing columns with NULL values and selecting columns in the correct order.
      */
    private def normalizeToSchema(
        df: DataFrame,
        targetSchema: StructType
    ): DataFrame = {
      val currentColumns = df.schema.fieldNames.toSet
      val targetColumns = targetSchema.fieldNames

      targetColumns
        .foldLeft(df) { (accDf, colName) =>
          if (currentColumns.contains(colName)) {
            accDf
          } else {
            val targetField = targetSchema.find(_.name == colName).get
            accDf.withColumn(colName, lit(null).cast(targetField.dataType))
          }
        }
        .select(targetColumns.map(col): _*)
    }
  }
}
