package me.rakirahman.config

/** Optional runtime system properties to be used throughout all projects.
  */
object RuntimeAccessibleSystemProperties {

  /** Caller specified prefix to use when generating a random string
    */
  val PropRandomStringPrefix = "RANDOM_STRING_PREFIX"

  /** A system property set by SBT when running tests.
    */
  val PropSbtTestName = "test.name"
}
