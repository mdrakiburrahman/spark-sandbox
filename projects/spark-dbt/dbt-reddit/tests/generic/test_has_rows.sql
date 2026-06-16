{#
  Fails when a relation has zero rows. Apply at model level under `tests:` to
  guard against silent emptiness (e.g. an upstream pipeline produced no data).
#}
{% test has_rows(model) %}

SELECT 1
FROM {{ model }}
HAVING COUNT(*) = 0

{% endtest %}
