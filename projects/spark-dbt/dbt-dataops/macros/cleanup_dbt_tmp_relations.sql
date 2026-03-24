{#
    Drops orphaned __dbt_tmp tables left by incremental models.

    The fabricspark adapter's catalog generation (dbt docs generate) enumerates
    all Hive metastore relations and runs DESCRIBE TABLE EXTENDED on each one.
    After an incremental append, the *__dbt_tmp staging table is dropped but its
    metastore entry can linger, causing a TABLE_OR_VIEW_NOT_FOUND error during
    catalog generation.

    These temp tables are registered in the default database (empty prefix),
    not in the target schema, so the DROP must omit the schema qualifier.

    Called via dbt run-operation in run-dbt-local.sh between dbt build and
    dbt docs generate.
#}

{% macro cleanup_dbt_tmp_relations() %}
    {% if execute %}
        {% set schema = target.schema %}
        {% set results = run_query("SHOW TABLES IN " ~ schema) %}
        {% if results %}
            {% for row in results.rows %}
                {% set db = row[0] %}
                {% set table_name = row[1] %}
                {% if table_name.endswith('__dbt_tmp') %}
                    {% if db %}
                        {% set fqn = db ~ ".`" ~ table_name ~ "`" %}
                    {% else %}
                        {% set fqn = "`" ~ table_name ~ "`" %}
                    {% endif %}
                    {% do run_query("DROP TABLE IF EXISTS " ~ fqn) %}
                    {{ log("Dropped orphaned temp table: " ~ fqn, info=True) }}
                {% endif %}
            {% endfor %}
        {% endif %}
    {% endif %}
{% endmacro %}
