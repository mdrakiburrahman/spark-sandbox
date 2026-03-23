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

{# Resolve source schema based on target: local uses _prod mount, Fabric uses base DB #}
{% macro resolve_source_schema() %}
    {%- if target.name == 'local-local' -%}
        data_ops_inventory_db_prod
    {%- else -%}
        data_ops_inventory_db
    {%- endif -%}
{% endmacro %}
