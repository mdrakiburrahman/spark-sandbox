# HTTP Dumper Plugin

Dumps HTTP Payloads into Driver by sending it via RPC from the Executor. On shutdown, the driver plugin automatically flushes all buffered request bodies to a JSONL file on disk.

## Configuration

| Key                               | Default            | Description                                  |
| --------------------------------- | ------------------ | -------------------------------------------- |
| `spark.plugin.conf.json.location` | `/tmp/openlineage` | Directory path where JSONL files are written |
| `spark.plugin.conf.executor.port` | `9003`             | Port for the executor HTTP server            |

## Output

On plugin shutdown, a file `{location}/{uuid}.json` is created containing one JSON line per captured HTTP request body.

---

[All plugins](../README.md)
