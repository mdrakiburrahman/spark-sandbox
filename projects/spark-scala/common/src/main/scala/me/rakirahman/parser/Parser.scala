package me.rakirahman.parser

/** An interface for string parsing operations.
  */
trait Parser {

  /** Parses the given string and returns a map representation.
    *
    * @param payload
    *   The payload to be parsed.
    * @return
    *   A java.util.Map[String, Any] representing the parsed map.
    */
  def loadMap(payload: String): java.util.Map[String, Any]

  /** Loads and returns an instance of the specified class.
    *
    * @param payload
    *   The payload to be parsed.
    * @param generic
    *   The generic class to be loaded.
    * @param allowCaseInsensitivePropertiesInPayload
    *   A boolean value indicating whether the payload properties should be treated with case-insensitivity when comparing to the class.
    * @param allowForeignPropertiesInPayload
    *   A boolean value indicating whether the payload properties can contain foreign properties not defined in the class.
    * @return
    *   An instance of the loaded class.
    * @throws Exception
    *   If the class cannot be found.
    */
  def loadClass[T >: Null](
      payload: String,
      generic: Class[T],
      allowCaseInsensitivePropertiesInPayload: Boolean,
      allowForeignPropertiesInPayload: Boolean
  ): T
}
