package me.rakirahman.lineage.openlineage

import me.rakirahman.lineage._
import me.rakirahman.lineage.diagram.{DiagramOrientation, HexColors, LineageDiagramOperations}
import me.rakirahman.metastore.sql.SqlMetastoreOperations

import org.apache.spark.internal.Logging
import org.apache.spark.sql.{DataFrame, Row, SparkSession}

/** The lineage result specific to OpenLineage telemetry.
  */
case class OpenLineageLineage(
    tableEdges: Seq[TableLineageEdge],
    columnEdges: Seq[ColumnLineageEdge],
    datasets: Seq[LineageDataset]
)

object OpenLineageLineage {
  val empty: OpenLineageLineage = OpenLineageLineage(Seq.empty, Seq.empty, Seq.empty)
}

/** Extracts table-level and column-level lineage from OpenLineage events.
  */
class OpenLineageExtractor private (
    spark: SparkSession,
    metastoreOps: SqlMetastoreOperations,
    viewName: String
) extends LineageExtractor[OpenLineageLineage]
    with Logging
    with LineageDiagramOperations {

  override def getLineage(): OpenLineageLineage = {
    val tableEdges = extractTableEdges()
    val columnEdges = extractColumnEdges()
    val schemas = extractDatasetSchemas()
    val datasets = deriveDatasets(tableEdges, schemas)

    OpenLineageLineage(tableEdges, columnEdges, datasets)
  }

  override def getLineageAsMermaid(
      diagramTitle: String = "Table Lineage",
      diagramOrientation: DiagramOrientation.Orientation = DiagramOrientation.LeftToRight
  ): String = {
    val lineage = getLineage()
    OpenLineageExtractor.toMermaid(lineage, diagramTitle, diagramOrientation)
  }

  private def extractTableEdges(): Seq[TableLineageEdge] = {
    try {
      val query = OpenLineageLineageQueries.tableLineageQuery(viewName)
      val rows = spark.sql(query).collect()
      rows.map { row =>
        TableLineageEdge(
          source = DatasetIdentifier(
            namespace = row.getAs[String]("input_namespace"),
            name = row.getAs[String]("input_name")
          ),
          target = DatasetIdentifier(
            namespace = row.getAs[String]("output_namespace"),
            name = row.getAs[String]("output_name")
          ),
          jobName = row.getAs[String]("job_name"),
          jobNamespace = row.getAs[String]("job_namespace")
        )
      }.toSeq
    } catch {
      case e: Exception =>
        logWarning(s"Failed to extract table lineage: ${e.getMessage}")
        Seq.empty
    }
  }

  private def extractColumnEdges(): Seq[ColumnLineageEdge] = {
    try {
      val query = OpenLineageLineageQueries.columnLineageQuery(viewName)
      val rows = spark.sql(query).collect()
      rows.map { row =>
        ColumnLineageEdge(
          sourceDataset = DatasetIdentifier(
            namespace = row.getAs[String]("source_namespace"),
            name = row.getAs[String]("source_name")
          ),
          sourceField = row.getAs[String]("source_field"),
          targetDataset = DatasetIdentifier(
            namespace = row.getAs[String]("target_namespace"),
            name = row.getAs[String]("target_name")
          ),
          targetField = row.getAs[String]("target_field"),
          transformationType = row.getAs[String]("transformation_type"),
          transformationSubtype = row.getAs[String]("transformation_subtype")
        )
      }.toSeq
    } catch {
      case e: Exception =>
        logWarning(s"Failed to extract column lineage: ${e.getMessage}")
        Seq.empty
    }
  }

  private def extractDatasetSchemas(): Map[DatasetIdentifier, Seq[SchemaField]] = {
    try {
      val query = OpenLineageLineageQueries.datasetSchemaQuery(viewName)
      val rows = spark.sql(query).collect()
      rows
        .groupBy(row =>
          DatasetIdentifier(
            namespace = row.getAs[String]("namespace"),
            name = row.getAs[String]("name")
          )
        )
        .map { case (id, fieldRows) =>
          id -> fieldRows
            .map(row =>
              SchemaField(
                name = row.getAs[String]("field_name"),
                fieldType = row.getAs[String]("field_type"),
                description = Option(row.getAs[String]("field_description"))
              )
            )
            .toSeq
        }
    } catch {
      case e: Exception =>
        logWarning(s"Failed to extract dataset schemas: ${e.getMessage}")
        Map.empty
    }
  }

  private def deriveDatasets(
      tableEdges: Seq[TableLineageEdge],
      schemas: Map[DatasetIdentifier, Seq[SchemaField]]
  ): Seq[LineageDataset] = {
    val sourceIds = tableEdges.map(_.source).toSet
    val targetIds = tableEdges.map(_.target).toSet
    val allIds = sourceIds ++ targetIds

    allIds.map { id =>
      val isSource = sourceIds.contains(id)
      val isTarget = targetIds.contains(id)
      val role = (isSource, isTarget) match {
        case (true, true)   => DatasetRole.Intermediate
        case (true, false)  => DatasetRole.Source
        case (false, true)  => DatasetRole.Target
        case (false, false) => DatasetRole.Source
      }

      LineageDataset(
        identifier = id,
        shortName = OpenLineageExtractor.shortDatasetName(id.name),
        schema = schemas.getOrElse(id, Seq.empty),
        role = role
      )
    }.toSeq
  }
}

