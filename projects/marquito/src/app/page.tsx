'use client';

import { useState } from 'react';
import { ParsedLineage } from '@/lib/types';
import HeroSection from '@/components/HeroSection';
import TableLineage from '@/components/TableLineage';
import ColumnLineage from '@/components/ColumnLineage';
import JobsTable from '@/components/JobsTable';
import DatasetsTable from '@/components/DatasetsTable';
import EventsTimeline from '@/components/EventsTimeline';
import DataSourcePicker from '@/components/DataSourcePicker';
import { useThemeContext } from '@/components/ThemeProvider';

export default function Home() {
  const [data, setData] = useState<ParsedLineage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { isDark } = useThemeContext();

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 96px)',
          fontFamily: "'Segoe UI', sans-serif",
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            border: `3px solid ${isDark ? '#323130' : '#EDEBE9'}`,
            borderTop: '3px solid #0078D4',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: '14px', color: isDark ? '#A19F9D' : '#605E5C' }}>
          Loading OpenLineage data…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 96px)',
          fontFamily: "'Segoe UI', sans-serif",
          gap: '12px',
        }}
      >
        <span style={{ fontSize: '16px', color: '#A4262C', fontWeight: 600 }}>Failed to load data</span>
        <span style={{ fontSize: '13px', color: isDark ? '#A19F9D' : '#605E5C' }}>{error}</span>
        <button
          onClick={() => { setError(null); setData(null); }}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            backgroundColor: '#0078D4',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: "'Segoe UI', sans-serif",
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <DataSourcePicker
        onDataLoaded={setData}
        onError={setError}
        onLoading={setLoading}
      />
    );
  }

  return (
    <div style={{ paddingBottom: '32px' }}>
      <HeroSection data={data} />
      <TableLineage data={data} />
      <ColumnLineage data={data} />
      <JobsTable data={data} />
      <DatasetsTable data={data} />
      <EventsTimeline data={data} />
    </div>
  );
}
