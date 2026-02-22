<!-- PROJECT LOGO -->
<p align="center">
  <img src="https://rakirahman.blob.core.windows.net/public/images/Misc/python.png" alt="Logo" width="30%">
  <h3 align="center">Spark - Python</h3>
  <p align="center">
    PySpark notebooks and Python tooling for the spark-sandbox project.
    <br />
    <br />
    <a href="https://marimo.io/">Marimo Docs</a>
    ·
    <a href="https://spark.apache.org/docs/latest/api/python/">PySpark Docs</a>
    ·
    <a href="https://delta.io/">Delta Lake</a>
  </p>
</p>

---

<div align="center">

• [SETUP](#📋-setup)
• [NOTEBOOKS](#📓-notebooks)
• [TESTING](#🧪-testing)
• [NX TARGETS](#🚀-nx-targets)

</div>

## 📋 Setup

Before you begin, ensure you are reading this from inside the VSCode devcontainer. If you haven't done so, please [bootstrap your devbox first](../../README.md).

To set up the Python environment and install dependencies, run:

```bash
npx nx run spark-python:init
```

## 📓 Notebooks

Notebooks live under `notebooks/` and use [Marimo](https://marimo.io/).

### Edit a notebook interactively

```bash
hatch run marimo edit --no-sandbox notebooks/eda/openlineage_explorer.py
```

### Run a notebook headlessly

```bash
hatch run marimo run --no-sandbox notebooks/eda/openlineage_explorer.py
```
