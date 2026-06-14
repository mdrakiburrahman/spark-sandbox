'use client'

import React, { useState, useRef, useEffect } from 'react'
import { useThemeContext } from '../ThemeProvider'

export type LayoutAlgorithm = 'leftright' | 'snowflake' | 'default'
export type DetailLevel = 'All' | 'Keys' | 'Tables'

interface BottomToolbarProps {
    onAutoArrange: (algorithm: LayoutAlgorithm) => void
    highlight: boolean
    onToggleHighlight: () => void
    gridEnabling: boolean
    onToggleGrid: () => void
    detailLevel: DetailLevel
    onDetailLevelChanged: (level: DetailLevel) => void
    onToggleTableSearch: () => void
    showTableSearch: boolean
}

const LAYOUT_OPTIONS: { label: string; value: LayoutAlgorithm; description: string; icon: string }[] = [
    {
        label: 'Left-right',
        value: 'leftright',
        icon: '⇉',
        description: 'Arrange tables from left to right based on their relationship direction. Ideal for diagrams with long relationship lineage like ETL pipelines.',
    },
    {
        label: 'Snowflake',
        value: 'snowflake',
        icon: '❄',
        description: 'Arrange tables in a snowflake shape, with the most connected tables in the center. Ideal for densely connected diagrams like data warehouses.',
    },
    {
        label: 'Compact',
        value: 'default',
        icon: '▦',
        description: 'Arrange tables in a compact rectangle layout. Ideal for diagrams with few relationships and tables.',
    },
]

const DETAIL_LABELS: Record<DetailLevel, string> = {
    All: 'All fields',
    Keys: 'Keys only',
    Tables: 'Table names',
}

const DETAIL_ICONS: Record<DetailLevel, string> = {
    All: '☰',
    Keys: '🔑',
    Tables: '▤',
}