object OpenLineageExtractor {

  private val DefaultDatabase = "data_ops_inventory_db"
  private val DefaultTable = "openlineage"
  private val DefaultLookbackDays = 14
  private val TempViewName = "openlineage_lineage_source"

  /** Creates an OpenLineageExtractor from a DataFrame (for unit testing).
    */
  def apply(spark: SparkSession, openLineageDf: DataFrame): OpenLineageExtractor = {
    openLineageDf.createOrReplaceTempView(TempViewName)
    new OpenLineageExtractor(spark, SqlMetastoreOperations(spark), TempViewName)
  }

  /** Creates an OpenLineageExtractor from a database and table (for production).
    */
  def apply(
      spark: SparkSession,
      database: String = DefaultDatabase,
      table: String = DefaultTable,
      lookbackDays: Int = DefaultLookbackDays
  ): OpenLineageExtractor = {
    val query = OpenLineageLineageQueries.sourceViewQuery(database, table, lookbackDays)
    spark.sql(query).createOrReplaceTempView(TempViewName)
    new OpenLineageExtractor(spark, SqlMetastoreOperations(spark), TempViewName)
  }

  private[openlineage] def shortDatasetName(name: String): String = {
    val parts = name.split("/")
    val dbPartIndex = parts.indexWhere(_.endsWith(".db"))
    if (dbPartIndex >= 0) {
      parts.drop(dbPartIndex).mkString("/")
    } else {
      parts.takeRight(2).mkString("/")
    }
  }

