package me.rakirahman.quality.maintenance.manager

import me.rakirahman.quality.maintenance.metadata.DeltaMaintenanceScripts
import java.util.concurrent.atomic.AtomicInteger
import org.apache.spark.internal.Logging
import org.apache.spark.sql.SparkSession
import scala.collection.mutable.ListBuffer

/** Executes maintenance scripts for Delta tables.
  *
  * @param spark
  *   The Spark session.
  */
class DeltaTableMaintenanceManager(
    spark: SparkSession
) extends TableMaintenanceManager[ListBuffer, DeltaMaintenanceScripts]
    with Logging {

  /** @inheritdoc
    */
  def executeMaintenance(
      scripts: ListBuffer[DeltaMaintenanceScripts]
  ): Boolean = {
    val numMaintenanceRemaining = new AtomicInteger(scripts.length)

    scripts.par.foreach { script =>
      val databaseName = script.databaseName
      val tableName = script.tableName
      val scriptToRun = script.scriptToRun
      val logPrefix = s"[DB - $databaseName] [TABLE - $tableName]"
      val maxRetriesPerScript = 10
      val retryAfterInMilliseconds = 60000

      logInfo(s"$logPrefix Initiating maintenance")
      scriptToRun.foreach { script =>
        var retries = 0
        var success = false

        while (retries < maxRetriesPerScript && !success) {
          retries += 1
          try {
            logInfo(
              s"$logPrefix [ATTEMPT $retries OF $maxRetriesPerScript] Executing script: $script"
            )

            spark.sql(script)

            success = true
          } catch {
            case e: Exception =>
              logWarning(
                s"$logPrefix Error executing script: $script (Attempt $retries of $maxRetriesPerScript): $e"
              )
              if (retries == maxRetriesPerScript) {
                logError(
                  s"Failed despite $maxRetriesPerScript retries with error $e for script: $script"
                )

                false

              } else {
                logWarning(
                  s"$logPrefix Retrying script: '$script' again in ${retryAfterInMilliseconds} milliseconds"
                )
                Thread.sleep(retryAfterInMilliseconds)
              }
          }
        }
      }
      val remaining = numMaintenanceRemaining.decrementAndGet()
      logInfo(
        s"$logPrefix Maintenance completed for ${script.databaseName}.${script.tableName}, tables remaining: ${remaining}"
      )
    }

    true

  }

}

/** Companion object for DeltaTableMaintenanceManager.
  */
object DeltaTableMaintenanceManager {

  /** Constructor.
    *
    * @param spark
    *   The Spark session.
    */
  def apply(
      spark: SparkSession
  ): DeltaTableMaintenanceManager =
    new DeltaTableMaintenanceManager(spark)

}
