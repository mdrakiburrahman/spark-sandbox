package me.rakirahman.lineage

/** Identifies a dataset by its namespace and name.
  */
case class DatasetIdentifier(namespace: String, name: String) {
  def key: String = s"$namespace::$name"
}

/** A table-level lineage edge: source dataset → target dataset via a job.
  */
case class TableLineageEdge(
    source: DatasetIdentifier,
    target: DatasetIdentifier,
    jobName: String,
    jobNamespace: String
)

/** A column-level lineage edge: source field → target field across datasets.
  */
case class ColumnLineageEdge(
    sourceDataset: DatasetIdentifier,
    sourceField: String,
    targetDataset: DatasetIdentifier,
    targetField: String,
    transformationType: String = "UNKNOWN",
    transformationSubtype: String = "UNKNOWN"
)

/** A field in a dataset schema.
  */
case class SchemaField(
    name: String,
    fieldType: String,
    description: Option[String] = None
)

/** The role of a dataset in the lineage graph.
  */
sealed trait DatasetRole

object DatasetRole {
  case object Source extends DatasetRole
  case object Intermediate extends DatasetRole
  case object Target extends DatasetRole
}

/** A dataset with its metadata in the lineage graph.
  */
case class LineageDataset(
    identifier: DatasetIdentifier,
    shortName: String,
    schema: Seq[SchemaField],
    role: DatasetRole
)

/** Trait for extracting lineage information.
  * @tparam T
  *   the type of the lineage result, specific to the implementation.
  */
trait LineageExtractor[T] {
  def getLineage(): T
}
