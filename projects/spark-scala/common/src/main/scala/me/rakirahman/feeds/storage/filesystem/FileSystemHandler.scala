package me.rakirahman.feeds.storage.filesystem

/** Trait for handling file system operations.
  */
// @formatter:off
trait FileSystemHandler {

  /** Removes a file or directory
    *
    * @param dir
    *   FileSystem URI for a single file or a directory
    * @param recurse
    *   if true, all files and directories will be recursively deleted
    * @return
    *   if the file or directory was present and is now deleted
    */
  def rm(dir: String, recurse: Boolean = false): Boolean

  /** Reads the given file as a String encoded in UTF-8
    *
    * @param file
    *   FileSystem URI
    * @return
    *   String containing contents of the file.
    */
  def read(file: String): String

  /** Writes the given String out to a file, encoded in UTF-8
    * @param file
    *   FileSystem URI
    * @param contents
    *   Content of file to write, encoded in System default charset
    * @param overwrite
    *   If set to true, the file will be overwritten if it existed already
    * @return
    *   true if successfully write content to file
    */
  def put(file: String, contents: String, overwrite: Boolean = false): Boolean

  /** Append the given String to a file, encoded in UTF-8
    *
    * @param file
    *   FileSystem URI
    * @param content
    *   Content needs to be append to file, encoded in System default charset
    * @param createFile
    *   if set to true, will firstly try to create file if not exists
    * @return
    */
  def append(file: String, content: String, createFile: Boolean = false): Boolean

  /** Checks if the given file exists
    *
    * @param file
    *   FileSystem URI
    * @return
    *   [[true]] if the file exists, [[false]] otherwise.
    */
  def exists(file: String): Boolean

  /** Creates the given directory if it does not exist, also creating any
    * necessary parent directories
    *
    * @param dir
    *   FileSystem URI
    * @return
    *   true if the directory was successfully created
    */
  def mkdirs(dir: String): Boolean

  /** Copies a file or directory.
    *
    * @param from
    *   FileSystem URI of the source file or directory
    * @param to
    *   FileSystem URI of the destination file or directory
    * @param recurse
    *   if true, all files and directories will be recursively copied
    * @return
    *   true if all files were successfully copied
    */
  def cp(from: String, to: String, recurse: Boolean = false): Boolean

  /** Moves a file or directory, possibly across FileSystems.
    *
    * @param from
    *   FileSystem URI of the source file or directory
    * @param to
    *   FileSystem URI of the destination file or directory
    * @param createPath
    *   if true, will firstly create the parent dir if not exists before move op
    * @param overwrite
    *   if true, will overwrite the destination folder if exists
    * @return
    *   true if the move was successful
    */
  def mv(from: String, to: String, createPath: Boolean = false, overwrite: Boolean = false): Boolean

  /** Lists the contents of a directory
    * @param dir
    *   FileSystem URI
    * @return
    *   List of FileInfo containing the name and size of each file
    */
  def ls(dir: String): Array[FileInfo]
}
// @formatter:on
