package me.rakirahman.etl.transformer.scd

import me.rakirahman.etl.transformer.scd.SCDTransformationMetadata.{KeyGenInfo, NonSCDTransformationInfo, SCDTransformationInfo}

/** Metadata mappings for Slowly Changing Dimension (SCD) transformations.
  */
trait SCDTransformationMetadataMappings {

  /** Mapping of surrogate column names to hash map names.
    */
  val SurrogateColumnToHashMap: Map[String, String]

  /** Mapping of dim/fact table names to [[KeyGenInfo]].
    */
  val KeyGenInfoMap: Map[String, KeyGenInfo]

  /** Mapping of dimension table names to SCDTransformationInfo.
    */
  val DimTransformationTableInfoMap: Map[String, SCDTransformationInfo]

  /** Mapping of fact table names to NonSCDTransformationInfo.
    */
  val FactTransformationTableInfoMap: Map[String, NonSCDTransformationInfo]
}
