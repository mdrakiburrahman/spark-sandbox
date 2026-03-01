import {
  resolveDatasetName,
  normalizeLocationPath,
  toMermaid,
  filterLineageForDataset,
} from '../src/lib/livy/lineage';
import { LineageDataset, LineageEdge } from '../src/lib/livy/types';

// ---------------------------------------------------------------------------
// normalizeLocationPath
// ---------------------------------------------------------------------------

describe('normalizeLocationPath', () => {
  it('strips file: prefix', () => {
    expect(normalizeLocationPath('file:/warehouse/demo_etl.db/customers')).toBe(
      '/warehouse/demo_etl.db/customers'
    );
  });

  it('strips trailing slashes', () => {
    expect(normalizeLocationPath('/warehouse/demo_etl.db/customers/')).toBe(
      '/warehouse/demo_etl.db/customers'
    );
  });

  it('strips abfss:// prefix', () => {
    expect(
      normalizeLocationPath(
        'abfss://container@account.dfs.core.windows.net/Tables/customers'
      )
    ).toBe('/Tables/customers');
  });

  it('handles already-clean paths', () => {
    expect(normalizeLocationPath('/warehouse/demo_etl.db/customers')).toBe(
      '/warehouse/demo_etl.db/customers'
    );
  });
});

// ---------------------------------------------------------------------------
// resolveDatasetName with location map
// ---------------------------------------------------------------------------

describe('resolveDatasetName', () => {
  const locationMap = new Map<string, string>([
    ['/warehouse/demo_etl.db/customers', 'demo_etl.customers'],
    ['/warehouse/demo_etl.db/orders', 'demo_etl.orders'],
    ['/warehouse/dbt_jaffle_shop.db/stg_customers', 'dbt_jaffle_shop.stg_customers'],
    ['/tmp/.mnt/onelake/lakehouse123/Tables/raw_sales', 'default.raw_sales'],
  ]);

  it('resolves file path to FQN using location map', () => {
    expect(resolveDatasetName('/warehouse/demo_etl.db/customers', locationMap)).toBe(
      'demo_etl.customers'
    );
  });

  it('resolves file: prefixed path using location map', () => {
    expect(resolveDatasetName('file:/warehouse/demo_etl.db/orders', locationMap)).toBe(
      'demo_etl.orders'
    );
  });

  it('resolves path with trailing slash', () => {
    expect(resolveDatasetName('/warehouse/demo_etl.db/customers/', locationMap)).toBe(
      'demo_etl.customers'
    );
  });

  it('passes through database.table format unchanged', () => {
    expect(resolveDatasetName('demo_etl.customers', locationMap)).toBe(
      'demo_etl.customers'
    );
  });

  it('falls back to OneLake heuristic when not in location map', () => {
    expect(
      resolveDatasetName('/tmp/.mnt/onelake/workspace_abc/Tables/unknown_table', locationMap)
    ).toBe('workspace_abc.unknown_table');
  });

  it('strips none/ prefix when not in location map', () => {
    expect(resolveDatasetName('none/mydb.mytable', locationMap)).toBe('mydb.mytable');
  });

  it('works without location map (backward compat)', () => {
    expect(resolveDatasetName('demo_etl.customers')).toBe('demo_etl.customers');
  });
});

// ---------------------------------------------------------------------------
// Uber lineage with location resolution (integration-level)
// ---------------------------------------------------------------------------

