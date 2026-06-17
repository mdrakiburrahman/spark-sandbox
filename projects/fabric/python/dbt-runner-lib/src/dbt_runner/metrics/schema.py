"""The Arrow schema for the ``dbt_node_executions`` metrics table.

Kept byte-for-byte identical across local and Fabric runs so both produce the
same rows — only the Delta sink path differs.
"""

from __future__ import annotations

import pyarrow as pa

PA_SCHEMA = pa.schema(
    [
        ("project", pa.string()),
        ("command", pa.string()),
        ("invocation_id", pa.string()),
        ("dbt_version", pa.string()),
        ("generated_at", pa.timestamp("us", tz="UTC")),
        ("unique_id", pa.string()),
        ("resource_type", pa.string()),
        ("package_name", pa.string()),
        ("name", pa.string()),
        ("alias", pa.string()),
        ("database", pa.string()),
        ("schema_name", pa.string()),
        ("relation_name", pa.string()),
        ("original_file_path", pa.string()),
        ("materialized", pa.string()),
        ("execution_time", pa.float64()),
        ("compile_started_at", pa.timestamp("us", tz="UTC")),
        ("compile_completed_at", pa.timestamp("us", tz="UTC")),
        ("compile_time", pa.float64()),
        ("execute_started_at", pa.timestamp("us", tz="UTC")),
        ("execute_completed_at", pa.timestamp("us", tz="UTC")),
        ("execute_time", pa.float64()),
        ("thread_id", pa.string()),
        ("status", pa.string()),
        ("rows_affected", pa.int64()),
        ("failures", pa.int64()),
        ("message", pa.string()),
        ("tags", pa.list_(pa.string())),
        ("depends_on_nodes", pa.list_(pa.string())),
        ("adapter_response_json", pa.string()),
        ("config_json", pa.string()),
        ("test_metadata_json", pa.string()),
        ("raw_json", pa.string()),
        ("event_year_month", pa.string()),
    ]
)
