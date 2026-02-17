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
class SqlMetastoreOperationsTest
    extends AnyFunSpec
    with Matchers
    with BeforeAndAfterAll
    with BeforeAndAfterEach
    with TableDrivenPropertyChecks {

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
        Seq(("foo", 1), ("bar", 2)).toDF("text", "num")
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
        Seq(("foo", 1), ("bar", 2)).toDF("text", "num")
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
          currentSchema.toSeq.drop(columnsToDrop).toArray ++ keyValueArray.map(keyValue =>
            (keyValue, "STRING")
          )

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
  }
}
