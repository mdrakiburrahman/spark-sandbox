package me.rakirahman.sparkdemo.etl

import me.rakirahman.etl.execution.stateless.SequencerExtensions._
import me.rakirahman.etl.schema.openlineage.v1._
import me.rakirahman.etl.transformer.extensions.DataFrameArrayExtensions._
import me.rakirahman.sparkdemo.etl.loader.silver.openlineage._

import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.types.{ArrayType, StructType}

import org.scalatest.CancelAfterFailure
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers

class OpenLineageIntegrationTest extends AnyFunSpec with Matchers with CancelAfterFailure {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .getOrCreate()

  describe("OpenLineageConstantGenerators") {

    it("should infer a non-empty schema from the sample JSON") {
      val schema = OpenLineageConstantGenerators.getSchema(spark)
      assert(schema.fields.nonEmpty, "Schema should have fields")
      assert(
        schema.fieldNames.contains("eventType"),
        "Schema should contain eventType"
      )
      assert(
        schema.fieldNames.contains("eventTime"),
        "Schema should contain eventTime"
      )
      assert(
        schema.fieldNames.contains("run"),
        "Schema should contain run"
      )
      assert(
        schema.fieldNames.contains("job"),
        "Schema should contain job"
      )
    }

    it("should return a valid sample JSON") {
      val sample = OpenLineageConstantGenerators.getSchemaSample(spark)
      assert(sample.nonEmpty, "Sample should not be empty")
      assert(sample.contains("eventType"), "Sample should contain eventType")
    }
  }

