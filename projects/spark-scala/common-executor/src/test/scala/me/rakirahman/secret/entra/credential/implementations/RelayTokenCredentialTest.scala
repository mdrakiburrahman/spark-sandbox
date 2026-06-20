package me.rakirahman.secret.entra.credential.implementations

// @formatter:off
import com.azure.core.credential.{AccessToken, TokenCredential, TokenRequestContext}
import me.rakirahman.secret.entra.credential.implementations.RelayTokenCredential.RelayHttpException
import com.sun.net.httpserver.{HttpExchange, HttpHandler, HttpServer}

import java.io.IOException
import java.net.InetSocketAddress
import java.net.http.HttpClient
import java.nio.charset.StandardCharsets
import java.time.{Duration => JDuration, OffsetDateTime, ZoneOffset}
import java.util.concurrent.atomic.{AtomicInteger, AtomicReference}

import org.scalatest.BeforeAndAfterEach
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import reactor.core.publisher.Mono

import scala.collection.mutable
// @formatter:on

/** Unit tests for [[RelayTokenCredential]] retry / caching behavior. */
class RelayTokenCredentialTest extends AnyFunSpec with Matchers with BeforeAndAfterEach {

  private var server: HttpServer = _
  private var endpoint: String = _
  private var requestCount: AtomicInteger = _
  private var innerCallCount: AtomicInteger = _

  // Tiny backoffs keep the test suite fast.
  private val fastMinBackoff = JDuration.ofMillis(1)
  private val fastMaxBackoff = JDuration.ofMillis(5)
  private val fastTimeout = JDuration.ofSeconds(5)

