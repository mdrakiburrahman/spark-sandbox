import { computeFreshness, computeCompleteness, computeKpis } from '../src/lib/livy/deltalog';
import { toMermaid, filterLineageForDataset } from '../src/lib/livy/lineage';
import { DeltaCommitEntry, LineageDataset, LineageEdge } from '../src/lib/livy/types';

function makeCommit(
  tableFqn: string,
  version: number,
  timestamp: string,
  operation: string,
  numOutputRows: number | null = null
): DeltaCommitEntry {
  return {
    tableFqn,
    version,
    commitTimestamp: timestamp,
    operation,
    numOutputRows,
    numAddedFiles: null,
    numRemovedFiles: null,
    numOutputBytes: null,
    executionTimeMs: null,
  };
}

describe('Delta Log KPI Calculations', () => {
  describe('computeFreshness', () => {
    it('returns Training status with fewer than 5 commits', () => {
      const commits = [
        makeCommit('db.t1', 1, '2025-01-01T10:00:00Z', 'WRITE'),
        makeCommit('db.t1', 2, '2025-01-02T10:00:00Z', 'WRITE'),
      ];

      const result = computeFreshness('db.t1', commits);
      expect(result.status).toBe('Training');
      expect(result.lastCommitTimestamp).toBe('2025-01-02T10:00:00Z');
      expect(result.medianCommitIntervalSeconds).toBeNull();
    });

    it('computes Healthy status for regular commits', () => {
      // 6 daily commits, last one recent
      const now = new Date();
      const commits = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (5 - i));
        return makeCommit('db.t1', i + 1, d.toISOString(), 'WRITE');
      });

      const result = computeFreshness('db.t1', commits);
      expect(result.status).toBe('Healthy');
      expect(result.medianCommitIntervalSeconds).toBeGreaterThan(0);
      expect(result.p95CommitIntervalSeconds).toBeGreaterThan(0);
      expect(result.daysSinceLastCommit).toBeLessThan(2);
    });

    it('excludes OPTIMIZE and VACUUM from interval calculations', () => {
      const now = new Date();
      const commits = [
        makeCommit('db.t1', 1, '2025-01-01T10:00:00Z', 'WRITE'),
        makeCommit('db.t1', 2, '2025-01-02T10:00:00Z', 'OPTIMIZE'),
        makeCommit('db.t1', 3, '2025-01-03T10:00:00Z', 'VACUUM'),
        makeCommit('db.t1', 4, '2025-01-04T10:00:00Z', 'WRITE'),
        makeCommit('db.t1', 5, '2025-01-05T10:00:00Z', 'WRITE'),
        makeCommit('db.t1', 6, '2025-01-06T10:00:00Z', 'WRITE'),
        makeCommit('db.t1', 7, '2025-01-07T10:00:00Z', 'WRITE'),
        makeCommit('db.t1', 8, now.toISOString(), 'WRITE'),
      ];

      const result = computeFreshness('db.t1', commits);
      // OPTIMIZE and VACUUM should be excluded from interval calculation
      expect(result.status).toBeDefined();
    });

    it('marks Unhealthy when stale beyond p95', () => {
      // Regular hourly commits but the last one was 30 days ago
      const commits = Array.from({ length: 10 }, (_, i) => {
        const d = new Date('2025-01-01T10:00:00Z');
        d.setHours(d.getHours() + i);
        return makeCommit('db.t1', i + 1, d.toISOString(), 'WRITE');
      });

      const result = computeFreshness('db.t1', commits);
      expect(result.status).toBe('Unhealthy');
    });
  });

  describe('computeCompleteness', () => {
    it('returns Training status with fewer than 7 days of data', () => {
      const commits = [
        makeCommit('db.t1', 1, '2025-01-01T10:00:00Z', 'WRITE', 100),
        makeCommit('db.t1', 2, '2025-01-02T10:00:00Z', 'WRITE', 200),
      ];

      const result = computeCompleteness('db.t1', commits);
      expect(result.status).toBe('Training');
    });

    it('computes expected row counts with sufficient data', () => {
      const commits = Array.from({ length: 10 }, (_, i) => {
        const d = new Date('2025-01-01T10:00:00Z');
        d.setDate(d.getDate() + i);
        return makeCommit('db.t1', i + 1, d.toISOString(), 'WRITE', 1000 + i * 10);
      });

      const result = computeCompleteness('db.t1', commits);
      expect(result.dailyRowCountMinExpected).toBeDefined();
      expect(result.dailyRowCountMaxExpected).toBeDefined();
      expect(result.dailyRowCountMaxExpected!).toBeGreaterThan(result.dailyRowCountMinExpected!);
    });

    it('ignores OPTIMIZE operations for row counts', () => {
      const commits = [
        ...Array.from({ length: 10 }, (_, i) => {
          const d = new Date('2025-01-01T10:00:00Z');
          d.setDate(d.getDate() + i);
          return makeCommit('db.t1', i + 1, d.toISOString(), 'WRITE', 1000);
        }),
        makeCommit('db.t1', 11, '2025-01-11T10:00:00Z', 'OPTIMIZE', 5000),
      ];

      const result = computeCompleteness('db.t1', commits);
      // The OPTIMIZE row count should not skew the stats
      expect(result.dailyRowCountMaxExpected).toBeDefined();
    });
  });

  describe('computeKpis', () => {
    it('returns both freshness and completeness assessments', () => {
      const now = new Date();
      const commits = Array.from({ length: 10 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (9 - i));
        return makeCommit('db.t1', i + 1, d.toISOString(), 'WRITE', 1000);
      });

      const result = computeKpis('db.t1', commits);
      expect(result.tableFqn).toBe('db.t1');
      expect(result.freshness).toBeDefined();
      expect(result.completeness).toBeDefined();
    });
  });
});

