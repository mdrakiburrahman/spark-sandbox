package me.rakirahman.feeds.io.table

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class TableIOFileTypesTest extends AnyFunSpec with Matchers {

  describe("TableIOFileTypes") {

    it("should contain all expected file types") {
      TableIOFileTypes.values should contain allOf (
        TableIOFileTypes.Csv,
        TableIOFileTypes.Parquet,
        TableIOFileTypes.Json,
        TableIOFileTypes.Delta,
        TableIOFileTypes.Avro,
        TableIOFileTypes.Orc,
        TableIOFileTypes.SequenceFile,
        TableIOFileTypes.Xml,
        TableIOFileTypes.Text
      )
    }

    it("should have correct number of file types") {
      TableIOFileTypes.values should have size 9
    }
  }
}
