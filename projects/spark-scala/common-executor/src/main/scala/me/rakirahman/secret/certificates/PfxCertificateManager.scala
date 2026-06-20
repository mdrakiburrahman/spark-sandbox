package me.rakirahman.secret.certificates

import java.nio.file.{Files, Paths}

/** Performs PFX certificate management operations for the SNI credential flow.
  */
trait PfxCertificateManager {

  /** Generates a random password for a PFX certificate.
    *
    * @return
    *   The generated password as a string.
    */
  def generatePfxPassword(): String =
    java.util.UUID.randomUUID().toString.replace("-", "")

  /** Writes a Base64 encoded PFX certificate into a temporary local file path.
    *
    * @param certBase64EncodedPayload
    *   The base64-encoded payload of the PFX certificate.
    * @return
    *   The temporary local file path of the certificate.
    */
  def writeToLocalPath(certBase64EncodedPayload: String): String = {
    val tempCertFileName = s"${java.util.UUID.randomUUID().toString}.pfx"
    val tempCertFilePath =
      Paths.get(System.getProperty("java.io.tmpdir"), tempCertFileName)
    Files.write(
      tempCertFilePath,
      java.util.Base64.getDecoder.decode(certBase64EncodedPayload)
    )
    tempCertFilePath.toString
  }

  /** Converts an unprotected PFX certificate into a base64 string representation with password protection.
    *
    * @param certBase64EncodedPayload
    *   The base64-encoded payload of the PFX certificate.
    * @param certPassword
    *   The password for the PFX certificate.
    * @return
    *   The base64 string representation of the converted password-protected certificate.
    */
  def convertToPfxWithPassword(
      certBase64EncodedPayload: String,
      certPassword: String
  ): String
}
