package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import me.rakirahman.runtime.SparkRuntime

import org.apache.spark.SparkConf
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class AdlsOAuthTokenProviderConfTest extends AnyFunSpec with Matchers {

  describe("AdlsOAuthTokenProviderConf") {

    it("should create with default values") {
      val conf = new SparkConf(false)
      val parsed = AdlsOAuthTokenProviderConf(conf)
      parsed.vaultUrl shouldBe ""
      parsed.secretName shouldBe ""
      parsed.outputPath shouldBe "/tmp/secret.txt"
      parsed.linkedServiceName shouldBe ""
      parsed.runtime shouldBe SparkRuntime.Devcontainer
    }

    it("should create with custom values") {
      val conf = new SparkConf(false)
        .set("spark.plugin.adlsoauth.vault.url", "https://myvault.vault.azure.net")
        .set("spark.plugin.adlsoauth.secret.name", "my-secret")
        .set("spark.plugin.adlsoauth.output.path", "/custom/secret.txt")
        .set("spark.plugin.adlsoauth.synapse.linkedServiceName", "akv-linked")
      val parsed = AdlsOAuthTokenProviderConf(conf)
      parsed.vaultUrl shouldBe "https://myvault.vault.azure.net"
      parsed.secretName shouldBe "my-secret"
      parsed.outputPath shouldBe "/custom/secret.txt"
      parsed.linkedServiceName shouldBe "akv-linked"
    }

    it("should resolve Devcontainer when cluster type is absent") {
      val conf = new SparkConf(false)
      AdlsOAuthTokenProviderConf(conf).runtime shouldBe SparkRuntime.Devcontainer
    }

    it("should resolve Synapse when cluster type is synapse") {
      val conf = new SparkConf(false).set("spark.cluster.type", "synapse")
      AdlsOAuthTokenProviderConf(conf).runtime shouldBe SparkRuntime.Synapse
    }

    it("should resolve Fabric when cluster type is trident") {
      val conf = new SparkConf(false).set("spark.cluster.type", "trident")
      AdlsOAuthTokenProviderConf(conf).runtime shouldBe SparkRuntime.Fabric
    }

    it("should resolve Devcontainer for an unknown cluster type") {
      val conf = new SparkConf(false).set("spark.cluster.type", "yarn")
      AdlsOAuthTokenProviderConf(conf).runtime shouldBe SparkRuntime.Devcontainer
    }
  }

  describe("SparkRuntime.fromClusterType") {

    it("should map known and unknown cluster types") {
      SparkRuntime.fromClusterType("synapse") shouldBe SparkRuntime.Synapse
      SparkRuntime.fromClusterType("trident") shouldBe SparkRuntime.Fabric
      SparkRuntime.fromClusterType("") shouldBe SparkRuntime.Devcontainer
      SparkRuntime.fromClusterType(null) shouldBe SparkRuntime.Devcontainer
    }
  }

  describe("AdlsOAuthTokenProviderConf case class") {

    it("should support equality") {
      val a = AdlsOAuthTokenProviderConf("v", "s", "/tmp/secret.txt", "", SparkRuntime.Devcontainer)
      val b = AdlsOAuthTokenProviderConf("v", "s", "/tmp/secret.txt", "", SparkRuntime.Devcontainer)
      a shouldBe b
    }
  }
}
