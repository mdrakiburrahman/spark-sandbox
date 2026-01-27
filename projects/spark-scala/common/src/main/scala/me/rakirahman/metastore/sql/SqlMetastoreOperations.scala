package me.rakirahman.metastore.sql

import org.apache.spark.sql.SparkSession
import org.apache.spark.internal.Logging

/** Operations for interacting with a SQL metastore.
  *
  * @param spark
  *   The SparkSession to use for the operations.
  */
class SqlMetastoreOperations(spark: SparkSession) extends Logging {

  /** Lists all databases in the metastore.
    *
    * @return
    *   An array of database names.
    */
  def listDatabases(): Array[String] = {
    spark.catalog.listDatabases().collect().map(_.name)
  }

  /** Checks if a database exists in the metastore.
    *
    * @param databaseName
    *   The name of the database to check.
    * @return
    *   true if the database exists, false otherwise.
    */
  def databaseExists(databaseName: String): Boolean = {
    val databases = spark.catalog.listDatabases().collect()
    databases.exists(db => db.name == databaseName)
  }

  /** Creates a database if it does not exist.
    *
    * @param databaseName
    *   The name of the database to create.
    */
  def createDatabase(databaseName: String): Unit = {
    spark.sql(s"CREATE DATABASE IF NOT EXISTS ${databaseName}")
  }

  /** Creates an external Delta table in the metastore.
    *
    * @param databaseName
    *   The name of the database where the table should be created.
    * @param tableName
    *   The name of the table to create.
    * @param location
    *   The path to the Delta table data.
    */
  def createDeltaTable(
      databaseName: String,
      tableName: String,
      location: String
  ): Unit = {
    val createTableSql =
      s"""
         |CREATE TABLE IF NOT EXISTS ${databaseName}.${tableName}
         |USING DELTA
         |LOCATION '${location}'
         |""".stripMargin

    logInfo(s"Executing: $createTableSql")
    spark.sql(createTableSql)
  }

  /** Checks if a table exists in the metastore.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @return
    *   true if the table exists, false otherwise.
    */
  def tableExists(databaseName: String, tableName: String): Boolean = {
    if (databaseExists(databaseName)) {
      val tables = listTables(databaseName)
      tables.exists(table => table == tableName)
    } else {
      false
    }
  }

  /** Lists all tables in a database.
    *
    * @param databaseName
    *   The name of the database.
    * @return
    *   An array of table names.
    */
  def listTables(databaseName: String): Array[String] = {
    if (databaseExists(databaseName)) {
      spark
        .sql(s"SHOW TABLES IN $databaseName")
        .collect()
        .map(row => row.getAs[String]("tableName"))
    } else {
      Array.empty[String]
    }
  }
}

/** Companion object for SqlMetastoreOperations.
  */
object SqlMetastoreOperations {

  /** Creates a new SqlMetastoreOperations instance.
    *
    * @param spark
    *   The SparkSession to use.
    * @return
    *   A new SqlMetastoreOperations instance.
    */
  def apply(spark: SparkSession): SqlMetastoreOperations =
    new SqlMetastoreOperations(spark)
}
