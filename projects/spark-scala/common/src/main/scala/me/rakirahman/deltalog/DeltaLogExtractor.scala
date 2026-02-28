package me.rakirahman.deltalog

import me.rakirahman.metastore.sql.SqlMetastoreOperations
import io.delta.tables.DeltaTable
import org.apache.spark.internal.Logging
import org.apache.spark.sql.SparkSession

import java.sql.Timestamp

/** Extracts commit history from Delta Lake transaction logs.
  *
  * Uses `DeltaTable.history()` to read commit entries and `SqlMetastoreOperations` to discover all Delta tables. A high-water mark strategy (based on `MAX(version)`) ensures only new commits are extracted on subsequent runs.
  */
class DeltaLogExtractor private (
    spark: SparkSession,
    metastoreOps: SqlMetastoreOperations,
    inventoryDatabase: String
) extends MetadataExtractor[Seq[DeltaCommitEntry]]
    with Logging {

  override def extract(): Seq[DeltaCommitEntry] = {
    val databases = metastoreOps.listUserDatabases()
    databases.flatMap { db =>
      val deltaTables = metastoreOps.listDeltaTables(db)
      logInfo(
        s"Scanning ${deltaTables.length} Delta tables in database: $db"
      )
      deltaTables.flatMap { table =>
        try {
          extractForTable(db, table)
        } catch {
          case e: Exception =>
            logWarning(
              s"Failed to extract history for $db.$table: ${e.getMessage}"
            )
            Seq.empty
        }
      }
    }
  }

  override def extractForTable(
      databaseName: String,
      tableName: String
  ): Seq[DeltaCommitEntry] = {
    val tableFqn = s"$databaseName.$tableName"

    val highWaterMark = getHighWaterMark(tableFqn)

    val tableId =
      try {
        Some(
          metastoreOps.getDeltaTableDescription(databaseName, tableName).id
        )
      } catch { case _: Exception => None }

    val historyDf =
      DeltaTable.forName(spark, s"$databaseName.$tableName").history()
    val filteredDf = highWaterMark match {
      case Some(version) =>
        import org.apache.spark.sql.functions.col
        historyDf.filter(col("version") > version)
      case None => historyDf
    }

    filteredDf
      .collect()
      .map { row =>
        val metrics =
          Option(row.getAs[Map[String, String]]("operationMetrics"))

        DeltaCommitEntry(
          databaseName = databaseName,
          tableName = tableName,
          tableFqn = tableFqn,
          tableId = tableId,
          version = row.getAs[Long]("version"),
          commitTimestamp = row.getAs[Timestamp]("timestamp"),
          operation = row.getAs[String]("operation"),
          operationParameters = Option(row.getAs[Map[String, String]]("operationParameters")),
          operationMetrics = metrics,
          readVersion = Option(row.getAs[java.lang.Long]("readVersion"))
            .map(_.toLong),
          isolationLevel = Option(row.getAs[String]("isolationLevel")),
          isBlindAppend = Option(row.getAs[java.lang.Boolean]("isBlindAppend"))
            .map(_.booleanValue()),
          userId = Option(row.getAs[String]("userId")),
          userName = Option(row.getAs[String]("userName")),
          userMetadata = Option(row.getAs[String]("userMetadata")),
          numOutputRows = DeltaLogExtractor.extractLongMetric(
            metrics.getOrElse(Map.empty),
            "numOutputRows",
            "numTargetRowsInserted",
            "numDeletedRows",
            "numUpdatedRows"
          ),
          numAddedFiles = DeltaLogExtractor.extractLongMetric(
            metrics.getOrElse(Map.empty),
            "numFiles",
            "numAddedFiles",
            "numTargetFilesAdded"
          ),
          numRemovedFiles = DeltaLogExtractor.extractLongMetric(
            metrics.getOrElse(Map.empty),
            "numRemovedFiles",
            "numTargetFilesRemoved"
          ),
          numOutputBytes = DeltaLogExtractor.extractLongMetric(
            metrics.getOrElse(Map.empty),
            "numOutputBytes"
          ),
          executionTimeMs = DeltaLogExtractor.extractLongMetric(
            metrics.getOrElse(Map.empty),
            "executionTimeMs"
          )
        )
      }
      .toSeq
  }

  /** Gets the highest version already ingested for a table. */
  private def getHighWaterMark(tableFqn: String): Option[Long] = {
    try {
      if (!metastoreOps.tableExists(inventoryDatabase, "commit_history"))
        return None
      import spark.implicits._
      val result = spark
        .sql(
          s"SELECT MAX(version) FROM $inventoryDatabase.commit_history WHERE table_fqn = '$tableFqn'"
        )
        .as[Option[Long]]
        .head()
      result
    } catch {
      case _: Exception => None
    }
  }
}

object DeltaLogExtractor {
  val DefaultInventoryDatabase = "delta_log_inventory_db"

  def apply(
      spark: SparkSession,
      inventoryDatabase: String = DefaultInventoryDatabase
  ): DeltaLogExtractor = {
    new DeltaLogExtractor(
      spark,
      SqlMetastoreOperations(spark),
      inventoryDatabase
    )
  }

  /** For testing — allows injecting a custom SqlMetastoreOperations instance.
    */
  private[deltalog] def apply(
      spark: SparkSession,
      metastoreOps: SqlMetastoreOperations,
      inventoryDatabase: String
  ): DeltaLogExtractor = {
    new DeltaLogExtractor(spark, metastoreOps, inventoryDatabase)
  }

  /** Extracts a Long metric from an operationMetrics map. Tries multiple keys in priority order since different operations use different key names.
    */
  def extractLongMetric(
      metrics: Map[String, String],
      keys: String*
  ): Option[Long] = {
    keys.collectFirst {
      case key if metrics.contains(key) =>
        try { metrics(key).toLong }
        catch { case _: Exception => 0L }
    }
  }
}
