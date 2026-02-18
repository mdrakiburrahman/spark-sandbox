package me.rakirahman.quality.maintenance.metadata

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaTableDescriptionTest extends AnyFunSpec with Matchers {

  describe("DeltaTableDescription") {

    it("should store all properties correctly") {
      val now = new java.sql.Timestamp(System.currentTimeMillis)
      val props = scala.collection.mutable.Map("key" -> "value")
      val desc = DeltaTableDescription(
        format = "delta",
        id = "abc-123",
        name = "test_table",
        description = "A test table",
        location = "/tmp/test_table",
        createdAt = now,
        lastModified = now,
        partitionColumns = Array("year"),
        clusteringColumns = Array.empty,
        numFiles = 10,
        sizeInBytes = 1024L,
        sizeInGigaBytes = 0.001,
        properties = props,
        minReaderVersion = 1,
        minWriterVersion = 2
      )
      desc.format shouldBe "delta"
      desc.id shouldBe "abc-123"
      desc.name shouldBe "test_table"
      desc.numFiles shouldBe 10
      desc.sizeInBytes shouldBe 1024L
      desc.minReaderVersion shouldBe 1
      desc.minWriterVersion shouldBe 2
      desc.properties("key") shouldBe "value"
      desc.partitionColumns shouldBe Array("year")
    }

    it("should support equality") {
      val now = new java.sql.Timestamp(0)
      val a = DeltaTableDescription("delta", "id", "n", "d", "/l", now, now, Array.empty, Array.empty, 0, 0, 0.0, scala.collection.mutable.Map.empty, 1, 1)
      val b = DeltaTableDescription("delta", "id", "n", "d", "/l", now, now, Array.empty, Array.empty, 0, 0, 0.0, scala.collection.mutable.Map.empty, 1, 1)
      a shouldBe b
    }
  }
}
