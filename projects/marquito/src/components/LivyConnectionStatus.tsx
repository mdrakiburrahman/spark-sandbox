'use client';

import { useThemeContext } from './ThemeProvider';
import { ConnectionPhase } from '@/lib/livy/types';
import {
  CheckmarkCircle20Filled,
  ErrorCircle20Filled,
  ArrowSync20Regular,
} from '@fluentui/react-icons';

interface LivyConnectionStatusProps {
  phase: ConnectionPhase;
  message: string;
  error?: string | null;
  sessionWarning?: string | null;
  onRetry: () => void;
  onBack: () => void;
}

const PHASE_STEPS: { phase: ConnectionPhase; label: string }[] = [
  { phase: 'creating_session', label: 'Creating Spark session' },
  { phase: 'polling_session', label: 'Waiting for session to become idle' },
  { phase: 'session_ready', label: 'Session ready' },
  { phase: 'loading_data', label: 'Loading data from Lakehouse' },
  { phase: 'connected', label: 'Connected' },
];

function phaseIndex(phase: ConnectionPhase): number {
  const idx = PHASE_STEPS.findIndex((s) => s.phase === phase);
  return idx >= 0 ? idx : -1;
}

const LivyConnectionStatus = ({ phase, message, error, sessionWarning, onRetry, onBack }: LivyConnectionStatusProps) => {
  const { isDark } = useThemeContext();
  const currentIdx = phaseIndex(phase);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 96px)',
        padding: '48px 24px',
        fontFamily: "'Segoe UI', sans-serif",
      }}
    >
      <h2 style={{ fontSize: '20px', fontWeight: 600, color: isDark ? '#FAF9F8' : '#323130', marginBottom: '24px' }}>
        Connecting to Fabric Livy
      </h2>

      {sessionWarning && (
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: isDark ? 'rgba(242,200,17,0.1)' : 'rgba(242,200,17,0.06)',
            border: `1px solid ${isDark ? '#6B5C00' : '#FFF4CE'}`,
            borderRadius: '6px',
            padding: '10px 12px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: isDark ? '#F2C811' : '#6B5C00',
          }}
        >
          ⚠️ {sessionWarning}
        </div>
      )}

      <div style={{ maxWidth: '440px', width: '100%', display: 'flex', flexDirection: 'column', gap: '0' }}>
        {PHASE_STEPS.map((step, idx) => {
          const isActive = idx === currentIdx;
          const isCompleted = currentIdx > idx || phase === 'connected';
          const isError = phase === 'error' && idx === currentIdx;
          const isPending = idx > currentIdx;

          let dotColor = isDark ? '#484644' : '#C8C6C4';
          if (isCompleted) dotColor = '#107C10';
          if (isActive && !isError) dotColor = '#0078D4';
          if (isError) dotColor = '#A4262C';

          return (
            <div key={step.phase} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', position: 'relative' }}>
              {/* Vertical line */}
              {idx < PHASE_STEPS.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: '11px',
                    top: '24px',
                    width: '2px',
                    height: '32px',
                    backgroundColor: isCompleted ? '#107C10' : isDark ? '#323130' : '#EDEBE9',
                  }}
                />
              )}

              {/* Dot / icon */}
              <div style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {isCompleted ? (
                  <CheckmarkCircle20Filled style={{ color: '#107C10' }} />
                ) : isError ? (
                  <ErrorCircle20Filled style={{ color: '#A4262C' }} />
                ) : isActive ? (
                  <div style={{ position: 'relative', width: '20px', height: '20px' }}>
                    <div
                      style={{
                        width: '20px',
                        height: '20px',
                        border: `2px solid ${isDark ? '#323130' : '#EDEBE9'}`,
                        borderTop: '2px solid #0078D4',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                      }}
                    />
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                  </div>
                ) : (
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: dotColor }} />
                )}
              </div>

              {/* Label */}
              <div style={{ paddingBottom: '20px' }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: isActive || isCompleted ? 600 : 400,
                    color: isPending
                      ? isDark ? '#605E5C' : '#A19F9D'
                      : isError
                        ? '#A4262C'
                        : isDark ? '#FAF9F8' : '#323130',
                    lineHeight: '24px',
                  }}
                >
                  {step.label}
                </div>
                {isActive && message && (
                  <div style={{ fontSize: '11px', color: isDark ? '#A19F9D' : '#605E5C', marginTop: '2px' }}>
                    {message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {phase === 'error' && error && (
        <div
          style={{
            maxWidth: '440px',
            width: '100%',
            backgroundColor: isDark ? 'rgba(164,38,44,0.1)' : 'rgba(164,38,44,0.06)',
            border: `1px solid ${isDark ? '#5C2020' : '#FDE7E9'}`,
            borderRadius: '6px',
            padding: '12px',
            marginTop: '16px',
          }}
        >
          <div style={{ fontSize: '12px', color: isDark ? '#FF6B6B' : '#A4262C', fontFamily: "'Cascadia Code', monospace", wordBreak: 'break-all' }}>
            {error}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
        {phase === 'error' && (
          <button
            onClick={onRetry}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
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
            <ArrowSync20Regular />
            Retry
          </button>
        )}
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: isDark ? '#A19F9D' : '#605E5C',
            border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: "'Segoe UI', sans-serif",
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
      </div>
    </div>
  );
};

export default LivyConnectionStatus;
