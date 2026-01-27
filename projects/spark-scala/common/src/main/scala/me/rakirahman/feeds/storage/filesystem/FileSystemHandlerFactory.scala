package me.rakirahman.feeds.storage.filesystem

import me.rakirahman.config.EnvironmentConfiguration
import me.rakirahman.feeds.storage.filesystem.local.LocalFileSystemHandler
import me.rakirahman.feeds.storage.filesystem.fabric.FabricFileSystemHandler

/** Factory for creating instances of environment specific file system handlers.
  */
object FileSystemHandlerFactory {

  /** Creates a new filesystem handler.
    *
    * @param envConfig
    *   The environment configuration.
    * @return
    *   A new filesystem handler for the environment.
    */
  def createEnvironmentSpecificHandler(
      envConfig: EnvironmentConfiguration
  ): FileSystemHandler = {
    if (envConfig.LocalSpark) {
      LocalFileSystemHandler
    } else {
      FabricFileSystemHandler
    }
  }
}
