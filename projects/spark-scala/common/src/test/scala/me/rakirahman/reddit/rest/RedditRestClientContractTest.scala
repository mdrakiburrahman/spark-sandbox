package me.rakirahman.reddit.rest

import me.rakirahman.reddit._

import com.sun.net.httpserver.{HttpExchange, HttpHandler, HttpServer}

import org.scalatest.BeforeAndAfterEach
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers

import java.io.OutputStream
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets
import java.util.concurrent.atomic.AtomicInteger

import scala.collection.mutable

class RedditRestClientContractTest extends AnyFunSpec with Matchers with BeforeAndAfterEach {

  private var server: HttpServer = _
  private var baseUrl: String = _
  private val recorded = mutable.ArrayBuffer.empty[RecordedRequest]

  case class RecordedRequest(path: String, query: String, headers: Map[String, String])

  override def beforeEach(): Unit = {
    recorded.clear()
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

  private def fastClient(envelope: RedditTokenEnvelope, retryAttempts: Int = 3): RedditRestClient =
    new RedditRestClient(
      envelope = envelope,
      baseUrl = baseUrl,
      requestTimeoutSeconds = 5,
      baseSleepSeconds = 0.0,
      jitterMaxSeconds = 0.0,
      retryMaxAttempts = retryAttempts,
      retryWaitMinSeconds = 0.0,
      retryWaitMaxSeconds = 0.0,
      retryWaitMultiplier = 0.0,
      sleeper = _ => ()
    )

  private def install(path: String, handler: HttpExchange => Unit): Unit = {
    server.createContext(
      path,
      new HttpHandler {
        override def handle(exchange: HttpExchange): Unit = {
          val rawQuery = Option(exchange.getRequestURI.getRawQuery).getOrElse("")
          import scala.collection.JavaConverters._
          val headers = exchange.getRequestHeaders.asScala.flatMap { case (k, vs) =>
            vs.asScala.headOption.map(v => k.toLowerCase -> v)
          }.toMap
          recorded += RecordedRequest(exchange.getRequestURI.getPath, rawQuery, headers)
          handler(exchange)
        }
      }
    )
    server.start()
  }

  private def writeJson(exchange: HttpExchange, status: Int, body: String): Unit = {
    val bytes = body.getBytes(StandardCharsets.UTF_8)
    exchange.getResponseHeaders.add("Content-Type", "application/json; charset=utf-8")
    exchange.sendResponseHeaders(status, bytes.length.toLong)
    val os: OutputStream = exchange.getResponseBody
    try os.write(bytes)
    finally os.close()
  }

  describe("RedditRestClient.paginateListing") {

    it("should GET /r/<sub>/<listing>.json with cookies, UA, and time-window for top") {
      install(
        "/r/MicrosoftFabric/top.json",
        { ex =>
          writeJson(
            ex,
            200,
            """{"data":{"after":null,"children":[
          {"kind":"t3","data":{"id":"p1","name":"t3_p1","title":"Hello","subreddit":"MicrosoftFabric"}},
          {"kind":"t3","data":{"id":"p2","name":"t3_p2","title":"World","subreddit":"MicrosoftFabric"}}
        ]}}"""
          )
        }
      )

      val client = fastClient(envelope())
      val posts = client.paginateListing("MicrosoftFabric", RedditListingTypes.Top, Some(RedditTimeWindows.Month), 5).toList
      posts must have size 2
      posts.head("id") mustBe "p1"

      recorded must have size 1
      val req = recorded.head
      req.path mustBe "/r/MicrosoftFabric/top.json"
      req.query must include("t=month")
      req.query must include("limit=5")
      req.query must include("raw_json=1")
      req.headers("user-agent") mustBe "test-agent/1.0"
      req.headers("cookie") must (include("edgebucket=abc") and include("csrf_token=csrf-xyz"))
      req.headers("x-reddit-csrf") mustBe "csrf-xyz"
    }

    it("should omit t= when listing does not accept a time window (e.g. new)") {
      install(
        "/r/x/new.json",
        { ex =>
          writeJson(ex, 200, """{"data":{"after":null,"children":[]}}""")
        }
      )
      val client = fastClient(envelope())
      val posts = client.paginateListing("x", RedditListingTypes.New, Some(RedditTimeWindows.Month), 3).toList
      posts mustBe empty
      val q1 = recorded.head.query
      (q1.contains("&t=") || q1.startsWith("t=")) mustBe false
    }

    it("should follow `after` cursors across pages and clamp to ListingHardCap") {
      val counter = new AtomicInteger(0)
      install(
        "/r/x/top.json",
        { ex =>
          val n = counter.incrementAndGet()
          n match {
            case 1 =>
              writeJson(
                ex,
                200,
                """{"data":{"after":"t3_p2","children":[
              {"kind":"t3","data":{"id":"p1","name":"t3_p1"}},
              {"kind":"t3","data":{"id":"p2","name":"t3_p2"}}
            ]}}"""
              )
            case _ =>
              writeJson(
                ex,
                200,
                """{"data":{"after":null,"children":[
              {"kind":"t3","data":{"id":"p3","name":"t3_p3"}}
            ]}}"""
              )
          }
        }
      )

      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = baseUrl,
        listingPageSize = 2,
        requestTimeoutSeconds = 5,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 0.0,
        retryMaxAttempts = 3,
        retryWaitMinSeconds = 0.0,
        retryWaitMaxSeconds = 0.0,
        retryWaitMultiplier = 0.0,
        sleeper = _ => ()
      )
      val posts = client.paginateListing("x", RedditListingTypes.Top, Some(RedditTimeWindows.Day), 5).toList
      posts.map(_("id")) mustBe Seq("p1", "p2", "p3")
      recorded must have size 2
      recorded(1).query must include("after=t3_p2")
      recorded(1).query must include("count=2")
    }
  }

