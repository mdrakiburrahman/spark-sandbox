package me.rakirahman.quality.integrity.handler

import me.rakirahman.metastore.MetastoreOperations
import me.rakirahman.quality.integrity.metadata.ScdMetrics
import java.sql.Timestamp;
import java.time.LocalDateTime
import org.apache.spark.sql.functions._
import org.apache.spark.sql.SparkSession

/** Spark-based key metadata calculator.
  *
  * @param spark
  *   The Spark session.
  * @param metastore
  *   The metastore operations handler.
  * @param deltaTimeTravelTimestamp
  *   The timestamp to use for delta time travel.
  */
// @formatter:off
class SparkKeyMetadataCalculator(
    spark: SparkSession,
    metastore: MetastoreOperations,
    deltaTimeTravelTimestamp: Timestamp
) extends KeyMetadataCalculator {

  /** @inheritdoc
    */
  def getDistinctKeyCount(database: String, table: String, key: String): Int = {
    spark
      .sql(
        s"SELECT CAST(COUNT(DISTINCT ${key}) AS INT) AS num_distinct FROM ${database}.${table} VERSION AS OF '${metastore.getClosestCommitVersion(database, table, deltaTimeTravelTimestamp)}'"
      )
      .head()
      .getAs[Int]("num_distinct")
  }

  /** @inheritdoc
    */
  def getNullColumnCount(
      database: String,
      table: String,
      column: String
  ): Int = {
    spark
      .sql(
        s"SELECT CAST(COUNT(*) AS INT) AS null_count FROM ${database}.${table} VERSION AS OF '${metastore.getClosestCommitVersion(database, table, deltaTimeTravelTimestamp)}' WHERE ${column} IS NULL"
      )
      .head()
      .getAs[Int]("null_count")
  }

  /** @inheritdoc
    */
  def getDuplicateKeyCount(
      database: String,
      table: String,
      key: String
  ): Int = {
    var resultDf = spark.sql(
      s"SELECT CAST(COUNT(${key}) AS INT) AS num_dupes FROM ${database}.${table} VERSION AS OF '${metastore.getClosestCommitVersion(database, table, deltaTimeTravelTimestamp)}' GROUP BY ${key} HAVING num_dupes > 1"
    )
    var duplicateKeyCount = 0
    if (resultDf.count != 0) {
      duplicateKeyCount =
        resultDf.agg(sum("num_dupes").cast("int")).first().getInt(0)
    }
    duplicateKeyCount
  }

  /** @inheritdoc
    */
  def getScdExpiredDuplicateKeyCount(
      database: String,
      table: String,
      key: String,
      effectiveColumn: String
  ): Int = {
    val timestampToQuery = metastore.getClosestCommitVersion(database, table, deltaTimeTravelTimestamp)
    if (!spark.sql(s"DESCRIBE ${database}.${table}").collect().exists(_.getString(0) == effectiveColumn)) return 0
    var resultDf = spark.sql(
      s"""WITH duplicates AS (
            SELECT ${key}
            FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
            GROUP BY ${key}
            HAVING COUNT(*) > 1
        ),
        expected_duplicates AS (
            SELECT  ${key},
                    COUNT(*) AS num_dupes,
                    COUNT(CASE WHEN ${effectiveColumn} = true THEN 1 END) AS num_effective
            FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
            WHERE ${key} IN (SELECT ${key} FROM duplicates)
            GROUP BY ${key}
        )
        SELECT
            CAST(
                CASE
                    WHEN num_effective = 1 OR num_effective = 0 THEN num_dupes
                    ELSE 0
                END AS INT
            ) AS expected_dupes
        FROM expected_duplicates;"""
    )
    var expectedDuplicateKeyCount = 0
    if (resultDf.count != 0) {
      expectedDuplicateKeyCount =
        resultDf.agg(sum("expected_dupes").cast("int")).first().getInt(0)
    }
    expectedDuplicateKeyCount
  }

  /** @inheritdoc
    */
  def getMissingKeysInDimCount(
      database: String,
      dimTable: String,
      factTable: String,
      dimKey: String,
      factKey: String
  ): Int = {
    spark.sql(s"""SELECT CAST(COUNT(DISTINCT fact.${factKey}) AS INT) AS num_missing_keys_in_dim
                  FROM ${database}.${factTable} VERSION AS OF '${metastore.getClosestCommitVersion(database, factTable, deltaTimeTravelTimestamp)}' AS fact
                  LEFT JOIN ${database}.${dimTable} VERSION AS OF '${metastore.getClosestCommitVersion(database, dimTable, deltaTimeTravelTimestamp)}' AS dim
                  ON fact.${factKey} = dim.${dimKey}
                  WHERE dim.${dimKey} IS NULL;""").head().getAs[Int]("num_missing_keys_in_dim")
  }

  def getMissingKeysInFactCount(
      database: String,
      dimTable: String,
      factTable: String,
      dimKey: String,
      factKey: String
  ): Int = {
    spark.sql(s"""SELECT CAST(COUNT(DISTINCT dim.${dimKey}) AS INT) AS num_missing_keys_in_fact
                  FROM ${database}.${dimTable} VERSION AS OF '${metastore.getClosestCommitVersion(database, dimTable, deltaTimeTravelTimestamp)}' AS dim
                  LEFT JOIN ${database}.${factTable} VERSION AS OF '${metastore.getClosestCommitVersion(database, factTable, deltaTimeTravelTimestamp)}' AS fact
                  ON dim.${dimKey} = fact.${factKey}
                  WHERE fact.${factKey} IS NULL;""").head().getAs[Int]("num_missing_keys_in_fact")
  }

  /** @inheritdoc
    */
  def getScdMetrics(
      database: String,
      table: String,
      primaryKey: String,
      naturalKey: String
  ): ScdMetrics = {
    val timestampToQuery = metastore.getClosestCommitVersion(database, table, deltaTimeTravelTimestamp)
    ScdMetrics(
        numRowsCount = spark.sql(s"SELECT CAST(COUNT(*) AS INT) AS num_rows FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'").head().getAs[Int]("num_rows"),
        distinctPrimaryKeyCount              =  spark.sql(s"SELECT CAST(COUNT(DISTINCT ${primaryKey}) AS INT) AS distinct_pk_count FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'").head().getAs[Int]("distinct_pk_count"),
        distinctNaturalKeyCount              =  spark.sql(s"SELECT CAST(COUNT(DISTINCT ${naturalKey}) AS INT) AS distinct_nk_count FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'").head().getAs[Int]("distinct_nk_count"),
        distinctEffectiveNaturalKeyCount     =  spark.sql(s"""
                                                             |SELECT CAST(COUNT(DISTINCT ${naturalKey}) AS INT) AS distinct_effective_nk_count
                                                             |FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
                                                             |WHERE is_row_effective = true
                                                             |""".stripMargin).head().getAs[Int]("distinct_effective_nk_count"),
        endDateMaxButNotEffectiveRowCount    =  spark.sql(s"""
                                                             |SELECT CAST(COUNT(*) AS INT) AS num_hits
                                                             |FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
                                                             |WHERE row_effective_end == '9999-12-31T12:00:00Z'
                                                             |AND is_row_effective IS FALSE
                                                             |""".stripMargin).head().getAs[Int]("num_hits"),
        endDateNotMaxButIsEffectiveRowCount  =  spark.sql(s"""
                                                             |SELECT CAST(COUNT(*) AS INT) AS num_hits
                                                             |FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
                                                             |WHERE row_effective_end != '9999-12-31T12:00:00Z'
                                                             |AND is_row_effective IS TRUE
                                                             |""".stripMargin).head().getAs[Int]("num_hits"),
        multipleEffectiveNaturalKeyCount     =  spark.sql(s"""
                                                             |SELECT CAST(COUNT(*) AS INT) AS multiple_effective_natural_keys
                                                             |FROM (
                                                             |    SELECT ${naturalKey}, COUNT(*) AS row_count
                                                             |    FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
                                                             |    WHERE is_row_effective = true
                                                             |    GROUP BY ${naturalKey}
                                                             |    HAVING row_count > 1
                                                             |) AS counts
                                                             |""".stripMargin).head().getAs[Int]("multiple_effective_natural_keys"),
        datesOutOfOrderNaturalKeyCount       =  spark.sql(s"""
                                                             |SELECT CAST(COUNT(DISTINCT ${naturalKey}) AS INT) AS count_of_bad_dated_natural_keys
                                                             |FROM ${database}.${table} VERSION AS OF '${timestampToQuery}'
                                                             |WHERE row_effective_start > row_effective_end
                                                             |""".stripMargin).head().getAs[Int]("count_of_bad_dated_natural_keys")
    )
  }
}
// @formatter:on

/** Companion object for SparkKeyMetadataCalculator.
  */
object SparkKeyMetadataCalculator {

  /** Constructor.
    *
    * @param spark
    *   The Spark session.
    * @param metastore
    *   The metastore operations handler.
    * @param deltaTimeTravelTimestamp
    *   The timestamp to use for delta time travel. Defaults to 100 years in the
    *   future.
    * @return
    *   The SparkKeyMetadataCalculator.
    */
  // @formatter:off
  def apply(
      spark: SparkSession,
      metastore: MetastoreOperations,
      deltaTimeTravelTimestamp: Timestamp = Timestamp.valueOf(LocalDateTime.now().plusYears(100))
  ): SparkKeyMetadataCalculator = new SparkKeyMetadataCalculator(spark, metastore, deltaTimeTravelTimestamp)
  // @formatter:on
}
