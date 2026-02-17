package me.rakirahman.feeds.storage.filesystem

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class FileInfoTest extends AnyFunSpec with Matchers {

  describe("FileInfo") {

    it("should store all properties correctly") {
      val info = FileInfo("test.txt", "/tmp/test.txt", 1024L, isDir = false, isFile = true, modifyTime = 1000L)
      info.name shouldBe "test.txt"
      info.path shouldBe "/tmp/test.txt"
      info.size shouldBe 1024L
      info.isDir shouldBe false
      info.isFile shouldBe true
      info.modifyTime shouldBe 1000L
    }

    it("should support equality") {
      val a = FileInfo("a", "/a", 1, false, true, 0)
      val b = FileInfo("a", "/a", 1, false, true, 0)
      a shouldBe b
    }
  }
}
