{#
    SCD helper macros for computing hash columns and surrogate keys.

    Usage:
      {{ scd2_hash(['col_a', 'col_b']) }}
      {{ scd1_hash(['col_x', 'col_y']) }}
      {{ surrogate_pk(['bk1', 'bk2'], 'row_effective_start') }}
#}

{% macro scd2_hash(columns) %}
    sha2(concat_ws('|', {{ columns | join(', ') }}), 256)
{% endmacro %}

{% macro scd1_hash(columns) %}
    sha2(concat_ws('|', {{ columns | join(', ') }}), 256)
{% endmacro %}

{% macro surrogate_pk(business_keys, effective_start_col) %}
    sha2(concat_ws('|', {{ business_keys | join(', ') }}, cast({{ effective_start_col }} as string)), 256)
{% endmacro %}

{% macro merge_effective_date() %}
    current_date()
{% endmacro %}

{% macro merge_ingest_time() %}
    current_timestamp()
{% endmacro %}

{#
    Prevent loading duplicate PKs into an incremental fact table.
    Generates a WHERE NOT EXISTS clause that filters out rows whose PK
    already exists in the target ({{ this }}).

    Usage (at end of model, after final CTE):
      select * from fact
      {{ fact_not_exists('commit_key', 'fact') }}

    Args:
      pk_column: Name of the primary key column
      alias:     Alias of the CTE/subquery being selected from
#}
{% macro fact_not_exists(pk_column, alias) %}
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM {{ this }} AS _existing
        WHERE {{ alias }}.{{ pk_column }} = _existing.{{ pk_column }}
    )
    {% endif %}
{% endmacro %}

{# Resolve source schema based on target: local uses _prod mount, Fabric uses base DB #}
{% macro resolve_source_schema() %}
    {%- if target.name == 'local-local' -%}
        data_ops_inventory_db_prod
    {%- else -%}
        data_ops_inventory_db
    {%- endif -%}
{% endmacro %}
