package me.rakirahman.etl.transformer.extensions

import DataFrameArrayExtensions._
import DataFrameExtensions._

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types.{ArrayType, StringType, StructType}

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers

class DataFrameExtensionsTest extends AnyFunSpec with Matchers {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .getOrCreate()

  describe("DataFrameArrayTransformer.unionWithMergedSchema") {

    it("should union DataFrames with different schemas by adding null columns") {
      import spark.implicits._

      val df1 = Seq((1, "a")).toDF("col1", "col2")
      val df2 = Seq((2, 10)).toDF("col1", "col3")

      val result = Array(df1, df2).unionWithMergedSchema()

      result.count() must be(2)
      result.columns.sorted must be(Array("col1", "col2", "col3"))

      val rows = result.orderBy("col1").collect()
      rows(0).getAs[String]("col2") must be("a")
      rows(0).isNullAt(rows(0).fieldIndex("col3")) must be(true)
      rows(1).isNullAt(rows(1).fieldIndex("col2")) must be(true)
      rows(1).getAs[Int]("col3") must be(10)
    }

    it("should throw on conflicting data types") {
      import spark.implicits._

      val df1 = Seq((1, "a")).toDF("col1", "col2")
      val df2 = Seq((2, 10)).toDF("col1", "col2")

      intercept[IllegalArgumentException] {
        Array(df1, df2).unionWithMergedSchema()
      }
    }
  }

  describe("DataFrameTransformer.withJsonizedArrays") {

    it("should convert array columns to JSON strings and drop originals") {
      import spark.implicits._

      val df = spark.read.json(
        Seq("""{"id":1,"tags":["a","b"],"nested":[{"x":1}]}""").toDS()
      )

      val result = df.withJsonizedArrays("_Json", dropArrayCol = true)

      result.columns.sorted must be(Array("id", "nested_Json", "tags_Json"))
      result.schema.fields.foreach { f =>
        f.dataType.isInstanceOf[ArrayType] must be(false)
      }
    }
  }
}
