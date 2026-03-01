import { LivyConfig, LineageEdge, LineageDataset, UberLineage, LivyColumnLineageEdge } from './types';
import { executeQuery } from './client';
import { getAllTables, getTableSnapshot } from './deltalog';
import { tableLineageQuery, tableLineageFromJsonQuery, columnLineageQuery } from './queries';

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

/** Extracts raw table-level lineage edges from OpenLineage telemetry.
 *  Tries flattened columns first; falls back to request_body JSON parsing.
 */
export async function extractTableLineage(
  config: LivyConfig,
  sessionId: string,
  locationMap?: Map<string, string>
): Promise<LineageEdge[]> {
  // Try flattened columns first (faster, avoids JSON parsing).
  // If a query succeeds but returns 0 rows, continue to next variant.
  const queries = [tableLineageQuery(), tableLineageFromJsonQuery()];

  for (const query of queries) {
    try {
      const result = await executeQuery(config, sessionId, query.sql);
      const edges = result.rows.map((row) => ({
        source: resolveDatasetName(String(row['input_name'] ?? ''), locationMap),
        target: resolveDatasetName(String(row['output_name'] ?? ''), locationMap),
        jobName: String(row['job_name'] ?? ''),
      }));
      if (edges.length > 0) return edges;
      // 0 rows — try next query variant
    } catch {
      // Query failed — try next variant
    }
  }

  return [];
}

/** Extracts column-level lineage edges from OpenLineage telemetry.
 *  Uses the columnLineageQuery to parse request_body JSON for column mappings.
 */
export async function extractColumnLineage(
  config: LivyConfig,
  sessionId: string,
  locationMap?: Map<string, string>
): Promise<LivyColumnLineageEdge[]> {
  const query = columnLineageQuery();
  try {
    const result = await executeQuery(config, sessionId, query.sql);
    return result.rows.map((row) => ({
      sourceDataset: resolveDatasetName(String(row['source_name'] ?? ''), locationMap),
      sourceField: String(row['source_field'] ?? ''),
      targetDataset: resolveDatasetName(String(row['target_name'] ?? ''), locationMap),
      targetField: String(row['target_field'] ?? ''),
      transformationType: String(row['transformation_type'] ?? 'UNKNOWN'),
      transformationSubtype: String(row['transformation_subtype'] ?? 'UNKNOWN'),
    }));
  } catch {
    return [];
  }
}

/** Builds a location→FQN map by running DESCRIBE DETAIL on each table.
 *  This is the key step that maps file paths in OpenLineage events to database.table names.
 *  Ported from OpenLineageExtractor.buildLocationMap in Scala.
 */
export async function buildLocationMap(
  config: LivyConfig,
  sessionId: string,
  tables: { database: string; table: string; fqn: string }[],
  onProgress?: (msg: string) => void
): Promise<Map<string, string>> {
  const locationMap = new Map<string, string>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < tables.length; i += BATCH_SIZE) {
    const batch = tables.slice(i, i + BATCH_SIZE);
    onProgress?.(`Building location map (${Math.min(i + BATCH_SIZE, tables.length)}/${tables.length})...`);

    const results = await Promise.allSettled(
      batch.map((t) => getTableSnapshot(config, sessionId, t.fqn))
    );

    results.forEach((result, j) => {
      if (result.status === 'fulfilled' && result.value?.location) {
        const normalized = normalizeLocationPath(result.value.location);
        locationMap.set(normalized, batch[j].fqn);
      }
    });
  }

  return locationMap;
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
  if (!hasOL) {
    const datasets: LineageDataset[] = tables.map((t) => ({
      fqn: t.fqn, database: t.database, table: t.table, role: 'standalone' as const,
    }));
    return { datasets, edges: [], columnEdges: [], mermaid: toMermaid(datasets, []) };
  }

  // Build location map for resolving file paths → database.table names
  onProgress?.('Building location map (DESCRIBE DETAIL on each table)...');
  const locationMap = await buildLocationMap(config, sessionId, tables, onProgress);

  onProgress?.('Extracting table lineage edges...');
  let edges = await extractTableLineage(config, sessionId, locationMap);

  onProgress?.('Extracting column lineage edges...');
  const columnEdges = await extractColumnLineage(config, sessionId, locationMap);

  // Fallback: derive table-level edges from column-level edges when table queries returned nothing.
  // This handles Fabric scenarios where inputs array may be empty but column lineage facets exist.
  if (edges.length === 0 && columnEdges.length > 0) {
    const edgeSet = new Set<string>();
    for (const ce of columnEdges) {
      const key = `${ce.sourceDataset}→${ce.targetDataset}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: ce.sourceDataset, target: ce.targetDataset });
      }
    }
  }

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
  return { datasets, edges, columnEdges, mermaid };
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

/** Normalizes a file path for location matching by stripping scheme and trailing slashes.
 *  Ported from OpenLineageExtractor.normalizeLocationPath in Scala.
 */
export function normalizeLocationPath(path: string): string {
  return path
    .replace(/^file:/, '')
    .replace(/^abfss?:\/\/[^/]+/, '')
    .replace(/\/+$/, '');
}

/** Resolves a raw dataset name from OpenLineage to a database.table FQN.
 *  Uses the location map (from DESCRIBE DETAIL) when available.
 *  Falls back to heuristic path parsing.
 */
export function resolveDatasetName(rawName: string, locationMap?: Map<string, string>): string {
  // Try location map first (the reliable approach from Scala)
  if (locationMap) {
    const normalized = normalizeLocationPath(rawName);
    const mapped = locationMap.get(normalized);
    if (mapped) return mapped;

    // Also try matching the raw name with common prefixes stripped
    for (const [location, fqn] of locationMap) {
      if (normalized.endsWith(location) || location.endsWith(normalized)) {
        return fqn;
      }
    }
  }

  // Fallback: heuristic path resolution
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
