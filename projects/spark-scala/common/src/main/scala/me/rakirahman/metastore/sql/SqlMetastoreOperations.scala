package me.rakirahman.metastore.sql

// @formatter:off
import me.rakirahman.config.DeltaLakeConfiguration
import me.rakirahman.etl.schema.extensions.DataTypeExtensions._
import me.rakirahman.etl.transformer.sorter.{DateSorter, SortableColumnNames}
import me.rakirahman.feeds.io.table.{TableIOFileTypes}
import me.rakirahman.metastore.MetastoreOperations
import me.rakirahman.quality.maintenance.metadata.DeltaTableDescription
import me.rakirahman.spark.SparkSessionRetryExtensions._

import io.delta.tables.DeltaTable

import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.Semaphore

import org.apache.spark.sql.{Row, SparkSession, DataFrame}
import org.apache.spark.sql.catalyst.analysis.{UnresolvedAttribute, UnresolvedRelation}
import org.apache.spark.sql.catalyst.catalog.CatalogTable
import org.apache.spark.sql.catalyst.expressions._
import org.apache.spark.sql.catalyst.plans.logical.{LogicalPlan, Project, Union}
import org.apache.spark.sql.catalyst.TableIdentifier
import org.apache.spark.sql.delta.DeltaHistoryManager.Commit;
import org.apache.spark.sql.delta.DeltaLog
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

import scala.collection.mutable

/** Operations for interacting with a SQL metastore.
  *
  * @param spark
  *   The SparkSession to use for the operations.
  */
class SqlMetastoreOperations(spark: SparkSession) extends MetastoreOperations {

  /** Catalog mutation semaphore.
    */
  private val catalogLock = new Semaphore(1)

  def executeWithCatalogLock[T](code: => T): T = {
    catalogLock.acquire()
    try {
      code
    } finally {
      catalogLock.release()
    }
  }

  /** Converts a Spark StructType to SQL Server schema.
    */
  def convertToSqlServerSchema(
      desiredSchema: StructType
  ): Array[(String, String)] = desiredSchema.fields.map { c => (c.name, c.dataType.toSqlServerType()) }

  /** Checks if a database exists in the metastore.
    */
  def databaseExists(databaseName: String): Boolean = {
    val databases = spark.catalog.listDatabases().collect()
    return databases.exists(db => db.name == databaseName)
  }

  /** Lists all databases in the metastore.
    */
  def listDatabases(): Array[String] = {
    spark.catalog.listDatabases().collect().map(_.name)
  }

  /** Lists all user databases (excluding default).
    */
  def listUserDatabases(): Array[String] = {
    listDatabases().filter(db => !db.startsWith("default"))
  }

  /** Drops a database.
    */
  def dropDatabase(databaseName: String): Unit = {
    spark.sql(s"DROP DATABASE IF EXISTS ${databaseName} CASCADE")
  }

  /** Creates a database if it does not exist.
    */
  def createDatabase(databaseName: String): Unit = {
    spark.sql(s"CREATE DATABASE IF NOT EXISTS ${databaseName}")
  }

  /** Checks if a table exists in the metastore.
    */
  def tableExists(databaseName: String, tableName: String): Boolean = {
    if (databaseExists(databaseName)) {
      val tables = listTables(databaseName)
      return tables.exists(table => table == tableName)
    }
    false
  }

  /** Refreshes a table.
    */
  def refreshTable(databaseName: String, tableName: String): Unit = {
    spark.sql(s"REFRESH TABLE ${databaseName}.${tableName}")
  }

  /** Truncates a table.
    */
  def truncateTable(databaseName: String, tableName: String): Unit = {
    spark
      .sql(s"DELETE FROM ${databaseName}.${tableName} WHERE 1=1")
  }

