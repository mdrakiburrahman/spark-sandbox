'use client'

import { useMemo, useRef, useState, useCallback } from 'react'
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDownloadRegular, CopyRegular, SpinnerIos20Regular } from '@fluentui/react-icons'
import { abbreviateType, isComplexType, prettyFormatType } from '../lib/sparkTypeUtils'

interface ResultsGridProps {
    columns: { name: string; type: string; nullable?: boolean }[]
    rows: any[][]
    executionTime: number | null
    rowCount: number
    error: string | null
    isExecuting: boolean
    isDark: boolean
    sql?: string
}

const ROW_HEIGHT = 32

function formatCellValue(value: any): string {
    if (value === null || value === undefined) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
}

function downloadCsv(columns: { name: string }[], rows: any[][]) {
    const escape = (v: any) => {
        const s = v === null || v === undefined ? '' : String(v)
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = columns.map((c) => escape(c.name)).join(',')
    const body = rows.map((row) => row.map(escape).join(',')).join('\n')
    const blob = new Blob([header + '\n' + body], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `query-results-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
}

function buildMarkdown(sqlText: string | undefined, columns: { name: string }[], rows: any[][]): string {
    const parts: string[] = []
    if (sqlText) {
        parts.push('```sql', sqlText, '```', '')
    }
    const headers = columns.map((c) => c.name)
    const divider = headers.map((h) => '-'.repeat(Math.max(h.length, 4)))
    const dataRows = rows.map((row) => row.map((v) => (v === null || v === undefined ? 'NULL' : String(v))))
    parts.push('```text', '| ' + headers.join(' | ') + ' |', '| ' + divider.join(' | ') + ' |', ...dataRows.map((r) => '| ' + r.join(' | ') + ' |'), '```')
    return parts.join('\n')
}

// ============================================================================
// JSON Tree Viewer — recursive expand/collapse for complex cell values
// ============================================================================

function JsonTreeNode({ label, value, isDark, depth }: { label?: string; value: any; isDark: boolean; depth: number }) {
    const [expanded, setExpanded] = useState(depth < 1)

    const mutedText = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'
    const keyColor = isDark ? '#93c5fd' : '#2563eb'
    const stringColor = isDark ? '#86efac' : '#16a34a'
    const numberColor = isDark ? '#fbbf24' : '#d97706'
    const nullColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'

    if (value === null || value === undefined) {
        return (
            <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
                {label && <span style={{ color: keyColor }}>{label}: </span>}
                <span style={{ fontStyle: 'italic', color: nullColor }}>null</span>
            </div>
        )
    }

    if (typeof value !== 'object') {
        const color = typeof value === 'number' ? numberColor : typeof value === 'string' ? stringColor : undefined
        const display = typeof value === 'string' ? `"${value}"` : String(value)
        return (
            <div style={{ paddingLeft: depth > 0 ? 16 : 0, whiteSpace: 'nowrap' }}>
                {label && <span style={{ color: keyColor }}>{label}: </span>}
                <span style={{ color }}>{display}</span>
            </div>
        )
    }

    const isArray = Array.isArray(value)
    const entries = isArray ? value.map((v: any, i: number) => [String(i), v] as const) : Object.entries(value)
    const bracket = isArray ? ['[', ']'] : ['{', '}']
    const summary = isArray ? `${value.length} item${value.length !== 1 ? 's' : ''}` : `${Object.keys(value).length} field${Object.keys(value).length !== 1 ? 's' : ''}`

    return (
        <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
            <div onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ display: 'inline-block', width: 12, textAlign: 'center', fontSize: 10, color: mutedText }}>{expanded ? '▼' : '▶'}</span>
                {label && <span style={{ color: keyColor }}>{label}: </span>}
                {!expanded && (
                    <span style={{ color: mutedText }}>
                        {bracket[0]} {summary} {bracket[1]}
                    </span>
                )}
                {expanded && <span style={{ color: mutedText }}>{bracket[0]}</span>}
            </div>
            {expanded && (
                <>
                    {entries.map(([k, v]) => (
                        <JsonTreeNode key={k} label={isArray ? undefined : k} value={v} isDark={isDark} depth={depth + 1} />
                    ))}
                    <div style={{ paddingLeft: 16 }}>
                        <span style={{ color: mutedText }}>{bracket[1]}</span>
                    </div>
                </>
            )}
        </div>
    )
}

function ComplexValueModal({ value, isDark, onClose }: { value: any; isDark: boolean; onClose: () => void }) {
    const bg = isDark ? '#1a1a1a' : '#ffffff'
    const border = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'
    const [copied, setCopied] = useState(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(JSON.stringify(value, null, 2)).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
    }

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.5)',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    padding: '12px 16px',
                    maxWidth: '80vw',
                    maxHeight: '70vh',
                    overflow: 'auto',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 12,
                    lineHeight: 1.6,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    minWidth: 300,
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                    <button
                        onClick={handleCopy}
                        style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            background: 'transparent',
                            border: `1px solid ${border}`,
                            borderRadius: 4,
                            color: isDark ? '#e5e5e5' : '#333',
                            fontFamily: 'inherit',
                        }}
                    >
                        {copied ? '✓ Copied' : '📋 Copy JSON'}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '3px 10px',
                            fontSize: 11,
                            cursor: 'pointer',
                            background: 'transparent',
                            border: `1px solid ${border}`,
                            borderRadius: 4,
                            color: isDark ? '#e5e5e5' : '#333',
                            fontFamily: 'inherit',
                        }}
                    >
                        ✕ Close
                    </button>
                </div>
                <JsonTreeNode value={value} isDark={isDark} depth={0} />
            </div>
        </div>
    )
}

/** Inline cell preview for complex (object/array) values. */
function ComplexCellValue({ value, isDark }: { value: any; isDark: boolean }) {
    const [showModal, setShowModal] = useState(false)
    const isArray = Array.isArray(value)
    const mutedText = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'
    const summary = isArray ? `[${value.length} item${value.length !== 1 ? 's' : ''}]` : `{${Object.keys(value).length} field${Object.keys(value).length !== 1 ? 's' : ''}}`

    return (
        <>
            <span
                onClick={(e) => {
                    e.stopPropagation()
                    setShowModal(true)
                }}
                title="Click to expand"
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    cursor: 'pointer',
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    fontSize: 12,
                }}
            >
                <span style={{ fontSize: 9, color: '#f97316' }}>▶</span>
                <span style={{ color: mutedText }}>{summary}</span>
            </span>
            {showModal && <ComplexValueModal value={value} isDark={isDark} onClose={() => setShowModal(false)} />}
        </>
    )
}

export default function ResultsGrid({ columns, rows, executionTime, rowCount, error, isExecuting, isDark, sql: sqlText }: ResultsGridProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null)
    const [copiedCell, setCopiedCell] = useState<string | null>(null)
    const [showToast, setShowToast] = useState(false)

    const tableColumns = useMemo<ColumnDef<any[], any>[]>(() => {
        const rowNumCol: ColumnDef<any[], any> = {
            id: '__row_num',
            header: '#',
            size: 56,
            cell: ({ row }) => row.index + 1,
        }
        const dataCols: ColumnDef<any[], any>[] = columns.map((col, idx) => ({
            id: `col_${idx}`,
            accessorFn: (row: any[]) => row[idx],
            header: () => (
                <span>
                    {col.name}{' '}
                    <span
                        style={{
                            fontSize: '10px',
                            opacity: 0.5,
                            fontWeight: 400,
                            cursor: isComplexType(col.type) ? 'help' : undefined,
                        }}
                        title={isComplexType(col.type) ? prettyFormatType(col.type) : undefined}
                    >
                        ({abbreviateType(col.type)})
                    </span>
                </span>
            ),
            cell: ({ getValue }) => {
                const value = getValue()
                if (value === null || value === undefined) {
                    return (
                        <span
                            style={{
                                fontStyle: 'italic',
                                color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)',
                            }}
                        >
                            NULL
                        </span>
                    )
                }
                if (typeof value === 'object') {
                    return <ComplexCellValue value={value} isDark={isDark} />
                }
                return formatCellValue(value)
            },
        }))
        return [rowNumCol, ...dataCols]
    }, [columns, isDark])

    const table = useReactTable({
        data: rows,
        columns: tableColumns,
        getCoreRowModel: getCoreRowModel(),
    })

    const { getRowModel } = table
    const tableRows = getRowModel().rows

    const virtualizer = useVirtualizer({
        count: tableRows.length,
        getScrollElement: () => scrollContainerRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20,
    })

    const handleCellClick = useCallback((rowIdx: number, colIdx: number, value: any) => {
        const text = value === null || value === undefined ? 'NULL' : formatCellValue(value)
        navigator.clipboard.writeText(text).catch(() => {})
        const key = `${rowIdx}-${colIdx}`
        setCopiedCell(key)
        setTimeout(() => setCopiedCell(null), 800)
    }, [])

    const handleCopyMarkdown = useCallback(() => {
        const md = buildMarkdown(sqlText, columns, rows)
        navigator.clipboard.writeText(md).catch(() => {})
        setShowToast(true)
        setTimeout(() => setShowToast(false), 1500)
    }, [sqlText, columns, rows])

    const handleCsvExport = useCallback(() => {
        downloadCsv(columns, rows)
    }, [columns, rows])

    // -- Theme helpers --
    const bg = isDark ? '#0a0a0a' : '#ffffff'
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const textColor = isDark ? '#e5e5e5' : '#1a1a1a'
    const mutedText = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'
    const headerBg = isDark ? '#111111' : '#f5f5f5'
    const rowEvenBg = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'
    const hoverBg = isDark ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.06)'

    // -- Loading state --
    if (isExecuting) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: mutedText,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '13px',
                    gap: '8px',
                    background: bg,
                }}
            >
                <SpinnerIos20Regular
                    style={{
                        animation: 'spin 1s linear infinite',
                        color: '#f97316',
                    }}
                />
                Executing query…
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        )
    }

    // -- Error state --
    if (error) {
        return (
            <div
                style={{
                    padding: '16px 20px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '13px',
                    color: '#ef4444',
                    background: isDark ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.06)',
                    border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: '6px',
                    margin: '8px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.5,
                }}
            >
                {error}
            </div>
        )
    }

    // -- Empty state --
    if (columns.length === 0) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: mutedText,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '13px',
                    background: bg,
                }}
            >
                Run a query to see results
            </div>
        )
    }

    // -- Results table --
    const virtualRows = virtualizer.getVirtualItems()
    const totalHeight = virtualizer.getTotalSize()

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: bg,
                color: textColor,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '13px',
                position: 'relative',
            }}
        >
            {/* Toast */}
            {showToast && (
                <div
                    style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        zIndex: 100,
                        padding: '6px 14px',
                        borderRadius: '6px',
                        background: isDark ? 'rgba(249,115,22,0.9)' : '#f97316',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 500,
                        pointerEvents: 'none',
                        animation: 'fadeToast 1.5s ease forwards',
                    }}
                >
                    Copied to clipboard!
                    <style>{`@keyframes fadeToast { 0%,70% { opacity: 1 } 100% { opacity: 0 } }`}</style>
                </div>
            )}

            {/* Toolbar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    padding: '4px 8px',
                    gap: '4px',
                    borderBottom: `1px solid ${borderColor}`,
                    flexShrink: 0,
                }}
            >
                <button
                    onClick={handleCopyMarkdown}
                    title="Copy as Markdown"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        color: mutedText,
                        background: 'transparent',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#f97316'
                        e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = mutedText
                        e.currentTarget.style.borderColor = borderColor
                    }}
                >
                    <CopyRegular style={{ fontSize: '12px' }} />
                    Markdown
                </button>
                <button
                    onClick={handleCsvExport}
                    title="Export as CSV"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        color: mutedText,
                        background: 'transparent',
                        border: `1px solid ${borderColor}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#f97316'
                        e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)'
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.color = mutedText
                        e.currentTarget.style.borderColor = borderColor
                    }}
                >
                    <ArrowDownloadRegular style={{ fontSize: '12px' }} />
                    CSV
                </button>
            </div>

            {/* Scrollable table container */}
            <div
                ref={scrollContainerRef}
                style={{
                    flex: 1,
                    overflow: 'auto',
                    position: 'relative',
                }}
            >
                <table
                    style={{
                        width: '100%',
                        minWidth: 'max-content',
                        borderCollapse: 'collapse',
                        tableLayout: 'auto',
                    }}
                >
                    <thead
                        style={{
                            position: 'sticky',
                            top: 0,
                            zIndex: 10,
                        }}
                    >
                        {table.getHeaderGroups().map((headerGroup) => (
                            <tr key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <th
                                        key={header.id}
                                        style={{
                                            height: `${ROW_HEIGHT}px`,
                                            padding: '0 10px',
                                            textAlign: 'left',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            whiteSpace: 'nowrap',
                                            background: headerBg,
                                            borderBottom: `1px solid ${borderColor}`,
                                            borderRight: `1px solid ${borderColor}`,
                                            position: 'sticky',
                                            top: 0,
                                            ...(header.id === '__row_num'
                                                ? {
                                                      width: '56px',
                                                      minWidth: '56px',
                                                      color: mutedText,
                                                      textAlign: 'right' as const,
                                                  }
                                                : {}),
                                        }}
                                    >
                                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                    </th>
                                ))}
                            </tr>
                        ))}
                    </thead>
                    <tbody
                        style={{
                            height: `${totalHeight}px`,
                            position: 'relative',
                        }}
                    >
                        {/* Spacer before visible rows */}
                        {virtualRows.length > 0 && (
                            <tr style={{ height: `${virtualRows[0].start}px` }}>
                                <td colSpan={tableColumns.length} style={{ padding: 0, border: 'none' }} />
                            </tr>
                        )}

                        {virtualRows.map((virtualRow) => {
                            const row = tableRows[virtualRow.index]
                            const isEven = virtualRow.index % 2 === 0

                            return (
                                <tr
                                    key={row.id}
                                    data-index={virtualRow.index}
                                    style={{
                                        height: `${ROW_HEIGHT}px`,
                                        background: isEven ? 'transparent' : rowEvenBg,
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = hoverBg
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = isEven ? 'transparent' : rowEvenBg
                                    }}
                                >
                                    {row.getVisibleCells().map((cell, cellIdx) => {
                                        const cellKey = `${virtualRow.index}-${cellIdx}`
                                        const isRowNum = cell.column.id === '__row_num'
                                        const rawValue = isRowNum ? virtualRow.index + 1 : rows[virtualRow.index]?.[cellIdx - 1]

                                        return (
                                            <td
                                                key={cell.id}
                                                onClick={() => {
                                                    if (!isRowNum) {
                                                        handleCellClick(virtualRow.index, cellIdx, rawValue)
                                                    }
                                                }}
                                                style={{
                                                    height: `${ROW_HEIGHT}px`,
                                                    padding: '0 10px',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    maxWidth: '400px',
                                                    borderRight: `1px solid ${borderColor}`,
                                                    cursor: isRowNum ? 'default' : 'pointer',
                                                    position: 'relative',
                                                    ...(isRowNum
                                                        ? {
                                                              width: '56px',
                                                              minWidth: '56px',
                                                              textAlign: 'right' as const,
                                                              color: mutedText,
                                                              fontSize: '11px',
                                                              userSelect: 'none',
                                                          }
                                                        : {}),
                                                    ...(copiedCell === cellKey
                                                        ? {
                                                              background: isDark ? 'rgba(249,115,22,0.15)' : 'rgba(249,115,22,0.1)',
                                                          }
                                                        : {}),
                                                }}
                                            >
                                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                {copiedCell === cellKey && (
                                                    <span
                                                        style={{
                                                            position: 'absolute',
                                                            top: '50%',
                                                            right: '4px',
                                                            transform: 'translateY(-50%)',
                                                            fontSize: '9px',
                                                            color: '#f97316',
                                                            fontWeight: 600,
                                                        }}
                                                    >
                                                        Copied
                                                    </span>
                                                )}
                                            </td>
                                        )
                                    })}
                                </tr>
                            )
                        })}

                        {/* Spacer after visible rows */}
                        {virtualRows.length > 0 && (
                            <tr
                                style={{
                                    height: `${totalHeight - virtualRows[virtualRows.length - 1].end}px`,
                                }}
                            >
                                <td colSpan={tableColumns.length} style={{ padding: 0, border: 'none' }} />
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Status bar */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 12px',
                    fontSize: '11px',
                    color: mutedText,
                    borderTop: `1px solid ${borderColor}`,
                    background: headerBg,
                    flexShrink: 0,
                    userSelect: 'none',
                }}
            >
                <span>
                    {rowCount.toLocaleString()} row{rowCount !== 1 ? 's' : ''}
                </span>
                {executionTime !== null && <span>{executionTime < 1000 ? `${executionTime}ms` : `${(executionTime / 1000).toFixed(2)}s`}</span>}
            </div>
        </div>
    )
}
