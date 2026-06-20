package me.rakirahman.secret.handlers

/** Trait representing a secret handler.
  */
trait SecretHandler {

  /** Retrieves the secret value associated with the given key.
    *
    * @param key
    *   The key of the secret.
    * @return
    *   The secret value.
    */
  def getSecret(key: String): String

  /** Retrieves the secret value associated with the given key and decodes it from Base64.
    *
    * @param key
    *   The key of the secret.
    * @return
    *   The decoded secret value.
    */
  def getBase64DecodedSecret(key: String): String = {
    val secret = getSecret(key)
    new String(java.util.Base64.getDecoder.decode(secret), "UTF-8")
  }
}
