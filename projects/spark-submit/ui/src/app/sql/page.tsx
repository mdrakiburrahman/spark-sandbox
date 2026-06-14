'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { format as formatSql } from 'sql-formatter'
import { useThemeContext } from '@/components/ThemeProvider'
import { SqlTabProvider, useSqlTabs } from './components/SqlTabContext'
import styles from './styles/sql.module.css'
import type { EditorView } from '@codemirror/view'

const SqlEditor = dynamic(() => import('./components/SqlEditor'), { ssr: false })
const SchemaBrowser = dynamic(() => import('./components/SchemaBrowser'), { ssr: false })
const QueryToolbar = dynamic(() => import('./components/QueryToolbar'), { ssr: false })
const ResultsGrid = dynamic(() => import('./components/ResultsGrid'), { ssr: false })

function SqlPageContent() {
    const { isDark } = useThemeContext()
    const { tabs, activeTab, activeTabId, dispatch, addTab, closeTab, setActiveTab, renameTab, updateQuery } = useSqlTabs()

    const [renamingTabId, setRenamingTabId] = useState<string | null>(null)
    const [renameValue, setRenameValue] = useState('')
    const [schema, setSchema] = useState<Record<string, string[]> | undefined>(undefined)
    const [queryProgress, setQueryProgress] = useState<string | null>(null)
    const [executedSql, setExecutedSql] = useState<string | null>(null)
    const renameInputRef = useRef<HTMLInputElement>(null)
    const editorViewRef = useRef<EditorView | null>(null)

    // ─── Sidebar resize ───────────────────────────────────
    const SIDEBAR_STORAGE_KEY = 'spark-sql-sidebar-width'
    const DEFAULT_SIDEBAR_WIDTH = 260
    const MIN_SIDEBAR_WIDTH = 180
    const MAX_SIDEBAR_WIDTH = 500

    const [sidebarWidth, setSidebarWidth] = useState(() => {
        if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH
        const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY)
        if (stored) {
            const num = parseInt(stored, 10)
            if (!isNaN(num) && num >= MIN_SIDEBAR_WIDTH && num <= MAX_SIDEBAR_WIDTH) return num
        }
        return DEFAULT_SIDEBAR_WIDTH
    })
    const [isResizingSidebar, setIsResizingSidebar] = useState(false)
    const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

    const handleSidebarResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault()
            sidebarDragRef.current = { startX: e.clientX, startWidth: sidebarWidth }
            setIsResizingSidebar(true)
        },
        [sidebarWidth]
    )

    useEffect(() => {
        if (!isResizingSidebar) return

        const handleMouseMove = (e: MouseEvent) => {
            if (!sidebarDragRef.current) return
            const delta = e.clientX - sidebarDragRef.current.startX
            const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, sidebarDragRef.current.startWidth + delta))
            setSidebarWidth(newWidth)
        }

        const handleMouseUp = () => {
            setIsResizingSidebar(false)
            sidebarDragRef.current = null
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)
        // Prevent text selection while dragging
        document.body.style.userSelect = 'none'
        document.body.style.cursor = 'col-resize'

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
            document.body.style.userSelect = ''
            document.body.style.cursor = ''
        }
    }, [isResizingSidebar])

    // Persist sidebar width
    useEffect(() => {
        try {
            localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth))
        } catch {
            /* ignore */
        }
    }, [sidebarWidth])

    useEffect(() => {
        if (renamingTabId && renameInputRef.current) {
            renameInputRef.current.focus()
            renameInputRef.current.select()
        }
    }, [renamingTabId])

    const handleExecute = useCallback(
        async (sqlText: string) => {
            const tab = activeTab
            dispatch({ type: 'CLEAR_RESULTS', id: tab.id })
            dispatch({ type: 'SET_EXECUTING', id: tab.id, isExecuting: true })
            setQueryProgress(null)
            setExecutedSql(sqlText)

            const startTime = performance.now()
            try {
                const res = await fetch('/api/sql/query', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'text/event-stream',
                    },
                    body: JSON.stringify({ sql: sqlText }),
                })

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}))
                    throw new Error(data.error || `HTTP ${res.status}`)
                }

                const contentType = res.headers.get('content-type') || ''

                if (contentType.includes('text/event-stream') && res.body) {
                    // SSE streaming path
                    const reader = res.body.getReader()
                    const decoder = new TextDecoder()
                    let buffer = ''

                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) break

                        buffer += decoder.decode(value, { stream: true })
                        const lines = buffer.split('\n')
                        buffer = lines.pop() || ''

                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue
                            try {
                                const event = JSON.parse(line.slice(6))
                                if (event.type === 'progress') {
                                    setQueryProgress(event.data?.message || event.data || 'Working…')
                                } else if (event.type === 'complete') {
                                    const result = event.data
                                    dispatch({
                                        type: 'SET_RESULTS',
                                        id: tab.id,
                                        results: {
                                            ...result,
                                            executionTime: performance.now() - startTime,
                                        },
                                    })
                                    setQueryProgress(null)
                                } else if (event.type === 'error') {
                                    const msg = event.data?.message || event.data?.error || (typeof event.data === 'string' ? event.data : null) || 'Query failed'
                                    throw new Error(msg)
                                }
                            } catch (parseErr: any) {
                                if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
                            }
                        }
                    }
                } else {
                    // Fallback: regular JSON response
                    const data = await res.json()
                    dispatch({
                        type: 'SET_RESULTS',
                        id: tab.id,
                        results: {
                            ...data,
                            executionTime: performance.now() - startTime,
                        },
                    })
                }
            } catch (err: any) {
                dispatch({ type: 'SET_ERROR', id: tab.id, error: err.message })
                setQueryProgress(null)
            } finally {
                dispatch({ type: 'SET_EXECUTING', id: tab.id, isExecuting: false })
            }
        },
        [activeTab, dispatch]
    )

    const handleCancel = useCallback(async () => {
        const tab = activeTab
        if (!tab.results?.statementId) return
        try {
            await fetch('/api/sql/query', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ statementId: tab.results.statementId }),
            })
        } catch (err) {
            console.error('Failed to cancel:', err)
        }
    }, [activeTab])

    const handleEditorExecute = useCallback(
        (sql: string) => {
            handleExecute(sql)
        },
        [handleExecute]
    )

    const handleRunClick = useCallback(() => {
        const view = editorViewRef.current
        if (view) {
            const { from, to } = view.state.selection.main
            if (from !== to) {
                handleExecute(view.state.sliceDoc(from, to))
                return
            }
        }
        handleExecute(activeTab.query)
    }, [handleExecute, activeTab])

    const handleInsertSql = useCallback(
        (sql: string) => {
            const current = activeTab.query
            const newQuery = current ? `${current}\n${sql}` : sql
            updateQuery(activeTab.id, newQuery)
        },
        [activeTab, updateQuery]
    )

    const handleSchemaLoaded = useCallback((loadedSchema: Record<string, string[]>) => {
        setSchema(loadedSchema)
    }, [])

    const handleFormat = useCallback(() => {
        try {
            const formatted = formatSql(activeTab.query, { language: 'spark', tabWidth: 2 })
            updateQuery(activeTab.id, formatted)
        } catch {
            // If formatting fails (e.g. invalid SQL), leave as-is
        }
    }, [activeTab, updateQuery])

    const handleTabDoubleClick = useCallback((tabId: string, title: string) => {
        setRenamingTabId(tabId)
        setRenameValue(title)
    }, [])

    const commitRename = useCallback(() => {
        if (renamingTabId && renameValue.trim()) {
            renameTab(renamingTabId, renameValue.trim())
        }
        setRenamingTabId(null)
    }, [renamingTabId, renameValue, renameTab])

    const handleRenameKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                commitRename()
            } else if (e.key === 'Escape') {
                setRenamingTabId(null)
            }
        },
        [commitRename]
    )

    const results = activeTab.results
    const hasResults = results && results.columns && results.rows

    return (
        <div className={styles.sqlPage}>
            {/* Sidebar — Schema Browser */}
            <div className={styles.sidebar} style={{ width: sidebarWidth }}>
                <SchemaBrowser onInsertSql={handleInsertSql} onSchemaLoaded={handleSchemaLoaded} isDark={isDark} />
            </div>

            {/* Sidebar resize handle */}
            <div className={`${styles.sidebarResizeHandle} ${isResizingSidebar ? styles.sidebarResizeHandleActive : ''}`} onMouseDown={handleSidebarResizeStart} />

            {/* Main content */}
            <div className={styles.mainContent}>
                {/* Tab bar */}
                <div className={styles.tabBar}>
                    <div className={styles.tabBarInner}>
                        {tabs.map((tab) => (
                            <div
                                key={tab.id}
                                className={`${styles.tab} ${tab.id === activeTabId ? styles.tabActive : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                onDoubleClick={() => handleTabDoubleClick(tab.id, tab.title)}
                            >
                                {renamingTabId === tab.id ? (
                                    <input
                                        ref={renameInputRef}
                                        className={styles.tabRenameInput}
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={commitRename}
                                        onKeyDown={handleRenameKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : (
                                    <span>{tab.title}</span>
                                )}
                                {tabs.length > 1 && (
                                    <button
                                        className={styles.tabClose}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            closeTab(tab.id)
                                        }}
                                        title="Close tab"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        <button className={styles.tabAdd} onClick={addTab} title="New query tab">
                            +
                        </button>
                    </div>
                </div>

                {/* Editor */}
                <div className={styles.editorContainer}>
                    <SqlEditor
                        value={activeTab.query}
                        onChange={(val: string) => updateQuery(activeTab.id, val)}
                        onExecute={handleEditorExecute}
                        schema={schema}
                        isDark={isDark}
                        editorViewRef={editorViewRef}
                    />
                </div>

                {/* Toolbar */}
                <div className={styles.toolbar}>
                    <QueryToolbar
                        onExecute={handleRunClick}
                        onCancel={handleCancel}
                        onFormat={handleFormat}
                        isExecuting={activeTab.isExecuting}
                        executionTime={activeTab.results?.executionTime ?? null}
                        rowCount={activeTab.results?.rowCount ?? null}
                        isDark={isDark}
                    />
                </div>

                {/* Resize handle */}
                <div className={styles.resizeHandle} />

                {/* Results area */}
                <div className={styles.resultsContainer}>
                    {activeTab.error && <div className={styles.errorBanner}>{activeTab.error}</div>}

                    {activeTab.isExecuting && queryProgress ? (
                        <div className={styles.emptyResults} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 13, opacity: 0.7 }}>{queryProgress}</span>
                        </div>
                    ) : hasResults ? (
                        <ResultsGrid
                            columns={results.columns}
                            rows={results.rows}
                            executionTime={results.executionTime ?? null}
                            rowCount={results.rowCount}
                            error={activeTab.error || null}
                            isExecuting={activeTab.isExecuting}
                            isDark={isDark}
                            sql={executedSql ?? activeTab.query}
                        />
                    ) : !activeTab.error ? (
                        <div className={styles.emptyResults}>Run a query to see results</div>
                    ) : null}
                </div>

                {/* Status bar */}
                <div className={styles.statusBar}>
                    <span>{activeTab.isExecuting ? queryProgress || 'Executing…' : hasResults ? `${results.rowCount} row${results.rowCount === 1 ? '' : 's'}` : 'Ready'}</span>
                    <span>
                        {hasResults && results.executionTime != null ? (results.executionTime < 1000 ? `${Math.round(results.executionTime)}ms` : `${(results.executionTime / 1000).toFixed(2)}s`) : ''}
                    </span>
                </div>
            </div>
        </div>
    )
}

export default function SqlPage() {
    return (
        <SqlTabProvider>
            <SqlPageContent />
        </SqlTabProvider>
    )
}
