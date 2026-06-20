package me.rakirahman.secret.entra.credential.providers.secure

import com.azure.core.credential.TokenCredential
import com.azure.core.http.HttpClient
import com.azure.identity.ClientCertificateCredentialBuilder
import me.rakirahman.secret.certificates.PfxCertificateManager
import me.rakirahman.secret.entra.credential.providers.TokenCredentialProvider

// @formatter:off
/** Distributes Subject Name and Issuer (SNI) credentials for Service Principals.
  *
  * SNI is an approved form of authentication for Service Principals as a secured workaround
  * for lack of full-scope Managed Identity support on several Azure PaaS Services:
  *
  * >>> https://identitydivision.visualstudio.com/IdentityWiki/_wiki/wikis/IdentityWiki.wiki/59891/Subject-Name-and-Issuer-Authentication
  *
  * A password is required due to how ClientCertificateCredentialBuilder is implemented by
  * com.azure.identity; this can be temporarily generated.
  *
  * @param httpClient
  *   The HTTP client.
  * @param certificateLocalPath
  *   The local path to the PFX certificate.
  * @param certificatePassword
  *   The password for the PFX certificate.
  */
// @formatter:on
class SpnSNICredentialProvider(
    httpClient: HttpClient,
    certificateLocalPath: String,
    certificatePassword: String
) extends TokenCredentialProvider {

  /** @inheritdoc
    */
  override def getTokenCredential(
      tenantId: String,
      clientId: String
  ): TokenCredential = new ClientCertificateCredentialBuilder()
    .additionallyAllowedTenants("*")
    .tenantId(tenantId)
    .clientId(clientId)
    .sendCertificateChain(true)
    .pfxCertificate(certificateLocalPath, certificatePassword)
    .httpClient(httpClient)
    .build()
}

/* Companion object for SpnSNICredentialProvider.
 */
object SpnSNICredentialProvider {

  /** Constructor.
    *
    * @param httpClient
    *   The HTTP client.
    * @param certManager
    *   A certificate manager used to materialize the PFX payload to a local path.
    * @param certPfxPayload
    *   The base64-encoded PFX certificate payload.
    * @param certPfxPassword
    *   The password for the PFX certificate.
    * @return
    *   A new instance of SpnSNICredentialProvider.
    */
  def apply(
      httpClient: HttpClient,
      certManager: PfxCertificateManager,
      certPfxPayload: String,
      certPfxPassword: String
  ): SpnSNICredentialProvider =
    new SpnSNICredentialProvider(
      httpClient,
      certManager.writeToLocalPath(certPfxPayload),
      certPfxPassword
    )
}
