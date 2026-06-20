package me.rakirahman.secret.certificates

import scala.sys.process.{Process, ProcessLogger}

/** [[PfxCertificateManager]] implementation that shells out to `openssl` to convert a password-less PKCS12 (as returned by Key Vault for an exportable certificate) into a password-protected PFX that `ClientCertificateCredential` can load.
  */
class OpenSSLCertificateManager extends PfxCertificateManager {

  /** @inheritdoc
    */
  // @formatter:off
  override def convertToPfxWithPassword(
      certBase64EncodedPayload: String,
      certPassword: String
  ): String = {
    val stdErr = new StringBuilder
    val processLogger = ProcessLogger(_ => (), stdErr append _)

    try {
      val pipeline =
        Process(Seq("echo", certBase64EncodedPayload)) #|
          Process(Seq("base64", "--decode")) #|
          Process(Seq("openssl", "pkcs12", "-nodes", "-passin", "pass:")) #|
          Process(Seq("openssl", "pkcs12", "-export", "-passout", s"pass:$certPassword")) #|
          Process(Seq("base64", "-w", "0"))

      pipeline.!!(processLogger).trim

    } catch {
      case ex: Exception =>
        throw new RuntimeException(
          s"OpenSSL conversion of PKCS12 (PFX) certificate failed.\n${stdErr.toString()}\n",
          ex
        )
    }
  }
  // @formatter:on
}

/* Companion object for OpenSSLCertificateManager.
 */
object OpenSSLCertificateManager {

  /** Constructor.
    *
    * @return
    *   A new instance of OpenSSLCertificateManager.
    */
  def apply(): OpenSSLCertificateManager = new OpenSSLCertificateManager()
}
