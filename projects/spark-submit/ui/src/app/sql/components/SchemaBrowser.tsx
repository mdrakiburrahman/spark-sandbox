'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Tree, TreeItem, TreeItemLayout, Button, Spinner, Menu, MenuTrigger, MenuPopover, MenuList, MenuItem } from '@fluentui/react-components'
import { FolderRegular, TableRegular, ArrowSyncRegular, MoreHorizontalRegular, DismissRegular } from '@fluentui/react-icons'
import { abbreviateType, isComplexType, prettyFormatType } from '../lib/sparkTypeUtils'
import { streamSse } from '../lib/streamSse'
import { buildSchemaMap, mergeTable, type MetastoreDatabase, type MetastoreTable } from '../lib/schemaMerge'

interface MetastoreResponse {
    databases: MetastoreDatabase[]
}

interface SchemaBrowserProps {
    onInsertSql: (sql: string) => void
    onSchemaLoaded: (schema: Record<string, string[]>) => void
    isDark: boolean
}

/** Server SSE envelope shape: every frame is `{ type, data, timestamp }`. */
interface ServerSseFrame {
    type: 'progress' | 'complete' | 'error'
    data: any
}

export default function SchemaBrowser({ onInsertSql, onSchemaLoaded, isDark }: SchemaBrowserProps) {
    const [databases, setDatabases] = useState<MetastoreDatabase[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [progress, setProgress] = useState<string>('Connecting…')

    const [refreshingTable, setRefreshingTable] = useState<Set<string>>(() => new Set())
    const [tableErrors, setTableErrors] = useState<Record<string, string>>({})

    // ---- Refs ------------------------------------------------------------
    //
    // `eventSourceRef` is for the top-level "Refresh database and table names"
    // button — it uses the original EventSource-based flow and fetches only
    // database and table names (no column schemas).
    //
    // The per-table refresh action uses AbortController + a generation
    // counter to stay race-free on rapid clicks, since its stale-handler
    // exposure is different (and it needs explicit cancel-on-supersede).

    const eventSourceRef = useRef<EventSource | null>(null)
    const mountedRef = useRef(true)
    const tableAbortsRef = useRef<Map<string, AbortController>>(new Map())
    const tableGenRef = useRef<Map<string, number>>(new Map())

    // ---- Mutable Set helpers (immutable for React) -------------------------

    const addToSet = useCallback((setter: (updater: (prev: Set<string>) => Set<string>) => void, key: string) => {
        setter((prev) => {
            const n = new Set(prev)
            n.add(key)
            return n
        })
    }, [])

    const removeFromSet = useCallback((setter: (updater: (prev: Set<string>) => Set<string>) => void, key: string) => {
        setter((prev) => {
            if (!prev.has(key)) return prev
            const n = new Set(prev)
            n.delete(key)
            return n
        })
    }, [])

    // ---- Names refresh (header button + initial mount) ---------------------
    //
    // Fetches database + table names only — no column schemas. This is the
    // fast page-load path (sub-second even on metastores with thousands of
    // tables). Column schemas are loaded on-demand via the per-table refresh
    // action below.

    const fetchSchema = useCallback(() => {
        // Close any in-flight EventSource before starting a new one
        if (eventSourceRef.current) {
            eventSourceRef.current.close()
            eventSourceRef.current = null
        }

        setLoading(true)
        setError(null)
        setProgress('Connecting…')
        setDatabases([])

        const eventSource = new EventSource(`/api/sql/metastore?t=${Date.now()}`)
        eventSourceRef.current = eventSource

        eventSource.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data) as {
                    type: string
                    data: { message?: string; databases?: MetastoreDatabase[] } & MetastoreResponse
                }

                if (payload.type === 'progress') {
                    setProgress(payload.data.message || '')
                } else if (payload.type === 'complete') {
                    const schema = payload.data as MetastoreResponse
                    setDatabases(schema.databases)
                    onSchemaLoaded(buildSchemaMap(schema.databases))
                    setLoading(false)
                    eventSource.close()
                } else if (payload.type === 'error') {
                    setError(payload.data.message || 'Metastore discovery failed')
                    setLoading(false)
                    eventSource.close()
                }
            } catch {
                // ignore parse errors
            }
        }

        eventSource.onerror = () => {
            eventSource.close()
            // Only set error if we haven't already received data
            setLoading((prev) => {
                if (prev) {
                    setError('Lost connection to server. Is the API server running?')
                }
                return false
            })
        }

        return () => {
            eventSource.close()
            if (eventSourceRef.current === eventSource) {
                eventSourceRef.current = null
            }
        }
    }, [onSchemaLoaded])

    // ---- Per-table refresh -------------------------------------------------

    const refreshTable = useCallback(
        async (dbName: string, tableName: string) => {
            const key = `${dbName}.${tableName}`
            tableAbortsRef.current.get(key)?.abort()
            const controller = new AbortController()
            tableAbortsRef.current.set(key, controller)
            const tGen = (tableGenRef.current.get(key) ?? 0) + 1
            tableGenRef.current.set(key, tGen)

            addToSet(setRefreshingTable, key)
            setTableErrors((prev) => {
                if (!(key in prev)) return prev
                const next = { ...prev }
                delete next[key]
                return next
            })

            let serverError: string | null = null

            try {
                await streamSse<ServerSseFrame>(`/api/sql/metastore/databases/${encodeURIComponent(dbName)}/tables/${encodeURIComponent(tableName)}?t=${Date.now()}`, {
                    signal: controller.signal,
                    onEvent: (evt) => {
                        if (!mountedRef.current || tableGenRef.current.get(key) !== tGen) return
                        const frame = evt.data
                        if (!frame || typeof frame.type !== 'string') return
                        if (frame.type === 'complete') {
                            const newTable = frame.data as MetastoreTable
                            let merged: MetastoreDatabase[] | null = null
                            setDatabases((prev) => {
                                merged = mergeTable(prev, dbName, newTable)
                                return merged
                            })
                            if (merged) onSchemaLoaded(buildSchemaMap(merged))
                        } else if (frame.type === 'error') {
                            serverError = frame.data?.message ?? `Failed to refresh ${dbName}.${tableName}`
                        }
                    },
                })
            } catch (err) {
                if (mountedRef.current && tableGenRef.current.get(key) === tGen) {
                    setTableErrors((prev) => ({ ...prev, [key]: err instanceof Error ? err.message : 'Refresh failed' }))
                }
            } finally {
                if (mountedRef.current && tableGenRef.current.get(key) === tGen) {
                    removeFromSet(setRefreshingTable, key)
                    if (serverError) {
                        setTableErrors((prev) => ({ ...prev, [key]: serverError as string }))
                    }
                }
                if (tableAbortsRef.current.get(key) === controller) {
                    tableAbortsRef.current.delete(key)
                }
            }
        },
        [addToSet, removeFromSet, onSchemaLoaded]
    )

    // ---- Mount / unmount ---------------------------------------------------

    useEffect(() => {
        mountedRef.current = true
        const cleanup = fetchSchema()
        return () => {
            mountedRef.current = false
            cleanup?.()
            for (const c of tableAbortsRef.current.values()) c.abort()
            tableAbortsRef.current.clear()
        }
    }, [fetchSchema])

    // ---- Render ------------------------------------------------------------

    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
    const mutedColor = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'
    const hoverBg = isDark ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.06)'

    if (loading) {
        return (
            <div
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    padding: 16,
                }}
            >
                <Spinner size="small" />
                <span style={{ fontSize: 12, color: mutedColor, textAlign: 'center', lineHeight: 1.4 }}>{progress}</span>
            </div>
        )
    }

    if (error) {
        return (
            <div
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 12,
                    padding: 16,
                }}
            >
                <span style={{ color: '#ef4444', fontSize: 13, textAlign: 'center' }}>{error}</span>
                <Button size="small" appearance="primary" onClick={fetchSchema}>
                    Retry
                </Button>
            </div>
        )
    }

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 12,
                    borderBottom: `1px solid ${borderColor}`,
                }}
            >
                <span style={{ fontWeight: 600, fontSize: 14 }}>🗄️ Metastore</span>
                <Button
                    size="small"
                    appearance="subtle"
                    icon={<ArrowSyncRegular />}
                    onClick={fetchSchema}
                    title={
                        'Refresh database and table names\n\n' +
                        'Schema refresh for all databases/tables is an extremely slow operation. ' +
                        'For schema, please refresh at per table level based on your own requirements.'
                    }
                />
            </div>

            {/* Tree */}
            {databases.length === 0 ? (
                <div
                    style={{
                        padding: 16,
                        fontSize: 13,
                        color: mutedColor,
                        textAlign: 'center',
                    }}
                >
                    No databases found
                </div>
            ) : (
                <Tree aria-label="Metastore schema">
                    {databases.map((db) => {
                        return (
                            <TreeItem key={db.name} itemType="branch">
                                <TreeItemLayout iconBefore={<FolderRegular />}>{db.name}</TreeItemLayout>
                                <Tree>
                                    {db.tables.map((table) => {
                                        const tKey = `${db.name}.${table.name}`
                                        const tBusy = refreshingTable.has(tKey)
                                        const tErr = tableErrors[tKey]
                                        return (
                                            <TreeItem key={tKey} itemType="branch">
                                                <TreeItemLayout
                                                    iconBefore={<TableRegular />}
                                                    style={{ height: 28 }}
                                                    actions={
                                                        <Menu>
                                                            <MenuTrigger disableButtonEnhancement>
                                                                <Button
                                                                    appearance="subtle"
                                                                    size="small"
                                                                    icon={<MoreHorizontalRegular />}
                                                                    style={{ minWidth: 'unset', padding: '0 4px' }}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    title={`Actions for ${table.name}`}
                                                                />
                                                            </MenuTrigger>
                                                            <MenuPopover>
                                                                <MenuList>
                                                                    <MenuItem onClick={() => onInsertSql(`SELECT * FROM ${db.name}.${table.name} LIMIT 100`)}>SELECT TOP 100</MenuItem>
                                                                    <MenuItem icon={<ArrowSyncRegular />} disabled={tBusy} onClick={() => void refreshTable(db.name, table.name)}>
                                                                        {tBusy ? 'Refreshing schema…' : 'Refresh schema'}
                                                                    </MenuItem>
                                                                </MenuList>
                                                            </MenuPopover>
                                                        </Menu>
                                                    }
                                                >
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                        {table.name}
                                                        {tBusy && <Spinner size="extra-tiny" />}
                                                        {tErr && (
                                                            <span
                                                                style={{
                                                                    color: '#ef4444',
                                                                    fontSize: 11,
                                                                    background: 'rgba(239,68,68,0.12)',
                                                                    padding: '1px 6px',
                                                                    borderRadius: 4,
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                }}
                                                                title={tErr}
                                                            >
                                                                refresh failed
                                                                <Button
                                                                    appearance="transparent"
                                                                    size="small"
                                                                    icon={<DismissRegular />}
                                                                    style={{ minWidth: 'unset', padding: 0, height: 14, color: '#ef4444' }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        setTableErrors((prev) => {
                                                                            const next = { ...prev }
                                                                            delete next[tKey]
                                                                            return next
                                                                        })
                                                                    }}
                                                                    title="Dismiss error"
                                                                />
                                                            </span>
                                                        )}
                                                    </span>
                                                </TreeItemLayout>
                                                <Tree>
                                                    {table.columns.length === 0 ? (
                                                        <TreeItem itemType="leaf">
                                                            <TreeItemLayout
                                                                style={{
                                                                    fontStyle: 'italic',
                                                                    color: mutedColor,
                                                                    cursor: 'default',
                                                                    height: 28,
                                                                }}
                                                            >
                                                                Schema not loaded — click ⋯ → Refresh schema
                                                            </TreeItemLayout>
                                                        </TreeItem>
                                                    ) : (
                                                        table.columns.map((col) => (
                                                            <TreeItem key={`${tKey}.${col.name}`} itemType="leaf">
                                                                <TreeItemLayout
                                                                    style={{ cursor: 'pointer', height: 28 }}
                                                                    onClick={() => onInsertSql(col.name)}
                                                                    onMouseEnter={(e) => {
                                                                        ;(e.currentTarget as HTMLElement).style.background = hoverBg
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        ;(e.currentTarget as HTMLElement).style.background = ''
                                                                    }}
                                                                >
                                                                    {col.name}{' '}
                                                                    <span
                                                                        style={{
                                                                            color: mutedColor,
                                                                            fontSize: 12,
                                                                            cursor: isComplexType(col.type) ? 'help' : undefined,
                                                                        }}
                                                                        title={isComplexType(col.type) ? prettyFormatType(col.type) : undefined}
                                                                    >
                                                                        ({abbreviateType(col.type)})
                                                                    </span>
                                                                </TreeItemLayout>
                                                            </TreeItem>
                                                        ))
                                                    )}
                                                </Tree>
                                            </TreeItem>
                                        )
                                    })}
                                </Tree>
                            </TreeItem>
                        )
                    })}
                </Tree>
            )}
        </div>
    )
}
