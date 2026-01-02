# Spark Plugins 🔌

Spark plugins are an extremely powerful concept that allows us to run arbitrary code across the cluster and establish synchronous RPC communication.

This folder contains the following Spark Plugins that are used in Production, and also a few demos to illustrate the concept.

- [Demo - Uncaching Driver Plugin: REST API that uncaches a temp table](uncachingplugin/README.md)

To learn more:

- [Spark Advanced Instrumentation](https://spark.apache.org/docs/latest/monitoring.html#advanced-instrumentation)
- [A great set of blogs on Spark Plugins](https://blog.madhukaraphatak.in/categories/spark-plugin/)
  - [Code examples the blog](https://github.com/phatak-dev/spark-3.0-examples/tree/master/src/main/scala/com/madhukaraphatak/spark/core/plugins)
- [Another great set of code examples](https://github.com/cerndb/SparkPlugins/tree/master)
- [Plugins across GitHub](https://github.com/search?q=%22extends+SparkPlugin%22+language%3AScala&type=code&l=Scala)
