package me.rakirahman.feeds.storage.filesystem.fabric

// @formatter:off
import me.rakirahman.feeds.storage.filesystem.{FileInfo, FileSystemHandler}
import com.microsoft.spark.notebook.msutils.MSFileInfo
import mssparkutils.fs
// @formatter:on

/** An Azure Synapse/Fabric filesystem handler.
  */
// @formatter:off
object FabricFileSystemHandler extends FileSystemHandler {

  /** @inheritdoc
    */
  override def rm(dir: String, recurse: Boolean = false): Boolean = fs.rm(dir, recurse)

  /** @inheritdoc
    */
  override def read(file: String): String = fs.head(file)

  /** @inheritdoc
    */
  override def put(file: String, contents: String, overwrite: Boolean = false): Boolean = fs.put(file, contents, overwrite)

  /** @inheritdoc
    */
  override def append(file: String, content: String, createFile: Boolean = false): Boolean = fs.append(file, content, createFile)

  /** @inheritdoc
    */
  override def exists(file: String): Boolean = fs.exists(file)

  /** @inheritdoc
    */
  override def mkdirs(dir: String): Boolean = fs.mkdirs(dir)

  /** @inheritdoc
    */
  override def cp(from: String, to: String, recurse: Boolean = false): Boolean = fs.cp(from, to, recurse)

  /** @inheritdoc
    */
  override def mv(from: String, to: String, createPath: Boolean = false, overwrite: Boolean = false): Boolean = fs.mv(from, to, createPath, overwrite)

  /** @inheritdoc
    */
  override def ls(dir: String): Array[FileInfo] = fs.ls(dir).map { f => FileInfo(f.name, f.path, f.size, f.isDir, f.isFile, f.modifyTime) }
}
// @formatter:on
