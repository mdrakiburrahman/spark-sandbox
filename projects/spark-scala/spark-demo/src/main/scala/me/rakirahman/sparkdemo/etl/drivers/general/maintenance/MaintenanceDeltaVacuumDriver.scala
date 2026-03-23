package me.rakirahman.sparkdemo.etl.drivers.general.maintenance

// @formatter:off
import me.rakirahman.config.DeltaLakeConfiguration
import me.rakirahman.etl.transformer.sorter.{DateTypes, SortableColumnNames}
import me.rakirahman.logging.LoggingConstants
import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.quality.maintenance.handler.DeltaMaintenanceScriptGenerator
import me.rakirahman.quality.maintenance.manager.DeltaTableMaintenanceManager
import me.rakirahman.quality.maintenance.metadata._
import me.rakirahman.quality.maintenance.metadata.DeltaVacuumConfigsExtensions._
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration
import org.apache.spark.internal.Logging
// @formatter:on

/** Lake wide VACUUM Metadata for all tables in the spark-sandbox estate.
  */
// @formatter:off
object LakeDeltaVacuumMetadata extends DeltaVacuumMetadata {

  /** @inheritdoc
    *
    * Tips:
    *
    *   - Please sort the table entries alphabetically for a given database.
    *
    *   - Z-order columns that are heavily used during BI drill-downs or ETL
    *     (e.g. keys involved in JOINs or FILTERs, such as PKs/SKs, FKs and NKs).
    */
  val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(

    // =====================================================================
    // data_ops_inventory_db
    //
    // Partitioned tables with year_date partition columns. Purge on
    // partition with 1 year retention.
    // =====================================================================
    DesiredDeltaTableConfig(database = "data_ops_inventory_db",       tableNameOrPrefix = "commit_history",                      isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("table_fqn")),
    DesiredDeltaTableConfig(database = "data_ops_inventory_db",       tableNameOrPrefix = "kpi_results",                         isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("table_fqn")),
    DesiredDeltaTableConfig(database = "data_ops_inventory_db",       tableNameOrPrefix = "openlineage",                         isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("eventType")),
    DesiredDeltaTableConfig(database = "data_ops_inventory_db",       tableNameOrPrefix = "table_snapshots",                     isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array.empty[String]),

    // =====================================================================
    // dbt_adventureworks_dwh
    //
    // Dimension and Fact tables. No partitions. Z-ORDER on join columns.
    // =====================================================================
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "dim_address",                         isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("address_key", "addressid")),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "dim_credit_card",                     isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("creditcard_key", "creditcardid")),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "dim_customer",                        isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("customer_key", "customerid")),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "dim_date",                            isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "dim_order_status",                    isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "dim_product",                         isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("product_key", "productid")),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "fct_sales",                           isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("salesorderid", "product_key", "customer_key")),
    DesiredDeltaTableConfig(database = "dbt_adventureworks_dwh",      tableNameOrPrefix = "obt_sales",                           isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("salesorderid", "productid", "customerid")),

    // =====================================================================
    // dbt_dataops_dwh
    //
    // Dimension, Fact, and Snapshot tables. Facts and snapshot are Hive
    // partitioned by event_year_month (yyyyMM). Purge on date_key with
    // 7-day retention.
    // =====================================================================
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "dim_date",                            isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "dim_delta_table_health_status",       isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "dim_delta_table_operation_type",      isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "dim_delta_table",                     isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("table_fqn")),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "fct_delta_lineage_dependency",        isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("source_table_key", "target_table_key")),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "fct_delta_commit",                    isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("table_key", "event_year_date")),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "fct_delta_health",                    isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("table_key", "event_year_date")),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "fct_delta_storage",                   isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("table_key", "event_year_date")),
    DesiredDeltaTableConfig(database = "dbt_dataops_dwh",             tableNameOrPrefix = "snap_dim_delta_table",                isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = false,     purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,    purgePartitionColumnDateType = DateTypes.YearMonthDate,         numPartitionsToRetain = 7,                zOrderColumns = Array("table_fqn")),

    // =====================================================================
    // dbt_adventureworks_seed / dbt_jaffle_shop_seed
    //
    // Seed tables are small CSV loads. VACUUM only, no OPTIMIZE or PURGE.
    // NOTE: These are mounted from OneLake and are read-only locally.
    //       The driver excludes them when running in devcontainer.
    // =====================================================================
    DesiredDeltaTableConfig(database = "dbt_adventureworks_seed",     tableNameOrPrefix = "*",                                   isPrefix = true,     skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "dbt_jaffle_shop_seed",        tableNameOrPrefix = "*",                                   isPrefix = true,     skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),

    // =====================================================================
    // dbt_jaffle_shop_dwh
    //
    // Model tables with join columns. Z-ORDER on join keys.
    // =====================================================================
    DesiredDeltaTableConfig(database = "dbt_jaffle_shop_dwh",        tableNameOrPrefix = "customers",                           isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("customer_id")),
    DesiredDeltaTableConfig(database = "dbt_jaffle_shop_dwh",        tableNameOrPrefix = "orders",                              isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("order_id", "customer_id")),

    // =====================================================================
    // demo_etl
    //
    // Base tables are small CSV loads. Derived tables have JOIN columns
    // that benefit from Z-ORDER.
    // =====================================================================
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "customers",                           isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "customer_lifetime_value",             isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("customerID")),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "customers_cleaned",                   isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("customerID")),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "orders",                              isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "products",                            isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "products_enriched",                   isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "product_sales_performance",           isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("productID")),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "sales",                               isPrefix = false,    skipVacuum = false,   skipOptimize = true,     skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array.empty[String]),
    DesiredDeltaTableConfig(database = "demo_etl",                   tableNameOrPrefix = "sales_enriched",                      isPrefix = false,    skipVacuum = false,   skipOptimize = false,    skipPurge = true,      purgePartitionColumn = "",                                                    purgePartitionColumnDateType = null,                            numPartitionsToRetain = Int.MaxValue,     zOrderColumns = Array("orderID", "productID"))
  )
}
// @formatter:on

