package me.rakirahman.sparkdemo.etl.loader.silver.openlineage

import me.rakirahman.etl.execution.stateless._
import me.rakirahman.etl.execution.stateless.SequencerExtensions._
import me.rakirahman.etl.loader.DataLoader
import me.rakirahman.etl.reader.DataReader
import me.rakirahman.etl.schema.openlineage.v1._
import me.rakirahman.etl.transformer.DataTransformer
import me.rakirahman.etl.transformer.extensions.DataFrameArrayExtensions._
import me.rakirahman.etl.transformer.extensions.DataFrameExtensions._
import me.rakirahman.feeds.schema.extensions.SchemaExtensions._

import org.apache.spark.sql._
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types.ArrayType

/** Configuration for the OpenLineage Silver output.
  *
  * @param table
  *   The name of the table being output.
  * @param partitions
  *   The array of partition columns.
  */
case class OpenLineageSilverResourceConfig(
    table: String,
    partitions: Array[String]
)

// @formatter:off
/** Metadata for OpenLineage columnar processing in the Silver zone.
  */
object OpenLineageSilverTableMetadata {

  val TableSilverOpenLineage: String   = "openlineage"

  val ColRequestBody: String           = "request_body"
  val ColResultTimestamp: String       = "result_timestamp"
  val ColEventYearDate: String         = "event_year_date"
  val ColParsed: String                = "parsed"
  val ColEventType: String             = "eventType"
  val ColSilverIngestTime: String      = "silver_ingest_time"

  val OutputPartitions: Array[String]  = Array(ColEventYearDate)
}
// @formatter:on

/** Transforms OpenLineage RunEvent data from raw JSON into columnar format.
  */
class OpenLineageSilverTransformer extends DataTransformer {

  /** @inheritdoc
    *
    * Initial transform: renames the raw JSON column, parses it, and derives timestamp columns.
    */
  def transform(inDF: DataFrame): DataFrame = {
    val schema = OpenLineageConstantGenerators.getSchema(inDF.sparkSession)

    inDF
      .withColumn(
        OpenLineageSilverTableMetadata.ColParsed,
        from_json(
          col(OpenLineageSilverTableMetadata.ColRequestBody),
          schema
        )
      )
      .withColumn(
        OpenLineageSilverTableMetadata.ColResultTimestamp,
        col(s"${OpenLineageSilverTableMetadata.ColParsed}.eventTime").cast("timestamp")
      )
      .withColumn(
        OpenLineageSilverTableMetadata.ColEventYearDate,
        date_format(col(OpenLineageSilverTableMetadata.ColResultTimestamp), "yyyyMMdd")
      )
      .select(
        col(OpenLineageSilverTableMetadata.ColRequestBody),
        col(OpenLineageSilverTableMetadata.ColResultTimestamp),
        col(OpenLineageSilverTableMetadata.ColEventYearDate),
        col(s"${OpenLineageSilverTableMetadata.ColParsed}.*")
      )
  }

  /** @inheritdoc
    */
  override def transformBatch(inDF: DataFrame, batchId: Long): DataFrame = this
    .transformBatchSequencer(inDF, batchId)
    .getMetadata()
    .values
    .toArray
    .unionWithMergedSchema()
    .transform(withReadOptimizedFilesGenerated())

  /** @inheritdoc
    *
    * For each [[OpenLineageEventTypes]], filters, flattens, and jsonizes arrays independently, then they are merged via [[unionWithMergedSchema]].
    */
  override def transformBatchSequencer(
      inDF: DataFrame,
      batchId: Long
  ): Sequencer[DataFrame] = {
    Sequencer(
      OpenLineageEventTypes.values.toSeq.map { eventType =>
        Job(
          Seq(
            Action(
              eventType.toString,
              inDF
                .transform(withEventTypeFiltered(eventType))
                .transform(withArraysExploded())
                .transform(withSchemaFlattened())
                .withJsonizedArrays("_Json", true)
                .transform(withTimestampCasted())
                .withColumn(
                  OpenLineageSilverTableMetadata.ColSilverIngestTime,
                  current_timestamp()
                )
                .sortColumnsAlphabetically(),
              maxRetries = 5
            )
          )
        )
      }
    )
  }

  /** Filters by OpenLineage event type.
    */
  private def withEventTypeFiltered(
      eventType: OpenLineageEventTypes.EventTypes
  )(inDF: DataFrame): DataFrame = inDF
    .filter(
      col(OpenLineageSilverTableMetadata.ColEventType) ===
        eventType.toString
    )

  /** Explodes top-level array columns using `explode_outer` so their struct elements can be flattened.
    */
  private def withArraysExploded()(inDF: DataFrame): DataFrame = {
    val arrayCols = inDF.schema.fields.collect {
      case f if f.dataType.isInstanceOf[ArrayType] => f.name
    }
    arrayCols.foldLeft(inDF) { (df, colName) =>
      df.withColumn(colName, explode_outer(col(colName)))
    }
  }

  /** Flattens the DataFrame schema recursively.
    */
  private def withSchemaFlattened()(inDF: DataFrame): DataFrame =
    inDF.select(inDF.flattenedSchema(inDF.schema): _*)

  /** Casts well-known timestamp columns, if present.
    */
  private def withTimestampCasted()(inDF: DataFrame): DataFrame =
    inDF.columns.toSet
      .intersect(Set("eventTime"))
      .foldLeft(inDF) { (df, colName) =>
        df.withColumn(colName, col(colName).cast("timestamp"))
      }

  /** Repartitions for read-optimized file generation.
    */
  private def withReadOptimizedFilesGenerated()(inDF: DataFrame): DataFrame =
    inDF
      .repartition(1)
      .orderBy(
        OpenLineageSilverTableMetadata.ColEventType,
        OpenLineageSilverTableMetadata.ColEventYearDate
      )
}

/** Reads OpenLineage JSONL files as a stream with archive-on-read.
  *
  * @param spark
  *   The SparkSession.
  * @param sourcePath
  *   The directory containing JSONL files.
  * @param archivePath
  *   The directory to archive processed files.
  */
class OpenLineageSilverReader(
    spark: SparkSession,
    sourcePath: String,
    archivePath: String
) extends DataReader {

  /** @inheritdoc
    */
  def read(): DataFrame = {
    spark.readStream
      .format("text")
      .option("pathGlobFilter", "*.json")
      .option("cleanSource", "archive")
      .option("sourceArchiveDir", archivePath)
      .load(sourcePath)
      .withColumnRenamed("value", OpenLineageSilverTableMetadata.ColRequestBody)
  }
}

/** Loader for OpenLineage data.
  *
  * @param reader
  *   Reader to use when loading source tables.
  * @param transformer
  *   The transformer to use when transforming data.
  */
class OpenLineageSilverLoader(
    reader: OpenLineageSilverReader,
    transformer: OpenLineageSilverTransformer
) extends DataLoader {

  /** @inheritdoc
    */
  override def load(): DataFrame = transformer.transform(reader.read())
}

/** Companion object for [[OpenLineageSilverLoader]].
  */
object OpenLineageSilverLoader {

  /** Constructor.
    *
    * @param spark
    *   The [[SparkSession]].
    * @param sourcePath
    *   The source JSONL directory path.
    * @param archivePath
    *   The archive directory path.
    * @return
    *   The [[OpenLineageSilverLoader]].
    */
  def apply(
      spark: SparkSession,
      sourcePath: String,
      archivePath: String
  ): OpenLineageSilverLoader = new OpenLineageSilverLoader(
    new OpenLineageSilverReader(spark, sourcePath, archivePath),
    new OpenLineageSilverTransformer
  )
}
