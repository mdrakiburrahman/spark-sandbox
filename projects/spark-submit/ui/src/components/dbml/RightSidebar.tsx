'use client'

import React, { useState, useRef, useEffect, useMemo } from 'react'
import { useThemeContext } from '../ThemeProvider'

interface RightSidebarProps {
    tables: { name: string; note: string | null; fieldCount: number }[]
    visibleTables: Set<string>
    onToggleTable: (tableName: string) => void
    onShowAll: () => void
    onHideAll: () => void
    onFocusTable: (tableName: string) => void
    sidebarOpen: boolean
    onToggleSidebar: () => void
}

const SIDEBAR_WIDTH = 300

export default function RightSidebar({ tables, visibleTables, onToggleTable, onShowAll, onHideAll, onFocusTable, sidebarOpen, onToggleSidebar }: RightSidebarProps) {
    const { isDark } = useThemeContext()
    const [searchQuery, setSearchQuery] = useState('')
    const searchRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (sidebarOpen && searchRef.current) {
            searchRef.current.focus()
        }
    }, [sidebarOpen])

    const filteredTables = useMemo(() => {
        if (!searchQuery.trim()) return tables
        const q = searchQuery.toLowerCase()
        return tables.filter((t) => t.name.toLowerCase().includes(q))
    }, [tables, searchQuery])

    const allVisible = tables.length > 0 && tables.every((t) => visibleTables.has(t.name))
    const noneVisible = tables.length > 0 && tables.every((t) => !visibleTables.has(t.name))

    const t = isDark
        ? {
              bg: '#303137',
              border: '#3a3a3a',
              color: '#e7e9ed',
              inputBg: 'rgba(25,25,30,0.7)',
              inputBorder: '#3a3a3a',
              inputColor: '#e7e9ed',
              placeholder: '#8f8f8f',
              hoverBg: 'rgba(150,150,150,0.1)',
              iconColor: '#aaa',
              clearColor: '#aaa',
              titleBorder: '#3a3a3a',
              shadow: '0 2px 12px rgba(0,0,0,0.15)',
              btnBg: '#444',
              btnBorder: '#555',
              toggleBg: '#303137',
              toggleBorder: '#3a3a3a',
          }
        : {
              bg: '#fff',
              border: '#e5e7eb',
              color: '#171c26',
              inputBg: 'rgba(255,255,255,0.9)',
              inputBorder: '#e5e7eb',
              inputColor: '#171c26',
              placeholder: '#8f8f8f',
              hoverBg: 'rgba(150,150,150,0.1)',
              iconColor: '#999',
              clearColor: '#999',
              titleBorder: '#e5e7eb',
              shadow: '0 2px 12px rgba(0,0,0,0.08)',
              btnBg: '#f5f5f5',
              btnBorder: '#e5e7eb',
              toggleBg: '#fff',
              toggleBorder: '#e5e7eb',
          }

    return (
        <>
            {/* Toggle button */}
            <button
                onClick={onToggleSidebar}
                title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                style={{
                    position: 'absolute',
                    top: 12,
                    right: sidebarOpen ? SIDEBAR_WIDTH + 12 : 12,
                    zIndex: 40,
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: t.toggleBg,
                    border: `1px solid ${t.toggleBorder}`,
                    borderRadius: 8,
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    boxShadow: t.shadow,
                    transition: 'right 0.2s ease',
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 13,
                    color: t.color,
                }}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
                <span>{sidebarOpen ? '▸' : '◂'}</span>
            </button>

            {/* Sidebar panel */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: sidebarOpen ? SIDEBAR_WIDTH : 0,
                    zIndex: 50,
                    boxSizing: 'border-box',
                    border: sidebarOpen ? `1px solid ${t.border}` : 'none',
                    borderRadius: 0,
                    flexDirection: 'column',
                    fontFamily: "'Open Sans', sans-serif",
                    fontSize: 13,
                    display: 'flex',
                    overflow: 'hidden',
                    background: t.bg,
                    color: t.color,
                    boxShadow: sidebarOpen ? t.shadow : 'none',
                    transition: 'width 0.2s ease',
                }}
            >
                {sidebarOpen && (
                    <>
                        {/* Title */}
                        <div
                            style={{
                                padding: '14px 16px 10px',
                                borderBottom: `1px solid ${t.titleBorder}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Diagram Views</h3>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <button
                                    onClick={onShowAll}
                                    disabled={allVisible}
                                    title="Show all tables"
                                    style={{
                                        cursor: allVisible ? 'default' : 'pointer',
                                        background: t.btnBg,
                                        border: `1px solid ${t.btnBorder}`,
                                        borderRadius: 4,
                                        padding: '3px 8px',
                                        fontSize: 11,
                                        color: t.color,
                                        opacity: allVisible ? 0.4 : 1,
                                    }}
                                >
                                    Show All
                                </button>
                                <button
                                    onClick={onHideAll}
                                    disabled={noneVisible}
                                    title="Hide all tables"
                                    style={{
                                        cursor: noneVisible ? 'default' : 'pointer',
                                        background: t.btnBg,
                                        border: `1px solid ${t.btnBorder}`,
                                        borderRadius: 4,
                                        padding: '3px 8px',
                                        fontSize: 11,
                                        color: t.color,
                                        opacity: noneVisible ? 0.4 : 1,
                                    }}
                                >
                                    Hide All
                                </button>
                            </div>
                        </div>

                        {/* Search */}
                        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${t.titleBorder}` }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search table or schema"
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '6px 28px 6px 10px',
                                        borderRadius: 4,
                                        border: `1px solid ${t.inputBorder}`,
                                        background: t.inputBg,
                                        color: t.inputColor,
                                        fontFamily: "'Open Sans', sans-serif",
                                        fontSize: 13,
                                        outline: 'none',
                                    }}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        style={{
                                            position: 'absolute',
                                            right: 6,
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: t.clearColor,
                                            fontSize: 14,
                                            padding: 2,
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Table list */}
                        <div
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '4px 8px',
                                scrollbarWidth: 'thin',
                                scrollbarColor: isDark ? '#555 #303137' : '#ccc #fff',
                            }}
                        >
                            {filteredTables.map((table) => {
                                const isVisible = visibleTables.has(table.name)
                                return (
                                    <div
                                        key={table.name}
                                        style={{
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            borderRadius: 4,
                                            alignItems: 'center',
                                            gap: 8,
                                            width: '100%',
                                            padding: '5px 8px',
                                            fontSize: 13,
                                            display: 'flex',
                                            boxSizing: 'border-box',
                                            opacity: isVisible ? 1 : 0.4,
                                            transition: 'opacity 0.15s, background-color 0.15s',
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = t.hoverBg)}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                                        onClick={() => {
                                            if (isVisible) onFocusTable(table.name)
                                        }}
                                    >
                                        {/* Table icon */}
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#aaa' : '#555'} strokeWidth="2" style={{ flexShrink: 0 }}>
                                            <rect x="3" y="3" width="18" height="18" rx="2" />
                                            <line x1="3" y1="9" x2="21" y2="9" />
                                            <line x1="9" y1="3" x2="9" y2="21" />
                                        </svg>

                                        {/* Table name */}
                                        <span
                                            style={{
                                                flex: 1,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                            title={table.note || table.name}
                                        >
                                            {table.name}
                                        </span>

                                        {/* Field count */}
                                        <span style={{ fontSize: 11, opacity: 0.5, flexShrink: 0 }}>{table.fieldCount}</span>

                                        {/* Visibility toggle */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                onToggleTable(table.name)
                                            }}
                                            style={{
                                                opacity: 0.7,
                                                cursor: 'pointer',
                                                borderRadius: 4,
                                                flexShrink: 0,
                                                alignItems: 'center',
                                                display: 'flex',
                                                background: 'none',
                                                border: 'none',
                                                padding: 2,
                                                color: t.iconColor,
                                            }}
                                            title={isVisible ? 'Hide table' : 'Show table'}
                                        >
                                            {isVisible ? (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            ) : (
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                    <line x1="1" y1="1" x2="23" y2="23" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                )
                            })}

                            {filteredTables.length === 0 && searchQuery && (
                                <div style={{ textAlign: 'center', padding: '20px 0', opacity: 0.5, fontSize: 12 }}>No tables matching &quot;{searchQuery}&quot;</div>
                            )}
                        </div>

                        {/* Footer stats */}
                        <div
                            style={{
                                padding: '8px 16px',
                                borderTop: `1px solid ${t.titleBorder}`,
                                fontSize: 11,
                                opacity: 0.6,
                                display: 'flex',
                                justifyContent: 'space-between',
                            }}
                        >
                            <span>
                                {visibleTables.size} / {tables.length} visible
                            </span>
                            <span>{tables.reduce((sum, tb) => sum + tb.fieldCount, 0)} fields</span>
                        </div>
                    </>
                )}
            </div>
        </>
    )
}
