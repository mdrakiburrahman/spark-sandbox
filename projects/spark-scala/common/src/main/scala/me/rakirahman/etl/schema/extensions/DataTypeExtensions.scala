package me.rakirahman.etl.schema.extensions

import org.apache.spark.sql.types._

/** Provides extension methods for Spark [[DataType]] objects to support type conversions.
  */
object DataTypeExtensions {

  implicit class DataTypeExtensions(sparkType: DataType) {

    /** Converts a Spark [[DataType]] to its corresponding SQL Server type string representation.
      *
      * @return
      *   A string representing the equivalent SQL Server data type
      * @throws RuntimeException
      *   if the Spark type is not supported for SQL Server conversion
      */
    def toSqlServerType(): String =
      sparkType match {
        case BinaryType    => "VARBINARY(MAX)"
        case BooleanType   => "BIT"
        case ByteType      => "TINYINT"
        case DateType      => "DATE"
        case DoubleType    => "DOUBLE PRECISION"
        case FloatType     => "REAL"
        case IntegerType   => "INTEGER"
        case LongType      => "BIGINT"
        case ShortType     => "SMALLINT"
        case StringType    => "NVARCHAR(MAX)"
        case TimestampType => "DATETIME"
        case _ =>
          throw new RuntimeException(
            s"Unsupported Spark type for SQL Server conversion: $sparkType"
          )
      }
  }
}
