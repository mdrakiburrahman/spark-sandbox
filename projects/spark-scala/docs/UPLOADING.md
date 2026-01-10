# ☁️ Uploading to cloud

To test our JAR on Fabric etc, we need to upload the JAR:

```bash
npx nx run get-azcopy

/home/vscode/.azure/bin/azcopy --version
# azcopy version 10.31.
```

Run one by one:

```bash
printf "Enter ACCOUNT_KEY: " && read -s ACCOUNT_KEY && echo && export ACCOUNT_KEY
printf "Enter ACCOUNT: " && read -s ACCOUNT && echo && export ACCOUNT
```

Upload:

```bash
export GIT_ROOT=$(git rev-parse --show-toplevel)
export EXECUTOR_JAR="$(find ${GIT_ROOT}/projects/spark-scala/common-executor/target/scala-2.12/ -name 'commonExecutor-*.jar' -type f -print -quit | xargs)"
export SUBMIT_JAR="$(find ${GIT_ROOT}/projects/spark-scala/spark-demo/target/scala-2.12/ -name 'sparkDemo-*.jar' -type f -print -quit | xargs)"
export SAS_TOKEN=$(az storage container generate-sas --account-name "${ACCOUNT}" --account-key "${ACCOUNT_KEY}" --name public --permissions acdlrw --expiry $(date -u -d "1 hour" '+%Y-%m-%dT%H:%MZ') --output tsv)

/home/vscode/.azure/bin/azcopy copy "$EXECUTOR_JAR" "https://${ACCOUNT}.blob.core.windows.net/public/jars/$(basename $EXECUTOR_JAR)?${SAS_TOKEN}"
/home/vscode/.azure/bin/azcopy copy "$SUBMIT_JAR" "https://${ACCOUNT}.blob.core.windows.net/public/jars/$(basename $SUBMIT_JAR)?${SAS_TOKEN}"
```
