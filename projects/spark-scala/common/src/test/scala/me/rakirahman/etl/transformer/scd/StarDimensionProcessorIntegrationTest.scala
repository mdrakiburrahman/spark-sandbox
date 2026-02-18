package me.rakirahman.etl.transformer.scd

// @formatter: off
import me.rakirahman.etl.transformer.scd.processor._
import me.rakirahman.etl.transformer.scd.SCDTransformationMetadata.{KeyGenInfo, NonSCDTransformationInfo, SCDTransformationInfo}
import me.rakirahman.etl.transformer.scd.transformations.SCDTransformations
import me.rakirahman.feeds.schema.extensions.StarDimension2SchemaExtensions._
import me.rakirahman.feeds.schema.StarDimension2Schema
import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.quality.integrity.handler.SparkKeyMetadataCalculator
import org.apache.spark.sql.{DataFrame, Row, SparkSession}
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._
import org.scalatest.{BeforeAndAfterAll, BeforeAndAfterEach}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers
// @formatter: on

/** Integration tests for SCD Star Dimension Processing with celebrity data.
  */
class StarDimensionProcessorIntegrationTest extends AnyFunSpec with Matchers with BeforeAndAfterAll with BeforeAndAfterEach {

  var metadataCalculator: SparkKeyMetadataCalculator = _
  var spark: SparkSession = _
  var sqlMetastoreOperations: SqlMetastoreOperations = _
  val testDatabaseName = "test_scd_star_dim_db"
  val warehouseDir = s"/tmp/StarDimensionProcessorIntegrationTest-${System.currentTimeMillis}"

  /** Fixture runs before each testcase.
    */
  override def beforeEach(): Unit = {
    sqlMetastoreOperations.createDatabase(testDatabaseName)
    super.beforeEach()
  }

  /** Fixture runs after each testcase.
    */
  override def afterEach(): Unit = {
    sqlMetastoreOperations.dropDatabase(testDatabaseName)
    super.afterEach()
  }

  /** Fixture runs before all tests.
    */
  // @formatter:off
  override def beforeAll(): Unit = {
    System.setProperty("hadoop.home.dir", "/")
    spark = SparkSession
      .builder()
      .master("local[*]")
      .appName("StarDimensionProcessorIntegrationTest")
      .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
      .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
      .config("spark.sql.warehouse.dir", s"${warehouseDir}/warehouse")
      .config("spark.driver.host", "localhost")
      .config("spark.ui.enabled", "false")
      .getOrCreate()

    spark.sql("set spark.sql.legacy.timeParserPolicy=CORRECTED")
    spark.sql("set spark.sql.parquet.int96RebaseModeInWrite=CORRECTED")

    sqlMetastoreOperations = SqlMetastoreOperations(spark)
    metadataCalculator = SparkKeyMetadataCalculator(spark, sqlMetastoreOperations)

    super.beforeAll()
  }
  // @formatter:on

  /** Fixture runs after all tests.
    */
  override def afterAll(): Unit = {
    if (spark != null) spark.stop()
    super.afterAll()
  }

