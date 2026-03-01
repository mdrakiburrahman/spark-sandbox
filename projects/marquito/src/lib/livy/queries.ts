// Named SQL query constants for OpenLineage lineage extraction.
// Ported from OpenLineageLineageQueries.scala so both the UI and CLI script share the same queries.

const OPENLINEAGE_TABLE = 'data_ops_inventory_db.openlineage';

/** JSON schema for parsing OpenLineage outputs array from request_body. */
const OutputsJsonSchema =
  `ARRAY<STRUCT<` +
  `namespace: STRING, name: STRING, ` +
  `facets: STRUCT<` +
  `columnLineage: STRUCT<fields: MAP<STRING, STRUCT<inputFields: ARRAY<STRUCT<namespace: STRING, name: STRING, field: STRING, transformations: ARRAY<STRUCT<type: STRING, subtype: STRING>>>>>>>, ` +
  `schema: STRUCT<fields: ARRAY<STRUCT<name: STRING, type: STRING, description: STRING>>>` +
  `>` +
  `>>`;

/** JSON schema for parsing OpenLineage inputs array from request_body. */
const InputsJsonSchema =
  `ARRAY<STRUCT<` +
  `namespace: STRING, name: STRING, ` +
  `facets: STRUCT<` +
  `schema: STRUCT<fields: ARRAY<STRUCT<name: STRING, type: STRING, description: STRING>>>` +
  `>` +
  `>>`;

export interface NamedQuery {
  name: string;
  description: string;
  sql: string;
}

/** Source view query with partition pruning. */
export function sourceQuery(lookbackDays: number = 14): NamedQuery {
  return {
    name: 'source',
    description: 'Filtered OpenLineage events within lookback window',
    sql: `SELECT * FROM ${OPENLINEAGE_TABLE} WHERE event_year_date >= date_format(date_sub(current_date(), ${lookbackDays}), 'yyyyMMdd')`,
  };
}

/** Table-level lineage using flattened columns. */
export function tableLineageQuery(lookbackDays: number = 14): NamedQuery {
  return {
    name: 'tableLineage',
    description: 'Distinct table-level lineage edges (source → target) from flattened columns',
    sql: `SELECT DISTINCT
  inputs_name AS input_name,
  inputs_namespace AS input_namespace,
  outputs_name AS output_name,
  outputs_namespace AS output_namespace,
  job_name,
  job_namespace
FROM ${OPENLINEAGE_TABLE}
WHERE event_year_date >= date_format(date_sub(current_date(), ${lookbackDays}), 'yyyyMMdd')
  AND eventType = 'COMPLETE'
  AND inputs_name IS NOT NULL
  AND outputs_name IS NOT NULL`,
  };
}

/** Fallback table lineage query that parses request_body JSON (in case flattened columns are unavailable). */
export function tableLineageFromJsonQuery(lookbackDays: number = 14): NamedQuery {
  return {
    name: 'tableLineageFromJson',
    description: 'Table-level lineage edges extracted from request_body JSON',
    sql: `SELECT DISTINCT
  input_dataset AS input_name,
  input_namespace AS input_namespace,
  output_dataset AS output_name,
  output_namespace AS output_namespace,
  job_name,
  job_namespace
FROM (
  SELECT
    input_entry.name AS input_dataset,
    input_entry.namespace AS input_namespace,
    output_entry.name AS output_dataset,
    output_entry.namespace AS output_namespace,
    get_json_object(request_body, '$.job.name') AS job_name,
    get_json_object(request_body, '$.job.namespace') AS job_namespace,
    get_json_object(request_body, '$.eventType') AS event_type
  FROM ${OPENLINEAGE_TABLE}
  LATERAL VIEW explode(from_json(get_json_object(request_body, '$.inputs'), '${InputsJsonSchema}')) AS input_entry
  LATERAL VIEW explode(from_json(get_json_object(request_body, '$.outputs'), '${OutputsJsonSchema}')) AS output_entry
  WHERE event_year_date >= date_format(date_sub(current_date(), ${lookbackDays}), 'yyyyMMdd')
    AND request_body IS NOT NULL
)
WHERE event_type = 'COMPLETE'
  AND input_dataset IS NOT NULL
  AND output_dataset IS NOT NULL`,
  };
}

