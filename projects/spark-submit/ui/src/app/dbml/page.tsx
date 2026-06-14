'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Button, Input, Spinner, Text } from '@fluentui/react-components'
import { Open16Regular, DocumentSearch20Regular } from '@fluentui/react-icons'
import { useThemeContext } from '@/components/ThemeProvider'
import '@/components/dbml/dbml-styles.css'

const DbmlVisualizer = dynamic(() => import('@/components/dbml/DbmlVisualizer'), { ssr: false })

interface DbmlSchema {
    tables: any[]
    refs: any[]
}

interface ParseResult {
    filePath: string
    schema: DbmlSchema
    stats: {
        tables: number
        refs: number
        totalFields: number
    }
}

const STORAGE_KEY = 'spark-orchestrator-dbml-path'

export default function DbmlPage() {
    const { isDark } = useThemeContext()
    const [filePath, setFilePath] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [result, setResult] = useState<ParseResult | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    // Restore last used path
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) setFilePath(saved)
    }, [])

    const loadDbml = useCallback(async () => {
        if (!filePath.trim()) {
            setError('Please enter a file path')
            return
        }

        setLoading(true)
        setError(null)

        try {
            const res = await fetch('/api/dbml', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: filePath.trim() }),
            })

            const data = await res.json()

            if (!res.ok) {
                setError(data.error || `HTTP ${res.status}`)
                setResult(null)
                return
            }

            setResult(data)
            localStorage.setItem(STORAGE_KEY, filePath.trim())
        } catch (err: any) {
            setError(err.message || 'Failed to load DBML file')
            setResult(null)
        } finally {
            setLoading(false)
        }
    }, [filePath])

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') loadDbml()
        },
        [loadDbml]
    )

    const bgColor = isDark ? '#141414' : '#fafafa'
    const barBg = isDark ? 'rgba(20,20,20,0.9)' : 'rgba(255,255,255,0.9)'
    const borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: 'calc(100vh - 56px)',
                background: bgColor,
            }}
        >
            {/* Input bar */}
            <div
                className="dbml-input-bar"
                style={{
                    background: barBg,
                    borderBottom: `1px solid ${borderColor}`,
                    backdropFilter: 'blur(8px)',
                }}
            >
                <DocumentSearch20Regular style={{ color: isDark ? '#888' : '#666', flexShrink: 0 }} />
                <Input
                    ref={inputRef}
                    value={filePath}
                    onChange={(_, data) => setFilePath(data.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="/path/to/schema.dbml"
                    appearance="outline"
                    style={{ flex: 1 }}
                    contentBefore={
                        <span
                            style={{
                                fontFamily: "'JetBrains Mono', monospace",
                                fontSize: '14px',
                                opacity: 0.5,
                                marginRight: '4px',
                                color: isDark ? '#aaa' : '#555',
                            }}
                        >
                            file://
                        </span>
                    }
                />
                <Button appearance="primary" onClick={loadDbml} disabled={loading || !filePath.trim()} icon={loading ? <Spinner size="tiny" /> : <Open16Regular />}>
                    Open DBML
                </Button>

                {result && (
                    <div className="dbml-stats" style={{ color: isDark ? '#aaa' : '#666' }}>
                        <span>📊 {result.stats.tables} tables</span>
                        <span>🔗 {result.stats.refs} refs</span>
                        <span>📋 {result.stats.totalFields} fields</span>
                    </div>
                )}
            </div>

            {/* Error display */}
            {error && (
                <div
                    style={{
                        padding: '8px 24px',
                        background: isDark ? '#3b1111' : '#fef2f2',
                        borderBottom: `1px solid ${isDark ? '#5c1a1a' : '#fca5a5'}`,
                        color: isDark ? '#fca5a5' : '#dc2626',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                    }}
                >
                    <span>⚠️</span>
                    <Text size={200}>{error}</Text>
                </div>
            )}

            {/* Diagram area */}
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                {result ? (
                    <DbmlVisualizer schema={result.schema} />
                ) : (
                    <div className="dbml-empty-state">
                        <span className="dbml-empty-title">Please put the full location of a valid DBML file on the top left</span>
                        <span className="dbml-empty-subtitle">Supports DBML v2 schema files with tables, references, and enums</span>
                    </div>
                )}
            </div>
        </div>
    )
}