  /** Finds tables matching a pattern.
    */
  def findTablesLike(databaseName: String, pattern: String): Array[String] = {
    if (databaseExists(databaseName)) {
      return spark
        .sql(s"SHOW TABLES FROM $databaseName LIKE '${pattern}'")
        .collect()
        .map(row => row.getAs[String]("tableName"))
    }
    Array.empty[String]
  }

  /** Lists all tables in a database.
    */
  def listTables(databaseName: String): Array[String] = {
    if (databaseExists(databaseName)) {
      return spark
        .sql(s"SHOW TABLES IN $databaseName")
        .collect()
        .map(row => row.getAs[String]("tableName"))
        .filterNot(this.listViews(databaseName).toSet.contains)
    }
    Array.empty[String]
  }

  /** Lists all views in a database.
    */
  def listViews(databaseName: String): Array[String] = {
    if (databaseExists(databaseName)) {
      return spark
        .sql(s"SHOW VIEWS IN $databaseName")
        .collect()
        .map(row => row.getAs[String]("viewName"))
    }
    Array.empty[String]
  }

  /** Lists all tables in a database with a given prefix.
    */
  def listTablesWithPrefix(
      databaseName: String,
      prefix: String
  ): Array[String] = {
    if (databaseExists(databaseName)) {
      val tables = listTables(databaseName)
      return tables.filter(table => table.startsWith(prefix))
    }
    Array.empty[String]
  }

  /** Lists all Delta tables in a database.
    */
  def listDeltaTables(databaseName: String): Array[String] = {
    listTables(databaseName).filter(tableName => {
      getTableType(databaseName, tableName) == TableIOFileTypes.Delta
    })
  }

  /** Lists all Delta tables in a database with a given prefix.
    */
  def listDeltaTablesWithPrefix(
      databaseName: String,
      prefix: String
  ): Array[String] = {
    listTablesWithPrefix(databaseName, prefix).filter(tableName => {
      getTableType(databaseName, tableName) == TableIOFileTypes.Delta
    })
  }

  /** Checks if an object is a view.
    */
  def isView(databaseName: String, objectName: String): Boolean = {
    if (databaseExists(databaseName)) {
      val views = listViews(databaseName)
      return views.exists(view => view == objectName)
    }
    false
  }

  /** Checks if a table has data.
    */
  def tableHasData(databaseName: String, tableName: String): Boolean = {
    if (tableExists(databaseName, tableName)) {
      val table = spark.table(s"${databaseName}.${tableName}")
      val rowCount = table.count()
      return rowCount > 0
    }
    false
  }

  /** Gets the schema of a table.
    */
  def getSchema(
      databaseName: String,
      tableName: String
  ): Array[(String, String)] = {
    val currentSchema =
      spark
        .sql(s"DESCRIBE FROM ${databaseName}.${tableName} SELECT *")
        .filter(col("col_name").isNotNull && col("data_type").isNotNull)
        .select("col_name", "data_type")
        .withColumn("data_type", upper(col("data_type")))

    currentSchema.collect().map(row => (row.getString(0), row.getString(1)))
  }

  /** Merges schema with array-based desired schema.
    */
  def mergeSchema(
      databaseName: String,
      tableName: String,
      desiredSchema: Array[(String, String)],
      desiredPartitionColumns: Array[String]
  ): Unit = {
    val currentSchema = getSchema(databaseName, tableName)
    val currentPartitions = getPartitions(databaseName, tableName)

    val columnsToAdd = desiredSchema.filterNot { case (columnName, _) =>
      currentSchema.filter { case (colName, _) =>
        colName == columnName
      }.nonEmpty
    }

    val columnsMissingInDesired = currentSchema.filter { case (columnName, _) =>
      !desiredSchema.exists { case (desiredColumnName, _) =>
        columnName == desiredColumnName
      }
    }

    val partitionsToAdd = desiredPartitionColumns.filterNot { partition =>
      currentPartitions.contains(partition)
    }

    val partitionsMissingInDesired = currentPartitions.filterNot { partition =>
      desiredPartitionColumns.contains(partition)
    }

    if (
      columnsToAdd.isEmpty &&
      partitionsToAdd.isEmpty &&
      columnsMissingInDesired.isEmpty &&
      partitionsMissingInDesired.isEmpty
    ) {
      return
    }

    if (columnsMissingInDesired.nonEmpty) {
      throw new RuntimeException(s"Breaking schema changes are not allowed.")
    }

    if (partitionsMissingInDesired.nonEmpty) {
      throw new RuntimeException(s"Breaking partition changes are not allowed, if you've thought through this, you must rewrite the table in place, please see [[DeltaRepartitionDriver]].")
    }

    if (partitionsToAdd.nonEmpty) {
      throw new RuntimeException(s"You cannot change the physical partition layout on the fly, you must rewrite the table in place, please see [[DeltaRepartitionDriver]].")
    }

    if (columnsToAdd.nonEmpty) {
      addColumnsToTable(databaseName, tableName, columnsToAdd)
    }
  }

