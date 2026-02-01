#!/bin/bash
#
#
#       Initialize the Hive metastore schema in PostgreSQL
#       by downloading and applying the official Hive 2.3.0 schema.
#
# ---------------------------------------------------------------------------------------
#
set -e

COMPOSE_FILE="../../docker-compose.yml"
CONTAINER="spark-sandbox-postgres-1"
SCHEMA_URL="https://raw.githubusercontent.com/apache/hive/rel/release-2.3.0/metastore/scripts/upgrade/postgres/hive-schema-2.3.0.postgres.sql"

docker compose -f "$COMPOSE_FILE" up -d
until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U hive; do sleep 1; done
psql() { docker exec "$CONTAINER" psql -U hive -d metastore "$@"; }
TABLE_COUNT=$(psql -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | tr -d ' ')
if [ "$TABLE_COUNT" -lt "10" ]; then
    echo "Initializing Hive metastore schema..."
    curl -sL "$SCHEMA_URL" | docker exec -i "$CONTAINER" psql -U hive -d metastore >/dev/null 2>&1
    echo "Schema initialized ($(psql -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" | tr -d ' ') tables)"
else
    echo "Schema exists ($TABLE_COUNT tables)"
fi