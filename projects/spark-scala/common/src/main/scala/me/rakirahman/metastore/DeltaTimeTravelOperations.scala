package me.rakirahman.metastore

import java.sql.Timestamp;
import org.apache.spark.sql.delta.DeltaHistoryManager.Commit;

/** Trait representing Delta time travel operations.
  */
trait DeltaTimeTravelOperations {

  /** Get the closest commit to the desired timestamp for a table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param desiredTimestamp
    *   The desired timestamp.
    * @param returnLastCommitIfDesiredTimestampAfterLatestCommit
    *   If [[true]], can return the last commit if the desired timestamp is
    *   after the latest commit.
    * @param returnFirstCommitIfDesiredTimestampBeforeFirstCommit
    *   If [[true]], can return the first commit if the desired timestamp is
    *   before the first commit.
    */
  def getClosestCommit(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp,
      returnLastCommitIfDesiredTimestampAfterLatestCommit: Boolean = true,
      returnFirstCommitIfDesiredTimestampBeforeFirstCommit: Boolean = true
  ): Commit

  /** Get the closest commit timestamp to the desired timestamp for a table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param desiredTimestamp
    *   The desired timestamp.
    */
  def getClosestCommitTimestamp(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp
  ): Timestamp

  /** Get the closest commit version to the desired timestamp for a table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param desiredTimestamp
    *   The desired timestamp.
    */
  def getClosestCommitVersion(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp
  ): Long

  /** Get the closest commit timestamp to the desired timestamp for a table -
    * formatted as a string.
    *
    * Note: It is deterministic to use 'VERSION AS OF
    * [[getClosestCommitVersion]]' - because, when we pass 'TIMESTAMP AS OF
    * [[getClosestCommitTimestampFormatted]]' via SQL syntax, there's a
    * possibility we can run into rounding issues from the SQL parser (e.g. say
    * the commit was done a few microserconds after the [[desiredTimestamp]],
    * Delta will throw a [[DeltaErrors.TemporallyUnstableInputException]]]
    *
    * Therefore, please prefer to use [[getClosestCommitVersion]] whenever the
    * situation allows for both options. Otherwise, you need to pick a
    * [[format]] that is granular enough to avoid rounding issues.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param desiredTimestamp
    *   The desired timestamp.
    * @param format
    *   The desired timestamp format.
    */
  def getClosestCommitTimestampFormatted(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp,
      format: String = "yyyy-MM-dd HH:mm:ss.SSSSSSSSS"
  ): String

  /** Get the latest version number of a delta table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def getLatestVersion(databaseName: String, tableName: String): Long
}
