package me.rakirahman.lineage.openlineage

/** Spark SQL query constants for extracting lineage from OpenLineage telemetry.
  */
object OpenLineageLineageQueries {

  /** JSON schema for parsing OpenLineage outputs array from request_body.
    */
  val OutputsJsonSchema: String =
    """ARRAY<STRUCT<
      |  namespace: STRING,
      |  name: STRING,
      |  facets: STRUCT<
      |    columnLineage: STRUCT<
      |      fields: MAP<STRING, STRUCT<
      |        inputFields: ARRAY<STRUCT<
      |          namespace: STRING,
      |          name: STRING,
      |          field: STRING,
      |          transformations: ARRAY<STRUCT<type: STRING, subtype: STRING>>
      |        >>
      |      >>
      |    >,
      |    schema: STRUCT<
      |      fields: ARRAY<STRUCT<name: STRING, type: STRING, description: STRING>>
      |    >
      |  >
      |>>""".stripMargin.replaceAll("\\n", " ")

  /** JSON schema for parsing OpenLineage inputs array from request_body.
    */
  val InputsJsonSchema: String =
    """ARRAY<STRUCT<
      |  namespace: STRING,
      |  name: STRING,
      |  facets: STRUCT<
      |    schema: STRUCT<
      |      fields: ARRAY<STRUCT<name: STRING, type: STRING, description: STRING>>
      |    >
      |  >
      |>>""".stripMargin.replaceAll("\\n", " ")

  /** Query to create a filtered source view from the OpenLineage table. Applies partition pruning via event_year_date lookback.
    */
  def sourceViewQuery(database: String, table: String, lookbackDays: Int): String =
    s"""SELECT *
       |FROM $database.$table
       |WHERE event_year_date >= date_format(date_sub(current_date(), $lookbackDays), 'yyyyMMdd')
       |""".stripMargin

  /** Query to extract distinct table-level lineage edges from flattened columns.
    */
  def tableLineageQuery(viewName: String): String =
    s"""SELECT DISTINCT
       |  inputs_name AS input_name,
       |  inputs_namespace AS input_namespace,
       |  outputs_name AS output_name,
       |  outputs_namespace AS output_namespace,
       |  job_name,
       |  job_namespace
       |FROM $viewName
       |WHERE eventType = 'COMPLETE'
       |  AND inputs_name IS NOT NULL
       |  AND outputs_name IS NOT NULL
       |""".stripMargin

  /** Query to extract column-level lineage by parsing request_body JSON. Uses from_json to parse the outputs array, then explodes columnLineage.fields map.
    */
  def columnLineageQuery(viewName: String): String =
    s"""WITH complete_events AS (
       |  SELECT DISTINCT request_body
       |  FROM $viewName
       |  WHERE eventType = 'COMPLETE'
       |    AND request_body IS NOT NULL
       |),
       |parsed AS (
       |  SELECT
       |    from_json(
       |      get_json_object(request_body, '$$.outputs'),
       |      '$OutputsJsonSchema'
       |    ) AS outputs
       |  FROM complete_events
       |),
       |exploded_outputs AS (
       |  SELECT explode(outputs) AS output_entry
       |  FROM parsed
       |  WHERE outputs IS NOT NULL
       |),
       |column_lineage_maps AS (
       |  SELECT
       |    output_entry.namespace AS target_namespace,
       |    output_entry.name AS target_name,
       |    explode(output_entry.facets.columnLineage.fields) AS (target_field, field_lineage)
       |  FROM exploded_outputs
       |  WHERE output_entry.facets IS NOT NULL
       |    AND output_entry.facets.columnLineage IS NOT NULL
       |    AND output_entry.facets.columnLineage.fields IS NOT NULL
       |),
       |column_edges AS (
       |  SELECT
       |    target_namespace,
       |    target_name,
       |    target_field,
       |    explode(field_lineage.inputFields) AS input_field
       |  FROM column_lineage_maps
       |  WHERE field_lineage.inputFields IS NOT NULL
       |)
       |SELECT DISTINCT
       |  input_field.namespace AS source_namespace,
       |  input_field.name AS source_name,
       |  input_field.field AS source_field,
       |  target_namespace,
       |  target_name,
       |  target_field,
       |  CASE
       |    WHEN input_field.transformations IS NOT NULL AND size(input_field.transformations) > 0
       |    THEN input_field.transformations[0].type
       |    ELSE 'UNKNOWN'
       |  END AS transformation_type,
       |  CASE
       |    WHEN input_field.transformations IS NOT NULL AND size(input_field.transformations) > 0
       |    THEN input_field.transformations[0].subtype
       |    ELSE 'UNKNOWN'
       |  END AS transformation_subtype
       |FROM column_edges
       |""".stripMargin

  /** Query to extract dataset schema fields from request_body JSON. Parses both inputs and outputs to collect all known schemas.
    */
  def datasetSchemaQuery(viewName: String): String =
    s"""WITH complete_events AS (
       |  SELECT DISTINCT request_body
       |  FROM $viewName
       |  WHERE eventType = 'COMPLETE'
       |    AND request_body IS NOT NULL
       |),
       |parsed AS (
       |  SELECT
       |    from_json(
       |      get_json_object(request_body, '$$.outputs'),
       |      '$OutputsJsonSchema'
       |    ) AS outputs,
       |    from_json(
       |      get_json_object(request_body, '$$.inputs'),
       |      '$InputsJsonSchema'
       |    ) AS inputs
       |  FROM complete_events
       |),
       |all_datasets AS (
       |  SELECT oe.namespace, oe.name, oe.facets.schema AS ds_schema
       |  FROM (SELECT explode(outputs) AS oe FROM parsed WHERE outputs IS NOT NULL)
       |  UNION ALL
       |  SELECT ie.namespace, ie.name, ie.facets.schema AS ds_schema
       |  FROM (SELECT explode(inputs) AS ie FROM parsed WHERE inputs IS NOT NULL)
       |),
       |datasets_with_schemas AS (
       |  SELECT
       |    namespace,
       |    name,
       |    explode(ds_schema.fields) AS schema_field
       |  FROM all_datasets
       |  WHERE ds_schema IS NOT NULL
       |    AND ds_schema.fields IS NOT NULL
       |)
       |SELECT DISTINCT
       |  namespace,
       |  name,
       |  schema_field.name AS field_name,
       |  schema_field.type AS field_type,
       |  schema_field.description AS field_description
       |FROM datasets_with_schemas
       |""".stripMargin
}