  /** Merges schema with StructType-based desired schema.
    */
  def mergeSchema(
      databaseName: String,
      tableName: String,
      desiredSchema: StructType
  ): Unit = executeWithCatalogLock {

    val catalog = spark.sessionState.catalog
    catalog.setCurrentDatabase(databaseName)

    catalog.alterTableDataSchema(
      TableIdentifier(tableName),
      desiredSchema
    )
  }

  /** Gets the partition columns of a table.
    */
  def getPartitions(
      databaseName: String,
      tableName: String
  ): Array[String] = executeWithCatalogLock {
    spark.catalog.setCurrentDatabase(databaseName)
    spark.catalog
      .listColumns(tableName)
      .filter("isPartition")
      .select("name")
      .collect()
      .map(_.getString(0))
  }

  /** Gets distinct partition values from Delta transaction log.
    */
  def getDistinctPartitionValues(
      databaseName: String,
      tableName: String,
      partition: String
  ): Array[String] = executeWithCatalogLock {
    spark.catalog.setCurrentDatabase(databaseName)
    val (_, snapshot) = DeltaLog.forTableWithSnapshot(spark, TableIdentifier(tableName))
    snapshot
     .allFiles
     .toDF
     .selectExpr(s"partitionValues['${partition}'] as partitionValue")
     .distinct()
     .collect()
     .map(_.getString(0))
  }

  /** Gets timestamp partition values.
    */
  def getTimestampPartitionValues(
      databaseName: String,
      tableName: String,
      partition: String,
      columnName: SortableColumnNames.Types
  ): Array[Timestamp] = this.getDistinctPartitionValues(databaseName, tableName, partition)
                            .map(value => DateSorter.convert(value, columnName))
                            .sorted(Ordering.by((timestamp: Timestamp) => timestamp.getTime))

  /** Gets min and max timestamp partition values.
    */
  def getMinMaxTimestampPartitionValues(
      databaseName: String,
      tableName: String,
      partition: String,
      columnName: SortableColumnNames.Types
  ): (Timestamp, Timestamp) = {
    val timestamps = getTimestampPartitionValues(
      databaseName,
      tableName,
      partition,
      columnName
    )
    (timestamps.head, timestamps.last)
  }

  /** Gets the catalog table definition.
    */
  def getCatalogTableDefinition(
      databaseName: String,
      tableName: String
  ): CatalogTable =
    spark.sharedState.externalCatalog.getTable(databaseName, tableName)

  /** Gets the location of a table.
    */
  def getLocation(
      databaseName: String,
      tableName: String
  ): java.net.URI =
    this.getCatalogTableDefinition(databaseName, tableName).location

