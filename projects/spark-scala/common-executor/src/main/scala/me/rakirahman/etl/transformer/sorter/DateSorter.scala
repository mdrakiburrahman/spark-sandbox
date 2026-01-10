package me.rakirahman.etl.transformer.sorter

import java.sql.Timestamp
import java.text.SimpleDateFormat
import org.apache.spark.sql.DataFrame
import org.apache.spark.sql.functions._

// @formatter:off

/** Enumeration defining well known partition column names.
  */
object SortableColumnNames extends Enumeration {
  type Types                    = Value

  val YEAR_MONTH_DATE_HOUR_LIT  = Value("YearMonthDateHour")
  val YEAR_MONTH_DATE_LIT       = Value("YearMonthDate")
  val YEAR_MONTH_LIT            = Value("YearMonth")
  val YEAR_LIT                  = Value("Year")

  val YEAR_MONTH_DATE_HOUR_EVENT = Value("event_year_date_hour")
  val YEAR_MONTH_DATE_EVENT      = Value("event_year_date")
  val YEAR_MONTH_EVENT           = Value("event_year_month")
  val YEAR_MONTH_SNAPSHOT        = Value("snapshot_year_month")
}

/** Enumeration defining the types of supported date formats.
  */
object DateTypes extends Enumeration {
  type Types            = Value
  val Year              = Value("yyyy")
  val YearMonth         = Value("yyyyMM")
  val YearMonthDate     = Value("yyyyMMdd")
  val YearMonthDateHour = Value("yyyyMMddHH")
}

/** Provides ordering for date strings in various formats, such as "yyyyMMdd",
  * "yyyyMM" etc.
  *
  * The ordering is based on the year, month, day etc. components of the date
  * string.
  *
  * Example usage:
  *
  * {{{
  *   import com.microsoft.azurearcdata.etl.transformer.sorter.{DateTypes, DateSorter}
  *
  *   val dates = Seq("20230101", "20221231", "20230102")
  *   val sortedDates = dates.sorted(DateSorter.get(DateTypes.YearMonth))
  * }}}
  *
  * Returns:
  *
  * sortedDates: Seq("20221231", "20230101", "20230102")
  */
object DateSorter {

  private val yearSorter: Ordering[String] = Ordering.by(dateStr => {
    val year = dateStr.substring(0, 4).toInt
    (year)
  })

  private val yearMonthSorter: Ordering[String] = Ordering.by(dateStr => {
    val year = dateStr.substring(0, 4).toInt
    val month = dateStr.substring(4, 6).toInt
    (year, month)
  })

  private val yearMonthDateSorter: Ordering[String] = Ordering.by(dateStr => {
    val year = dateStr.substring(0, 4).toInt
    val month = dateStr.substring(4, 6).toInt
    val day = dateStr.substring(6, 8).toInt
    (year, month, day)
  })

  private val yearMonthDateHourSorter: Ordering[String] = Ordering.by(dateStr => {
    val year = dateStr.substring(0, 4).toInt
    val month = dateStr.substring(4, 6).toInt
    val day = dateStr.substring(6, 8).toInt
    val hour = dateStr.substring(8, 10).toInt
    (year, month, day, hour)
  })

  private val sorterMap: Map[DateTypes.Types, Ordering[String]] = Map(
    DateTypes.Year              ->  yearSorter,
    DateTypes.YearMonth         ->  yearMonthSorter,
    DateTypes.YearMonthDate     ->  yearMonthDateSorter,
    DateTypes.YearMonthDateHour ->  yearMonthDateHourSorter,
  )

  private val columnTypeMap: Map[SortableColumnNames.Types, DateTypes.Types] = Map(
    SortableColumnNames.YEAR_LIT                   ->  DateTypes.Year,
    SortableColumnNames.YEAR_MONTH_DATE_LIT        ->  DateTypes.YearMonthDate,
    SortableColumnNames.YEAR_MONTH_DATE_EVENT      ->  DateTypes.YearMonthDate,
    SortableColumnNames.YEAR_MONTH_LIT             ->  DateTypes.YearMonth,
    SortableColumnNames.YEAR_MONTH_EVENT           ->  DateTypes.YearMonth,
    SortableColumnNames.YEAR_MONTH_SNAPSHOT        ->  DateTypes.YearMonth,
    SortableColumnNames.YEAR_MONTH_DATE_HOUR_LIT   ->  DateTypes.YearMonthDateHour,
    SortableColumnNames.YEAR_MONTH_DATE_HOUR_EVENT ->  DateTypes.YearMonthDateHour
  )

  /** Returns the appropriate ordering for the given date type.
    *
    * @param dateType
    *   The type of date format.
    * @return
    *   The ordering for the specified date type.
    */
  def get(dateType: DateTypes.Types): Ordering[String] = sorterMap.getOrElse(dateType, throw new IllegalArgumentException(s"Unsupported date type: ${dateType}"))

  /** Converts a TIMESTAMP column to match the specified DateTypes format.
    *
    * @param dateType
    *   The type of date format.
    * @param timestampColumn
    *   The column containing the Spark TIMESTAMP.
    * @param df
    *   The DataFrame to apply the transformations on.
    * @return
    *   The transformed DataFrame with the converted date column.
    */
  def convert(timestampColumn: String, newColumn: String, dateType: DateTypes.Types)(df: DataFrame): DataFrame = df.withColumn(newColumn, date_format(col(timestampColumn), dateType.toString))

  /** Converts a [[java.sql.Timestamp]] to a formatted string.
    *
    * @param timestamp
    *   The [[java.sql.Timestamp]] to be formatted.
    * @param dateType
    *   The type of date format.
    * @return
    *   The formatted date string.
    */
  def convert(timestamp: Timestamp, dateType: DateTypes.Types): String = new SimpleDateFormat(dateType.toString).format(timestamp)

  /** Converts a date string from [[SortableColumnNames]] to [[java.sql.Timestamp]].
    *
    * @param dateStr
    *   The date string to be converted.
    * @param columnName
    *   The [[SortableColumnNames]].
    * @return
    *   The converted [[java.sql.Timestamp]].
    */
  def convert(dateStr: String, columnName: SortableColumnNames.Types): Timestamp = new Timestamp(new SimpleDateFormat(columnTypeMap(columnName).toString).parse(dateStr).getTime)
}
// @formatter:on
