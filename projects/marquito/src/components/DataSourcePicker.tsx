'use client';

import React, { useRef, useState } from 'react';
import { useThemeContext } from './ThemeProvider';
import { validateJsonl, parseLineageText, fetchLineageData, SAMPLE_DATASETS } from '@/lib/parseLineage';
import { ParsedLineage } from '@/lib/types';
import ArchitectureDiagram, { STEPS, PALETTES } from './ArchitectureDiagram';
import {
  ArrowUpload20Regular,
  ArrowDownload20Regular,
  CheckmarkCircle20Filled,
  ErrorCircle20Filled,
  Info20Regular,
} from '@fluentui/react-icons';

interface DataSourcePickerProps {
  onDataLoaded: (data: ParsedLineage) => void;
  onError: (error: string) => void;
  onLoading: (loading: boolean) => void;
}

const BLOB_BASE = 'https://rakirahman.blob.core.windows.net/public/datasets';

const DataSourcePicker = ({ onDataLoaded, onError, onLoading }: DataSourcePickerProps) => {
  const { isDark } = useThemeContext();
  const [mode, setMode] = useState<'choose' | 'upload' | null>('choose');
  const [uploadStatus, setUploadStatus] = useState<{
    state: 'idle' | 'validating' | 'valid' | 'invalid';
    fileName?: string;
    eventCount?: number;
    errors?: string[];
  }>({ state: 'idle' });
  const [parsedFromUpload, setParsedFromUpload] = useState<ParsedLineage | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUseSample = async (localPath: string) => {
    setMode(null);
    onLoading(true);
    try {
      const data = await fetchLineageData(localPath);
      onDataLoaded(data);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Failed to load dataset');
    } finally {
      onLoading(false);
    }
  };

  const handleDownloadSample = (e: React.MouseEvent, fileName: string) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = `${BLOB_BASE}/${fileName}`;
    link.download = fileName;
    link.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus({ state: 'validating', fileName: file.name });
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const validation = validateJsonl(text);
      if (validation.valid) {
        try {
          const parsed = parseLineageText(text);
          setParsedFromUpload(parsed);
          setUploadStatus({
            state: 'valid',
            fileName: file.name,
            eventCount: validation.eventCount,
          });
        } catch (err: unknown) {
          setUploadStatus({
            state: 'invalid',
            fileName: file.name,
            errors: [err instanceof Error ? err.message : 'Failed to parse lineage data'],
          });
        }
      } else {
        setUploadStatus({
          state: 'invalid',
          fileName: file.name,
          errors: validation.errors,
        });
      }
    };
    reader.onerror = () => {
      setUploadStatus({ state: 'invalid', fileName: file.name, errors: ['Failed to read file.'] });
    };
    reader.readAsText(file);
  };

  const handleUseUploaded = () => {
    if (parsedFromUpload) {
      setMode(null);
      onDataLoaded(parsedFromUpload);
    }
  };

  const cardBase: React.CSSProperties = {
    backgroundColor: isDark ? '#252423' : '#FFFFFF',
    border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
    borderRadius: '8px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, box-shadow 0.15s',
    fontFamily: "'Segoe UI', sans-serif",
  };

  const cardHover = (e: React.MouseEvent, enter: boolean) => {
    const el = e.currentTarget as HTMLElement;
    if (enter) {
      el.style.borderColor = '#0078D4';
      el.style.boxShadow = '0 0 0 1px #0078D4';
    } else {
      el.style.borderColor = isDark ? '#323130' : '#EDEBE9';
      el.style.boxShadow = 'none';
    }
  };

  if (mode === 'choose') {
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
        <h1
          style={{
            fontSize: '28px',
            fontWeight: 600,
            color: isDark ? '#FAF9F8' : '#323130',
            marginBottom: '8px',
          }}
        >
          OpenLineage Visualizer
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: isDark ? '#A19F9D' : '#605E5C',
            marginBottom: '32px',
            textAlign: 'center',
            maxWidth: '560px',
            lineHeight: '1.5',
          }}
        >
          Choose a sample dataset to explore, or upload your own OpenLineage JSONL file.
        </p>

        {/* Sample datasets section */}
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isDark ? '#A19F9D' : '#605E5C',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            alignSelf: 'flex-start',
            maxWidth: '900px',
            width: '100%',
            margin: '0 auto 12px',
          }}
        >
          Sample Datasets
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '16px',
            maxWidth: '900px',
            width: '100%',
            marginBottom: '24px',
          }}
        >
          {SAMPLE_DATASETS.map((ds) => (
            <div
              key={ds.id}
              style={{ ...cardBase, borderLeft: `3px solid ${ds.color}` }}
              onClick={() => handleUseSample(ds.localPath)}
              onMouseEnter={(e) => cardHover(e, true)}
              onMouseLeave={(e) => cardHover(e, false)}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '6px',
                      backgroundColor: isDark
                        ? `${ds.color}22`
                        : `${ds.color}15`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ds.id === 'spark-delta' ? '/spark-favicon.ico' : '/dbt-favicon.ico'}
                      alt={ds.id === 'spark-delta' ? 'Apache Spark' : 'dbt'}
                      width={20}
                      height={20}
                      style={{ objectFit: 'contain' }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: '15px',
                      fontWeight: 600,
                      color: isDark ? '#FAF9F8' : '#323130',
                    }}
                  >
                    {ds.label}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDownloadSample(e, ds.fileName)}
                  title={`Download ${ds.fileName}`}
                  style={{
                    background: 'none',
                    border: `1px solid ${isDark ? '#484644' : '#E1DFDD'}`,
                    borderRadius: '4px',
                    padding: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isDark ? '#A19F9D' : '#605E5C',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = '#0078D4';
                    (e.currentTarget as HTMLElement).style.color = '#0078D4';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = isDark ? '#484644' : '#E1DFDD';
                    (e.currentTarget as HTMLElement).style.color = isDark ? '#A19F9D' : '#605E5C';
                  }}
                >
                  <ArrowDownload20Regular />
                </button>
              </div>
              <p
                style={{
                  fontSize: '12px',
                  color: isDark ? '#A19F9D' : '#605E5C',
                  lineHeight: '1.5',
                  margin: '0 0 8px',
                }}
              >
                {ds.description}
              </p>
              <span
                style={{
                  fontSize: '11px',
                  color: isDark ? '#605E5C' : '#A19F9D',
                  fontFamily: 'monospace',
                }}
              >
                {ds.events} events · {ds.fileName}
              </span>
            </div>
          ))}
        </div>

        {/* Upload custom section */}
        <div
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isDark ? '#A19F9D' : '#605E5C',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            marginBottom: '12px',
            maxWidth: '900px',
            width: '100%',
          }}
        >
          Or bring your own
        </div>
        <div
          style={{
            ...cardBase,
            maxWidth: '900px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
          onClick={() => setMode('upload')}
          onMouseEnter={(e) => cardHover(e, true)}
          onMouseLeave={(e) => cardHover(e, false)}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: isDark ? 'rgba(242,200,17,0.15)' : 'rgba(242,200,17,0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <ArrowUpload20Regular style={{ color: '#F2C811' }} />
          </div>
          <div>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: isDark ? '#FAF9F8' : '#323130',
                display: 'block',
                marginBottom: '2px',
              }}
            >
              Upload Custom JSONL
            </span>
            <span
              style={{
                fontSize: '12px',
                color: isDark ? '#A19F9D' : '#605E5C',
              }}
            >
              Upload your own OpenLineage JSONL file — parsed entirely in your browser.
            </span>
          </div>
        </div>

        {/* ── Divider ── */}
        <div
          style={{
            maxWidth: '900px',
            width: '100%',
            margin: '48px auto 0',
            borderTop: `1px solid ${isDark ? '#3D3B39' : '#E1DFDD'}`,
          }}
        />

        {/* ── OpenLineage Visualized section ── */}
        <div
          style={{
            maxWidth: '900px',
            width: '100%',
            margin: '0 auto',
            paddingTop: '40px',
          }}
        >
          <h2
            style={{
              fontSize: '24px',
              fontWeight: 600,
              color: isDark ? '#FAF9F8' : '#323130',
              marginBottom: '6px',
              textAlign: 'center',
            }}
          >
            OpenLineage Visualized
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: isDark ? '#A19F9D' : '#605E5C',
              marginBottom: '24px',
              textAlign: 'center',
            }}
          >
            How lineage flows from query to OpenLineage event — hover any block for sample data.
          </p>
          <ArchitectureDiagram />

          {/* ── Numbered steps (simple text list) ── */}
          <ol
            style={{
              marginTop: '24px',
              paddingLeft: '0',
              listStyle: 'none',
              fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            {STEPS.map((step) => {
              const pal = PALETTES[step.tech];
              return (
                <li
                  key={step.num}
                  style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'baseline',
                    padding: '6px 0',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    color: isDark ? '#D2D0CE' : '#323130',
                  }}
                >
                  <span
                    style={{
                      color: pal.gradStart,
                      fontWeight: 800,
                      fontSize: '13px',
                      flexShrink: 0,
                      minWidth: '18px',
                    }}
                  >
                    {step.num}.
                  </span>
                  <span>
                    <strong style={{ color: isDark ? '#FAF9F8' : '#323130' }}>{step.label}</strong>
                    {' — '}
                    <span style={{ color: isDark ? '#A19F9D' : '#605E5C' }}>{step.text}</span>
                    {' '}
                    <a
                      href={step.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#0078D4',
                        fontSize: '11px',
                        fontFamily: "'Cascadia Code', 'Consolas', monospace",
                        textDecoration: 'none',
                        opacity: 0.85,
                      }}
                    >
                      📄 {step.sourceLabel}
                    </a>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    );
  }

  if (mode === 'upload') {
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
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: isDark ? '#FAF9F8' : '#323130',
            marginBottom: '8px',
          }}
        >
          Upload OpenLineage JSONL
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: isDark ? '#A19F9D' : '#605E5C',
            marginBottom: '24px',
            textAlign: 'center',
            maxWidth: '520px',
            lineHeight: '1.5',
          }}
        >
          Upload a file where each line is a valid OpenLineage JSON event. The file must contain{' '}
          <code style={{ fontSize: '12px', backgroundColor: isDark ? '#323130' : '#F3F2F1', padding: '1px 4px', borderRadius: '3px' }}>
            eventType
          </code>
          ,{' '}
          <code style={{ fontSize: '12px', backgroundColor: isDark ? '#323130' : '#F3F2F1', padding: '1px 4px', borderRadius: '3px' }}>
            job
          </code>
          , and{' '}
          <code style={{ fontSize: '12px', backgroundColor: isDark ? '#323130' : '#F3F2F1', padding: '1px 4px', borderRadius: '3px' }}>
            run
          </code>{' '}
          fields per line.
        </p>

        {/* Example download links */}
        <div
          style={{
            backgroundColor: isDark ? '#252423' : '#FFFFFF',
            border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
            borderRadius: '8px',
            padding: '20px',
            maxWidth: '520px',
            width: '100%',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '12px',
              color: isDark ? '#A19F9D' : '#605E5C',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <Info20Regular style={{ color: '#0078D4' }} />
            Need an example file?
          </div>
          <ol
            style={{
              fontSize: '13px',
              color: isDark ? '#D2D0CE' : '#323130',
              lineHeight: '1.8',
              paddingLeft: '20px',
              margin: '0 0 12px',
            }}
          >
            <li>Download one of the sample JSONL files below</li>
            <li>Then upload it using the file picker</li>
          </ol>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {SAMPLE_DATASETS.map((ds) => (
              <button
                key={ds.id}
                onClick={(e) => handleDownloadSample(e, ds.fileName)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: isDark ? '#201F1E' : '#FAF9F8',
                  border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontFamily: "'Segoe UI', sans-serif",
                  fontSize: '12px',
                  color: isDark ? '#D2D0CE' : '#323130',
                  textAlign: 'left',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = '#0078D4';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = isDark ? '#323130' : '#EDEBE9';
                }}
              >
                <ArrowDownload20Regular style={{ color: '#0078D4', flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  <strong>{ds.label}</strong>
                  <span style={{ color: isDark ? '#605E5C' : '#A19F9D', marginLeft: '8px' }}>
                    {ds.events} events
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Upload area */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.jsonl,.txt"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const file = e.dataTransfer.files?.[0];
            if (file && fileInputRef.current) {
              const dt = new DataTransfer();
              dt.items.add(file);
              fileInputRef.current.files = dt.files;
              fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }}
          style={{
            maxWidth: '520px',
            width: '100%',
            padding: '32px',
            border: `2px dashed ${isDark ? '#484644' : '#C8C6C4'}`,
            borderRadius: '8px',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDark ? '#201F1E' : '#FAF9F8',
            transition: 'border-color 0.15s',
            marginBottom: '16px',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = '#0078D4';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = isDark ? '#484644' : '#C8C6C4';
          }}
        >
          <ArrowUpload20Regular
            style={{ color: isDark ? '#A19F9D' : '#605E5C', marginBottom: '8px', width: '28px', height: '28px' }}
          />
          <div style={{ fontSize: '14px', color: isDark ? '#D2D0CE' : '#323130', fontWeight: 500 }}>
            Click to browse or drag & drop
          </div>
          <div style={{ fontSize: '12px', color: isDark ? '#605E5C' : '#A19F9D', marginTop: '4px' }}>
            .json, .jsonl, or .txt files
          </div>
        </div>

        {/* Validation status */}
        {uploadStatus.state === 'validating' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#A19F9D' : '#605E5C', fontSize: '13px' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                border: `2px solid ${isDark ? '#323130' : '#EDEBE9'}`,
                borderTop: '2px solid #0078D4',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Validating {uploadStatus.fileName}…
          </div>
        )}

        {uploadStatus.state === 'valid' && (
          <div style={{ maxWidth: '520px', width: '100%' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#107C10',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '12px',
              }}
            >
              <CheckmarkCircle20Filled />
              {uploadStatus.fileName} — {uploadStatus.eventCount} valid events
            </div>
            <button
              onClick={handleUseUploaded}
              style={{
                width: '100%',
                padding: '10px 20px',
                backgroundColor: '#0078D4',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: "'Segoe UI', sans-serif",
                cursor: 'pointer',
                transition: 'background-color 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#106EBE';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = '#0078D4';
              }}
            >
              Visualize Lineage
            </button>
          </div>
        )}

        {uploadStatus.state === 'invalid' && (
          <div style={{ maxWidth: '520px', width: '100%' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#A4262C',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '8px',
              }}
            >
              <ErrorCircle20Filled />
              Validation failed for {uploadStatus.fileName}
            </div>
            <div
              style={{
                backgroundColor: isDark ? 'rgba(164,38,44,0.1)' : 'rgba(164,38,44,0.06)',
                border: `1px solid ${isDark ? '#5C2020' : '#FDE7E9'}`,
                borderRadius: '6px',
                padding: '12px',
              }}
            >
              {uploadStatus.errors?.map((err, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '12px',
                    color: isDark ? '#FF6B6B' : '#A4262C',
                    fontFamily: 'monospace',
                    padding: '2px 0',
                  }}
                >
                  {err}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back button */}
        <button
          onClick={() => { setMode('choose'); setUploadStatus({ state: 'idle' }); setParsedFromUpload(null); }}
          style={{
            marginTop: '24px',
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
          ← Back to options
        </button>
      </div>
    );
  }

  return null;
};

export default DataSourcePicker;
