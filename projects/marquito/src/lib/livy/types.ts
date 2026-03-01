// Fabric Livy REST API types

export interface LivyConfig {
  jwt: string;
  workspaceId: string;
  lakehouseId: string;
  endpoint?: string;
  livyApiVersion?: string;
}

export const LIVY_DEFAULTS = {
  endpoint: 'https://api.fabric.microsoft.com/v1',
  livyApiVersion: '2023-12-01',
  sessionPollIntervalMs: 10_000,
  statementPollIntervalMs: 5_000,
} as const;

export function buildBaseUrl(config: LivyConfig): string {
  const endpoint = config.endpoint ?? LIVY_DEFAULTS.endpoint;
  return `${endpoint}/workspaces/${config.workspaceId}/lakehouses/${config.lakehouseId}/livyApi/versions/${config.livyApiVersion ?? LIVY_DEFAULTS.livyApiVersion}`;
}

// Session

export type LivySessionState =
  | 'not_started'
  | 'starting'
  | 'idle'
  | 'busy'
  | 'shutting_down'
  | 'dead'
  | 'killed'
  | 'error'
  | 'not_found';

export interface LivySessionResponse {
  id: string;
  state: string;
  livyInfo?: {
    currentState: LivySessionState;
  };
}

// Statement

export type LivyStatementState = 'waiting' | 'running' | 'available' | 'error' | 'cancelling' | 'cancelled';

export interface LivyStatementResponse {
  id: number;
  state: LivyStatementState;
  output?: {
    status: 'ok' | 'error';
    data?: {
      'application/json'?: LivyResultPayload;
    };
    evalue?: string;
    traceback?: string[];
  };
}

export interface LivyResultPayload {
  schema: {
    type: string;
    fields: LivySchemaField[];
  };
  data: unknown[][];
}

export interface LivySchemaField {
  name: string;
  type: string;
  nullable: boolean;
  metadata: Record<string, unknown>;
}

// Parsed query result

export interface LivyQueryResult {
  columns: string[];
  columnTypes: string[];
  rows: Record<string, unknown>[];
}

// Connection status state machine

export type ConnectionPhase =
  | 'idle'
  | 'creating_session'
  | 'polling_session'
  | 'session_ready'
  | 'loading_data'
  | 'connected'
  | 'error';

export interface ConnectionStatus {
  phase: ConnectionPhase;
  message: string;
  sessionId?: string;
  error?: string;
}

// Query progress tracking
export interface QueryProgress {
  total: number;
  completed: number;
  currentQueries: QueryInfo[];
}

export interface QueryInfo {
  tableFqn: string;
  sql: string;
  status: 'running' | 'done' | 'error';
}

// Delta Log models (ported from DeltaLogModels.scala)

export interface DeltaCommitEntry {
  tableFqn: string;
  version: number;
  commitTimestamp: string;
  operation: string;
  numOutputRows: number | null;
  numAddedFiles: number | null;
  numRemovedFiles: number | null;
  numOutputBytes: number | null;
  executionTimeMs: number | null;
}

export interface DeltaTableSnapshot {
  tableFqn: string;
  tableId: string;
  format: string;
  location: string;
  createdAt: string;
  lastModified: string;
  numFiles: number;
  sizeInBytes: number;
  partitionColumns: string;
  clusteringColumns: string;
}

export interface FreshnessAssessment {
  tableFqn: string;
  status: 'Healthy' | 'Unhealthy' | 'Training';
  lastCommitTimestamp: string | null;
  medianCommitIntervalSeconds: number | null;
  p95CommitIntervalSeconds: number | null;
  daysSinceLastCommit: number | null;
}

export interface CompletenessAssessment {
  tableFqn: string;
  status: 'Healthy' | 'Unhealthy' | 'Training';
  dailyRowCountActual: number | null;
  dailyRowCountMinExpected: number | null;
  dailyRowCountMaxExpected: number | null;
}

export interface KpiResult {
  tableFqn: string;
  freshness: FreshnessAssessment;
  completeness: CompletenessAssessment;
}

// Lineage models

export interface LineageEdge {
  source: string;
  target: string;
  jobName?: string;
}

export interface LineageDataset {
  fqn: string;
  database: string;
  table: string;
  role: 'source' | 'intermediate' | 'target' | 'standalone';
}

export interface LivyColumnLineageEdge {
  sourceDataset: string;
  sourceField: string;
  targetDataset: string;
  targetField: string;
  transformationType: string;
  transformationSubtype: string;
}

export interface UberLineage {
  datasets: LineageDataset[];
  edges: LineageEdge[];
  columnEdges: LivyColumnLineageEdge[];
  mermaid: string;
}