/** Column-level lineage by parsing request_body JSON. */
export function columnLineageQuery(lookbackDays: number = 14): NamedQuery {
  return {
    name: 'columnLineage',
    description: 'Column-level lineage edges with transformation metadata',
    sql: `WITH complete_events AS (
  SELECT DISTINCT request_body
  FROM ${OPENLINEAGE_TABLE}
  WHERE event_year_date >= date_format(date_sub(current_date(), ${lookbackDays}), 'yyyyMMdd')
    AND eventType = 'COMPLETE'
    AND request_body IS NOT NULL
),
parsed AS (
  SELECT
    from_json(get_json_object(request_body, '$.outputs'), '${OutputsJsonSchema}') AS outputs
  FROM complete_events
),
exploded_outputs AS (
  SELECT explode(outputs) AS output_entry
  FROM parsed
  WHERE outputs IS NOT NULL
),
column_lineage_maps AS (
  SELECT
    output_entry.namespace AS target_namespace,
    output_entry.name AS target_name,
    explode(output_entry.facets.columnLineage.fields) AS (target_field, field_lineage)
  FROM exploded_outputs
  WHERE output_entry.facets IS NOT NULL
    AND output_entry.facets.columnLineage IS NOT NULL
    AND output_entry.facets.columnLineage.fields IS NOT NULL
),
column_edges AS (
  SELECT
    target_namespace,
    target_name,
    target_field,
    explode(field_lineage.inputFields) AS input_field
  FROM column_lineage_maps
  WHERE field_lineage.inputFields IS NOT NULL
)
SELECT DISTINCT
  input_field.namespace AS source_namespace,
  input_field.name AS source_name,
  input_field.field AS source_field,
  target_namespace,
  target_name,
  target_field,
  CASE
    WHEN input_field.transformations IS NOT NULL AND size(input_field.transformations) > 0
    THEN input_field.transformations[0].type
    ELSE 'UNKNOWN'
  END AS transformation_type,
  CASE
    WHEN input_field.transformations IS NOT NULL AND size(input_field.transformations) > 0
    THEN input_field.transformations[0].subtype
    ELSE 'UNKNOWN'
  END AS transformation_subtype
FROM column_edges`,
  };
}

/** Dataset schema fields from both inputs and outputs. */
export function datasetSchemaQuery(lookbackDays: number = 14): NamedQuery {
  return {
    name: 'datasetSchema',
    description: 'Schema fields for all datasets referenced in lineage events',
    sql: `WITH complete_events AS (
  SELECT DISTINCT request_body
  FROM ${OPENLINEAGE_TABLE}
  WHERE event_year_date >= date_format(date_sub(current_date(), ${lookbackDays}), 'yyyyMMdd')
    AND eventType = 'COMPLETE'
    AND request_body IS NOT NULL
),
parsed AS (
  SELECT
    from_json(get_json_object(request_body, '$.outputs'), '${OutputsJsonSchema}') AS outputs,
    from_json(get_json_object(request_body, '$.inputs'), '${InputsJsonSchema}') AS inputs
  FROM complete_events
),
all_datasets AS (
  SELECT oe.namespace, oe.name, oe.facets.schema AS ds_schema
  FROM (SELECT explode(outputs) AS oe FROM parsed WHERE outputs IS NOT NULL)
  UNION ALL
  SELECT ie.namespace, ie.name, ie.facets.schema AS ds_schema
  FROM (SELECT explode(inputs) AS ie FROM parsed WHERE inputs IS NOT NULL)
),
datasets_with_schemas AS (
  SELECT
    namespace,
    name,
    explode(ds_schema.fields) AS schema_field
  FROM all_datasets
  WHERE ds_schema IS NOT NULL
    AND ds_schema.fields IS NOT NULL
)
SELECT DISTINCT
  namespace,
  name,
  schema_field.name AS field_name,
  schema_field.type AS field_type,
  schema_field.description AS field_description
FROM datasets_with_schemas`,
  };
}

/** All named queries for the lineage extraction pipeline. */
export function allLineageQueries(lookbackDays: number = 14): NamedQuery[] {
  return [
    tableLineageQuery(lookbackDays),
    columnLineageQuery(lookbackDays),
    datasetSchemaQuery(lookbackDays),
  ];
}
