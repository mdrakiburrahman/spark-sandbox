package me.rakirahman.etl.transformer

import me.rakirahman.etl.execution.stateless.Sequencer

import org.apache.spark.sql.DataFrame

/** Transforms Dataframes.
  */
trait DataTransformer {

  /** Performs transformation against a Batch, Microbatch or Stream.
    *
    * @param inDF
    *   The input data as a Spark DataFrame.
    * @return
    *   The transformed data as a Spark DataFrame.
    */
  def transform(inDF: DataFrame): DataFrame

  /** Performs transformation against a (Micro)batch.
    *
    * @param inDF
    *   The input data as a Spark DataFrame.
    * @param batchId
    *   The micro batch id.
    * @return
    *   The transformed data as a Spark DataFrame.
    */
  def transformBatch(inDF: DataFrame, batchId: Long): DataFrame = ???

  /** Performs transformation against a (Micro)batch into a [[Sequencer]].
    *
    * @param inDF
    *   The input data as a Spark DataFrame.
    * @param batchId
    *   The micro batch id.
    * @return
    *   The transformed data as a [[Sequencer]].
    */
  def transformBatchSequencer(
      inDF: DataFrame,
      batchId: Long
  ): Sequencer[DataFrame] = ???
}
