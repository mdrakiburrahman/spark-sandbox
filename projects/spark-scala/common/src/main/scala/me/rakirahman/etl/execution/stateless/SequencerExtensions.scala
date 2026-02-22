package me.rakirahman.etl.execution.stateless

/** Provides extension methods for working with [[Sequencer]].
  */
object SequencerExtensions {

  /** Implicit class for metadata extensions.
    *
    * @param sequencer
    *   The sequencer to operate on.
    */
  implicit class MetadataExtensions[T](sequencer: Sequencer[T]) {

    /** Retrieves a map of action names to their associated metadata from all jobs in the sequencer.
      *
      * @return
      *   A map where each key is the name of an action and each value is the metadata of type [[T]] associated with that action.
      */
    def getMetadata(): Map[String, T] = sequencer.jobs
      .flatMap(_.actions)
      .map(action => action.name -> action.metadata.asInstanceOf[T])
      .toMap
  }
}
