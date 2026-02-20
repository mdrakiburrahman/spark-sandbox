# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "jupyter",
# META     "jupyter_kernel_name": "python3.11"
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
# MAGIC pip install -q --no-index --find-links=/tmp/dbt-fabric-bundle/wheels dbt-core dbt-fabricspark

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
from concurrent.futures import ThreadPoolExecutor
from dbt.cli.main import dbtRunner
from dbt_common.events.event_manager_client import get_event_manager

PROJECTS = ["dbt-adventureworks", "dbt-jaffle-shop"]
TARGET = "fabric-fabric"

os.environ["GIT_ROOT"] = "/tmp/dbt-fabric-bundle"
os.environ["DBT_LOG_PATH"] = "/lakehouse/default/Files/onelake/logs/dbt"

dbt_log_file = os.path.join(os.environ["DBT_LOG_PATH"], "dbt.log")
if os.path.exists(dbt_log_file):
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    archived = os.path.join(
        os.environ["DBT_LOG_PATH"], f"dbt-archived-at-{ts}.log")
    os.rename(dbt_log_file, archived)
    print(f"Archived previous dbt.log to {archived}")


def resolve_env_var(yaml_value, env_key):
    """Return os.environ[env_key] if set, otherwise extract the default from a
    dbt ``{{ env_var('KEY', 'default') }}`` template string."""
    env_val = os.environ.get(env_key)
    if env_val:
        return env_val
    m = re.search(
        r"\{\{\s*env_var\s*\(\s*'[^']*'\s*,\s*'([^']*)'\s*\)\s*\}\}", yaml_value)
    if m:
        return m.group(1)
    return yaml_value


def close_livy_sessions():
    """Read session IDs from all project profiles, deduplicate, and close."""
    seen = {}
    for project in PROJECTS:
        try:
            profiles = yaml.safe_load(
                open(f"/tmp/dbt-fabric-bundle/projects/{project}/profiles.yml"))
            profile_name = next(iter(profiles))
            cfg = profiles[profile_name]["outputs"][TARGET]
            session_id = open(cfg["session_id_file"]).read().strip()
            if session_id not in seen:
                seen[session_id] = (project, cfg)
        except Exception as e:
            print(f"Warning: failed to read session for {project}: {e}")

    for session_id, (project, cfg) in seen.items():
        try:
            workspace_id = resolve_env_var(
                cfg["workspaceid"], "FABRIC_WORKSPACE_ID")
            lakehouse_id = resolve_env_var(
                cfg["lakehouseid"], "FABRIC_LAKEHOUSE_ID")

            url = f"https://api.fabric.microsoft.com/v1/workspaces/{workspace_id}/lakehouses/{lakehouse_id}/livyApi/versions/2023-12-01/sessions/{session_id}"
            print(f"Deleting session {session_id}: {url}")
            r = requests.delete(url, headers={
                                "Authorization": f"Bearer {notebookutils.credentials.getToken('pbi')}"})
            print(f"Delete session {session_id}: {r.status_code} {r.reason}")
        except Exception as e:
            print(f"Warning: failed to close Livy session {session_id}: {e}")


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


def run_dbt_project(project):
    project_dir = f"/tmp/dbt-fabric-bundle/projects/{project}"

    base_args = ["--project-dir", project_dir, "--profiles-dir", project_dir, "--target", TARGET]

    runner = dbtRunner()
    for cmd in [
        ["deps"] + base_args,
        ["debug"] + base_args,
        ["run"] + base_args,
        ["test"] + base_args,
    ]:
        result = runner.invoke(cmd)
        flush_dbt_logs()
        print(f"[{project}] {cmd[0]}: {'success' if result.success else 'FAILED'}")
        if not result.success:
            raise RuntimeError(f"[{project}] {cmd[0]} failed")
    return project


try:
    results = [run_dbt_project(project) for project in PROJECTS]
finally:
    close_livy_sessions()

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
