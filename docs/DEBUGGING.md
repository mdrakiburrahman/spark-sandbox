# 🐞 Debugging

- [Scala](#scala)
  - [Metals import](#metals-import)

## Scala

### Metals import

First and most importantly (❗), open VSCode within the `spark.code-workspace`:

![Workspace view](../.imgs/vscode-workspace.png)

> If you don't open in the Workspace view, you'll run into weird pathing issues.

Note that Metals path is case sensitive, these 2 things are NOT equal:

```bash
/workspaces/spark-sandbox/projects/spark-scala/projectB/src/main/scala/Main.scala
/workspaces/spark-sandbox/projects/spark-scala/projectb/src/main/scala/Main.scala
                                                          ^
```

If your project name is `projectA`, ensure it's stored in `spark-scala/projectA` as well.

Clean any `sbt` based builds, as they aren't debuggable, run `sbt clean`.

From metals, run `Clean compile` > `Import Build` to generate a clean debuggable build (uses [Bloop](https://scalacenter.github.io/bloop/)).

Once the build completes, you'll see an outline of your file:

![Build Completed](../.imgs/metals-build-completed.png)

### Spark Submitted Jobs using Java Debug Wire Protocol

[reference](https://sparkbyexamples.com/spark/how-to-debug-spark-application-locally-or-remote/)

We use `nx run spark-submit:run --JOB=<alias>` to invoke the [`spark-submit` CLI](../projects/spark-submit/README.md),
which submits Jobs into your Devcontainer Spark Cluster to run in a distributed setup
(identical to what happens in the cloud).

Debugging this is possible via the [Java Debug Wire Protocol (JDWP)](https://en.wikipedia.org/wiki/Java_Debug_Wire_Protocol) - that connects
the `.jar` to your source code that built it.

To debug a `spark-submit`tted job, set `SPARK_SUBMIT_OPTS` in your shell before
invoking the CLI — `JobExecutor` inherits the parent process environment:

```bash
export SPARK_SUBMIT_OPTS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005"
nx run spark-submit:run --JOB=demo-plugin --no-dag
```

Alternatively, add the option to the job's `sparkConfigSets` entry (under
`spark.driver.extraJavaOptions`) in `projects/spark-submit/config/spark-jobs.yaml` for
an always-on attach.

Place your debugger wherever you want to pause:

![Place debugger](../.imgs/spark-submit-debug-place.png)

Fire the nx target (e.g. `nx run spark-submit:run --JOB=demo-plugin`).

Spark will stop and listen on the port:

![Spark hold](../.imgs/spark-submit-jdwp-hold.png)

Attach your VSCode to the debugger port:

![Attach VSCode](../.imgs/spark-submit-jdwp-attach.png)

Debug away:

![Debug](../.imgs/spark-submit-jdwp-debug.png)

---

[Home](../README.md) > [Documentation](./README.md) > [Debugging](./DEBUGGING.md)
