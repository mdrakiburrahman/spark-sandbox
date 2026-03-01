import {
  LivyConfig,
  LivyQueryResult,
  DeltaCommitEntry,
  DeltaTableSnapshot,
  FreshnessAssessment,
  CompletenessAssessment,
  KpiResult,
  QueryProgress,
  QueryInfo,
} from './types';
import { executeQuery } from './client';

// Database & table discovery

export async function getDatabases(
  config: LivyConfig,
  sessionId: string
): Promise<string[]> {
  const result = await executeQuery(config, sessionId, 'SHOW DATABASES');
  return result.rows.map((r) => String(r['namespace'] ?? r['databaseName'] ?? r[result.columns[0]]));
}

export async function getTables(
  config: LivyConfig,
  sessionId: string,
  database: string
): Promise<string[]> {
  const result = await executeQuery(config, sessionId, `SHOW TABLES IN ${database}`);
  return result.rows.map((r) => String(r['tableName'] ?? r[result.columns[1]] ?? r[result.columns[0]]));
}

export async function getAllTables(
  config: LivyConfig,
  sessionId: string,
  onProgress?: (msg: string, sql?: string) => void
): Promise<{ database: string; table: string; fqn: string }[]> {
  const databases = await getDatabases(config, sessionId);
  const allTables: { database: string; table: string; fqn: string }[] = [];

  for (const db of databases) {
    try {
      onProgress?.(`Discovering tables in ${db}...`, `SHOW TABLES IN ${db}`);
      const tables = await getTables(config, sessionId, db);
      for (const t of tables) {
        allTables.push({ database: db, table: t, fqn: `${db}.${t}` });
      }
    } catch {
      // Skip databases we can't read
    }
  }

  return allTables;
}

// Table metadata

export async function getTableSnapshot(
  config: LivyConfig,
  sessionId: string,
  tableFqn: string
): Promise<DeltaTableSnapshot | null> {
  try {
    const result = await executeQuery(config, sessionId, `DESCRIBE DETAIL ${tableFqn}`);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      tableFqn,
      tableId: String(row['id'] ?? ''),
      format: String(row['format'] ?? ''),
      location: String(row['location'] ?? ''),
      createdAt: String(row['createdAt'] ?? ''),
      lastModified: String(row['lastModified'] ?? ''),
      numFiles: Number(row['numFiles'] ?? 0),
      sizeInBytes: Number(row['sizeInBytes'] ?? 0),
      partitionColumns: String(row['partitionColumns'] ?? ''),
      clusteringColumns: String(row['clusteringColumns'] ?? ''),
    };
  } catch {
    return null;
  }
}

// Commit history

export async function getCommitHistory(
  config: LivyConfig,
  sessionId: string,
  tableFqn: string,
  limit: number = 500
): Promise<DeltaCommitEntry[]> {
  try {
    const result = await executeQuery(
      config,
      sessionId,
      `DESCRIBE HISTORY ${tableFqn} LIMIT ${limit}`
    );

    return result.rows.map((row) => parseCommitEntry(tableFqn, row));
  } catch {
    return [];
  }
}

function parseCommitEntry(tableFqn: string, row: Record<string, unknown>): DeltaCommitEntry {
  const metrics = row['operationMetrics'] as Record<string, string> | null;
  return {
    tableFqn,
    version: Number(row['version'] ?? 0),
    commitTimestamp: String(row['timestamp'] ?? ''),
    operation: String(row['operation'] ?? ''),
    numOutputRows: metrics ? Number(metrics['numOutputRows'] ?? 0) : null,
    numAddedFiles: metrics ? Number(metrics['numAddedFiles'] ?? 0) : null,
    numRemovedFiles: metrics ? Number(metrics['numRemovedFiles'] ?? 0) : null,
    numOutputBytes: metrics ? Number(metrics['numOutputBytes'] ?? 0) : null,
    executionTimeMs: metrics ? Number(metrics['executionTimeMs'] ?? 0) : null,
  };
}

