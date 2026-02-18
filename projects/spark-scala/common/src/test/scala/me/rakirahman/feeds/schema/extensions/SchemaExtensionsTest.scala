package me.rakirahman.feeds.schema.extensions

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types._

class SchemaExtensionsTest extends AnyFunSpec with Matchers {
  import SchemaExtensions._

  describe("TupleArrayDeduplicator") {

    it("should deduplicate array of tuples") {
      val items = Array(("a", "INT"), ("b", "STRING"), ("a", "INT"))
      items.withItemsDeduped shouldBe Array(("a", "INT"), ("b", "STRING"))
    }

    it("should return same array when no duplicates") {
      val items = Array(("a", "INT"), ("b", "STRING"))
      items.withItemsDeduped shouldBe Array(("a", "INT"), ("b", "STRING"))
    }

    it("should handle empty array") {
      val items = Array.empty[(String, String)]
      items.withItemsDeduped shouldBe empty
    }
  }

  describe("SchemaFlattener") {

    lazy val spark: SparkSession = SparkSession
      .builder()
      .master("local[*]")
      .appName("SchemaFlattenerTest")
      .getOrCreate()

    it("should flatten a flat schema") {
      val df = spark.createDataFrame(
        spark.sparkContext.parallelize(Seq(org.apache.spark.sql.Row(1, "a"))),
        StructType(Seq(StructField("id", IntegerType), StructField("name", StringType)))
      )
      val cols = df.flattenedSchema(df.schema)
      cols should have length 2
      val colStrs = cols.map(_.toString())
      colStrs.exists(_.contains("id")) shouldBe true
      colStrs.exists(_.contains("name")) shouldBe true
    }

    it("should flatten a nested struct schema") {
      val nestedSchema = StructType(
        Seq(
          StructField("id", IntegerType),
          StructField(
            "info",
            StructType(
              Seq(
                StructField("first_name", StringType),
                StructField("last_name", StringType)
              )
            )
          )
        )
      )
      val df = spark.createDataFrame(
        spark.sparkContext.parallelize(Seq(org.apache.spark.sql.Row(1, org.apache.spark.sql.Row("John", "Doe")))),
        nestedSchema
      )
      val cols = df.flattenedSchema(df.schema)
      cols should have length 3
      val colNames = cols.map(_.toString())
      colNames.exists(_.contains("id")) shouldBe true
      colNames.exists(_.contains("info_first_name")) shouldBe true
      colNames.exists(_.contains("info_last_name")) shouldBe true
    }

    it("should flatten a deeply nested schema") {
      val deepSchema = StructType(
        Seq(
          StructField(
            "outer",
            StructType(
              Seq(
                StructField(
                  "inner",
                  StructType(
                    Seq(
                      StructField("value", StringType)
                    )
                  )
                )
              )
            )
          )
        )
      )
      val df = spark.createDataFrame(
        spark.sparkContext.parallelize(Seq(org.apache.spark.sql.Row(org.apache.spark.sql.Row(org.apache.spark.sql.Row("v"))))),
        deepSchema
      )
      val cols = df.flattenedSchema(df.schema)
      cols should have length 1
      cols.head.toString() should include("value")
    }

    it("should handle schema with prefix") {
      val schema = StructType(Seq(StructField("col1", StringType)))
      val df = spark.createDataFrame(
        spark.sparkContext.parallelize(Seq(org.apache.spark.sql.Row("val"))),
        schema
      )
      val cols = df.flattenedSchema(schema, "prefix")
      cols should have length 1
      cols.head.toString() should include("prefix")
    }
  }
}
