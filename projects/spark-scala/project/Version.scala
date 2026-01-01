import sbt._
import scala.sys.process._

/* ┌────────────┐
 * │ VERSIONING │
 * └────────────┘
 */
object Version {

  /** A custom key for versioning based on git commit.
    */
  val commitVersion = settingKey[String]("Version for commonExecutor")

  /** Retrieves the Git commit based version of the project.
    *
    * @return
    *   The Git commit version of the project in the format: branchName_commitId
    */
  def generateCommitVersion(): String = {
    val branchNameProc = "git rev-parse --abbrev-ref HEAD".!!
    val branchName = branchNameProc.trim.replaceAll("\\W", "_")

    val commitIdProc = "git rev-parse --short HEAD".!!
    val commitId = commitIdProc.trim.replaceAll("\\W", "_")

    s"${branchName}_${commitId}"
  }

}
