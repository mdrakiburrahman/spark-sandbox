'use client'

import { Button, Spinner, Tooltip } from '@fluentui/react-components'
import { PlayRegular, StopRegular, TextGrammarWandRegular } from '@fluentui/react-icons'

interface QueryToolbarProps {
    onExecute: () => void
    onCancel: () => void
    onFormat: () => void
    isExecuting: boolean
    executionTime: number | null
    rowCount: number | null
    isDark: boolean
}

function formatExecutionTime(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
}

export default function QueryToolbar({ onExecute, onCancel, onFormat, isExecuting, executionTime, rowCount, isDark }: QueryToolbarProps) {
    const containerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 40,
        padding: '0 12px',
        background: isDark ? '#111' : '#f5f5f5',
        borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
        borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
    }

    const statusStyle: React.CSSProperties = {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
        userSelect: 'none',
    }

    return (
        <div style={containerStyle}>
            <Tooltip content="Run query (Ctrl+Enter)" relationship="description">
                <Button appearance="primary" size="small" icon={<PlayRegular />} disabled={isExecuting} onClick={onExecute}>
                    Run
                </Button>
            </Tooltip>

            <Tooltip content="Format SQL" relationship="description">
                <Button appearance="subtle" size="small" icon={<TextGrammarWandRegular />} disabled={isExecuting} onClick={onFormat}>
                    Format
                </Button>
            </Tooltip>

            {isExecuting && (
                <>
                    <Button appearance="subtle" size="small" icon={<StopRegular />} onClick={onCancel}>
                        Cancel
                    </Button>
                    <Spinner size="tiny" />
                </>
            )}

            {executionTime !== null && <span style={statusStyle}>⏱ {formatExecutionTime(executionTime)}</span>}

            {rowCount !== null && (
                <span style={statusStyle}>
                    {rowCount.toLocaleString()} {rowCount === 1 ? 'row' : 'rows'}
                </span>
            )}
        </div>
    )
}
