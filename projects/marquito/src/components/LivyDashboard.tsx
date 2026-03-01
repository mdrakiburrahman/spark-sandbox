'use client';

import { useState, useMemo } from 'react';
import { useThemeContext } from './ThemeProvider';
import CommitFreshness from './CommitFreshness';
import RowCompleteness from './RowCompleteness';
import UberLineage from './UberLineage';
import LivyColumnLineage from './LivyColumnLineage';
import LivyDependencyHeatmap from './LivyDependencyHeatmap';
import { KpiResult, DeltaCommitEntry, UberLineage as UberLineageType } from '@/lib/livy/types';
import {
  CheckmarkCircle20Filled,
  PlugDisconnected20Regular,
} from '@fluentui/react-icons';

interface DashboardData {
  tables: { database: string; table: string; fqn: string }[];
  kpis: KpiResult[];
  commits: Map<string, DeltaCommitEntry[]>;
  lineage: UberLineageType;
}

interface LivyDashboardProps {
  data: DashboardData;
  onDisconnect: () => void;
}

const LivyDashboard = ({ data, onDisconnect }: LivyDashboardProps) => {
  const { isDark } = useThemeContext();
  const [selectedDb, setSelectedDb] = useState<string>('ALL');
  const [selectedTable, setSelectedTable] = useState<string>('ALL');
  const [showColumnLineage, setShowColumnLineage] = useState(false);

  // Derive unique databases
  const databases = useMemo(() => {
    const dbs = new Set(data.tables.map((t) => t.database));
    return ['ALL', ...Array.from(dbs).sort()];
  }, [data.tables]);

  // Derive tables for selected database
  const availableTables = useMemo(() => {
    const filtered = selectedDb === 'ALL'
      ? data.tables
      : data.tables.filter((t) => t.database === selectedDb);
    return ['ALL', ...filtered.map((t) => t.fqn).sort()];
  }, [data.tables, selectedDb]);

  // Filter KPIs by selection
  const filteredKpis = useMemo(() => {
    return data.kpis
      .filter((kpi) => {
        if (selectedDb !== 'ALL') {
          const [db] = kpi.tableFqn.split('.');
          if (db !== selectedDb) return false;
        }
        if (selectedTable !== 'ALL' && kpi.tableFqn !== selectedTable) return false;
        return true;
      })
      .sort((a, b) => {
        const span = (fqn: string) => {
          const c = data.commits.get(fqn) ?? [];
          if (c.length < 2) return 0;
          const times = c.map((e) => new Date(e.commitTimestamp).getTime());
          return Math.max(...times) - Math.min(...times);
        };
        return span(b.tableFqn) - span(a.tableFqn);
      });
  }, [data.kpis, data.commits, selectedDb, selectedTable]);

  // Filter commits
  const filteredCommits = useMemo(() => {
    const result = new Map<string, DeltaCommitEntry[]>();
    for (const [fqn, commits] of data.commits) {
      if (selectedDb !== 'ALL') {
        const [db] = fqn.split('.');
        if (db !== selectedDb) continue;
      }
      if (selectedTable !== 'ALL' && fqn !== selectedTable) continue;
      result.set(fqn, commits);
    }
    return result;
  }, [data.commits, selectedDb, selectedTable]);

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: '13px',
    fontFamily: "'Segoe UI', sans-serif",
    backgroundColor: isDark ? '#1B1A19' : '#FFFFFF',
    color: isDark ? '#FAF9F8' : '#323130',
    border: `1px solid ${isDark ? '#484644' : '#C8C6C4'}`,
    borderRadius: '4px',
    outline: 'none',
    cursor: 'pointer',
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckmarkCircle20Filled style={{ color: '#107C10' }} />
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#107C10' }}>Connected</span>
          <span style={{ fontSize: '12px', color: isDark ? '#A19F9D' : '#605E5C', marginLeft: '8px' }}>
            {data.tables.length} tables · {data.kpis.length} KPIs
          </span>
        </div>
        <button
          onClick={onDisconnect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: 'transparent',
            color: isDark ? '#A19F9D' : '#605E5C',
            border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: "'Segoe UI', sans-serif",
            cursor: 'pointer',
          }}
        >
          <PlugDisconnected20Regular />
          Disconnect
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#A19F9D' : '#605E5C' }}>Database:</label>
          <select
            value={selectedDb}
            onChange={(e) => { setSelectedDb(e.target.value); setSelectedTable('ALL'); }}
            style={selectStyle}
          >
            {databases.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#A19F9D' : '#605E5C' }}>Table:</label>
          <select
            value={selectedTable}
            onChange={(e) => setSelectedTable(e.target.value)}
            style={selectStyle}
          >
            {availableTables.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Visual 1: Split Panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0',
          border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '32px',
        }}
      >
        {/* Header */}
        <div style={{ padding: '12px 16px', backgroundColor: isDark ? '#252423' : '#FAF9F8', borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`, borderRight: `1px solid ${isDark ? '#323130' : '#EDEBE9'}` }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Commit Freshness
          </span>
        </div>
        <div style={{ padding: '12px 16px', backgroundColor: isDark ? '#252423' : '#FAF9F8', borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}` }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Row Completeness
          </span>
        </div>

        {/* Content — scrollable */}
        <div
          style={{
            maxHeight: '600px',
            overflowY: 'auto',
            borderRight: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          }}
        >
          {filteredKpis.map((kpi) => (
            <CommitFreshness
              key={kpi.tableFqn}
              tableFqn={kpi.tableFqn}
              commits={filteredCommits.get(kpi.tableFqn) ?? []}
            />
          ))}
          {filteredKpis.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13px', color: isDark ? '#605E5C' : '#A19F9D' }}>
              No tables found
            </div>
          )}
        </div>
        <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
          {filteredKpis.map((kpi) => (
            <RowCompleteness
              key={kpi.tableFqn}
              tableFqn={kpi.tableFqn}
              commits={filteredCommits.get(kpi.tableFqn) ?? []}
            />
          ))}
          {filteredKpis.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '13px', color: isDark ? '#605E5C' : '#A19F9D' }}>
              No tables found
            </div>
          )}
        </div>
      </div>

      {/* Visual 2: Uber Lineage */}
      <div
        style={{
          border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '12px 16px', backgroundColor: isDark ? '#252423' : '#FAF9F8', borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {showColumnLineage ? 'Column-Level Lineage' : 'Uber Lineage'}
            </span>
            <span style={{ fontSize: '11px', color: isDark ? '#605E5C' : '#A19F9D', marginLeft: '8px' }}>
              {showColumnLineage
                ? `${data.lineage.columnEdges.length} column edges`
                : 'All tables and their relationships'}
            </span>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: isDark ? '#A19F9D' : '#605E5C',
              cursor: 'pointer',
              fontFamily: "'Segoe UI', sans-serif",
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={showColumnLineage}
              onChange={(e) => setShowColumnLineage(e.target.checked)}
              style={{ accentColor: '#0078D4', cursor: 'pointer' }}
            />
            Column lineage
          </label>
        </div>
        {showColumnLineage
          ? <LivyColumnLineage lineage={data.lineage} />
          : <UberLineage lineage={data.lineage} />}
      </div>

      {/* Visual 3: Dependency Heatmap */}
      <div
        style={{
          border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          borderRadius: '8px',
          overflow: 'hidden',
          marginTop: '32px',
        }}
      >
        <div style={{ padding: '12px 16px', backgroundColor: isDark ? '#252423' : '#FAF9F8', borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}` }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Dependency Heatmap
          </span>
          <span style={{ fontSize: '11px', color: isDark ? '#605E5C' : '#A19F9D', marginLeft: '8px' }}>
            Upstream row count volatility (CV) across dependency edges
          </span>
        </div>
        <LivyDependencyHeatmap lineage={data.lineage} commits={data.commits} />
      </div>
    </div>
  );
};

export default LivyDashboard;
