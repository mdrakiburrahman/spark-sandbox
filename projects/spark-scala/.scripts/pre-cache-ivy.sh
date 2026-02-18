#!/bin/bash
#
#
#       Pre-cache Ivy dependencies for Spark, only slow when running the first time.
#
# ---------------------------------------------------------------------------------------
#

# Fail fast
#
set -e

echo "Pre-hydrating Ivy cache for Spark packages"

export IVY_DIR="${HOME}/.ivy2"
export IVY_SETTINGS="${IVY_DIR}/ivysettings.xml"

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

# All packages used by run-spark-jobs.sh and spark-sql tests
PACKAGES="io.openlineage:openlineage-spark_2.12:1.26.0,org.apache.hadoop:hadoop-azure-datalake:3.3.4,org.apache.hadoop:hadoop-azure:3.3.4,io.delta:delta-spark_2.12:3.2.0"

echo ":quit" | /opt/spark/bin/spark-shell \
  --conf spark.jars.ivySettings=${IVY_SETTINGS} \
  --conf spark.jars.packages=${PACKAGES} \
  --conf spark.ui.showConsoleProgress=false \
  --conf "spark.driver.extraJavaOptions=-Dlog4j.logger.org=ERROR"

echo "Ivy cache pre-hydration complete"
