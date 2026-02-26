<!-- PROJECT LOGO -->
<p align="center">
  <img src="https://rakirahman.blob.core.windows.net/public/images/Misc/fabric.png" alt="Logo" width="30%">
  <h3 align="center">Fabric</h3>
  <p align="center">
    Infrastructure-as-Code deployment for Microsoft Fabric Workspaces.
    <br />
    <br />
    <a href="https://github.com/mdrakiburrahman/fabric-workspace-deployment">Deployer App</a>
    ·
    <a href="https://github.com/microsoft/fabric-cicd">fabric-cicd</a>
    ·
    <a href="https://learn.microsoft.com/en-us/fabric/">Fabric Docs</a>
  </p>
</p>

---

<div align="center">

• [PREREQUISITES](#📋-prerequisites)
• [DEPLOYMENT](#🚀-deployment)

</div>

## 📋 Prerequisites

Before you begin, ensure you are reading this from inside the VSCode devcontainer. If you haven't done so, please [bootstrap your devbox first](../../README.md).

```bash
npx nx run fabric:init
```

## 🚀 Deployment

Orchestrates end-to-end provisioning of a Fabric Workspace — capacity, workspace, artifacts, Spark config, and RBAC.

```bash
# Deploy to dev (default)
npx nx run fabric:deploy

# Deploy to a specific environment
npx nx run fabric:deploy --configuration=stg
```

The `deploy` target chains 10 operations in order: `dryRun` → `deployFabricCapacity` → `deployFabricWorkspace` → `deploySeed` → `deployMonitoring` → `deploySpark` → `deployTemplate` → `deployModel` → `deployShortcut` → `deployRbac`.

Workspace items in `template/sandbox/` are deployed via [`fabric-cicd`](https://github.com/microsoft/fabric-cicd) with per-environment parameterization. Environment configs live in `config/workspace/deployment/`.

> **Note:** Has upstream `nx` dependencies on `spark-scala:build`, `spark-scala:refresh-az-login`, and `spark-dbt:package`.
