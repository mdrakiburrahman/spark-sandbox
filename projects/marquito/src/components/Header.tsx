'use client';

import { useThemeContext } from './ThemeProvider';
import ThemeToggle from './ThemeToggle';
import { Open16Regular } from '@fluentui/react-icons';

const Header = () => {
  const { isDark } = useThemeContext();

  return (
    <header
      style={{
        width: '100%',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: isDark ? '#1B1A19' : '#FFFFFF',
        borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
        height: '48px',
      }}
    >
      <div
        style={{
          padding: '0 24px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: '1600px',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="6" fill="#0078D4" />
            <text
              x="16"
              y="22"
              textAnchor="middle"
              fill="white"
              fontFamily="Segoe UI, sans-serif"
              fontSize="18"
              fontWeight="600"
            >
              M
            </text>
          </svg>
          <span
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: isDark ? '#FAF9F8' : '#323130',
              fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            Marquito
          </span>
          <span
            style={{
              fontSize: '12px',
              color: isDark ? '#A19F9D' : '#605E5C',
              fontFamily: "'Segoe UI', sans-serif",
              borderLeft: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
              paddingLeft: '12px',
            }}
          >
            OpenLineage Visualizer
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <a
            href="https://openlineage.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              textDecoration: 'none',
              color: isDark ? '#D2D0CE' : '#323130',
              fontSize: '13px',
              fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            OpenLineage
            <Open16Regular />
          </a>
          <a
            href="https://github.com/mdrakiburrahman/openlineage-sandbox"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              textDecoration: 'none',
              color: isDark ? '#D2D0CE' : '#323130',
              fontSize: '13px',
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
