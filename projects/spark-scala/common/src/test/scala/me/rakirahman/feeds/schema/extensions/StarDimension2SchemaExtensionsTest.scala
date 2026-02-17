package me.rakirahman.feeds.schema.extensions

import me.rakirahman.feeds.schema._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class StarDimension2SchemaExtensionsTest extends AnyFunSpec with Matchers {
  import StarDimension2SchemaExtensions._

  // @formatter:off
  object TestSchema extends StarDimension2Schema {
    override val tableName          = "test_table"
    override val primaryKey         = ("pk_id", "STRING")
    override val naturalKey         = ("natural_id", "STRING")
    override val dimensionColumns   = Array(("city", "STRING"), ("country", "STRING"))
    override val partitionColumns   = Array(("year_month", "STRING"))
    override val primaryKeyHashVersionValue = 1.0
  }
  // @formatter:on

  describe("StarDimension2SchemaExtensions") {

    it("should generate primary key hash") {
      val result = TestSchema.toPrimaryKeyHash()
      result should include("SHA2")
      result should include("natural_id")
      result should include("city")
      result should include("country")
      result should include("pk_id_hash_version")
    }

    it("should generate primary key hash with custom columns") {
      val result = TestSchema.toPrimaryKeyHash("nk", Array("dim1", "dim2"), "hash_v")
      result should include("SHA2")
      result should include("nk")
      result should include("dim1")
      result should include("dim2")
      result should include("hash_v")
    }

    it("should generate match statement") {
      val result = TestSchema.toMatchStatement()
      result should include("updates.pk_id_hash_version <> destination.pk_id_hash_version")
      result should include("updates.city <> destination.city")
      result should include("updates.country <> destination.country")
      result should include(" OR ")
    }

    it("should generate upsertable columns") {
      val result = TestSchema.toUpsertableColumns()
      result should contain("pk_id")
      result should contain("natural_id")
      result should contain("pk_id_hash_version")
      result should contain("city")
      result should contain("country")
      result should contain("gold_ingest_time")
      result should contain("year_month")
    }

    it("should generate full column upsert map") {
      val result = TestSchema.toFullColumnUpsertMap()
      result("pk_id") shouldBe "updates.pk_id"
      result("natural_id") shouldBe "updates.natural_id"
      result("pk_id_hash_version") shouldBe "updates.pk_id_hash_version"
      result("city") shouldBe "updates.city"
      result("country") shouldBe "updates.country"
      result("is_row_effective") shouldBe "true"
      result("row_effective_start") shouldBe "updates.row_effective_start"
      result("row_effective_end") should include("9999-12-31")
    }
  }

  describe("StarDimension2Schema") {

    it("should have correct SCD columns") {
      TestSchema.scdColumns should have length 3
      TestSchema.scdColumns.map(_._1) should contain allOf ("is_row_effective", "row_effective_start", "row_effective_end")
    }

    it("should compute schema with all columns deduped") {
      val schema = TestSchema.schema
      schema.map(_._1) should contain("pk_id")
      schema.map(_._1) should contain("natural_id")
      schema.map(_._1) should contain("pk_id_hash_version")
      schema.map(_._1) should contain("city")
      schema.map(_._1) should contain("country")
      schema.map(_._1) should contain("is_row_effective")
      schema.map(_._1) should contain("row_effective_start")
      schema.map(_._1) should contain("row_effective_end")
      schema.map(_._1) should contain("gold_ingest_time")
      schema.map(_._1) should contain("year_month")
    }

    it("should have correct primary key hash version column") {
      TestSchema.primaryKeyHashVersionColumn shouldBe ("pk_id_hash_version", "DOUBLE")
    }

    it("should have correct star schema table type") {
      TestSchema.starSchemaTableType shouldBe StarSchemaTableTypes.Dimension
    }
  }

  describe("GoldIngestionMetadataSchema") {

    it("should have correct metadata columns") {
      TestSchema.metadataColumns shouldBe Array(("gold_ingest_time", "TIMESTAMP"))
    }
  }
}
