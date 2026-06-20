package me.rakirahman.runtime

/** Enumeration defining the different types of Spark runtimes.
  */
object SparkRuntime extends Enumeration {
  type RuntimeTypes = Value
  val Devcontainer = Value("devcontainer")
  val Synapse = Value("synapse")
  val Fabric = Value("fabric")

  /** Cluster type tag set by Synapse on `spark.cluster.type`.
    */
  val SynapseClusterType: String = "synapse"

  /** Cluster type tag set by Fabric on `spark.cluster.type`.
    */
  val FabricClusterType: String = "trident"

  /** Resolves the Spark runtime from the `spark.cluster.type` Spark conf value.
    *
    * An absent or unrecognized value implies the local devcontainer, mirroring how the cloud runtimes stamp `spark.cluster.type` while local runs do not.
    *
    * @param clusterType
    *   The value of the `spark.cluster.type` Spark conf.
    * @return
    *   The resolved [[SparkRuntime]].
    */
  def fromClusterType(clusterType: String): RuntimeTypes =
    Option(clusterType).map(_.trim).getOrElse("") match {
      case SynapseClusterType => Synapse
      case FabricClusterType  => Fabric
      case _                  => Devcontainer
    }
}