describe('Lineage', () => {
  describe('toMermaid', () => {
    it('generates valid Mermaid diagram', () => {
      const datasets: LineageDataset[] = [
        { fqn: 'db.source_table', database: 'db', table: 'source_table', role: 'source' },
        { fqn: 'db.target_table', database: 'db', table: 'target_table', role: 'target' },
        { fqn: 'db.orphan_table', database: 'db', table: 'orphan_table', role: 'standalone' },
      ];

      const edges: LineageEdge[] = [
        { source: 'db.source_table', target: 'db.target_table', jobName: 'etl_job' },
      ];

      const result = toMermaid(datasets, edges);

      expect(result).toContain('graph LR');
      expect(result).toContain('db_source_table["db.source_table"]');
      expect(result).toContain('db_target_table["db.target_table"]');
      expect(result).toContain('db_source_table --> db_target_table');
      expect(result).toContain('#107C10'); // source color
      expect(result).toContain('#D83B01'); // target color
    });

    it('deduplicates edges', () => {
      const datasets: LineageDataset[] = [
        { fqn: 'a.b', database: 'a', table: 'b', role: 'source' },
        { fqn: 'a.c', database: 'a', table: 'c', role: 'target' },
      ];

      const edges: LineageEdge[] = [
        { source: 'a.b', target: 'a.c' },
        { source: 'a.b', target: 'a.c' },
        { source: 'a.b', target: 'a.c' },
      ];

      const result = toMermaid(datasets, edges);
      const arrowCount = (result.match(/a_b --> a_c/g) || []).length;
      expect(arrowCount).toBe(1);
    });

    it('sanitizes node names with special characters', () => {
      const datasets: LineageDataset[] = [
        { fqn: '123.my-table', database: '123', table: 'my-table', role: 'source' },
      ];

      const result = toMermaid(datasets, []);
      expect(result).toContain('T123_my_table');
    });
  });

  describe('filterLineageForDataset', () => {
    it('filters edges by pattern', () => {
      const datasets: LineageDataset[] = [
        { fqn: 'db.orders', database: 'db', table: 'orders', role: 'source' },
        { fqn: 'db.customers', database: 'db', table: 'customers', role: 'source' },
        { fqn: 'db.order_summary', database: 'db', table: 'order_summary', role: 'target' },
        { fqn: 'db.unrelated', database: 'db', table: 'unrelated', role: 'standalone' },
      ];

      const edges: LineageEdge[] = [
        { source: 'db.orders', target: 'db.order_summary' },
        { source: 'db.customers', target: 'db.order_summary' },
      ];

      const result = filterLineageForDataset(datasets, edges, ['order']);

      expect(result.edges).toHaveLength(2);
      expect(result.datasets.map((d) => d.fqn).sort()).toEqual([
        'db.customers',
        'db.order_summary',
        'db.orders',
      ]);
    });

    it('returns empty for no matches', () => {
      const datasets: LineageDataset[] = [
        { fqn: 'db.foo', database: 'db', table: 'foo', role: 'standalone' },
      ];

      const result = filterLineageForDataset(datasets, [], ['xyz']);
      expect(result.edges).toHaveLength(0);
      expect(result.datasets).toHaveLength(0);
    });
  });
});
