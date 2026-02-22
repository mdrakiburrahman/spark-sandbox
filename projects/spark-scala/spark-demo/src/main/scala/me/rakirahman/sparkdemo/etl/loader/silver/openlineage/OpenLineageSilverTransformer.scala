package me.rakirahman.sparkdemo.etl.loader.silver.openlineage

import me.rakirahman.config.EnvironmentConfiguration
import me.rakirahman.etl.execution.stateless._
import me.rakirahman.etl.execution.stateless.SequencerExtensions._
import me.rakirahman.etl.loader.DataLoader
import me.rakirahman.etl.loader.generic.GenericDataLoaderMetadata
import me.rakirahman.etl.reader.DataReader
import me.rakirahman.etl.schema.openlineage.v1._
import me.rakirahman.etl.transformer.DataTransformer
import me.rakirahman.etl.transformer.extensions.DataFrameArrayExtensions._
import me.rakirahman.etl.transformer.extensions.DataFrameExtensions._
import me.rakirahman.feeds.schema.extensions.SchemaExtensions._

import org.apache.spark.sql._
import org.apache.spark.sql.functions._

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

  val TableBronzeSource: String        = "http_dumper_plugin"
  val TableSilverOpenLineage: String   = "openlineage"

  val ColRequestBody: String           = "request_body"
  val ColRequestUri: String            = "request_uri"
  val ColRequestMethod: String         = "request_method"
  val ColResultTimestamp: String       = "result_timestamp"
  val ColEventYearDate: String         = "event_year_date"
  val ColParsed: String                = "parsed"
  val ColEventType: String             = "eventType"
  val ColSilverIngestTime: String      = "silver_ingest_time"

  val OpenLineageUri: String           = "/api/v1/lineage"
  val OpenLineageMethod: String        = "POST"

  val OutputPartitions: Array[String]  = Array(ColEventYearDate)
}
// @formatter:on

/** Transforms OpenLineage RunEvent data from raw JSON into columnar format.
  */
class OpenLineageSilverTransformer extends DataTransformer {

  /** @inheritdoc
    *
    * Initial transform: selects relevant columns, filters to OpenLineage events, and parses the JSON body.
    */
  def transform(inDF: DataFrame): DataFrame = {
    inDF
      .transform(withOpenLineageEventsFiltered())
      .transform(withInitialColumnsSelected())
      .withColumn(
        OpenLineageSilverTableMetadata.ColParsed,
        from_json(
          col(OpenLineageSilverTableMetadata.ColRequestBody),
          OpenLineageConstantGenerators.getSchema(inDF.sparkSession)
        )
      )
      .select(
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

  /** Filters the input DataFrame to only OpenLineage POST /api/v1/lineage events.
    */
  private def withOpenLineageEventsFiltered()(inDF: DataFrame): DataFrame =
    inDF.filter(
      col(OpenLineageSilverTableMetadata.ColRequestUri) ===
        OpenLineageSilverTableMetadata.OpenLineageUri &&
        col(OpenLineageSilverTableMetadata.ColRequestMethod) ===
        OpenLineageSilverTableMetadata.OpenLineageMethod
    )

  /** Selects only the columns needed for processing.
    */
  private def withInitialColumnsSelected()(inDF: DataFrame): DataFrame =
    inDF.select(
      col(OpenLineageSilverTableMetadata.ColResultTimestamp),
      col(OpenLineageSilverTableMetadata.ColEventYearDate),
      col(OpenLineageSilverTableMetadata.ColRequestBody)
    )

  /** Filters by OpenLineage event type.
    */
  private def withEventTypeFiltered(
      eventType: OpenLineageEventTypes.EventTypes
  )(inDF: DataFrame): DataFrame = inDF
    .filter(
      col(OpenLineageSilverTableMetadata.ColEventType) ===
        eventType.toString
    )

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

/** Reads OpenLineage source data as a stream.
  *
  * @param spark
  *   The SparkSession.
  * @param sourceDatabase
  *   The source database name.
  */
class OpenLineageSilverReader(
    spark: SparkSession,
    sourceDatabase: String
) extends DataReader {

  /** @inheritdoc
    */
  def read(): DataFrame =
    spark.readStream
      .format("delta")
      .table(
        s"${sourceDatabase}.${OpenLineageSilverTableMetadata.TableBronzeSource}"
      )
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
    * @param sourceDatabase
    *   The source database name.
    * @return
    *   The [[OpenLineageSilverLoader]].
    */
  def apply(
      spark: SparkSession,
      sourceDatabase: String
  ): OpenLineageSilverLoader = new OpenLineageSilverLoader(
    new OpenLineageSilverReader(spark, sourceDatabase),
    new OpenLineageSilverTransformer
  )
}