  describe("SCDDeltaUpsertDataFrameProcessor and SparkKeyMetadataCalculator") {

    // @formatter:off
    val timestampFormat =               "yyyy-MM-dd HH:mm:ss"
    val originalTableCreationTime =     "2024-01-01 00:00:00"
    val originalScdPerformedTime =      "2024-01-02 00:00:00"
    val firstScdPerformedTime =         "2024-01-03 00:00:00"
    val secondScdPerformedTime =        "2024-01-04 00:00:00"
    val endOfTime =                     "9999-12-31 12:00:00"

    val serialDdlTestFormats: List[(StarDimension2Schema, String, Seq[Row], Seq[Row], Seq[Row], Seq[Row], StructType, StructType, StructType, String, String, String, String, String, String)] = List(
      (
        CelebDim,
        "contains row that should not be injected due to matched row_effective_start",
        Seq(Row(1,    "elon musk",       "south africa",         "pretoria",         true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime),
            Row(2,    "jeff bezos",      "us",                   "albuquerque",      true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime)),
        Seq(Row(1,    "elon musk",       "canada",               "montreal",                     firstScdPerformedTime,              firstScdPerformedTime),
            Row(4,    "dhh",             "us",                   "chicago",                      firstScdPerformedTime,              firstScdPerformedTime)),
        Seq(Row(1,    "elon musk",       "antarctica",           "frozen",                       originalTableCreationTime,          originalTableCreationTime),                                        // this should not get injected due to stale date
            Row(6,    "zuck",            "us",                   "california",                   secondScdPerformedTime,             secondScdPerformedTime),
            Row(3,    "bill gates",      "us",                   "connecticut",                  secondScdPerformedTime,             secondScdPerformedTime)),
        Seq(Row(1,    "elon musk",       "canada",               "montreal"),
            Row(2,    "jeff bezos",      "us",                   "albuquerque"),
            Row(3,    "bill gates",      "us",                   "connecticut"),
            Row(4,    "dhh",             "us",                   "chicago"),
            Row(6,    "zuck",            "us",                   "california")),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType), StructField("is_row_effective", BooleanType), StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType), StructField("row_effective_end", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType),                                               StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType))),
        "celeb_id, name, country, region", "celeb_key", CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap("celeb_key"), "celeb_dim", "celeb_id", "row_effective_start"
      ),
      (
        CelebDim,
        "contains bad data with a second effective row on purpose",
        Seq(Row(1,    "elon musk",       "south africa",         "pretoria",         true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime),
            Row(2,    "jeff bezos",      "us",                   "albuquerque",      true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime),
            Row(3,    "bill gates",      "us",                   "seattle",          false,      originalTableCreationTime,          originalTableCreationTime,        originalScdPerformedTime),
            Row(3,    "bill gates",      "us",                   "medina",           true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime),
            Row(3,    "bill gates",      "us",                   "redmond",          true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime)),                      // bad data with a second true on purpose
        Seq(Row(1,    "elon musk",       "canada",               "montreal",                     firstScdPerformedTime,              firstScdPerformedTime),
            Row(4,    "dhh",             "us",                   "chicago",                      firstScdPerformedTime,              firstScdPerformedTime),
            Row(2,    "jeff bezos",      "us",                   "albuquerque",                  firstScdPerformedTime,              firstScdPerformedTime)),
        Seq(Row(1,    "elon musk",       "south africa",         "pretoria",                     secondScdPerformedTime,             secondScdPerformedTime),
            Row(6,    "zuck",            "us",                   "california",                   secondScdPerformedTime,             secondScdPerformedTime),
            Row(3,    "bill gates",      "us",                   "connecticut",                  secondScdPerformedTime,             secondScdPerformedTime)),
        Seq(Row(1,    "elon musk",       "south africa",         "pretoria"),
            Row(2,    "jeff bezos",      "us",                   "albuquerque"),
            Row(3,    "bill gates",      "us",                   "connecticut"),
            Row(4,    "dhh",             "us",                   "chicago"),
            Row(6,    "zuck",            "us",                   "california")),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType), StructField("is_row_effective", BooleanType), StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType), StructField("row_effective_end", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType),                                               StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType))),
        "celeb_id, name, country, region", "celeb_key", CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap("celeb_key"), "celeb_dim", "celeb_id", "row_effective_start"
      ),
      (
        CelebProfileDim,
        "celeb profile dimension with nullable columns and null-safe matching",
        Seq(Row(101,    "taylor swift",     "us",       "nashville",     "singer",        "Eras Tour",       true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime)),
        Seq(Row(101,    "taylor swift",     "us",       "new york",      "singer",        null,                          firstScdPerformedTime,              firstScdPerformedTime)),
        Seq(Row(101,    "taylor swift",     "us",       "los angeles",   "entertainer",   "Eras Tour II",                secondScdPerformedTime,             secondScdPerformedTime)),
        Seq(Row(101,    "taylor swift",     "us",       "los angeles",   "entertainer",   "Eras Tour II")),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType), StructField("profession", StringType), StructField("current_project", StringType), StructField("is_row_effective", BooleanType), StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType), StructField("row_effective_end", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType), StructField("profession", StringType), StructField("current_project", StringType),                                               StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("country", StringType), StructField("region", StringType), StructField("profession", StringType), StructField("current_project", StringType))),
        "celeb_id, name, country, region, profession, current_project", "celeb_profile_key", CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap("celeb_profile_key"), "celeb_profile_dim", "celeb_id", "row_effective_start"
      ),
      (
        CelebNetWorthDim,
        "celeb net worth dimension with integer columns tracking value changes",
        Seq(Row(201,    "oprah winfrey",     2500,     "media",       true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime),
            Row(202,    "beyonce",           450,      "music",       true,       originalTableCreationTime,          originalTableCreationTime,        endOfTime)),
        Seq(Row(201,    "oprah winfrey",     2600,     "media",                   firstScdPerformedTime,              firstScdPerformedTime),
            Row(203,    "rihanna",           1700,     "fashion",                 firstScdPerformedTime,              firstScdPerformedTime)),
        Seq(Row(202,    "beyonce",           500,      "music",                   secondScdPerformedTime,             secondScdPerformedTime),
            Row(201,    "oprah winfrey",     2700,     "media",                   secondScdPerformedTime,             secondScdPerformedTime)),
        Seq(Row(201,    "oprah winfrey",     2700,     "media"),
            Row(202,    "beyonce",           500,      "music"),
            Row(203,    "rihanna",           1700,     "fashion")),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("net_worth_millions", IntegerType), StructField("industry", StringType), StructField("is_row_effective", BooleanType), StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType), StructField("row_effective_end", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("net_worth_millions", IntegerType), StructField("industry", StringType),                                               StructField("gold_ingest_time", StringType), StructField("row_effective_start", StringType))),
        StructType(Seq(StructField("celeb_id", IntegerType), StructField("name", StringType), StructField("net_worth_millions", IntegerType), StructField("industry", StringType))),
        "celeb_id, name, net_worth_millions, industry", "celeb_net_worth_key", CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap("celeb_net_worth_key"), "celeb_net_worth_dim", "celeb_id", "row_effective_start"
      ),
    )
    // @formatter:on

    /** A helper function to test the SCD UPSERT functionality for various table types.
      */
    def ddlTestFunc(
        schema: StarDimension2Schema,
        testTwist: String,
        originalContent: Seq[Row],
        firstUpdates: Seq[Row],
        secondUpdates: Seq[Row],
        dataValidations: Seq[Row],
        originalSchema: StructType,
        updateSchema: StructType,
        validationSchema: StructType,
        validationQuery: String,
        primaryKey: String,
        primaryKeyHashCalc: String,
        tableName: String,
        naturalKeyCol: String,
        scdEffectiveStartCol: String
    ): Unit = {

      // Setup
      //
      val scdProcessor = SCDDeltaUpsertDataFrameProcessor(spark, CelebSCDTransformationMetadataMappings)

      spark
        .createDataFrame(spark.sparkContext.parallelize(originalContent), originalSchema)
        .transform(SCDTransformations.withVersionedPrimaryKey(schema))
        .withColumn(primaryKey, expr(primaryKeyHashCalc))
        .withColumn("gold_ingest_time", to_timestamp(col("gold_ingest_time"), timestampFormat))
        .withColumn("row_effective_start", to_timestamp(col("row_effective_start"), timestampFormat))
        .withColumn("row_effective_end", to_timestamp(col("row_effective_end"), timestampFormat))
        .write
        .format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(s"${testDatabaseName}.${tableName}")

      // Exercise
      //
      List((firstUpdates), (secondUpdates)).foreach {
        case (updateData) => {
          val updateDF = spark
            .createDataFrame(spark.sparkContext.parallelize(updateData), updateSchema)
            .transform(SCDTransformations.withVersionedPrimaryKey(schema))
            .withColumn(primaryKey, expr(primaryKeyHashCalc))
            .withColumn("gold_ingest_time", to_timestamp(col("gold_ingest_time"), timestampFormat))
            .withColumn("row_effective_start", to_timestamp(col("row_effective_start"), timestampFormat))

          scdProcessor.processTableDim(
            sourceDF = updateDF,
            destinationDatabase = testDatabaseName,
            destinationTableName = tableName,
            sourceNaturalKeyCol = naturalKeyCol,
            destinationNaturalKeyCol = naturalKeyCol,
            timestampOrderCol = scdEffectiveStartCol,
            colScdEffectiveStartTimeName = scdEffectiveStartCol
          )
        }
      }
      // @formatter:on

      // Validate
      //
      assert(
        spark
          .sql(s"""|SELECT * FROM ${testDatabaseName}.${tableName}
                             |WHERE  is_row_effective = true
                             |  AND  row_effective_end != '${endOfTime}'
                             |""".stripMargin)
          .count() == 0,
        s"Found rows with is_row_effective = true, but row_effective_end != '${endOfTime}'"
      )

      assert(
        spark
          .sql(s"""|SELECT * FROM ${testDatabaseName}.${tableName}
                             |WHERE ${naturalKeyCol} IN (
                             |    SELECT ${naturalKeyCol}
                             |    FROM ${testDatabaseName}.${tableName}
                             |    WHERE is_row_effective IS TRUE
                             |    GROUP BY ${naturalKeyCol}
                             |    HAVING COUNT(*) > 1
                             |)
                             |""".stripMargin)
          .count() == 0,
        "Found multiple natural keys with is_row_effective = true"
      )

      val expectedValuesDF = spark.createDataFrame(spark.sparkContext.parallelize(dataValidations), validationSchema)
      val actualValuesDF = spark.sql(s"""|SELECT ${validationQuery}
                                           |FROM ${testDatabaseName}.${tableName}
                                           |WHERE is_row_effective IS TRUE
                                           |""".stripMargin)

      assert(actualValuesDF.collect().toSet == expectedValuesDF.collect().toSet, "One or more rows have incorrect values after UPSERT.")

      val duplicatePkCount = metadataCalculator.getDuplicateKeyCount(testDatabaseName, tableName, primaryKey)
      val expiredDuplicatePkCount = metadataCalculator.getScdExpiredDuplicateKeyCount(testDatabaseName, tableName, primaryKey, "is_row_effective")

      assert(
        duplicatePkCount - expiredDuplicatePkCount == 0,
        s"Found non-expired duplicate primary keys in the table even though they should never exist; Total: ${duplicatePkCount} | Expired: ${expiredDuplicatePkCount}."
      )
    }

    serialDdlTestFormats.foreach {
      case (schema, testTwist, originalContent, firstUpdates, secondUpdates, dataValidations, originalSchema, updateSchema, validationSchema, validationQuery, primaryKey, primaryKeyHashCalc, tableName, naturalKeyCol, scdEffectiveStartCol) => {
        it(s"must be able to SCD UPSERT ${tableName} dimension table in serial: ${testTwist}") {
          ddlTestFunc(
            schema,
            testTwist,
            originalContent,
            firstUpdates,
            secondUpdates,
            dataValidations,
            originalSchema,
            updateSchema,
            validationSchema,
            validationQuery,
            primaryKey,
            primaryKeyHashCalc,
            tableName,
            naturalKeyCol,
            scdEffectiveStartCol
          )
        }
      }
    }

    it("must generate deterministic and unique primary keys per hash version") {

      val session = spark
      import session.implicits._

      val df = Seq((1, "elon musk", "south africa", "pretoria", true, originalTableCreationTime, endOfTime))
        .toDF("celeb_id", "name", "country", "region", "is_row_effective", "row_effective_start", "row_effective_end")

      val schema = CelebDim
      val pk = schema.primaryKey._1
      val pkv = schema.primaryKeyHashVersionColumn._1

      val dfV1 = df
        .withColumn(pkv, lit(1))
        .withColumn(pk, expr(CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap(pk)))

      val dfV2 = df
        .withColumn(pkv, lit(1))
        .withColumn(pk, expr(CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap(pk)))

      val dfV3 = df
        .withColumn(pkv, lit(3))
        .withColumn(pk, expr(CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap(pk)))

      assert(dfV1.select(pk).collect().head(0) == dfV2.select(pk).collect().head(0), "Received different primary keys for same hash version.")
      assert(dfV3.select(pk).collect().head(0) != dfV2.select(pk).collect().head(0), "Received same primary keys for different hash version.")
    }

    it("must be able to identify non-expired duplicate primary keys") {

      // Setup
      //
      val primaryKey = "celeb_key"

      val session = spark
      import session.implicits._

      // Exercise: Original table with no duplicates
      //
      Seq(
        (1, "elon musk", "south africa", "pretoria", true, originalTableCreationTime, endOfTime),
        (2, "jeff bezos", "us", "albuquerque", true, originalTableCreationTime, endOfTime),
        (3, "bill gates", "us", "seattle", true, originalTableCreationTime, endOfTime)
      ).toDF("celeb_id", "name", "country", "region", "is_row_effective", "row_effective_start", "row_effective_end")
        .transform(SCDTransformations.withVersionedPrimaryKey(CelebDim))
        .withColumn(primaryKey, expr(CelebSCDTransformationMetadataMappings.SurrogateColumnToHashMap(primaryKey)))
        .withColumn("row_effective_start", to_timestamp(col("row_effective_start"), timestampFormat))
        .withColumn("row_effective_end", to_timestamp(col("row_effective_end"), timestampFormat))
        .write
        .format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(s"${testDatabaseName}.celeb_dim")
      assert(
        metadataCalculator.getDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey) == 0,
        "Found duplicate primary keys in the table even though they should not exist right now."
      )
      assert(
        metadataCalculator.getScdExpiredDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey, "is_row_effective") == 0,
        "Found expired duplicate primary keys in the table even though they should not exist right now."
      )

      // Exercise: Force insert non-effective duplicates for bill
      //
      val billPk = spark.sql(s"SELECT ${primaryKey} FROM ${testDatabaseName}.celeb_dim WHERE celeb_id = 3").collect().head.getString(0)
      val numIneffectiveDuplicatesBill = 2
      for (i <- 1 to numIneffectiveDuplicatesBill) {
        spark.sql(s"""INSERT INTO ${testDatabaseName}.celeb_dim
                             (celeb_id,
                              name,
                              country,
                              region,
                              is_row_effective,
                              row_effective_start,
                              row_effective_end,
                              ${primaryKey},
                              ${CelebDim.primaryKeyHashVersionColumn._1})
                      VALUES (3,
                              'bill gates',
                              'us',
                              'seattle',
                              false,
                              '${firstScdPerformedTime}',
                              '${endOfTime}',
                              '${billPk}',
                              2)
                  """)
        assert(metadataCalculator.getDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey) == i + 1, "Did not find expected duplicate primary keys in the table.")
        assert(
          metadataCalculator.getScdExpiredDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey, "is_row_effective") == i + 1,
          "Did not find expected expired duplicate primary keys in the table."
        )
      }

      // Exercise: Force insert effective duplicates for bill
      //
      spark.sql(s"""INSERT INTO ${testDatabaseName}.celeb_dim
                             (celeb_id,
                              name,
                              country,
                              region,
                              is_row_effective,
                              row_effective_start,
                              row_effective_end,
                              ${primaryKey},
                              ${CelebDim.primaryKeyHashVersionColumn._1})
                      VALUES (3,
                              'bill gates',
                              'us',
                              'seattle',
                              true,
                              '${firstScdPerformedTime}',
                              '${endOfTime}',
                              '${billPk}',
                              2)
                  """)

      val numTotalDuplicateKeysBill = 1 + numIneffectiveDuplicatesBill + 1 // Original + Ineffective + Effective
      assert(
        metadataCalculator.getDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey) ==
          numTotalDuplicateKeysBill,
        "Did not find expected duplicate primary keys in the table."
      )
      assert(
        metadataCalculator.getScdExpiredDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey, "is_row_effective") ==
          0, // The Effective insert above has nullified integrity
        "Did not find expected expired duplicate primary keys in the table."
      )

      // Exercise: Force insert non-effective duplicates for jeff bezos
      // This proves that keys scale independently despite having bad data present in other keys.
      //
      val jeffPk = spark.sql(s"SELECT ${primaryKey} FROM ${testDatabaseName}.celeb_dim WHERE celeb_id = 2 AND is_row_effective = true").collect().head.getString(0)
      val numIneffectiveDuplicatesJeff = 3
      for (i <- 1 to numIneffectiveDuplicatesJeff) {
        spark.sql(s"""INSERT INTO ${testDatabaseName}.celeb_dim
                             (celeb_id,
                              name,
                              country,
                              region,
                              is_row_effective,
                              row_effective_start,
                              row_effective_end,
                              ${primaryKey},
                              ${CelebDim.primaryKeyHashVersionColumn._1})
                      VALUES (2,
                              'jeff bezos',
                              'us',
                              'albuquerque',
                              false,
                              '${firstScdPerformedTime}',
                              '${endOfTime}',
                              '${jeffPk}',
                              2)
                  """)
        assert(
          metadataCalculator.getDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey) ==
            numTotalDuplicateKeysBill + i + 1,
          "Did not find expected duplicate primary keys in the table."
        )
        assert(
          metadataCalculator.getScdExpiredDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey, "is_row_effective") ==
            i + 1,
          "Did not find expected expired duplicate primary keys in the table."
        )
      }

      // Exercise: Force insert effective duplicates for jeff
      //
      spark.sql(s"""INSERT INTO ${testDatabaseName}.celeb_dim
                             (celeb_id,
                              name,
                              country,
                              region,
                              is_row_effective,
                              row_effective_start,
                              row_effective_end,
                              ${primaryKey},
                              ${CelebDim.primaryKeyHashVersionColumn._1})
                      VALUES (2,
                              'jeff bezos',
                              'us',
                              'albuquerque',
                              true,
                              '${firstScdPerformedTime}',
                              '${endOfTime}',
                              '${jeffPk}',
                              2)
                  """)

      val numTotalDuplicateKeysJeff = 1 + numIneffectiveDuplicatesJeff + 1 // Original + Ineffective + Effective
      assert(
        metadataCalculator.getDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey) ==
          numTotalDuplicateKeysBill + numTotalDuplicateKeysJeff,
        "Did not find expected duplicate primary keys in the table."
      )
      assert(
        metadataCalculator.getScdExpiredDuplicateKeyCount(testDatabaseName, "celeb_dim", primaryKey, "is_row_effective") ==
          0, // The Effective insert above has nullified integrity
        "Did not find expected expired duplicate primary keys in the table."
      )
    }

  }

  describe("SCDDeltaUpsertDataFrameProcessor.processTableFact") {

    // @formatter:off
    it("must select configured columns, deduplicate by primary key, and register temp view") {

        val scdProcessor = SCDDeltaUpsertDataFrameProcessor(spark, CelebSCDTransformationMetadataMappings)

        val session = spark
        import session.implicits._

        val sourceDF = Seq(
            (1, 100, "concert",   "2024-01-01", 50000),
            (2, 200, "gala",      "2024-01-02", 75000),
            (3, 100, "premiere",  "2024-01-03", 30000),
            (1, 100, "concert",   "2024-01-01", 50000)   // duplicate event_id = 1
        ).toDF("event_id", "celeb_id", "event_name", "event_date", "revenue")

        val resultDF = scdProcessor.processTableFact(
            sourceDF = sourceDF,
            destinationDatabase = testDatabaseName,
            destinationTableName = "celeb_event_fact",
            incomingTableName = "incoming_celeb_events",
            integrityQuery = "SELECT * FROM incoming_celeb_events",
            primaryKeyColumnName = "event_id"
        )

        val resultRows = resultDF.collect()
        assert(resultRows.length == 3, s"Expected 3 rows after deduplication, got ${resultRows.length}")
        assert(resultDF.columns.toSet == Set("event_id", "celeb_id", "event_name", "event_date", "revenue"), "Result DataFrame should contain exactly the configured fact columns")
    }

    it("must apply referential integrity query to filter fact rows against dimension") {

        val scdProcessor = SCDDeltaUpsertDataFrameProcessor(spark, CelebSCDTransformationMetadataMappings)

        val session = spark
        import session.implicits._

        Seq(
            (100, "elon musk"),
            (200, "jeff bezos")
        ).toDF("celeb_id", "name")
         .write.format("delta").mode("overwrite").option("overwriteSchema", "true")
         .saveAsTable(s"${testDatabaseName}.celeb_lookup")

        val sourceDF = Seq(
            (1, 100, "concert",   "2024-01-01", 50000),
            (2, 200, "gala",      "2024-01-02", 75000),
            (3, 300, "premiere",  "2024-01-03", 30000),  // celeb_id 300 not in dimension
            (4, 100, "charity",   "2024-01-04", 20000)
        ).toDF("event_id", "celeb_id", "event_name", "event_date", "revenue")

        val resultDF = scdProcessor.processTableFact(
            sourceDF = sourceDF,
            destinationDatabase = testDatabaseName,
            destinationTableName = "celeb_event_fact",
            incomingTableName = "incoming_celeb_events",
            integrityQuery = s"""|SELECT f.*
                                 |FROM incoming_celeb_events f
                                 |INNER JOIN ${testDatabaseName}.celeb_lookup d
                                 |ON f.celeb_id = d.celeb_id
                                 |""".stripMargin,
            primaryKeyColumnName = "event_id"
        )

        val resultRows = resultDF.collect()
        assert(resultRows.length == 3, s"Expected 3 rows after integrity filter (celeb_id 300 excluded), got ${resultRows.length}")

        val eventIds = resultDF.select("event_id").collect().map(_.getInt(0)).toSet
        assert(eventIds == Set(1, 2, 4), s"Expected event_ids {1, 2, 4} but got ${eventIds}")
    }

    it("must handle duplicates in integrity query result by deduplicating on primary key") {

        val scdProcessor = SCDDeltaUpsertDataFrameProcessor(spark, CelebSCDTransformationMetadataMappings)

        val session = spark
        import session.implicits._

        Seq(
            (100, "elon musk",  "tech"),
            (100, "elon musk",  "space")
        ).toDF("celeb_id", "name", "industry")
         .write.format("delta").mode("overwrite").option("overwriteSchema", "true")
         .saveAsTable(s"${testDatabaseName}.celeb_multi_lookup")

        val sourceDF = Seq(
            (1, 100, "concert",   "2024-01-01", 50000),
            (2, 100, "gala",      "2024-01-02", 75000)
        ).toDF("event_id", "celeb_id", "event_name", "event_date", "revenue")

        val resultDF = scdProcessor.processTableFact(
            sourceDF = sourceDF,
            destinationDatabase = testDatabaseName,
            destinationTableName = "celeb_event_fact",
            incomingTableName = "incoming_celeb_events",
            integrityQuery = s"""|SELECT f.*
                                 |FROM incoming_celeb_events f
                                 |INNER JOIN ${testDatabaseName}.celeb_multi_lookup d
                                 |ON f.celeb_id = d.celeb_id
                                 |""".stripMargin,
            primaryKeyColumnName = "event_id"
        )
        val resultRows = resultDF.collect()
        assert(resultRows.length == 2, s"Expected 2 rows after deduplication, got ${resultRows.length}")
    }

    it("must return empty DataFrame when no rows pass integrity check") {

        val scdProcessor = SCDDeltaUpsertDataFrameProcessor(spark, CelebSCDTransformationMetadataMappings)

        val session = spark
        import session.implicits._

        Seq((999, "nobody")).toDF("celeb_id", "name")
         .write.format("delta").mode("overwrite").option("overwriteSchema", "true")
         .saveAsTable(s"${testDatabaseName}.celeb_empty_lookup")

        val sourceDF = Seq(
            (1, 100, "concert",   "2024-01-01", 50000),
            (2, 200, "gala",      "2024-01-02", 75000)
        ).toDF("event_id", "celeb_id", "event_name", "event_date", "revenue")

        val resultDF = scdProcessor.processTableFact(
            sourceDF = sourceDF,
            destinationDatabase = testDatabaseName,
            destinationTableName = "celeb_event_fact",
            incomingTableName = "incoming_celeb_events",
            integrityQuery =  s"""|SELECT f.*
                                  |FROM incoming_celeb_events f
                                  |INNER JOIN ${testDatabaseName}.celeb_empty_lookup d
                                  |ON f.celeb_id = d.celeb_id
                                  |""".stripMargin,
            primaryKeyColumnName = "event_id"
        )

        assert(resultDF.isEmpty, "Expected empty DataFrame when no rows pass integrity check")
    }

    it("must only select columns defined in FactTransformationTableInfoMap, ignoring extra source columns") {

        val scdProcessor = SCDDeltaUpsertDataFrameProcessor(spark, CelebSCDTransformationMetadataMappings)

        val session = spark
        import session.implicits._

        val sourceDF = Seq(
            (1, 100, "concert",   "2024-01-01", 50000, "extra_data_1", 999),
            (2, 200, "gala",      "2024-01-02", 75000, "extra_data_2", 888)
        ).toDF("event_id", "celeb_id", "event_name", "event_date", "revenue", "extra_col", "another_col")

        val integrityQuery = "SELECT * FROM incoming_celeb_events_extra"
        val resultDF = scdProcessor.processTableFact(
            sourceDF = sourceDF,
            destinationDatabase = testDatabaseName,
            destinationTableName = "celeb_event_fact",
            incomingTableName = "incoming_celeb_events_extra",
            integrityQuery = integrityQuery,
            primaryKeyColumnName = "event_id"
        )

        assert(!resultDF.columns.contains("extra_col"), "extra_col should not be in result")
        assert(!resultDF.columns.contains("another_col"), "another_col should not be in result")
        assert(resultDF.columns.toSet == Set("event_id", "celeb_id", "event_name", "event_date", "revenue"), "Result should contain only the fact-mapped columns")
    }
    // @formatter:on

  }
}

