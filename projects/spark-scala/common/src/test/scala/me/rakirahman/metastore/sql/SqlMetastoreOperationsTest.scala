package me.rakirahman.metastore.sql

// @formatter:off
import me.rakirahman.config.DeltaLakeConfiguration
import me.rakirahman.etl.transformer.sorter.{DateSorter, DateTypes, SortableColumnNames}

import java.sql.Timestamp

import org.apache.spark.sql._
import org.apache.spark.sql.catalyst.TableIdentifier
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers
import org.scalatest.prop.TableDrivenPropertyChecks

import scala.util.Random
// @formatter:on

/** Tests for [[SqlMetastoreOperations]].
  */
class SqlMetastoreOperationsTest extends AnyFunSpec with Matchers with BeforeAndAfterAll with BeforeAndAfterEach with TableDrivenPropertyChecks {

  var spark: SparkSession = _
  var sqlMetastoreOperations: SqlMetastoreOperations = _
  val testDatabaseName = "test_sql_metastore_ops_db"

  override def beforeAll(): Unit = {
    System.setProperty("hadoop.home.dir", "/")
    spark = SparkSession
      .builder()
      .master("local[*]")
      .appName("SqlMetastoreOperationsTest")
      .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
      .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
      .config("spark.sql.warehouse.dir", s"/tmp/SqlMetastoreOperationsTest-${System.currentTimeMillis}/warehouse")
      .config("spark.driver.host", "localhost")
      .config("spark.ui.enabled", "false")
      .getOrCreate()

    sqlMetastoreOperations = SqlMetastoreOperations(spark)
    super.beforeAll()
  }

  override def beforeEach(): Unit = {
    sqlMetastoreOperations.createDatabase(testDatabaseName)
    super.beforeEach()
  }

  override def afterEach(): Unit = {
    sqlMetastoreOperations.dropDatabase(testDatabaseName)
    super.afterEach()
  }

  override def afterAll(): Unit = {
    if (spark != null) {
      spark.stop()
    }
    super.afterAll()
  }

