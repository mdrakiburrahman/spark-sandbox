package me.rakirahman.feeds.storage.filesystem.local

// @formatter:off
import me.rakirahman.feeds.storage.filesystem.{FileInfo, FileSystemHandler}
import java.io.{File, FileInputStream, FileOutputStream, PrintWriter}
import java.nio.file.{Files, Paths, StandardCopyOption}
import scala.collection.JavaConverters._
import scala.io.Source
import scala.sys.process._
// @formatter:on

/** A local filesystem handler.
  */
object LocalFileSystemHandler extends FileSystemHandler {

  /** @inheritdoc
    */
  override def rm(dir: String, recurse: Boolean = false): Boolean = {
    val file = new File(sanitize(dir))
    if (file.exists()) {
      if (recurse) {
        file.listFiles().foreach { f =>
          if (f.isDirectory) rm(f.getPath, recurse) else f.delete()
        }
      }
      file.delete()
    } else {
      false
    }
  }

  /** @inheritdoc
    */
  override def read(file: String): String = {
    Source.fromFile(sanitize(file)).mkString
  }

  /** @inheritdoc
    */
  override def put(
      file: String,
      contents: String,
      overwrite: Boolean = false
  ): Boolean = {
    val f = new File(sanitize(file))
    if (f.exists() && !overwrite) {
      false
    } else {
      val pw = new PrintWriter(f)
      try {
        pw.write(contents)
        true
      } finally {
        pw.close()
      }
    }
  }

  /** @inheritdoc
    */
  override def append(
      file: String,
      content: String,
      createFile: Boolean = false
  ): Boolean = {
    val f = new File(sanitize(file))
    if (!f.exists() && createFile) {
      f.createNewFile()
    }
    if (f.exists()) {
      val pw = new PrintWriter(new FileOutputStream(f, true))
      try {
        pw.append(content)
        true
      } finally {
        pw.close()
      }
    } else {
      false
    }
  }

  /** @inheritdoc
    */
  override def exists(file: String): Boolean = {
    new File(sanitize(file)).exists()
  }

  /** @inheritdoc
    */
  override def mkdirs(dir: String): Boolean = {
    new File(sanitize(dir)).mkdirs()
  }

  /** @inheritdoc
    */
  override def cp(
      from: String,
      to: String,
      recurse: Boolean = false
  ): Boolean = {
    val source = new File(sanitize(from))
    val destination = new File(sanitize(to))
    if (source.isDirectory && recurse) {
      destination.mkdirs()
      source.listFiles().foreach { file =>
        cp(file.getPath, new File(destination, file.getName).getPath, recurse)
      }
    } else {
      Files.copy(
        source.toPath,
        destination.toPath,
        StandardCopyOption.REPLACE_EXISTING
      )
    }
    true
  }

  /** @inheritdoc
    */
  override def mv(
      from: String,
      to: String,
      createPath: Boolean = false,
      overwrite: Boolean = false
  ): Boolean = {
    val source = new File(sanitize(from))
    val destination = new File(sanitize(to))
    if (createPath) {
      destination.getParentFile.mkdirs()
    }
    if (overwrite && destination.exists()) {
      destination.delete()
    }
    source.renameTo(destination)
  }

  /** @inheritdoc
    */
  override def ls(dir: String): Array[FileInfo] = {
    val directory = new File(sanitize(dir))
    if (directory.exists() && directory.isDirectory) {
      directory.listFiles().map { file =>
        FileInfo(
          name = file.getName,
          path = file.getPath,
          size = file.length(),
          isDir = file.isDirectory,
          isFile = file.isFile,
          modifyTime = file.lastModified()
        )
      }
    } else {
      Array.empty[FileInfo]
    }
  }

  /** Sanitizes the file paths.
    *
    * @param path
    *   The file path.
    * @return
    *   The sanitized file path.
    */
  private def sanitize(path: String): String = {
    // Java File API does not support URIs
    path.stripPrefix("file://")
  }
}
