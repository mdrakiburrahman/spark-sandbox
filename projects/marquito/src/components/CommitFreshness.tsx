'use client';

import { useMemo, useState } from 'react';
import { useThemeContext } from './ThemeProvider';
import { DeltaCommitEntry } from '@/lib/livy/types';

interface CommitFreshnessProps {
  tableFqn: string;
  commits: DeltaCommitEntry[];
}

interface BarData {
  pct: number;
  commit: DeltaCommitEntry;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

const CommitFreshness = ({ tableFqn, commits }: CommitFreshnessProps) => {
  const { isDark } = useThemeContext();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const bars: BarData[] = useMemo(() => {
    if (commits.length === 0) return [];

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const windowMs = now - thirtyDaysAgo;

    return commits
      .filter((c) => {
        const t = new Date(c.commitTimestamp).getTime();
        return t >= thirtyDaysAgo && t <= now;
      })
      .map((c) => {
        const t = new Date(c.commitTimestamp).getTime();
        const pct = ((t - thirtyDaysAgo) / windowMs) * 100;
        return { pct, commit: c };
      });
  }, [commits]);

  const hovered = hoveredIdx != null ? bars[hoveredIdx] : null;

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${isDark ? '#2D2C2B' : '#F3F2F1'}`,
      }}
    >
      {/* Table name */}
      <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#D2D0CE' : '#323130', fontFamily: "'Cascadia Code', monospace" }}>
          {tableFqn}
        </span>
        <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D', fontFamily: "'Segoe UI', sans-serif" }}>
          {commits.length} commits
        </span>
      </div>
      <div
        style={{
          position: 'relative',
          height: '20px',
          backgroundColor: isDark ? '#323130' : '#E1DFDD',
          borderRadius: '3px',
          overflow: 'visible',
        }}
      >
        {bars.map((bar, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: `${bar.pct}%`,
              top: '2px',
              bottom: '2px',
              width: hoveredIdx === i ? '5px' : '3px',
              backgroundColor: hoveredIdx === i ? '#0078D4' : '#107C10',
              borderRadius: '1px',
              opacity: hoveredIdx === i ? 1 : 0.9,
              cursor: 'pointer',
              zIndex: hoveredIdx === i ? 10 : 1,
              transition: 'width 0.1s, background-color 0.1s',
            }}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}
      </div>

      {/* Time axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>30d ago</span>
        <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>now</span>
      </div>

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
            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Version</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>v{hovered.commit.version}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Timestamp</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{formatTimestamp(hovered.commit.commitTimestamp)}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Operation</span>
            <span style={{ color: '#0078D4', fontWeight: 600 }}>{hovered.commit.operation}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Rows written</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{hovered.commit.numOutputRows?.toLocaleString() ?? '—'}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Files added</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{hovered.commit.numAddedFiles?.toLocaleString() ?? '—'}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Files removed</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{hovered.commit.numRemovedFiles?.toLocaleString() ?? '—'}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Bytes written</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{formatBytes(hovered.commit.numOutputBytes)}</span>

            <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontWeight: 600 }}>Execution time</span>
            <span style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{formatDurationMs(hovered.commit.executionTimeMs)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommitFreshness;
