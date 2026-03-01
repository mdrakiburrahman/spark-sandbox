'use client';

import { useThemeContext } from './ThemeProvider';

const Footer = () => {
  const { isDark } = useThemeContext();

  const linkStyle: React.CSSProperties = {
    color: isDark ? '#A19F9D' : '#605E5C',
    textDecoration: 'none',
    fontSize: '11px',
    fontFamily: "'Segoe UI', sans-serif",
  };

  return (
    <footer
      style={{
        backgroundColor: isDark ? '#1B1A19' : '#F3F2F1',
        borderTop: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
        padding: '12px 24px',
      }}
    >
      <div
        style={{
          maxWidth: '1600px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="6" fill="#0078D4" />
            <text x="16" y="22" textAnchor="middle" fill="white" fontFamily="Segoe UI, sans-serif" fontSize="18" fontWeight="600">M</text>
          </svg>
          <span style={{ fontSize: '11px', color: isDark ? '#D2D0CE' : '#484644', fontWeight: 500, fontFamily: "'Segoe UI', sans-serif" }}>
            Marquito — OpenLineage Visualizer
          </span>
        </div>

        <div style={{ fontSize: '11px', color: isDark ? '#A19F9D' : '#605E5C', fontFamily: "'Segoe UI', sans-serif" }}>
          Powered by{' '}
          <a href="https://openlineage.io" target="_blank" rel="noopener noreferrer" style={{ color: '#0078D4', textDecoration: 'none' }}>
            OpenLineage
          </a>
          ,{' '}
          <a href="https://spark.apache.org" target="_blank" rel="noopener noreferrer" style={{ color: '#0078D4', textDecoration: 'none' }}>
            Apache Spark
          </a>
          {' '}and{' '}
          <a href="https://delta.io" target="_blank" rel="noopener noreferrer" style={{ color: '#0078D4', textDecoration: 'none' }}>
            Delta Lake
          </a>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a href="https://openlineage.io/spec/2-0-2/OpenLineage.json" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Spec
          </a>
          <a href="https://marquezproject.ai" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Marquez
          </a>
          <a href="https://github.com/OpenLineage/OpenLineage" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