  /** Adds columns to a table.
    */
  private def addColumnsToTable(
      databaseName: String,
      tableName: String,
      columnsToAdd: Array[(String, String)]
  ): Unit = {
    val ddl = new StringBuilder
    ddl.append(s"ALTER TABLE ${databaseName}.${tableName} ADD COLUMNS (")
    columnsToAdd.zipWithIndex.foreach {
      case ((columnName, columnType), index) =>
        if (index == columnsToAdd.length - 1) {
          ddl.append(s"$columnName $columnType")
        } else {
          ddl.append(s"$columnName $columnType, ")
        }
    }
    ddl.append(");")
    spark.sql(ddl.toString)
  }

  /** Checks if a table exists at the specified path with the given format.
    */
  def tableExistsAtPath(path: String, fileType: TableIOFileTypes.TableIOFileTypes): Boolean = {
    try {
      spark.read.option("basePath", path).format(fileType.toString.toLowerCase).load(path)
      true
    } catch {
      case _: Exception => false
    }
  }

  /** Extracts column names from a Spark SQL expression recursively.
    */
  private def extractFromExpression(expr: Expression): Seq[String] =
    expr match {
        case alias: Alias             => Seq(alias.name)
        case col: UnresolvedAttribute => Seq(col.name.split("\\.").last)
        case col: AttributeReference  => Seq(col.name.split("\\.").last)
        case _ => expr.children.flatMap(extractFromExpression)
    }

  /** Builds the dependency graph for a set of named queries.
    */
  private def buildDependencyGraph(
      namedQueries: Map[String, String],
      showExternalDependencies: Boolean
  ): Map[String, Set[String]] = {
    namedQueries.map { case (tableName, sql) =>
      val referencedTables = extractTablesInQuery(sql)
      val internalDependencies = referencedTables.filter(namedQueries.contains)
      val externalDependencies =
        if (showExternalDependencies)
          referencedTables.filterNot(namedQueries.contains)
        else Set.empty[String]
      tableName -> (internalDependencies.toSet ++ externalDependencies)
    }
  }

  // ============================================================ //

  /** Gets the table description.
    */
  def getTableDescription(
      databaseName: String,
      tableName: String
  ): DataFrame = {
    spark.sql(s"DESCRIBE TABLE EXTENDED ${databaseName}.${tableName}")
  }

  /** Gets the table type (file format).
    */
  def getTableType(
      databaseName: String,
      tableName: String
  ): TableIOFileTypes.TableIOFileTypes = {

    val tableDescriptionDF = getTableDescription(databaseName, tableName)
    val dataType = tableDescriptionDF
      .filter(tableDescriptionDF("col_name") === "Provider")
      .select("data_type")
      .collect()(0)(0)
      .toString
      .toLowerCase

    dataType match {
      case "avro"         => TableIOFileTypes.Avro
      case "csv"          => TableIOFileTypes.Csv
      case "delta"        => TableIOFileTypes.Delta
      case "json"         => TableIOFileTypes.Json
      case "orc"          => TableIOFileTypes.Orc
      case "parquet"      => TableIOFileTypes.Parquet
      case "sequencefile" => TableIOFileTypes.SequenceFile
      case "text"         => TableIOFileTypes.Text
      case "xml"          => TableIOFileTypes.Xml
      case _ => throw new RuntimeException(s"Unsupported table type: $dataType")
    }
  }

  /** Gets the CREATE TABLE definition.
    */
  def getCreateTableDefinition(
      databaseName: String,
      tableName: String
  ): String = spark.sql(s"SHOW CREATE TABLE ${databaseName}.${tableName}")
                   .collect()
                   .map(_.getString(0))
                   .mkString(" ")

