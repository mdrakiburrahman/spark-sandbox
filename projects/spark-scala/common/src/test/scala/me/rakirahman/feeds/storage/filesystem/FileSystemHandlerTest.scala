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

    it("can rm non-existent file returns false") {
      LocalFileSystemHandler.rm("/tmp/nonexistent_test_file_xyz") shouldBe false
    }

    it("can put without overwrite returns false for existing file") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "no_overwrite.txt")
        LocalFileSystemHandler.put(file.getPath, "first", overwrite = true)
        LocalFileSystemHandler.put(file.getPath, "second", overwrite = false) shouldBe false
        LocalFileSystemHandler.read(file.getPath) shouldBe "first"
        file.delete()
      }
    }

    it("can append to non-existent file without createFile returns false") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "no_create.txt")
        LocalFileSystemHandler.append(file.getPath, "content", createFile = false) shouldBe false
      }
    }

    it("can ls empty or non-existent directory returns empty") {
      LocalFileSystemHandler.ls("/tmp/nonexistent_dir_xyz") shouldBe empty
    }

    it("can ls empty directory") {
      withTempDir { tempDir =>
        val dir = new File(tempDir.toFile, "emptydir")
        dir.mkdir()
        LocalFileSystemHandler.ls(dir.getPath) shouldBe empty
        dir.delete()
      }
    }

    it("can cp directory recursively") {
      withTempDir { tempDir =>
        val srcDir = new File(tempDir.toFile, "srcdir")
        srcDir.mkdir()
        val file = new File(srcDir, "file.txt")
        LocalFileSystemHandler.put(file.getPath, "content", overwrite = true)
        val dstDir = new File(tempDir.toFile, "dstdir")
        LocalFileSystemHandler.cp(srcDir.getPath, dstDir.getPath, recurse = true) shouldBe true
        LocalFileSystemHandler.exists(new File(dstDir, "file.txt").getPath) shouldBe true
        file.delete()
        srcDir.delete()
        new File(dstDir, "file.txt").delete()
        dstDir.delete()
      }
    }

    it("can mv with createPath") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "mv_src.txt")
        LocalFileSystemHandler.put(file.getPath, "data", overwrite = true)
        val destDir = new File(tempDir.toFile, "newdir")
        val dest = new File(destDir, "mv_dst.txt")
        LocalFileSystemHandler.mv(file.getPath, dest.getPath, createPath = true) shouldBe true
        LocalFileSystemHandler.exists(dest.getPath) shouldBe true
        dest.delete()
        destDir.delete()
      }
    }

    it("can mv with overwrite") {
      withTempDir { tempDir =>
        val src = new File(tempDir.toFile, "mv_ow_src.txt")
        val dst = new File(tempDir.toFile, "mv_ow_dst.txt")
        LocalFileSystemHandler.put(src.getPath, "src_data", overwrite = true)
        LocalFileSystemHandler.put(dst.getPath, "dst_data", overwrite = true)
        LocalFileSystemHandler.mv(src.getPath, dst.getPath, overwrite = true) shouldBe true
        LocalFileSystemHandler.read(dst.getPath) shouldBe "src_data"
        dst.delete()
      }
    }

    it("can ls files with correct FileInfo metadata") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "meta.txt")
        LocalFileSystemHandler.put(file.getPath, "hello", overwrite = true)
        val files = LocalFileSystemHandler.ls(tempDir.toFile.getPath)
        files should have length 1
        files.head.name shouldBe "meta.txt"
        files.head.isFile shouldBe true
        files.head.isDir shouldBe false
        files.head.size should be > 0L
        file.delete()
      }
    }
    it("can rm directory recursively with nested subdirectories") {
      withTempDir { tempDir =>
        val dir = new File(tempDir.toFile, "nested_rm")
        dir.mkdir()
        val subdir = new File(dir, "subdir")
        subdir.mkdir()
        new File(subdir, "nested.txt").createNewFile()
        new File(dir, "root.txt").createNewFile()
        LocalFileSystemHandler.rm(dir.getPath, recurse = true) shouldBe true
        dir.exists() shouldBe false
      }
    }

    it("can append to non-existent file with createFile=true") {
      withTempDir { tempDir =>
        val file = new File(tempDir.toFile, "append_create.txt")
        file.exists() shouldBe false
        LocalFileSystemHandler.append(file.getPath, "created", createFile = true) shouldBe true
        LocalFileSystemHandler.read(file.getPath) shouldBe "created"
        file.delete()
      }
    }
  }
}
// @formatter:on
