package me.rakirahman.reddit

import me.rakirahman.config.EnvironmentConfiguration
import me.rakirahman.feeds.storage.filesystem.FileSystemHandlerFactory

import org.apache.spark.internal.Logging

import scala.util.{Failure, Success, Try}

/** Loads the Reddit cookie envelope from disk (or OneLake in Fabric) using the environment-specific [[me.rakirahman.feeds.storage.filesystem.FileSystemHandler]], so the same Scala code works locally and inside Fabric notebooks.
  *
  * @param envConfig
  *   Drives the local-vs-Fabric file system selection.
  */
class RedditTokenLoader(envConfig: EnvironmentConfiguration) extends Logging {

  private val fileSystemHandler =
    FileSystemHandlerFactory.createEnvironmentSpecificHandler(envConfig)

  /** Read + parse the envelope, surfacing typed failures so callers can opt into graceful exits.
    *
    * @param path
    *   The path to the envelope (e.g. `/.../reddit.token` locally, `Files/onelake/secrets/reddit.token` in Fabric).
    * @param nowEpochSeconds
    *   The reference clock for expiry checks (injected for testability).
    */
  def load(
      path: String,
      nowEpochSeconds: Long = System.currentTimeMillis() / 1000L
  ): Either[RedditTokenLoadFailure, RedditTokenEnvelope] = {
    if (!fileSystemHandler.exists(path)) {
      Left(RedditTokenLoadFailure.MissingFile(s"Reddit token file not found at: $path"))
    } else {
      Try(fileSystemHandler.read(path)) match {
        case Failure(ex) =>
          Left(RedditTokenLoadFailure.Malformed(s"Failed to read token file at $path: ${ex.getMessage}"))
        case Success(raw) =>
          RedditTokenEnvelope.parse(raw.trim) match {
            case Right(envelope) if envelope.isExpired(nowEpochSeconds) =>
              val ago = -envelope.secondsRemaining(nowEpochSeconds)
              Left(RedditTokenLoadFailure.Expired(s"Reddit token at $path expired ${ago}s ago", envelope))
            case other => other
          }
      }
    }
  }
}

/** Companion factory.
  */
object RedditTokenLoader {

  /** Constructor.
    *
    * @param envConfig
    *   Drives the local-vs-Fabric file system selection.
    */
  def apply(envConfig: EnvironmentConfiguration): RedditTokenLoader =
    new RedditTokenLoader(envConfig)
}
