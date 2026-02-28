package me.rakirahman.deltalog

import me.rakirahman.lineage.diagram.HexColors

/** Generates Mermaid diagrams and text reports for Delta Log KPI results. */
object DeltaLogVisualization {

  /** Generates a Mermaid diagram showing table health status across the estate, grouped by database with color-coded health indicators.
    */
  //@formatter:off
  def healthSummaryDiagram(results: Seq[DeltaLogKpiResult]): String = {
    val sb = new StringBuilder
    sb.append("graph TD\n")
    sb.append("    %% Delta Lake Estate Health Summary\n\n")

    val byDatabase = results.groupBy(_.databaseName)
    byDatabase.toSeq.sortBy(_._1).foreach { case (db, tables) =>
      val dbNode = sanitize(db)
      sb.append(s"""    subgraph $dbNode["$db"]\n""")
      tables.sortBy(_.tableName).foreach { result =>
        val tableNode = sanitize(result.tableFqn)
        val statusIcon = result.status match {
          case "Healthy"   => "✅"
          case "Unhealthy" => "❌"
          case "Training"  => "🔄"
          case _           => "❓"
        }
        sb.append(s"""        $tableNode["$statusIcon ${result.tableName}"]\n""")
      }
      sb.append("    end\n\n")
    }

    sb.append(s"    classDef healthy fill:${HexColors.GreenLight},stroke:${HexColors.Green}\n")
    sb.append(s"    classDef unhealthy fill:${HexColors.RedLight},stroke:${HexColors.Red}\n")
    sb.append(s"    classDef training fill:${HexColors.YellowLight},stroke:${HexColors.Yellow}\n")

    results.foreach { r =>
      val cls = r.status.toLowerCase
      sb.append(s"    class ${sanitize(r.tableFqn)} $cls\n")
    }

    sb.toString()
  }

  /** Generates a commit timeline diagram for a single table showing recent commits as a Mermaid gantt chart.
    */
  def commitTimelineDiagram(
      tableFqn: String,
      commits: Seq[DeltaCommitEntry],
      limit: Int = 20
  ): String = {
    val sb = new StringBuilder
    sb.append("gantt\n")
    sb.append(s"    title Commit Timeline: $tableFqn\n")
    sb.append("    dateFormat YYYY-MM-DD HH:mm\n")
    sb.append("    axisFormat %m/%d %H:%M\n\n")

    val recentCommits = commits.sortBy(_.version).takeRight(limit)
    recentCommits.foreach { commit =>
      val ts = commit.commitTimestamp.toString.take(16)
      val label = s"v${commit.version} ${commit.operation}"
      val rows = commit.numOutputRows.map(r => s" (${r}r)").getOrElse("")
      sb.append(s"    $label$rows :${ts}, 1m\n")
    }

    sb.toString()
  }

  /** Generates a text-based health report suitable for logging. */
  def healthReport(results: DeltaLogEstateKpis): String = {
    val sb = new StringBuilder
    sb.append("═══════════════════════════════════════════════════════════\n")
    sb.append("  DELTA LAKE ESTATE HEALTH REPORT\n")
    sb.append("═══════════════════════════════════════════════════════════\n")
    sb.append(s"  Total Tables:    ${results.totalTables}\n")
    sb.append(s"  Healthy:         ${results.healthyTables} (${pct(results.healthyTables, results.totalTables)}%)\n")
    sb.append(s"  Unhealthy:       ${results.unhealthyTables} (${pct(results.unhealthyTables, results.totalTables)}%)\n")
    sb.append(s"  Training:        ${results.trainingTables}\n")
    sb.append("───────────────────────────────────────────────────────────\n\n")

    results.results.filter(_.status == "Unhealthy").foreach { r =>
      sb.append(s"  ❌ ${r.tableFqn}\n")
      sb.append(f"     Freshness:    ${r.freshness.status} (last commit: ${r.freshness.daysSinceLastCommit}%.1f days ago)\n")
      sb.append(
                s"     Completeness: ${r.completeness.status} (${r.completeness.dailyRowCountActual} rows" +
                s" vs ${r.completeness.dailyRowCountMinExpected.getOrElse(0)}-${r.completeness.dailyRowCountMaxExpected.getOrElse(0)} expected)\n"
               )
      sb.append("\n")
    }

    results.results.filter(_.status == "Healthy").foreach { r => sb.append(s"  ✅ ${r.tableFqn}\n") }
    results.results.filter(_.status == "Training").foreach { r => sb.append(s"  🔄 ${r.tableFqn}\n") }

    sb.toString()
  }
  //@formatter:on

  /** Sanitizes a name for use as a Mermaid node identifier. */
  private[deltalog] def sanitize(name: String): String =
    name.replaceAll("[^a-zA-Z0-9_]", "_").replaceAll("_{2,}", "_")

  private def pct(part: Int, total: Int): Int =
    if (total == 0) 0 else (part * 100) / total
}
