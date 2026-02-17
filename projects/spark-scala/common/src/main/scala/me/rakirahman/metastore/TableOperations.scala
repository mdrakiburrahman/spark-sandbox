package me.rakirahman.metastore

// @formatter:off
import me.rakirahman.feeds.io.table.TableIOFileTypes
import me.rakirahman.quality.maintenance.metadata.DeltaTableDescription

import org.apache.spark.sql.catalyst.plans.logical.LogicalPlan
import org.apache.spark.sql.DataFrame
// @formatter:on

/** Trait representing operations that can be performed on SQL tables.
  */
trait TableOperations {

  /** Checks if a table exists in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   `true` if the table exists, `false` otherwise.
    */
  def tableExists(databaseName: String, tableName: String): Boolean

  /** Refreshes the table in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def refreshTable(databaseName: String, tableName: String): Unit

  /** Truncates the table in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def truncateTable(databaseName: String, tableName: String): Unit

  /** Find all tables in the specified database with a specific pattern
    *
    * @param databaseName
    *   The name of the database.
    * @param pattern
    *   The pattern to filter the table names.
    * @return
    *   An array of table names.
    */
  def findTablesLike(databaseName: String, pattern: String): Array[String]

  /** Lists all tables in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @return
    *   An array of table names.
    */
  def listTables(databaseName: String): Array[String]

  /** Lists all views in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @return
    *   An array of view names.
    */
  def listViews(databaseName: String): Array[String]

  /** Lists all tables referenced in a specified view.
    *
    * @param databaseName
    *   The name of the database.
    * @param viewName
    *   The name of the view.
    * @return
    *   An array of table names referenced in the view.
    */
  def listTablesInView(databaseName: String, viewName: String): Array[String]

  /** Checks if the specified object is a view in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param objectName
    *   The name of the object.
    * @return
    *   `true` if the object is a view, `false` otherwise.
    */
  def isView(databaseName: String, objectName: String): Boolean

  /** Lists all tables in the specified database that have the given prefix.
    *
    * @param databaseName
    *   The name of the database.
    * @param prefix
    *   The prefix to filter the table names.
    * @return
    *   An array of table names.
    */
  def listTablesWithPrefix(databaseName: String, prefix: String): Array[String]

  /** Lists all Delta tables in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @return
    *   An array of table names.
    */
  def listDeltaTables(databaseName: String): Array[String]

  /** Lists all delta tables in the specified database that have the given
    * prefix.
    *
    * @param databaseName
    *   The name of the database.
    * @param prefix
    *   The prefix to filter the table names.
    * @return
    *   An array of table names.
    */
  def listDeltaTablesWithPrefix(
      databaseName: String,
      prefix: String
  ): Array[String]

  /** Checks if a table in the specified database has data.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   `true` if the table has data, `false` otherwise.
    */
  def tableHasData(databaseName: String, tableName: String): Boolean

  /** Retrieves the schema of a table in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   An array of tuples representing the schema of the table.
    */
  def getSchema(
      databaseName: String,
      tableName: String
  ): Array[(String, String)]

  /** Gets the DataFrame representing the table details.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   The table description.
    */
  def getTableDescription(
      databaseName: String,
      tableName: String
  ): DataFrame

  /** Gets the table File Type.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   The table file type.
    */
  def getTableType(
      databaseName: String,
      tableName: String
  ): TableIOFileTypes.TableIOFileTypes

  /** Gets the create table definition. Note, this does not support Delta
    * tables, but works on views.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   The create table definition.
    */
  def getCreateTableDefinition(
      databaseName: String,
      tableName: String
  ): String

  /** Gets the table details.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   The table details.
    */
  def getDeltaTableDescription(
      databaseName: String,
      tableName: String
  ): DeltaTableDescription

  /** Gets a specific Delta table property value.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param propertyName
    *   The name of the property to retrieve.
    * @return
    *   An Option containing the property value if it exists, None otherwise.
    */
  def getDeltaTableProperty(
      databaseName: String,
      tableName: String,
      propertyName: String
  ): Option[String]