  describe("RedditRestClient.fetchComments") {

    it("should GET /comments/<id>.json with limit/depth/sort/threaded params and return (post, comments)") {
      install(
        "/comments/abc.json",
        { ex =>
          writeJson(
            ex,
            200,
            """[
          {"data":{"children":[{"kind":"t3","data":{"id":"abc","name":"t3_abc","title":"Hi"}}]}},
          {"data":{"children":[{"kind":"t1","data":{"id":"c1","name":"t1_c1","body":"first"}}]}}
        ]"""
          )
        }
      )
      val client = fastClient(envelope())
      val (post, comments) = client.fetchComments("abc")
      post("name") mustBe "t3_abc"
      comments must have size 1
      comments.head("kind") mustBe "t1"
      val q = recorded.head.query
      q must include("limit=500")
      q must include("depth=10")
      q must include("threaded=false")
      q must include("sort=top")
      q must include("raw_json=1")
    }
  }

  describe("RedditRestClient.expandMore") {

    it("must use GET (not POST) and batch children up to MoreChildrenBatch") {
      val seenMethods = mutable.ArrayBuffer.empty[String]
      install(
        "/api/morechildren.json",
        { ex =>
          seenMethods += ex.getRequestMethod
          writeJson(ex, 200, """{"json":{"data":{"things":[{"kind":"t1","data":{"id":"c10","name":"t1_c10","body":"x"}}]}}}""")
        }
      )
      val client = new RedditRestClient(
        envelope = envelope(),
        baseUrl = baseUrl,
        moreChildrenBatch = 2,
        requestTimeoutSeconds = 5,
        baseSleepSeconds = 0.0,
        jitterMaxSeconds = 0.0,
        retryMaxAttempts = 3,
        retryWaitMinSeconds = 0.0,
        retryWaitMaxSeconds = 0.0,
        retryWaitMultiplier = 0.0,
        sleeper = _ => ()
      )
      val things = client.expandMore("t3_abc", Seq("c1", "c2", "c3", "c4", "c5"))
      things must have size 3
      seenMethods.toSeq.distinct mustBe Seq("GET")
      client.moreCallCount mustBe 3L
      recorded.head.query must include("api_type=json")
      recorded.head.query must include("link_id=t3_abc")
      recorded.head.query must include("children=c1%2Cc2")
    }
  }