// KPI calculations (ported from DeltaLogKpiQueries.scala)

const DATA_OPERATIONS = new Set(['WRITE', 'MERGE', 'STREAMING UPDATE', 'CREATE TABLE AS SELECT', 'REPLACE TABLE AS SELECT', 'CREATE OR REPLACE TABLE AS SELECT', 'CREATE OR REPLACE TABLE']);
const MAINTENANCE_OPERATIONS = new Set(['OPTIMIZE', 'VACUUM', 'RESTORE', 'SET TBLPROPERTIES']);

export function computeFreshness(
  tableFqn: string,
  commits: DeltaCommitEntry[]
): FreshnessAssessment {
  const dataCommits = commits
    .filter((c) => !MAINTENANCE_OPERATIONS.has(c.operation))
    .sort((a, b) => new Date(a.commitTimestamp).getTime() - new Date(b.commitTimestamp).getTime());

  if (dataCommits.length < 5) {
    return {
      tableFqn,
      status: 'Training',
      lastCommitTimestamp: dataCommits.length > 0 ? dataCommits[dataCommits.length - 1].commitTimestamp : null,
      medianCommitIntervalSeconds: null,
      p95CommitIntervalSeconds: null,
      daysSinceLastCommit: null,
    };
  }

  // Compute inter-commit intervals
  const intervals: number[] = [];
  for (let i = 1; i < dataCommits.length; i++) {
    const prev = new Date(dataCommits[i - 1].commitTimestamp).getTime();
    const curr = new Date(dataCommits[i].commitTimestamp).getTime();
    intervals.push((curr - prev) / 1000);
  }
  intervals.sort((a, b) => a - b);

  const median = percentile(intervals, 0.5);
  const p95 = percentile(intervals, 0.95);
  const lastCommit = dataCommits[dataCommits.length - 1];
  const daysSinceLastCommit = (Date.now() - new Date(lastCommit.commitTimestamp).getTime()) / (1000 * 60 * 60 * 24);

  const timeSinceLastSeconds = daysSinceLastCommit * 86400;
  const status: FreshnessAssessment['status'] = timeSinceLastSeconds > p95 ? 'Unhealthy' : 'Healthy';

  return {
    tableFqn,
    status,
    lastCommitTimestamp: lastCommit.commitTimestamp,
    medianCommitIntervalSeconds: Math.round(median),
    p95CommitIntervalSeconds: Math.round(p95),
    daysSinceLastCommit: Math.round(daysSinceLastCommit * 100) / 100,
  };
}

export function computeCompleteness(
  tableFqn: string,
  commits: DeltaCommitEntry[]
): CompletenessAssessment {
  // Group data writes by day
  const dailyRows = new Map<string, number>();
  for (const c of commits) {
    if (!DATA_OPERATIONS.has(c.operation)) continue;
    const day = c.commitTimestamp.substring(0, 10);
    dailyRows.set(day, (dailyRows.get(day) ?? 0) + (c.numOutputRows ?? 0));
  }

  const dailyValues = Array.from(dailyRows.values());

  if (dailyValues.length < 7) {
    const todayRows = dailyRows.get(new Date().toISOString().substring(0, 10)) ?? null;
    return {
      tableFqn,
      status: 'Training',
      dailyRowCountActual: todayRows,
      dailyRowCountMinExpected: null,
      dailyRowCountMaxExpected: null,
    };
  }

  const avg = dailyValues.reduce((a, b) => a + b, 0) / dailyValues.length;
  const stddev = Math.sqrt(
    dailyValues.reduce((sum, v) => sum + (v - avg) ** 2, 0) / dailyValues.length
  );

  const minExpected = Math.max(0, avg - 2 * stddev);
  const maxExpected = avg + 2 * stddev;
  const today = new Date().toISOString().substring(0, 10);
  const todayRows = dailyRows.get(today) ?? 0;

  const status: CompletenessAssessment['status'] = todayRows < minExpected ? 'Unhealthy' : 'Healthy';

  return {
    tableFqn,
    status,
    dailyRowCountActual: todayRows,
    dailyRowCountMinExpected: Math.round(minExpected),
    dailyRowCountMaxExpected: Math.round(maxExpected),
  };
}

