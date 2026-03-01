'use client';

import { useMemo, useState } from 'react';
import { useThemeContext } from './ThemeProvider';
import { DeltaCommitEntry } from '@/lib/livy/types';

interface RowCompletenessProps {
  tableFqn: string;
  commits: DeltaCommitEntry[];
}

const DATA_OPERATIONS = new Set(['WRITE', 'MERGE', 'STREAMING UPDATE', 'CREATE TABLE AS SELECT', 'REPLACE TABLE AS SELECT', 'CREATE OR REPLACE TABLE AS SELECT', 'CREATE OR REPLACE TABLE']);

const SVG_WIDTH = 280;
const SVG_HEIGHT = 40;
const PADDING = 2;

interface DayAggregate {
  date: string;
  totalRows: number;
  totalBytes: number;
  totalFiles: number;
  commitCount: number;
  operations: string[];
  avgExecutionMs: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

const RowCompleteness = ({ tableFqn, commits }: RowCompletenessProps) => {
  const { isDark } = useThemeContext();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Group commits by day into rich aggregates
  const dailyData: DayAggregate[] = useMemo(() => {
    const dailyMap = new Map<string, DayAggregate>();
    for (const c of commits) {
      if (!DATA_OPERATIONS.has(c.operation)) continue;
      const day = c.commitTimestamp.substring(0, 10);
      const existing = dailyMap.get(day);
      if (existing) {
        existing.totalRows += c.numOutputRows ?? 0;
        existing.totalBytes += c.numOutputBytes ?? 0;
        existing.totalFiles += c.numAddedFiles ?? 0;
        existing.commitCount += 1;
        if (!existing.operations.includes(c.operation)) existing.operations.push(c.operation);
        if (c.executionTimeMs != null) {
          existing.avgExecutionMs = existing.avgExecutionMs != null
            ? (existing.avgExecutionMs * (existing.commitCount - 1) + c.executionTimeMs) / existing.commitCount
            : c.executionTimeMs;
        }
      } else {
        dailyMap.set(day, {
          date: day,
          totalRows: c.numOutputRows ?? 0,
          totalBytes: c.numOutputBytes ?? 0,
          totalFiles: c.numAddedFiles ?? 0,
          commitCount: 1,
          operations: [c.operation],
          avgExecutionMs: c.executionTimeMs,
        });
      }
    }
    const entries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
    return entries.slice(-30);
  }, [commits]);

  const maxRows = useMemo(() => {
    if (dailyData.length === 0) return 1;
    return Math.max(...dailyData.map((d) => d.totalRows), 1);
  }, [dailyData]);

  // Build SVG paths
  const { linePath, fillPath, points } = useMemo(() => {
    if (dailyData.length < 2) return { linePath: '', fillPath: '', points: [] as { x: number; y: number }[] };

    const w = SVG_WIDTH - PADDING * 2;
    const h = SVG_HEIGHT - PADDING * 2;
    const pts = dailyData.map((d, i) => ({
      x: PADDING + (i / (dailyData.length - 1)) * w,
      y: PADDING + h - (d.totalRows / maxRows) * h,
    }));

    const lineD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const fillD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${SVG_HEIGHT - PADDING} L ${pts[0].x.toFixed(1)} ${SVG_HEIGHT - PADDING} Z`;

    return { linePath: lineD, fillPath: fillD, points: pts };
  }, [dailyData, maxRows]);

  const hovered = hoveredIdx != null ? dailyData[hoveredIdx] : null;

  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${isDark ? '#2D2C2B' : '#F3F2F1'}` }}>
      {/* Table name */}
      <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#D2D0CE' : '#323130', fontFamily: "'Cascadia Code', monospace" }}>
          {tableFqn}
        </span>
        <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D', fontFamily: "'Segoe UI', sans-serif" }}>
          {commits.length} commits
        </span>
      </div>

      {/* SVG Line graph */}
      <div style={{ backgroundColor: isDark ? '#1B1A19' : '#FAF9F8', borderRadius: '3px', overflow: 'hidden', position: 'relative' }}>
        {dailyData.length < 2 ? (
          <div style={{ height: `${SVG_HEIGHT}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            {dailyData.length === 0 ? 'No data writes' : 'Insufficient data points'}
          </div>
        ) : (
          <svg width="100%" height={SVG_HEIGHT} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} preserveAspectRatio="none">
            <path d={fillPath} fill="#0078D4" opacity={0.15} />
            <path d={linePath} fill="none" stroke="#0078D4" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? 4 : 2}
                fill={hoveredIdx === i ? '#0078D4' : '#0078D4'}
                opacity={hoveredIdx === i ? 1 : 0.7}
                style={{ cursor: 'pointer', transition: 'r 0.1s' }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            ))}
          </svg>
        )}
      </div>

      {/* Time axis labels */}
      {dailyData.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
          <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>{dailyData[0].date}</span>
          <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>{dailyData[dailyData.length - 1].date}</span>
        </div>
      )}

      {/* Rich hover tooltip */}
      {hovered && (
        <div
          style={{
            marginTop: '6px',
            backgroundColor: isDark ? '#1B1A19' : '#FFFFFF',
            border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
            borderRadius: '6px',
            padding: '10px 12px',
            fontSize: '11px',
            fontFamily: "'Segoe UI', sans-serif",
            boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 12px', lineHeight: '1.6' }}>
            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Date</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{hovered.date}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Rows written</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130', fontWeight: 600 }}>{hovered.totalRows.toLocaleString()}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Bytes written</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{formatBytes(hovered.totalBytes)}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Files added</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{hovered.totalFiles.toLocaleString()}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Commits</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{hovered.commitCount}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Operations</span>
            <span style={{ color: '#0078D4', fontWeight: 600 }}>{hovered.operations.join(', ')}</span>

            {hovered.avgExecutionMs != null && (
              <>
                <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Avg execution</span>
                <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>
                  {hovered.avgExecutionMs < 1000 ? `${Math.round(hovered.avgExecutionMs)}ms` : `${(hovered.avgExecutionMs / 1000).toFixed(1)}s`}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RowCompleteness;
