'use client';

import { useThemeContext } from './ThemeProvider';
import { ParsedLineage } from '@/lib/types';
import { useState } from 'react';
import { ChevronDown20Regular, ChevronRight20Regular } from '@fluentui/react-icons';

interface DatasetsTableProps {
  data: ParsedLineage;
}

const DatasetsTable = ({ data }: DatasetsTableProps) => {
  const { isDark } = useThemeContext();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (key: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const roleColors: Record<string, { bg: string; fg: string }> = {
    source: {
      bg: isDark ? 'rgba(0,120,212,0.15)' : 'rgba(0,120,212,0.1)',
      fg: isDark ? '#4DB8FF' : '#0078D4',
    },
    intermediate: {
      bg: isDark ? 'rgba(242,200,17,0.15)' : 'rgba(242,200,17,0.15)',
      fg: isDark ? '#F2C811' : '#8A6914',
    },
    target: {
      bg: isDark ? 'rgba(16,124,16,0.15)' : 'rgba(16,124,16,0.1)',
      fg: isDark ? '#6CCB5F' : '#107C10',
    },
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
        Datasets
      </h2>
      <p style={{ fontSize: '13px', color: isDark ? '#A19F9D' : '#605E5C', fontFamily: "'Segoe UI', sans-serif", marginBottom: '16px' }}>
        {data.datasets.length} datasets with schema information. Click a row to expand and see column details.
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
              <th style={{ ...thStyle, width: '30px' }}></th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Namespace</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Fields</th>
              <th style={thStyle}>Column Lineage</th>
            </tr>
          </thead>
          <tbody>
            {data.datasets.map((ds) => {
              const key = `${ds.namespace}::${ds.name}`;
              const isExpanded = expandedRows.has(key);
              const roleStyle = roleColors[ds.role] || roleColors.source;

              return (
                <React.Fragment key={key}>
                  <tr
                    onClick={() => toggleRow(key)}
                    style={{ cursor: 'pointer', transition: 'background-color 0.15s' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#2C2B2A' : '#FAF9F8';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                    }}
                  >
                    <td style={tdStyle}>
                      {isExpanded ? (
                        <ChevronDown20Regular style={{ color: isDark ? '#A19F9D' : '#605E5C' }} />
                      ) : (
                        <ChevronRight20Regular style={{ color: isDark ? '#A19F9D' : '#605E5C' }} />
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                      <span title={ds.name}>{ds.shortName}</span>
                    </td>
                    <td style={{ ...tdStyle, fontSize: '11px', color: isDark ? '#A19F9D' : '#605E5C' }}>
                      <span
                        style={{
                          display: 'block',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={ds.namespace}
                      >
                        {ds.namespace}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          backgroundColor: roleStyle.bg,
                          color: roleStyle.fg,
                          textTransform: 'uppercase',
                        }}
                      >
                        {ds.role}
                      </span>
                    </td>
                    <td style={tdStyle}>{ds.schema.length}</td>
                    <td style={tdStyle}>
                      {ds.columnLineage ? (
                        <span style={{ color: '#107C10', fontSize: '12px' }}>✓ {Object.keys(ds.columnLineage).length} fields</span>
                      ) : (
                        <span style={{ color: isDark ? '#605E5C' : '#A19F9D', fontSize: '11px' }}>—</span>
                      )}
                    </td>
                  </tr>
                  {isExpanded && ds.schema.length > 0 && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div
                          style={{
                            backgroundColor: isDark ? '#201F1E' : '#FAF9F8',
                            padding: '12px 48px',
                            borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
                          }}
                        >
                          <div style={{ fontSize: '11px', fontWeight: 600, color: isDark ? '#A19F9D' : '#605E5C', marginBottom: '8px', fontFamily: "'Segoe UI', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Schema
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '4px' }}>
                            {ds.schema.map((field) => (
                              <div
                                key={field.name}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: isDark ? '#252423' : '#FFFFFF',
                                  border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
                                }}
                              >
                                <span style={{ fontSize: '12px', fontWeight: 500, color: isDark ? '#D2D0CE' : '#323130', fontFamily: "monospace" }}>
                                  {field.name}
                                </span>
                                <span style={{ fontSize: '10px', color: isDark ? '#605E5C' : '#A19F9D', fontFamily: "monospace" }}>
                                  {field.type}
                                </span>
                              </div>
                            ))}
                          </div>
                          {ds.columnLineage && (
                            <div style={{ marginTop: '12px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: isDark ? '#A19F9D' : '#605E5C', marginBottom: '8px', fontFamily: "'Segoe UI', sans-serif", textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Column Lineage
                              </div>
                              {Object.entries(ds.columnLineage).map(([field, info]) => (
                                <div key={field} style={{ marginBottom: '6px' }}>
                                  <span style={{ fontSize: '12px', fontWeight: 500, color: isDark ? '#FAF9F8' : '#323130', fontFamily: "monospace" }}>
                                    {field}
                                  </span>
                                  <span style={{ fontSize: '11px', color: isDark ? '#605E5C' : '#A19F9D', marginLeft: '8px' }}>
                                    ← {info.inputFields.map((f) => `${f.name.split('/').pop()}.${f.field}`).join(', ')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

// Need to import React for Fragment
import React from 'react';

export default DatasetsTable;
