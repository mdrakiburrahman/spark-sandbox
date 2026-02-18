package me.rakirahman.etl.schema.extensions

import org.apache.spark.sql.types._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DataTypeExtensionsTest extends AnyFunSpec with Matchers {
  import DataTypeExtensions._

  describe("DataTypeExtensions") {

    it("should convert BinaryType to VARBINARY(MAX)") {
      BinaryType.toSqlServerType() shouldBe "VARBINARY(MAX)"
    }

    it("should convert BooleanType to BIT") {
      BooleanType.toSqlServerType() shouldBe "BIT"
    }

    it("should convert ByteType to TINYINT") {
      ByteType.toSqlServerType() shouldBe "TINYINT"
    }

    it("should convert DateType to DATE") {
      DateType.toSqlServerType() shouldBe "DATE"
    }

    it("should convert DoubleType to DOUBLE PRECISION") {
      DoubleType.toSqlServerType() shouldBe "DOUBLE PRECISION"
    }

    it("should convert FloatType to REAL") {
      FloatType.toSqlServerType() shouldBe "REAL"
    }

    it("should convert IntegerType to INTEGER") {
      IntegerType.toSqlServerType() shouldBe "INTEGER"
    }

    it("should convert LongType to BIGINT") {
      LongType.toSqlServerType() shouldBe "BIGINT"
    }

    it("should convert ShortType to SMALLINT") {
      ShortType.toSqlServerType() shouldBe "SMALLINT"
    }

    it("should convert StringType to NVARCHAR(MAX)") {
      StringType.toSqlServerType() shouldBe "NVARCHAR(MAX)"
    }

    it("should convert TimestampType to DATETIME") {
      TimestampType.toSqlServerType() shouldBe "DATETIME"
    }

    it("should throw for unsupported types") {
      a[RuntimeException] should be thrownBy {
        ArrayType(StringType).toSqlServerType()
      }
    }
  }
}