  /** Gets the Delta table description.
    */
  def getDeltaTableDescription(
      databaseName: String,
      tableName: String
  ): DeltaTableDescription = {
    val tableDescriptionDF = spark.sql(s"DESCRIBE DETAIL ${databaseName}.${tableName}")
    if (tableDescriptionDF.isEmpty) {
      throw new RuntimeException(
        s"Table ${databaseName}.${tableName} not found or returned empty description."
      )
    } else {
      val row: Row = tableDescriptionDF.head()

      DeltaTableDescription(
        format = row.getAs[String]("format"),
        id = row.getAs[String]("id"),
        name = row.getAs[String]("name"),
        description = row.getAs[String]("description"),
        location = row.getAs[String]("location"),
        createdAt = row.getAs[Timestamp]("createdAt"),
        lastModified = row.getAs[Timestamp]("lastModified"),
        partitionColumns = row.getAs[Seq[String]]("partitionColumns").toArray,
        clusteringColumns = row.getAs[Seq[String]]("clusteringColumns").toArray,
        numFiles = row.getAs[Long]("numFiles"),
        sizeInBytes = row.getAs[Long]("sizeInBytes"),
        sizeInGigaBytes = row.getAs[Long]("sizeInBytes").toDouble / 1073741824.0,
        properties = scala.collection.mutable.Map(row.getAs[Map[String, String]]("properties").toSeq: _*),
        minReaderVersion = row.getAs[Int]("minReaderVersion"),
        minWriterVersion = row.getAs[Int]("minWriterVersion")
      )
    }
  }

  /** Gets a Delta table property.
    */
  def getDeltaTableProperty(
      databaseName: String,
      tableName: String,
      propertyName: String
  ): Option[String] = getDeltaTableDescription(databaseName, tableName).properties.get(propertyName)

  /** Creates a table with schema, partitions, and options.
    */
  def createTable(
      databaseName: String,
      tableName: String,
      fileType: TableIOFileTypes.TableIOFileTypes,
      location: String,
      schema: Array[(String, String)],
      partitionColumns: Array[String],
      tableOptions: Array[(String, String)]
  ): Unit = {

    createDatabase(databaseName)

    val pathExists = tableExistsAtPath(location, fileType)

    val ddl = new StringBuilder
    ddl.append(s"CREATE TABLE IF NOT EXISTS ${databaseName}.$tableName")
    if (schema.nonEmpty && !pathExists) {
      ddl.append(" (\n")
      schema.zipWithIndex.foreach { case ((columnName, columnType), index) =>
        if (index == schema.length - 1) {
          ddl.append(s"    $columnName $columnType\n")
        } else {
          ddl.append(s"    $columnName $columnType,\n")
        }
      }
      ddl.append(")\n")
    } else {
      ddl.append("\n")
    }
    ddl.append(s"USING ${fileType.toString.toLowerCase}\n")
    if (partitionColumns.nonEmpty && !pathExists) {
      ddl.append("PARTITIONED BY (")
      partitionColumns.zipWithIndex.foreach { case (partitionColumn, index) =>
        if (index == partitionColumns.length - 1) {
          ddl.append(s"$partitionColumn)\n")
        } else {
          ddl.append(s"$partitionColumn, ")
        }
      }
    }
    if (tableOptions.nonEmpty && !pathExists) {
      ddl.append("OPTIONS (\n")
      tableOptions.zipWithIndex.foreach {
        case ((optionName, optionValue), index) =>
          if (index == tableOptions.length - 1) {
            ddl.append(s"    $optionName '$optionValue'\n")
          } else {
            ddl.append(s"    $optionName '$optionValue',\n")
          }
      }
      ddl.append(")\n")
    }
    ddl.append(s"LOCATION '$location';")
    spark.sql(ddl.toString)
  }

  /** Creates an external Delta table in the metastore.
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

    spark.sql(createTableSql)
  }

  /** Drops a table.
    */
  def dropTable(databaseName: String, tableName: String): Unit = {
    spark.sql(s"DROP TABLE IF EXISTS ${databaseName}.${tableName}")
  }

  /** Executes a query.
    */
  def executeQuery(query: String): Unit = spark.sql(query)

