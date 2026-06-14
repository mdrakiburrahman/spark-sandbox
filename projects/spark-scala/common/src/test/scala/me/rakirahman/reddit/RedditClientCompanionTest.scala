package me.rakirahman.reddit

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class RedditClientCompanionTest extends AnyFunSpec with Matchers {

  describe("RedditClient default constants") {

    it("should expose Reddit's documented caps and the firewall-allowed base URL") {
      RedditClient.ListingHardCapDefault shouldBe 1000
      RedditClient.ListingPageSizeDefault shouldBe 100
      RedditClient.MoreChildrenBatchDefault shouldBe 100
      RedditClient.CommentsLimitDefault shouldBe 500
      RedditClient.CommentsDepthDefault shouldBe 10
      RedditClient.CommentsSortDefault shouldBe "top"
      RedditClient.BaseSleepSecondsDefault shouldBe 1.0
      RedditClient.JitterMaxSecondsDefault shouldBe 0.2
      RedditClient.RequestTimeoutSecondsDefault shouldBe 30
      RedditClient.RetryMaxAttemptsDefault shouldBe 8
      RedditClient.RetryWaitMinSecondsDefault shouldBe 2.0
      RedditClient.RetryWaitMaxSecondsDefault shouldBe 60.0
      RedditClient.RetryWaitMultiplierDefault shouldBe 2.0
      RedditClient.MaxRecursionDepthDefault shouldBe 50
      RedditClient.BaseUrlDefault shouldBe "https://oauth.reddit.com"
    }
  }

  describe("RedditClient.asMap / asMapSeq coercion helpers") {

    it("should round-trip a Map[String, Any] unchanged") {
      RedditClient.asMap(Map("a" -> 1, "b" -> "x")) shouldBe Map[String, Any]("a" -> 1, "b" -> "x")
    }

    it("should return an empty map when the value is not a Map") {
      RedditClient.asMap(null) shouldBe empty
      RedditClient.asMap("not-a-map") shouldBe empty
      RedditClient.asMap(42) shouldBe empty
    }

    it("should pick Map elements out of a Seq and discard the rest") {
      val seq = Seq(Map("a" -> 1), "scalar", Map("b" -> 2), 99)
      RedditClient.asMapSeq(seq) should have size 2
    }

    it("should return an empty seq when the value is not a Seq") {
      RedditClient.asMapSeq(null) shouldBe empty
      RedditClient.asMapSeq("nope") shouldBe empty
    }
  }

  describe("RedditClient.getString") {

    val obj = Map[String, Any]("a" -> "x", "n" -> 42, "z" -> null)

    it("should return the toString of present non-null fields") {
      RedditClient.getString(obj, "a") shouldBe "x"
      RedditClient.getString(obj, "n") shouldBe "42"
    }

    it("should return empty for null or missing fields") {
      RedditClient.getString(obj, "z") shouldBe ""
      RedditClient.getString(obj, "missing") shouldBe ""
    }
  }

  describe("RedditClient.getLongOpt / getIntOpt") {

    it("should coerce Number, Double, and numeric strings to Long") {
      val obj = Map[String, Any](
        "i" -> java.lang.Integer.valueOf(7),
        "l" -> 9L,
        "d" -> 3.14d,
        "s_long" -> "42",
        "s_dbl" -> "1.99",
        "z" -> null,
        "bad" -> "not-numeric",
        "boolt" -> true
      )

      RedditClient.getLongOpt(obj, "i") shouldBe Some(7L)
      RedditClient.getLongOpt(obj, "l") shouldBe Some(9L)
      RedditClient.getLongOpt(obj, "d") shouldBe Some(3L)
      RedditClient.getLongOpt(obj, "s_long") shouldBe Some(42L)
      RedditClient.getLongOpt(obj, "s_dbl") shouldBe Some(1L)
      RedditClient.getLongOpt(obj, "z") shouldBe None
      RedditClient.getLongOpt(obj, "missing") shouldBe None
      RedditClient.getLongOpt(obj, "bad") shouldBe None
      RedditClient.getLongOpt(obj, "boolt") shouldBe None
    }

    it("should narrow to Int via getIntOpt") {
      RedditClient.getIntOpt(Map[String, Any]("k" -> 12L), "k") shouldBe Some(12)
      RedditClient.getIntOpt(Map[String, Any]("k" -> null), "k") shouldBe None
    }
  }

  describe("RedditClient.getDoubleOpt") {

    it("should coerce Number and numeric strings to Double") {
      val obj = Map[String, Any]("n" -> 2, "d" -> 1.5d, "s" -> "0.5", "z" -> null, "bad" -> "x", "bool" -> true)

      RedditClient.getDoubleOpt(obj, "n") shouldBe Some(2.0d)
      RedditClient.getDoubleOpt(obj, "d") shouldBe Some(1.5d)
      RedditClient.getDoubleOpt(obj, "s") shouldBe Some(0.5d)
      RedditClient.getDoubleOpt(obj, "z") shouldBe None
      RedditClient.getDoubleOpt(obj, "missing") shouldBe None
      RedditClient.getDoubleOpt(obj, "bad") shouldBe None
      RedditClient.getDoubleOpt(obj, "bool") shouldBe None
    }
  }

  describe("RedditClient.getBoolOpt") {

    it("should coerce Booleans and boolean-strings, rejecting other shapes") {
      val obj = Map[String, Any](
        "b" -> true,
        "s_true" -> "true",
        "s_bad" -> "yes",
        "n" -> 1,
        "z" -> null
      )

      RedditClient.getBoolOpt(obj, "b") shouldBe Some(true)
      RedditClient.getBoolOpt(obj, "s_true") shouldBe Some(true)
      RedditClient.getBoolOpt(obj, "s_bad") shouldBe None
      RedditClient.getBoolOpt(obj, "n") shouldBe None
      RedditClient.getBoolOpt(obj, "z") shouldBe None
      RedditClient.getBoolOpt(obj, "missing") shouldBe None
    }
  }

  describe("RedditClient.getNestedMap / getNestedSeq") {

    it("should descend into Map / Seq children when present") {
      val obj = Map[String, Any]("m" -> Map("inner" -> 1), "s" -> Seq(1, 2, 3))
      RedditClient.getNestedMap(obj, "m") shouldBe Map[String, Any]("inner" -> 1)
      RedditClient.getNestedSeq(obj, "s") shouldBe Seq(1, 2, 3)
    }

    it("should return empty when the field is missing or the wrong shape") {
      val obj = Map[String, Any]("m" -> "not-a-map", "s" -> 42)
      RedditClient.getNestedMap(obj, "m") shouldBe empty
      RedditClient.getNestedMap(obj, "missing") shouldBe empty
      RedditClient.getNestedSeq(obj, "s") shouldBe empty
      RedditClient.getNestedSeq(obj, "missing") shouldBe empty
    }
  }

  describe("RedditClient.toCompactJson") {

    it("should render Maps and Seqs to compact JSON") {
      val obj = Map[String, Any](
        "a" -> 1,
        "b" -> "x",
        "c" -> Seq(1, 2, 3),
        "d" -> Map("e" -> true, "f" -> null)
      )
      val json = RedditClient.toCompactJson(obj)
      json should include(""""a":1""")
      json should include(""""b":"x"""")
      json should include(""""c":[1,2,3]""")
      json should include(""""e":true""")
      json should include(""""f":null""")
    }

    it("should render Java collections, numeric variants, and fallback shapes") {
      import scala.collection.JavaConverters._

      val javaList: java.util.List[Any] = Seq[Any](1, "x").asJava
      val payload = Map[String, Any](
        "javaList" -> javaList,
        "set" -> Set(7),
        "long" -> 7L,
        "bigInt" -> BigInt(42),
        "javaBigInt" -> new java.math.BigInteger("12345"),
        "double" -> 2.5d,
        "float" -> 1.5f,
        "bigDec" -> BigDecimal("0.25"),
        "javaBigDec" -> new java.math.BigDecimal("0.5"),
        "fallback" -> new Object {
          override def toString: String = "stringified"
        }
      )
      val json = RedditClient.toCompactJson(payload)
      json should include(""""javaList":[1,"x"]""")
      json should include(""""set":[7]""")
      json should include(""""long":7""")
      json should include(""""bigInt":42""")
      json should include(""""javaBigInt":12345""")
      json should include(""""double":2.5""")
      json should include(""""float":1.5""")
      json should include(""""bigDec":0.25""")
      json should include(""""javaBigDec":0.5""")
      json should include(""""fallback":"stringified"""")
    }
  }

  describe("Reddit exception hierarchy") {

    it("should expose typed http/cookie failure shapes that extend RedditClientException") {
      val http = new RedditHttpException("boom", new RuntimeException("cause"))
      val cookie = new RedditCookieExpiredException("expired")

      http shouldBe a[RedditClientException]
      http.getMessage shouldBe "boom"
      http.getCause shouldBe a[RuntimeException]

      cookie shouldBe a[RedditClientException]
      cookie.getMessage shouldBe "expired"
    }

    it("should allow construction without a cause") {
      val http = new RedditHttpException("no-cause")
      http.getCause shouldBe null
    }
  }
}