export function computeKpis(tableFqn: string, commits: DeltaCommitEntry[]): KpiResult {
  return {
    tableFqn,
    freshness: computeFreshness(tableFqn, commits),
    completeness: computeCompleteness(tableFqn, commits),
  };
}

// Fetch KPIs for all tables

export async function fetchAllKpis(
  config: LivyConfig,
  sessionId: string,
  onProgress?: (msg: string, sql?: string) => void,
  onQueryProgress?: (progress: QueryProgress) => void
): Promise<{ tables: { database: string; table: string; fqn: string }[]; kpis: KpiResult[]; commits: Map<string, DeltaCommitEntry[]> }> {
  onProgress?.('Discovering databases...', 'SHOW DATABASES');
  const tables = await getAllTables(config, sessionId, onProgress);

  // Cache data_ops_inventory_db tables upfront so subsequent queries are faster
  const cacheTables = tables.filter((t) => t.database === 'data_ops_inventory_db');
  const CACHE_BATCH_SIZE = 5;
  for (let i = 0; i < cacheTables.length; i += CACHE_BATCH_SIZE) {
    const batch = cacheTables.slice(i, i + CACHE_BATCH_SIZE);
    const cacheMsg = batch.map((t) => t.fqn).join(', ');
    onProgress?.(`Caching tables (${Math.min(i + CACHE_BATCH_SIZE, cacheTables.length)}/${cacheTables.length}): ${cacheMsg}`, `CACHE TABLE ${batch[0]?.fqn ?? '...'}`);
    await Promise.allSettled(
      batch.map((t) =>
        executeQuery(config, sessionId, `CACHE TABLE ${t.fqn}`).catch(() => {})
      )
    );
  }

  const allCommits = new Map<string, DeltaCommitEntry[]>();
  const kpis: KpiResult[] = [];
  const BATCH_SIZE = 5;

  const queryInfos: QueryInfo[] = tables.map((t) => ({
    tableFqn: t.fqn,
    sql: `DESCRIBE HISTORY ${t.fqn} LIMIT 500`,
    status: 'running' as const,
  }));

  const emitProgress = () => {
    const completed = queryInfos.filter((q) => q.status === 'done' || q.status === 'error').length;
    onQueryProgress?.({
      total: tables.length,
      completed,
      currentQueries: [...queryInfos],
    });
  };

  // Process in parallel batches
  for (let i = 0; i < tables.length; i += BATCH_SIZE) {
    const batch = tables.slice(i, i + BATCH_SIZE);
    const batchIdxStart = i;

    // Mark batch as running
    for (let j = 0; j < batch.length; j++) {
      queryInfos[batchIdxStart + j].status = 'running';
    }
    emitProgress();

    const batchMsg = batch.map((t) => t.fqn).join(', ');
    onProgress?.(`Fetching history (${Math.min(i + BATCH_SIZE, tables.length)}/${tables.length}): ${batchMsg}`, `DESCRIBE HISTORY <table> LIMIT 500`);

    const results = await Promise.allSettled(
      batch.map((t) => getCommitHistory(config, sessionId, t.fqn))
    );

    results.forEach((result, j) => {
      const t = batch[j];
      const idx = batchIdxStart + j;
      if (result.status === 'fulfilled') {
        allCommits.set(t.fqn, result.value);
        kpis.push(computeKpis(t.fqn, result.value));
        queryInfos[idx].status = 'done';
      } else {
        allCommits.set(t.fqn, []);
        kpis.push(computeKpis(t.fqn, []));
        queryInfos[idx].status = 'error';
      }
    });
    emitProgress();
  }

  return { tables, kpis, commits: allCommits };
}

// Helpers

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = p * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
