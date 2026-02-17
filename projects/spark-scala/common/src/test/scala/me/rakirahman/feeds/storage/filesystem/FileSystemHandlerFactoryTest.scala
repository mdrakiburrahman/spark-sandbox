package me.rakirahman.feeds.storage.filesystem

import me.rakirahman.config.EnvironmentConfiguration
import me.rakirahman.feeds.storage.filesystem.local.LocalFileSystemHandler
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class FileSystemHandlerFactoryTest extends AnyFunSpec with Matchers {

  describe("FileSystemHandlerFactory") {

    it("should create LocalFileSystemHandler when LocalSpark is true") {
      val config = new EnvironmentConfiguration {
        override val LocalSpark: Boolean = true
        override def config(): java.util.Map[String, Any] = new java.util.HashMap[String, Any]()
      }
      FileSystemHandlerFactory.createEnvironmentSpecificHandler(config) shouldBe LocalFileSystemHandler
    }
  }
}
