package me.rakirahman.parser.json

import me.rakirahman.parser.Parser
import java.util.logging.{Logger, Level}
import org.json4s.jackson.JsonMethods
import org.json4s.jackson.Serialization
import scala.collection.JavaConverters._

/** Parses JSON-formatted string content.
  */
object JsonParser extends Parser {

  implicit val formats = org.json4s.DefaultFormats

  /** @inheritdoc
    */
  override def loadMap(payload: String): java.util.Map[String, Any] = {
    try {
      val json = JsonMethods.parse(payload)
      json.values.asInstanceOf[Map[String, Any]].asJava
    } catch {
      case e: Exception =>
        Logger.getGlobal.log(Level.SEVERE, s"Failed to parse JSON: $payload", e)
        throw e
    }
  }

  /** @inheritdoc
    */
  override def loadClass[T >: Null](
      payload: String,
      generic: Class[T],
      allowCaseInsensitivePropertiesInPayload: Boolean = false,
      allowForeignPropertiesInPayload: Boolean = true
  ): T = {
    if (allowCaseInsensitivePropertiesInPayload || !allowForeignPropertiesInPayload) {
      throw new UnsupportedOperationException(
        "Case insensitive properties are not supported, and foreign properties are always ignored in this current json4s implementation."
      )
    }

    try {
      Serialization.read[T](payload)(formats, Manifest.classType(generic))
    } catch {
      case e: Exception =>
        Logger.getGlobal.log(Level.SEVERE, s"Failed to read $payload!", e)
        throw e
    }
  }
}