  describe("SqlMetastoreOperations") {

    // @formatter:off
    it("must correctly resolve column values from view creation") {
      val query = s"""|CREATE VIEW ${testDatabaseName}.global_raw_logs_view
                      |(
                      |     Body,
                      |     BatchEnqueuedUnixTimeMs,
                      |     BatchIngestionUnixTimeMs,
                      |     BatchOffset,
                      |     BatchSequenceNumber,
                      |     BatchPartitionId,
                      |     YearMonthDate,
                      |     region
                      |) TBLPROPERTIES (
                      |     'transient_lastDdlTime' = '1743466503'
                      |) AS SELECT *, 'centraluseuap' AS region FROM arc_apps_db_eh.arc_apps_eh_ccy_prod_raw_logs UNION ALL
                      |     SELECT *, 'eastus2euap'   AS region FROM arc_apps_db_eh.arc_apps_eh_ecy_prod_raw_logs""".stripMargin('|')
      val tableRegionMap = sqlMetastoreOperations.extractTablesWithColumnValuesInQuery(query, "region")
      val expectedTableRegionMap = Map(
        "arc_apps_db_eh.arc_apps_eh_ccy_prod_raw_logs" -> "centraluseuap",
        "arc_apps_db_eh.arc_apps_eh_ecy_prod_raw_logs" -> "eastus2euap"
      )
      assert(tableRegionMap.size == 2)
      assert(tableRegionMap == expectedTableRegionMap)
    }

    it("must correctly retrieve timestamp partition values") {
      forAll(
        Table(
          (
            "partitionValues",
            "expectedTimestamps"
          ),
          (
            Seq("20230101"),
            Seq(Timestamp.valueOf("2023-01-01 00:00:00"))
          ),
          (
            Seq("20230101", "20221231"),
            Seq(
              Timestamp.valueOf("2022-12-31 00:00:00"),
              Timestamp.valueOf("2023-01-01 00:00:00")
            )
          ),
          (
            Seq("20230101", "20221231", "20230201"),
            Seq(
              Timestamp.valueOf("2022-12-31 00:00:00"),
              Timestamp.valueOf("2023-01-01 00:00:00"),
              Timestamp.valueOf("2023-02-01 00:00:00")
            )
          )
        )
      )
      { (partitionValuesExpected, expectedTimestamps) =>

        val tableName = "test_table"
        val partitionColumn = "date_partition"

        sqlMetastoreOperations.dropTable(testDatabaseName, tableName)

        spark
          .createDataFrame(partitionValuesExpected.map(value => (value, s"string_value_$value")))
          .toDF(partitionColumn, "additional_column")
          .write
          .format("delta")
          .partitionBy(partitionColumn)
          .mode("overwrite")
          .saveAsTable(s"$testDatabaseName.$tableName")

        val partitionValuesReceived = sqlMetastoreOperations.getTimestampPartitionValues(
          testDatabaseName,
          tableName,
          partitionColumn,
          SortableColumnNames.YEAR_MONTH_DATE_LIT
        )

        val minMaxTuples = sqlMetastoreOperations.getMinMaxTimestampPartitionValues(
          testDatabaseName,
          tableName,
          partitionColumn,
          SortableColumnNames.YEAR_MONTH_DATE_LIT
        )

        assert(partitionValuesReceived.sameElements(expectedTimestamps))
        assert(minMaxTuples._1 === expectedTimestamps.head)
        assert(minMaxTuples._2 === expectedTimestamps.last)

      }
    }
    // @formatter:on

    Array(1, 2, 4, 8, 16, 32, 64, 128, 256).foreach { case numColumnsToAdd =>
      it(
        s"must be able to merge schema for ${numColumnsToAdd} column(s)"
      ) {

        val sourceTable = "merge_schema_test"

        val localSpark = spark
        import localSpark.implicits._
        Seq(("foo", 1), ("bar", 2))
          .toDF("text", "num")
          .write
          .format("delta")
          .mode("overwrite")
          .saveAsTable(s"${testDatabaseName}.${sourceTable}")

        val keyValueArray = Array.fill(numColumnsToAdd)(
          Random.alphanumeric.take(30).mkString("")
        )

        val currentSchema = sqlMetastoreOperations.getSchema(
          testDatabaseName,
          sourceTable
        )
        val desiredSchema =
          keyValueArray.map(keyValue => (keyValue, "STRING")) ++ currentSchema

        sqlMetastoreOperations.mergeSchema(
          testDatabaseName,
          sourceTable,
          desiredSchema,
          Array.empty[String]
        )

        val newSchema = sqlMetastoreOperations.getSchema(
          testDatabaseName,
          sourceTable
        )

        assert(
          newSchema.length === currentSchema.length + numColumnsToAdd,
          "New schema length does not match expected"
        )

        keyValueArray.foreach { keyValue =>
          assert(
            newSchema.exists(_._1 == keyValue),
            s"New schema does not contain new column: ${keyValue}"
          )
        }

        currentSchema.toSeq.foreach { case (columnName, dataType) =>
          assert(
            newSchema.toSeq.exists(_._1 == columnName),
            s"New schema does not contain old column: ${columnName}"
          )
        }
      }
    }

    Array(1, 2, 4, 8, 16).foreach { case desiredColumnsToChange =>
      it(
        s"throws on breaking schema change requests for $desiredColumnsToChange column(s)"
      ) {
        val sourceTable = "break_schema_test"

        val localSpark = spark
        import localSpark.implicits._
        Seq(("foo", 1), ("bar", 2))
          .toDF("text", "num")
          .write
          .format("delta")
          .mode("overwrite")
          .saveAsTable(s"${testDatabaseName}.${sourceTable}")

        val keyValueArray = Array.fill(desiredColumnsToChange)(
          Random.alphanumeric.take(30).mkString("")
        )

        val currentSchema = sqlMetastoreOperations.getSchema(
          testDatabaseName,
          sourceTable
        )

        val columnsToDrop = if (currentSchema.length < desiredColumnsToChange) {
          currentSchema.length
        } else {
          desiredColumnsToChange
        }

        val desiredSchema =
          currentSchema.toSeq.drop(columnsToDrop).toArray ++ keyValueArray.map(keyValue => (keyValue, "STRING"))

        var threw = false

        try {
          sqlMetastoreOperations.mergeSchema(
            testDatabaseName,
            sourceTable,
            desiredSchema,
            Array.empty[String]
          )
        } catch {
          case _: Exception => threw = true
        }

        assert(
          threw,
          "Breaking changes in schema merge did not throw as expected"
        )
      }
    }

    // @formatter:off
    it("must be able to convert TIMESTAMPs into formatted dates") {

      val localSpark = spark
      import localSpark.implicits._

      val TIMESTAMP                 = "timestamp"
      val YEAR                      = "year"
      val YEAR_MONTH                = "yearMonth"
      val YEAR_MONTH_DATE           = "yearMonthDate"
      val YEAR_MONTH_DATE_HOUR      = "yearMonthDateHour"

      val original                  = Seq(("2023-01-01 12:00:00"), ("2022-12-31 12:00:00"), ("2023-01-02 12:00:00"))
      val expectedYear              = Seq( "2023",                  "2022",                  "2023")
      val expectedYearMonth         = Seq( "202301",                "202212",                "202301")
      val expectedYearMonthDate     = Seq( "20230101",              "20221231",              "20230102")
      val expectedYearMonthDateHour = Seq( "2023010112",            "2022123112",            "2023010212")

      val testDf                    = original.toDF(TIMESTAMP).withColumn(TIMESTAMP, col(TIMESTAMP).cast(TimestampType))

      val yearDf                    = testDf.transform(DateSorter.convert(TIMESTAMP, YEAR,                 DateTypes.Year))
      val yearMonthDf               = testDf.transform(DateSorter.convert(TIMESTAMP, YEAR_MONTH,           DateTypes.YearMonth))
      val yearMonthDateDf           = testDf.transform(DateSorter.convert(TIMESTAMP, YEAR_MONTH_DATE,      DateTypes.YearMonthDate))
      val yearMonthDateHourDf       = testDf.transform(DateSorter.convert(TIMESTAMP, YEAR_MONTH_DATE_HOUR, DateTypes.YearMonthDateHour))

      val actualYear                = yearDf.select(YEAR).as[String].collect()
      val actualYearMonth           = yearMonthDf.select(YEAR_MONTH).as[String].collect()
      val actualYearMonthDate       = yearMonthDateDf.select(YEAR_MONTH_DATE).as[String].collect()
      val actualYearMonthDateHour   = yearMonthDateHourDf.select(YEAR_MONTH_DATE_HOUR).as[String].collect()

      assert(actualYear.sameElements(expectedYear),                           s"Expected: ${expectedYear}, but got: ${actualYear}")
      assert(actualYearMonth.sameElements(expectedYearMonth),                 s"Expected: ${expectedYearMonth}, but got: ${actualYearMonth}")
      assert(actualYearMonthDate.sameElements(expectedYearMonthDate),         s"Expected: ${expectedYearMonthDate}, but got: ${actualYearMonthDate}")
      assert(actualYearMonthDateHour.sameElements(expectedYearMonthDateHour), s"Expected: ${expectedYearMonthDateHour}, but got: ${actualYearMonthDateHour}")

    }
    // @formatter:on

    it(
      s"must be able to merge schema on valid changes and throw on breaking changes"
    ) {

      val localSpark = spark
      import localSpark.implicits._

      val sourceTable = "test_table"
      val data = Seq(("foo", 1), ("baz", 2), ("abc", 3))
      val df = data.toDF("text", "num").orderBy(rand())

      df.write
        .format("delta")
        .mode("overwrite")
        .saveAsTable(s"${testDatabaseName}.${sourceTable}")

      // Exercise: Valid merge with runtime schema
      //
      sqlMetastoreOperations.mergeSchema(
        testDatabaseName,
        sourceTable,
        spark.table(s"${testDatabaseName}.${sourceTable}").schema
      )

      // Verify
      //
      assert(
        spark
          .table(s"${testDatabaseName}.${sourceTable}")
          .schema
          ==
            spark.sessionState.catalog
              .getTableMetadata(TableIdentifier(sourceTable))
              .schema,
        "Schema merge failed"
      )

      // Exercise: Invalid merge with random schema
      //
      var threw = false
      try {
        sqlMetastoreOperations.mergeSchema(
          testDatabaseName,
          sourceTable,
          new StructType().add("qux", "timestamp")
        )
      } catch {
        case _: org.apache.spark.sql.AnalysisException => threw = true
      }

      // Verify
      //
      assert(
        threw,
        "Breaking changes in schema merge did not throw as expected"
      )
    }

    // @formatter:off
    it("can extract tables and column values from a view") {
      val table1 = "table_a"
      val table2 = "table_b"
      val viewName = "test_view"
      val columnToSearch = "static_col"
      val staticValue = "my_static_value"

      val createQuery = s"""
                         |CREATE OR REPLACE VIEW ${testDatabaseName}.${viewName} AS
                         |SELECT *, '$staticValue' AS $columnToSearch FROM ${testDatabaseName}.${table1}
                         |UNION ALL
                         |SELECT *, '$staticValue' AS $columnToSearch FROM ${testDatabaseName}.${table2}
                         |""".stripMargin

      val df = spark.createDataFrame(
        spark.sparkContext.parallelize(Seq(Row(1, "Alice"), Row(2, "Bob"))),
        StructType(
          Seq(
            StructField("id", IntegerType, nullable = false),
            StructField("name", StringType, nullable = true)
          )
        )
      )
      df.write.mode("overwrite").saveAsTable(s"$testDatabaseName.$table1")
      df.write.mode("overwrite").saveAsTable(s"$testDatabaseName.$table2")

      spark.sql(createQuery)
      val tablesInView = sqlMetastoreOperations.listTablesInView(testDatabaseName, viewName)
      val tablesInQuery = sqlMetastoreOperations.extractTablesInQuery(createQuery)
      val tableColumnValues = sqlMetastoreOperations.extractTablesWithColumnValuesInView(testDatabaseName, viewName, columnToSearch)

      assert(tablesInView.contains(s"${testDatabaseName}.${table1}"))
      assert(tablesInView.contains(s"${testDatabaseName}.${table2}"))
      assert(tablesInView.length == 2)

      tablesInView.foreach { table => assert(tablesInQuery.contains(table)) }
      tablesInQuery.foreach { table => assert(tablesInView.contains(table)) }
      assert(tablesInView.length == tablesInQuery.length)

      assert(tableColumnValues.keySet.contains(s"${testDatabaseName}.${table1}"))
      assert(tableColumnValues.keySet.contains(s"${testDatabaseName}.${table2}"))
      assert(tableColumnValues.values.forall(_ == staticValue))
      assert(tableColumnValues.size == 2)
    }

    it("must correctly extract dependencies from named queries") {

      val namedQueries = Map(
        "bronze_customers"      -> "SELECT * FROM raw_customers",
        "bronze_orders"         -> "SELECT * FROM raw_orders",
        "silver_customers"      -> "SELECT customer_id, upper(name) as name FROM bronze_customers",
        "silver_orders"         -> "SELECT order_id, customer_id, order_date FROM bronze_orders",
        "independent_table"     -> "SELECT * FROM some_external_table",
        "gold_customer_summary" -> """
          SELECT
            c.customer_id,
            c.name,
            count(o.order_id) as order_count
          FROM silver_customers c
          LEFT JOIN silver_orders o ON c.customer_id = o.customer_id
          GROUP BY c.customer_id, c.name
        """
      )

      val dependencyOrder = sqlMetastoreOperations.extractDependencies(namedQueries)
      assert(dependencyOrder.nonEmpty, "Dependency order should not be empty")

      val firstLevel = dependencyOrder.head
      assert(firstLevel.contains("bronze_customers"),  "bronze_customers should be in first level")
      assert(firstLevel.contains("bronze_orders"),     "bronze_orders should be in first level")
      assert(firstLevel.contains("independent_table"), "independent_table should be in first level")

      val allLevelsFlattened = dependencyOrder.flatten
      val bronzeCustomersIndex = allLevelsFlattened.indexOf("bronze_customers")
      val silverCustomersIndex = allLevelsFlattened.indexOf("silver_customers")
      val goldCustomerSummaryIndex = allLevelsFlattened.indexOf("gold_customer_summary")

      assert(bronzeCustomersIndex < silverCustomersIndex,     "bronze_customers should come before silver_customers")
      assert(silverCustomersIndex < goldCustomerSummaryIndex, "silver_customers should come before gold_customer_summary")

      dependencyOrder.foreach { level =>
        level.foreach { table =>
          val tableDependencies = sqlMetastoreOperations.extractTablesInQuery(namedQueries(table)).filter(namedQueries.contains)
          val dependenciesInSameLevel = tableDependencies.intersect(level)
          assert(dependenciesInSameLevel.isEmpty, s"Table ${table} should not depend on other tables in the same level: ${dependenciesInSameLevel}")
        }
      }
    }

    it("must detect circular dependencies") {

      val circularQueries = Map(
        "table_a" -> "SELECT * FROM table_b",
        "table_b" -> "SELECT * FROM table_c",
        "table_c" -> "SELECT * FROM table_a"
      )

      val exception = intercept[RuntimeException] { sqlMetastoreOperations.extractDependencies(circularQueries) }
      assert(exception.getMessage.contains("Circular dependency detected"))
    }

    it("must handle complex dependency chains") {
      val complexQueries = Map(
        "raw_data_a"   -> "SELECT * FROM external_source_a",
        "raw_data_b"   -> "SELECT * FROM external_source_b",
        "raw_data_c"   -> "SELECT * FROM external_source_c",
        "bronze_a"     -> "SELECT * FROM raw_data_a",
        "bronze_b"     -> "SELECT * FROM raw_data_b",
        "bronze_c"     -> "SELECT * FROM raw_data_c",
        "silver_ab"    -> "SELECT * FROM bronze_a UNION ALL SELECT * FROM bronze_b",
        "silver_c"     -> "SELECT * FROM bronze_c",
        "gold_summary" -> "SELECT * FROM silver_ab JOIN silver_c ON silver_ab.id = silver_c.id"
      )

      val dependencyOrder = sqlMetastoreOperations.extractDependencies(complexQueries)
      assert(dependencyOrder.length == 4, s"Expected 4 dependency levels, got ${dependencyOrder.length}")

      assert(dependencyOrder(0).toSet == Set("raw_data_a", "raw_data_b", "raw_data_c"))
      assert(dependencyOrder(1).toSet == Set("bronze_a", "bronze_b", "bronze_c"))
      assert(dependencyOrder(2).toSet == Set("silver_ab", "silver_c"))
      assert(dependencyOrder(3).toSet == Set("gold_summary"))
    }

    it("must handle queries with external dependencies") {

      val queriesWithExternal = Map(
        "internal_table_a" -> "SELECT * FROM external_table_1",
        "internal_table_b" -> "SELECT * FROM internal_table_a JOIN external_table_2 ON internal_table_a.id = external_table_2.id"
      )

      val dependencyOrder = sqlMetastoreOperations.extractDependencies(queriesWithExternal)
      assert(dependencyOrder.length == 2, s"Expected 2 dependency levels, got ${dependencyOrder.length}")

      assert(dependencyOrder(0).contains("internal_table_a"))
      assert(dependencyOrder(1).contains("internal_table_b"))
    }

    it("must show external dependencies when showExternalDependencies is true") {

      val queriesWithExternal = Map(
        "internal_table_a" -> "SELECT * FROM external_table_1",
        "internal_table_b" -> "SELECT * FROM internal_table_a JOIN external_table_2 ON internal_table_a.id = external_table_2.id",
        "internal_table_c" -> "SELECT * FROM external_table_1 JOIN external_table_3 ON external_table_1.id = external_table_3.id"
      )

      val dependencyOrderWithExternal = sqlMetastoreOperations.extractDependencies(queriesWithExternal, showExternalDependencies = true)
      assert(dependencyOrderWithExternal.length == 3, s"Expected 3 dependency levels, got ${dependencyOrderWithExternal.length}")

      val firstLevel = dependencyOrderWithExternal(0).toSet
      assert(firstLevel.contains("external_table_1"), "external_table_1 should be in first level")
      assert(firstLevel.contains("external_table_2"), "external_table_2 should be in first level")
      assert(firstLevel.contains("external_table_3"), "external_table_3 should be in first level")

      val secondLevel = dependencyOrderWithExternal(1).toSet
      assert(secondLevel.contains("internal_table_a"), "internal_table_a should be in second level")
      assert(secondLevel.contains("internal_table_c"), "internal_table_c should be in second level")

      val thirdLevel = dependencyOrderWithExternal(2).toSet
      assert(thirdLevel.contains("internal_table_b"), "internal_table_b should be in third level")

      val dependencyOrderWithoutExternal = sqlMetastoreOperations.extractDependencies(queriesWithExternal, showExternalDependencies = false)
      assert(dependencyOrderWithoutExternal.length == 2, s"Expected 2 dependency levels without external dependencies, got ${dependencyOrderWithoutExternal.length}")

      assert(dependencyOrderWithoutExternal(0).toSet.contains("internal_table_a"))
      assert(dependencyOrderWithoutExternal(0).toSet.contains("internal_table_c"))
      assert(dependencyOrderWithoutExternal(1).contains("internal_table_b"))
    }

    it("must extract dependency layers as a map with integer keys") {

      val namedQueries = Map(
        "raw_customers"      -> "SELECT * FROM external_customers",
        "raw_orders"         -> "SELECT * FROM external_orders",
        "bronze_customers"   -> "SELECT customer_id, upper(name) as name FROM raw_customers",
        "bronze_orders"      -> "SELECT order_id, customer_id, order_date FROM raw_orders",
        "silver_customers"   -> "SELECT customer_id, name FROM bronze_customers WHERE name IS NOT NULL",
        "gold_summary"       -> """
          SELECT
            c.customer_id,
            c.name,
            count(o.order_id) as order_count
          FROM silver_customers c
          LEFT JOIN bronze_orders o ON c.customer_id = o.customer_id
          GROUP BY c.customer_id, c.name
        """
      )

      val dependencyLayers = sqlMetastoreOperations.extractDependencyAsLayers(namedQueries, showExternalDependencies = false)
      assert(dependencyLayers.isInstanceOf[Map[Int, Seq[String]]], "Should return a Map[Int, Seq[String]]")
      assert(dependencyLayers.nonEmpty, "Dependency layers should not be empty")
      assert(dependencyLayers.contains(0), "Should contain layer 0")
      assert(dependencyLayers.contains(1), "Should contain layer 1")
      assert(dependencyLayers.contains(2), "Should contain layer 2")
      assert(dependencyLayers.contains(3), "Should contain layer 3")

      val layer0 = dependencyLayers(0).toSet
      assert(layer0.contains("raw_customers"), "raw_customers should be in layer 0")
      assert(layer0.contains("raw_orders"), "raw_orders should be in layer 0")

      val layer1 = dependencyLayers(1).toSet
      assert(layer1.contains("bronze_customers"), "bronze_customers should be in layer 1")
      assert(layer1.contains("bronze_orders"), "bronze_orders should be in layer 1")

      val layer2 = dependencyLayers(2).toSet
      assert(layer2.contains("silver_customers"), "silver_customers should be in layer 2")

      val layer3 = dependencyLayers(3).toSet
      assert(layer3.contains("gold_summary"), "gold_summary should be in layer 3")

      dependencyLayers.keys.toSeq.sorted.foreach { layerIndex =>
        val currentLayer = dependencyLayers(layerIndex)
        currentLayer.foreach { tableName =>
          val tableDependencies = sqlMetastoreOperations.extractTablesInQuery(namedQueries(tableName)).filter(namedQueries.contains)
          tableDependencies.foreach { dependency =>
            val dependencyLayerIndex = dependencyLayers.find(_._2.contains(dependency)).map(_._1).getOrElse(-1)
            assert(dependencyLayerIndex < layerIndex, s"Table $tableName in layer $layerIndex should not depend on $dependency in layer $dependencyLayerIndex")
          }
        }
      }

      val dependencyLayersWithExternal = sqlMetastoreOperations.extractDependencyAsLayers(namedQueries, showExternalDependencies = true)
      assert(dependencyLayersWithExternal.size > dependencyLayers.size, "Should have more layers when including external dependencies")

      val externalLayer = dependencyLayersWithExternal(0).toSet
      assert(externalLayer.contains("external_customers"), "external_customers should be in first layer when showExternalDependencies = true")
      assert(externalLayer.contains("external_orders"), "external_orders should be in first layer when showExternalDependencies = true")
    }

    it("must convert Spark schema to SQL Server schema correctly") {
      val testSchema = StructType(Seq(
        StructField("bigint_col", LongType, nullable = false),
        StructField("int_col", IntegerType, nullable = false),
        StructField("double_col", DoubleType, nullable = false),
        StructField("string_col", StringType, nullable = false),
        StructField("timestamp_col", TimestampType, nullable = false),
        StructField("date_col", DateType, nullable = false),
        StructField("boolean_col", BooleanType, nullable = false),
        StructField("binary_col", BinaryType, nullable = false),
        StructField("byte_col", ByteType, nullable = false),
        StructField("float_col", FloatType, nullable = false),
        StructField("short_col", ShortType, nullable = false)
      ))
      val result = sqlMetastoreOperations.convertToSqlServerSchema(testSchema)
      val expectedMappings = Map(
        "bigint_col" -> "BIGINT",
        "int_col" -> "INTEGER",
        "double_col" -> "DOUBLE PRECISION",
        "string_col" -> "NVARCHAR(MAX)",
        "timestamp_col" -> "DATETIME",
        "date_col" -> "DATE",
        "boolean_col" -> "BIT",
        "binary_col" -> "VARBINARY(MAX)",
        "byte_col" -> "TINYINT",
        "float_col" -> "REAL",
        "short_col" -> "SMALLINT"
      )

      assert(result.length == expectedMappings.size, s"Expected ${expectedMappings.size} mappings, got ${result.length}")

      result.foreach { case (columnName, sqlServerType) =>
        assert(expectedMappings.contains(columnName), s"Unexpected column name: $columnName")
        assert(expectedMappings(columnName) == sqlServerType, s"For column $columnName, expected ${expectedMappings(columnName)}, got $sqlServerType")
      }

      expectedMappings.keys.foreach { expectedColumn => assert(result.exists(_._1 == expectedColumn), s"Missing expected column: $expectedColumn") }
    }

    it("must handle empty schema correctly") {
      val emptySchema = StructType(Seq.empty)
      val result = sqlMetastoreOperations.convertToSqlServerSchema(emptySchema)
      assert(result.isEmpty, "Empty schema should produce empty result array")
    }

    it("must handle single column schema correctly") {
      val singleColumnSchema = StructType(Seq(
        StructField("single_string_col", StringType, nullable = true)
      ))

      val result = sqlMetastoreOperations.convertToSqlServerSchema(singleColumnSchema)

      assert(result.length == 1, "Single column schema should produce single mapping")
      assert(result(0)._1 == "single_string_col", "Column name should match")
      assert(result(0)._2 == "NVARCHAR(MAX)", "String type should map to NVARCHAR(MAX)")
    }

    it("must preserve column order from input schema") {
      val orderedSchema = StructType(Seq(
        StructField("z_column", StringType, nullable = false),
        StructField("a_column", IntegerType, nullable = false),
        StructField("m_column", BooleanType, nullable = false)
      ))

      val result = sqlMetastoreOperations.convertToSqlServerSchema(orderedSchema)

      assert(result.length == 3, "Should have 3 columns")
      assert(result(0)._1 == "z_column", "First column should be z_column")
      assert(result(1)._1 == "a_column", "Second column should be a_column")
      assert(result(2)._1 == "m_column", "Third column should be m_column")

      assert(result(0)._2 == "NVARCHAR(MAX)", "z_column should map to NVARCHAR(MAX)")
      assert(result(1)._2 == "INTEGER", "a_column should map to INTEGER")
      assert(result(2)._2 == "BIT", "m_column should map to BIT")
    }

    it("must handle column names with special characters") {
      val specialNamesSchema = StructType(Seq(
        StructField("column_with_underscores", StringType, nullable = false),
        StructField("column-with-dashes", IntegerType, nullable = false),
        StructField("column with spaces", BooleanType, nullable = false),
        StructField("COLUMN_UPPERCASE", TimestampType, nullable = false),
        StructField("123numeric_start", LongType, nullable = false)
      ))

      val result = sqlMetastoreOperations.convertToSqlServerSchema(specialNamesSchema)

      assert(result.length == 5, "Should handle all special column names")

      val resultMap = result.toMap
      assert(resultMap("column_with_underscores") == "NVARCHAR(MAX)")
      assert(resultMap("column-with-dashes") == "INTEGER")
      assert(resultMap("column with spaces") == "BIT")
      assert(resultMap("COLUMN_UPPERCASE") == "DATETIME")
      assert(resultMap("123numeric_start") == "BIGINT")
    }

    it("must extract column references from SQL query correctly") {
      val localSpark = spark
      import localSpark.implicits._

      Seq(
        ("2024-01-01", "store_001", "product_A", 10, 100.0),
        ("2024-01-02", "store_002", "product_B", 5, 50.0),
        ("2024-01-03", "store_001", "product_A", 8, 80.0)
      )
      .toDF("order_date", "store_id", "product_id", "quantity", "amount")
      .createOrReplaceTempView("fact_transaction")

      val query = """
        |SELECT
        |    CAST(order_date AS DATE) AS snapshot_date,
        |    store_id,
        |    fact.product_id,
        |    SUM(quantity) AS total_quantity,
        |    SUM(amount) AS total_amount,
        |    COUNT(*) AS transaction_count
        |FROM fact_transaction fact
        |WHERE order_date >= '2024-01-01'
        |  AND order_date <  '2024-01-04'
        |GROUP BY CAST(order_date AS DATE), store_id, product_id
        |""".stripMargin

      val fromSql = sqlMetastoreOperations.extractColumnsInQuery(query)
      val fromPlan = sqlMetastoreOperations.extractColumnsInPlan(spark.sql(query).queryExecution.logical)
      val need = Set("order_date", "product_id", "snapshot_date", "store_id", "total_amount", "total_quantity", "transaction_count")

      Seq(("sql", fromSql), ("plan", fromPlan)).foreach { case (test, got) =>
        need.foreach { c => assert(got.contains(c), s"$test: Expected output column '$c' was not found in extracted columns: ${got.mkString(", ")}")}
        assert(got.contains("order_date"), s"$test: Casted column 'order_date' should ALSO be extracted when it has alias 'snapshot_date'")
        assert(!got.contains("quantity"), s"$test: Aggregated column 'quantity' should NOT be extracted when it has alias 'total_quantity'")
        assert(!got.contains("amount"), s"$test: Aggregated column 'amount' should NOT be extracted when it has alias 'total_amount'")
        assert(!got.contains("SUM"), s"$test: Function name 'SUM' should not be extracted as a column")
        assert(!got.contains("COUNT"), s"$test: Function name 'COUNT' should not be extracted as a column")
        assert(!got.contains("CAST"), s"$test: Function name 'CAST' should not be extracted as a column")
      }

      val outputFromSql = fromSql.intersect(need.toSeq)
      val outputFromPlan = fromPlan.intersect(need.toSeq)
      assert(outputFromSql.toSet == need, s"extractColumnsInQuery should find all expected output columns. Found: ${outputFromSql.mkString(", ")}")
      assert(outputFromPlan.toSet == need, s"extractColumnsInPlan should find all expected output columns. Found: ${outputFromPlan.mkString(", ")}")
    }

    it("must throw exception for unsupported data types") {
      val unsupportedSchema = StructType(Seq(
        StructField("valid_col", StringType, nullable = false),
        StructField("map_col", MapType(StringType, IntegerType), nullable = false)
      ))

      val exception = intercept[RuntimeException] { sqlMetastoreOperations.convertToSqlServerSchema(unsupportedSchema) }

      assert(exception.getMessage.contains("Unsupported Spark type for SQL Server conversion"))
      assert(exception.getMessage.contains("MapType"))
    }

    it("must handle nullable and non-nullable columns consistently") {
      val nullabilitySchema = StructType(Seq(
        StructField("nullable_string", StringType, nullable = true),
        StructField("non_nullable_string", StringType, nullable = false),
        StructField("nullable_int", IntegerType, nullable = true),
        StructField("non_nullable_int", IntegerType, nullable = false)
      ))

      val result = sqlMetastoreOperations.convertToSqlServerSchema(nullabilitySchema)

      val resultMap = result.toMap
      assert(resultMap("nullable_string") == "NVARCHAR(MAX)")
      assert(resultMap("non_nullable_string") == "NVARCHAR(MAX)")
      assert(resultMap("nullable_int") == "INTEGER")
      assert(resultMap("non_nullable_int") == "INTEGER")
    }

    it("must correctly get and set table properties") {
      val testTableName = "test_table_props"
      spark.range(10).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${testTableName}")

      val initialProps = sqlMetastoreOperations.getTableProps(testDatabaseName, testTableName)
      assert(initialProps.nonEmpty, "Table should have some default properties")
      assert(!initialProps.contains(DeltaLakeConfiguration.DELTA_CONF_CDC), "Table should not have CDF enabled initially")

      sqlMetastoreOperations.setTableProp(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_CONF_CDC, "true", force = true)
      assert(sqlMetastoreOperations.getTableProps(testDatabaseName, testTableName)(DeltaLakeConfiguration.DELTA_CONF_CDC) == "true", "Property should be set to true after force set")

      sqlMetastoreOperations.setTableProp(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_CONF_CDC, "true", force = false)
      assert(sqlMetastoreOperations.getTableProps(testDatabaseName, testTableName)(DeltaLakeConfiguration.DELTA_CONF_CDC) == "true", "Property should remain true")

      sqlMetastoreOperations.setTableProp(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_CONF_CDC, "false", force = false)
      assert(sqlMetastoreOperations.getTableProps(testDatabaseName, testTableName)(DeltaLakeConfiguration.DELTA_CONF_CDC) == "false", "Property should be updated to false")

      sqlMetastoreOperations.setTableProp(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_CONF_OPTIMIZE_WRITE, "true", force = false)
      assert(sqlMetastoreOperations.getTableProps(testDatabaseName, testTableName)(DeltaLakeConfiguration.DELTA_CONF_OPTIMIZE_WRITE) == "true", "New property should be set")

      sqlMetastoreOperations.setTableProp(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_CONF_OPTIMIZE_WRITE, "false", force = true)
      assert(sqlMetastoreOperations.getTableProps(testDatabaseName, testTableName)(DeltaLakeConfiguration.DELTA_CONF_OPTIMIZE_WRITE) == "false", "Property should be overridden with force = true")

      sqlMetastoreOperations.dropTable(testDatabaseName, testTableName)
    }

    it("must correctly get delta table property when it exists or not") {
      val testTableName = "test_delta_table_property"
      spark.range(10).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${testTableName}")

      assert(sqlMetastoreOperations.getDeltaTableProperty(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_APPEND_ONLY).isEmpty)

      spark.sql(s"ALTER TABLE ${testDatabaseName}.${testTableName} SET TBLPROPERTIES ('${DeltaLakeConfiguration.DELTA_APPEND_ONLY}'='false');")
      assert(sqlMetastoreOperations.getDeltaTableProperty(testDatabaseName, testTableName, DeltaLakeConfiguration.DELTA_APPEND_ONLY).contains("false"))

      sqlMetastoreOperations.dropTable(testDatabaseName, testTableName)
    }

    it("must correctly check databaseExists") {
      sqlMetastoreOperations.databaseExists(testDatabaseName) mustBe true
      sqlMetastoreOperations.databaseExists("nonexistent_db_xyz_42") mustBe false
    }

    it("must correctly listDatabases") {
      val dbs = sqlMetastoreOperations.listDatabases()
      dbs must contain(testDatabaseName)
    }

    it("must correctly listUserDatabases") {
      val dbs = sqlMetastoreOperations.listUserDatabases()
      dbs must contain(testDatabaseName)
      dbs must not contain "default"
    }

    it("must correctly check tableExists") {
      val tbl = "table_exists_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      sqlMetastoreOperations.tableExists(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.tableExists(testDatabaseName, "nonexistent_table_xyz") mustBe false
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly listTables") {
      val tbl = "list_tables_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val tables = sqlMetastoreOperations.listTables(testDatabaseName)
      tables must contain(tbl)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly listTablesWithPrefix") {
      val tbl1 = "pfx_test_table_1"
      val tbl2 = "pfx_test_table_2"
      val tbl3 = "other_table"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl1}")
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl2}")
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl3}")
      val tables = sqlMetastoreOperations.listTablesWithPrefix(testDatabaseName, "pfx_")
      tables must contain(tbl1)
      tables must contain(tbl2)
      tables must not contain tbl3
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl1)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl2)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl3)
    }

    it("must correctly listDeltaTables") {
      val tbl = "delta_list_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val deltaTables = sqlMetastoreOperations.listDeltaTables(testDatabaseName)
      deltaTables must contain(tbl)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly listDeltaTablesWithPrefix") {
      val tbl1 = "dltp_table_a"
      val tbl2 = "dltp_table_b"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl1}")
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl2}")
      val tables = sqlMetastoreOperations.listDeltaTablesWithPrefix(testDatabaseName, "dltp_")
      tables must contain(tbl1)
      tables must contain(tbl2)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl1)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl2)
    }

    it("must correctly check tableHasData") {
      val tbl = "has_data_test"
      spark.range(5).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      sqlMetastoreOperations.tableHasData(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly refreshTable") {
      val tbl = "refresh_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      noException must be thrownBy sqlMetastoreOperations.refreshTable(testDatabaseName, tbl)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly truncateTable") {
      val tbl = "truncate_test"
      spark.range(10).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      sqlMetastoreOperations.tableHasData(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.truncateTable(testDatabaseName, tbl)
      sqlMetastoreOperations.tableHasData(testDatabaseName, tbl) mustBe false
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly findTablesLike") {
      val tbl1 = "like_alpha_table"
      val tbl2 = "like_beta_table"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl1}")
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl2}")
      val found = sqlMetastoreOperations.findTablesLike(testDatabaseName, "like_*")
      found must contain(tbl1)
      found must contain(tbl2)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl1)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl2)
    }

    it("must correctly isView") {
      val tbl = "view_check_table"
      val view = "view_check_view"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      spark.sql(s"CREATE VIEW ${testDatabaseName}.${view} AS SELECT * FROM ${testDatabaseName}.${tbl}")
      sqlMetastoreOperations.isView(testDatabaseName, view) mustBe true
      sqlMetastoreOperations.isView(testDatabaseName, tbl) mustBe false
      spark.sql(s"DROP VIEW IF EXISTS ${testDatabaseName}.${view}")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly listViews") {
      val tbl = "views_list_table"
      val view = "views_list_view"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      spark.sql(s"CREATE VIEW ${testDatabaseName}.${view} AS SELECT * FROM ${testDatabaseName}.${tbl}")
      val views = sqlMetastoreOperations.listViews(testDatabaseName)
      views must contain(view)
      spark.sql(s"DROP VIEW IF EXISTS ${testDatabaseName}.${view}")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly executeQuery") {
      noException must be thrownBy sqlMetastoreOperations.executeQuery(s"SELECT 1")
    }

    it("must correctly getTableDescription") {
      val tbl = "describe_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val df = sqlMetastoreOperations.getTableDescription(testDatabaseName, tbl)
      df must not be null
      df.count() must be > 0L
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType") {
      val tbl = "type_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      sqlMetastoreOperations.getTableType(testDatabaseName, tbl) mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Delta
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getDeltaTableDescription") {
      val tbl = "delta_desc_test"
      spark.range(5).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val desc = sqlMetastoreOperations.getDeltaTableDescription(testDatabaseName, tbl)
      desc.format mustBe "delta"
      desc.name must include(tbl)
      desc.numFiles must be > 0L
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getCatalogTableDefinition") {
      val tbl = "catalog_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val catalog = sqlMetastoreOperations.getCatalogTableDefinition(testDatabaseName, tbl)
      catalog must not be null
      catalog.identifier.table mustBe tbl
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getLocation") {
      val tbl = "location_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val location = sqlMetastoreOperations.getLocation(testDatabaseName, tbl)
      location must not be null
      location.toString must include(tbl)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getLatestVersion") {
      val tbl = "version_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val version = sqlMetastoreOperations.getLatestVersion(testDatabaseName, tbl)
      version must be >= 0L
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getClosestCommitTimestamp") {
      val tbl = "commit_ts_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val futureTimestamp = Timestamp.valueOf("9999-12-31 00:00:00")
      val ts = sqlMetastoreOperations.getClosestCommitTimestamp(testDatabaseName, tbl, futureTimestamp)
      ts must not be null
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getClosestCommitTimestampFormatted") {
      val tbl = "commit_ts_fmt_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val futureTimestamp = Timestamp.valueOf("9999-12-31 00:00:00")
      val formatted = sqlMetastoreOperations.getClosestCommitTimestampFormatted(testDatabaseName, tbl, futureTimestamp)
      formatted must not be empty
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getPartitions") {
      val tbl = "partition_test"
      
      spark.range(1).toDF("id").withColumn("part_col", lit("a")).write.format("delta").partitionBy("part_col").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val partitions = sqlMetastoreOperations.getPartitions(testDatabaseName, tbl)
      partitions must contain("part_col")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly createTable with schema") {
      val tbl = "create_tbl_test"
      val loc = s"/tmp/SqlMetastoreOperationsTest-create-${System.currentTimeMillis}/warehouse/${testDatabaseName}/${tbl}"
      sqlMetastoreOperations.createTable(
        testDatabaseName, tbl,
        me.rakirahman.feeds.io.table.TableIOFileTypes.Delta,
        loc,
        Array(("id", "INT"), ("name", "STRING")),
        Array.empty,
        Array.empty
      )
      sqlMetastoreOperations.tableExists(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly createTable with partitions and options") {
      val tbl = "create_tbl_part_test"
      val loc = s"/tmp/SqlMetastoreOperationsTest-create2-${System.currentTimeMillis}/warehouse/${testDatabaseName}/${tbl}"
      sqlMetastoreOperations.createTable(
        testDatabaseName, tbl,
        me.rakirahman.feeds.io.table.TableIOFileTypes.Delta,
        loc,
        Array(("id", "INT"), ("name", "STRING"), ("year", "STRING")),
        Array("year"),
        Array(("delta.autoOptimize.optimizeWrite", "true"), ("delta.autoOptimize.autoCompact", "true"))
      )
      sqlMetastoreOperations.tableExists(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly listTablesInView") {
      val tbl = "view_tables_src"
      val view = "view_tables_view"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      spark.sql(s"CREATE VIEW ${testDatabaseName}.${view} AS SELECT * FROM ${testDatabaseName}.${tbl}")
      val tables = sqlMetastoreOperations.listTablesInView(testDatabaseName, view)
      tables.exists(_.contains(tbl)) mustBe true
      spark.sql(s"DROP VIEW IF EXISTS ${testDatabaseName}.${view}")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getCreateTableDefinition for a view") {
      val tbl = "ctd_src"
      val view = "ctd_view"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      spark.sql(s"CREATE VIEW ${testDatabaseName}.${view} AS SELECT * FROM ${testDatabaseName}.${tbl}")
      val definition = sqlMetastoreOperations.getCreateTableDefinition(testDatabaseName, view)
      assert(definition.nonEmpty)
      spark.sql(s"DROP VIEW IF EXISTS ${testDatabaseName}.${view}")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getDistinctPartitionValues") {
      val tbl = "dist_part_test"
      spark.range(1).toDF("id").withColumn("part_col", lit("x")).write.format("delta").partitionBy("part_col").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      spark.range(1).toDF("id").withColumn("part_col", lit("y")).write.format("delta").partitionBy("part_col").mode("append").saveAsTable(s"${testDatabaseName}.${tbl}")
      val values = sqlMetastoreOperations.getDistinctPartitionValues(testDatabaseName, tbl, "part_col")
      values must contain allOf ("x", "y")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly extractTablesInQuery") {
      val tbl = "extract_tbl_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val tables = sqlMetastoreOperations.extractTablesInQuery(s"SELECT * FROM ${testDatabaseName}.${tbl}")
      tables.exists(_.contains(tbl)) mustBe true
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly isEqual for identical DataFrames") {
      val df1 = spark.range(5).toDF("id")
      val df2 = spark.range(5).toDF("id")
      sqlMetastoreOperations.isEqual(df1, df2) mustBe true
    }

    it("must correctly isEqual for different DataFrames") {
      val df1 = spark.range(5).toDF("id")
      val df2 = spark.range(10).toDF("id")
      sqlMetastoreOperations.isEqual(df1, df2) mustBe false
    }

    it("must correctly mergeSchema with StructType") {
      val tbl = "merge_struct_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val newSchema = new StructType().add("id", LongType).add("new_col", StringType, true)
      noException must be thrownBy sqlMetastoreOperations.mergeSchema(testDatabaseName, tbl, newSchema)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly createDeltaTable") {
      val tbl = "create_delta_tbl_test"
      val loc = s"/tmp/SqlMetastoreOperationsTest-delta-${System.currentTimeMillis}/warehouse/${testDatabaseName}/${tbl}"
      spark.range(1).toDF("id").write.format("delta").save(loc)
      sqlMetastoreOperations.createDeltaTable(testDatabaseName, tbl, loc)
      sqlMetastoreOperations.tableExists(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType for a delta table") {
      val tbl = "table_type_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val tableType = sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      tableType mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Delta
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType for a parquet table") {
      val tbl = "table_type_parquet_test"
      spark.range(1).toDF("id").write.format("parquet").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val tableType = sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      tableType mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Parquet
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType for a csv table") {
      val tbl = "table_type_csv_test"
      val loc = s"/tmp/SqlMetastoreOperationsTest-csv-${System.currentTimeMillis}"
      spark.range(1).toDF("id").write.format("csv").option("header", "true").save(loc)
      spark.sql(s"CREATE TABLE ${testDatabaseName}.${tbl} (id STRING) USING csv LOCATION '${loc}'")
      val tableType = sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      tableType mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Csv
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType for a json table") {
      val tbl = "table_type_json_test"
      val loc = s"/tmp/SqlMetastoreOperationsTest-json-${System.currentTimeMillis}"
      spark.range(1).toDF("id").write.format("json").save(loc)
      spark.sql(s"CREATE TABLE ${testDatabaseName}.${tbl} (id STRING) USING json LOCATION '${loc}'")
      val tableType = sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      tableType mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Json
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType for an orc table") {
      val tbl = "table_type_orc_test"
      spark.range(1).toDF("id").write.format("orc").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val tableType = sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      tableType mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Orc
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getTableType for a text table") {
      val tbl = "table_type_text_test"
      val loc = s"/tmp/SqlMetastoreOperationsTest-text-${System.currentTimeMillis}"
      spark.createDataFrame(Seq(Tuple1("hello"))).toDF("value").write.format("text").save(loc)
      spark.sql(s"CREATE TABLE ${testDatabaseName}.${tbl} (value STRING) USING text LOCATION '${loc}'")
      val tableType = sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      tableType mustBe me.rakirahman.feeds.io.table.TableIOFileTypes.Text
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getDeltaTableDescription with fields") {
      val tbl = "delta_desc_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val desc = sqlMetastoreOperations.getDeltaTableDescription(testDatabaseName, tbl)
      desc.format mustBe "delta"
      desc.numFiles must be >= 0L
      desc.sizeInBytes must be >= 0L
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getDeltaTableProperty") {
      val tbl = "delta_prop_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val result = sqlMetastoreOperations.getDeltaTableProperty(testDatabaseName, tbl, "nonexistent.property")
      result mustBe None
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly getCreateTableDefinition") {
      val tbl = "create_def_test"
      spark.range(1).toDF("id").write.format("parquet").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val definition = sqlMetastoreOperations.getCreateTableDefinition(testDatabaseName, tbl)
      definition must include("CREATE TABLE")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly createTable with existing path") {
      val tbl = "create_tbl_existing_path"
      val loc = s"/tmp/SqlMetastoreOperationsTest-existpath-${System.currentTimeMillis}/warehouse/${testDatabaseName}/${tbl}"
      spark.range(1).toDF("id").write.format("delta").save(loc)
      sqlMetastoreOperations.createTable(
        testDatabaseName, tbl,
        me.rakirahman.feeds.io.table.TableIOFileTypes.Delta,
        loc,
        Array(("id", "INT")),
        Array.empty,
        Array.empty
      )
      sqlMetastoreOperations.tableExists(testDatabaseName, tbl) mustBe true
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly mergeSchema with column array when no changes needed") {
      val tbl = "merge_schema_arr_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      noException must be thrownBy sqlMetastoreOperations.mergeSchema(
        testDatabaseName, tbl, Array(("id", "BIGINT")), Array.empty[String]
      )
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must throw on breaking schema changes in mergeSchema with column array") {
      val tbl = "merge_schema_break_test"
      spark.range(1).toDF("id").withColumn("extra", lit("x")).write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val ex = the[RuntimeException] thrownBy sqlMetastoreOperations.mergeSchema(
        testDatabaseName, tbl, Array(("id", "BIGINT")), Array.empty[String]
      )
      ex.getMessage must include("Breaking schema changes")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly isEqual when schemas differ") {
      val df1 = spark.range(5).toDF("id")
      val df2 = spark.range(5).toDF("value")
      sqlMetastoreOperations.isEqual(df1, df2) mustBe false
    }

    it("must correctly tableExistsAtPath for delta") {
      val loc = s"/tmp/SqlMetastoreOperationsTest-existpath2-${System.currentTimeMillis}"
      spark.range(1).toDF("id").write.format("delta").save(loc)
      sqlMetastoreOperations.tableExistsAtPath(loc, me.rakirahman.feeds.io.table.TableIOFileTypes.Delta) mustBe true
    }

    it("must return false for tableExistsAtPath when path does not exist") {
      val loc = s"/tmp/nonexistent-path-${System.currentTimeMillis}"
      sqlMetastoreOperations.tableExistsAtPath(loc, me.rakirahman.feeds.io.table.TableIOFileTypes.Delta) mustBe false
    }

    it("must return false for tableExists when database does not exist") {
      sqlMetastoreOperations.tableExists("nonexistent_db_xyz", "some_table") mustBe false
    }

    it("must return empty for listTables when database does not exist") {
      sqlMetastoreOperations.listTables("nonexistent_db_xyz") mustBe empty
    }

    it("must return empty for listTablesWithPrefix when database does not exist") {
      sqlMetastoreOperations.listTablesWithPrefix("nonexistent_db_xyz", "prefix") mustBe empty
    }

    it("must return empty for findTablesLike when database does not exist") {
      sqlMetastoreOperations.findTablesLike("nonexistent_db_xyz", "pattern") mustBe empty
    }

    it("must return false for tableHasData when database does not exist") {
      sqlMetastoreOperations.tableHasData("nonexistent_db_xyz", "some_table") mustBe false
    }

    it("must return false for isView when database does not exist") {
      sqlMetastoreOperations.isView("nonexistent_db_xyz", "some_view") mustBe false
    }

    it("must return empty for listViews when database does not exist") {
      sqlMetastoreOperations.listViews("nonexistent_db_xyz") mustBe empty
    }

    it("must throw for unsupported getTableType") {
      val tbl = "table_type_unsupported_test"
      spark.range(1).toDF("id").write.format("parquet").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      noException must be thrownBy sqlMetastoreOperations.getTableType(testDatabaseName, tbl)
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must correctly mergeSchema with partition that already exists") {
      val tbl = "merge_schema_part_exists_test"
      spark.range(1).toDF("id").withColumn("part_col", lit("x")).write.format("delta").partitionBy("part_col").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      noException must be thrownBy sqlMetastoreOperations.mergeSchema(
        testDatabaseName, tbl, Array(("id", "BIGINT"), ("part_col", "STRING")), Array("part_col")
      )
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must throw on breaking partition changes in mergeSchema") {
      val tbl = "merge_schema_part_break_test"
      spark.range(1).toDF("id").withColumn("part_col", lit("x")).write.format("delta").partitionBy("part_col").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val ex = the[RuntimeException] thrownBy sqlMetastoreOperations.mergeSchema(
        testDatabaseName, tbl, Array(("id", "BIGINT")), Array.empty[String]
      )
      ex.getMessage must include("Breaking")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }

    it("must throw on new partition in mergeSchema") {
      val tbl = "merge_schema_new_part_test"
      spark.range(1).toDF("id").write.format("delta").mode("overwrite").saveAsTable(s"${testDatabaseName}.${tbl}")
      val ex = the[RuntimeException] thrownBy sqlMetastoreOperations.mergeSchema(
        testDatabaseName, tbl, Array(("id", "BIGINT")), Array("new_partition")
      )
      ex.getMessage must include("partition")
      sqlMetastoreOperations.dropTable(testDatabaseName, tbl)
    }
  }
}
