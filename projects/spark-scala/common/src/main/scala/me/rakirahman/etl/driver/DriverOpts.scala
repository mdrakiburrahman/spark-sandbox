package me.rakirahman.etl.driver

/** Trait representing driver options.
  */
trait DriverOpts {

  /** Checks if the driver options are valid.
    *
    * @return
    *   true if the driver options are valid, false otherwise.
    */
  def isValid: Boolean

  /** Validates the driver options.
    *
    * @throws AssertionError
    *   if the driver options are invalid.
    */
  def validate: Unit =
    assert(isValid, s"One or more invalid driver options provided")
}
