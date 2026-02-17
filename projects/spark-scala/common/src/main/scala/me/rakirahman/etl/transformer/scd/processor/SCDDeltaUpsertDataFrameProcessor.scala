package me.rakirahman.etl.transformer.scd.processor

import me.rakirahman.etl.transformer.extensions.DataFrameExtensions._
import me.rakirahman.etl.transformer.merge.DeltaUpserter
import me.rakirahman.etl.transformer.scd.SCDTransformationMetadataMappings
import org.apache.spark.sql._
import org.apache.spark.sql.functions._
import org.apache.spark.storage.StorageLevel

// @formatter:off
/** Processes SCD tables using UPSERTs via Delta Merge.
  *
  * All methods are idempotent.
  *
  * - Dimension - uses UPSERT with primary key
  * - Fact - uses integrity lookup with primary key
  *
  * @param spark
  *   The SparkSession object.
  * @param upserter
  *   The upserter.
  * @param scdMappings
  *   The SCD mappings.
  */
// @formatter:on
class SCDDeltaUpsertDataFrameProcessor(
    spark: SparkSession,
    upserter: DeltaUpserter,
    scdMappings: SCDTransformationMetadataMappings
) extends SCDDataFrameProcessor {

  /** @inheritdoc
    */
  // @formatter:off
  override def processTableDim(
      sourceDF: DataFrame,
      destinationDatabase: String,
      destinationTableName: String,
      sourceNaturalKeyCol: String,
      destinationNaturalKeyCol: String,
      timestampOrderCol: String,
      colScdEffectiveStartTimeName: String = "row_effective_start",
      cacheStorageLevel: StorageLevel = StorageLevel.MEMORY_ONLY_SER
  ): DataFrame = {

    val primaryKeyCol = scdMappings.DimTransformationTableInfoMap(destinationTableName).primaryKeyCol
    val matchStatement = scdMappings.DimTransformationTableInfoMap(destinationTableName).matchStatement
    val columnsToSelect = scdMappings.DimTransformationTableInfoMap(destinationTableName).nonSCDColumns ++ Array(colScdEffectiveStartTimeName)
    val fullColumnsUpsertMap = scdMappings.DimTransformationTableInfoMap(destinationTableName).fullColumnsUpsertMap

    val uniqueTimeFilteredDF = sourceDF.withUniqueLatestNaturalKey(sourceNaturalKeyCol, timestampOrderCol)
    val selectUniqueTimeFilteredDF = uniqueTimeFilteredDF.select(columnsToSelect.head, columnsToSelect.tail: _*).orderBy(primaryKeyCol)

    val finalCandidateDF = selectUniqueTimeFilteredDF.persist(cacheStorageLevel)
    // Force materialization
    finalCandidateDF.count()

    if (!finalCandidateDF.isEmpty) {
        upserter.upsertWithScd2(destinationDatabase, destinationTableName, finalCandidateDF, destinationNaturalKeyCol, primaryKeyCol, matchStatement, fullColumnsUpsertMap)
    }

    finalCandidateDF.unpersist(blocking = true)

    finalCandidateDF
  }

  /** @inheritdoc
    */
  override def processTableFact(
      sourceDF: DataFrame,
      destinationDatabase: String,
      destinationTableName: String,
      incomingTableName: String,
      integrityQuery: String,
      primaryKeyColumnName: String,
      cacheStorageLevel: StorageLevel = StorageLevel.MEMORY_ONLY_SER
  ): DataFrame = {

    var columnsToSelect = scdMappings.FactTransformationTableInfoMap(destinationTableName).allColumns
    var selectDF = sourceDF.select(columnsToSelect.head, columnsToSelect.tail: _*).dropDuplicates(primaryKeyColumnName)
    selectDF.createOrReplaceTempView(incomingTableName)

    spark.sql(integrityQuery).dropDuplicates(primaryKeyColumnName).sortWithinPartitions(primaryKeyColumnName)
  }
  // @formatter:on
}

/** Companion object for SCDDeltaUpsertDataFrameProcessor.
  */
object SCDDeltaUpsertDataFrameProcessor {

  /** Constructor.
    *
    * @param spark
    *   The SparkSession object.
    * @param scdMappings
    *   The SCD mappings.
    * @return
    *   A new SCDDeltaUpsertDataFrameProcessor.
    */
  def apply(
      spark: SparkSession,
      scdMappings: SCDTransformationMetadataMappings
  ): SCDDeltaUpsertDataFrameProcessor =
    new SCDDeltaUpsertDataFrameProcessor(
      spark = spark,
      upserter = new DeltaUpserter(spark),
      scdMappings = scdMappings
    )
}
