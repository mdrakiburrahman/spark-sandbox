'use client';

import { useMemo } from 'react';
import { ResponsiveHeatMap } from '@nivo/heatmap';
import { useThemeContext } from './ThemeProvider';
import {
  DeltaCommitEntry,
  UberLineage as UberLineageType,
} from '@/lib/livy/types';

interface LivyDependencyHeatmapProps {
  lineage: UberLineageType;
  commits: Map<string, DeltaCommitEntry[]>;
}

interface DepCell {
  upstreamTable: string;
  downstreamTable: string;
  cv: number | null;
  jobName: string | null;
  minRows: number | null;
  maxRows: number | null;
  commitCount: number;
}

function computeCV(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function shortFqn(fqn: string): string {
  const parts = fqn.split('.');
  return parts.length > 1 ? parts.slice(1).join('.') : fqn;
}

function buildVolatilityMatrix(
  lineage: UberLineageType,
  commits: Map<string, DeltaCommitEntry[]>,
): {
  cells: DepCell[];
  downstreamTables: string[];
  upstreamTables: string[];
} {
  const datasetSet = new Set(lineage.datasets.map((d) => d.fqn));

  // Pre-compute CV for each table's row counts
  const tableCVs = new Map<string, { cv: number | null; min: number | null; max: number | null; count: number }>();
  for (const [fqn, entries] of commits) {
    const rows = entries
      .map((c) => c.numOutputRows)
      .filter((r): r is number => r != null);
    const cv = computeCV(rows);
    tableCVs.set(fqn, {
      cv,
      min: rows.length > 0 ? Math.min(...rows) : null,
      max: rows.length > 0 ? Math.max(...rows) : null,
      count: entries.length,
    });
  }

  const tableDeps: DepCell[] = [];
  const downstreamSet = new Set<string>();
  const upstreamSet = new Set<string>();
  const seen = new Set<string>();

  for (const edge of lineage.edges) {
    const srcIsTable = datasetSet.has(edge.source);
    const tgtIsTable = datasetSet.has(edge.target);

    if (srcIsTable && tgtIsTable && edge.source !== edge.target) {
      const key = `${edge.source}→${edge.target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Cell value = CV of the UPSTREAM table (source of regression risk)
      const upstreamStats = tableCVs.get(edge.source);

      tableDeps.push({
        upstreamTable: edge.source,
        downstreamTable: edge.target,
        cv: upstreamStats?.cv ?? null,
        jobName: edge.jobName ?? null,
        minRows: upstreamStats?.min ?? null,
        maxRows: upstreamStats?.max ?? null,
        commitCount: upstreamStats?.count ?? 0,
      });
      downstreamSet.add(edge.target);
      upstreamSet.add(edge.source);
    }
  }

  return {
    cells: tableDeps,
    downstreamTables: Array.from(downstreamSet).sort(),
    upstreamTables: Array.from(upstreamSet).sort(),
  };
}

// Green → Yellow → Red interpolation based on CV value
function cvToColor(cv: number | null, maxCV: number, isDark: boolean): string {
  if (cv == null) return isDark ? '#2D2C2B' : '#F3F2F1';
  const t = Math.min(cv / Math.max(maxCV, 0.01), 1);
  if (t <= 0.5) {
    // Green → Yellow
    const p = t / 0.5;
    const r = Math.round((isDark ? 76 : 16) + p * ((isDark ? 255 : 242) - (isDark ? 76 : 16)));
    const g = Math.round((isDark ? 175 : 124) + p * ((isDark ? 200 : 200) - (isDark ? 175 : 124)));
    const b = Math.round((isDark ? 80 : 16) + p * ((isDark ? 17 : 17) - (isDark ? 80 : 16)));
    return `rgb(${r},${g},${b})`;
  } else {
    // Yellow → Red
    const p = (t - 0.5) / 0.5;
    const r = Math.round((isDark ? 255 : 242) + p * ((isDark ? 220 : 164) - (isDark ? 255 : 242)));
    const g = Math.round((isDark ? 200 : 200) + p * ((isDark ? 50 : 38) - (isDark ? 200 : 200)));
    const b = Math.round((isDark ? 17 : 17) + p * ((isDark ? 50 : 44) - (isDark ? 17 : 17)));
    return `rgb(${r},${g},${b})`;
  }
}

const LivyDependencyHeatmap = ({ lineage, commits }: LivyDependencyHeatmapProps) => {
  const { isDark } = useThemeContext();

  const { nivoData, maxCV, cellLookup, isEmpty } = useMemo(() => {
    const { cells, downstreamTables, upstreamTables } = buildVolatilityMatrix(lineage, commits);

    if (cells.length === 0) {
      return { nivoData: [], maxCV: 0, cellLookup: new Map<string, DepCell>(), isEmpty: true };
    }

    const lookup = new Map<string, DepCell>();
    for (const c of cells) {
      lookup.set(`${c.upstreamTable}|${c.downstreamTable}`, c);
    }

    const max = Math.max(
      ...cells.filter((c) => c.cv != null).map((c) => c.cv!),
      0.01,
    );

    const heatmapData = upstreamTables.map((src) => ({
      id: shortFqn(src),
      data: downstreamTables.map((tgt) => {
        const cell = lookup.get(`${src}|${tgt}`);
        return {
          x: shortFqn(tgt),
          y: cell?.cv ?? null,
        };
      }),
    }));

    return { nivoData: heatmapData, maxCV: max, cellLookup: lookup, isEmpty: false };
  }, [lineage, commits]);

  if (isEmpty) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13px', color: isDark ? '#605E5C' : '#A19F9D' }}>
        No table-to-table dependencies found in lineage data.
      </div>
    );
  }

  const chartHeight = Math.max(340, nivoData.length * 44 + 140);

  // Reverse-lookup: short fqn → full fqn for tooltip
  const shortToFull = new Map<string, string>();
  for (const ds of lineage.datasets) {
    shortToFull.set(shortFqn(ds.fqn), ds.fqn);
  }

  return (
    <div style={{ padding: '16px' }}>
      <p
        style={{
          fontSize: '12px',
          color: isDark ? '#A19F9D' : '#605E5C',
          fontFamily: "'Segoe UI', sans-serif",
          marginBottom: '16px',
          marginTop: 0,
        }}
      >
        Cell color = row count volatility (CV) of the <strong style={{ color: isDark ? '#FAF9F8' : '#323130' }}>upstream</strong> table.
        High volatility upstream → higher regression risk for the downstream table.
      </p>
      <div style={{ height: chartHeight }}>
        <ResponsiveHeatMap
          data={nivoData}
          margin={{ top: 100, right: 40, bottom: 60, left: 200 }}
          axisTop={{
            tickSize: 5,
            tickPadding: 8,
            tickRotation: -45,
            legend: 'Downstream Tables',
            legendPosition: 'middle' as const,
            legendOffset: -80,
          }}
          axisLeft={{
            tickSize: 5,
            tickPadding: 8,
            tickRotation: 0,
            legend: 'Upstream Dependencies',
            legendPosition: 'middle' as const,
            legendOffset: -180,
          }}
          colors={(cell) => cvToColor(cell.value ?? null, maxCV, isDark)}
          emptyColor={isDark ? '#2D2C2B' : '#F3F2F1'}
          borderWidth={1}
          borderColor={isDark ? '#484644' : '#E1DFDD'}
          labelTextColor={isDark ? '#1B1A19' : '#FFFFFF'}
          label={(cell) => {
            if (cell.value == null) return '';
            return (cell.value as number).toFixed(2);
          }}
          tooltip={({ cell }) => {
            const xShort = cell.data.x as string;
            const yShort = cell.serieId as string;
            const xFull = shortToFull.get(xShort) ?? xShort;
            const yFull = shortToFull.get(yShort) ?? yShort;
            const cellData = cellLookup.get(`${yFull}|${xFull}`);

            let riskLabel = 'No data';
            let riskColor = isDark ? '#605E5C' : '#A19F9D';
            if (cell.value != null) {
              const v = cell.value as number;
              if (v < 0.1) { riskLabel = 'Stable'; riskColor = '#107C10'; }
              else if (v < 0.5) { riskLabel = 'Moderate'; riskColor = '#F2C811'; }
              else { riskLabel = 'Volatile'; riskColor = '#A4262C'; }
            }

            return (
              <div
                style={{
                  backgroundColor: isDark ? '#1B1A19' : '#FFFFFF',
                  border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
                  borderRadius: '6px',
                  padding: '10px 14px',
                  fontSize: '12px',
                  fontFamily: "'Segoe UI', sans-serif",
                  boxShadow: isDark
                    ? '0 4px 12px rgba(0,0,0,0.5)'
                    : '0 4px 12px rgba(0,0,0,0.12)',
                  maxWidth: '380px',
                }}
              >
                <div style={{ fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', marginBottom: '6px' }}>
                  {yShort} → {xShort}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '2px 10px',
                    lineHeight: '1.6',
                  }}
                >
                  <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Risk</span>
                  <span style={{ color: riskColor, fontWeight: 600 }}>{riskLabel}</span>

                  <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>CV</span>
                  <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>
                    {cell.value != null ? (cell.value as number).toFixed(3) : '—'}
                  </span>

                  {cellData && cellData.minRows != null && (
                    <>
                      <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Row range</span>
                      <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>
                        {cellData.minRows.toLocaleString()} – {cellData.maxRows?.toLocaleString()}
                      </span>
                    </>
                  )}

                  {cellData && cellData.commitCount > 0 && (
                    <>
                      <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Commits</span>
                      <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{cellData.commitCount}</span>
                    </>
                  )}

                  {cellData?.jobName && (
                    <>
                      <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Job</span>
                      <span
                        style={{
                          color: '#0078D4',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cellData.jobName}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          }}
          theme={{
            text: {
              fontSize: 11,
              fill: isDark ? '#A19F9D' : '#605E5C',
              fontFamily: "'Segoe UI', sans-serif",
            },
            axis: {
              ticks: {
                text: {
                  fontSize: 11,
                  fill: isDark ? '#A19F9D' : '#605E5C',
                  fontFamily: "'Cascadia Code', monospace",
                },
              },
              legend: {
                text: {
                  fontSize: 12,
                  fill: isDark ? '#D2D0CE' : '#323130',
                  fontFamily: "'Segoe UI', sans-serif",
                  fontWeight: 600,
                },
              },
            },
          }}
          animate={true}
          motionConfig="gentle"
          hoverTarget="cell"
        />
      </div>

      {/* Color legend */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          marginTop: '12px',
          fontSize: '11px',
          fontFamily: "'Segoe UI', sans-serif",
          color: isDark ? '#A19F9D' : '#605E5C',
        }}
      >
        <span style={{ color: '#107C10', fontWeight: 600 }}>● Stable (CV≈0)</span>
        <div
          style={{
            width: '140px',
            height: '10px',
            borderRadius: '5px',
            background: 'linear-gradient(90deg, #107C10, #6CCB5F, #F2C811, #D83B01, #A4262C)',
          }}
        />
        <span style={{ color: '#A4262C', fontWeight: 600 }}>● Volatile (CV={maxCV.toFixed(2)})</span>
      </div>
    </div>
  );
};

export default LivyDependencyHeatmap;
