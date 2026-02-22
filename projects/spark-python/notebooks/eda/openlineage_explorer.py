# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "marimo",
#     "pandas>=2.0.0",
#     "pyspark==3.5.1",
#     "delta-spark==3.2.0",
#     "setuptools",
# ]
# ///

import marimo

__generated_with = "0.20.1"
app = marimo.App(width="medium")


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    # OpenLineage Explorer

    _Explore the columnar OpenLineage Silver table via PySpark._
    """)
    return


@app.cell
def _():
    import marimo as mo

    return (mo,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## PySpark Session

    Connect to the local Spark warehouse with Delta Lake support.
    """)
    return


@app.cell
def _():
    import os
    from pyspark.sql import SparkSession

    os.environ["SPARK_CONF_DIR"] = "/opt/spark/conf"

    spark = SparkSession.builder.appName("OpenLineage Explorer").master("local[*]").config("spark.ui.enabled", "false").config("spark.driver.memory", "2g").config("spark.driver.extraClassPath", "/opt/spark/jars/*").enableHiveSupport().getOrCreate()
    spark.sparkContext.setLogLevel("WARN")
    return (spark,)


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Query OpenLineage

    Read the first 100 rows from `data_ops_inventory_db.openlineage`.
    """)
    return


@app.cell
def _(spark):
    openlineage_df = spark.sql("SELECT * FROM data_ops_inventory_db.openlineage LIMIT 100")
    row_count = openlineage_df.count()
    return openlineage_df, row_count


@app.cell(hide_code=True)
def _(mo, row_count):
    mo.md(f"""
    **Rows loaded: {row_count}**
    """)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## DataFrame

    Visualize the OpenLineage data as a pandas DataFrame.
    """)
    return


@app.cell
def _(mo, openlineage_df):
    pandas_df = openlineage_df.toPandas()
    mo.ui.dataframe(pandas_df)
    return


@app.cell(hide_code=True)
def _(mo):
    mo.md(r"""
    ## Event Type Distribution

    Summary of OpenLineage event types.
    """)
    return


@app.cell
def _(mo, spark):
    mo.ui.dataframe(spark.sql("SELECT eventType, COUNT(*) AS count FROM data_ops_inventory_db.openlineage GROUP BY eventType").toPandas())
    return


@app.cell
def _(spark):
    spark.stop()
    return


if __name__ == "__main__":
    app.run()
