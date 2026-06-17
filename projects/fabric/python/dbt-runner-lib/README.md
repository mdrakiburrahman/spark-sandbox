# dbt-runner-lib

One **config-driven dbt execution runner** shared by local and Microsoft Fabric
runs. Hand it a single base64-encoded inline-YAML config and it figures out
_everything_: which dbt commands to run, dbt `--vars` injection, dbt log
archival, node-execution metrics collection, `run_results.json` archival, the
Delta metrics sink (local filesystem **or** OneLake abfss), and Livy session
close.

```python
from dbt_runner import DbtRunner

DbtRunner.from_base64(b64_yaml).run()   # .validate() runs in the constructor
```

The same library powers both entry points, so the two paths can never drift:

| Entry point                                             | Runtime  | Target          | Metrics sink                                 |
| ------------------------------------------------------- | -------- | --------------- | -------------------------------------------- |
| `projects/spark-dbt/.scripts/run-dbt-local.sh`          | `local`  | `local-local`   | `projects/spark-dbt/.temp/dbt-runner/<proj>` |
| `…/dbt_scheduler.Notebook/notebook-content.py` (Fabric) | `fabric` | `fabric-fabric` | OneLake (`abfss://…`)                        |

---

## The inline-YAML contract

Everything is configured under one top-level `runner:` mapping. Required keys:
`project_name`, `project_dir`, `target`, `pipeline`. Everything else has a
documented default — see [`config/default.yaml`](config/default.yaml) for the
fully annotated template (also printable via `python -m dbt_runner show-default`).

```yaml
runner:
  project_name: dbt-adventureworks
  project_dir: /tmp/dbt-fabric-bundle/projects/dbt-adventureworks
  profiles_dir: <defaults to project_dir>
  target: fabric-fabric
  git_root: /tmp/dbt-fabric-bundle # optional; exported as GIT_ROOT
  runtime: fabric # local | fabric

  vars: {} # dbt --vars override (inlined)

  pipeline: # declarative + ordered
    - { command: deps }
    - { command: debug }
    - {
        command: seed,
        full_refresh: false,
        collect_metrics: true,
        copy_run_results: true,
      }
    - {
        command: build,
        exclude: [resource_type:seed],
        collect_metrics: true,
        copy_run_results: true,
      }
    - {
        command: run-operation,
        macro: cleanup_dbt_tmp_relations,
        if_macro_exists: true,
      }
    - { command: docs-generate }

  logging: { log_path: <dir>, archive_previous: true }
  metrics:
    enabled: true
    delta_path: <dir | abfss://…> # dbt_node_executions Delta table
    raw_path: <dir> # run_results-<cmd>.json archive
    partition_by: [project, event_year_month]
  session: { close: true, target: fabric-fabric }
```

### Pipeline step commands

`deps`, `debug`, `seed`, `run`, `build`, `test`, `snapshot`, `compile`,
`docs-generate`, `run-operation` (needs `macro`; supports `if_macro_exists`),
and `shell` (needs `argv` — a generic post-hook, e.g. a validator).

Per-step flags: `full_refresh`, `exclude`, `select`, `collect_metrics`,
`copy_run_results`. `vars` is injected automatically on the commands that accept
it.

---

## Public API

- `DbtRunner.from_base64(s)` / `.from_yaml(s)` / `.from_path(p)` / `.from_mapping(d)`
- `.validate() -> RunnerConfig`
- `.run(only=None) -> RunReport` — runs the pipeline; metrics are flushed once
  and the session closed in a `finally`-like phase so partial results survive a
  mid-run failure. A dbt step failure takes precedence over a sink failure.
- CLI: `python -m dbt_runner run --config-base64 <b64>` (also `--config-yaml`,
  `--config-path`, `--only`).

### Metrics parity

The Arrow schema (`dbt_runner.metrics.PA_SCHEMA`) and per-node normalization are
identical across runtimes, so a local run and a Fabric run produce the _same_
metric rows — only the Delta path differs. Locally the table is written to the
filesystem; in Fabric an `abfss://` or `/lakehouse/...` path is committed via the
OneLake object-store endpoint (delta-rs cannot atomically rename on the FUSE
mount).

---

## Package layout

The package is organized into single-responsibility domains; each domain's
`__init__.py` re-exports its public surface so imports are stable:

```
src/dbt_runner/
├── __init__.py          # public API (DbtRunner, config models, errors)
├── __main__.py          # CLI
├── errors.py            # typed error hierarchy (cross-cutting)
├── runner.py            # DbtRunner orchestrator + RunReport
├── config/              # _validation · steps (StepConfig) · sections · runner (RunnerConfig) · loader
├── runtime/             # base (RuntimeProvider) · local · fabric · factory
├── pipeline/            # outcome · args (DbtArgsBuilder) · macros (MacroResolver) · executor (DbtPipeline)
├── metrics/             # schema (PA_SCHEMA) · normalize · delta_sink (DeltaMetricsSink) · collector
├── logs/                # manager (LogManager)
└── session/             # livy · closer (SessionCloser)
```

`runner.py` composes one object per domain — `LogManager`, `DbtPipeline`,
`MetricsCollector`, `SessionCloser`, and a `RuntimeProvider` — so each concern is
independently testable and swappable.

---

## Nx targets

```bash
npx nx run dbt-runner-lib:build   # hatch wheel -> dist/
npx nx run dbt-runner-lib:test    # pytest unit suite
npx nx run dbt-runner-lib:lint    # black
npx nx run dbt-runner-lib:clean
```

The wheel is bundled into `dbt-fabric-bundle.tar.gz` by
`projects/spark-dbt/.scripts/package-fabric.sh` and pip-installed by the Fabric
notebook. Locally, the library is an editable dependency of the `spark-dbt`
hatch venv, so `run-dbt-local.sh` imports it directly.

---

## Portability

The library contains **zero** repository-specific knowledge — every path,
project name, GUID, and pipeline step lives in the injected YAML. To reuse it in
another repository, ship the wheel and feed it a different `runner:` payload
(`notebookutils` and `dbt-core` are treated as runtime-provided and imported
lazily, so unit tests need neither).
