package me.rakirahman.feeds.storage.filesystem

/** Information about a file in the filesystem.
  *
  * @param name
  *   The name of the file.
  * @param path
  *   The path to the file.
  * @param size
  *   The size of the file in bytes.
  * @param isDir
  *   A boolean indicating if the file is a directory.
  * @param isFile
  *   A boolean indicating if the file is a regular file.
  * @param modifyTime
  *   The last modification time of the file in milliseconds since the epoch.
  */
case class FileInfo(
    name: String,
    path: String,
    size: Long,
    isDir: Boolean,
    isFile: Boolean,
    modifyTime: Long
) {}
