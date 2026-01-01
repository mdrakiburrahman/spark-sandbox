logLevel := Level.Warn

// Builds über-JARs: https://github.com/sbt/sbt-assembly
addSbtPlugin("com.eed3si9n" % "sbt-assembly" % "2.1.5")

// Formatter: https://scalameta.org/scalafmt
//
// >>> https://index.scala-lang.org/scalameta/sbt-scalafmt/artifacts/sbt-scalafmt
// >>> https://github.com/scalameta/scalafmt/blob/master/docs/installation.md#sbt
// >>> https://github.com/scalameta/sbt-scalafmt/releases
//
addSbtPlugin("org.scalameta" % "sbt-scalafmt" % "2.5.2")

// Dependency tree:
//
// >>> https://www.baeldung.com/scala/sbt-dependency-tree
// >>> https://github.com/sbt/sbt-dependency-graph#main-tasks
//
addDependencyTreePlugin
