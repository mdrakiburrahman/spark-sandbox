'use client';

import { useMemo } from 'react';
import { useThemeContext } from './ThemeProvider';
import { FreshnessAssessment, DeltaCommitEntry } from '@/lib/livy/types';

interface CommitFreshnessProps {
  tableFqn: string;
  freshness: FreshnessAssessment;
  commits: DeltaCommitEntry[];
}

const STATUS_COLORS = {
  Healthy: '#107C10',
  Unhealthy: '#A4262C',
  Training: '#F2C811',
};

const CommitFreshness = ({ tableFqn, freshness, commits }: CommitFreshnessProps) => {
  const { isDark } = useThemeContext();

  // Build commit bars over 30-day window
  const bars = useMemo(() => {
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
        return { pct, operation: c.operation };
      });
  }, [commits]);

  const statusColor = STATUS_COLORS[freshness.status] ?? '#A19F9D';

  return (
    <div
      style={{
        padding: '12px 16px',
        borderBottom: `1px solid ${isDark ? '#2D2C2B' : '#F3F2F1'}`,
      }}
    >
      {/* Table name + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#D2D0CE' : '#323130', fontFamily: "'Cascadia Code', monospace" }}>
          {tableFqn}
        </span>
        <span style={{ fontSize: '10px', fontWeight: 600, color: statusColor, textTransform: 'uppercase' }}>
          {freshness.status}
        </span>
      </div>

      {/* Commit bar */}
      <div
        style={{
          position: 'relative',
          height: '20px',
          backgroundColor: isDark ? '#323130' : '#E1DFDD',
          borderRadius: '3px',
          overflow: 'hidden',
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
              width: '3px',
              backgroundColor: '#107C10',
              borderRadius: '1px',
              opacity: 0.9,
            }}
            title={`${bar.operation}`}
          />
        ))}
      </div>

      {/* Time axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
        <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>30d ago</span>
        <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>now</span>
      </div>

      {/* Stats */}
      {freshness.medianCommitIntervalSeconds != null && (
        <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
          <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            Median: {formatDuration(freshness.medianCommitIntervalSeconds)}
          </span>
          <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            P95: {formatDuration(freshness.p95CommitIntervalSeconds ?? 0)}
          </span>
          {freshness.daysSinceLastCommit != null && (
            <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
              Last: {freshness.daysSinceLastCommit < 1 ? '<1d ago' : `${Math.round(freshness.daysSinceLastCommit)}d ago`}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export default CommitFreshness;
