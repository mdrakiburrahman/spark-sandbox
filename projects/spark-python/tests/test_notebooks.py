"""Tests for marimo notebooks and OpenLineage data validation."""

import importlib.util
import os

import pytest
from pyspark.sql import SparkSession

os.environ["SPARK_CONF_DIR"] = "/opt/spark/conf"

NOTEBOOKS_DIR = os.path.join(os.path.dirname(__file__), "..", "notebooks")


def _get_notebook_paths():
    paths = []
    for root, _, files in os.walk(NOTEBOOKS_DIR):
        for f in files:
            if f.endswith(".py") and not f.startswith("_"):
                paths.append(os.path.join(root, f))
    return paths


@pytest.fixture(scope="session")
def spark():
    session = (
        SparkSession.builder.appName("spark-python-tests")
        .master("local[*]")
        .config("spark.ui.enabled", "false")
        .config("spark.driver.memory", "1g")
        .config("spark.driver.extraClassPath", "/opt/spark/jars/*")
        .enableHiveSupport()
        .getOrCreate()
    )
    session.sparkContext.setLogLevel("WARN")
    yield session
    session.stop()


@pytest.mark.parametrize("notebook_path", _get_notebook_paths(), ids=lambda p: os.path.relpath(p, NOTEBOOKS_DIR))
def test_notebook_is_valid_marimo_app(notebook_path):
    spec = importlib.util.spec_from_file_location("nb", notebook_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert hasattr(mod, "app"), f"Notebook {notebook_path} does not define `app`"


def test_openlineage_table_has_rows(spark):
    df = spark.sql("SELECT * FROM data_ops_inventory_db.openlineage LIMIT 10")
    assert df.count() > 0, "OpenLineage table is empty"


def test_openlineage_table_has_expected_columns(spark):
    df = spark.sql("SELECT * FROM data_ops_inventory_db.openlineage LIMIT 1")
    cols = set(df.columns)
    for expected in ["result_timestamp", "event_year_date", "eventType", "eventTime"]:
        assert expected in cols, f"Missing column: {expected}"


def test_openlineage_to_pandas(spark):
    df = spark.sql("SELECT eventType, eventTime FROM data_ops_inventory_db.openlineage LIMIT 5")
    pdf = df.toPandas()
    assert len(pdf) > 0
    assert "eventType" in pdf.columns
