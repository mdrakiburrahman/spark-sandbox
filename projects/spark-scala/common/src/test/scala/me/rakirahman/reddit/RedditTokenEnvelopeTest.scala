package me.rakirahman.reddit

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.nio.charset.StandardCharsets
import java.util.Base64

class RedditTokenEnvelopeTest extends AnyFunSpec with Matchers {

  private def base64(json: String): String =
    Base64.getEncoder.encodeToString(json.getBytes(StandardCharsets.UTF_8))

  private def envelope(json: String): String =
    s"""{"access_token":"${base64(json)}"}"""

  describe("RedditTokenEnvelope instance helpers") {

    val sample = RedditTokenEnvelope(
      cookies = Map("edgebucket" -> "abc", "csrf_token" -> "xyz"),
      userAgent = "test-agent/1.0",
      bearer = "bear",
      expiresAtEpochSeconds = 1000000L
    )

    it("should render cookies into a Cookie header in insertion order") {
      sample.cookieHeader shouldBe "edgebucket=abc; csrf_token=xyz"
    }

    it("should compute secondsRemaining against the supplied clock") {
      sample.secondsRemaining(500000L) shouldBe 500000L
      sample.secondsRemaining(1000100L) shouldBe -100L
    }

    it("should treat expiresAtEpochSeconds <= 0 as unknown lifetime") {
      val unknown = sample.copy(expiresAtEpochSeconds = 0L)
      unknown.secondsRemaining(123456L) shouldBe 0L
      unknown.isExpired(Long.MaxValue) shouldBe false

      val negative = sample.copy(expiresAtEpochSeconds = -1L)
      negative.secondsRemaining(0L) shouldBe 0L
      negative.isExpired(0L) shouldBe false
    }

    it("should detect expired vs still-valid envelopes against the supplied clock") {
      sample.isExpired(999999L) shouldBe false
      sample.isExpired(1000000L) shouldBe true
      sample.isExpired(1000001L) shouldBe true
    }
  }

  describe("RedditTokenLoadFailure sealed hierarchy") {

    it("should expose .message on every variant") {
      RedditTokenLoadFailure.MissingFile("not found").message shouldBe "not found"
      RedditTokenLoadFailure.Malformed("bad").message shouldBe "bad"
      val env = RedditTokenEnvelope(Map("c" -> "1"), "ua", "b", 1L)
      val expired = RedditTokenLoadFailure.Expired("old", env)
      expired.message shouldBe "old"
      expired.envelope shouldBe env
    }
  }

  describe("RedditTokenEnvelope.parse") {

    it("should return Malformed when outer text is not JSON") {
      RedditTokenEnvelope.parse("not-json") match {
        case Left(RedditTokenLoadFailure.Malformed(msg)) =>
          msg should include("not valid JSON")
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when outer JSON is missing access_token") {
      RedditTokenEnvelope.parse("""{"foo":"bar"}""") match {
        case Left(RedditTokenLoadFailure.Malformed(msg)) =>
          msg should include("no `access_token`")
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when access_token is empty") {
      RedditTokenEnvelope.parse("""{"access_token":""}""") match {
        case Left(RedditTokenLoadFailure.Malformed(_)) => succeed
        case other                                     => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when access_token is not a string") {
      RedditTokenEnvelope.parse("""{"access_token":42}""") match {
        case Left(RedditTokenLoadFailure.Malformed(_)) => succeed
        case other                                     => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when access_token is not base64") {
      val raw = """{"access_token":"!!!not-base64!!!"}"""
      RedditTokenEnvelope.parse(raw) match {
        case Left(RedditTokenLoadFailure.Malformed(msg)) =>
          msg should include("not base64")
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when the decoded inner payload is not JSON") {
      val raw = s"""{"access_token":"${base64("garbage-not-json")}"}"""
      RedditTokenEnvelope.parse(raw) match {
        case Left(RedditTokenLoadFailure.Malformed(msg)) =>
          msg should include("not JSON")
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when the inner payload is missing cookies") {
      val raw = envelope("""{"user_agent":"ua","expires_at":1}""")
      RedditTokenEnvelope.parse(raw) match {
        case Left(RedditTokenLoadFailure.Malformed(msg)) =>
          msg should include("missing")
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when the inner payload is missing user_agent") {
      val raw = envelope("""{"cookies":{"c":"1"},"expires_at":1}""")
      RedditTokenEnvelope.parse(raw) match {
        case Left(RedditTokenLoadFailure.Malformed(_)) => succeed
        case other                                     => fail(s"unexpected: $other")
      }
    }

    it("should parse a fully populated envelope with numeric expires_at") {
      val raw = envelope("""{"cookies":{"a":"1","b":"2"},"user_agent":"ua","bearer":"bt","expires_at":1234567}""")
      val parsed = RedditTokenEnvelope.parse(raw)
      parsed match {
        case Right(env) =>
          env.cookies shouldBe Map("a" -> "1", "b" -> "2")
          env.userAgent shouldBe "ua"
          env.bearer shouldBe "bt"
          env.expiresAtEpochSeconds shouldBe 1234567L
        case other => fail(s"unexpected: $other")
      }
    }

    it("should parse expires_at supplied as a numeric string") {
      val raw = envelope("""{"cookies":{"a":"1"},"user_agent":"ua","expires_at":"5000"}""")
      RedditTokenEnvelope.parse(raw).right.get.expiresAtEpochSeconds shouldBe 5000L
    }

    it("should default expires_at to 0 when absent or non-coercible") {
      val rawAbsent = envelope("""{"cookies":{"a":"1"},"user_agent":"ua"}""")
      RedditTokenEnvelope.parse(rawAbsent).right.get.expiresAtEpochSeconds shouldBe 0L

      val rawBoolean = envelope("""{"cookies":{"a":"1"},"user_agent":"ua","expires_at":true}""")
      RedditTokenEnvelope.parse(rawBoolean).right.get.expiresAtEpochSeconds shouldBe 0L

      val rawJunkString = envelope("""{"cookies":{"a":"1"},"user_agent":"ua","expires_at":"not-a-number"}""")
      RedditTokenEnvelope.parse(rawJunkString).right.get.expiresAtEpochSeconds shouldBe 0L
    }

    it("should default bearer to empty when absent") {
      val raw = envelope("""{"cookies":{"a":"1"},"user_agent":"ua"}""")
      RedditTokenEnvelope.parse(raw).right.get.bearer shouldBe ""
    }

    it("should coerce non-string cookie values to strings") {
      val raw = envelope("""{"cookies":{"a":1,"b":true},"user_agent":"ua"}""")
      val parsed = RedditTokenEnvelope.parse(raw).right.get
      parsed.cookies("a") shouldBe "1"
      parsed.cookies("b") shouldBe "true"
    }

    it("should reject non-map cookies field as Malformed") {
      val raw = envelope("""{"cookies":"not-a-map","user_agent":"ua"}""")
      RedditTokenEnvelope.parse(raw) match {
        case Left(RedditTokenLoadFailure.Malformed(_)) => succeed
        case other                                     => fail(s"unexpected: $other")
      }
    }
  }
}
