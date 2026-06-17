"""Command-line entry point: ``python -m dbt_runner run --config-base64 <b64>``.

Used by the local ``run-dbt-local.sh`` wrapper (and available as a fallback in
the Fabric notebook). Keeps the surface tiny: one ``run`` subcommand that maps
straight onto :meth:`DbtRunner.run`, plus ``show-default`` for the template.
"""

from __future__ import annotations

import argparse
import sys

import yaml

from dbt_runner.config import load_default_template
from dbt_runner.errors import DbtRunnerError
from dbt_runner.runner import DbtRunner


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dbt_runner", description="Config-driven dbt execution runner.")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Run the pipeline described by an inline-YAML config.")
    source = run.add_mutually_exclusive_group(required=True)
    source.add_argument("--config-base64", help="Base64-encoded inline YAML.")
    source.add_argument("--config-yaml", help="Inline YAML string.")
    source.add_argument("--config-path", help="Path to a YAML config file.")
    run.add_argument("--only", nargs="+", metavar="COMMAND", help="Run only these pipeline commands (subset).")

    sub.add_parser("show-default", help="Print the bundled annotated config template.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    if args.command == "show-default":
        print(yaml.safe_dump(load_default_template(), sort_keys=False))
        return 0

    try:
        if args.config_base64 is not None:
            runner = DbtRunner.from_base64(args.config_base64)
        elif args.config_yaml is not None:
            runner = DbtRunner.from_yaml(args.config_yaml)
        else:
            runner = DbtRunner.from_path(args.config_path)
        runner.run(only=args.only)
    except DbtRunnerError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
