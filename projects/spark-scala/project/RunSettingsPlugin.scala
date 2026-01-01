import sbt._
import Keys._

/* ┌──────────────────┐
 * │ RUNTIME SETTINGS │
 * └──────────────────┘
 */

/** An AutoPlugin that provides run settings for a project.
  */
object RunSettingsPlugin extends AutoPlugin {

  /** Specifies that this plugin should be triggered automatically for all
    * requirements.
    */
  override def trigger: PluginTrigger = allRequirements

  /** Defines the settings that this plugin provides.
    */
  object autoImport {
    lazy val runSettings: Seq[Setting[_]] = Seq(
      Compile / run := Defaults
        .runTask(
          Compile / fullClasspath,
          Compile / run / mainClass,
          Compile / run / runner
        )
        .evaluated,
      Compile / runMain := Defaults
        .runMainTask(Compile / fullClasspath, Compile / run / runner)
        .evaluated
    )
  }

  import autoImport._

  /** Returns the settings provided by this plugin.
    */
  override def projectSettings: Seq[Setting[_]] = runSettings
}
