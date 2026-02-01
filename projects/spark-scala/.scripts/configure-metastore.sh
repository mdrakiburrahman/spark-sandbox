#!/bin/bash
# Configure hive-site.xml for PostgreSQL metastore
# This script is called after PostgreSQL container starts

set -e

HIVE_SITE="/workspaces/spark-sandbox/hive-site.xml"
SPARK_HIVE_SITE="/opt/spark/conf/hive-site.xml"

# Use host.docker.internal since the devcontainer and PostgreSQL are on different Docker networks
# The port 5432 is exposed on the host, so we access it via the host gateway
POSTGRES_HOST="host.docker.internal"

echo "Configuring hive-site.xml with PostgreSQL at: $POSTGRES_HOST:5432"

cat > "$HIVE_SITE" << EOF
<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?xml-stylesheet type="text/xsl" href="configuration.xsl"?>
<configuration>
  <!-- PostgreSQL metastore connection -->
  <property>
    <name>javax.jdo.option.ConnectionDriverName</name>
    <value>org.postgresql.Driver</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionURL</name>
    <value>jdbc:postgresql://${POSTGRES_HOST}:5432/metastore</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionUserName</name>
    <value>hive</value>
  </property>
  <property>
    <name>javax.jdo.option.ConnectionPassword</name>
    <value>hive</value>
  </property>
  <!-- Default warehouse location -->
  <property>
    <name>hive.metastore.warehouse.dir</name>
    <value>/workspaces/spark-sandbox/projects/spark-scala/warehouse</value>
  </property>
  <!-- Schema is pre-initialized, disable auto-create -->
  <property>
    <name>datanucleus.schema.autoCreateAll</name>
    <value>false</value>
  </property>
  <property>
    <name>hive.metastore.schema.verification</name>
    <value>true</value>
  </property>
  <property>
    <name>hive.metastore.schema.verification.record.version</name>
    <value>true</value>
  </property>
  <!-- Connection settings -->
  <property>
    <name>datanucleus.connectionPoolingType</name>
    <value>DBCP</value>
  </property>
  <property>
    <name>datanucleus.connectionPool.maxPoolSize</name>
    <value>10</value>
  </property>
  <!-- Disable stats -->
  <property>
    <name>hive.stats.autogather</name>
    <value>false</value>
  </property>
</configuration>
EOF

# Copy to Spark's conf directory (this is what Spark actually reads)
echo "Copying to $SPARK_HIVE_SITE"
sudo cp "$HIVE_SITE" "$SPARK_HIVE_SITE"

echo "hive-site.xml configured successfully"
