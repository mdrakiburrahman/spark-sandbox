package me.rakirahman.reddit

import me.rakirahman.config.EnvironmentConfiguration

import org.scalatest.BeforeAndAfterEach
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}
import java.util.Base64

class RedditTokenLoaderTest extends AnyFunSpec with Matchers with BeforeAndAfterEach {

  private var tempDir: Path = _

  override def beforeEach(): Unit = {
    tempDir = Files.createTempDirectory("reddit-token-loader-test-")
  }

  override def afterEach(): Unit = {
    if (tempDir != null) {
      Files
        .walk(tempDir)
        .sorted(java.util.Comparator.reverseOrder())
        .forEach(p => Files.deleteIfExists(p))
    }
  }

  private def localEnv(): EnvironmentConfiguration = new EnvironmentConfiguration {
    override val LocalSpark: Boolean = true
    override def config(): java.util.Map[String, Any] = new java.util.HashMap[String, Any]()
  }

  private def writeTokenFile(name: String, body: String): String = {
    val path = tempDir.resolve(name)
    Files.write(path, body.getBytes(StandardCharsets.UTF_8))
    path.toString
  }

  private def envelopeJson(expiresAtEpochSeconds: Long): String = {
    val inner = s"""{"cookies":{"edgebucket":"abc"},"user_agent":"ua","bearer":"b","expires_at":$expiresAtEpochSeconds}"""
    val token = Base64.getEncoder.encodeToString(inner.getBytes(StandardCharsets.UTF_8))
    s"""{"access_token":"$token"}"""
  }

  describe("RedditTokenLoader") {

    it("should return MissingFile when the path does not exist") {
      val loader = RedditTokenLoader(localEnv())
      val result = loader.load(tempDir.resolve("does-not-exist.token").toString)

      result match {
        case Left(RedditTokenLoadFailure.MissingFile(msg)) =>
          msg should include("not found")
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Malformed when the file content cannot be parsed") {
      val path = writeTokenFile("bad.token", "this-is-not-json")
      val result = RedditTokenLoader(localEnv()).load(path)

      result match {
        case Left(RedditTokenLoadFailure.Malformed(_)) => succeed
        case other                                     => fail(s"unexpected: $other")
      }
    }

    it("should return the envelope when the file is valid and the token is fresh") {
      val path = writeTokenFile("fresh.token", envelopeJson(expiresAtEpochSeconds = 10000L))
      val result = RedditTokenLoader(localEnv()).load(path, nowEpochSeconds = 5000L)

      result match {
        case Right(env) =>
          env.cookies("edgebucket") shouldBe "abc"
          env.userAgent shouldBe "ua"
          env.bearer shouldBe "b"
          env.expiresAtEpochSeconds shouldBe 10000L
        case other => fail(s"unexpected: $other")
      }
    }

    it("should return Expired when the envelope's expiry has passed") {
      val path = writeTokenFile("expired.token", envelopeJson(expiresAtEpochSeconds = 100L))
      val result = RedditTokenLoader(localEnv()).load(path, nowEpochSeconds = 999L)

      result match {
        case Left(RedditTokenLoadFailure.Expired(msg, envelope)) =>
          msg should include("expired")
          envelope.expiresAtEpochSeconds shouldBe 100L
        case other => fail(s"unexpected: $other")
      }
    }

    it("should trim whitespace from the on-disk payload before parsing") {
      val path = writeTokenFile("padded.token", s"\n\t  ${envelopeJson(expiresAtEpochSeconds = 10000L)}  \n")
      val result = RedditTokenLoader(localEnv()).load(path, nowEpochSeconds = 5000L)
      result.isRight shouldBe true
    }
  }

  describe("RedditTokenLoader companion") {

    it("should construct a loader from an EnvironmentConfiguration") {
      RedditTokenLoader(localEnv()) shouldBe a[RedditTokenLoader]
    }
  }
}
