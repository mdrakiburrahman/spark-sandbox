package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.entra.credential.providers.SupportedProviderTypes

import org.apache.spark.SparkConf
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class AdlsOAuthTokenProviderConfTest extends AnyFunSpec with Matchers {

  private def base: SparkConf =
    new SparkConf(false)
      .set("spark.plugin.adlsoauth.vaultUrl", "https://v.vault.azure.net")
      .set("spark.plugin.adlsoauth.configSecretBase64Name", "adlsoauth-base64")

  private def relayAndUami: SparkConf =
    base
      .set("spark.plugin.adlsoauth.account.0.endpoint", "ivmbenchdbrx.dfs.core.windows.net")
      .set("spark.plugin.adlsoauth.account.0.authType", "relay")
      .set("spark.plugin.adlsoauth.account.1.endpoint", "msit-onelake.dfs.fabric.microsoft.com")
      .set("spark.plugin.adlsoauth.account.1.authType", "uami")

  describe("AdlsOAuthTokenProviderConf") {

    it("should resolve no accounts and Devcontainer runtime for an empty conf") {
      val parsed = AdlsOAuthTokenProviderConf(new SparkConf(false))
      parsed.accounts shouldBe empty
      parsed.runtime shouldBe SparkRuntime.Devcontainer
      parsed.vaultUrl shouldBe ""
      parsed.configSecretBase64Name shouldBe ""
    }

    it("should parse endpoint + authType per account and the shared globals") {
      val parsed = AdlsOAuthTokenProviderConf(relayAndUami)
      parsed.vaultUrl shouldBe "https://v.vault.azure.net"
      parsed.configSecretBase64Name shouldBe "adlsoauth-base64"
      parsed.accounts.map(_.endpoint) shouldBe Seq(
        "ivmbenchdbrx.dfs.core.windows.net",
        "msit-onelake.dfs.fabric.microsoft.com"
      )
      parsed.accounts.map(_.authType) shouldBe Seq(
        SupportedProviderTypes.RelayCredentialProvider,
        SupportedProviderTypes.UamiCredentialProvider
      )
    }

    it("should require the Key Vault globals when any account is secret-backed (sni/relay)") {
      val missingVault = new SparkConf(false)
        .set("spark.plugin.adlsoauth.configSecretBase64Name", "adlsoauth-base64")
        .set("spark.plugin.adlsoauth.account.0.endpoint", "x.dfs.core.windows.net")
        .set("spark.plugin.adlsoauth.account.0.authType", "relay")
      an[IllegalArgumentException] should be thrownBy AdlsOAuthTokenProviderConf(missingVault)

      val missingSecret = new SparkConf(false)
        .set("spark.plugin.adlsoauth.vaultUrl", "https://v.vault.azure.net")
        .set("spark.plugin.adlsoauth.account.0.endpoint", "x.dfs.core.windows.net")
        .set("spark.plugin.adlsoauth.account.0.authType", "sni")
      an[IllegalArgumentException] should be thrownBy AdlsOAuthTokenProviderConf(missingSecret)
    }

    it("should not require the Key Vault globals when all accounts use an ambient identity (devcontainer/uami)") {
      val conf = new SparkConf(false)
        .set("spark.plugin.adlsoauth.account.0.endpoint", "msit-onelake.dfs.fabric.microsoft.com")
        .set("spark.plugin.adlsoauth.account.0.authType", "devcontainer")
        .set("spark.plugin.adlsoauth.account.1.endpoint", "other-onelake.dfs.fabric.microsoft.com")
        .set("spark.plugin.adlsoauth.account.1.authType", "uami")
      val parsed = AdlsOAuthTokenProviderConf(conf)
      parsed.accounts should have size 2
      parsed.vaultUrl shouldBe ""
      parsed.configSecretBase64Name shouldBe ""
    }

    it("should throw when a mandatory account key is missing") {
      val conf = base.set("spark.plugin.adlsoauth.account.0.endpoint", "x.dfs.core.windows.net")
      an[IllegalArgumentException] should be thrownBy AdlsOAuthTokenProviderConf(conf)
    }

    it("should throw for an unsupported auth type") {
      val conf = base
        .set("spark.plugin.adlsoauth.account.0.endpoint", "x.dfs.core.windows.net")
        .set("spark.plugin.adlsoauth.account.0.authType", "managed-identity")
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

    it("should map all four tokens case-insensitively") {
      SupportedProviderTypes.fromToken("sni") shouldBe SupportedProviderTypes.SpnSNICredentialProvider
      SupportedProviderTypes.fromToken("DEVCONTAINER") shouldBe SupportedProviderTypes.DevcontainerCredentialProvider
      SupportedProviderTypes.fromToken("Relay") shouldBe SupportedProviderTypes.RelayCredentialProvider
      SupportedProviderTypes.fromToken("UAMI") shouldBe SupportedProviderTypes.UamiCredentialProvider
    }

    it("should throw for an unknown token") {
      an[IllegalArgumentException] should be thrownBy SupportedProviderTypes.fromToken("oauth")
    }
  }

  describe("AdlsOAuthTokenProviderConf case class") {

    it("should support equality") {
      val a = AdlsOAuthTokenProviderConf(Seq.empty, "", "", SparkRuntime.Devcontainer)
      val b = AdlsOAuthTokenProviderConf(Seq.empty, "", "", SparkRuntime.Devcontainer)
      a shouldBe b
    }
  }
}
