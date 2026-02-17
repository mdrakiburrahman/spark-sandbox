package me.rakirahman.quality.integrity.metadata

/** Represents the metrics for SCD (Slowly Changing Dimension) tables.
  *
  * @param numRowsCount
  *   The number of rows in the dataset.
  * @param distinctPrimaryKeyCount
  *   The count of distinct primary keys in the dataset.
  * @param distinctNaturalKeyCount
  *   The count of distinct natural keys in the dataset.
  * @param distinctEffectiveNaturalKeyCount
  *   The count of distinct effective natural keys in the dataset.
  * @param endDateMaxButNotEffectiveRowCount
  *   The count of rows where the end date is maximum but not effective.
  * @param endDateNotMaxButIsEffectiveRowCount
  *   The count of rows where the end date is not maximum but is effective.
  * @param multipleEffectiveNaturalKeyCount
  *   The count of rows with multiple effective natural keys.
  * @param datesOutOfOrderNaturalKeyCount
  *   The count of rows with out-of-order natural keys.
  */
case class ScdMetrics(
    numRowsCount: Int,
    distinctPrimaryKeyCount: Int,
    distinctNaturalKeyCount: Int,
    distinctEffectiveNaturalKeyCount: Int,
    endDateMaxButNotEffectiveRowCount: Int,
    endDateNotMaxButIsEffectiveRowCount: Int,
    multipleEffectiveNaturalKeyCount: Int,
    datesOutOfOrderNaturalKeyCount: Int
)
