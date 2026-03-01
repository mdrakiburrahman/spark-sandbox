package me.rakirahman.deltalog

import java.sql.Timestamp

/** A single commit entry from a Delta table's transaction log. */
case class DeltaCommitEntry(
    databaseName: String,
    tableName: String,
    tableFqn: String,
    tableId: Option[String],
    version: Long,
    commitTimestamp: Timestamp,
    operation: String,
    operationParameters: Option[Map[String, String]],
    operationMetrics: Option[Map[String, String]],
    readVersion: Option[Long],
    isolationLevel: Option[String],
    isBlindAppend: Option[Boolean],
    userId: Option[String],
    userName: Option[String],
    userMetadata: Option[String],
    // Denormalized metrics for query performance
    numOutputRows: Option[Long],
    numAddedFiles: Option[Long],
    numRemovedFiles: Option[Long],
    numOutputBytes: Option[Long],
    executionTimeMs: Option[Long]
)

/** A point-in-time snapshot of Delta table metadata from DESCRIBE DETAIL. */
case class DeltaTableSnapshot(
    databaseName: String,
    tableName: String,
    tableFqn: String,
    tableId: Option[String],
    format: String,
    location: String,
    createdAt: Timestamp,
    lastModified: Timestamp,
    numFiles: Long,
    sizeInBytes: Long,
    sizeInGb: Double,
    partitionColumns: Array[String],
    clusteringColumns: Array[String],
    tableProperties: Map[String, String],
    minReaderVersion: Int,
    minWriterVersion: Int
)

/** Freshness assessment for a single table. */
case class FreshnessAssessment(
    status: String,
    lastCommitTimestamp: Timestamp,
    predictedNextCommit: Option[Timestamp],
    medianCommitIntervalSeconds: Long,
    p95CommitIntervalSeconds: Long,
    commitsInLast24h: Int,
    commitsInLast7d: Int,
    daysSinceLastCommit: Double
)

/** Completeness assessment for a single table. */
case class CompletenessAssessment(
    status: String,
    dailyRowCountActual: Long,
    dailyRowCountMinExpected: Option[Long],
    dailyRowCountMaxExpected: Option[Long],
    totalRowCount: Option[Long]
)

/** Operational metrics for a single table. */
case class OperationalMetrics(
    latestVersion: Long,
    numFiles: Long,
    sizeInBytes: Long,
    avgFileSizeBytes: Long,
    mostCommonOperation: String,
    optimizeCount7d: Int,
    vacuumCount7d: Int
)

/** Full KPI result for a single table. */
case class DeltaLogKpiResult(
    databaseName: String,
    tableName: String,
    tableFqn: String,
    status: String,
    evaluationTimestamp: Timestamp,
    freshness: FreshnessAssessment,
    completeness: CompletenessAssessment,
    operational: OperationalMetrics
)

/** Aggregate result across the estate. */
case class DeltaLogEstateKpis(
    results: Seq[DeltaLogKpiResult],
    totalTables: Int,
    healthyTables: Int,
    unhealthyTables: Int,
    trainingTables: Int
)
