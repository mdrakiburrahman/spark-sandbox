{# Override the default database macro to return 'lakehouse' instead of null #}
{% macro default__current_database() %}
    lakehouse
{% endmacro %}

{% macro fabricspark__current_database() %}
    lakehouse
{% endmacro %}
