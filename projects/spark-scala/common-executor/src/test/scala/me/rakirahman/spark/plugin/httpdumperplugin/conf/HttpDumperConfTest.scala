package me.rakirahman.spark.plugin.httpdumperplugin.conf

import org.apache.spark.SparkConf
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class HttpDumperConfTest extends AnyFunSpec with Matchers {

  describe("StringHttpDumperProperty") {

    it("should return default when key not in config") {
      val prop = StringHttpDumperProperty("test.key", "default_val")
      val conf = new SparkConf(false)
      prop.get(conf) shouldBe "default_val"
    }

    it("should return config value when key is set") {
      val prop = StringHttpDumperProperty("test.key", "default_val")
      val conf = new SparkConf(false).set("test.key", "custom_val")
      prop.get(conf) shouldBe "custom_val"
    }

    it("should check alternative keys") {
      val prop = StringHttpDumperProperty("test.key", "default_val", alternativeKeys = Seq("alt.key"))
      val conf = new SparkConf(false).set("alt.key", "alt_val")
      prop.get(conf) shouldBe "alt_val"
    }
  }

  describe("IntHttpDumperProperty") {

    it("should return default when key not in config") {
      val prop = IntHttpDumperProperty("test.int.key", 42)
      val conf = new SparkConf(false)
      prop.get(conf) shouldBe 42
    }

    it("should return config value when key is set") {
      val prop = IntHttpDumperProperty("test.int.key", 42)
      val conf = new SparkConf(false).set("test.int.key", "99")
      prop.get(conf) shouldBe 99
    }

    it("should enforce minimum value") {
      val prop = IntHttpDumperProperty("test.int.key", 42, min = Some(100))
      val conf = new SparkConf(false).set("test.int.key", "50")
      prop.get(conf) shouldBe 100
    }

    it("should enforce maximum value") {
      val prop = IntHttpDumperProperty("test.int.key", 42, max = Some(100))
      val conf = new SparkConf(false).set("test.int.key", "200")
      prop.get(conf) shouldBe 100
    }

    it("should return default on parse error") {
      val prop = IntHttpDumperProperty("test.int.key", 42)
      val conf = new SparkConf(false).set("test.int.key", "not_a_number")
      prop.get(conf) shouldBe 42
    }

    it("should check alternative keys") {
      val prop = IntHttpDumperProperty("test.int.key", 42, alternativeKeys = Seq("alt.int.key"))
      val conf = new SparkConf(false).set("alt.int.key", "77")
      prop.get(conf) shouldBe 77
    }
  }

  describe("HttpDumperConf") {

    it("should create with default values") {
      val conf = new SparkConf(false)
      val dumperConf = HttpDumperConf(conf)
      dumperConf.location shouldBe "/tmp/openlineage"
      dumperConf.executorPort shouldBe 9003
    }

    it("should create with custom values") {
      val conf = new SparkConf(false)
        .set("spark.plugin.conf.json.location", "/custom/path")
        .set("spark.plugin.conf.executor.port", "8080")
      val dumperConf = HttpDumperConf(conf)
      dumperConf.location shouldBe "/custom/path"
      dumperConf.executorPort shouldBe 8080
    }

    it("should enforce port bounds") {
      val conf = new SparkConf(false)
        .set("spark.plugin.conf.executor.port", "100")
      val dumperConf = HttpDumperConf(conf)
      dumperConf.executorPort shouldBe 1024
    }
  }

  describe("HttpDumperConf case class") {

    it("should support equality") {
      val a = HttpDumperConf("/tmp/openlineage", 9003)
      val b = HttpDumperConf("/tmp/openlineage", 9003)
      a shouldBe b
    }
  }
}
