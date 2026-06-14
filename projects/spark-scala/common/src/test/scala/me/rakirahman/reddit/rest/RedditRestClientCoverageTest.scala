package me.rakirahman.reddit.rest

import me.rakirahman.reddit._

import com.sun.net.httpserver.{HttpExchange, HttpHandler, HttpServer}

import org.scalatest.BeforeAndAfterEach
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers

import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicInteger

import scala.collection.mutable
import scala.util.Random

class RedditRestClientCoverageTest extends AnyFunSpec with Matchers with BeforeAndAfterEach {

  private var server: HttpServer = _
  private var baseUrl: String = _

  override def beforeEach(): Unit = {
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0)
    baseUrl = s"http://127.0.0.1:${server.getAddress.getPort}"
  }

  override def afterEach(): Unit = {
    server.stop(0)
  }

  private def envelope(): RedditTokenEnvelope = RedditTokenEnvelope(
    cookies = Map("edgebucket" -> "abc", "csrf_token" -> "csrf-xyz"),
    userAgent = "test-agent/1.0",
    bearer = "ignored-bearer",
    expiresAtEpochSeconds = Long.MaxValue / 2L
  )

  private def fastClient(
      envelope: RedditTokenEnvelope,
      retryAttempts: Int = 3,
      listingHardCap: Int = RedditClient.ListingHardCapDefault,
      jitterMaxSeconds: Double = 0.0,
      random: Random = new Random(0)
  ): RedditRestClient =
    new RedditRestClient(
      envelope = envelope,
      baseUrl = baseUrl,
      listingHardCap = listingHardCap,
      requestTimeoutSeconds = 5,
      baseSleepSeconds = 0.0,
      jitterMaxSeconds = jitterMaxSeconds,
      retryMaxAttempts = retryAttempts,
      retryWaitMinSeconds = 0.0,
      retryWaitMaxSeconds = 0.0,
      retryWaitMultiplier = 0.0,
      random = random,
      sleeper = _ => ()
    )

  private def install(path: String, handler: HttpExchange => Unit): Unit = {
    server.createContext(
      path,
      new HttpHandler {
        override def handle(exchange: HttpExchange): Unit = handler(exchange)
      }
    )
    server.start()
  }

  private def writeJson(exchange: HttpExchange, status: Int, body: String): Unit = {
    val bytes = body.getBytes(StandardCharsets.UTF_8)
    exchange.getResponseHeaders.add("Content-Type", "application/json; charset=utf-8")
    exchange.sendResponseHeaders(status, bytes.length.toLong)
    val os = exchange.getResponseBody
    try os.write(bytes)
    finally os.close()
  }

  private def writeRaw(exchange: HttpExchange, status: Int, body: String, contentType: String): Unit = {
    val bytes = body.getBytes(StandardCharsets.UTF_8)
    exchange.getResponseHeaders.add("Content-Type", contentType)
    exchange.sendResponseHeaders(status, bytes.length.toLong)
    val os = exchange.getResponseBody
    try os.write(bytes)
    finally os.close()
  }

  describe("paginateListing branch coverage") {

    it("should clamp the requested limit to listingHardCap when it exceeds the cap") {
      val capturedLimits = mutable.ArrayBuffer.empty[String]
      install(
        "/r/x/top.json",
        { ex =>
          val q = Option(ex.getRequestURI.getRawQuery).getOrElse("")
          q.split("&").find(_.startsWith("limit=")).foreach(capturedLimits += _)
          writeJson(ex, 200, """{"data":{"after":null,"children":[]}}""")
        }
      )
      val client = fastClient(envelope(), listingHardCap = 2)
      val posts = client.paginateListing("x", RedditListingTypes.Top, Some(RedditTimeWindows.Day), 50).toList
      posts mustBe empty
      capturedLimits.toSeq mustBe Seq("limit=2")
    }

    it("should throw NoSuchElementException when next() is called after exhaustion") {
      install("/r/x/new.json", { ex => writeJson(ex, 200, """{"data":{"after":null,"children":[]}}""") })
      val it = fastClient(envelope()).paginateListing("x", RedditListingTypes.New, None, 5)
      it.hasNext mustBe false
      a[NoSuchElementException] must be thrownBy it.next()
    }

    it("should silently skip non-Map children and non-t3 kinds in a listing page") {
      install(
        "/r/x/new.json",
        { ex =>
          writeJson(
            ex,
            200,
            """{"data":{"after":null,"children":[
              "stringy-not-a-map",
              {"kind":"t1","data":{"id":"c1"}},
              {"kind":"t3","data":{"id":"p1","name":"t3_p1"}},
              42,
              {"kind":"t5","data":{"id":"s1"}}
            ]}}"""
          )
        }
      )
      val posts = fastClient(envelope())
        .paginateListing("x", RedditListingTypes.New, None, 10)
        .toList
      posts.map(_("id")) mustBe Seq("p1")
    }
  }

  describe("fetchComments branch coverage") {

    it("should throw RedditHttpException when the /comments response is not a top-level array") {
      install(
        "/comments/abc.json",
        { ex =>
          writeJson(ex, 200, """{"this":"is-an-object-not-an-array"}""")
        }
      )
      a[RedditHttpException] must be thrownBy fastClient(envelope()).fetchComments("abc")
    }

    it("should throw RedditHttpException when the /comments response is a single-element array (length < 2)") {
      install(
        "/comments/abc.json",
        { ex =>
          writeJson(ex, 200, """[{"data":{"children":[]}}]""")
        }
      )
      a[RedditHttpException] must be thrownBy fastClient(envelope()).fetchComments("abc")
    }

    it("should fall back to empty post when the array contains no Map elements (listingMaps.headOption empty)") {
      install(
        "/comments/abc.json",
        { ex =>
          writeJson(ex, 200, """[1, 2]""")
        }
      )
      val (post, comments) = fastClient(envelope()).fetchComments("abc")
      post mustBe empty
      comments mustBe empty
    }

    it("should fall back to empty post when the post listing's children has only non-Map entries") {
      install(
        "/comments/abc.json",
        { ex =>
          writeJson(
            ex,
            200,
            """[
              {"data":{"children":[1, 2, "not-a-map"]}},
              {"data":{"children":[{"kind":"t1","data":{"id":"c1"}}]}}
            ]"""
          )
        }
      )
      val (post, comments) = fastClient(envelope()).fetchComments("abc")
      post mustBe empty
      comments must have size 1
    }

    it("should fall back to empty commentListing when listingMaps.lift(1) is None") {
      install(
        "/comments/abc.json",
        { ex =>
          writeJson(
            ex,
            200,
            """[42, {"data":{"children":[{"kind":"t3","data":{"id":"abc"}}]}}]"""
          )
        }
      )
      val (post, comments) = fastClient(envelope()).fetchComments("abc")
      post("id") mustBe "abc"
      comments mustBe empty
    }
  }

  describe("HTTP error code branch coverage") {

    it("should throw RedditHttpException for 4xx non-401/403/429 responses without retry") {
      val attempts = new AtomicInteger(0)
      install(
        "/r/x/new.json",
        { ex =>
          attempts.incrementAndGet()
          writeRaw(ex, 404, "not found", "text/plain")
        }
      )
      val ex = the[RedditHttpException] thrownBy {
        fastClient(envelope()).paginateListing("x", RedditListingTypes.New, None, 3).toList
      }
      ex.getMessage must include("HTTP 404")
      attempts.get mustBe 1
    }

    it("should retry on network IOException then give up wrapped as RedditHttpException") {
      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = "http://127.0.0.1:1",
        requestTimeoutSeconds = 1,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 0.0,
        retryMaxAttempts = 2,
        retryWaitMinSeconds = 0.0,
        retryWaitMaxSeconds = 0.0,
        retryWaitMultiplier = 0.0,
        sleeper = _ => ()
      )
      val thrown = the[RedditHttpException] thrownBy {
        client.paginateListing("x", RedditListingTypes.New, None, 3).toList
      }
      thrown.getMessage must include("failed after 2 attempts")
    }

    it("should retry on a malformed-JSON 200 response then give up wrapped as RedditHttpException") {
      val attempts = new AtomicInteger(0)
      install(
        "/r/x/new.json",
        { ex =>
          attempts.incrementAndGet()
          writeJson(ex, 200, "{this is : not valid json")
        }
      )
      val thrown = the[RedditHttpException] thrownBy {
        fastClient(envelope(), retryAttempts = 2)
          .paginateListing("x", RedditListingTypes.New, None, 3)
          .toList
      }
      thrown.getMessage must include("failed after 2 attempts")
      attempts.get mustBe 2
    }

    it("should retry on a non-Http connection (ClassCastException escapes issueGet's IOException catch)") {
      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = "file:///nonexistent",
        requestTimeoutSeconds = 1,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 0.0,
        retryMaxAttempts = 2,
        retryWaitMinSeconds = 0.0,
        retryWaitMaxSeconds = 0.0,
        retryWaitMultiplier = 0.0,
        sleeper = _ => ()
      )
      val thrown = the[RedditHttpException] thrownBy {
        client.paginateListing("x", RedditListingTypes.New, None, 3).toList
      }
      thrown.getMessage must include("failed after 2 attempts")
      thrown.getCause mustBe a[ClassCastException]
    }

    it("should sleep between 429 retries when computeWaitMs > 0 (Success(Left) wait > 0 branch)") {
      val sleeps = mutable.ArrayBuffer.empty[Long]
      val attempts = new AtomicInteger(0)
      install(
        "/r/x/new.json",
        { ex =>
          val n = attempts.incrementAndGet()
          if (n == 1) {
            val body = "rate limited".getBytes(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(429, body.length.toLong)
            ex.getResponseBody.write(body); ex.getResponseBody.close()
          } else {
            writeJson(ex, 200, """{"data":{"after":null,"children":[]}}""")
          }
        }
      )
      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = baseUrl,
        requestTimeoutSeconds = 5,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 0.0,
        retryMaxAttempts = 3,
        retryWaitMinSeconds = 0.05,
        retryWaitMaxSeconds = 0.05,
        retryWaitMultiplier = 1.0,
        sleeper = ms => sleeps += ms
      )
      client.paginateListing("x", RedditListingTypes.New, None, 1).toList mustBe empty
      attempts.get mustBe 2
      sleeps.toSeq must contain(50L)
    }
  }

  describe("buildUrl + computeWaitMs + jitter") {

    it("should return the bare base URL when no query params are supplied (buildUrl empty branch)") {
      val client = fastClient(envelope())
      client.buildUrl("https://example.com/x", Map.empty[String, String]) mustBe "https://example.com/x"
    }

    it("should compute exponential-backoff wait clamped to [min, max] (computeWaitMs)") {
      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = baseUrl,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 0.0,
        retryMaxAttempts = 5,
        retryWaitMinSeconds = 2.0,
        retryWaitMaxSeconds = 8.0,
        retryWaitMultiplier = 1.0,
        sleeper = _ => ()
      )
      client.computeWaitMs(1) mustBe 2000L
      client.computeWaitMs(2) mustBe 2000L
      client.computeWaitMs(3) mustBe 4000L
      client.computeWaitMs(4) mustBe 8000L
      client.computeWaitMs(10) mustBe 8000L
    }

    it("should add positive jitter to politeSleep when jitterMaxSeconds > 0") {
      val sleeps = mutable.ArrayBuffer.empty[Long]
      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = baseUrl,
        requestTimeoutSeconds = 5,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 1.0,
        retryMaxAttempts = 1,
        retryWaitMinSeconds = 0.0,
        retryWaitMaxSeconds = 0.0,
        retryWaitMultiplier = 0.0,
        random = new Random(0),
        sleeper = ms => sleeps += ms
      )
      install("/r/x/new.json", { ex => writeJson(ex, 200, """{"data":{"after":null,"children":[]}}""") })

      client.paginateListing("x", RedditListingTypes.New, None, 1).toList mustBe empty
      sleeps.toSeq.length mustBe 1
      sleeps.head must be >= 0L
      sleeps.head must be <= 1000L
    }
  }

  describe("envelope auth-header branch coverage") {

    it("should omit the x-reddit-csrf header when no csrf_token cookie is present") {
      val seen = mutable.ArrayBuffer.empty[Map[String, String]]
      install(
        "/r/x/new.json",
        { ex =>
          import scala.collection.JavaConverters._
          seen += ex.getRequestHeaders.asScala.flatMap { case (k, vs) =>
            vs.asScala.headOption.map(v => k.toLowerCase -> v)
          }.toMap
          writeJson(ex, 200, """{"data":{"after":null,"children":[]}}""")
        }
      )
      val noCsrf = RedditTokenEnvelope(
        cookies = Map("edgebucket" -> "abc"),
        userAgent = "ua",
        bearer = "",
        expiresAtEpochSeconds = Long.MaxValue / 2L
      )
      fastClient(noCsrf).paginateListing("x", RedditListingTypes.New, None, 1).toList
      seen.head.contains("x-reddit-csrf") mustBe false
      seen.head.contains("authorization") mustBe false
    }
  }
}
