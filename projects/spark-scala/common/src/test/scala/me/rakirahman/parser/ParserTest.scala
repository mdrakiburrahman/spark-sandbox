package me.rakirahman.parser

import me.rakirahman.parser.json.JsonParser
import me.rakirahman.parser.yaml.YamlParser
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import scala.beans.BeanProperty
import scala.collection.JavaConverters._

/** This class contains unit tests for [[Parser]] trait.
  */
class ParserTest extends AnyFunSpec with Matchers {

  describe("YamlParser") {

    val payloads = List(
      (
        "GoodSensitiveGoodForeign-1-false-false-false",
        """|someDriver:                                                # <----- Good YAML
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |""".stripMargin('|'),
        false,
        false,
        false
      ),
      (
        "BadSensitiveGoodForeign-1-false-false-true",
        """|SomeDriver:                                                # <----- Capitalized this
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |""".stripMargin('|'),
        false,
        false,
        true
      ),
      (
        "BadSensitiveGoodForeign-1-true-false-false",
        """|SomeDriver:                                                # <----- Capitalized this
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |""".stripMargin('|'),
        true,
        false,
        false
      ),
      (
        "BadSensitiveGoodForeign-2-false,false,true",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    SupportedLanguages: ["Scala", "Java", "Python"]         # <----- Capitalized this
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |""".stripMargin('|'),
        false,
        false,
        true
      ),
      (
        "BadSensitiveGoodForeign-2-true,false,false",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    SupportedLanguages: ["Scala", "Java", "Python"]         # <----- Capitalized this
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |""".stripMargin('|'),
        true,
        false,
        false
      ),
      (
        "GoodSensitiveBadForeign-1-false,false,true",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |""".stripMargin('|'),
        false,
        false,
        true
      ),
      (
        "GoodSensitiveBadForeign-1-false,false,false",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |""".stripMargin('|'),
        false,
        true,
        false
      ),
      (
        "BadSensitiveBadForeign-1-false,false,true",
        """|SomeDriver:                                                 # <----- Capitalized this
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |""".stripMargin('|'),
        false,
        false,
        true
      ),
      (
        "BadSensitiveBadForeign-1-true,true,false",
        """|SomeDriver:                                                 # <----- Capitalized this
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    supportedLanguages: ["Scala", "Java", "Python"]
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |""".stripMargin('|'),
        true,
        true,
        false
      ),
      (
        "BadSensitiveBadForeign-2-false,false,true",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    SupportedLanguages: ["Scala", "Java", "Python"]         # <----- Capitalized this
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |""".stripMargin('|'),
        false,
        false,
        true
      ),
      (
        "BadSensitiveBadForeign-2-true,true,false",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    SupportedLanguages: ["Scala", "Java", "Python"]         # <----- Capitalized this
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |""".stripMargin('|'),
        true,
        true,
        false
      ),
      (
        "BadSensitiveBadForeign-3-false,false,true",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    SupportedLanguages: ["Scala", "Java", "Python"]         # <----- Capitalized this
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |otherDriver:                                                # <----- Undefined Block of properties
           |  notAnEngine:
           |    custom: blah
           |""".stripMargin('|'),
        false,
        false,
        true
      ),
      (
        "BadSensitiveBadForeign-3-true,true,false",
        """|someDriver:
           |  engine:
           |    default: foo
           |    versions: [1.0, 1.1, 2.0]
           |    SupportedLanguages: ["Scala", "Java", "Python"]         # <----- Capitalized this
           |    maxThreads: 8
           |    isEnabled: true
           |  graphics:
           |    fontHeight: 48
           |    resolutions: [1920, 1080, 1440]
           |    colorDepths: [24, 32]
           |    isFullScreen: false
           |  foo: bar                                                  # <----- Undefined Property
           |otherDriver:                                                # <----- Undefined Block of properties
           |  notAnEngine:
           |    custom: blah
           |""".stripMargin('|'),
        true,
        true,
        false
      )
    )

    payloads.foreach { case (formatName, payload, allowSensitive, allowForeign, shouldThrow) =>
      it(s"can parse: ${formatName} with throw: ${shouldThrow}") {

        // Exercise
        //
        var result: SomeDriverSettings = null
        var threw = false
        try {
          result = YamlParser.loadClass(
            payload,
            classOf[SomeDriverSettings],
            allowSensitive,
            allowForeign
          )
        } catch {
          case e: Exception =>
            if (!shouldThrow) throw e
            threw = true
        }

        // Verify
        //
        shouldThrow shouldBe threw

        if (!shouldThrow) {
          result.SomeDriver.Engine.Default shouldBe "foo"
          result.SomeDriver.Engine.Versions shouldBe Array(1.0, 1.1, 2.0)
          result.SomeDriver.Engine.SupportedLanguages shouldBe Array("Scala", "Java", "Python")
          result.SomeDriver.Engine.MaxThreads shouldBe 8
          result.SomeDriver.Engine.IsEnabled shouldBe true
          result.SomeDriver.Graphics.FontHeight shouldBe 48
          result.SomeDriver.Graphics.Resolutions shouldBe Array(1920, 1080, 1440)
          result.SomeDriver.Graphics.ColorDepths shouldBe Array(24, 32)
          result.SomeDriver.Graphics.IsFullScreen shouldBe false
        }
      }
    }

    it("can parse a map") {
      val payload = """|someDriver:
                       |  engine:
                       |    default: foo
                       |    versions: [1.0, 1.1, 2.0]
                       |    supportedLanguages: ["Scala", "Java", "Python"]
                       |    maxThreads: 8
                       |    isEnabled: true
                       |  graphics:
                       |    fontHeight: 48
                       |    resolutions: [1920, 1080, 1440]
                       |    colorDepths: [24, 32]
                       |    isFullScreen: false
                       |""".stripMargin('|')

      val result = YamlParser.loadMap(payload)
      result.get("someDriver") shouldBe a[java.util.Map[_, _]]
      val someDriver = result.get("someDriver").asInstanceOf[java.util.Map[String, Any]]
      someDriver.get("engine") shouldBe a[java.util.Map[_, _]]
      val engine = someDriver.get("engine").asInstanceOf[java.util.Map[String, Any]]
      engine.get("default") shouldBe "foo"
      engine.get("versions") shouldBe a[java.util.List[_]]
      engine.get("supportedLanguages") shouldBe a[java.util.List[_]]
      engine.get("maxThreads") shouldBe 8
      engine.get("isEnabled") shouldBe true
      engine.get("versions").asInstanceOf[java.util.List[Double]].toArray shouldBe Array(1.0, 1.1, 2.0)
      engine.get("supportedLanguages").asInstanceOf[java.util.List[String]].toArray shouldBe Array("Scala", "Java", "Python")
    }
  }

  describe("JsonParser") {

    val payloads = List(
      (
        "GoodSensitiveGoodForeign-1-false-true-false",
        """|{
           |  "driver": {
           |    "engine": {
           |      "default": "foo",
           |      "versions": [1.0, 1.1, 2.0],
           |      "supportedLanguages": ["Scala", "Java", "Python"],
           |      "maxThreads": 8,
           |      "isEnabled": true
           |    },
           |    "graphics": {
           |      "fontHeight": 48,
           |      "resolutions": [1920, 1080, 1440],
           |      "colorDepths": [24, 32],
           |      "isFullScreen": false
           |    }
           |  }
           |}""".stripMargin,
        false,
        true,
        false
      ),
      (
        "BadSensitiveGoodForeign-1-true-true-true",
        """|{
           |  "Driver": {
           |    "engine": {
           |      "default": "foo",
           |      "versions": [1.0, 1.1, 2.0],
           |      "supportedLanguages": ["Scala", "Java", "Python"],
           |      "maxThreads": 8,
           |      "isEnabled": true
           |    },
           |    "graphics": {
           |      "fontHeight": 48,
           |      "resolutions": [1920, 1080, 1440],
           |      "colorDepths": [24, 32],
           |      "isFullScreen": false
           |    }
           |  }
           |}""".stripMargin,
        true,
        true,
        true
      ),
      (
        "GoodSensitiveBadForeign-1-false-true-false",
        """|{
           |  "driver": {
           |    "engine": {
           |      "default": "foo",
           |      "versions": [1.0, 1.1, 2.0],
           |      "supportedLanguages": ["Scala", "Java", "Python"],
           |      "maxThreads": 8,
           |      "isEnabled": true
           |    },
           |    "notAnEngine": "bar",
           |    "graphics": {
           |      "fontHeight": 48,
           |      "resolutions": [1920, 1080, 1440],
           |      "colorDepths": [24, 32],
           |      "isFullScreen": false
           |    }
           |  }
           |}""".stripMargin,
        false,
        true,
        false
      ),
      (
        "GoodSensitiveBadForeign-1-false-false-true",
        """|{
           |  "driver": {
           |    "engine": {
           |      "default": "foo",
           |      "versions": [1.0, 1.1, 2.0],
           |      "supportedLanguages": ["Scala", "Java", "Python"],
           |      "maxThreads": 8,
           |      "isEnabled": true
           |    },
           |    "notAnEngine": "bar",
           |    "graphics": {
           |      "fontHeight": 48,
           |      "resolutions": [1920, 1080, 1440],
           |      "colorDepths": [24, 32],
           |      "isFullScreen": false
           |    }
           |  }
           |}""".stripMargin,
        false,
        false,
        true
      )
    )

    payloads.foreach { case (formatName, payload, allowSensitive, allowForeign, shouldThrow) =>
      it(s"can parse: ${formatName} with throw: ${shouldThrow}") {

        // Exercise
        //
        var result: CaseDriverSettings = null
        var threw = false
        try {
          result = JsonParser.loadClass(
            payload,
            classOf[CaseDriverSettings],
            allowSensitive,
            allowForeign
          )
        } catch {
          case e: Exception =>
            if (!shouldThrow) throw e
            threw = true
        }

        // Verify
        //
        shouldThrow shouldBe threw

        if (!shouldThrow) {
          result.driver.engine.default shouldBe "foo"
          result.driver.engine.versions shouldBe Array(1.0, 1.1, 2.0)
          result.driver.engine.supportedLanguages shouldBe Array("Scala", "Java", "Python")
          result.driver.engine.maxThreads shouldBe 8
          result.driver.engine.isEnabled shouldBe true
          result.driver.graphics.fontHeight shouldBe 48
          result.driver.graphics.resolutions shouldBe Array(1920, 1080, 1440)
          result.driver.graphics.colorDepths shouldBe Array(24, 32)
          result.driver.graphics.isFullScreen shouldBe false
        }
      }
    }

    it("can parse a map") {
      val payload = """|{
                       |  "driver": {
                       |    "engine": {
                       |      "default": "foo",
                       |      "versions": [1.0, 1.1, 2.0],
                       |      "supportedLanguages": ["Scala", "Java", "Python"],
                       |      "maxThreads": 8,
                       |      "isEnabled": true
                       |    },
                       |    "graphics": {
                       |      "fontHeight": 48,
                       |      "resolutions": [1920, 1080, 1440],
                       |      "colorDepths": [24, 32],
                       |      "isFullScreen": false
                       |    }
                       |  }
                       |}""".stripMargin

      val result = JsonParser.loadMap(payload).asScala
      val driver = result("driver").asInstanceOf[scala.collection.Map[String, Any]]
      val engine = driver("engine").asInstanceOf[scala.collection.Map[String, Any]]
      val graphics = driver("graphics").asInstanceOf[scala.collection.Map[String, Any]]

      engine("default") shouldBe "foo"
      engine("versions").asInstanceOf[scala.collection.Seq[Double]].toArray shouldBe Array(1.0, 1.1, 2.0)
      engine("supportedLanguages").asInstanceOf[scala.collection.Seq[String]].toArray shouldBe Array("Scala", "Java", "Python")
      engine("maxThreads") shouldBe 8
      engine("isEnabled") shouldBe true

      graphics("fontHeight") shouldBe 48
      graphics("resolutions").asInstanceOf[scala.collection.Seq[scala.math.BigInt]].toArray shouldBe Array(1920, 1080, 1440)
      graphics("colorDepths").asInstanceOf[scala.collection.Seq[scala.math.BigInt]].toArray shouldBe Array(24, 32)
      graphics("isFullScreen") shouldBe false
    }
  }
}
// @formatter:on

/** The YAML expects a Java Bean property annotated class.
  */
class EngineProperties() {
  @BeanProperty var Default: String = null
  @BeanProperty var Versions: Array[Double] = Array()
  @BeanProperty var SupportedLanguages: Array[String] = Array()
  @BeanProperty var MaxThreads: Int = Int.MinValue
  @BeanProperty var IsEnabled: Boolean = false
}

class GraphicsProperties() {
  @BeanProperty var FontHeight: Int = Int.MinValue
  @BeanProperty var Resolutions: Array[Int] = Array()
  @BeanProperty var ColorDepths: Array[Int] = Array()
  @BeanProperty var IsFullScreen: Boolean = false
}

class SomeDriver() {
  @BeanProperty var Engine = new EngineProperties
  @BeanProperty var Graphics = new GraphicsProperties
}

class SomeDriverSettings {
  @BeanProperty var SomeDriver = new SomeDriver
}

/** The JSON expects a regular Scala case class.
  */
case class CaseEngineProperties(
    default: String = null,
    versions: Array[Double] = Array(),
    supportedLanguages: Array[String] = Array(),
    maxThreads: Int = Int.MinValue,
    isEnabled: Boolean = false
)

case class CaseGraphicsProperties(
    fontHeight: Int = Int.MinValue,
    resolutions: Array[Int] = Array(),
    colorDepths: Array[Int] = Array(),
    isFullScreen: Boolean = false
)

case class CaseDriver(
    engine: CaseEngineProperties = CaseEngineProperties(),
    graphics: CaseGraphicsProperties = CaseGraphicsProperties()
)

case class CaseDriverSettings(
    driver: CaseDriver = CaseDriver()
)