export default function BottomToolbar({
    onAutoArrange,
    highlight,
    onToggleHighlight,
    gridEnabling,
    onToggleGrid,
    detailLevel,
    onDetailLevelChanged,
    onToggleTableSearch,
    showTableSearch,
}: BottomToolbarProps) {
    const { isDark } = useThemeContext()
    const [arrangeOpen, setArrangeOpen] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const arrangeRef = useRef<HTMLDivElement>(null)
    const detailRef = useRef<HTMLDivElement>(null)

    // Close dropups on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (arrangeRef.current && !arrangeRef.current.contains(e.target as Node)) setArrangeOpen(false)
            if (detailRef.current && !detailRef.current.contains(e.target as Node)) setDetailOpen(false)
        }
        document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [])

    const t = isDark
        ? {
              bg: '#303137f2',
              border: '#3a3a3a',
              color: '#e7e9ed',
              hoverBg: '#444',
              selectedBg: '#555',
              dropBg: '#303137',
              dropBorder: '#565656',
              dropItem: '#f5f6f8',
              dropHover: '#565656',
              dropTitle: '#f5f6f8',
              dropTitleBorder: '#565656',
              shadow: '0 2px 12px rgba(0,0,0,0.15)',
              dropShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }
        : {
              bg: '#fffffff2',
              border: '#e5e7eb',
              color: '#171c26',
              hoverBg: '#f1f1f1',
              selectedBg: '#e1e3ea',
              dropBg: '#fff',
              dropBorder: '#d8dce2',
              dropItem: '#2a3346',
              dropHover: '#f1f1f1',
              dropTitle: '#2a3346',
              dropTitleBorder: '#d8dce2',
              shadow: '0 2px 12px rgba(0,0,0,0.08)',
              dropShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }

    const btnStyle: React.CSSProperties = {
        cursor: 'pointer',
        borderRadius: 4,
        fontFamily: "'Open Sans', sans-serif",
        fontSize: 13,
        transition: 'all 0.15s',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: 32,
        height: 32,
        padding: 6,
        background: 'transparent',
        border: 'none',
        color: t.color,
        position: 'relative',
    }

    const selectedBtnStyle: React.CSSProperties = {
        ...btnStyle,
        boxShadow: isDark ? 'inset 0 1px 2px rgba(0,0,0,0.1)' : 'inset 0 1px 2px rgba(0,0,0,0.05)',
        background: t.selectedBg,
    }

    return (
        <div
            className="dbml-controller-container"
            style={{
                bottom: 15,
                display: 'flex',
                justifyContent: 'center',
                width: 'fit-content',
                margin: 'auto',
                position: 'absolute',
                left: 0,
                right: 0,
                zIndex: 20,
            }}
        >
            <div
                className="dbml-controller"
                style={{
                    backdropFilter: 'blur(5px)',
                    WebkitBackdropFilter: 'blur(5px)',
                    borderRadius: 8,
                    justifyContent: 'center',
                    alignItems: 'center',
                    width: 'auto',
                    height: 48,
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 13,
                    transition: 'all 0.2s',
                    display: 'flex',
                    background: t.bg,
                    border: `1px solid ${t.border}`,
                    boxShadow: t.shadow,
                    gap: 2,
                    padding: '0 6px',
                }}
            >
                {/* Auto Arrange Dropdown */}
                <div ref={arrangeRef} style={{ position: 'relative', padding: 0 }}>
                    <button
                        style={{ ...btnStyle, width: 'auto', padding: '0 8px', gap: 4 }}
                        onClick={() => {
                            setArrangeOpen(!arrangeOpen)
                            setDetailOpen(false)
                        }}
                        title="Auto Arrange Diagram"
                    >
                        <span style={{ fontSize: 16 }}>⊞</span>
                        <span style={{ fontSize: 12, transform: arrangeOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▲</span>
                    </button>

                    {arrangeOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 36,
                                left: 0,
                                zIndex: 30,
                                borderRadius: 8,
                                minWidth: 280,
                                fontFamily: "'Open Sans', sans-serif",
                                fontSize: 13,
                                overflow: 'hidden',
                                boxShadow: t.dropShadow,
                                background: t.dropBg,
                                border: `1px solid ${t.dropBorder}`,
                            }}
                        >
                            <div style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, borderBottom: `1px solid ${t.dropTitleBorder}`, color: t.dropTitle }}>Auto Arrange Diagram</div>
                            {LAYOUT_OPTIONS.map((opt) => (
                                <div
                                    key={opt.value}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '10px 12px',
                                        fontSize: 13,
                                        transition: 'all 0.15s',
                                        color: t.dropItem,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 2,
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = t.dropHover)}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                    onClick={() => {
                                        onAutoArrange(opt.value)
                                        setArrangeOpen(false)
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{opt.icon}</span>
                                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                                    </div>
                                    <div style={{ fontSize: 11, opacity: 0.6, paddingLeft: 28, lineHeight: '1.4' }}>{opt.description}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: t.border, margin: '0 2px' }} />

                {/* Highlight Relationships */}
                <button style={highlight ? selectedBtnStyle : btnStyle} onClick={onToggleHighlight} title={`${highlight ? 'Unhighlight' : 'Highlight'} relationships`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </button>

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: t.border, margin: '0 2px' }} />

                {/* Grid Toggle */}
                <button style={gridEnabling ? selectedBtnStyle : btnStyle} onClick={onToggleGrid} title={`${gridEnabling ? 'Disable' : 'Enable'} grid`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="3" y1="9" x2="21" y2="9" />
                        <line x1="3" y1="15" x2="21" y2="15" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                    </svg>
                </button>

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: t.border, margin: '0 2px' }} />

                {/* Detail Level Dropdown */}
                <div ref={detailRef} style={{ position: 'relative', padding: 0 }}>
                    <button
                        style={{ ...btnStyle, width: 'auto', padding: '0 8px', gap: 4 }}
                        onClick={() => {
                            setDetailOpen(!detailOpen)
                            setArrangeOpen(false)
                        }}
                        title="Show"
                    >
                        <span style={{ fontSize: 14 }}>{DETAIL_ICONS[detailLevel]}</span>
                        <span style={{ fontSize: 12 }}>Show: </span>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{DETAIL_LABELS[detailLevel]}</span>
                        <span style={{ fontSize: 12, transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▲</span>
                    </button>

                    {detailOpen && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: 36,
                                left: 0,
                                zIndex: 30,
                                borderRadius: 8,
                                minWidth: 180,
                                fontFamily: "'Open Sans', sans-serif",
                                fontSize: 13,
                                overflow: 'hidden',
                                boxShadow: t.dropShadow,
                                background: t.dropBg,
                                border: `1px solid ${t.dropBorder}`,
                            }}
                        >
                            {(['All', 'Keys', 'Tables'] as DetailLevel[]).map((level) => (
                                <div
                                    key={level}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '10px 12px',
                                        fontSize: 13,
                                        transition: 'all 0.15s',
                                        color: t.dropItem,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        fontWeight: detailLevel === level ? 600 : 400,
                                        background: detailLevel === level ? (isDark ? '#444' : '#f1f1f1') : 'transparent',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = t.dropHover)}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = detailLevel === level ? (isDark ? '#444' : '#f1f1f1') : 'transparent')}
                                    onClick={() => {
                                        onDetailLevelChanged(level)
                                        setDetailOpen(false)
                                    }}
                                >
                                    <span style={{ fontSize: 14, width: 20, textAlign: 'center' }}>{DETAIL_ICONS[level]}</span>
                                    <span>{DETAIL_LABELS[level]}</span>
                                    {detailLevel === level && <span style={{ marginLeft: 'auto', fontSize: 14 }}>✓</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Separator */}
                <div style={{ width: 1, height: 24, background: t.border, margin: '0 2px' }} />

                {/* Search Tables */}
                <button style={showTableSearch ? selectedBtnStyle : btnStyle} onClick={onToggleTableSearch} title="Search tables — Ctrl+F">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                </button>
            </div>
        </div>
    )
}
