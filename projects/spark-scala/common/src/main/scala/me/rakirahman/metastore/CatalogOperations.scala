package me.rakirahman.metastore

import org.apache.spark.sql.catalyst.catalog.CatalogTable

/** Trait representing catalog operations.
  */
trait CatalogOperations {

  /** Get the [[CatalogTable]] representation of a table containing a rich set of metadata.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def getCatalogTableDefinition(
      databaseName: String,
      tableName: String
  ): CatalogTable

  /** Get the underlying storage location of the table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def getLocation(
      databaseName: String,
      tableName: String
  ): java.net.URI
}
