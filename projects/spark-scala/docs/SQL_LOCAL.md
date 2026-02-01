# 🔍 Querying SQL locally

[[_TOC_]]

## Hive Metastore

A metastore is what you interact when you talk to a Database. It stores schema information.

Spark by default comes with a transient in-memory metastore that's gone as soon as you turn off that Spark Session/Scala Job. This makes it difficult to chain
different Spark Sessions together for local development of Fabric Jobs that run off one another's output. To support concurrent Spark Sessions, we use a [MSSQL Server](https://www.microsoft.com/en-us/sql-server/)-backed Hive Metastore
running in Docker (2025-latest), which supports multiple concurrent connections.

> It's recommended to use the in-memory Metastore for tests, [see here](https://issues.apache.org/jira/browse/SPARK-4758)
> So we keep this off for tests.


## SQL CLI

> See [SQL CLI docs](https://spark.apache.org/docs/latest/sql-distributed-sql-engine-spark-sql-cli.html) for full capabilities

See all databases, notice you cannot run this when Spark Session is active:

```bash
/opt/spark/bin/spark-sql -e 'SET hive.cli.print.header=true; SHOW DATABASES;'
```

If you want to query Delta Lake via `spark-sql` - [see](https://docs.delta.io/latest/quick-start.html#spark-sql-shell):

```bash
/opt/spark/bin/spark-sql \
    --packages io.delta:delta-spark_2.12:3.2.0 \
    --conf "spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension" \
    --conf "spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog" \
    --conf "spark.hadoop.hive.cli.print.header=true"
```

## spark-shell

You can also pretty print the result in `spark-shell` interactively:

```bash
/opt/spark/bin/spark-shell \
    --packages io.delta:delta-spark_2.12:3.2.0 \
    --conf "spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension" \
    --conf "spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog"
```

And then run:

```scala
spark.sql("SELECT * FROM demo_etl.foo LIMIT 20;").show(truncate = false)
```

If you're evaluating complex commands, `spark-shell` supports `:paste` mode, via [Scala REPL](https://docs.scala-lang.org/overviews/repl/overview.html).

```shell
scala> :paste
// Entering paste mode (ctrl-D to finish)

val dfCast = spark.sql("SELECT ...")
            .withColumn(...)
            ...

// Exiting paste mode, now interpreting.
```

---

[Home](../README.md) > [Documentation](./README.md) > [Querying SQL locally](./SQL_LOCAL.md)
