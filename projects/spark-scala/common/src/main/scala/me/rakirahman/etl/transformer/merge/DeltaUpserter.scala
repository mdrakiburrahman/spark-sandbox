package me.rakirahman.etl.transformer.merge

import me.rakirahman.etl.transformer.extensions.DataFrameExtensions._
import me.rakirahman.etl.transformer.extensions.QueryExtensions._
import io.delta.tables.DeltaTable
import org.apache.spark.internal.Logging
import org.apache.spark.sql.{DataFrame, SparkSession}

/** Performs UPSERTs using Delta Merge.
  *
  * @param spark
  *   The SparkSession object.
  */
class DeltaUpserter(spark: SparkSession) extends Upserter with Logging {

  private val updateAlias = "updates"
  private val destinationAlias = "destination"
  private val mergeKeyAlias = "merge_KEY"
  private val rowEffectiveFlagAlias = "is_row_effective"
  private val rowEffectiveStartAlias = "row_effective_start"
  private val rowEffectiveEndAlias = "row_effective_end"

  /** @inheritdoc
    */
  // @formatter:off
  override def upsertWithScd2(
      destinationDatabase: String,
      destinationTable: String,
      dataFrame: DataFrame,
      naturalKeyColumn: String,
      primaryKeyColumn: String,
      matchStatement: String,
      fullColumnsUpsertMap: Map[String, String],
      maxRetriesDuringConcurrentUpdates: Int = 10,
      retryAfterInMilliseconds: Int = 60000
  ): Unit = {

    spark.catalog.setCurrentDatabase(destinationDatabase)

    val destinationDeltaTable = DeltaTable.forName(spark, destinationTable)
    val destinationTableDataFrame = spark.read.table(s"${destinationDatabase}.${destinationTable}")

    // Pre-clean: filter stale/duplicate rows
    val updatePkCleanDataFrame = dataFrame.as(updateAlias)
                                          .join(destinationTableDataFrame.as(destinationAlias), dataFrame(primaryKeyColumn) === destinationTableDataFrame(primaryKeyColumn) &&
                                                                                                destinationTableDataFrame(rowEffectiveFlagAlias) === true &&
                                                                                                dataFrame(rowEffectiveStartAlias) > destinationTableDataFrame(rowEffectiveStartAlias), "left_anti")
                                          .selectExpr(s"${updateAlias}.*")
                                          .dropDuplicates(primaryKeyColumn)

    val updateDataFrame = updatePkCleanDataFrame.as(updateAlias)
                                                .join(destinationTableDataFrame.as(destinationAlias), updatePkCleanDataFrame(naturalKeyColumn) === destinationTableDataFrame(naturalKeyColumn) && updatePkCleanDataFrame(rowEffectiveStartAlias) <= destinationTableDataFrame(rowEffectiveStartAlias), "left_anti")
                                                .selectExpr(s"${updateAlias}.*")
                                                .dropDuplicates(naturalKeyColumn)

    // Apply NULL sensitive equality: "<=>"
    val nullEqualityMatchStatement = matchStatement.withNullEqualityApplied()
    val mergePredicate =s"(${destinationAlias}.${rowEffectiveFlagAlias} = true) AND (${nullEqualityMatchStatement})"

    val stagingUpdatesDF = updateDataFrame.as(updateAlias)
                                          .join(destinationDeltaTable.toDF.as(destinationAlias), naturalKeyColumn)
                                          .where(mergePredicate)
                                          .selectExpr(s"NULL as ${mergeKeyAlias}", s"${updateAlias}.*")
                                          .sortColumnsAlphabetically()
                                          .dropDuplicates(primaryKeyColumn)

    val stagingInsertsDF = updateDataFrame.selectExpr(s"${naturalKeyColumn} as ${mergeKeyAlias}", "*")
                                          .sortColumnsAlphabetically()
                                          .dropDuplicates(primaryKeyColumn)

    val stagingAllDF = stagingUpdatesDF.union(stagingInsertsDF)

    // Retry logic for concurrent Delta updates
    var retries = 0
    var success = false

    while (retries < maxRetriesDuringConcurrentUpdates && !success) {
      retries += 1
      try {
        destinationDeltaTable
          .as(destinationAlias)
          .merge(stagingAllDF.as(updateAlias), s"${destinationAlias}.${naturalKeyColumn} = ${mergeKeyAlias}")
          .whenMatched(mergePredicate)
          .updateExpr(Map(rowEffectiveFlagAlias -> "false", rowEffectiveEndAlias -> s"${updateAlias}.${rowEffectiveStartAlias}"))
          .whenNotMatched()
          .insertExpr(fullColumnsUpsertMap)
          .execute()
        success = true
      } catch {
        case e: Exception => {
            logError(s"Error Delta MERGE-ing to ${destinationDatabase}.${destinationTable} (Attempt $retries of $maxRetriesDuringConcurrentUpdates): $e")
            if (retries == maxRetriesDuringConcurrentUpdates) {
                throw new Exception(s"Failed Delta MERGE despite ${maxRetriesDuringConcurrentUpdates} retries into table: ${destinationDatabase}.${destinationTable}", e)
            } else {
                logWarning(s"Retrying Delta MERGE: into ${destinationDatabase}.${destinationTable} again in ${retryAfterInMilliseconds} milliseconds - attempts remaining: ${maxRetriesDuringConcurrentUpdates - retries}")
                Thread.sleep(retryAfterInMilliseconds)
            }
        }
      }
    }
    // @formatter:on
  }
}

/** Companion object for DeltaUpserter.
  */
object DeltaUpserter {

  /** Constructor.
    */
  def apply(spark: SparkSession): DeltaUpserter =
    new DeltaUpserter(spark)
}