// @formatter:off

/** Celeb dimension schema.
  */
object CelebDim extends StarDimension2Schema {
  val tableName = "celeb_dim"
  val primaryKeyHashVersionValue = 1
  val primaryKey: (String, String) = ("celeb_key", "STRING")
  val naturalKey: (String, String) = ("celeb_id", "INTEGER")
  val dimensionColumns: Array[(String, String)] = Array(("name", "STRING"), ("country", "STRING"), ("region", "STRING"))
  val partitionColumns: Array[(String, String)] = Array.empty
}

/** Celeb profile dimension schema - tests nullable columns and null-safe matching.
  */
object CelebProfileDim extends StarDimension2Schema {
  val tableName = "celeb_profile_dim"
  val primaryKeyHashVersionValue = 1
  val primaryKey: (String, String) = ("celeb_profile_key", "STRING")
  val naturalKey: (String, String) = ("celeb_id", "INTEGER")
  val dimensionColumns: Array[(String, String)] = Array(("name", "STRING"), ("country", "STRING"), ("region", "STRING"), ("profession", "STRING"), ("current_project", "STRING"))
  val partitionColumns: Array[(String, String)] = Array.empty
}

/** Celeb net worth dimension schema - tests integer dimension columns.
  */
object CelebNetWorthDim extends StarDimension2Schema {
  val tableName = "celeb_net_worth_dim"
  val primaryKeyHashVersionValue = 1
  val primaryKey: (String, String) = ("celeb_net_worth_key", "STRING")
  val naturalKey: (String, String) = ("celeb_id", "INTEGER")
  val dimensionColumns: Array[(String, String)] = Array(("name", "STRING"), ("net_worth_millions", "INTEGER"), ("industry", "STRING"))
  val partitionColumns: Array[(String, String)] = Array.empty
}

