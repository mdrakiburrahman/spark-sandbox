# HTTP Dumper Plugin

Dumps HTTP Payloads into Driver by sending it via RPC from the Executor.

```bash
rm -f /workspaces/spark-sandbox/projects/spark-scala/.temp/openlineage/lineage.json
mkdir -p /workspaces/spark-sandbox/projects/spark-scala/.temp/openlineage

/opt/spark/bin/spark-sql \
    --packages io.delta:delta-spark_2.12:3.2.0 \
    --conf "spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension" \
    --conf "spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog" \
    --conf "spark.hadoop.hive.cli.print.header=true" \
    --conf "spark.sql.repl.eagerEval.maxNumRows=2147483647" \
    --conf "spark.sql.repl.eagerEval.truncate=0" \
     -e "SELECT request_body FROM data_ops_inventory_db.http_dumper_plugin" --silent 2>/dev/null | grep -v -E '^$|^::|^request_body$' > /workspaces/spark-sandbox/projects/spark-scala/.temp/openlineage/lineage-from-spark-custom-plugin.json
```

---

[All plugins](../README.md)
