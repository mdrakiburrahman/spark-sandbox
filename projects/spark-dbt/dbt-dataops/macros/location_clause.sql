{#
    Override of the fabricspark adapter's location_clause.

    The Fabric Spark runtime resolves 'none/' to the default lakehouse path inside
    notebooks, but OneLake rejects it from external Livy sessions (local-fabric).
    Treat location_root='none' as "no custom location" so Spark uses the default
    managed table path, which works for all targets.
#}
{% macro fabricspark__location_clause() %}
  {%- set location_root = config.get('location_root', validator=validation.any[basestring]) -%}
  {%- set identifier = model['alias'] -%}
  {%- if location_root is not none and location_root not in ('', 'none') %}
    location '{{ location_root }}/{{ identifier }}'
  {%- endif %}
{%- endmacro -%}
