package me.rakirahman.sparkdemo.etl

import me.rakirahman.sparkdemo.etl.loader.bronze.reddit.MicrosoftEmployeesSeedLoader

import org.apache.spark.sql.SparkSession
import org.apache.spark.sql.types._

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers

import java.nio.file.{Files, Paths}

import scala.io.Source

class MicrosoftEmployeesSeedLoaderTest extends AnyFunSpec with Matchers {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .getOrCreate()

  describe("MicrosoftEmployeesSeedLoader (classpath-only contract)") {

    it("must not contain any on-disk read APIs in its source — classpath only") {
      val sourcePath = Paths.get(
        "src/main/scala/me/rakirahman/sparkdemo/etl/loader/bronze/reddit/MicrosoftEmployeesSeedLoader.scala"
      )
      val absolute =
        if (Files.exists(sourcePath)) sourcePath
        else Paths.get("spark-demo").resolve(sourcePath)
      assert(Files.exists(absolute), s"Expected loader source at $absolute (cwd=${Paths.get(".").toAbsolutePath})")

      val source = Source.fromFile(absolute.toFile, "UTF-8").mkString
      val forbidden = Seq(
        "new File(",
        "java.io.File",
        "java.io.FileInputStream",
        "FileInputStream(",
        "java.nio.file.Paths",
        "java.nio.file.Files",
        "Paths.get(",
        "Files.read",
        "spark.read.csv(\"file:",
        ".load(\"file:",
        "scala.io.Source.fromFile"
      )
      val hits = forbidden.filter(token => source.contains(token))
      hits mustBe empty
    }

    it("must find the seed CSV on the classpath at the canonical resource path") {
      val cl = Option(Thread.currentThread().getContextClassLoader).getOrElse(getClass.getClassLoader)
      val url = cl.getResource(MicrosoftEmployeesSeedLoader.DefaultResourcePath)
      url must not be null
    }

    it("must materialize a DataFrame whose schema matches MicrosoftEmployeesSeedLoader.Schema") {
      val df = new MicrosoftEmployeesSeedLoader(spark).load()
      df.schema.fields.map(f => f.name -> f.dataType).toSeq mustBe Seq(
        "username" -> StringType,
        "job_title" -> StringType,
        "department" -> StringType,
        "seed_ingest_time" -> TimestampType
      )
    }

    it("must load exactly 357 rows (header excluded) from the bundled seed") {
      val df = new MicrosoftEmployeesSeedLoader(spark).load()
      df.count() mustBe 357L
    }

    it("must strip the UTF-8 BOM from the first row's username") {
      val df = new MicrosoftEmployeesSeedLoader(spark).load()
      val firstUsername = df.select("username").head().getString(0)
      firstUsername.startsWith("\uFEFF") mustBe false
      firstUsername mustBe "aonelakeuser"
    }

    it("must preserve the typed values for the canonical aonelakeuser row") {
      val df = new MicrosoftEmployeesSeedLoader(spark).load()
      val row = df.where("username = 'aonelakeuser'").collect().head
      row.getAs[String]("job_title") mustBe "PRINCIPAL PROGRAM MANAGER"
      row.getAs[String]("department") mustBe "OneLake PM Eng US R&D"
      row.getAs[java.sql.Timestamp]("seed_ingest_time") must not be null
    }
  }
}
