package me.rakirahman.quality.integrity.handler

import me.rakirahman.quality.integrity.metadata._

/** Trait representing a key metadata calculator.
  */
trait KeyMetadataCalculator {

  /** Returns the count of distinct keys in a table.
    */
  def getDistinctKeyCount(database: String, table: String, key: String): Int

  /** Returns the count of null column in a table.
    */
  def getNullColumnCount(database: String, table: String, column: String): Int

  /** Returns the count of duplicate keys in a table.
    */
  def getDuplicateKeyCount(database: String, table: String, key: String): Int

  /** Returns the count of expected duplicate keys in a table due to SCD Expiration.
    */
  def getScdExpiredDuplicateKeyCount(
      database: String,
      table: String,
      key: String,
      effectiveColumn: String
  ): Int

  /** Returns the count of missing keys in a dimension table compared to a fact table.
    */
  def getMissingKeysInDimCount(
      database: String,
      dimTable: String,
      factTable: String,
      dimKey: String,
      factKey: String
  ): Int

  /** Returns the count of missing keys in a fact table compared to a dimension table.
    */
  def getMissingKeysInFactCount(
      database: String,
      dimTable: String,
      factTable: String,
      dimKey: String,
      factKey: String
  ): Int

  /** Retrieves SCD metrics for a table.
    */
  def getScdMetrics(
      database: String,
      table: String,
      primaryKey: String,
      naturalKey: String
  ): ScdMetrics
}
