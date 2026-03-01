#!/usr/bin/env npx tsx
/**
 * CLI script to run the same lineage queries that marquito runs against Fabric Livy.
 * Saves named query results to public/ and generates uber lineage.
 *
 * Usage:
 *   npx tsx scripts/query-lineage.ts [--session-id <id>]
 *
 * Requires:
 *   - Azure CLI authenticated (az login)
 *   - Environment or defaults for workspace/lakehouse IDs
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

import { LivyConfig } from '../src/lib/livy/types';
import { connectWithRetry, executeQuery } from '../src/lib/livy/client';
import { getAllTables, getTableSnapshot, fetchAllKpis } from '../src/lib/livy/deltalog';
import {
  buildLocationMap,
  extractTableLineage,
  buildUberLineage,
  hasOpenLineageTable,
  normalizeLocationPath,
} from '../src/lib/livy/lineage';
import {
  allLineageQueries,
  tableLineageQuery,
  tableLineageFromJsonQuery,
} from '../src/lib/livy/queries';

const WORKSPACE_ID = process.env.FABRIC_WORKSPACE_ID ?? '3ea60ae5-e979-4d31-a317-66491ab497fb';
const LAKEHOUSE_ID = process.env.FABRIC_LAKEHOUSE_ID ?? '4d8783be-e822-46d0-82e4-9b77c7f33992';
const OUTPUT_DIR = join(__dirname, '..', 'public');

const CHECKMARK = '✓';
const CROSS = '✗';
const SPINNER = '◌';

let phaseStart = Date.now();

function log(msg: string) {
  console.log(`[query-lineage] ${msg}`);
}

function phaseLog(icon: string, msg: string) {
  console.log(`  [${icon}] ${msg}`);
}

function startPhase(name: string) {
  phaseStart = Date.now();
  console.log(`\n[${SPINNER}] ${name}`);
}

function endPhase(name: string, detail?: string) {
  const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`[${CHECKMARK}] ${name} (${elapsed}s)${suffix}`);
}

function failPhase(name: string, err: unknown) {
  const elapsed = ((Date.now() - phaseStart) / 1000).toFixed(1);
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`[${CROSS}] ${name} FAILED (${elapsed}s) — ${msg}`);
}

async function getJwt(): Promise<string> {
  log('Getting JWT via az account get-access-token...');
  const token = execSync(
    'az account get-access-token --resource "https://analysis.windows.net/powerbi/api" --query accessToken -o tsv',
    { encoding: 'utf-8' }
  ).trim();
  log(`JWT obtained (${token.length} chars)`);
  return token;
}

async function main() {
  const scriptStart = Date.now();
  const sessionIdArg = process.argv.find((_, i) => process.argv[i - 1] === '--session-id');

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║     marquito · hydrate-static                ║');
  console.log('╚══════════════════════════════════════════════╝');

  // --- Phase 1: Authentication ---
  startPhase('Authenticating via Azure CLI');
  const jwt = await getJwt();
  endPhase('Authentication', `token ${jwt.length} chars`);

  const config: LivyConfig = { jwt, workspaceId: WORKSPACE_ID, lakehouseId: LAKEHOUSE_ID };
  phaseLog(SPINNER, `Workspace: ${WORKSPACE_ID}`);
  phaseLog(SPINNER, `Lakehouse: ${LAKEHOUSE_ID}`);

  // --- Phase 2: Connect to Livy ---
  startPhase('Connecting to Livy');
  const { sessionId, warning } = await connectWithRetry(
    config,
    sessionIdArg,
    (msg) => phaseLog(SPINNER, msg)
  );
  if (warning) phaseLog(CROSS, `Warning: ${warning}`);
  endPhase('Connected to Livy', `session ${sessionId}`);

  // --- Phase 3: Discover tables ---
  startPhase('Discovering tables');
  const tables = await getAllTables(config, sessionId, (msg) => phaseLog(SPINNER, msg));
  endPhase('Table discovery', `${tables.length} tables found`);
  writeFileSync(
    join(OUTPUT_DIR, 'livy-tables.json'),
    JSON.stringify(tables, null, 2)
  );
  phaseLog(CHECKMARK, `Saved livy-tables.json`);

  // --- Phase 4: OpenLineage check + Location map (parallel where possible) ---
  startPhase('Checking OpenLineage table & building location map');
  const [hasOL, locationMap] = await Promise.all([
    hasOpenLineageTable(config, sessionId),
    buildLocationMap(config, sessionId, tables, (msg) => phaseLog(SPINNER, msg)),
  ]);
  phaseLog(hasOL ? CHECKMARK : CROSS, `OpenLineage table: ${hasOL ? 'FOUND' : 'NOT FOUND'}`);
  endPhase('Location map', `${locationMap.size} entries`);

  const locationMapObj: Record<string, string> = {};
  for (const [loc, fqn] of locationMap) {
    locationMapObj[loc] = fqn;
  }
  writeFileSync(
    join(OUTPUT_DIR, 'livy-location-map.json'),
    JSON.stringify(locationMapObj, null, 2)
  );
  phaseLog(CHECKMARK, `Saved livy-location-map.json`);

  // --- Phase 5: Named lineage queries ---
  if (hasOL) {
    const queries = [
      tableLineageQuery(),
      tableLineageFromJsonQuery(),
      ...allLineageQueries().filter((q) => q.name !== 'tableLineage'),
    ];

    startPhase(`Running ${queries.length} lineage queries`);
    let succeeded = 0;
    let failed = 0;

    for (let idx = 0; idx < queries.length; idx++) {
      const query = queries[idx];
      phaseLog(SPINNER, `(${idx + 1}/${queries.length}) ${query.name} — ${query.description}`);
      try {
        const result = await executeQuery(config, sessionId, query.sql);
        succeeded++;
        phaseLog(CHECKMARK, `${query.name}: ${result.rows.length} rows`);
        writeFileSync(
          join(OUTPUT_DIR, `livy-query-${query.name}.json`),
          JSON.stringify({ query: query.name, description: query.description, sql: query.sql, result }, null, 2)
        );
      } catch (err) {
        failed++;
        phaseLog(CROSS, `${query.name}: ${err instanceof Error ? err.message : String(err)}`);
        writeFileSync(
          join(OUTPUT_DIR, `livy-query-${query.name}.json`),
          JSON.stringify({ query: query.name, error: String(err), sql: query.sql }, null, 2)
        );
      }
    }
    endPhase('Lineage queries', `${succeeded} succeeded, ${failed} failed`);

    // --- Phase 6: Resolved edges ---
    startPhase('Extracting resolved table lineage edges');
    const edges = await extractTableLineage(config, sessionId, locationMap);
    endPhase('Resolved edges', `${edges.length} edges`);
    writeFileSync(
      join(OUTPUT_DIR, 'livy-resolved-edges.json'),
      JSON.stringify(edges, null, 2)
    );
    phaseLog(CHECKMARK, `Saved livy-resolved-edges.json`);
  } else {
    log('Skipping lineage queries (no OpenLineage table)');
  }

  // --- Phase 7: Uber lineage + KPIs (independent, run in parallel) ---
  startPhase('Building uber lineage & fetching KPIs');

  const [uberLineage, kpiData] = await Promise.all([
    buildUberLineage(config, sessionId, (msg) => phaseLog(SPINNER, `[lineage] ${msg}`)),
    fetchAllKpis(config, sessionId, (msg) => phaseLog(SPINNER, `[kpis] ${msg}`)),
  ]);

  const roleBreakdown = {
    source: uberLineage.datasets.filter((d) => d.role === 'source').length,
    intermediate: uberLineage.datasets.filter((d) => d.role === 'intermediate').length,
    target: uberLineage.datasets.filter((d) => d.role === 'target').length,
    standalone: uberLineage.datasets.filter((d) => d.role === 'standalone').length,
  };

  phaseLog(CHECKMARK, `Uber lineage: ${uberLineage.datasets.length} datasets, ${uberLineage.edges.length} edges`);
  phaseLog(CHECKMARK, `Roles: source=${roleBreakdown.source} intermediate=${roleBreakdown.intermediate} target=${roleBreakdown.target} standalone=${roleBreakdown.standalone}`);
  phaseLog(CHECKMARK, `KPIs: ${kpiData.kpis.length} tables`);
  endPhase('Uber lineage & KPIs');

  // Write all output files
  writeFileSync(
    join(OUTPUT_DIR, 'livy-uber-lineage.json'),
    JSON.stringify(uberLineage, null, 2)
  );
  writeFileSync(
    join(OUTPUT_DIR, 'livy-uber-lineage.mmd'),
    uberLineage.mermaid
  );
  writeFileSync(
    join(OUTPUT_DIR, 'livy-kpis.json'),
    JSON.stringify(kpiData.kpis, null, 2)
  );
  const commitsObj: Record<string, unknown[]> = {};
  for (const [fqn, entries] of kpiData.commits) {
    commitsObj[fqn] = entries;
  }
  writeFileSync(
    join(OUTPUT_DIR, 'livy-commits.json'),
    JSON.stringify(commitsObj, null, 2)
  );
  phaseLog(CHECKMARK, `Saved livy-uber-lineage.json, .mmd, livy-kpis.json, livy-commits.json`);

  // --- Summary ---
  const totalElapsed = ((Date.now() - scriptStart) / 1000).toFixed(1);
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log(`║  ${CHECKMARK} Done in ${totalElapsed}s`);
  console.log(`║  ${tables.length} tables · ${locationMap.size} locations · ${kpiData.kpis.length} KPIs`);
  if (hasOL) {
    console.log(`║  ${uberLineage.datasets.length} datasets · ${uberLineage.edges.length} edges`);
  }
  console.log(`║  Session ID: ${sessionId}`);
  console.log(`║  Output: public/livy-*.json`);
  console.log('╚══════════════════════════════════════════════╝');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
