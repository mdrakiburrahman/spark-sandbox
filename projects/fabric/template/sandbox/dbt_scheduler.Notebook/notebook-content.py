# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "jupyter",
# META     "jupyter_kernel_name": "python3.12"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "00000000-0000-0000-0000-000000000000",
# META       "default_lakehouse_name": "dbt_adventureworks_seed",
# META       "default_lakehouse_workspace_id": "00000000-0000-0000-0000-000000000000",
# META       "known_lakehouses": []
# META     }
# META   }
# META }

# CELL ********************

# MAGIC %%bash
# MAGIC rm -rf /tmp/dbt-fabric-bundle
# MAGIC tar -xzf /lakehouse/default/Files/onelake/pkgs/dbt-fabric-bundle.tar.gz -C /tmp
# MAGIC pip install -q --no-index --find-links=/tmp/dbt-fabric-bundle/wheels dbt-core dbt-fabricspark deltalake pyarrow

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# PARAMETERS CELL ********************

dbt_project_name = ""
full_refresh = "0"

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }

# CELL ********************

import yaml
import re
import notebookutils
import requests
import os
import json
import shutil
from datetime import datetime, timezone
import pyarrow as pa
from deltalake import write_deltalake
from dbt.cli.main import dbtRunner
from dbt.version import __version__ as DBT_VERSION
from dbt_common.events.event_manager_client import get_event_manager
from dbt_common.invocation import get_invocation_id

TARGET = "fabric-fabric"

os.environ["GIT_ROOT"] = "/tmp/dbt-fabric-bundle"
os.environ["DBT_LOG_PATH"] = f"/lakehouse/default/Files/onelake/logs/dbt/{dbt_project_name}"
os.makedirs(os.environ["DBT_LOG_PATH"], exist_ok=True)

metrics_buffer = []
INVOCATION_STARTED_AT = datetime.now(timezone.utc).replace(tzinfo=None)
DBT_METRICS_DELTA_PATH = os.environ.get(
    "DBT_METRICS_DELTA_PATH",
    "/lakehouse/default/Files/onelake/raw/dbt/dbt_node_executions",
)
DBT_METRICS_RAW_PATH = os.environ.get(
    "DBT_METRICS_RAW_PATH",
    f"/lakehouse/default/Files/onelake/metrics/dbt/{dbt_project_name}",
)

dbt_log_file = os.path.join(os.environ["DBT_LOG_PATH"], "dbt.log")
if os.path.exists(dbt_log_file):
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archived = os.path.join(os.environ["DBT_LOG_PATH"], f"dbt-archived-at-{ts}.log")
    os.rename(dbt_log_file, archived)
    print(f"Archived previous dbt.log to {archived}")

for _command in ("seed", "build"):
    try:
        _current = os.path.join(DBT_METRICS_RAW_PATH, f"run_results-{_command}.json")
        if os.path.exists(_current):
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            _archived = os.path.join(DBT_METRICS_RAW_PATH, f"run_results-{_command}-archived-at-{ts}.json")
            os.rename(_current, _archived)
            print(f"Archived previous run_results-{_command}.json to {_archived}")
    except Exception as e:
        print(f"Warning: failed to archive previous run_results-{_command}.json: {e}")


def resolve_env_var(yaml_value, env_key):
    """Return os.environ[env_key] if set, otherwise extract the default from a
    dbt ``{{ env_var('KEY', 'default') }}`` template string."""
    env_val = os.environ.get(env_key)
    if env_val:
        return env_val
    m = re.search(r"\{\{\s*env_var\s*\(\s*'[^']*'\s*,\s*'([^']*)'\s*\)\s*\}\}", yaml_value)
    if m:
        return m.group(1)
    return yaml_value


def close_livy_session(project):
    """Read session ID from project profile and close it."""
    try:
        profiles = yaml.safe_load(open(f"/tmp/dbt-fabric-bundle/projects/{project}/profiles.yml"))
        profile_name = next(iter(profiles))
        cfg = profiles[profile_name]["outputs"][TARGET]
        session_id = open(cfg["session_id_file"]).read().strip()

        workspace_id = resolve_env_var(cfg["workspaceid"], "FABRIC_WORKSPACE_ID")
        lakehouse_id = resolve_env_var(cfg["lakehouseid"], "FABRIC_LAKEHOUSE_ID")

        url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/lakehouses/{lakehouse_id}/livyApi/versions/2023-12-01/sessions/{session_id}"
        print(f"Deleting session {session_id}: {url}")
        r = requests.delete(url, headers={"Authorization": f"Bearer {notebookutils.credentials.getToken('pbi')}"})
        print(f"Delete session {session_id}: {r.status_code} {r.reason}")
    except Exception as e:
        print(f"Warning: failed to close Livy session for {project}: {e}")


