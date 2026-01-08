package me.rakirahman.spark.plugin.httpdumperplugin.conf

import scala.util.control.NonFatal

import org.apache.spark.SparkConf
import org.apache.spark.internal.Logging

trait HttpDumperProperty[T] extends Logging {
  def key: String
  def alternativeKeys: Seq[String] = Nil
  def default: T
  def get(conf: SparkConf): T = {
    val value = getImpl(conf)
    logInfo(s"using $value for $key")
    value
  }
  protected def getImpl(conf: SparkConf): T
}

case class StringHttpDumperProperty(
    override val key: String,
    override val default: String,
    override val alternativeKeys: Seq[String] = Nil
) extends HttpDumperProperty[String] {
  override protected def getImpl(conf: SparkConf): String = {
    (key +: alternativeKeys)
      .find(conf.contains)
      .map(conf.get(_, default))
      .getOrElse(default)
  }
}

case class IntHttpDumperProperty(
    override val key: String,
    override val default: Int,
    override val alternativeKeys: Seq[String] = Nil,
    min: Option[Int] = None,
    max: Option[Int] = None
) extends HttpDumperProperty[Int] {
  override protected def getImpl(conf: SparkConf): Int = {
    try {
      val value = (key +: alternativeKeys)
        .find(conf.contains)
        .map(conf.getInt(_, default))
        .getOrElse(default)
      if (min.isDefined && value < min.get) {
        logWarning(s"got $value for $key, but the allowed minimum is ${min.get}; using ${min.get}")
        return min.get
      }
      if (max.isDefined && value > max.get) {
        logWarning(s"got $value for $key, but the allowed maximum is ${max.get}; using ${max.get}")
        return max.get
      }
      value
    } catch {
      case NonFatal(e) =>
        logWarning(s"got exception while getting value for $key; assuming $default", e)
        default
    }
  }
}

case class HttpDumperConf(
    databaseName: String,
    tableName: String,
    tableFormat: String,
    executorPort: Int,
    flushTimeoutSeconds: Int
)

object HttpDumperConf {
  private val databaseName = StringHttpDumperProperty(
    key = "spark.plugin.conf.database.name",
    default = "defaultdb"
  )

  private val tableName = StringHttpDumperProperty(
    key = "spark.plugin.conf.table.name",
    default = "defaulttable"
  )

  private val tableFormat = StringHttpDumperProperty(
    key = "spark.plugin.conf.table.format",
    default = "delta"
  )

  private val executorPort = IntHttpDumperProperty(
    key = "spark.plugin.conf.executor.port",
    default = 9003,
    min = Some(1024),
    max = Some(65535)
  )

  private val flushTimeoutSeconds = IntHttpDumperProperty(
    key = "spark.plugin.conf.flush.timeout.seconds",
    default = 60,
    min = Some(1),
    max = Some(3600)
  )

  def apply(conf: SparkConf): HttpDumperConf = {
    HttpDumperConf(
      databaseName = databaseName.get(conf),
      tableName = tableName.get(conf),
      tableFormat = tableFormat.get(conf),
      executorPort = executorPort.get(conf),
      flushTimeoutSeconds = flushTimeoutSeconds.get(conf)
    )
  }
}
