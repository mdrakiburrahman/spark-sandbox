package me.rakirahman.spark

import org.apache.spark.internal.Logging

import scala.util.{Failure, Success, Try}
import scala.util.matching.Regex

/** A retry policy for operations that may fail with transient errors.
  *
  * @param patterns
  *   Array of compiled Regex patterns to match against exception class names and messages for determining retryable errors.
  * @param maxAttempts
  *   Maximum number of attempts before giving up (default: 5).
  */
// @formatter:off
case class RetryPolicy(
    patterns: Array[Regex],
    maxAttempts: Int = RetryPolicy.DefaultMaxAttempts
) extends Logging {

  /** Execute an operation with this retry policy.
    */
  def execute[T](operation: => T): T = executeInternal(operation, attempt = 1)

  private def executeInternal[T](operation: => T, attempt: Int): T = {
    Try(operation) match {
      case Success(result) =>
        if (attempt > 1) logInfo(s"Operation succeeded on attempt $attempt")
        result

      case Failure(exception) if attempt < maxAttempts && matchesPattern(exception) =>
        val backoffMs = 1000 * attempt
        logWarning(
          s"Retryable error detected on attempt $attempt/$maxAttempts. " +
          s"Retrying in ${backoffMs}ms... Error: ${exception.getMessage}"
        )
        Thread.sleep(backoffMs)
        executeInternal(operation, attempt + 1)

      case Failure(exception) =>
        if (attempt > 1) {
          logError(s"Operation failed after $attempt attempts. Error: ${exception.getMessage}")
        }
        throw exception
    }
  }

  private def matchesPattern(exception: Throwable): Boolean = {
    getExceptionChain(exception).exists { ex =>
      val className = ex.getClass.getName
      val message = Option(ex.getMessage).getOrElse("")
      patterns.exists { pattern =>
        pattern.findFirstIn(className).isDefined ||
        pattern.findFirstIn(message).isDefined
      }
    }
  }

  private def getExceptionChain(exception: Throwable): List[Throwable] = {
    def collectCauses(ex: Throwable, acc: List[Throwable]): List[Throwable] = {
      if (ex == null) acc
      else collectCauses(ex.getCause, ex :: acc)
    }
    collectCauses(exception, Nil).reverse
  }
}
// @formatter:on

/** Companion object with predefined retry policies.
  */
object RetryPolicy {

  /** Default maximum number of retry attempts. */
  val DefaultMaxAttempts: Int = 5

  /** Retry policy for Delta Lake concurrency conflicts.
    */
  val DeltaConflicts: RetryPolicy = RetryPolicy(
    SparkExceptions.DefaultDeltaRetryPatterns.map(_.r)
  )
}
