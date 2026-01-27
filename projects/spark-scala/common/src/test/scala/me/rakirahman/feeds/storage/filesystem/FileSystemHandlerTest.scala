package me.rakirahman.feeds.storage.filesystem

import me.rakirahman.feeds.storage.filesystem.local.LocalFileSystemHandler
import java.io.File
import java.nio.file.{Files, Path}
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

/** Tests for [[FileSystemHandler]] trait.
  */
// @formatter:off
class FileSystemHandlerTest extends AnyFunSpec with Matchers {

  def withTempDir(testCode: Path => Any): Unit = {
    val tempDir = Files.createTempDirectory("testdir")
    try {
      testCode(tempDir)
    } finally {
      tempDir.toFile.delete()
    }
  }

  describe("LocalFileSystemHandler") {

    it("can remove a file") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "testfile.txt")
        file.createNewFile()
        LocalFileSystemHandler.rm(file.getPath) shouldBe true
        file.exists() shouldBe false
      }
    }

    it("can remove a directory recursively") {
      withTempDir { tempDir =>
        val dir = new File(tempDir.toFile, "testdir")
        dir.mkdir()
        val file = new File(dir, "testfile.txt")
        file.createNewFile()
        LocalFileSystemHandler.rm(dir.getPath, recurse = true) shouldBe true
        dir.exists() shouldBe false
      }
    }

    it("can read a file") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "testfile.txt")
        val content = "Hello, world!"
        LocalFileSystemHandler.put(file.getPath, content, overwrite = true)
        LocalFileSystemHandler.read(file.getPath) shouldBe content
        file.delete()
      }
    }

    it("can sanitize and read a file") {
        withTempDir { tempDir =>
          val file = new File(tempDir.toFile, "testfile.txt")
          val content = "Hello, world!"
          val unsanitizedPath = s"file://${file.getPath}"
          LocalFileSystemHandler.put(unsanitizedPath, content, overwrite = true)
          LocalFileSystemHandler.read(unsanitizedPath) shouldBe content
          file.delete()
        }
      }

    it("can write to a file") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "testfile.txt")
        val content = "Hello, world!"
        LocalFileSystemHandler.put(file.getPath, content, overwrite = true) shouldBe true
        LocalFileSystemHandler.read(file.getPath) shouldBe content
        file.delete()
      }
    }

    it("can append to a file") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "testfile.txt")
        val content1 = "Hello"
        val content2 = ", world!"
        LocalFileSystemHandler.put(file.getPath, content1, overwrite = true)
        LocalFileSystemHandler.append(file.getPath, content2, createFile = true) shouldBe true
        LocalFileSystemHandler.read(file.getPath) shouldBe content1 + content2
        file.delete()
      }
    }

    it("can check if a file exists") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "testfile.txt")
        file.createNewFile()
        LocalFileSystemHandler.exists(file.getPath) shouldBe true
        file.delete()
        LocalFileSystemHandler.exists(file.getPath) shouldBe false
      }
    }

    it("can create directories") {
      withTempDir { tempDir =>
        val dir = new File(tempDir.toFile, "testdir")
        LocalFileSystemHandler.mkdirs(dir.getPath) shouldBe true
        dir.exists() shouldBe true
        dir.delete()
      }
    }

    it("can copy a file") {
      withTempDir { tempDir =>
        val file1 = new File(tempDir.toFile, "testfile1.txt")
        val file2 = new File(tempDir.toFile, "testfile2.txt")
        val content = "Hello, world!"
        LocalFileSystemHandler.put(file1.getPath, content, overwrite = true)
        LocalFileSystemHandler.cp(file1.getPath, file2.getPath, recurse = false) shouldBe true
        LocalFileSystemHandler.read(file2.getPath) shouldBe content
        file1.delete()
        file2.delete()
      }
    }

    it("can move a file") {
      withTempDir { tempDir =>
        val file1 = new File(tempDir.toFile, "testfile1.txt")
        val file2 = new File(tempDir.toFile, "testfile2.txt")
        val content = "Hello, world!"
        LocalFileSystemHandler.put(file1.getPath, content, overwrite = true)
        LocalFileSystemHandler.mv(file1.getPath, file2.getPath, createPath = false, overwrite = false) shouldBe true
        LocalFileSystemHandler.exists(file1.getPath) shouldBe false
        LocalFileSystemHandler.read(file2.getPath) shouldBe content
        file2.delete()
      }
    }

    it("can list directory contents") {
      withTempDir { tempDir =>
        val dir = new File(tempDir.toFile, "testdir")
        dir.mkdir()
        val file1 = new File(dir, "testfile1.txt")
        val file2 = new File(dir, "testfile2.txt")
        file1.createNewFile()
        file2.createNewFile()
        val files = LocalFileSystemHandler.ls(dir.getPath)
        files.map(_.name).toSet shouldBe Set("testfile1.txt", "testfile2.txt")
        file1.delete()
        file2.delete()
        dir.delete()
      }
    }
  }
}
// @formatter:on
