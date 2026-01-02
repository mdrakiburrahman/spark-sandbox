package me.rakirahman.parser.yaml

import me.rakirahman.parser.Parser
import java.util.logging.{Logger, Level}
import org.yaml.snakeyaml.constructor.Constructor
import org.yaml.snakeyaml.DumperOptions
import org.yaml.snakeyaml.error.YAMLException
import org.yaml.snakeyaml.introspector.{Property, PropertyUtils, MissingProperty}
import org.yaml.snakeyaml.LoaderOptions
import org.yaml.snakeyaml.representer.Representer
import org.yaml.snakeyaml.Yaml

/** A custom implementation of [[PropertyUtils]] that provides case-insensitive property lookup.
  *
  * @see
  *   PropertyUtils
  */
class CaseInsensitivePropertyUtils extends PropertyUtils {
  override def getProperty(c: Class[_], name: String): Property = {
    val properties = getProperties(c)
    val property = properties
      .stream()
      .filter(p => p.getName.equalsIgnoreCase(name))
      .findFirst()
      .orElse(null)

    if (property == null && isSkipMissingProperties()) {
      new MissingProperty(name)
    } else if (property == null) {
      throw new YAMLException(s"Unable to find property '$name' on class: ${c.getName}")
    } else {
      property
    }
  }
}

/** Parses YAML-formatted string content.
  */
object YamlParser extends Parser {

  /** @inheritdoc
    */
  def loadMap(payload: String): java.util.Map[String, Any] = new Yaml().load(payload).asInstanceOf[java.util.Map[String, Any]]

  /** @inheritdoc
    */
  def loadClass[T >: Null](
      s: String,
      c: Class[T],
      allowCaseInsensitivePropertiesInPayload: Boolean = true,
      allowForeignPropertiesInPayload: Boolean = true
  ): T = {
    try {

      val customRepresenter = new Representer(new DumperOptions())

      if (allowCaseInsensitivePropertiesInPayload) {
        customRepresenter.setPropertyUtils(new CaseInsensitivePropertyUtils())
      }

      if (allowForeignPropertiesInPayload) {
        customRepresenter.getPropertyUtils().setSkipMissingProperties(true)
      }

      new Yaml(new Constructor(c, new LoaderOptions()), customRepresenter)
        .load(s)
        .asInstanceOf[T]

    } catch {
      case e: Exception => {
        Logger.getGlobal.log(Level.SEVERE, s"Failed to read ${s}!", e)
        throw e
      }
    }
  }
}
