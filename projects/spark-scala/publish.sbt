/*
 * Sbt-based publish definition for Spark Jobs.
 *
 * 1. The spark-submitted JAR version is static (0.1.0) to allow for published
 *    JAR file overrides into Synapse during EV2 upload, without sophisticated
 *    ARM template parsing logic to parse git commits.
 *
 *    Also, this means we don't have to change the Synapse git committed ARM
 *    template with the new JAR version every time - which becomes specially
 *    difficult/impossible when you're running GCI and don't know what the post
 *    merge commit will be.
 *
 * 2. Synapse workspace packages must be unique, so we use the git commit
 *    version.
 *
 *    This is fine, because Spark Pool workspace upload is not captured in
 *    Synapse git committed ARM templates, but rather, done via regular,
 *    non-Synapse ARM template/Bicep/Raw API calls.
 *
 */

import sys.process._
import Version._

/* ┌─────────┐
 * │ VERSION │
 * └─────────┘
 */

ThisBuild / organization := "me.rakirahman"
ThisBuild / version := "0.1.0"
ThisBuild / commitVersion := Version.generateCommitVersion()
ThisBuild / publishMavenStyle := true
ThisBuild / description := "Apache Spark Data Processing Project"
