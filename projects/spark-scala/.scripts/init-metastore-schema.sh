#!/bin/bash
# Initialize the Hive metastore schema in PostgreSQL
# This downloads and applies the official Hive 2.3.0 schema

set -e

CONTAINER_NAME="spark-sandbox-postgres-1"
SCHEMA_URL="https://raw.githubusercontent.com/apache/hive/rel/release-2.3.0/metastore/scripts/upgrade/postgres/hive-schema-2.3.0.postgres.sql"
TMP_SCHEMA="/tmp/hive-schema.sql"

# Check if schema already exists
TABLE_COUNT=$(docker exec "$CONTAINER_NAME" psql -U hive -d metastore -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')

if [ "$TABLE_COUNT" -gt "10" ]; then
    echo "Hive metastore schema already initialized ($TABLE_COUNT tables found)"
    exit 0
fi

echo "Initializing Hive metastore schema..."

# Download schema
echo "Downloading Hive 2.3.0 schema for PostgreSQL..."
curl -sL "$SCHEMA_URL" -o "$TMP_SCHEMA"

# Drop and recreate public schema
echo "Resetting public schema..."
docker exec "$CONTAINER_NAME" psql -U hive -d metastore -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO hive;" >/dev/null

# Copy and apply schema
echo "Applying Hive schema..."
docker cp "$TMP_SCHEMA" "$CONTAINER_NAME":/tmp/hive-schema.sql
docker exec "$CONTAINER_NAME" psql -U hive -d metastore -f /tmp/hive-schema.sql >/dev/null 2>&1

# Verify
TABLE_COUNT=$(docker exec "$CONTAINER_NAME" psql -U hive -d metastore -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" | tr -d ' ')
echo "Schema initialized successfully ($TABLE_COUNT tables created)"

# Cleanup
rm -f "$TMP_SCHEMA"
