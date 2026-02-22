package me.rakirahman.etl.execution.stateless

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration._

/** An action to be executed.
  *
  * @param name
  *   The name of the action.
  * @param metadata
  *   The metadata (arbitrary state object) associated with the action.
  * @param maxRetries
  *   The maximum number of retry attempts for this action.
  */
case class Action[T](
    name: String,
    metadata: T,
    maxRetries: Int
)

/** A job consisting of a sequence of one or more [[Action]]s.
  *
  * @param actions
  *   The sequence of actions to be executed as part of the job.
  */
case class Job[T](actions: Seq[Action[T]])

/** The status of a unit of work execution.
  *
  * @param didSucceed
  *   Indicates whether the unit of work succeeded.
  * @param durationInSeconds
  *   The duration of the unit of work execution in seconds.
  * @param retried
  *   The number of times the unit of work was retried.
  */
case class Status(
    didSucceed: Boolean,
    durationInSeconds: Long,
    retried: Int
)

/** Constants.
  */
object SequencerConstants {
  val ERROR_DUPLICATE_ACTIONS = "Duplicate action names found"
}

/** The status of a sequencer, including the overall status and the status of individual actions.
  *
  * @param status
  *   The overall status of the sequencer.
  * @param actionStatus
  *   A map containing the status of individual actions, keyed by action name.
  */
case class SequencerStatus(
    status: Status,
    actionStatus: Map[String, Status]
)

/** A sequence of jobs to be executed in order.
  *
  * @param jobs
  *   The sequence of jobs to be executed.
  */
case class Sequencer[T](val jobs: Seq[Job[T]]) {

  /** Executes all [[Job]]s - each job's actions are executed in parallel, and the next job starts only after all [[Action]] in the current job complete.
    *
    * @param work
    *   The work to materialize each action.
    * @param atMost
    *   The maximum duration to wait for each job stage to complete.
    * @param ctx
    *   The implicit [[ExecutionContext]] for running futures.
    * @return
    *   The [[SequencerStatus]].
    */
  def runParallel(
      work: Action[T] => Unit,
      atMost: Duration = Duration.Inf
  )(implicit ctx: ExecutionContext): SequencerStatus = {

    validateOpts()

    var overallSuccess = true
    val actionStatus = scala.collection.mutable.Map[String, Status]()
    var totalRetries = 0

    val sequencerStart = System.nanoTime()

    for (job <- jobs) {
      val futures = job.actions.map { action =>
        Future {
          executeAction(action, work, sequencerStart)
        }
      }
      Await.result(Future.sequence(futures), atMost).foreach { case (name, status) =>
        actionStatus(name) = status
        totalRetries += status.retried
        if (!status.didSucceed) overallSuccess = false
      }
    }

    SequencerStatus(
      status = Status(
        overallSuccess,
        (System.nanoTime() - sequencerStart) / 1000000000,
        totalRetries
      ),
      actionStatus = actionStatus.toMap
    )
  }

  /** Executes all [[Job]]s - each job's actions are executed sequentially.
    *
    * @param work
    *   The work to materialize each action.
    * @param atMost
    *   The maximum duration to wait for all jobs to complete.
    * @return
    *   The [[SequencerStatus]].
    */
  def runSequential(
      work: Action[T] => Unit,
      atMost: Duration = Duration.Inf
  ): SequencerStatus = {

    validateOpts()

    var overallSuccess = true
    val actionStatus = scala.collection.mutable.Map[String, Status]()
    var totalRetries = 0

    val sequencerStart = System.nanoTime()
    val deadline =
      if (atMost.isFinite) System.nanoTime() + atMost.toNanos else Long.MaxValue

    for (job <- jobs) {
      for (action <- job.actions) {
        val (name, status) = executeAction(action, work, sequencerStart)
        actionStatus(name) = status
        totalRetries += status.retried
        if (!status.didSucceed) overallSuccess = false

        if (System.nanoTime() > deadline)
          throw new java.util.concurrent.TimeoutException(
            "Serial sequencer has run out of time"
          )
      }
    }

    SequencerStatus(
      status = Status(
        overallSuccess,
        (System.nanoTime() - sequencerStart) / 1000000000,
        totalRetries
      ),
      actionStatus = actionStatus.toMap
    )
  }

  /** Validates options.
    */
  private def validateOpts(): Unit = {
    val duplicates =
      jobs.flatMap(_.actions.map(_.name)).groupBy(identity).collect {
        case (x, xs) if xs.size > 1 => x
      }
    if (duplicates.nonEmpty) {
      throw new IllegalArgumentException(
        s"${SequencerConstants.ERROR_DUPLICATE_ACTIONS}: ${duplicates.mkString(", ")}"
      )
    }
  }

  /** Executes the given action using the provided callback.
    */
  private def executeAction(
      action: Action[T],
      work: Action[T] => Unit,
      sequencerStart: Long
  ): (String, Status) = {
    var attempt = 0
    var success = false
    val maxAttempts = action.maxRetries + 1
    while (attempt < maxAttempts && !success) {
      try {
        work(action)
        success = true
      } catch {
        case e: Throwable =>
          attempt += 1
          if (attempt >= maxAttempts) throw e
      }
    }
    (
      action.name,
      Status(
        success,
        (System.nanoTime() - sequencerStart) / 1000000000,
        if (success) attempt else maxAttempts
      )
    )
  }
}
