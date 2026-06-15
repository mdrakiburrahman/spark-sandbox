{#
    Drops every table in every schema this dbt project writes to, when running
    under GH Actions (IS_GH_ACTION=1). The self-hosted GCI runners share a
    persisted Hive metastore (SQL Server) across runs while the workspace is
    ephemeral, so catalog entries from a previous run point at Delta paths whose
    files no longer exist. dbt-fabricspark's snapshot + incremental
    materializations issue a DescribeRelation pre-check that fails fatally on
    those phantom entries (and then retries 25 times via `retry_all: true`).

    Dropping the offending catalog entries up-front lets dbt rebuild from
    scratch. DROP TABLE on a managed Delta table is metastore-only — it removes
    the catalog row without re-reading the transaction log, so it succeeds even
    when the underlying Delta files are gone. Views need DROP VIEW (Spark
    refuses DROP TABLE on a view with [WRONG_COMMAND_FOR_OBJECT_TYPE]), so we
    enumerate views via SHOW VIEWS and drop them separately first.
#}
{% macro _ci_reset_state() %}
    {%- if not execute -%}
        {%- do return(none) -%}
    {%- endif -%}
    {%- if env_var('IS_GH_ACTION', '0') != '1' -%}
        {{ log('_ci_reset_state: IS_GH_ACTION!=1; skipping CI reset', info=true) }}
        {%- do return(none) -%}
    {%- endif -%}

    {%- set schemas = [] -%}
    {%- for node in graph.nodes.values() -%}
        {%- if node.schema and node.schema not in schemas -%}
            {%- do schemas.append(node.schema) -%}
        {%- endif -%}
    {%- endfor -%}

    {%- for schema in schemas -%}
        {%- set check = run_query("SHOW DATABASES LIKE '" ~ schema ~ "'") -%}
        {%- if check is not none and check.rows | length > 0 -%}
            {{ log('_ci_reset_state: clearing schema ' ~ schema, info=true) }}

            {%- set view_names = [] -%}
            {%- set views = run_query("SHOW VIEWS IN `" ~ schema ~ "`") -%}
            {%- if views is not none -%}
                {%- for row in views.rows -%}
                    {%- set vname = row[1] -%}
                    {%- do view_names.append(vname) -%}
                    {%- set drop_sql = 'DROP VIEW IF EXISTS `' ~ schema ~ '`.`' ~ vname ~ '`' -%}
                    {{ log('  -> ' ~ drop_sql, info=true) }}
                    {%- do run_query(drop_sql) -%}
                {%- endfor -%}
            {%- endif -%}

            {%- set tables = run_query("SHOW TABLES IN `" ~ schema ~ "`") -%}
            {%- if tables is not none -%}
                {%- for row in tables.rows -%}
                    {%- set tname = row[1] -%}
                    {%- if tname not in view_names -%}
                        {%- set drop_sql = 'DROP TABLE IF EXISTS `' ~ schema ~ '`.`' ~ tname ~ '`' -%}
                        {{ log('  -> ' ~ drop_sql, info=true) }}
                        {%- do run_query(drop_sql) -%}
                    {%- endif -%}
                {%- endfor -%}
            {%- endif -%}
        {%- else -%}
            {{ log('_ci_reset_state: schema ' ~ schema ~ ' does not exist; skipping', info=true) }}
        {%- endif -%}
    {%- endfor -%}
{% endmacro %}
