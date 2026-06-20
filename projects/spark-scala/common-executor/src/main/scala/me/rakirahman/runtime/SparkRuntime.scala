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

  /** Resolves the Spark runtime from its canonical name (the [[RuntimeTypes]] string), defaulting to the local devcontainer for an absent or unrecognized name.
    *
    * Used to round-trip the resolved runtime through the Hadoop Configuration: the driver plugin stamps `runtime.toString` per account and the token provider resolves it back here at IO time.
    *
    * @param name
    *   The runtime name (e.g. `devcontainer`, `synapse`, `fabric`).
    * @return
    *   The resolved [[SparkRuntime]].
    */
  def fromName(name: String): RuntimeTypes =
    values.find(_.toString == Option(name).map(_.trim).getOrElse("")).getOrElse(Devcontainer)
}