  override def beforeEach(): Unit = {
    requestCount = new AtomicInteger(0)
    innerCallCount = new AtomicInteger(0)
    server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0)
    server.start()
    endpoint = s"http://127.0.0.1:${server.getAddress.getPort}/relay"
  }

  override def afterEach(): Unit = {
    if (server != null) server.stop(0)
  }

  private def innerCredential: TokenCredential = new TokenCredential {
    override def getToken(request: TokenRequestContext): Mono[AccessToken] = {
      innerCallCount.incrementAndGet()
      Mono.just(
        new AccessToken(
          "inner-relay-token",
          OffsetDateTime.now(ZoneOffset.UTC).plusHours(1)
        )
      )
    }
  }

  /** Programs the relay endpoint to return the given queue of responses in order. After the queue is exhausted, every subsequent request reuses the final response.
    */
  private def stubResponses(responses: (Int, String)*): Unit = {
    val queue = mutable.Queue(responses: _*)
    val last = new AtomicReference[(Int, String)](responses.last)
    server.createContext(
      "/relay",
      new HttpHandler {
        override def handle(exchange: HttpExchange): Unit = {
          requestCount.incrementAndGet()
          val (status, body) = if (queue.nonEmpty) {
            val resp = queue.dequeue()
            last.set(resp)
            resp
          } else {
            last.get()
          }
          val bytes = body.getBytes(StandardCharsets.UTF_8)
          exchange.sendResponseHeaders(status, bytes.length.toLong)
          val os = exchange.getResponseBody
          try os.write(bytes)
          finally os.close()
        }
      }
    )
  }

  private val validTokenBody: String =
    """{"access_token":"target-token","expires_in":3600}"""

  private def newCredential(
      maxRetries: Long = 4,
      forceRefresh: Boolean = false,
      httpClient: HttpClient = HttpClient.newHttpClient()
  ): RelayTokenCredential =
    new RelayTokenCredential(
      inner = innerCredential,
      relayEndpoint = endpoint,
      forceRefresh = forceRefresh,
      maxRetries = maxRetries,
      minBackoff = fastMinBackoff,
      maxBackoff = fastMaxBackoff,
      requestTimeout = fastTimeout,
      httpClient = httpClient
    )

  private def requestContext(
      scope: String = "https://example.com/.default"
  ): TokenRequestContext = {
    val ctx = new TokenRequestContext()
    ctx.addScopes(scope)
    ctx
  }

  describe("RelayTokenCredential.isRetryable") {
    it("retries documented HTTP status codes") {
      Seq(408, 429, 500, 502, 503, 504).foreach { code =>
        RelayTokenCredential.isRetryable(
          new RelayHttpException(code, "")
        ) shouldBe true
      }
    }
    it("does not retry non-retryable HTTP status codes") {
      Seq(400, 401, 403, 404, 409, 422).foreach { code =>
        RelayTokenCredential.isRetryable(
          new RelayHttpException(code, "")
        ) shouldBe false
      }
    }
    it("retries IOException and TimeoutException") {
      RelayTokenCredential.isRetryable(new IOException("boom")) shouldBe true
      RelayTokenCredential.isRetryable(
        new java.util.concurrent.TimeoutException("slow")
      ) shouldBe true
    }
    it("does not retry arbitrary RuntimeExceptions") {
      RelayTokenCredential.isRetryable(
        new RuntimeException("nope")
      ) shouldBe false
      RelayTokenCredential.isRetryable(
        new IllegalStateException("nope")
      ) shouldBe false
    }
    it("unwraps CompletionException to find the real cause") {
      val wrapped = new java.util.concurrent.CompletionException(
        new RelayHttpException(500, "")
      )
      RelayTokenCredential.isRetryable(wrapped) shouldBe true
      val wrappedNonRetryable = new java.util.concurrent.CompletionException(
        new RelayHttpException(401, "")
      )
      RelayTokenCredential.isRetryable(wrappedNonRetryable) shouldBe false
    }
  }

  describe("RelayTokenCredential.getToken") {
    it("returns a token on a successful response and caches it") {
      stubResponses((200, validTokenBody))
      val credential = newCredential()

      val token = credential.getToken(requestContext()).block()
      token.getToken shouldBe "target-token"
      requestCount.get() shouldBe 1

      // Second call uses the cache; the server should not be hit again.
      val cached = credential.getToken(requestContext()).block()
      cached.getToken shouldBe "target-token"
      requestCount.get() shouldBe 1
    }

    it("bypasses the cache when forceRefresh is true") {
      stubResponses((200, validTokenBody), (200, validTokenBody))
      val credential = newCredential(forceRefresh = true)

      credential.getToken(requestContext()).block()
      credential.getToken(requestContext()).block()

      requestCount.get() shouldBe 2
    }

    it("retries a transient 500 and ultimately succeeds") {
      stubResponses((500, "boom"), (200, validTokenBody))
      val credential = newCredential()

      val token = credential.getToken(requestContext()).block()
      token.getToken shouldBe "target-token"
      requestCount.get() shouldBe 2
      // The relay token from the inner credential is fetched only once across retries.
      innerCallCount.get() shouldBe 1
    }

    it("retries 503 and 429") {
      stubResponses(
        (503, "unavailable"),
        (429, "throttled"),
        (200, validTokenBody)
      )
      val credential = newCredential()

      val token = credential.getToken(requestContext()).block()
      token.getToken shouldBe "target-token"
      requestCount.get() shouldBe 3
    }

    it("fails fast on non-retryable 4xx without retrying") {
      stubResponses((401, "no auth"))
      val credential = newCredential()

      val ex = intercept[RelayHttpException] {
        credential.getToken(requestContext()).block()
      }
      ex.statusCode shouldBe 401
      ex.getMessage should include("Relay responded with 401")
      requestCount.get() shouldBe 1
    }

    it("surfaces the original RelayHttpException when retries are exhausted") {
      stubResponses((500, "still broken"))
      val credential = newCredential(maxRetries = 2)

      val ex = intercept[RelayHttpException] {
        credential.getToken(requestContext()).block()
      }
      ex.statusCode shouldBe 500
      ex.getMessage should include("Relay responded with 500")
      // 1 initial attempt + 2 retries = 3 total.
      requestCount.get() shouldBe 3
    }

    it("does not retry a malformed 200 response") {
      stubResponses((200, "{not valid json"))
      val credential = newCredential()

      intercept[RuntimeException] {
        credential.getToken(requestContext()).block()
      }
      requestCount.get() shouldBe 1
    }

    it("does not retry when access_token is missing from a 200 response") {
      stubResponses((200, """{"expires_in":3600}"""))
      val credential = newCredential()

      val ex = intercept[RuntimeException] {
        credential.getToken(requestContext()).block()
      }
      ex.getMessage should include("access_token")
      requestCount.get() shouldBe 1
    }

    it("can be configured with maxRetries=0 to disable retries") {
      stubResponses((500, "boom"))
      val credential = newCredential(maxRetries = 0)

      intercept[RelayHttpException] {
        credential.getToken(requestContext()).block()
      }
      requestCount.get() shouldBe 1
    }
  }
}