  describe("OpenLineageSilverTransformer") {

    /** Builds a sample DataFrame simulating the http_dumper_plugin table.
      *
      * @param eventType
      *   The OpenLineage event type.
      * @return
      *   The sample [[DataFrame]].
      */
    def getSampleDataFrame(
        eventType: OpenLineageEventTypes.Value
    ): DataFrame = {
      import spark.implicits._

      val sample = OpenLineageConstantGenerators
        .getSchemaSample(spark)
        .replaceFirst(
          """"eventType":"START"""",
          s""""eventType":"${eventType.toString}""""
        )

      Seq(
        (
          java.sql.Timestamp.valueOf("2026-02-22 00:21:14.61154"),
          "20260222",
          "/api/v1/lineage",
          "POST",
          sample
        )
      ).toDF(
        OpenLineageSilverTableMetadata.ColResultTimestamp,
        OpenLineageSilverTableMetadata.ColEventYearDate,
        OpenLineageSilverTableMetadata.ColRequestUri,
        OpenLineageSilverTableMetadata.ColRequestMethod,
        OpenLineageSilverTableMetadata.ColRequestBody
      )
    }

    it(
      "should transform singular OpenLineage event data samples per event type"
    ) {
      val transformer = new OpenLineageSilverTransformer

      Seq(
        OpenLineageEventTypes.START,
        OpenLineageEventTypes.COMPLETE
      ).foreach { eventType =>
        val transformed = transformer.transform(
          getSampleDataFrame(eventType)
        )

        val sequencer = transformer
          .transformBatchSequencer(transformed, 0)

        sequencer
          .getMetadata()
          .foreach { case (tableName, df) =>
            if (eventType.toString == tableName) {
              assert(
                !df.isEmpty,
                s"Expected non-empty DataFrame for ${tableName}"
              )
              assert(
                df.count() == 1,
                s"Expected exactly 1 row for ${tableName}"
              )
            } else {
              assert(df.isEmpty, s"Expected empty DataFrame for ${tableName}")
            }
          }
      }
    }

    it("should produce a flattened schema with no nested StructTypes") {
      val transformer = new OpenLineageSilverTransformer

      val transformed = transformer.transform(
        getSampleDataFrame(OpenLineageEventTypes.START)
      )

      val result = transformer
        .transformBatchSequencer(transformed, 0)
        .getMetadata()
        .values
        .filter(!_.isEmpty)
        .toArray
        .unionWithMergedSchema()

      result.schema.fields.foreach { field =>
        assert(
          !field.dataType.isInstanceOf[StructType],
          s"Column '${field.name}' should not be a StructType, found: ${field.dataType}"
        )
      }

      result.schema.fields.foreach { field =>
        assert(
          !field.dataType.isInstanceOf[ArrayType],
          s"Column '${field.name}' should not be an ArrayType, found: ${field.dataType}"
        )
      }

      // Exploded inputs columns should be present
      val cols = result.columns.toSet
      Seq(
        "inputs_name",
        "inputs_namespace",
        "inputs_facets_dataSource_name",
        "inputs_facets_dataSource_uri"
      ).foreach { expectedCol =>
        assert(
          cols.contains(expectedCol),
          s"Expected column '${expectedCol}' from exploded inputs, found columns: ${cols.mkString(", ")}"
        )
      }

      // Exploded outputs columns should be present
      Seq(
        "outputs_name",
        "outputs_namespace",
        "outputs_facets_dataSource_name",
        "outputs_facets_version_datasetVersion",
        "outputs_facets_storage_storageLayer",
        "outputs_facets_storage_fileFormat"
      ).foreach { expectedCol =>
        assert(
          cols.contains(expectedCol),
          s"Expected column '${expectedCol}' from exploded outputs, found columns: ${cols.mkString(", ")}"
        )
      }

      // inputs_Json and outputs_Json should NOT be present (arrays are exploded, not jsonized)
      assert(
        !cols.contains("inputs_Json"),
        "inputs_Json should not exist — inputs should be exploded and flattened"
      )
      assert(
        !cols.contains("outputs_Json"),
        "outputs_Json should not exist — outputs should be exploded and flattened"
      )
    }

    it("should transform all event types and union into a wide table") {
      val transformer = new OpenLineageSilverTransformer

      val allInputDFs = Seq(
        OpenLineageEventTypes.START,
        OpenLineageEventTypes.COMPLETE
      ).map(getSampleDataFrame)

      val unionedInput = allInputDFs.reduce(_ union _)
      val transformed = transformer.transform(unionedInput)

      val result = transformer.transformBatch(transformed, 0)
      val expectedTotalRows = 2

      assert(
        result.count() == expectedTotalRows,
        s"Expected ${expectedTotalRows} rows, got ${result.count()}"
      )

      assert(
        result
          .select(OpenLineageSilverTableMetadata.ColEventType)
          .distinct()
          .count() == expectedTotalRows,
        "Expected distinct event types"
      )
    }

    it("should carry result_timestamp and event_year_date into output") {
      val transformer = new OpenLineageSilverTransformer

      val transformed = transformer.transform(
        getSampleDataFrame(OpenLineageEventTypes.START)
      )

      val result = transformer
        .transformBatchSequencer(transformed, 0)
        .getMetadata()
        .values
        .filter(!_.isEmpty)
        .toArray
        .unionWithMergedSchema()

      assert(
        result.columns.contains(
          OpenLineageSilverTableMetadata.ColResultTimestamp
        ),
        "Output should contain result_timestamp"
      )
      assert(
        result.columns.contains(
          OpenLineageSilverTableMetadata.ColEventYearDate
        ),
        "Output should contain event_year_date"
      )
    }

    it("should NOT carry request_uri or request_method into output") {
      val transformer = new OpenLineageSilverTransformer

      val transformed = transformer.transform(
        getSampleDataFrame(OpenLineageEventTypes.START)
      )

      val result = transformer
        .transformBatchSequencer(transformed, 0)
        .getMetadata()
        .values
        .filter(!_.isEmpty)
        .toArray
        .unionWithMergedSchema()

      assert(
        !result.columns.contains(
          OpenLineageSilverTableMetadata.ColRequestUri
        ),
        "Output should NOT contain request_uri"
      )
      assert(
        !result.columns.contains(
          OpenLineageSilverTableMetadata.ColRequestMethod
        ),
        "Output should NOT contain request_method"
      )
    }

    it("should filter out non-OpenLineage events") {
      import spark.implicits._
      val transformer = new OpenLineageSilverTransformer

      val nonOpenLineageDf = Seq(
        (
          java.sql.Timestamp.valueOf("2026-02-22 00:21:14.61154"),
          "20260222",
          "/some/other/endpoint",
          "GET",
          """{"foo":"bar"}"""
        )
      ).toDF(
        OpenLineageSilverTableMetadata.ColResultTimestamp,
        OpenLineageSilverTableMetadata.ColEventYearDate,
        OpenLineageSilverTableMetadata.ColRequestUri,
        OpenLineageSilverTableMetadata.ColRequestMethod,
        OpenLineageSilverTableMetadata.ColRequestBody
      )

      val transformed = transformer.transform(nonOpenLineageDf)
      assert(
        transformed.isEmpty,
        "Non-OpenLineage events should be filtered out"
      )
    }
  }
}
