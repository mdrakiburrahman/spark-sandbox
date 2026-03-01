'use client';

import React, { useState } from 'react';
import { useThemeContext } from './ThemeProvider';
import { ParsedLineage } from '@/lib/types';
import { ChevronDown20Regular, ChevronRight20Regular } from '@fluentui/react-icons';

interface EventsTimelineProps {
  data: ParsedLineage;
}

const EventsTimeline = ({ data }: EventsTimelineProps) => {
  const { isDark } = useThemeContext();
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null);

  // Sort events chronologically (newest first)
  const sortedEvents = [...data.events].sort(
    (a, b) => new Date(b.eventTime).getTime() - new Date(a.eventTime).getTime()
  );

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const eventTypeColor = (type: string) => {
    switch (type) {
      case 'START': return { bg: isDark ? 'rgba(0,120,212,0.15)' : 'rgba(0,120,212,0.1)', fg: isDark ? '#4DB8FF' : '#0078D4' };
      case 'COMPLETE': return { bg: isDark ? 'rgba(16,124,16,0.15)' : 'rgba(16,124,16,0.1)', fg: isDark ? '#6CCB5F' : '#107C10' };
      case 'FAIL': return { bg: isDark ? 'rgba(164,38,44,0.15)' : 'rgba(164,38,44,0.1)', fg: isDark ? '#FF6B6B' : '#A4262C' };
      default: return { bg: isDark ? 'rgba(161,159,157,0.15)' : 'rgba(161,159,157,0.1)', fg: isDark ? '#A19F9D' : '#605E5C' };
    }
  };

  return (
    <section style={{ padding: '0 24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', fontFamily: "'Segoe UI', sans-serif", marginBottom: '4px' }}>
        Events
      </h2>
      <p style={{ fontSize: '13px', color: isDark ? '#A19F9D' : '#605E5C', fontFamily: "'Segoe UI', sans-serif", marginBottom: '16px' }}>
        {data.events.length} OpenLineage events in chronological order. Click to expand raw JSON.
      </p>
      <div
        style={{
          backgroundColor: isDark ? '#252423' : '#FFFFFF',
          border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {sortedEvents.map((event, idx) => {
          const isExpanded = expandedEvent === idx;
          const colors = eventTypeColor(event.eventType);

          return (
            <div key={`${event.run.runId}-${event.eventType}-${idx}`}>
              <div
                onClick={() => setExpandedEvent(isExpanded ? null : idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${isDark ? '#252423' : '#F3F2F1'}`,
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#2C2B2A' : '#FAF9F8';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                }}
              >
                {isExpanded ? (
                  <ChevronDown20Regular style={{ color: isDark ? '#A19F9D' : '#605E5C', flexShrink: 0 }} />
                ) : (
                  <ChevronRight20Regular style={{ color: isDark ? '#A19F9D' : '#605E5C', flexShrink: 0 }} />
                )}
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    backgroundColor: colors.bg,
                    color: colors.fg,
                    fontWeight: 600,
                    fontFamily: "'Segoe UI', sans-serif",
                    minWidth: '72px',
                    textAlign: 'center',
                  }}
                >
                  {event.eventType}
                </span>
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 500,
                    color: isDark ? '#D2D0CE' : '#323130',
                    fontFamily: "'Segoe UI', sans-serif",
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={event.job.name}
                >
                  {event.job.name.replace('local_session.', '')}
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    color: isDark ? '#605E5C' : '#A19F9D',
                    fontFamily: "'Segoe UI', sans-serif",
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatTime(event.eventTime)}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    color: isDark ? '#605E5C' : '#A19F9D',
                    fontFamily: 'monospace',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {event.run.runId.slice(0, 8)}…
                </span>
              </div>
              {isExpanded && (
                <div
                  style={{
                    backgroundColor: isDark ? '#201F1E' : '#FAF9F8',
                    padding: '16px',
                    borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
                    overflow: 'auto',
                    maxHeight: '400px',
                  }}
                >
                  <pre
                    style={{
                      fontSize: '11px',
                      fontFamily: "monospace, 'Segoe UI'",
                      color: isDark ? '#D2D0CE' : '#323130',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      margin: 0,
                      lineHeight: '1.5',
                    }}
                  >
                    {JSON.stringify(event, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default EventsTimeline;