  /** Generates a Mermaid diagram from lineage data.
    *
    * @param standaloneDatasets
    *   Additional dataset labels to include as nodes even without lineage edges.
    */
  def toMermaid(
      lineage: OpenLineageLineage,
      diagramTitle: String = "Table Lineage",
      diagramOrientation: DiagramOrientation.Orientation = DiagramOrientation.LeftToRight,
      standaloneDatasets: Seq[String] = Seq.empty
  ): String = {
    val mermaidBuilder = new StringBuilder
    mermaidBuilder.append(s"graph $diagramOrientation\n")
    mermaidBuilder.append(s"    %% $diagramTitle\n\n")

    if (lineage.tableEdges.isEmpty && standaloneDatasets.isEmpty) {
      mermaidBuilder.append("    empty[\"No lineage data found\"]\n")
      return mermaidBuilder.toString()
    }

    // Derive datasets with roles for styling
    val sourceIds = lineage.tableEdges.map(_.source).toSet
    val targetIds = lineage.tableEdges.map(_.target).toSet
    val allIds = sourceIds ++ targetIds

    // Add dataset nodes from lineage
    allIds.foreach { id =>
      val sanitized = sanitizeNodeName(id.key)
      val label = shortDatasetName(id.name)
      mermaidBuilder.append(s"""    $sanitized["$label"]\n""")
    }

    // Add standalone dataset nodes (metastore tables not in lineage)
    // Normalize names for comparison: "demo_etl.db/customers" and "demo_etl.customers"
    // should match, as should "dbt_adventureworks_seed/customer" and "dbt_adventureworks_seed.customer"
    val lineageNodeNormalized = allIds.map(id => normalizeDatasetName(shortDatasetName(id.name))).toSet
    val addedStandalone = scala.collection.mutable.Set[String]()
    standaloneDatasets.sorted.foreach { label =>
      val normalized = normalizeDatasetName(label)
      if (!lineageNodeNormalized.contains(normalized) && !addedStandalone.contains(normalized)) {
        addedStandalone.add(normalized)
        val sanitized = sanitizeNodeName(label)
        mermaidBuilder.append(s"""    $sanitized["$label"]\n""")
      }
    }
    mermaidBuilder.append("\n")

    // Add edges (deduplicated dataset-to-dataset)
    val edgeSet = scala.collection.mutable.Set[String]()
    lineage.tableEdges.foreach { edge =>
      val srcSanitized = sanitizeNodeName(edge.source.key)
      val tgtSanitized = sanitizeNodeName(edge.target.key)
      val edgeKey = s"$srcSanitized-->$tgtSanitized"
      if (!edgeSet.contains(edgeKey)) {
        edgeSet.add(edgeKey)
        mermaidBuilder.append(s"    $srcSanitized --> $tgtSanitized\n")
      }
    }

    // Add styling
    mermaidBuilder.append(s"\n    classDef source fill:${HexColors.GreenLight},stroke:${HexColors.Green},stroke-width:2px\n")
    mermaidBuilder.append(s"    classDef intermediate fill:${HexColors.YellowLight},stroke:${HexColors.Yellow},stroke-width:2px\n")
    mermaidBuilder.append(s"    classDef target fill:${HexColors.RedLight},stroke:${HexColors.Red},stroke-width:2px\n")
    mermaidBuilder.append(s"    classDef standalone fill:${HexColors.GrayLight},stroke:${HexColors.Gray},stroke-width:1px\n")

    allIds.foreach { id =>
      val sanitized = sanitizeNodeName(id.key)
      val isSource = sourceIds.contains(id)
      val isTarget = targetIds.contains(id)
      val role = (isSource, isTarget) match {
        case (true, true)   => "intermediate"
        case (true, false)  => "source"
        case (false, true)  => "target"
        case (false, false) => "source"
      }
      mermaidBuilder.append(s"    class $sanitized $role\n")
    }

    addedStandalone.toSeq.sorted.foreach { normalizedLabel =>
      // Find the original label for this normalized name
      val originalLabel = standaloneDatasets.find(l => normalizeDatasetName(l) == normalizedLabel).getOrElse(normalizedLabel)
      val sanitized = sanitizeNodeName(originalLabel)
      mermaidBuilder.append(s"    class $sanitized standalone\n")
    }

    mermaidBuilder.toString()
  }

  /** Filters lineage to only include edges involving datasets whose name contains any of the patterns.
    */
  def filterLineageForDataset(
      lineage: OpenLineageLineage,
      datasetNamePatterns: String*
  ): OpenLineageLineage = {
    def matchesAny(name: String): Boolean = datasetNamePatterns.exists(name.contains)
    val matchingEdges = lineage.tableEdges.filter { edge =>
      matchesAny(edge.source.name) || matchesAny(edge.target.name)
    }
    val matchingColumnEdges = lineage.columnEdges.filter { edge =>
      matchesAny(edge.sourceDataset.name) || matchesAny(edge.targetDataset.name)
    }
    val matchingDatasets = lineage.datasets.filter { ds =>
      matchingEdges.exists(e => e.source == ds.identifier || e.target == ds.identifier)
    }
    OpenLineageLineage(matchingEdges, matchingColumnEdges, matchingDatasets)
  }

  private[openlineage] def sanitizeNodeName(name: String): String = {
    name
      .replaceAll("[^a-zA-Z0-9_]", "_")
      .replaceAll("^([0-9])", "T$1")
      .replaceAll("_{2,}", "_")
  }

  /** Normalizes a dataset name for comparison by stripping the .db suffix and
    * converting separators to dots (e.g. "demo_etl.db/customers" → "demo_etl.customers",
    * "dbt_adventureworks_seed/customer" → "dbt_adventureworks_seed.customer").
    */
  private[openlineage] def normalizeDatasetName(name: String): String = {
    name
      .replaceAll("\\.db/", ".")
      .replaceAll("/", ".")
  }
}
