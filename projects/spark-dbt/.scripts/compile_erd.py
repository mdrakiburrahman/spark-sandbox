"""
Compile dbt artifacts into DBML ERD diagrams using dbterd.

Iterates over all dbt-*/ project directories and generates
a full_model.dbml file in each project's erd/ directory.
"""

import json
import os
import re
import shutil
import sys
import tempfile
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


def get_primary_keys(manifest: dict, catalog: dict) -> set:
    """Find primary key columns from tests (unique+not_null) and catalog first-column fallback."""
    # Collect explicit PKs from unique + not_null tests
    column_tests = {}  # (model_name, column_name) -> set of test names
    for node in manifest.get("nodes", {}).values():
        if node.get("resource_type") != "test":
            continue
        test_meta = node.get("test_metadata", {})
        test_name = test_meta.get("name", "")
        if test_name not in ("unique", "not_null"):
            continue
        col = node.get("column_name")
        if not col:
            continue
        refs = node.get("refs", [])
        for ref in refs:
            model_name = ref.get("name", "") if isinstance(ref, dict) else ref
            if model_name:
                key = (model_name.lower(), col.lower())
                column_tests.setdefault(key, set()).add(test_name)
                break

    pks = {k for k, v in column_tests.items() if {"unique", "not_null"}.issubset(v)}

    # Fallback: for tables without explicit PKs, use first column (index 0) from catalog
    tables_with_pks = {table for table, _ in pks}
    for node in catalog.get("nodes", {}).values():
        table_name = node.get("metadata", {}).get("name", "").lower()
        if not table_name or table_name in tables_with_pks:
            continue
        columns = node.get("columns", {})
        for col_data in columns.values():
            if col_data.get("index", -1) == 0:
                pks.add((table_name, col_data.get("name", "").lower()))
                break

    return pks


def get_source_relationships(manifest: dict) -> list:
    """Extract relationship tests between source tables, mapped to seed names."""
    refs = []
    for node in manifest.get("nodes", {}).values():
        if node.get("resource_type") != "test":
            continue
        test_meta = node.get("test_metadata", {})
        if test_meta.get("name") != "relationships":
            continue

        column_name = node.get("column_name")
        kwargs = test_meta.get("kwargs", {})
        to_field = kwargs.get("field")
        to_expr = kwargs.get("to", "")

        if "source(" not in to_expr:
            continue

        match = re.search(r"source\(['\"]([^'\"]+)['\"],\s*['\"]([^'\"]+)['\"]\)", to_expr)
        if not match:
            continue
        to_table = match.group(2)

        # depends_on has both the FROM and TO source nodes; pick the one that isn't to_table
        from_table = None
        for dep in node.get("depends_on", {}).get("nodes", []):
            if dep.startswith("source."):
                parts = dep.split(".")
                if len(parts) >= 4 and parts[3] != to_table:
                    from_table = parts[3]
                    break

        if from_table and column_name and to_table and to_field:
            refs.append((from_table, column_name, to_table, to_field))

    return refs


def get_catalog_types(catalog: dict) -> dict:
    """Build a map of (table_name, column_name) -> data_type from catalog.json."""
    type_map = {}
    for section in ("nodes", "sources"):
        for node in catalog.get(section, {}).values():
            table_name = node.get("metadata", {}).get("name", "").lower()
            if not table_name:
                continue
            for col_data in node.get("columns", {}).values():
                col_name = col_data.get("name", "").lower()
                col_type = col_data.get("type", "")
                if col_name and col_type:
                    type_map[(table_name, col_name)] = col_type
    return type_map


def enhance_dbml(dbml: str, manifest: dict, catalog: dict) -> str:
    """Post-process DBML to add [pk] markers, resolve unknown types, and source-level relationships."""
    pks = get_primary_keys(manifest, catalog)
    source_refs = get_source_relationships(manifest)
    catalog_types = get_catalog_types(catalog)

    lines = dbml.split("\n")
    enhanced = []
    current_table = None

    for line in lines:
        # Track current table
        if line.startswith("Table "):
            table_match = re.match(r'Table\s+"?([^"\s{]+)"?\s*\{', line)
            if table_match:
                current_table = table_match.group(1).lower()
        elif line.strip() == "}":
            current_table = None

        # Add [pk] to matching columns and resolve "unknown" types from catalog
        if current_table and line.strip().startswith('"'):
            col_match = re.match(r'^(\s+)"([^"]+)"\s+"([^"]+)"(.*)$', line)
            if col_match:
                indent, col_name, col_type, rest = col_match.groups()
                if col_type == "unknown":
                    resolved = catalog_types.get((current_table, col_name.lower()))
                    if resolved:
                        col_type = resolved
                if (current_table, col_name.lower()) in pks:
                    if "[" in rest:
                        rest = rest.replace("[", "[pk, ", 1)
                    else:
                        rest = " [pk]" + rest
                line = f'{indent}"{col_name}" "{col_type}"{rest}'

        # Remove empty Note lines
        if line.strip() == 'Note: ""':
            continue

        enhanced.append(line)

    # Append source-level relationships
    if source_refs:
        has_refs = any(l.startswith("Ref:") for l in enhanced)
        if has_refs:
            enhanced.append("")
        enhanced.append("//Refs (based on the Source Relationship Tests)")
        for from_table, from_col, to_table, to_field in sorted(source_refs):
            enhanced.append(f'Ref: {from_table}."{from_col}" > {to_table}."{to_field}"')

    return "\n".join(enhanced)


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

    erd = enhance_dbml(erd, manifest, json.loads(catalog_path.read_text()))

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
