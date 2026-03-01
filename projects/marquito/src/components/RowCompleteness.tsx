'use client';

import { useMemo } from 'react';
import { useThemeContext } from './ThemeProvider';
import { CompletenessAssessment, DeltaCommitEntry } from '@/lib/livy/types';

interface RowCompletenessProps {
  tableFqn: string;
  completeness: CompletenessAssessment;
  commits: DeltaCommitEntry[];
}

const DATA_OPERATIONS = new Set(['WRITE', 'MERGE', 'STREAMING UPDATE', 'CREATE TABLE AS SELECT', 'REPLACE TABLE AS SELECT']);

const STATUS_COLORS = {
  Healthy: '#107C10',
  Unhealthy: '#A4262C',
  Training: '#F2C811',
};

const RowCompleteness = ({ tableFqn, completeness, commits }: RowCompletenessProps) => {
  const { isDark } = useThemeContext();

  // Group row counts by day
  const dailyData = useMemo(() => {
    const dailyMap = new Map<string, number>();

    for (const c of commits) {
      if (!DATA_OPERATIONS.has(c.operation)) continue;
      const day = c.commitTimestamp.substring(0, 10);
      dailyMap.set(day, (dailyMap.get(day) ?? 0) + (c.numOutputRows ?? 0));
    }

    // Sort by date and take last 30 days
    const entries = Array.from(dailyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
    return entries.slice(-30);
  }, [commits]);

  const maxRows = useMemo(() => {
    if (dailyData.length === 0) return 1;
    return Math.max(...dailyData.map(([, v]) => v), 1);
  }, [dailyData]);

  const statusColor = STATUS_COLORS[completeness.status] ?? '#A19F9D';

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
          {completeness.status}
        </span>
      </div>

      {/* Time series bar chart */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '1px',
          height: '40px',
          backgroundColor: isDark ? '#1B1A19' : '#FAF9F8',
          borderRadius: '3px',
          padding: '2px',
          overflow: 'hidden',
        }}
      >
        {dailyData.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            No data writes
          </div>
        ) : (
          dailyData.map(([day, rows]) => {
            const heightPct = Math.max((rows / maxRows) * 100, 2);
            return (
              <div
                key={day}
                style={{
                  flex: 1,
                  minWidth: '3px',
                  height: `${heightPct}%`,
                  backgroundColor: '#0078D4',
                  borderRadius: '1px 1px 0 0',
                  opacity: 0.8,
                }}
                title={`${day}: ${rows.toLocaleString()} rows`}
              />
            );
          })
        )}
      </div>

      {/* Time axis labels */}
      {dailyData.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
          <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            {dailyData[0][0]}
          </span>
          <span style={{ fontSize: '9px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            {dailyData[dailyData.length - 1][0]}
          </span>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
        {completeness.dailyRowCountActual != null && (
          <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            Today: {completeness.dailyRowCountActual.toLocaleString()} rows
          </span>
        )}
        {completeness.dailyRowCountMinExpected != null && (
          <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D' }}>
            Expected: {completeness.dailyRowCountMinExpected.toLocaleString()}–{completeness.dailyRowCountMaxExpected?.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
};

export default RowCompleteness;