def flush_dbt_logs():
    """Flush dbt file logger and fsync to persistent storage (OneLake/FUSE).

    cleanup_event_logger() clears loggers without flushing, so on a FUSE
    filesystem the RotatingFileHandler's buffered writes may never reach
    the backing store unless we explicitly flush + fsync.
    """
    try:
        get_event_manager().flush()
    except Exception:
        pass
    try:
        with open(dbt_log_file, "a") as f:
            os.fsync(f.fileno())
    except OSError:
        pass


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


def _safe_json(obj):
    """Serialize anything to a JSON string, never raising."""
    if obj is None:
        return None
    try:
        return json.dumps(obj, default=str)
    except Exception:
        try:
            return json.dumps(str(obj))
        except Exception:
            return None


def _seconds_between(start, end):
    if start is not None and end is not None:
        return (end - start).total_seconds()
    return None


def _normalize_node_result(project, command, r, generated_at, invocation_id):
    """Flatten a single dbtRunner node result into a PA_SCHEMA-shaped dict."""
    node = getattr(r, "node", None)
    cfg = getattr(node, "config", None)

    compile_started = compile_completed = execute_started = execute_completed = None
    for ti in getattr(r, "timing", None) or []:
        if ti.name == "compile":
            compile_started, compile_completed = ti.started_at, ti.completed_at
        elif ti.name == "execute":
            execute_started, execute_completed = ti.started_at, ti.completed_at

    adapter = getattr(r, "adapter_response", None) or {}
    rows_affected = adapter.get("rows_affected") if isinstance(adapter, dict) else None
    failures = getattr(r, "failures", None)

    depends_on = getattr(node, "depends_on", None)
    depends_on_nodes = list(getattr(depends_on, "nodes", None) or []) if depends_on is not None else []
    test_metadata = getattr(node, "test_metadata", None)

    part_dt = execute_completed or generated_at or INVOCATION_STARTED_AT

    return {
        "project": project,
        "command": command,
        "invocation_id": invocation_id,
        "dbt_version": DBT_VERSION,
        "generated_at": generated_at,
        "unique_id": getattr(node, "unique_id", None),
        "resource_type": str(getattr(node, "resource_type", "") or "") or None,
        "package_name": getattr(node, "package_name", None),
        "name": getattr(node, "name", None),
        "alias": getattr(node, "alias", None),
        "database": getattr(node, "database", None),
        "schema_name": getattr(node, "schema", None),
        "relation_name": getattr(node, "relation_name", None),
        "original_file_path": getattr(node, "original_file_path", None),
        "materialized": getattr(cfg, "materialized", None),
        "execution_time": getattr(r, "execution_time", None),
        "compile_started_at": compile_started,
        "compile_completed_at": compile_completed,
        "compile_time": _seconds_between(compile_started, compile_completed),
        "execute_started_at": execute_started,
        "execute_completed_at": execute_completed,
        "execute_time": _seconds_between(execute_started, execute_completed),
        "thread_id": getattr(r, "thread_id", None),
        "status": str(getattr(r, "status", "") or "") or None,
        "rows_affected": int(rows_affected) if isinstance(rows_affected, (int, float)) else None,
        "failures": int(failures) if failures is not None else None,
        "message": getattr(r, "message", None),
        "tags": list(getattr(node, "tags", None) or []),
        "depends_on_nodes": depends_on_nodes,
        "adapter_response_json": _safe_json(adapter),
        "config_json": _safe_json(cfg.to_dict() if hasattr(cfg, "to_dict") else cfg),
        "test_metadata_json": _safe_json(test_metadata.to_dict() if hasattr(test_metadata, "to_dict") else test_metadata),
        "raw_json": _safe_json(r.to_dict() if hasattr(r, "to_dict") else None),
        "event_year_month": part_dt.strftime("%Y%m") if part_dt is not None else None,
    }


def collect_node_metrics(project, command, result):
    """Append normalized node rows from a dbtRunner result to metrics_buffer.

    Never raises: deps/debug have no node results (no-op); errors are printed.
    """
    try:
        run_result = getattr(result, "result", None)
        results = getattr(run_result, "results", None)
        if not results:
            return
        generated_at = getattr(run_result, "generated_at", None)
        try:
            invocation_id = get_invocation_id()
        except Exception:
            invocation_id = None
        for r in results:
            try:
                metrics_buffer.append(_normalize_node_result(project, command, r, generated_at, invocation_id))
            except Exception as e:
                print(f"[{project}] metrics normalize ({command}) failed for one node: {e}")
    except Exception as e:
        print(f"[{project}] metrics collect ({command}) failed: {e}")