  /** Creates a table in the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param fileType
    *   The file format of the table.
    * @param location
    *   The location of the table.
    * @param schema
    *   The Table Schema as an array of tuples, where each tuple represents a
    *   column with its name and data type.
    * @param partitionColumns
    *   The partition columns.
    * @param tableOptions
    *   The table options as an array of tuples, where each tuple represents an
    *   option with its name and value.
    */
  def createTable(
      databaseName: String,
      tableName: String,
      fileType: TableIOFileTypes.TableIOFileTypes,
      location: String,
      schema: Array[(String, String)],
      partitionColumns: Array[String],
      tableOptions: Array[(String, String)]
  ): Unit

  /** Drops a table from the specified database.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def dropTable(databaseName: String, tableName: String): Unit

  /** Executes the given query.
    *
    * @param query
    *   The query to be executed.
    */
  def executeQuery(query: String): Unit

  /** Extracts the table names referenced in the given SQL query.
    *
    * @param query
    *   The SQL query string from which to extract table names.
    * @return
    *   A sequence of table names found in the query.
    */
  def extractTablesInQuery(query: String): Seq[String]

  /** Extracts table column values referenced in the given view.
    *
    * @param databaseName
    *   The name of the database.
    * @param viewName
    *   The name of the view.
    * @param columnToSearch
    *   The column name to search for in the query.
    * @return
    *   A map of (table, column) combos found in the query.
    */
  def extractTablesWithColumnValuesInView(
      databaseName: String,
      viewName: String,
      columnToSearch: String
  ): Map[String, String]

  /** Extracts table column values referenced in the given SQL query.
    *
    * @param query
    *   The SQL query string from which to extract table and column value names.
    * @param columnToSearch
    *   The column name to search for in the query.
    * @return
    *   A map of (table, column) combos found in the query.
    */
  def extractTablesWithColumnValuesInQuery(
      query: String,
      columnToSearch: String
  ): Map[String, String]

  /** Extracts the table names referenced in the given SQL query.
    *
    * @param query
    *   The SQL query string from which to extract table names.
    * @return
    *   A sequence of table names found in the query.
    */
  def extractTablesInPlan(plan: LogicalPlan): Seq[String]

  /** Extracts column references from a SQL query string.
    *
    * @param query
    *   The SQL query to analyze
    * @return
    *   A sequence of column names referenced in the query
    */
  def extractColumnsInQuery(query: String): Seq[String]

  /** Extracts column references from a logical plan.
    *
    * @param plan
    *   The logical plan to analyze
    * @return
    *   A sequence of column names referenced in the plan
    */
  def extractColumnsInPlan(plan: LogicalPlan): Seq[String]

  /** Extracts dependencies from a set of named queries and returns them in
    * execution order.
    *
    * @param namedQueries
    *   A map of table names to their corresponding SQL query definitions
    * @param showExternalDependencies
    *   Whether to include external dependencies in the output. When false,
    *   external dependencies are assumed to be satisfied and not included.
    * @return
    *   A sequence of sequences, where each inner sequence contains table names
    *   that can be executed in parallel, and the outer sequence represents the
    *   execution order.
    */
  def extractDependencies(
      namedQueries: Map[String, String],
      showExternalDependencies: Boolean = false
  ): Seq[Seq[String]]

  /** Extract dependency layers as a map where the key is the layer index
    * (starting at 0) and the value is the sequence of table names in that
    * layer.
    *
    * @param namedQueries
    *   The named queries map
    * @param showExternalDependencies
    *   Whether to include external dependencies
    * @return
    *   A map of layer index to sequence of table names
    */
  def extractDependencyAsLayers(
      namedQueries: Map[String, String],
      showExternalDependencies: Boolean = false
  ): Map[Int, Seq[String]]

  /** Gets table properties.
    *
    * @param databaseName
    *   the name of the database
    * @param tableName
    *   the name of the table
    * @return
    *   Map containing table properties as key-value pairs
    */
  def getTableProps(
      databaseName: String,
      tableName: String
  ): Map[String, String]

  /** Sets a table property with optional conditional check.
    *
    * @param databaseName
    *   The name of the database
    * @param tableName
    *   The name of the table
    * @param key
    *   The property key to set
    * @param value
    *   The property value to set
    * @param force
    *   If true, always set the property. If false, only set if current value
    *   differs
    */
  def setTableProp(
      databaseName: String,
      tableName: String,
      key: String,
      value: String,
      force: Boolean = false
  ): Unit
}