  /** Gets the closest commit to a desired timestamp.
    */
  def getClosestCommit(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp,
      returnLastCommitIfDesiredTimestampAfterLatestCommit: Boolean = true,
      returnFirstCommitIfDesiredTimestampBeforeFirstCommit: Boolean = true
  ): Commit = executeWithCatalogLock {
    spark.catalog.setCurrentDatabase(databaseName)
    DeltaLog
      .forTable(spark, spark.sessionState.catalog.getTableMetadata(TableIdentifier(tableName, Some(databaseName))))
      .history
      .getActiveCommitAtTime(
        timestamp = desiredTimestamp,
        canReturnLastCommit = returnLastCommitIfDesiredTimestampAfterLatestCommit,
        mustBeRecreatable = true,
        canReturnEarliestCommit = returnFirstCommitIfDesiredTimestampBeforeFirstCommit
      )
  }

  /** Gets the closest commit version.
    */
  def getClosestCommitVersion(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp
  ): Long = this
    .getClosestCommit(databaseName, tableName, desiredTimestamp)
    .getVersion

  /** Gets the closest commit timestamp.
    */
  def getClosestCommitTimestamp(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp
  ): Timestamp = new Timestamp(
    this
      .getClosestCommit(databaseName, tableName, desiredTimestamp)
      .getTimestamp
  )

  /** Gets the closest commit timestamp formatted.
    */
  def getClosestCommitTimestampFormatted(
      databaseName: String,
      tableName: String,
      desiredTimestamp: Timestamp,
      format: String = "yyyy-MM-dd HH:mm:ss.SSSSSSSSS"
  ): String =
    this
      .getClosestCommitTimestamp(databaseName, tableName, desiredTimestamp)
      .toLocalDateTime
      .format(DateTimeFormatter.ofPattern(format))

  /** Gets the latest version of a Delta table.
    */
  def getLatestVersion(databaseName: String, tableName: String): Long = {
    import spark.implicits._
    executeWithCatalogLock {
      spark.catalog.setCurrentDatabase(databaseName)
      DeltaTable
        .forName(spark, tableName)
        .history()
        .agg(max(DeltaLakeConfiguration.DELTA_VERSION))
        .as[Long]
        .head()
    }
  }

  /** Lists tables in a view.
    */
  def listTablesInView(databaseName: String, viewName: String): Array[String] =
    this
      .extractTablesInQuery(this.getCreateTableDefinition(databaseName, viewName))
      .toArray

  /** Extracts tables referenced in a query.
    */
  def extractTablesInQuery(query: String): Seq[String] = this
    .extractTablesInPlan(spark.sessionState.sqlParser.parsePlan(query))
    .distinct

  /** Extracts tables from a logical plan.
    */
  def extractTablesInPlan(plan: LogicalPlan): Seq[String] = plan match {
    case t: UnresolvedRelation => Seq(t.multipartIdentifier.mkString("."))
    case _                     => plan.children.flatMap(this.extractTablesInPlan).distinct
  }

  /** Extracts columns referenced in a query.
    */
  def extractColumnsInQuery(query: String): Seq[String] = this.extractColumnsInPlan(spark.sessionState.sqlParser.parsePlan(query))

  /** Extracts columns from a logical plan.
    */
  def extractColumnsInPlan(plan: LogicalPlan): Seq[String] =
    (plan.expressions.flatMap(extractFromExpression) ++ plan.children.flatMap(this.extractColumnsInPlan))
    .distinct
    .sorted

  /** Extracts tables with column values from a view.
    */
  def extractTablesWithColumnValuesInView(
      databaseName: String,
      viewName: String,
      columnToSearch: String
  ): Map[String, String] =
    this
      .extractTablesWithColumnValuesInQuery(
        this.getCreateTableDefinition(databaseName, viewName),
        columnToSearch
      )

