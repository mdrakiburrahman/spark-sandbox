package me.rakirahman.sparkdemo.etl.drivers.demos

import me.rakirahman.spark.SparkSessionExtensions._

import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import scala.concurrent.duration._

object DemoEtl extends App {
  val configFileName = args.headOption.getOrElse(sys.exit(1))
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val dbName = "demo_etl"
  val spark = SparkSessionManager(envConfig).session

  spark.sql(s"CREATE DATABASE IF NOT EXISTS ${dbName}")
  spark.catalog.setCurrentDatabase(dbName)

  Array("customers", "orders", "products", "sales").foreach { table =>
    spark.read
      .option("header", "true")
      .option("inferSchema", "true")
      .csv(s"wasbs://public@rakirahman.blob.core.windows.net/datasets/${table}.csv")
      .write
      .format("delta")
      .mode("overwrite")
      .saveAsTable(s"${dbName}.${table}")
  }

  Seq(
    (
      "customers_cleaned",
      s"""
        SELECT
            c.customerID,
            c.customerName,
            c.contact,
            COUNT(o.orderID) as order_count,
            CASE
                WHEN COUNT(o.orderID) > 0 THEN TRUE
                ELSE FALSE
            END AS has_orders
        FROM ${dbName}.customers c
        LEFT JOIN ${dbName}.orders o ON c.customerID = o.customerID
        GROUP BY c.customerID, c.customerName, c.contact
        ORDER BY order_count DESC
      """
    ),
    (
      "product_sales_summary",
      s"""
        SELECT
            p.productName,
            COUNT(s.OrderID) as total_sales,
            SUM(s.Quantity) as total_quantity,
            ROUND(AVG(s.Quantity), 2) as avg_quantity_per_sale
        FROM ${dbName}.products p
        LEFT JOIN ${dbName}.sales s ON p.productID = s.productID
        GROUP BY p.productName
        ORDER BY total_sales DESC
      """
    )
  ).foreach { case (tableName, sqlQuery) =>
    spark
      .sql(sqlQuery)
      .write
      .format("delta")
      .mode("overwrite")
      .saveAsTable(s"${dbName}.${tableName}")
  }

  spark.stopAfter(30.seconds)
}
