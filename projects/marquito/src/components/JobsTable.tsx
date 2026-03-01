'use client';

import { useThemeContext } from './ThemeProvider';
import { ParsedLineage } from '@/lib/types';
import { useState } from 'react';

interface JobsTableProps {
  data: ParsedLineage;
}

const JobsTable = ({ data }: JobsTableProps) => {
  const { isDark } = useThemeContext();
  const [sortField, setSortField] = useState<'name' | 'type' | 'latestEventType'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sorted = [...data.jobs].sort((a, b) => {
    const av = a[sortField];
    const bv = b[sortField];
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = (field: 'name' | 'type' | 'latestEventType') => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const statusColor = (type: string) => {
    switch (type) {
      case 'COMPLETE': return '#107C10';
      case 'START': return '#0078D4';
      case 'FAIL': return '#A4262C';
      default: return isDark ? '#A19F9D' : '#605E5C';
    }
  };

  const thStyle: React.CSSProperties = {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 600,
    color: isDark ? '#A19F9D' : '#605E5C',
    fontFamily: "'Segoe UI', sans-serif",
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
    cursor: 'pointer',
    userSelect: 'none',
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 16px',
    fontSize: '13px',
    color: isDark ? '#D2D0CE' : '#323130',
    fontFamily: "'Segoe UI', sans-serif",
    borderBottom: `1px solid ${isDark ? '#252423' : '#F3F2F1'}`,
  };

  return (
    <section style={{ padding: '0 24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', fontFamily: "'Segoe UI', sans-serif", marginBottom: '4px' }}>
        Jobs
      </h2>
      <p style={{ fontSize: '13px', color: isDark ? '#A19F9D' : '#605E5C', fontFamily: "'Segoe UI', sans-serif", marginBottom: '16px' }}>
        {data.jobs.length} transformation jobs extracted from the lineage events.
      </p>
      <div
        style={{
          backgroundColor: isDark ? '#252423' : '#FFFFFF',
          border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: isDark ? '#201F1E' : '#F3F2F1' }}>
              <th style={thStyle} onClick={() => handleSort('name')}>
                Name {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={thStyle} onClick={() => handleSort('type')}>
                Type {sortField === 'type' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={thStyle}>Processing</th>
              <th style={thStyle} onClick={() => handleSort('latestEventType')}>
                Status {sortField === 'latestEventType' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
              <th style={thStyle}>SQL</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((job) => (
              <tr
                key={job.runId}
                style={{
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#2C2B2A' : '#FAF9F8';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                <td style={{ ...tdStyle, fontWeight: 500, maxWidth: '300px' }}>
                  <span title={job.name} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {job.name.replace('local_session.', '')}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      backgroundColor: isDark ? 'rgba(242,200,17,0.15)' : 'rgba(242,200,17,0.2)',
                      color: isDark ? '#F2C811' : '#8A6914',
                    }}
                  >
                    {job.type}
                  </span>
                </td>
                <td style={tdStyle}>{job.processingType}</td>
                <td style={tdStyle}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: statusColor(job.latestEventType),
                      }}
                    />
                    {job.latestEventType}
                  </span>
                </td>
                <td style={{ ...tdStyle, maxWidth: '250px' }}>
                  {job.sql ? (
                    <code
                      style={{
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        color: isDark ? '#A19F9D' : '#605E5C',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={job.sql}
                    >
                      {job.sql}
                    </code>
                  ) : (
                    <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontSize: '11px' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default JobsTable;
