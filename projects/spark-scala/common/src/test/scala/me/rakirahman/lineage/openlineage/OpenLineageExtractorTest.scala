package me.rakirahman.lineage.openlineage

import me.rakirahman.lineage._
import me.rakirahman.lineage.diagram.DiagramOrientation
import me.rakirahman.metastore.sql.SqlMetastoreOperations

import org.apache.spark.sql.{Row, SparkSession}
import org.apache.spark.sql.types._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class OpenLineageExtractorTest extends AnyFunSpec with Matchers {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
    .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
    .config("spark.sql.warehouse.dir", s"/tmp/OpenLineageExtractorTest-${System.currentTimeMillis}/warehouse")
    .config("spark.driver.host", "localhost")
    .config("spark.ui.enabled", "false")
    .getOrCreate()

  val schema: StructType = StructType(
    Seq(
      StructField("eventType", StringType, nullable = true),
      StructField("inputs_name", StringType, nullable = true),
      StructField("inputs_namespace", StringType, nullable = true),
      StructField("outputs_name", StringType, nullable = true),
      StructField("outputs_namespace", StringType, nullable = true),
      StructField("job_name", StringType, nullable = true),
      StructField("job_namespace", StringType, nullable = true),
      StructField("request_body", StringType, nullable = true),
      StructField("event_year_date", StringType, nullable = true),
      StructField("eventTime", StringType, nullable = true)
    )
  )

  // OpenLineage event JSON: source_a → etl_job_1 → intermediate_b (with column lineage)
  val event1Json: String =
    """{
      |  "eventTime": "2026-02-25T15:30:00Z",
      |  "producer": "test-producer",
      |  "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json",
      |  "eventType": "COMPLETE",
      |  "run": {"runId": "run-001"},
      |  "job": {"namespace": "default", "name": "etl_job_1"},
      |  "inputs": [
      |    {
      |      "namespace": "file",
      |      "name": "/data/source_a",
      |      "facets": {
      |        "schema": {
      |          "fields": [
      |            {"name": "id", "type": "integer", "description": "Primary key"},
      |            {"name": "name", "type": "string", "description": "User name"}
      |          ]
      |        }
      |      }
      |    }
      |  ],
      |  "outputs": [
      |    {
      |      "namespace": "file",
      |      "name": "/data/warehouse/test.db/intermediate_b",
      |      "facets": {
      |        "schema": {
      |          "fields": [
      |            {"name": "id", "type": "integer", "description": "Primary key"},
      |            {"name": "name", "type": "string", "description": "User name"},
      |            {"name": "processed_at", "type": "timestamp", "description": null}
      |          ]
      |        },
      |        "columnLineage": {
      |          "fields": {
      |            "id": {
      |              "inputFields": [
      |                {
      |                  "namespace": "file",
      |                  "name": "/data/source_a",
      |                  "field": "id",
      |                  "transformations": [{"type": "DIRECT", "subtype": "IDENTITY"}]
      |                }
      |              ]
      |            },
      |            "name": {
      |              "inputFields": [
      |                {
      |                  "namespace": "file",
      |                  "name": "/data/source_a",
      |                  "field": "name",
      |                  "transformations": [{"type": "DIRECT", "subtype": "IDENTITY"}]
      |                }
      |              ]
      |            }
      |          }
      |        }
      |      }
      |    }
      |  ]
      |}""".stripMargin

  // OpenLineage event JSON: intermediate_b → etl_job_2 → target_c (with column lineage)
  val event2Json: String =
    """{
      |  "eventTime": "2026-02-25T16:00:00Z",
      |  "producer": "test-producer",
      |  "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json",
      |  "eventType": "COMPLETE",
      |  "run": {"runId": "run-002"},
      |  "job": {"namespace": "default", "name": "etl_job_2"},
      |  "inputs": [
      |    {
      |      "namespace": "file",
      |      "name": "/data/warehouse/test.db/intermediate_b",
      |      "facets": {
      |        "schema": {
      |          "fields": [
      |            {"name": "id", "type": "integer", "description": "Primary key"},
      |            {"name": "name", "type": "string", "description": "User name"},
      |            {"name": "processed_at", "type": "timestamp", "description": null}
      |          ]
      |        }
      |      }
      |    }
      |  ],
      |  "outputs": [
      |    {
      |      "namespace": "file",
      |      "name": "/data/warehouse/test.db/target_c",
      |      "facets": {
      |        "schema": {
      |          "fields": [
      |            {"name": "id", "type": "integer", "description": "Primary key"},
      |            {"name": "full_name", "type": "string", "description": "Transformed name"}
      |          ]
      |        },
      |        "columnLineage": {
      |          "fields": {
      |            "id": {
      |              "inputFields": [
      |                {
      |                  "namespace": "file",
      |                  "name": "/data/warehouse/test.db/intermediate_b",
      |                  "field": "id",
      |                  "transformations": [{"type": "DIRECT", "subtype": "IDENTITY"}]
      |                }
      |              ]
      |            },
      |            "full_name": {
      |              "inputFields": [
      |                {
      |                  "namespace": "file",
      |                  "name": "/data/warehouse/test.db/intermediate_b",
      |                  "field": "name",
      |                  "transformations": [{"type": "INDIRECT", "subtype": "TRANSFORMATION"}]
      |                }
      |              ]
      |            }
      |          }
      |        }
      |      }
      |    }
      |  ]
      |}""".stripMargin

  private def buildTestDf() = {
    val rows = Seq(
      // Event 1: COMPLETE - source_a → etl_job_1 → intermediate_b
      Row("COMPLETE", "/data/source_a", "file", "/data/warehouse/test.db/intermediate_b", "file", "etl_job_1", "default", event1Json, "20260225", "2026-02-25T15:30:00Z"),
      // Event 2: COMPLETE - intermediate_b → etl_job_2 → target_c
      Row(
        "COMPLETE",
        "/data/warehouse/test.db/intermediate_b",
        "file",
        "/data/warehouse/test.db/target_c",
        "file",
        "etl_job_2",
        "default",
        event2Json,
        "20260225",
        "2026-02-25T16:00:00Z"
      ),
      // Event 3: START - should be filtered out
      Row("START", "/data/source_a", "file", "/data/warehouse/test.db/intermediate_b", "file", "etl_job_1", "default", null, "20260225", "2026-02-25T15:29:00Z"),
      // Event 4: COMPLETE but NULL inputs - should be filtered from table lineage
      Row("COMPLETE", null, null, "/data/warehouse/test.db/target_c", "file", "etl_job_2", "default", null, "20260225", "2026-02-25T16:01:00Z")
    )
    spark.createDataFrame(spark.sparkContext.parallelize(rows), schema)
  }

  describe("OpenLineageExtractor") {

    describe("table-level lineage") {
      it("should extract table lineage edges from COMPLETE events") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        lineage.tableEdges should have length 2

        val edge1 = lineage.tableEdges.find(_.jobName == "etl_job_1")
        edge1 shouldBe defined
        edge1.get.source shouldBe DatasetIdentifier("file", "/data/source_a")
        edge1.get.target shouldBe DatasetIdentifier("file", "/data/warehouse/test.db/intermediate_b")

        val edge2 = lineage.tableEdges.find(_.jobName == "etl_job_2")
        edge2 shouldBe defined
        edge2.get.source shouldBe DatasetIdentifier("file", "/data/warehouse/test.db/intermediate_b")
        edge2.get.target shouldBe DatasetIdentifier("file", "/data/warehouse/test.db/target_c")
      }

      it("should filter out START events") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        // Only COMPLETE events contribute to table lineage
        lineage.tableEdges.forall(_.jobNamespace == "default") shouldBe true
        lineage.tableEdges should have length 2
      }

      it("should filter out rows with NULL inputs") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        // No edge should have null source
        lineage.tableEdges.foreach { edge =>
          edge.source.name should not be null
          edge.source.namespace should not be null
        }
      }
    }

    describe("column-level lineage") {
      it("should extract column lineage edges from request_body JSON") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        // Event 1: id and name from source_a → intermediate_b
        // Event 2: id and full_name from intermediate_b → target_c
        lineage.columnEdges.length should be >= 4

        // Verify source_a.id → intermediate_b.id
        val idEdge = lineage.columnEdges.find(e =>
          e.sourceField == "id" &&
            e.sourceDataset.name == "/data/source_a" &&
            e.targetDataset.name == "/data/warehouse/test.db/intermediate_b"
        )
        idEdge shouldBe defined
        idEdge.get.targetField shouldBe "id"
        idEdge.get.transformationType shouldBe "DIRECT"
        idEdge.get.transformationSubtype shouldBe "IDENTITY"
      }

      it("should capture transformation types") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        // Event 2: intermediate_b.name → target_c.full_name (INDIRECT/TRANSFORMATION)
        val transformEdge = lineage.columnEdges.find(e => e.targetField == "full_name" && e.targetDataset.name == "/data/warehouse/test.db/target_c")
        transformEdge shouldBe defined
        transformEdge.get.sourceField shouldBe "name"
        transformEdge.get.transformationType shouldBe "INDIRECT"
        transformEdge.get.transformationSubtype shouldBe "TRANSFORMATION"
      }
    }

    describe("dataset roles") {
      it("should correctly assign Source, Intermediate, and Target roles") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        val datasetsByName = lineage.datasets.map(d => d.identifier.name -> d).toMap

        datasetsByName("/data/source_a").role shouldBe DatasetRole.Source
        datasetsByName("/data/warehouse/test.db/intermediate_b").role shouldBe DatasetRole.Intermediate
        datasetsByName("/data/warehouse/test.db/target_c").role shouldBe DatasetRole.Target
      }

      it("should derive shortName from dataset name") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        val datasetsByName = lineage.datasets.map(d => d.identifier.name -> d).toMap

        // Paths with .db should use from that segment onward
        datasetsByName("/data/warehouse/test.db/intermediate_b").shortName shouldBe "test.db/intermediate_b"
        datasetsByName("/data/warehouse/test.db/target_c").shortName shouldBe "test.db/target_c"

        // Paths without .db use last 2 segments
        datasetsByName("/data/source_a").shortName shouldBe "data/source_a"
      }
    }

    describe("schema extraction") {
      it("should extract schema fields from request_body") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        val targetDataset = lineage.datasets.find(_.identifier.name == "/data/warehouse/test.db/target_c")
        targetDataset shouldBe defined
        targetDataset.get.schema should not be empty

        val idField = targetDataset.get.schema.find(_.name == "id")
        idField shouldBe defined
        idField.get.fieldType shouldBe "integer"
      }
    }

    describe("empty data") {
      it("should return empty lineage when no COMPLETE events exist") {
        val rows = Seq(
          Row("START", "/data/source", "file", "/data/target", "file", "job1", "default", null, "20260225", "2026-02-25T15:00:00Z")
        )
        val df = spark.createDataFrame(spark.sparkContext.parallelize(rows), schema)
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        lineage.tableEdges shouldBe empty
        lineage.datasets shouldBe empty
      }

      it("should return empty lineage when DataFrame is completely empty") {
        val df = spark.createDataFrame(spark.sparkContext.emptyRDD[Row], schema)
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        lineage.tableEdges shouldBe empty
        lineage.columnEdges shouldBe empty
        lineage.datasets shouldBe empty
      }
    }

    describe("mermaid generation") {
      it("should generate valid mermaid with graph LR header") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val mermaid = extractor.getLineageAsMermaid()

        mermaid should startWith("graph LR\n")
        mermaid should include("%% Table Lineage")
      }

      it("should contain dataset nodes with shortName labels") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val mermaid = extractor.getLineageAsMermaid()

        mermaid should include("data/source_a")
        mermaid should include("test.db/intermediate_b")
        mermaid should include("test.db/target_c")
      }

      it("should contain edges between datasets") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val mermaid = extractor.getLineageAsMermaid()

        mermaid should include("-->")
        // Should have at least 2 edges (source→intermediate, intermediate→target)
        mermaid.split("-->").length should be >= 3
      }

      it("should apply correct CSS classes for dataset roles") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val mermaid = extractor.getLineageAsMermaid()

        mermaid should include("classDef source fill:#ccffcc")
        mermaid should include("classDef intermediate fill:#ffffcc")
        mermaid should include("classDef target fill:#ffcccc")
      }

      it("should support TopDown orientation") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val mermaid = extractor.getLineageAsMermaid(
          diagramTitle = "Custom Title",
          diagramOrientation = DiagramOrientation.TopDown
        )

        mermaid should startWith("graph TD\n")
        mermaid should include("%% Custom Title")
      }

      it("should generate minimal mermaid for empty lineage") {
        val df = spark.createDataFrame(spark.sparkContext.emptyRDD[Row], schema)
        val extractor = OpenLineageExtractor(spark, df)
        val mermaid = extractor.getLineageAsMermaid()

        mermaid should startWith("graph LR\n")
        mermaid should include("No lineage data found")
      }

      it("should sanitize node names by removing special characters") {
        OpenLineageExtractor.sanitizeNodeName("file::/data/table") shouldBe "file_data_table"
        OpenLineageExtractor.sanitizeNodeName("123-test") shouldBe "T123_test"
      }

      it("should filter lineage for a specific dataset") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        val filtered = OpenLineageExtractor.filterLineageForDataset(lineage, "target_c")

        filtered.tableEdges should have length 1
        filtered.tableEdges.head.target.name shouldBe "/data/warehouse/test.db/target_c"
      }

      it("should generate mermaid from filtered lineage via static toMermaid") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        val lineage = extractor.getLineage()

        val filtered = OpenLineageExtractor.filterLineageForDataset(lineage, "target_c")
        val mermaid = OpenLineageExtractor.toMermaid(filtered, "Lineage for target_c")

        mermaid should include("%% Lineage for target_c")
        mermaid should include("test.db/target_c")
        mermaid should include("-->")
      }

      it("should include standalone dataset nodes not in lineage") {
        val lineage = OpenLineageLineage(
          tableEdges = Seq(
            TableLineageEdge(
              source = DatasetIdentifier("file", "/data/source_a"),
              target = DatasetIdentifier("file", "/data/target_b"),
              jobName = "job1",
              jobNamespace = "default"
            )
          ),
          columnEdges = Seq.empty,
          datasets = Seq.empty
        )
        val mermaid = OpenLineageExtractor.toMermaid(
          lineage,
          standaloneDatasets = Seq("standalone_table")
        )
        mermaid should include("standalone_table")
        mermaid should include("classDef standalone")
        mermaid should include("class standalone_table standalone")
      }

      it("should deduplicate edges with same source and target") {
        val edge = TableLineageEdge(
          source = DatasetIdentifier("file", "/data/a"),
          target = DatasetIdentifier("file", "/data/b"),
          jobName = "job1",
          jobNamespace = "default"
        )
        val lineage = OpenLineageLineage(
          tableEdges = Seq(edge, edge.copy(jobName = "job2")),
          columnEdges = Seq.empty,
          datasets = Seq.empty
        )
        val mermaid = OpenLineageExtractor.toMermaid(lineage)
        // Should have exactly 1 edge despite 2 edges with same source/target
        mermaid.split(" --> ").length shouldBe 2
      }

      it("should not add standalone node when it matches a lineage node after normalization") {
        val lineage = OpenLineageLineage(
          tableEdges = Seq(
            TableLineageEdge(
              source = DatasetIdentifier("file", "demo_etl.db/products"),
              target = DatasetIdentifier("file", "demo_etl.db/enriched"),
              jobName = "job1",
              jobNamespace = "default"
            )
          ),
          columnEdges = Seq.empty,
          datasets = Seq.empty
        )
        val mermaid = OpenLineageExtractor.toMermaid(
          lineage,
          standaloneDatasets = Seq("demo_etl.products")
        )
        // "demo_etl.products" normalizes to same as "demo_etl.db/products" so should not appear as standalone
        mermaid should not include "class demo_etl_products standalone"
      }
    }

    describe("shortDatasetName") {
      it("should return name unchanged when it contains no slashes") {
        OpenLineageExtractor.shortDatasetName("simple_table") shouldBe "simple_table"
      }
    }

    describe("normalizeLocationPath") {
      it("should strip file: prefix and trailing slashes") {
        OpenLineageExtractor.normalizeLocationPath("file:/data/table/") shouldBe "/data/table"
        OpenLineageExtractor.normalizeLocationPath("/data/table") shouldBe "/data/table"
        OpenLineageExtractor.normalizeLocationPath("file:/warehouse/none/my_table///") shouldBe "/warehouse/none/my_table"
      }
    }

    describe("normalizeDatasetName") {
      it("should convert .db/ to dot and / to dot") {
        OpenLineageExtractor.normalizeDatasetName("demo_etl.db/customers") shouldBe "demo_etl.customers"
        OpenLineageExtractor.normalizeDatasetName("dbt_seed/customer") shouldBe "dbt_seed.customer"
      }
    }

    describe("resolveDatasetNames") {
      it("should resolve dataset names using a location map") {
        val lineage = OpenLineageLineage(
          tableEdges = Seq(
            TableLineageEdge(
              source = DatasetIdentifier("file", "file:/warehouse/none/source_table/"),
              target = DatasetIdentifier("file", "file:/warehouse/none/target_table/"),
              jobName = "job1",
              jobNamespace = "default"
            )
          ),
          columnEdges = Seq(
            ColumnLineageEdge(
              sourceDataset = DatasetIdentifier("file", "file:/warehouse/none/source_table/"),
              sourceField = "id",
              targetDataset = DatasetIdentifier("file", "file:/warehouse/none/target_table/"),
              targetField = "id",
              transformationType = "DIRECT",
              transformationSubtype = "IDENTITY"
            )
          ),
          datasets = Seq(
            LineageDataset(
              identifier = DatasetIdentifier("file", "file:/warehouse/none/source_table/"),
              shortName = "none/source_table",
              schema = Seq.empty,
              role = DatasetRole.Source
            ),
            LineageDataset(
              identifier = DatasetIdentifier("file", "file:/warehouse/none/target_table/"),
              shortName = "none/target_table",
              schema = Seq.empty,
              role = DatasetRole.Target
            )
          )
        )

        val locationMap = Map(
          "/warehouse/none/source_table" -> "my_db.source_table",
          "/warehouse/none/target_table" -> "my_db.target_table"
        )

        val resolved = OpenLineageExtractor.resolveDatasetNames(lineage, locationMap)

        resolved.tableEdges.head.source.name shouldBe "my_db.source_table"
        resolved.tableEdges.head.target.name shouldBe "my_db.target_table"
        resolved.columnEdges.head.sourceDataset.name shouldBe "my_db.source_table"
        resolved.columnEdges.head.targetDataset.name shouldBe "my_db.target_table"
        resolved.datasets.find(_.identifier.name == "my_db.source_table") shouldBe defined
        resolved.datasets.find(_.identifier.name == "my_db.target_table") shouldBe defined
      }

      it("should leave unresolved datasets unchanged") {
        val lineage = OpenLineageLineage(
          tableEdges = Seq(
            TableLineageEdge(
              source = DatasetIdentifier("file", "/unknown/path"),
              target = DatasetIdentifier("file", "/known/path"),
              jobName = "job1",
              jobNamespace = "default"
            )
          ),
          columnEdges = Seq.empty,
          datasets = Seq(
            LineageDataset(
              identifier = DatasetIdentifier("file", "/unknown/path"),
              shortName = "unknown/path",
              schema = Seq.empty,
              role = DatasetRole.Source
            )
          )
        )

        val locationMap = Map("/known/path" -> "my_db.known_table")
        val resolved = OpenLineageExtractor.resolveDatasetNames(lineage, locationMap)

        resolved.tableEdges.head.source.name shouldBe "/unknown/path"
        resolved.tableEdges.head.target.name shouldBe "my_db.known_table"
      }
    }

    describe("OpenLineageLineage.empty") {
      it("should have empty sequences") {
        val emptyLineage = OpenLineageLineage.empty
        emptyLineage.tableEdges should have length 0
        emptyLineage.columnEdges should have length 0
        emptyLineage.datasets should have length 0
      }
    }

    describe("error handling") {
      it("should return empty results when underlying SQL queries fail") {
        val df = buildTestDf()
        val extractor = OpenLineageExtractor(spark, df)
        // Drop the temp view so all SQL queries will fail
        spark.catalog.dropTempView("openlineage_lineage_source")

        val lineage = extractor.getLineage()
        lineage.tableEdges shouldBe empty
        lineage.columnEdges shouldBe empty
        lineage.datasets shouldBe empty
      }
    }

    describe("buildLocationMap") {
      it("should map table locations to database.table names") {
        val testDb = "test_ol_extractor_db"
        spark.sql(s"CREATE DATABASE IF NOT EXISTS $testDb")
        spark.sql(s"CREATE TABLE IF NOT EXISTS $testDb.test_table (id INT, name STRING) USING delta")

        val metastoreOps = SqlMetastoreOperations(spark)
        val allTables = Map(testDb -> Array("test_table"))

        val locationMap = OpenLineageExtractor.buildLocationMap(metastoreOps, allTables)

        locationMap.values should contain(s"$testDb.test_table")

        spark.sql(s"DROP TABLE IF EXISTS $testDb.test_table")
        spark.sql(s"DROP DATABASE IF EXISTS $testDb")
      }

      it("should skip tables that fail to describe") {
        val metastoreOps = SqlMetastoreOperations(spark)
        val allTables = Map("nonexistent_db" -> Array("nonexistent_table"))

        val locationMap = OpenLineageExtractor.buildLocationMap(metastoreOps, allTables)
        locationMap shouldBe empty
      }
    }
  }
}
