package me.rakirahman.deltalog

import me.rakirahman.metastore.sql.SqlMetastoreOperations
import org.apache.spark.internal.Logging
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.functions._

import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Persists extracted Delta Log data to inventory Delta tables.
  *
  * Writes commit entries to `commit_history` and table metadata snapshots to `table_snapshots`, both partitioned by `snapshot_date`.
  */
class DeltaLogCommitStore(
    spark: SparkSession,
    metastoreOps: SqlMetastoreOperations,
    inventoryDatabase: String
) extends Logging {

  private val snapshotDate =
    LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"))

  /** Persists commit entries to the commit_history Delta table. Uses append mode — the high-water mark in DeltaLogExtractor prevents duplicates.
    */
  def persistCommitHistory(commits: Seq[DeltaCommitEntry]): Unit = {
    if (commits.isEmpty) {
      logInfo("No new commits to persist.")
      return
    }

    import spark.implicits._
    val commitsDf = toSnakeColumns(
      commits
        .toDF()
    ).withColumn("ingested_at", current_timestamp())
      .withColumn("snapshot_date", lit(snapshotDate))

    ensureDatabase()

    commitsDf.write
      .format("delta")
      .mode("append")
      .partitionBy("snapshot_date")
      .saveAsTable(s"$inventoryDatabase.commit_history")

    logInfo(
      s"Persisted ${commits.size} commit entries to $inventoryDatabase.commit_history"
    )
  }

  /** Captures table snapshots from DESCRIBE DETAIL for all Delta tables. */
  def captureTableSnapshots(): Unit = {
    val databases = metastoreOps.listUserDatabases()
    val snapshots = databases.flatMap { db =>
      metastoreOps.listDeltaTables(db).flatMap { table =>
        try {
          val desc = metastoreOps.getDeltaTableDescription(db, table)
          Some(
            DeltaTableSnapshot(
              databaseName = db,
              tableName = table,
              tableFqn = s"$db.$table",
              tableId = Some(desc.id),
              format = desc.format,
              location = desc.location,
              createdAt = desc.createdAt,
              lastModified = desc.lastModified,
              numFiles = desc.numFiles,
              sizeInBytes = desc.sizeInBytes,
              sizeInGb = desc.sizeInGigaBytes,
              partitionColumns = desc.partitionColumns,
              clusteringColumns = desc.clusteringColumns,
              tableProperties = desc.properties.toMap,
              minReaderVersion = desc.minReaderVersion,
              minWriterVersion = desc.minWriterVersion
            )
          )
        } catch {
          case e: Exception =>
            logWarning(
              s"Failed to capture snapshot for $db.$table: ${e.getMessage}"
            )
            None
        }
      }
    }

    if (snapshots.isEmpty) {
      logInfo("No table snapshots to persist.")
      return
    }

    import spark.implicits._
    ensureDatabase()

    toSnakeColumns(snapshots.toSeq.toDF())
      .withColumn("ingested_at", current_timestamp())
      .withColumn("snapshot_date", lit(snapshotDate))
      .write
      .format("delta")
      .mode("append")
      .partitionBy("snapshot_date")
      .saveAsTable(s"$inventoryDatabase.table_snapshots")

    logInfo(s"Captured ${snapshots.size} table snapshots")
  }

  private def ensureDatabase(): Unit =
    metastoreOps.createDatabase(inventoryDatabase)

  /** Converts DataFrame column names from camelCase to snake_case. */
  private def toSnakeColumns(
      df: org.apache.spark.sql.DataFrame
  ): org.apache.spark.sql.DataFrame = {
    df.columns.foldLeft(df) { (acc, colName) =>
      val snakeName =
        colName.replaceAll("([a-z])([A-Z])", "$1_$2").toLowerCase
      if (snakeName != colName) acc.withColumnRenamed(colName, snakeName)
      else acc
    }
  }
}
