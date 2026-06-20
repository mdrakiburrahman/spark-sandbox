package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import java.util.Base64

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class AdlsOAuthSecretConfTest extends AnyFunSpec with Matchers {

  private val yaml =
    """sni:
      |  tenantId: tenant-guid
      |  clientId: client-guid
      |  certName: my-sni-cert
      |relay:
      |  endpoint: https://relay.example.net/path/token
      |""".stripMargin

  private def base64(s: String): String =
    Base64.getEncoder.encodeToString(s.getBytes("UTF-8"))

  describe("AdlsOAuthSecretConf.fromYaml") {

    it("should parse the sni and relay blocks") {
      val conf = AdlsOAuthSecretConf.fromYaml(yaml)
      conf.sni shouldBe Some(SniSecretConf("tenant-guid", "client-guid", "my-sni-cert"))
      conf.relay shouldBe Some(RelaySecretConf("https://relay.example.net/path/token"))
    }

    it("should parse an sni-only secret") {
      val sniOnly =
        """sni:
          |  tenantId: t
          |  clientId: c
          |  certName: n
          |""".stripMargin
      val conf = AdlsOAuthSecretConf.fromYaml(sniOnly)
      conf.sni shouldBe Some(SniSecretConf("t", "c", "n"))
      conf.relay shouldBe None
    }

    it("should expose requireSni / requireRelay accessors") {
      val conf = AdlsOAuthSecretConf.fromYaml(yaml)
      conf.requireSni.clientId shouldBe "client-guid"
      conf.requireRelay.endpoint shouldBe "https://relay.example.net/path/token"
    }

    it("should throw when requireRelay is called but relay is absent") {
      val conf = AdlsOAuthSecretConf.fromYaml("sni:\n  tenantId: t\n  clientId: c\n  certName: n\n")
      an[IllegalArgumentException] should be thrownBy conf.requireRelay
    }

    it("should throw when a mandatory sni field is missing") {
      val missing =
        """sni:
          |  tenantId: t
          |  clientId: c
          |""".stripMargin
      an[IllegalArgumentException] should be thrownBy AdlsOAuthSecretConf.fromYaml(missing)
    }

    it("should throw when the payload is not a mapping") {
      an[IllegalArgumentException] should be thrownBy AdlsOAuthSecretConf.fromYaml("- just\n- a\n- list\n")
    }
  }

  describe("AdlsOAuthSecretConf.fromBase64") {

    it("should decode then parse") {
      val conf = AdlsOAuthSecretConf.fromBase64(base64(yaml))
      conf.requireSni.tenantId shouldBe "tenant-guid"
      conf.requireRelay.endpoint shouldBe "https://relay.example.net/path/token"
    }

    it("should throw on an empty secret") {
      an[IllegalArgumentException] should be thrownBy AdlsOAuthSecretConf.fromBase64("   ")
    }
  }
}
