#!/bin/bash
#
#
#       Script to spark submit the various jobs in the spark-scala
#       project. The execution sequence is equivalent to the pipeline jobs that
#       get run in Synapse/Fabric, for local reproduction.
#
#       Tip: Comment/uncomment locally to execute the desired job.
#
#            You can use VSCode find and replace (CTRL + F) to:
#
#            ----------------------------------------
#            FIND:     /opt/spark/bin/spark-submit
#            REPLACE:  #/opt/spark/bin/spark-submit
#            ----------------------------------------
#
#            Then manually uncomment the jobs you want to specifically run.
#
#       Ensure line ending is LF, and not CRLF.
#
# ---------------------------------------------------------------------------------------
#

# Fail fast
#
set -e

export GIT_ROOT=$(git rev-parse --show-toplevel)
export SPARK_SCALA_DIR="${GIT_ROOT}/projects/spark-scala"
export SCRIPTS_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)
export SPARK_SUBMIT_OPTS="--add-opens=java.base/java.lang=ALL-UNNAMED --add-opens=java.base/java.security=ALL-UNNAMED"
export LOG_FILE_NAME="run-spark-jobs-$(date -u +%Y-%m-%dT%H-%M-%SZ)"
export TEMP_DIR="${SPARK_SCALA_DIR}/.temp"
export HEAP_DUMP_DIR="${TEMP_DIR}/dumps"
export IVY_DIR="${HOME}/.ivy2"
export IVY_SETTINGS="${IVY_DIR}/ivysettings.xml"
export SPARK_HOME="/opt/spark"
export SPARK_CONF_DIR="${SPARK_SCALA_DIR}"

echo
echo "=== run-spark-jobs.sh: logs will be available at: ${SPARK_SCALA_DIR}/.logs/${LOG_FILE_NAME}.log ==="
echo

mkdir -p ${IVY_DIR}

cat > ${IVY_SETTINGS} << EOF
<ivysettings>
  <settings defaultResolver="default" />
  <resolvers>
    <chain name="default">
      <ibiblio name="central" m2compatible="true" root="https://repo1.maven.org/maven2/" />
    </chain>
  </resolvers>
</ivysettings>
EOF

mkdir -p ${HEAP_DUMP_DIR}

if ! command -v yq &>/dev/null; then
    echo "yq is not installed for YAML parsing, installing"
    sudo add-apt-repository ppa:rmescandon/yq -y
    sudo apt update
    sudo apt install yq -y
fi

# ┌───────────┐
# │ Functions │
# └───────────┘

# Function: get_spark_configs
#
# Description:
#
#   Retrieves the Spark resource configurations from a YAML file and returns them as an array.
#   Required because spark-submit only respects resource config passed in at submission:
#
#    >>> https://stackoverflow.com/a/53942466/8954538
#
#   View supported configurations here:
#
#   >>> https://archive.apache.org/dist/spark/docs/3.4.1/configuration.html
#
# Parameters:
#   $1 (string): The path to the YAML file containing the Spark resource configurations.
#
# Returns:
#   Array: An array containing the Spark resource configurations in the format "--conf <config_key>=<config_value>".
#
get_spark_configs() {
    local yaml_file="$1"
    local spark_resource_configs=()

    spark_resource_configs+=("--conf" "spark.driver.cores=$(yq eval '.spark.driverCore' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.driver.defaultJavaOptions=$(yq eval '.spark.driverDefaultJavaOptions' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.driver.extraJavaOptions=-Dlog4j.configurationFile=file://${SPARK_SCALA_DIR}/log4j2.properties")
    spark_resource_configs+=("--conf" "spark.driver.memory=$(yq eval '.spark.driverMemory' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.executor.cores=$(yq eval '.spark.executorCore' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.executor.defaultJavaOptions=$(yq eval '.spark.executorDefaultJavaOptions' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.executor.extraJavaOptions=-Dlog4j.configurationFile=file://${SPARK_SCALA_DIR}/log4j2.properties")
    spark_resource_configs+=("--conf" "spark.executor.memory=$(yq eval '.spark.executorMemory' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.jars.ivySettings=${IVY_SETTINGS}")
    spark_resource_configs+=("--conf" "spark.local.dir=${SPARK_SCALA_DIR}/.temp/spark")
    spark_resource_configs+=("--conf" "spark.memory.offHeap.enabled=$(yq eval '.spark.offHeapEnabled' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.memory.offHeap.size=$(yq eval '.spark.offHeapMemory' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.sql.shuffle.partitions=$(yq eval '.spark.shufflePartitions' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.sql.streaming.minBatchesToRetain=$(yq eval '.spark.state.minBatchesToRetain' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.sql.streaming.stateStore.maintenanceInterval=$(yq eval '.spark.state.maintenanceInterval' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.sql.streaming.stateStore.minDeltasForSnapshot=$(yq eval '.spark.state.minDeltasForSnapshot' "$yaml_file")")
    spark_resource_configs+=("--conf" "spark.sql.streaming.stateStore.providerClass=$(yq eval '.spark.state.storeProviderClass' "$yaml_file")")

    if [[ $(yq eval '.spark.state.storeProviderClass' "$yaml_file") == *"RocksDBStateStoreProvider"* ]]; then
        spark_resource_configs+=("--conf" "spark.sql.streaming.stateStore.rocksdb.compactOnCommit=$(yq eval '.spark.state.rocksDb.compactOnCommit' "$yaml_file")")
    fi

    echo "${spark_resource_configs[@]}"
}

