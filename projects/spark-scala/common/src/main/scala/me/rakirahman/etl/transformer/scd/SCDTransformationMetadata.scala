package me.rakirahman.etl.transformer.scd

/** Represents the metadata for Slowly Changing Dimension (SCD) transformation.
  */
object SCDTransformationMetadata {

  /** Represents the information required for generating surrogate keys in
    * Slowly Changing Dimension (SCD) transformations - for a dimension table.
    *
    * @param surrogateKeyCol
    *   The name of the column that stores the surrogate key.
    * @param naturalKeyCol
    *   The name of the column that stores the natural key.
    * @param surrogateKeyHashLogic
    *   The logic used for generating the surrogate key hash.
    */
  case class KeyGenInfo(
      surrogateKeyCol: String,
      naturalKeyCol: String,
      surrogateKeyHashLogic: String
  )

  /** Represents the information required for performing Slowly Changing
    * Dimension (SCD) transformations.
    *
    * @param primaryKeyCol
    *   The name of the primary key column.
    * @param matchStatement
    *   The SQL statement used for matching records in the SCD transformation.
    * @param nonSCDColumns
    *   An array of column names that are not part of the SCD transformation.
    * @param fullColumnsUpsertMap
    *   A map that maps the column names to their corresponding upsert
    *   statements in the SCD transformation.
    */
  case class SCDTransformationInfo(
      primaryKeyCol: String,
      matchStatement: String,
      nonSCDColumns: Array[String],
      fullColumnsUpsertMap: Map[String, String]
  )

  /** Represents the information required for performing non-SCD
    * transformations.
    *
    * @param allColumns
    *   An array of all column names in the non-SCD transformation.
    */
  case class NonSCDTransformationInfo(
      allColumns: Array[String]
  )
}