  /** Extracts tables with column values from a query.
    */
  def extractTablesWithColumnValuesInQuery(
      query: String,
      columnToSearch: String
  ): Map[String, String] = {

    val tableRegionMap = mutable.Map[String, String]()

    def searchColumnDef(
        plan: LogicalPlan,
        currentCandidate: Option[String] = None
    ): Unit = {

      plan match {
        case union: Union => union.children.foreach(child => searchColumnDef(child, currentCandidate))
        case proj: Project =>
          searchColumnDef(
            proj.child,
            proj
              .projectList
              .collectFirst {
                case Alias(Literal(value: String, _), name) if name.toString.toLowerCase.contains(columnToSearch) => Some(value)
                case Alias(lit @ Literal(value, _), name) if name.toString.toLowerCase.contains(columnToSearch) => Some(value.toString)
              }
              .flatten
              .orElse(currentCandidate)
          )
        case relation: UnresolvedRelation => if (currentCandidate.isDefined) tableRegionMap += (relation.multipartIdentifier.mkString(".") -> currentCandidate.get)
        case other => other.children.foreach(child => searchColumnDef(child, currentCandidate))
      }
    }

    searchColumnDef(spark.sessionState.sqlParser.parsePlan(query))
    tableRegionMap.toMap
  }

  /** Extracts dependencies from named queries.
    */
  def extractDependencies(namedQueries: Map[String, String], showExternalDependencies: Boolean = false): Seq[Seq[String]] = {

    val dependencies = buildDependencyGraph(namedQueries, showExternalDependencies)

    val result = scala.collection.mutable.ListBuffer[Seq[String]]()
    val processed = scala.collection.mutable.Set[String]()
    val remaining = scala.collection.mutable.Set(namedQueries.keys.toSeq: _*)

    if (showExternalDependencies) {
      val allExternalTables = dependencies.values.flatten.filterNot(namedQueries.contains).toSet
      if (allExternalTables.nonEmpty) {
        result += allExternalTables.toSeq.sorted
        processed ++= allExternalTables
      }
    }

    while (remaining.nonEmpty) {

      val readyTables = remaining.filter { table => dependencies(table).forall(processed.contains)}.toSeq.sorted

      if (readyTables.isEmpty) {
        val remainingList = remaining.toSeq.sorted
        throw new RuntimeException(s"Circular dependency detected among tables: ${remainingList.mkString(", ")}")
      }

      result += readyTables
      processed ++= readyTables
      remaining --= readyTables
    }

    result.toSeq
  }

  /** Extracts dependency layers as a map with integer keys.
    */
  def extractDependencyAsLayers(
      namedQueries: Map[String, String],
      showExternalDependencies: Boolean = false
  ): Map[Int, Seq[String]] = extractDependencies(
    namedQueries,
    showExternalDependencies
  ).zipWithIndex.map { case (layer, index) => index -> layer }.toMap

  /** Compares two DataFrames for equality.
    */
  def isEqual(left: DataFrame, right: DataFrame): Boolean = {

    val schemaComparison = left.schema == right.schema

    if (!schemaComparison) {
      return false
    }

    val leftCount = left.count()
    val rightCount = right.count()

    if (leftCount != rightCount) {
      return false
    }

    val leftExceptright = left.except(right)
    val rightExceptleft = right.except(left)

    return leftExceptright.count() == 0 && rightExceptleft.count() == 0
  }

  /** Gets table properties.
    */
  def getTableProps(databaseName: String, tableName: String): Map[String, String] = {
    spark.sql(s"SHOW TBLPROPERTIES ${databaseName}.${tableName}")
      .collect()
      .map(row => row.getString(0) -> row.getString(1))
      .toMap
  }

  /** Sets a table property.
    */
  def setTableProp(
      databaseName: String,
      tableName: String,
      key: String,
      value: String,
      force: Boolean = false
  ): Unit = {
    val alterStatement = s"ALTER TABLE ${databaseName}.${tableName} SET TBLPROPERTIES (${key} = ${value})"
    if (force) {
      spark.sqlWithRetry(alterStatement)
    } else {
      val currentValue = getTableProps(databaseName, tableName).get(key)
      if (currentValue.isEmpty || currentValue.get != value) spark.sqlWithRetry(alterStatement)
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
// @formatter:on