# Function: get_additional_runtime_jars
#
# Description:
#
#   Retrieves the additional runtime jars required for Spark jobs and returns them as a string.
#
# Parameters:
#   None
#
# Returns:
#   String: A string containing the additional runtime jars in the format "spark.jars.packages=<jar1>,<jar2>,...".
#
get_additional_runtime_jars() {
    local jars=(
        "io.openlineage:openlineage-spark_2.12:1.42.1"
        "org.apache.hadoop:hadoop-azure-datalake:3.3.4"
        "org.apache.hadoop:hadoop-azure:3.3.4"
    )
    local result=""
    for jar in "${jars[@]}"; do
        result+=",$jar"
    done
    result=${result:1}
    echo "spark.jars.packages=$result"
}

# ---------------
# Debugging options
#
# Export the following variable (SPARK_SUBMIT_OPTS) if you want to debug a spark job. This will suspend the JVM and wait for
# a debugger to attach to it. Use "Attach debugger" from launch.json to attach to it.
#
# Note: This variable is used by all jobs submitted by spark-submit. If you only want to suspend/debug
# a single job, you can also set the same settings per job by passing the java options to spark-submit
# through "--conf spark.driver.extraJavaOptions"
#
# export SPARK_SUBMIT_OPTS="-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005"
# ---------------

# ┌─────────────┐
# │ Spark Demos │
# └─────────────┘
#
export spark_demo_jar="$(find $SCRIPTS_DIR/../spark-demo/target/scala-2.12/ -name 'sparkDemo-*.jar' -type f -print -quit | xargs)"
export DEMO_DEVCONTAINER_CONFIG="${SPARK_SCALA_DIR}/spark-demo/src/main/resources/config/config-dev-devcontainer.yaml"
export demo_spark_resource_config=$(get_spark_configs "$DEMO_DEVCONTAINER_CONFIG")

# ---------------------
# Spark Concepts | Demo
# ---------------------

# 1. Plugins
spark_plugin_configs=()
spark_plugin_configs+=("--conf" "spark.plugins=me.rakirahman.spark.plugin.uncachingplugin.UncacherSparkPlugin,me.rakirahman.spark.plugin.rpcplugin.RpcSparkPlugin")

/opt/spark/bin/spark-submit ${demo_spark_resource_config[@]} ${spark_plugin_configs[@]} --conf $(get_additional_runtime_jars) --class "me.rakirahman.sparkdemo.etl.drivers.demos.DemoPluginExploration" ${spark_demo_jar} ${DEMO_DEVCONTAINER_CONFIG}

# 2. OpenLineage
#
# >>> https://openlineage.io/docs/integrations/spark/configuration/spark_conf/
# >>> https://github.com/OpenLineage/OpenLineage/blob/main/website/docs/integrations/spark/configuration/spark_conf.md
# >>> https://openlineage.io/docs/integrations/spark/configuration/transport/
#
# To send to file directly:
#
# ```bash
# openlineage_configs+=("--conf" "spark.openlineage.transport.type=file")
# openlineage_configs+=("--conf" "spark.openlineage.transport.location=${SPARK_SCALA_DIR}/.temp/openlineage/lineage-from-openlineage.json")
# ```
#
# To send to HTTP endpoint (e.g., OpenLineage backend):
#
# ```bash
# openlineage_configs+=("--conf" "spark.openlineage.transport.type=http")
# openlineage_configs+=("--conf" "spark.openlineage.transport.url=http://localhost:${EXECUTOR_PLUGIN_PORT}")
# ```
#
export DRIVER_PLUGIN_PORT=19000
export EXECUTOR_PLUGIN_PORT=19001

openlineage_configs=()

openlineage_configs+=("--conf" "spark.extraListeners=io.openlineage.spark.agent.OpenLineageSparkListener")
openlineage_configs+=("--conf" "spark.openlineage.transport.type=file")
openlineage_configs+=("--conf" "spark.openlineage.transport.location=${SPARK_SCALA_DIR}/.temp/openlineage/lineage-from-openlineage.json")

openlineage_configs+=("--conf" "spark.plugins=me.rakirahman.spark.plugin.httpdumperplugin.HttpDumperPlugin")
openlineage_configs+=("--conf" "spark.plugin.conf.driver.port=${DRIVER_PLUGIN_PORT}")
openlineage_configs+=("--conf" "spark.plugin.conf.executor.port=${EXECUTOR_PLUGIN_PORT}")
openlineage_configs+=("--conf" "spark.plugin.conf.database.name=data_ops_inventory_db")
openlineage_configs+=("--conf" "spark.plugin.conf.table.name=http_dumper_plugin")
openlineage_configs+=("--conf" "spark.plugin.conf.table.format=delta")

/opt/spark/bin/spark-submit ${demo_spark_resource_config[@]} ${openlineage_configs[@]} --conf $(get_additional_runtime_jars) --class "me.rakirahman.sparkdemo.etl.drivers.demos.DemoEtl" ${spark_demo_jar} ${DEMO_DEVCONTAINER_CONFIG}