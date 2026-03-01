import { LivyConfig, LineageEdge, LineageDataset, UberLineage } from './types';
import { executeQuery } from './client';
import { getAllTables } from './deltalog';

// Lineage extraction via OpenLineage telemetry table

const OPENLINEAGE_TABLE = 'data_ops_inventory_db.openlineage';

export async function hasOpenLineageTable(
  config: LivyConfig,
  sessionId: string
): Promise<boolean> {
  try {
    await executeQuery(config, sessionId, `DESCRIBE TABLE ${OPENLINEAGE_TABLE}`);
    return true;
  } catch {
    return false;
  }
}

export async function extractTableLineage(
  config: LivyConfig,
  sessionId: string
): Promise<LineageEdge[]> {
  const sql = `
    SELECT DISTINCT
      input_dataset AS source,
      output_dataset AS target,
      job_name AS jobName
    FROM (
      SELECT
        explode(transform(from_json(request_body, 'STRUCT<inputs:ARRAY<STRUCT<namespace:STRING,name:STRING>>,outputs:ARRAY<STRUCT<namespace:STRING,name:STRING>>,job:STRUCT<name:STRING>,eventType:STRING>').inputs, x -> x.name)) AS input_dataset,
        explode(transform(from_json(request_body, 'STRUCT<inputs:ARRAY<STRUCT<namespace:STRING,name:STRING>>,outputs:ARRAY<STRUCT<namespace:STRING,name:STRING>>,job:STRUCT<name:STRING>,eventType:STRING>').outputs, x -> x.name)) AS output_dataset,
        from_json(request_body, 'STRUCT<job:STRUCT<name:STRING>,eventType:STRING>').job.name AS job_name,
        from_json(request_body, 'STRUCT<job:STRUCT<name:STRING>,eventType:STRING>').eventType AS event_type
      FROM ${OPENLINEAGE_TABLE}
    )
    WHERE event_type = 'COMPLETE'
      AND input_dataset IS NOT NULL
      AND output_dataset IS NOT NULL
  `;

  try {
    const result = await executeQuery(config, sessionId, sql);
    return result.rows.map((row) => ({
      source: resolveDatasetName(String(row['source'] ?? '')),
      target: resolveDatasetName(String(row['target'] ?? '')),
      jobName: String(row['jobName'] ?? ''),
    }));
  } catch {
    return [];
  }
}

// Build uber lineage combining all tables + lineage edges

export async function buildUberLineage(
  config: LivyConfig,
  sessionId: string,
  onProgress?: (msg: string) => void
): Promise<UberLineage> {
  onProgress?.('Discovering all tables...');
  const tables = await getAllTables(config, sessionId);

  onProgress?.('Extracting lineage from OpenLineage telemetry...');
  const hasOL = await hasOpenLineageTable(config, sessionId);
  const edges = hasOL ? await extractTableLineage(config, sessionId) : [];

  // Build dataset role map
  const sourceSet = new Set(edges.map((e) => e.source));
  const targetSet = new Set(edges.map((e) => e.target));

  const datasets: LineageDataset[] = tables.map((t) => {
    const isSource = sourceSet.has(t.fqn);
    const isTarget = targetSet.has(t.fqn);

    let role: LineageDataset['role'];
    if (isSource && isTarget) role = 'intermediate';
    else if (isTarget) role = 'target';
    else if (isSource) role = 'source';
    else role = 'standalone';

    return {
      fqn: t.fqn,
      database: t.database,
      table: t.table,
      role,
    };
  });

  const mermaid = toMermaid(datasets, edges);
  return { datasets, edges, mermaid };
}

// Mermaid diagram generation (ported from OpenLineageExtractor.toMermaid)

const ROLE_COLORS: Record<LineageDataset['role'], string> = {
  source: '#107C10',
  intermediate: '#F2C811',
  target: '#D83B01',
  standalone: '#A19F9D',
};

function sanitizeNodeName(name: string): string {
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, '_');
  if (/^[0-9]/.test(sanitized)) sanitized = `T${sanitized}`;
  return sanitized;
}

export function toMermaid(
  datasets: LineageDataset[],
  edges: LineageEdge[],
  orientation: 'LR' | 'TB' = 'LR'
): string {
  const lines: string[] = [`graph ${orientation}`];

  // Add nodes
  for (const ds of datasets) {
    const nodeId = sanitizeNodeName(ds.fqn);
    lines.push(`  ${nodeId}["${ds.fqn}"]`);
  }

  // Add edges (deduplicated)
  const edgeSet = new Set<string>();
  for (const edge of edges) {
    const key = `${edge.source}->${edge.target}`;
    if (edgeSet.has(key)) continue;
    edgeSet.add(key);
    const srcId = sanitizeNodeName(edge.source);
    const tgtId = sanitizeNodeName(edge.target);
    lines.push(`  ${srcId} --> ${tgtId}`);
  }

  // Add styles
  const roleGroups = new Map<LineageDataset['role'], string[]>();
  for (const ds of datasets) {
    if (!roleGroups.has(ds.role)) roleGroups.set(ds.role, []);
    roleGroups.get(ds.role)!.push(sanitizeNodeName(ds.fqn));
  }

  for (const [role, nodes] of roleGroups) {
    if (nodes.length > 0) {
      const color = ROLE_COLORS[role];
      lines.push(`  style ${nodes.join(',')} fill:${color},color:#fff,stroke:${color}`);
    }
  }

  return lines.join('\n');
}

// Filter lineage for specific dataset patterns

export function filterLineageForDataset(
  datasets: LineageDataset[],
  edges: LineageEdge[],
  patterns: string[]
): { datasets: LineageDataset[]; edges: LineageEdge[] } {
  const matchingEdges = edges.filter((e) =>
    patterns.some((p) => e.source.includes(p) || e.target.includes(p))
  );

  const referencedFqns = new Set<string>();
  for (const e of matchingEdges) {
    referencedFqns.add(e.source);
    referencedFqns.add(e.target);
  }

  const matchingDatasets = datasets.filter((ds) => referencedFqns.has(ds.fqn));

  return { datasets: matchingDatasets, edges: matchingEdges };
}

// Helpers

function resolveDatasetName(rawName: string): string {
  // Strip common path prefixes (like dbt-fabricspark adapter does)
  let name = rawName;

  // Handle OneLake paths: /tmp/.mnt/onelake/... or abfss://...
  const onelakeMatch = name.match(/\/([^/]+)\/Tables\/([^/]+)/);
  if (onelakeMatch) {
    return `${onelakeMatch[1]}.${onelakeMatch[2]}`;
  }

  // Handle none/ prefix from Livy/dbt
  if (name.startsWith('none/')) {
    name = name.substring(5);
  }

  // Handle dots already present (database.table format)
  if (name.includes('.') && !name.includes('/')) {
    return name;
  }

  return name;
}
