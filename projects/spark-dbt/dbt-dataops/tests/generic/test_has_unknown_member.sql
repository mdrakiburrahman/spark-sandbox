{#
  Kimball integrity: every dimension must carry exactly one unknown member so
  facts with an unresolved / null foreign key can resolve to it instead of
  dropping the row. By convention the unknown member lives at
  `<surrogate_key> = '-1'`.

  Fails when a dimension has zero or more than one unknown-member row. Apply at
  model level, passing the surrogate-key column:

      tests:
        - has_unknown_member:
            key_column: project_key
#}
{% test has_unknown_member(model, key_column) %}

SELECT COUNT(*) AS unknown_member_count
FROM {{ model }}
WHERE {{ key_column }} = '-1'
HAVING COUNT(*) <> 1

{% endtest %}
