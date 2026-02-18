package me.rakirahman.metastore

/** Trait representing operations for managing SQL databases.
  */
trait DatabaseOperations {

  /** Checks if a database with the specified name exists.
    *
    * @param databaseName
    *   The name of the database to check.
    * @return
    *   `true` if the database exists, `false` otherwise.
    */
  def databaseExists(databaseName: String): Boolean

  /** Retrieves the list of databases.
    *
    * @return
    *   An array of strings representing the names of the databases.
    */
  def listDatabases(): Array[String]

  /** Retrieves the list of user databases.
    *
    * @return
    *   An array of strings representing the names of the user databases.
    */
  def listUserDatabases(): Array[String]

  /** Creates a new database with the specified name.
    *
    * @param databaseName
    *   The name of the database to create.
    */
  def createDatabase(databaseName: String): Unit

  /** Drops a database with the specified name.
    *
    * @param databaseName
    *   The name of the database to drop.
    */
  def dropDatabase(databaseName: String): Unit
}
