<!-- PROJECT LOGO -->
<p align="center">
  <img src="https://cdn-icons-png.flaticon.com/512/6132/6132220.png" alt="Logo" width="30%">
  <h3 align="center">Spark - Scala</h3>
  <p align="center">
    Orchestrating Stream and Batch Processing in Scala.
    <br />
    <br />
    <a href="https://spark.apache.org/">Spark Docs</a>
    ·
    <a href="https://github.com/apache/spark">Spark Source Code</a>
    ·
    <a href="https://learn.microsoft.com/en-us/azure/synapse-analytics/spark/apache-spark-overview">Synapse Spark Docs</a>
    ·
    <a href="https://learn.microsoft.com/en-us/fabric/data-engineering/runtime">Fabric Spark Docs</a>
  </p>
</p>

---

<div align="center">

• [PREREQUISITES](#📋-prerequisites)
• [DOCUMENTATION](#📚-documentation)

</div>

## 📋 Prerequisites

Before you begin, ensure you are reading this from inside the VSCode devcontainer. If you haven't done so, please [bootstrap your devbox first](../../README.md).

Open this folder you're currently in using the [spark.code-workspace](spark.code-workspace) to flatten the folder structure for [metals](https://scalameta.org/metals/) - a Scala Language Server; and click the metals extension (`m` icon) on the bottom left, to `Import build`, and get full intellisense:

![Import build](.imgs/metals-import-small.png)

To build and run the spark jobs, use the [`spark-submit`](../spark-submit/README.md) CLI/UI — e.g. `npx nx run spark-submit:run --JOB=demo-etl` for a single job, `npx nx run spark-submit:run --JOB=all` for the full DAG, or `npx nx run spark-submit:run-ui` for the visual DAG explorer. Aliases are defined in [`projects/spark-submit/config/spark-jobs.yaml`](../spark-submit/config/spark-jobs.yaml).

## 📚 Documentation

Explore the [documentation root](../../docs/README.md) for deep-dive into design and processes.
