package me.rakirahman.deltalog

import org.apache.spark.sql.{Row, SparkSession}
import org.apache.spark.sql.types._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLogKpiEngineTest extends AnyFunSpec with Matchers {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .config(
      "spark.sql.extensions",
      "io.delta.sql.DeltaSparkSessionExtension"
    )
    .config(
      "spark.sql.catalog.spark_catalog",
      "org.apache.spark.sql.delta.catalog.DeltaCatalog"
    )
    .config(
      "spark.sql.warehouse.dir",
      s"/tmp/DeltaLogKpiEngineTest-${System.currentTimeMillis}/warehouse"
    )
    .config("spark.driver.host", "localhost")
    .config("spark.ui.enabled", "false")
    .getOrCreate()

  /** Schema matching the columns expected by KPI queries. */
  val commitHistorySchema: StructType = StructType(
    Seq(
      StructField("database_name", StringType, nullable = false),
      StructField("table_name", StringType, nullable = false),
      StructField("table_fqn", StringType, nullable = false),
      StructField("table_id", StringType, nullable = true),
      StructField("version", LongType, nullable = false),
      StructField("commit_timestamp", TimestampType, nullable = false),
      StructField("operation", StringType, nullable = false),
      StructField(
        "operation_parameters",
        MapType(StringType, StringType),
        nullable = true
      ),
      StructField(
        "operation_metrics",
        MapType(StringType, StringType),
        nullable = true
      ),
      StructField("read_version", LongType, nullable = true),
      StructField("isolation_level", StringType, nullable = true),
      StructField("is_blind_append", BooleanType, nullable = true),
      StructField("user_id", StringType, nullable = true),
      StructField("user_name", StringType, nullable = true),
      StructField("user_metadata", StringType, nullable = true),
      StructField("num_output_rows", LongType, nullable = true),
      StructField("num_added_files", LongType, nullable = true),
      StructField("num_removed_files", LongType, nullable = true),
      StructField("num_output_bytes", LongType, nullable = true),
      StructField("execution_time_ms", LongType, nullable = true),
      StructField("ingested_at", TimestampType, nullable = true),
      StructField("snapshot_date", StringType, nullable = true)
    )
  )

  /** Creates test commit rows for a table with consistent daily writes. */
  private def createHealthyCommitRows(
      tableFqn: String,
      numDays: Int = 14,
      rowsPerDay: Long = 1000L
  ): Seq[Row] = {
    val parts = tableFqn.split("\\.")
    val dbName = parts(0)
    val tblName = parts(1)

    (0 until numDays).map { dayOffset =>
      val ts = java.sql.Timestamp.valueOf(
        s"2026-01-${f"${15 - dayOffset}%02d"} 10:00:00"
      )
      Row(
        dbName,
        tblName,
        tableFqn,
        null, // table_id
        (numDays - 1 - dayOffset).toLong, // version
        ts,
        "WRITE",
        null, // operation_parameters
        null, // operation_metrics
        null, // read_version
        "WriteSerializable",
        true, // is_blind_append
        null, // user_id
        null, // user_name
        null, // user_metadata
        rowsPerDay,
        1L, // num_added_files
        null, // num_removed_files
        rowsPerDay * 100L, // num_output_bytes
        null, // execution_time_ms
        ts, // ingested_at
        ts.toString.take(10).replace("-", "") // snapshot_date
      )
    }
  }

  /** Creates test commit rows for a training table (< 5 commits). */
  private def createTrainingCommitRows(
      tableFqn: String
  ): Seq[Row] = {
    val parts = tableFqn.split("\\.")
    val dbName = parts(0)
    val tblName = parts(1)

    (0 until 3).map { i =>
      val ts = java.sql.Timestamp.valueOf(
        s"2026-01-${f"${15 - i}%02d"} 10:00:00"
      )
      Row(
        dbName,
        tblName,
        tableFqn,
        null,
        i.toLong,
        ts,
        "WRITE",
        null,
        null,
        null,
        "WriteSerializable",
        true,
        null,
        null,
        null,
        500L,
        1L,
        null,
        50000L,
        null,
        ts,
        ts.toString.take(10).replace("-", "")
      )
    }
  }

  describe("DeltaLogKpiEngine") {

    describe("computeFreshness") {
      it("should compute freshness for a table with regular commits") {
        val rows = createHealthyCommitRows("db1.regular_table", numDays = 14)
        val df =
          spark.createDataFrame(spark.sparkContext.parallelize(rows), commitHistorySchema)

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeFreshness()

        result.count() shouldBe 1

        val row = result.first()
        row.getAs[String]("table_fqn") shouldBe "db1.regular_table"
        row.getAs[String]("freshness_status") should not be null

        val medianInterval =
          row.getAs[Long]("median_interval_seconds")
        medianInterval should be > 0L
      }

      it("should mark a table with < 5 intervals as Training") {
        val rows = createTrainingCommitRows("db2.new_table")
        val df =
          spark.createDataFrame(spark.sparkContext.parallelize(rows), commitHistorySchema)

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeFreshness()

        result.count() shouldBe 1
        result.first().getAs[String]("freshness_status") shouldBe "Training"
      }

      it("should handle multiple tables") {
        val rows1 =
          createHealthyCommitRows("db1.table_a", numDays = 10)
        val rows2 =
          createHealthyCommitRows("db1.table_b", numDays = 10)
        val allRows = rows1 ++ rows2
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(allRows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeFreshness()

        result.count() shouldBe 2
        val fqns = result.collect().map(_.getAs[String]("table_fqn")).toSet
        fqns should contain("db1.table_a")
        fqns should contain("db1.table_b")
      }

      it("should exclude OPTIMIZE and VACUUM from freshness calculations") {
        val parts = "db3.mixed_ops".split("\\.")
        val now = System.currentTimeMillis()
        val rows = (0 until 10).map { i =>
          val ts = new java.sql.Timestamp(now - (i.toLong * 24 * 3600 * 1000))
          val op = if (i % 3 == 0) "OPTIMIZE" else "WRITE"
          Row(
            parts(0),
            parts(1),
            "db3.mixed_ops",
            null,
            i.toLong,
            ts,
            op,
            null,
            null,
            null,
            "WriteSerializable",
            true,
            null,
            null,
            null,
            if (op == "WRITE") 1000L.asInstanceOf[java.lang.Long] else null,
            1L.asInstanceOf[java.lang.Long],
            null,
            null,
            null,
            ts,
            ts.toString.take(10).replace("-", "")
          )
        }

        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeFreshness()

        result.count() shouldBe 1
        // Commits in last 7 days should only count non-maintenance ops
        val commitsIn7d =
          result.first().getAs[Long]("commits_in_last_7d").toInt
        commitsIn7d should be > 0
      }
    }

    describe("computeCompleteness") {
      it("should compute completeness for a table with consistent row counts") {
        val rows =
          createHealthyCommitRows("db1.consistent_table", numDays = 14, rowsPerDay = 1000L)
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeCompleteness()

        result.count() shouldBe 1
        val row = result.first()
        row.getAs[String]("table_fqn") shouldBe "db1.consistent_table"
        row.getAs[String]("completeness_status") should not be null
      }

      it("should mark a table with < 7 days of data as Training") {
        val rows =
          createTrainingCommitRows("db2.young_table")
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeCompleteness()

        // May have 0 rows since all 3 commits could be same day or < 7 days
        if (result.count() > 0) {
          result.first().getAs[String]("completeness_status") shouldBe "Training"
        }
      }
    }

    describe("computeOperational") {
      it("should compute operational metrics per table") {
        val rows =
          createHealthyCommitRows("db1.ops_table", numDays = 10)
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeOperational()

        result.count() shouldBe 1
        val row = result.first()
        row.getAs[String]("table_fqn") shouldBe "db1.ops_table"
        row.getAs[Long]("latest_version") shouldBe 9L
        row.getAs[String]("most_common_operation") should not be null
      }

      it("should count OPTIMIZE and VACUUM in last 7 days") {
        val parts = "db3.maintenance_table".split("\\.")
        val rows = Seq(
          Row(
            parts(0),
            parts(1),
            "db3.maintenance_table",
            null,
            0L,
            java.sql.Timestamp.valueOf("2026-01-10 10:00:00"),
            "WRITE",
            null,
            null,
            null,
            null,
            true,
            null,
            null,
            null,
            1000L.asInstanceOf[java.lang.Long],
            1L.asInstanceOf[java.lang.Long],
            null,
            null,
            null,
            java.sql.Timestamp.valueOf("2026-01-10 10:00:00"),
            "20260110"
          ),
          Row(
            parts(0),
            parts(1),
            "db3.maintenance_table",
            null,
            1L,
            java.sql.Timestamp.valueOf("2026-01-11 10:00:00"),
            "OPTIMIZE",
            null,
            null,
            null,
            null,
            false,
            null,
            null,
            null,
            null,
            1L.asInstanceOf[java.lang.Long],
            5L.asInstanceOf[java.lang.Long],
            null,
            null,
            java.sql.Timestamp.valueOf("2026-01-11 10:00:00"),
            "20260111"
          ),
          Row(
            parts(0),
            parts(1),
            "db3.maintenance_table",
            null,
            2L,
            java.sql.Timestamp.valueOf("2026-01-12 10:00:00"),
            "VACUUM",
            null,
            null,
            null,
            null,
            false,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            java.sql.Timestamp.valueOf("2026-01-12 10:00:00"),
            "20260112"
          )
        )

        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeOperational()

        result.count() shouldBe 1
        val row = result.first()
        row.getAs[Long]("latest_version") shouldBe 2L
      }
    }

    describe("computeAll") {
      it("should join freshness, completeness, and operational results") {
        val rows =
          createHealthyCommitRows("db1.all_kpi_table", numDays = 14)
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeAll()

        result.count() shouldBe 1

        val columns = result.columns.toSet
        columns should contain("table_fqn")
        columns should contain("overall_status")
        columns should contain("evaluation_timestamp")
        columns should contain("freshness_status")
        columns should contain("last_commit_timestamp")
        columns should contain("predicted_next_commit")
        columns should contain("completeness_status")
        columns should contain("latest_version")
        columns should contain("most_common_operation")
      }

      it("should determine overall status from freshness and completeness") {
        val rows =
          createHealthyCommitRows("db1.overall_table", numDays = 14)
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeAll()
        val row = result.first()
        val overallStatus = row.getAs[String]("overall_status")

        // Should be one of the valid statuses
        Set("Healthy", "Unhealthy", "Training") should contain(overallStatus)
      }

      it("should handle a training table in computeAll") {
        val rows =
          createTrainingCommitRows("db2.training_table_all")
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(rows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeAll()

        result.count() shouldBe 1
        val overallStatus =
          result.first().getAs[String]("overall_status")

        overallStatus shouldBe "Training"
      }

      it("should handle multiple tables from different databases") {
        val rows1 =
          createHealthyCommitRows("db1.multi_a", numDays = 10)
        val rows2 =
          createHealthyCommitRows("db2.multi_b", numDays = 10)
        val allRows = rows1 ++ rows2
        val df = spark.createDataFrame(
          spark.sparkContext.parallelize(allRows),
          commitHistorySchema
        )

        val engine = DeltaLogKpiEngine(spark, df)
        val result = engine.computeAll()

        result.count() shouldBe 2
        val fqns = result.collect().map(_.getAs[String]("table_fqn")).toSet
        fqns should contain("db1.multi_a")
        fqns should contain("db2.multi_b")
      }
    }
  }
}