def copy_run_results(project, command, project_dir):
    """Copy dbt's run_results.json verbatim before the next command overwrites it.

    Never raises: errors are printed only.
    """
    try:
        src = os.path.join(project_dir, "target", "run_results.json")
        if not os.path.exists(src):
            return
        os.makedirs(DBT_METRICS_RAW_PATH, exist_ok=True)
        dst = os.path.join(DBT_METRICS_RAW_PATH, f"run_results-{command}.json")
        shutil.copyfile(src, dst)
        try:
            with open(dst, "a") as f:
                os.fsync(f.fileno())
        except OSError:
            pass
        print(f"[{project}] archived run_results.json -> {dst}")
    except Exception as e:
        print(f"[{project}] raw run_results copy ({command}) failed: {e}")


def _onelake_storage_options():
    """delta-rs object-store options for the OneLake abfss endpoint."""
    return {
        "bearer_token": notebookutils.credentials.getToken("storage"),
        "use_fabric_endpoint": "true",
    }


def _resolve_delta_target():
    """Map the metrics Delta path to a writable (uri, storage_options) target.

    The OneLake FUSE mount (/lakehouse/...) cannot be used by delta-rs because
    its commit step needs an atomic rename the FUSE driver rejects
    ("Operation not permitted"). So a OneLake FUSE path is rewritten to the
    abfss object-store endpoint (which commits via ADLS, not local rename).
    A path already in abfss form is used as-is; any other (genuinely local)
    path is written directly with no storage options.
    """
    path = DBT_METRICS_DELTA_PATH
    if path.startswith("abfss://"):
        return path, _onelake_storage_options()
    prefix = "/lakehouse/default/Files/"
    if path.startswith(prefix):
        ctx = notebookutils.runtime.context
        workspace_id = ctx.get("defaultLakehouseWorkspaceId") or ctx.get("currentWorkspaceId")
        lakehouse_id = ctx.get("defaultLakehouseId")
        rel = path[len(prefix) :]
        uri = f"abfss://{workspace_id}@onelake.dfs.fabric.microsoft.com/{lakehouse_id}/Files/{rel}"
        return uri, _onelake_storage_options()
    return path, None


def flush_metrics_to_delta(project):
    """Single append of the buffered node metrics to the Delta table.

    Called once in finally so partial results survive a mid-run failure.
    Never raises: errors are printed only.
    """
    try:
        if not metrics_buffer:
            print(f"[{project}] no node metrics to write")
            return
        uri, storage_options = _resolve_delta_target()
        table = pa.Table.from_pylist(metrics_buffer, schema=PA_SCHEMA)
        kwargs = {"mode": "append", "partition_by": ["project", "event_year_month"]}
        if storage_options is not None:
            kwargs["storage_options"] = storage_options
        else:
            os.makedirs(os.path.dirname(uri), exist_ok=True)
        write_deltalake(uri, table, **kwargs)
        print(f"[{project}] wrote {len(metrics_buffer)} node metric rows to {uri}")
    except Exception as e:
        print(f"[{project}] metrics delta flush failed: {e}")


def run_dbt_project(project):
    project_dir = f"/tmp/dbt-fabric-bundle/projects/{project}"

    base_args = ["--project-dir", project_dir, "--profiles-dir", project_dir, "--target", TARGET]
    refresh_args = ["--full-refresh"] if full_refresh == "1" else []

    runner = dbtRunner()
    for cmd in [
        ["deps"] + base_args,
        ["debug"] + base_args,
        ["seed", "--full-refresh"] + base_args,
        ["build", "--exclude", "resource_type:seed"] + base_args + refresh_args,
    ]:
        result = runner.invoke(cmd)
        flush_dbt_logs()
        collect_node_metrics(project, cmd[0], result)
        if cmd[0] in ("seed", "build"):
            copy_run_results(project, cmd[0], project_dir)
        print(f"[{project}] {cmd[0]}: {'success' if result.success else 'FAILED'}")
        if not result.success:
            detail = ""
            if result.exception:
                detail = f"\n  Exception: {result.exception}"
            if hasattr(result, "result") and result.result:
                detail += f"\n  Result: {result.result}"
            raise RuntimeError(f"[{project}] {cmd[0]} failed{detail}")
    return project


print(f"Running dbt project: {dbt_project_name}")
try:
    run_dbt_project(dbt_project_name)
finally:
    flush_metrics_to_delta(dbt_project_name)
    close_livy_session(dbt_project_name)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
