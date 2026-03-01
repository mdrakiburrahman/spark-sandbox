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
import { getAllTables, getTableSnapshot } from '../src/lib/livy/deltalog';
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

function log(msg: string) {
  console.log(`[query-lineage] ${msg}`);
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
  const sessionIdArg = process.argv.find((_, i) => process.argv[i - 1] === '--session-id');

  const jwt = await getJwt();
  const config: LivyConfig = { jwt, workspaceId: WORKSPACE_ID, lakehouseId: LAKEHOUSE_ID };

  // Connect or reuse session
  log('Connecting to Livy...');
  const { sessionId, warning } = await connectWithRetry(
    config,
    sessionIdArg,
    (msg) => log(msg)
  );
  if (warning) log(`Warning: ${warning}`);
  log(`Session ID: ${sessionId}`);

  // Discover tables
  log('Discovering tables...');
  const tables = await getAllTables(config, sessionId, (msg) => log(msg));
  log(`Found ${tables.length} tables`);
  writeFileSync(
    join(OUTPUT_DIR, 'livy-tables.json'),
    JSON.stringify(tables, null, 2)
  );

  // Check for OpenLineage table
  const hasOL = await hasOpenLineageTable(config, sessionId);
  log(`OpenLineage table: ${hasOL ? 'FOUND' : 'NOT FOUND'}`);

  // Build location map
  log('Building location map (DESCRIBE DETAIL on each table)...');
  const locationMap = await buildLocationMap(config, sessionId, tables, (msg) => log(msg));
  log(`Location map entries: ${locationMap.size}`);
  const locationMapObj: Record<string, string> = {};
  for (const [loc, fqn] of locationMap) {
    locationMapObj[loc] = fqn;
  }
  writeFileSync(
    join(OUTPUT_DIR, 'livy-location-map.json'),
    JSON.stringify(locationMapObj, null, 2)
  );

  // Run each named query and save results
  if (hasOL) {
    const queries = [
      tableLineageQuery(),
      tableLineageFromJsonQuery(),
      ...allLineageQueries().filter((q) => q.name !== 'tableLineage'),
    ];

    for (const query of queries) {
      log(`Running query: ${query.name} — ${query.description}`);
      try {
        const result = await executeQuery(config, sessionId, query.sql);
        log(`  → ${result.rows.length} rows`);
        writeFileSync(
          join(OUTPUT_DIR, `livy-query-${query.name}.json`),
          JSON.stringify({ query: query.name, description: query.description, sql: query.sql, result }, null, 2)
        );
      } catch (err) {
        log(`  → ERROR: ${err instanceof Error ? err.message : String(err)}`);
        writeFileSync(
          join(OUTPUT_DIR, `livy-query-${query.name}.json`),
          JSON.stringify({ query: query.name, error: String(err), sql: query.sql }, null, 2)
        );
      }
    }

    // Extract resolved lineage edges
    log('Extracting resolved table lineage edges...');
    const edges = await extractTableLineage(config, sessionId, locationMap);
    log(`Resolved edges: ${edges.length}`);
    writeFileSync(
      join(OUTPUT_DIR, 'livy-resolved-edges.json'),
      JSON.stringify(edges, null, 2)
    );
  }

  // Build full uber lineage
  log('Building uber lineage...');
  const uberLineage = await buildUberLineage(config, sessionId, (msg) => log(msg));
  log(`Uber lineage: ${uberLineage.datasets.length} datasets, ${uberLineage.edges.length} edges`);

  const roleBreakdown = {
    source: uberLineage.datasets.filter((d) => d.role === 'source').length,
    intermediate: uberLineage.datasets.filter((d) => d.role === 'intermediate').length,
    target: uberLineage.datasets.filter((d) => d.role === 'target').length,
    standalone: uberLineage.datasets.filter((d) => d.role === 'standalone').length,
  };
  log(`Roles: ${JSON.stringify(roleBreakdown)}`);

  writeFileSync(
    join(OUTPUT_DIR, 'livy-uber-lineage.json'),
    JSON.stringify(uberLineage, null, 2)
  );

  // Also save the mermaid diagram as a separate file
  writeFileSync(
    join(OUTPUT_DIR, 'livy-uber-lineage.mmd'),
    uberLineage.mermaid
  );

  log('Done! Results saved to public/');
  log(`Mermaid diagram: public/livy-uber-lineage.mmd`);
  log(`\nSession ID for reuse: ${sessionId}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