describe('uber lineage with location resolution', () => {
  // Simulate what happens when edges come back with file paths
  // and tables are discovered with FQNs
  const tables: { database: string; table: string; fqn: string }[] = [
    { database: 'default', table: 'raw_csv', fqn: 'default.raw_csv' },
    { database: 'demo_etl', table: 'customers', fqn: 'demo_etl.customers' },
    { database: 'demo_etl', table: 'orders', fqn: 'demo_etl.orders' },
    { database: 'demo_etl', table: 'summary', fqn: 'demo_etl.summary' },
  ];

  const locationMap = new Map<string, string>([
    ['/spark-warehouse/default.db/raw_csv', 'default.raw_csv'],
    ['/spark-warehouse/demo_etl.db/customers', 'demo_etl.customers'],
    ['/spark-warehouse/demo_etl.db/orders', 'demo_etl.orders'],
    ['/spark-warehouse/demo_etl.db/summary', 'demo_etl.summary'],
  ]);

  // Simulate raw edges from OpenLineage (file paths, not FQNs)
  const rawEdges = [
    { source: '/spark-warehouse/default.db/raw_csv', target: '/spark-warehouse/demo_etl.db/customers', jobName: 'ingest_customers' },
    { source: '/spark-warehouse/default.db/raw_csv', target: '/spark-warehouse/demo_etl.db/orders', jobName: 'ingest_orders' },
    { source: '/spark-warehouse/demo_etl.db/customers', target: '/spark-warehouse/demo_etl.db/summary', jobName: 'build_summary' },
    { source: '/spark-warehouse/demo_etl.db/orders', target: '/spark-warehouse/demo_etl.db/summary', jobName: 'build_summary' },
  ];

  // Resolve edges using location map
  const resolvedEdges: LineageEdge[] = rawEdges.map((e) => ({
    source: resolveDatasetName(e.source, locationMap),
    target: resolveDatasetName(e.target, locationMap),
    jobName: e.jobName,
  }));

  it('resolves all edges to FQN format', () => {
    for (const edge of resolvedEdges) {
      expect(edge.source).toMatch(/\w+\.\w+/);
      expect(edge.target).toMatch(/\w+\.\w+/);
    }
  });

  it('edges match known table FQNs', () => {
    const fqns = new Set(tables.map((t) => t.fqn));
    for (const edge of resolvedEdges) {
      expect(fqns.has(edge.source)).toBe(true);
      expect(fqns.has(edge.target)).toBe(true);
    }
  });

  it('correctly identifies dataset roles', () => {
    const sourceSet = new Set(resolvedEdges.map((e) => e.source));
    const targetSet = new Set(resolvedEdges.map((e) => e.target));

    const datasets: LineageDataset[] = tables.map((t) => {
      const isSource = sourceSet.has(t.fqn);
      const isTarget = targetSet.has(t.fqn);
      let role: LineageDataset['role'];
      if (isSource && isTarget) role = 'intermediate';
      else if (isTarget) role = 'target';
      else if (isSource) role = 'source';
      else role = 'standalone';
      return { ...t, role };
    });

    expect(datasets.find((d) => d.fqn === 'default.raw_csv')?.role).toBe('source');
    expect(datasets.find((d) => d.fqn === 'demo_etl.customers')?.role).toBe('intermediate');
    expect(datasets.find((d) => d.fqn === 'demo_etl.orders')?.role).toBe('intermediate');
    expect(datasets.find((d) => d.fqn === 'demo_etl.summary')?.role).toBe('target');
  });

  it('produces mermaid diagram with edges', () => {
    const sourceSet = new Set(resolvedEdges.map((e) => e.source));
    const targetSet = new Set(resolvedEdges.map((e) => e.target));
    const datasets: LineageDataset[] = tables.map((t) => {
      const isSource = sourceSet.has(t.fqn);
      const isTarget = targetSet.has(t.fqn);
      let role: LineageDataset['role'];
      if (isSource && isTarget) role = 'intermediate';
      else if (isTarget) role = 'target';
      else if (isSource) role = 'source';
      else role = 'standalone';
      return { ...t, role };
    });

    const mermaid = toMermaid(datasets, resolvedEdges);
    expect(mermaid).toContain('graph LR');
    expect(mermaid).toContain('-->');
    // Should have 4 edges (deduplicated)
    const edgeCount = (mermaid.match(/-->/g) ?? []).length;
    expect(edgeCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Without location map (old behavior) - nodes would be standalone
// ---------------------------------------------------------------------------

describe('without location map, edges may not match FQNs', () => {
  const tables = [
    { database: 'demo_etl', table: 'customers', fqn: 'demo_etl.customers' },
  ];

  const rawEdges = [
    {
      source: resolveDatasetName('/spark-warehouse/default.db/raw_csv'),
      target: resolveDatasetName('/spark-warehouse/demo_etl.db/customers'),
      jobName: 'ingest',
    },
  ];

  it('without location map, file paths do NOT resolve to FQNs', () => {
    // This demonstrates the bug: without location map, the edge target is a raw path
    expect(rawEdges[0].target).not.toBe('demo_etl.customers');
    expect(rawEdges[0].target).toBe('/spark-warehouse/demo_etl.db/customers');
  });

  it('with location map, they DO resolve', () => {
    const locationMap = new Map<string, string>([
      ['/spark-warehouse/demo_etl.db/customers', 'demo_etl.customers'],
    ]);
    const resolved = resolveDatasetName('/spark-warehouse/demo_etl.db/customers', locationMap);
    expect(resolved).toBe('demo_etl.customers');
  });
});
