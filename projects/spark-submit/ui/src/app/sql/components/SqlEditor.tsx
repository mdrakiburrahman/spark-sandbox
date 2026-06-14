'use client'

import { useMemo, useCallback, useRef, MutableRefObject } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { SparkSQL } from '../lib/sparkSqlDialect'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap } from '@codemirror/view'
import { placeholder } from '@codemirror/view'
import { Prec } from '@codemirror/state'

interface SqlEditorProps {
    value: string
    onChange: (value: string) => void
    onExecute: (sql: string) => void
    schema?: Record<string, string[]>
    isDark: boolean
    editorViewRef?: MutableRefObject<EditorView | null>
}

const sparkDarkTheme = EditorView.theme({
    '&': { backgroundColor: '#0a0a0a' },
    '.cm-content': { fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' },
    '.cm-gutters': { backgroundColor: '#111', borderRight: '1px solid rgba(255,255,255,0.1)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(249,115,22,0.1)' },
    '.cm-activeLine': { backgroundColor: 'rgba(249,115,22,0.05)' },
    '.cm-cursor': { borderLeftColor: '#f97316' },
    '.cm-selectionBackground': { backgroundColor: 'rgba(249,115,22,0.2) !important' },
    '&.cm-focused .cm-selectionBackground': { backgroundColor: 'rgba(249,115,22,0.3) !important' },
})

const sparkLightTheme = EditorView.theme({
    '&': { backgroundColor: '#ffffff' },
    '.cm-content': { fontFamily: "'JetBrains Mono', monospace", fontSize: '14px' },
    '.cm-gutters': { backgroundColor: '#fafafa', borderRight: '1px solid rgba(0,0,0,0.1)' },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(249,115,22,0.08)' },
    '.cm-activeLine': { backgroundColor: 'rgba(249,115,22,0.04)' },
    '.cm-cursor': { borderLeftColor: '#f97316' },
})

export default function SqlEditor({ value, onChange, onExecute, schema, isDark, editorViewRef }: SqlEditorProps) {
    const onExecuteRef = useRef(onExecute)
    onExecuteRef.current = onExecute

    const handleChange = useCallback(
        (val: string) => {
            onChange(val)
        },
        [onChange]
    )

    const extensions = useMemo(() => {
        const executeKeybindings = Prec.highest(
            keymap.of([
                {
                    key: 'Mod-Enter',
                    run: (view) => {
                        const { from, to } = view.state.selection.main
                        const selected = from !== to ? view.state.sliceDoc(from, to) : view.state.doc.toString()
                        onExecuteRef.current(selected)
                        return true
                    },
                },
                {
                    key: 'Mod-Shift-Enter',
                    run: (view) => {
                        const { from, to } = view.state.selection.main
                        const selected = from !== to ? view.state.sliceDoc(from, to) : view.state.doc.toString()
                        onExecuteRef.current(selected)
                        return true
                    },
                },
            ])
        )

        const sqlExtension = sql({
            dialect: SparkSQL,
            upperCaseKeywords: true,
            schema: schema,
        })

        return [
            sqlExtension,
            executeKeybindings,
            isDark ? sparkDarkTheme : sparkLightTheme,
            isDark ? oneDark : [],
            placeholder('-- Write your SQL query here\n-- Press Ctrl+Enter to execute'),
            EditorView.lineWrapping,
        ].flat()
    }, [schema, isDark])

    const handleCreateEditor = useCallback(
        (view: EditorView) => {
            if (editorViewRef) editorViewRef.current = view
        },
        [editorViewRef]
    )

    return (
        <CodeMirror
            value={value}
            onChange={handleChange}
            onCreateEditor={handleCreateEditor}
            extensions={extensions}
            theme={isDark ? 'dark' : 'light'}
            height="100%"
            style={{ flex: 1, overflow: 'hidden' }}
            basicSetup={{
                lineNumbers: true,
                bracketMatching: true,
                closeBrackets: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
            }}
        />
    )
}
