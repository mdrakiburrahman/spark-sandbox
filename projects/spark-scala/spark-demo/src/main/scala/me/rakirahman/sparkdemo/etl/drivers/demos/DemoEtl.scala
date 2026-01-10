package me.rakirahman.sparkdemo.etl.drivers.demos

import me.rakirahman.spark.SparkSessionExtensions._

import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import scala.concurrent.duration._
import org.apache.spark.internal.Logging

object DemoEtl extends App with Logging {
  val configFileName = args.headOption.getOrElse(sys.exit(1))
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val dbName = "demo_etl"
  val spark = SparkSessionManager(envConfig).session

  spark.sql(s"CREATE DATABASE IF NOT EXISTS ${dbName}")
  spark.catalog.setCurrentDatabase(dbName)

  Array("customers", "orders", "products", "sales").foreach { table =>
    logInfo(s"Creating table: ${table}")
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
            CASE 
                WHEN COUNT(o.orderID) OVER (PARTITION BY c.customerID) > 0 THEN TRUE 
                ELSE FALSE 
            END AS has_orders
        FROM ${dbName}.customers c 
        LEFT JOIN ${dbName}.orders o ON c.customerID = o.customerID
      """
    ),
    (
      "products_enriched",
      s"""
        SELECT
            productID,
            productName,
            price,
            CASE 
                WHEN price > 0 THEN TRUE 
                ELSE FALSE 
            END AS is_in_stock
        FROM ${dbName}.products
      """
    ),
    (
      "sales_enriched",
      s"""
        SELECT
            o.customerID,
            s.orderID,
            s.productID,
            p.productName,
            s.quantity,
            p.price * s.quantity as total_amount   
        FROM ${dbName}.sales s 
        JOIN ${dbName}.orders o ON s.orderID = o.orderID
        JOIN ${dbName}.products p ON s.productID = p.productID
        WHERE quantity > 0
      """
    ),
    (
      "customer_lifetime_value",
      s"""
        SELECT
            s.customerID,
            SUM(s.total_amount) AS total_spent,
            COUNT(s.orderID) AS total_orders
        FROM ${dbName}.sales_enriched s 
        GROUP BY customerID
      """
    ),
    (
      "product_sales_performance",
      s"""
        SELECT
            s.productID,
            SUM(s.quantity) AS total_units_sold,
            SUM(s.total_amount) AS total_revenue
        FROM ${dbName}.sales_enriched s
        JOIN ${dbName}.products_enriched p ON s.productID = p.productID
        GROUP BY s.productID
      """
    )
  ).foreach { case (table, sqlQuery) =>
    logInfo(s"Creating table: ${table}")
    spark
      .sql(sqlQuery)
      .write
      .format("delta")
      .mode("overwrite")
      .saveAsTable(s"${dbName}.${table}")
  }

  spark.flushPlugin()
  spark.stop()
}
