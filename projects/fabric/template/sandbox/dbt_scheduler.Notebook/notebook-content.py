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
# MAGIC pip install -q --no-index --find-links=/tmp/dbt-fabric-bundle/wheels dbt-core dbt-fabricspark deltalake pyarrow dbt-runner-lib

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

import base64
import os

from dbt_runner import DbtRunner

if not dbt_project_name:
    raise ValueError("dbt_project_name is empty. Set it locally in the PARAMETERS CELL above, or pass it via the Fabric pipeline parameter 'dbt_project_name' when invoking this notebook.")

GIT_ROOT = "/tmp/dbt-fabric-bundle"
PROJECT_DIR = f"{GIT_ROOT}/projects/{dbt_project_name}"
FULL_REFRESH = "true" if full_refresh == "1" else "false"
METRICS_DELTA_PATH = os.environ.get("DBT_METRICS_DELTA_PATH", "/lakehouse/default/Files/onelake/raw/dbt/dbt_node_executions")
METRICS_RAW_PATH = os.environ.get("DBT_METRICS_RAW_PATH", f"/lakehouse/default/Files/onelake/metrics/dbt/{dbt_project_name}")

RUNNER_YAML = f"""
runner:
  project_name: {dbt_project_name}
  project_dir: {PROJECT_DIR}
  profiles_dir: {PROJECT_DIR}
  target: fabric-fabric
  git_root: {GIT_ROOT}
  runtime: fabric
  vars: {{}}
  pipeline:
    - command: deps
    - command: debug
    - command: seed
      full_refresh: true
      collect_metrics: true
      copy_run_results: true
    - command: build
      exclude: [resource_type:seed]
      full_refresh: {FULL_REFRESH}
      collect_metrics: true
      copy_run_results: true
    - command: run-operation
      macro: cleanup_dbt_tmp_relations
      if_macro_exists: true
    - command: docs-generate
  logging:
    log_path: /lakehouse/default/Files/onelake/logs/dbt/{dbt_project_name}
    archive_previous: true
  metrics:
    enabled: true
    delta_path: {METRICS_DELTA_PATH}
    raw_path: {METRICS_RAW_PATH}
    partition_by: [project, event_year_month]
    archive_previous_raw: true
  session:
    close: true
    target: fabric-fabric
"""

config_b64 = base64.b64encode(RUNNER_YAML.encode()).decode()
print(f"Running dbt project: {dbt_project_name}")
DbtRunner.from_base64(config_b64).run()

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "jupyter_python"
# META }
