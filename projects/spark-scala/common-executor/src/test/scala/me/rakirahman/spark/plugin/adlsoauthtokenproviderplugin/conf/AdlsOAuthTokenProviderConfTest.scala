package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.entra.credential.providers.SupportedProviderTypes

import org.apache.spark.SparkConf
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class AdlsOAuthTokenProviderConfTest extends AnyFunSpec with Matchers {

  private def sniConf(index: String = "0"): SparkConf =
    new SparkConf(false)
      .set(s"spark.plugin.adlsoauth.account.$index.endpoint", "fabricdevmdrrahman.dfs.core.windows.net")
      .set(s"spark.plugin.adlsoauth.account.$index.authType", "sni")
      .set(s"spark.plugin.adlsoauth.account.$index.tenantId", "tenant-guid")
      .set(s"spark.plugin.adlsoauth.account.$index.clientId", "client-guid")
      .set(s"spark.plugin.adlsoauth.account.$index.vaultUrl", "https://v.vault.azure.net")
      .set(s"spark.plugin.adlsoauth.account.$index.certName", "my-sni-cert")

  private def devcontainerConf(index: String = "0"): SparkConf =
    new SparkConf(false)
      .set(s"spark.plugin.adlsoauth.account.$index.endpoint", "msit-onelake.dfs.fabric.microsoft.com")
      .set(s"spark.plugin.adlsoauth.account.$index.authType", "devcontainer")
      .set(s"spark.plugin.adlsoauth.account.$index.tenantId", "tenant-guid")

  describe("AdlsOAuthTokenProviderConf") {

    it("should resolve no accounts and Devcontainer runtime for an empty conf") {
      val parsed = AdlsOAuthTokenProviderConf(new SparkConf(false))
      parsed.accounts shouldBe empty
      parsed.runtime shouldBe SparkRuntime.Devcontainer
    }

    it("should parse a single SNI account") {
      val parsed = AdlsOAuthTokenProviderConf(sniConf())
      parsed.accounts should have size 1
      val account = parsed.accounts.head
      account.endpoint shouldBe "fabricdevmdrrahman.dfs.core.windows.net"
      account.authType shouldBe SupportedProviderTypes.SpnSNICredentialProvider
      account.tenantId shouldBe "tenant-guid"
      account.clientId shouldBe "client-guid"
      account.vaultUrl shouldBe "https://v.vault.azure.net"
      account.certName shouldBe "my-sni-cert"
    }

    it("should parse a single Devcontainer account with empty SNI fields") {
      val parsed = AdlsOAuthTokenProviderConf(devcontainerConf())
      parsed.accounts should have size 1
      val account = parsed.accounts.head
      account.endpoint shouldBe "msit-onelake.dfs.fabric.microsoft.com"
      account.authType shouldBe SupportedProviderTypes.DevcontainerCredentialProvider
      account.tenantId shouldBe "tenant-guid"
      account.clientId shouldBe ""
      account.vaultUrl shouldBe ""
      account.certName shouldBe ""
    }

    it("should parse multiple accounts ordered by index") {
      val conf = new SparkConf(false)
        .set("spark.plugin.adlsoauth.account.0.endpoint", "fabricdevmdrrahman.dfs.core.windows.net")
        .set("spark.plugin.adlsoauth.account.0.authType", "sni")
        .set("spark.plugin.adlsoauth.account.0.tenantId", "tenant-guid")
        .set("spark.plugin.adlsoauth.account.0.clientId", "client-guid")
        .set("spark.plugin.adlsoauth.account.0.vaultUrl", "https://v.vault.azure.net")
        .set("spark.plugin.adlsoauth.account.0.certName", "my-sni-cert")
        .set("spark.plugin.adlsoauth.account.1.endpoint", "msit-onelake.dfs.fabric.microsoft.com")
        .set("spark.plugin.adlsoauth.account.1.authType", "devcontainer")
        .set("spark.plugin.adlsoauth.account.1.tenantId", "tenant-guid")

      val parsed = AdlsOAuthTokenProviderConf(conf)
      parsed.accounts.map(_.endpoint) shouldBe Seq(
        "fabricdevmdrrahman.dfs.core.windows.net",
        "msit-onelake.dfs.fabric.microsoft.com"
      )
      parsed.accounts.map(_.authType) shouldBe Seq(
        SupportedProviderTypes.SpnSNICredentialProvider,
        SupportedProviderTypes.DevcontainerCredentialProvider
      )
    }

    it("should throw when a mandatory key is missing") {
      val conf = sniConf().remove("spark.plugin.adlsoauth.account.0.clientId")
      an[IllegalArgumentException] should be thrownBy AdlsOAuthTokenProviderConf(conf)
    }

    it("should throw for an unsupported auth type") {
      val conf = new SparkConf(false)
        .set("spark.plugin.adlsoauth.account.0.endpoint", "x.dfs.core.windows.net")
        .set("spark.plugin.adlsoauth.account.0.authType", "managed-identity")
        .set("spark.plugin.adlsoauth.account.0.tenantId", "tenant-guid")
      an[IllegalArgumentException] should be thrownBy AdlsOAuthTokenProviderConf(conf)
    }

    it("should resolve runtime from spark.cluster.type") {
      AdlsOAuthTokenProviderConf(new SparkConf(false)).runtime shouldBe SparkRuntime.Devcontainer
      AdlsOAuthTokenProviderConf(new SparkConf(false).set("spark.cluster.type", "synapse")).runtime shouldBe SparkRuntime.Synapse
      AdlsOAuthTokenProviderConf(new SparkConf(false).set("spark.cluster.type", "trident")).runtime shouldBe SparkRuntime.Fabric
      AdlsOAuthTokenProviderConf(new SparkConf(false).set("spark.cluster.type", "yarn")).runtime shouldBe SparkRuntime.Devcontainer
    }
  }

  describe("SupportedProviderTypes.fromToken") {

    it("should map known tokens case-insensitively") {
      SupportedProviderTypes.fromToken("sni") shouldBe SupportedProviderTypes.SpnSNICredentialProvider
      SupportedProviderTypes.fromToken("SNI") shouldBe SupportedProviderTypes.SpnSNICredentialProvider
      SupportedProviderTypes.fromToken("devcontainer") shouldBe SupportedProviderTypes.DevcontainerCredentialProvider
    }

    it("should throw for an unknown token") {
      an[IllegalArgumentException] should be thrownBy SupportedProviderTypes.fromToken("oauth")
    }
  }

  describe("AdlsOAuthTokenProviderConf case class") {

    it("should support equality") {
      val a = AdlsOAuthTokenProviderConf(Seq.empty, SparkRuntime.Devcontainer)
      val b = AdlsOAuthTokenProviderConf(Seq.empty, SparkRuntime.Devcontainer)
      a shouldBe b
    }
  }
}
