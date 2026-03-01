'use client';

import { useThemeContext } from './ThemeProvider';
import { ParsedLineage } from '@/lib/types';
import {
  Database20Regular,
  TaskListSquareLtr20Regular,
  Timeline20Regular,
  BranchFork20Regular,
} from '@fluentui/react-icons';

interface HeroSectionProps {
  data: ParsedLineage;
}

const HeroSection = ({ data }: HeroSectionProps) => {
  const { isDark } = useThemeContext();
  const { stats } = data;

  const statCards = [
    { label: 'Events', value: stats.totalEvents, icon: <Timeline20Regular />, color: '#0078D4' },
    { label: 'Jobs', value: stats.totalJobs, icon: <TaskListSquareLtr20Regular />, color: '#F2C811' },
    { label: 'Datasets', value: stats.totalDatasets, icon: <Database20Regular />, color: '#107C10' },
    { label: 'Column Lineage Edges', value: stats.columnLineageCount, icon: <BranchFork20Regular />, color: '#D83B01' },
  ];

  return (
    <section style={{ padding: '24px 24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '16px',
        }}
      >
        {statCards.map((card) => (
          <div
            key={card.label}
            style={{
              backgroundColor: isDark ? '#252423' : '#FFFFFF',
              border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
              borderRadius: '8px',
              padding: '20px',
              borderLeft: `3px solid ${card.color}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '8px',
                color: isDark ? '#A19F9D' : '#605E5C',
                fontSize: '12px',
                fontFamily: "'Segoe UI', sans-serif",
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              <span style={{ color: card.color }}>{card.icon}</span>
              {card.label}
            </div>
            <div
              style={{
                fontSize: '32px',
                fontWeight: 600,
                color: isDark ? '#FAF9F8' : '#323130',
                fontFamily: "'Segoe UI', sans-serif",
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default HeroSection;
