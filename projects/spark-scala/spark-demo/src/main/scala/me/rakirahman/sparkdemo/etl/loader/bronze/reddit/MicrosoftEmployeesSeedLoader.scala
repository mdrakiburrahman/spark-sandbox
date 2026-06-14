package me.rakirahman.sparkdemo.etl.loader.bronze.reddit

import me.rakirahman.etl.loader.DataLoader

import org.apache.spark.internal.Logging
import org.apache.spark.sql.{DataFrame, Row, SparkSession}
import org.apache.spark.sql.types._

import java.nio.charset.StandardCharsets

import scala.io.Source

/** Loads the bundled Microsoft-employees seed CSV from the spark-demo JAR's classpath and returns a typed DataFrame ready to be overwritten into `reddit_db.microsoft_employees`.
  *
  * The CSV ships inside the assembly JAR at the resource path [[MicrosoftEmployeesSeedLoader.DefaultResourcePath]] (see `spark-demo/src/main/resources/seeds/microsoft_employees.csv`). This loader is **classpath-only** by design — it never resolves the seed from a filesystem path so the same code
  * runs unchanged inside Fabric, the devcontainer, or any other spark-submit host where the JAR is the single source of truth.
  *
  * @param spark
  *   Spark session used to materialize the DataFrame.
  * @param resourcePath
  *   Classpath-relative path to the bundled CSV.
  */
class MicrosoftEmployeesSeedLoader(
    spark: SparkSession,
    resourcePath: String = MicrosoftEmployeesSeedLoader.DefaultResourcePath
) extends DataLoader
    with Logging {

  /** @inheritdoc
    *
    * Reads the bundled CSV via `getClassLoader.getResourceAsStream`, strips the UTF-8 BOM from the header line if present, parses each remaining row into the typed schema, and emits a single DataFrame with the schema defined in [[MicrosoftEmployeesSeedLoader.Schema]].
    */
  override def load(): DataFrame = {
    val cl = Option(Thread.currentThread().getContextClassLoader).getOrElse(getClass.getClassLoader)
    val stream = Option(cl.getResourceAsStream(resourcePath)).getOrElse {
      throw new IllegalStateException(
        s"Bundled seed CSV not found on the classpath at '$resourcePath'. Did the spark-demo assembly JAR include src/main/resources/$resourcePath?"
      )
    }

    val raw =
      try Source.fromInputStream(stream, StandardCharsets.UTF_8.name()).getLines().toList
      finally stream.close()

    if (raw.isEmpty) {
      throw new IllegalStateException(s"Bundled seed CSV at '$resourcePath' is empty")
    }

    val header = MicrosoftEmployeesSeedLoader.stripBom(raw.head)
    val expectedHeader = "Username,Job Title,Department"
    if (!header.equalsIgnoreCase(expectedHeader)) {
      throw new IllegalStateException(
        s"Bundled seed CSV header mismatch at '$resourcePath': expected '$expectedHeader', got '$header'"
      )
    }

    val ingestTs = new java.sql.Timestamp(System.currentTimeMillis())
    val rows: Seq[Row] = raw.tail.iterator
      .map(MicrosoftEmployeesSeedLoader.stripBom)
      .filter(_.nonEmpty)
      .map { line =>
        val cols = MicrosoftEmployeesSeedLoader.parseCsvLine(line)
        if (cols.length != 3) {
          throw new IllegalStateException(
            s"Bundled seed CSV at '$resourcePath' has malformed row (expected 3 cols, got ${cols.length}): '$line'"
          )
        }
        Row(cols(0).trim, cols(1).trim, cols(2).trim, ingestTs)
      }
      .toSeq

    logInfo(s"MicrosoftEmployeesSeedLoader: loaded ${rows.size} rows from classpath:$resourcePath")

    val javaRows = new java.util.ArrayList[Row](rows.size)
    rows.foreach(javaRows.add)
    spark.createDataFrame(javaRows, MicrosoftEmployeesSeedLoader.Schema)
  }
}

/** Companion holding the canonical resource path, output schema, and small parsing helpers.
  */
object MicrosoftEmployeesSeedLoader {

  /** Classpath-relative path to the bundled seed CSV. */
  val DefaultResourcePath: String = "seeds/microsoft_employees.csv"

  /** Output DataFrame schema. */
  val Schema: StructType = StructType(
    Array(
      StructField("username", StringType, nullable = false),
      StructField("job_title", StringType, nullable = true),
      StructField("department", StringType, nullable = true),
      StructField("seed_ingest_time", TimestampType, nullable = false)
    )
  )

  /** Strip a UTF-8 byte-order mark from the start of `s`, if present. */
  def stripBom(s: String): String =
    if (s != null && s.nonEmpty && s.charAt(0) == '\uFEFF') s.substring(1) else s

  /** Minimal RFC-4180-style CSV line parser — splits on `,` while honoring `"…"` quoted fields (so embedded commas survive) and unescaping doubled quotes (`""` → `"`). Only used for the bundled seed which has no embedded newlines, so a single-line parse is enough.
    */
  def parseCsvLine(line: String): Array[String] = {
    val out = scala.collection.mutable.ArrayBuffer.empty[String]
    val cur = new StringBuilder
    var inQuotes = false
    var i = 0
    while (i < line.length) {
      val ch = line.charAt(i)
      if (inQuotes) {
        if (ch == '"') {
          if (i + 1 < line.length && line.charAt(i + 1) == '"') {
            cur.append('"')
            i += 1
          } else {
            inQuotes = false
          }
        } else {
          cur.append(ch)
        }
      } else {
        if (ch == ',') {
          out += cur.toString
          cur.clear()
        } else if (ch == '"' && cur.isEmpty) {
          inQuotes = true
        } else {
          cur.append(ch)
        }
      }
      i += 1
    }
    out += cur.toString
    out.toArray
  }

  /** Factory.
    *
    * @param spark
    *   Spark session.
    */
  def apply(spark: SparkSession): MicrosoftEmployeesSeedLoader =
    new MicrosoftEmployeesSeedLoader(spark)
}