/** Runs Delta table maintenance (VACUUM, OPTIMIZE, PURGE) across the estate.
  */
object MaintenanceDeltaVacuumDriver extends App with Logging {

  val configFileName = args.headOption.getOrElse(sys.exit(1))
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val spark = SparkSessionManager(envConfig).session
  val metastoreOps = SqlMetastoreOperations(spark)

  // Apply Fabric-specific Delta Lake optimizations
  if (envConfig.isRunningInFabric()) {
    logInfo("Running in Fabric - applying optimized Delta Lake configurations")
    DeltaLakeConfiguration.FABRIC_OPTIMIZE_CONFIGS.foreach { case (key, value) =>
      logInfo(s"  Setting $key = $value")
      spark.conf.set(key, value)
    }
  }

  // Validate metadata
  require(
    LakeDeltaVacuumMetadata.isValid(),
    "LakeDeltaVacuumMetadata configuration is invalid"
  )

  // Databases mounted from OneLake are read-only locally but writable in Fabric
  val readOnlyLocalDatabases = Set("dbt_adventureworks_seed", "dbt_jaffle_shop_seed")
  logInfo("Discovering current Delta tables in the estate...")
  val allDatabases = metastoreOps.listUserDatabases().filterNot { db =>
    !envConfig.isRunningInFabric() && readOnlyLocalDatabases.contains(db)
  }
  val currentTables = allDatabases.flatMap { db =>
    metastoreOps.listDeltaTables(db).map(table => (db, table))
  }

  val sb = new StringBuilder
  sb.append(LoggingConstants.mainDivider)
  sb.append(s"Delta Table Maintenance\n")
  sb.append(LoggingConstants.subDivider)
  sb.append(s"Total tables discovered: ${currentTables.length}\n")
  sb.append(s"Databases: ${allDatabases.mkString(", ")}\n")
  sb.append(LoggingConstants.subDivider)

  // Check for missing tables
  val missingTables = DeltaMaintenanceScriptGenerator.findMissingTablesInDesiredConfig(
    currentTables,
    LakeDeltaVacuumMetadata.desiredDeltaTableConfigs
  )
  if (missingTables.nonEmpty) {
    sb.append(s"WARNING: ${missingTables.length} tables NOT covered by maintenance config:\n")
    missingTables.foreach { case (db, table) =>
      sb.append(s"  - $db.$table\n")
    }
    sb.append(LoggingConstants.subDivider)
  }

  // Generate scripts
  val scripts = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(
    currentTables,
    LakeDeltaVacuumMetadata.desiredDeltaTableConfigs,
    Some(metastoreOps)
  )

  sb.append(s"Generated ${scripts.length} maintenance script sets\n")
  scripts.foreach { s =>
    sb.append(s"  ${s.databaseName}.${s.tableName}: ${s.scriptToRun.length} scripts\n")
  }
  sb.append(LoggingConstants.mainDivider)
  logInfo(sb.toString())

  // Execute
  val manager = DeltaTableMaintenanceManager(spark)
  val success = manager.executeMaintenance(scripts)

  logInfo(s"Maintenance completed: success=$success")
  spark.stop()
}