/** SCD transformations for celeb test data tables.
  */
object CelebSCDTransformationMetadataMappings extends SCDTransformationMetadataMappings {

  override val SurrogateColumnToHashMap: scala.collection.immutable.Map[String, String] = scala.collection.immutable.Map(
    CelebDim.primaryKey._1 -> CelebDim.toPrimaryKeyHash(),
    CelebProfileDim.primaryKey._1 -> CelebProfileDim.toPrimaryKeyHash(),
    CelebNetWorthDim.primaryKey._1 -> CelebNetWorthDim.toPrimaryKeyHash()
  )

  override val KeyGenInfoMap: scala.collection.immutable.Map[String, KeyGenInfo] = scala.collection.immutable.Map(
    "celeb_dim" -> KeyGenInfo(CelebDim.primaryKey._1, CelebDim.naturalKey._1, SurrogateColumnToHashMap(CelebDim.primaryKey._1)),
    "celeb_profile_dim" -> KeyGenInfo(CelebProfileDim.primaryKey._1, CelebProfileDim.naturalKey._1, SurrogateColumnToHashMap(CelebProfileDim.primaryKey._1)),
    "celeb_net_worth_dim" -> KeyGenInfo(CelebNetWorthDim.primaryKey._1, CelebNetWorthDim.naturalKey._1, SurrogateColumnToHashMap(CelebNetWorthDim.primaryKey._1))
  )

  override val DimTransformationTableInfoMap: scala.collection.immutable.Map[String, SCDTransformationInfo] = scala.collection.immutable.Map(
    "celeb_dim" -> SCDTransformationInfo(CelebDim.primaryKey._1, CelebDim.toMatchStatement(), CelebDim.toUpsertableColumns(), CelebDim.toFullColumnUpsertMap()),
    "celeb_profile_dim" -> SCDTransformationInfo(CelebProfileDim.primaryKey._1, CelebProfileDim.toMatchStatement(), CelebProfileDim.toUpsertableColumns(), CelebProfileDim.toFullColumnUpsertMap()),
    "celeb_net_worth_dim" -> SCDTransformationInfo(CelebNetWorthDim.primaryKey._1, CelebNetWorthDim.toMatchStatement(), CelebNetWorthDim.toUpsertableColumns(), CelebNetWorthDim.toFullColumnUpsertMap())
  )

  override val FactTransformationTableInfoMap: scala.collection.immutable.Map[String, NonSCDTransformationInfo] = scala.collection.immutable.Map(
    "celeb_event_fact" -> NonSCDTransformationInfo(Array("event_id", "celeb_id", "event_name", "event_date", "revenue"))
  )
}
// @formatter:on
