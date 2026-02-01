#!/bin/bash
#
# Downloads the PostgreSQL JDBC driver for Hive Metastore connectivity.
#
# The PostgreSQL JDBC driver is required for Spark to connect to a
# PostgreSQL-backed Hive Metastore. This script downloads the driver
# to Spark's jars directory.
#
# Usage:
#   ./get-postgres-driver.sh [version]
#
# Example:
#   ./get-postgres-driver.sh           # Uses default version
#   ./get-postgres-driver.sh 42.7.3    # Uses specific version
#

set -euo pipefail
trap '>&2 echo "Error at line $LINENO (process exited with code $?)"' ERR

# PostgreSQL JDBC driver version
# Compatible with PostgreSQL 8.2+ and Java 8+
# https://jdbc.postgresql.org/download/
POSTGRES_DRIVER_VERSION="${1:-42.7.3}"
SPARK_JARS_DIR="/opt/spark/jars"
POSTGRES_JAR="postgresql-${POSTGRES_DRIVER_VERSION}.jar"
POSTGRES_JAR_PATH="${SPARK_JARS_DIR}/${POSTGRES_JAR}"

echo "=== PostgreSQL JDBC Driver Setup ==="
echo "Driver version: ${POSTGRES_DRIVER_VERSION}"
echo "Target path: ${POSTGRES_JAR_PATH}"
echo

# Check if already installed
if [[ -f "${POSTGRES_JAR_PATH}" ]]; then
    echo "✓ PostgreSQL JDBC driver already installed at: ${POSTGRES_JAR_PATH}"
    exit 0
fi

# Ensure jars directory exists
mkdir -p "${SPARK_JARS_DIR}"

# Download the driver
echo "Downloading PostgreSQL JDBC driver..."
DOWNLOAD_URL="https://repo1.maven.org/maven2/org/postgresql/postgresql/${POSTGRES_DRIVER_VERSION}/${POSTGRES_JAR}"

if ! wget -q -P "${SPARK_JARS_DIR}" "${DOWNLOAD_URL}"; then
    echo >&2 "ERROR: Failed to download PostgreSQL JDBC driver from: ${DOWNLOAD_URL}"
    exit 1
fi

# Verify download
if [[ -f "${POSTGRES_JAR_PATH}" ]]; then
    echo "✓ Successfully installed PostgreSQL JDBC driver: ${POSTGRES_JAR_PATH}"
else
    echo >&2 "ERROR: Download succeeded but file not found at: ${POSTGRES_JAR_PATH}"
    exit 1
fi
