"""
Compile dbt artifacts into DBML ERD diagrams using dbterd.

Iterates over all dbt-*/ project directories and generates
a full_model.dbml file in each project's erd/ directory.
"""

import json
import os
import shutil
import sys
import tempfile
from glob import glob
from pathlib import Path

from dbterd.api import DbtErd

RESOURCE_TYPES = ["model", "seed"]
ENTITY_NAME_FORMAT = "model"


def patch_manifest(manifest: dict) -> int:
    """Patch null database values in manifest nodes/sources (Spark/Fabric compat)."""
    patched = 0
    for section in ("nodes", "sources"):
        for v in manifest.get(section, {}).values():
            if v.get("database") is None:
                v["database"] = "spark_catalog"
                patched += 1
    return patched


def compile_project(project_dir: Path) -> bool:
    """Generate DBML ERD for a single dbt project. Returns True on success."""
    manifest_path = project_dir / "target" / "manifest.json"
    catalog_path = project_dir / "target" / "catalog.json"

    if not manifest_path.exists() or not catalog_path.exists():
        print(f"SKIP: {project_dir.name} (missing target/manifest.json or target/catalog.json)")
        return False

    print(f"Compiling ERD for {project_dir.name}...")

    manifest = json.loads(manifest_path.read_text())
    patched = patch_manifest(manifest)
    if patched > 0:
        print(f"  Patched {patched} null database values in manifest")

    # Write patched manifest + catalog to temp dir for dbterd
    tmpdir = tempfile.mkdtemp()
    try:
        (Path(tmpdir) / "manifest.json").write_text(json.dumps(manifest))
        shutil.copy(catalog_path, Path(tmpdir) / "catalog.json")

        erd = DbtErd(
            artifacts_dir=tmpdir,
            target="dbml",
            resource_type=RESOURCE_TYPES,
            entity_name_format=ENTITY_NAME_FORMAT,
            omit_entity_name_quotes=True,
        ).get_erd()
    finally:
        shutil.rmtree(tmpdir)

    erd_dir = project_dir / "erd"
    erd_dir.mkdir(exist_ok=True)
    (erd_dir / "full_model.dbml").write_text(erd)
    print(f"  Generated: {erd_dir / 'full_model.dbml'}")
    return True


def main():
    script_dir = Path(__file__).resolve().parent
    project_root = script_dir.parent

    projects = sorted(project_root.glob("dbt-*/"))
    if not projects:
        print("No dbt-*/ project directories found")
        sys.exit(1)

    compiled = 0
    skipped = 0

    for project_dir in projects:
        if compile_project(project_dir):
            compiled += 1
        else:
            skipped += 1

    print(f"\nDone. Compiled: {compiled}, Skipped: {skipped}")

    if compiled == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
