package me.rakirahman.etl.transformer.scd.transformations

import me.rakirahman.feeds.schema.VersionedSlowlyChangingSqlSchema
import org.apache.spark.sql._
import org.apache.spark.sql.functions._

// @formatter:off
/** Provides transformation methods for SCD Schemas.
  */
object SCDTransformations {

  /** Adds a new column to represent the hashing algorithm version of the
    * primary key.
    *
    * @param schema
    *   The [[VersionedSlowlyChangingSqlSchema]]
    * @param df
    *   The DataFrame to apply the transformations on.
    * @return
    *   The transformed DataFrame with the casted column.
    */
  def withVersionedPrimaryKey(schema: VersionedSlowlyChangingSqlSchema)(df: DataFrame): DataFrame = df.withColumn(schema.primaryKeyHashVersionColumn._1, lit(schema.primaryKeyHashVersionValue))
}
