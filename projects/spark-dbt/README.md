<!-- PROJECT LOGO -->
<p align="center">
  <img src="https://rakirahman.blob.core.windows.net/public/images/Misc/dbt.png" alt="Logo" width="30%">
  <h3 align="center">Spark - dbt</h3>
  <p align="center">
    Data transformation for Spark and Fabric using dbt.
    <br />
    <br />
    <a href="https://docs.getdbt.com/">dbt Docs</a>
    ·
    <a href="https://github.com/mdrakiburrahman/dbt-fabricspark/tree/dev/mdrrahman/explore">dbt Adapter - fork for now</a>
    ·
    <a href="https://docs.getdbt.com/docs/core/connect-data-platform/fabricspark-setup">dbt-fabricspark setup docs</a>
    ·
    <a href="https://docs.getdbt.com/reference/resource-configs/fabricspark-configs">dbt-fabricspark config docs</a>
  </p>
</p>

---

<div align="center">

• [PREREQUISITES](#📋-prerequisites)
• [USING DBT](#🚀-using-dbt)
• [DEPENDENCIES](#📦-dependencies)

</div>

## 📋 Prerequisites

Before you begin, ensure you are reading this from inside the VSCode devcontainer. If you haven't done so, please [bootstrap your devbox first](../../README.md).

To set up the Python environment and install dependencies, run:

```bash
npx nx run spark-dbt:install
```

## 🚀 Using dbt

### Option 1: Run dbt commands directly with hatch

```bash
cd projects/spark-dbt
hatch run dbt --version
```

### Option 2: Activate the virtual environment with hatch shell

```bash
cd projects/spark-dbt
hatch shell

dbt --version
```
