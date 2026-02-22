#!/usr/bin/env python3
"""Run all marimo notebooks headlessly via importlib.

Validates each notebook can be imported (and therefore its cells are defined)
without starting a marimo server.
"""

import importlib.util
import os
import sys


def discover_notebooks(root: str):
    """Yield all .py notebooks under the given root."""
    for dirpath, _, filenames in os.walk(root):
        for f in sorted(filenames):
            if f.endswith(".py") and not f.startswith("_"):
                yield os.path.join(dirpath, f)


def main():
    notebooks_dir = os.path.join(os.path.dirname(__file__), "..", "notebooks")
    notebooks = list(discover_notebooks(notebooks_dir))

    if not notebooks:
        print("No notebooks found.")
        sys.exit(1)

    failures = []
    for nb_path in notebooks:
        rel = os.path.relpath(nb_path, notebooks_dir)
        try:
            spec = importlib.util.spec_from_file_location("nb", nb_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            assert hasattr(mod, "app"), f"No `app` object in {rel}"
            print(f"  OK  {rel}")
        except Exception as exc:
            print(f"  FAIL  {rel}: {exc}")
            failures.append(rel)

    if failures:
        print(f"\n{len(failures)} notebook(s) failed.")
        sys.exit(1)

    print(f"\nAll {len(notebooks)} notebook(s) validated.")


if __name__ == "__main__":
    main()