  describe("retry semantics") {

    it("should retry once on 429 honoring Retry-After then succeed") {
      val attempts = new AtomicInteger(0)
      install(
        "/r/x/top.json",
        { ex =>
          val n = attempts.incrementAndGet()
          if (n == 1) {
            ex.getResponseHeaders.add("Retry-After", "0")
            val body = """{"message":"slow down"}""".getBytes(StandardCharsets.UTF_8)
            ex.sendResponseHeaders(429, body.length.toLong)
            ex.getResponseBody.write(body); ex.getResponseBody.close()
          } else {
            writeJson(
              ex,
              200,
              """{"data":{"after":null,"children":[
            {"kind":"t3","data":{"id":"p1","name":"t3_p1"}}
          ]}}"""
            )
          }
        }
      )
      val client = fastClient(envelope())
      val posts = client.paginateListing("x", RedditListingTypes.Top, Some(RedditTimeWindows.Day), 5).toList
      posts must have size 1
      attempts.get mustBe 2
    }

    it("should give up after retryMaxAttempts on persistent 500s") {
      val attempts = new AtomicInteger(0)
      install(
        "/r/x/top.json",
        { ex =>
          attempts.incrementAndGet()
          val body = "boom".getBytes(StandardCharsets.UTF_8)
          ex.sendResponseHeaders(500, body.length.toLong)
          ex.getResponseBody.write(body); ex.getResponseBody.close()
        }
      )
      val client = fastClient(envelope(), retryAttempts = 3)
      a[RedditHttpException] must be thrownBy {
        client.paginateListing("x", RedditListingTypes.Top, Some(RedditTimeWindows.Day), 5).toList
      }
      attempts.get mustBe 3
    }

    it("should fast-fail on 401 with RedditCookieExpiredException (no retry)") {
      val attempts = new AtomicInteger(0)
      install(
        "/r/x/top.json",
        { ex =>
          attempts.incrementAndGet()
          val body = "auth".getBytes(StandardCharsets.UTF_8)
          ex.sendResponseHeaders(401, body.length.toLong)
          ex.getResponseBody.write(body); ex.getResponseBody.close()
        }
      )
      val client = fastClient(envelope(), retryAttempts = 8)
      a[RedditCookieExpiredException] must be thrownBy {
        client.paginateListing("x", RedditListingTypes.Top, Some(RedditTimeWindows.Day), 5).toList
      }
      attempts.get mustBe 1
    }

    it("should reject non-JSON responses as RedditHttpException") {
      install(
        "/r/x/top.json",
        { ex =>
          val body = "<html>error</html>".getBytes(StandardCharsets.UTF_8)
          ex.getResponseHeaders.add("Content-Type", "text/html")
          ex.sendResponseHeaders(200, body.length.toLong)
          ex.getResponseBody.write(body); ex.getResponseBody.close()
        }
      )
      val client = fastClient(envelope())
      a[RedditHttpException] must be thrownBy {
        client.paginateListing("x", RedditListingTypes.Top, Some(RedditTimeWindows.Day), 5).toList
      }
    }
  }

  describe("RedditTokenEnvelope.parse") {

    it("should decode the same outer-JSON-wrapping-inner-base64 shape as CredentialBridge") {
      val inner = """{
        "bearer":"oauth-xyz",
        "cookies":{"edgebucket":"abc","csrf_token":"csrf-xyz"},
        "expires_at":1900000000,
        "user_agent":"test-agent/1.0",
        "token_endpoint":"https://oauth.reddit.com/token",
        "cookie_domain":"reddit.com"
      }"""
      val encoded = java.util.Base64.getEncoder.encodeToString(inner.getBytes(StandardCharsets.UTF_8))
      val outer = s"""{"access_token":"$encoded"}"""

      val result = RedditTokenEnvelope.parse(outer)
      result.isRight mustBe true
      val env = result.toOption.get
      env.userAgent mustBe "test-agent/1.0"
      env.bearer mustBe "oauth-xyz"
      env.cookies("edgebucket") mustBe "abc"
      env.cookieHeader must (include("edgebucket=abc") and include("csrf_token=csrf-xyz"))
      env.isExpired(1500000000L) mustBe false
      env.isExpired(1900000001L) mustBe true
    }

    it("should report Malformed when access_token is absent") {
      val result = RedditTokenEnvelope.parse("""{"foo":"bar"}""")
      result.isLeft mustBe true
      result.left.toOption.get mustBe a[RedditTokenLoadFailure.Malformed]
    }
  }
}
