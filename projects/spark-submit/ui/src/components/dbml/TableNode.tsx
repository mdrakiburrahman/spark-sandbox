'use client'

import React from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useThemeContext } from '../ThemeProvider'

export interface TableField {
    name: string
    type: string
    pk: boolean
    unique: boolean
    notNull: boolean
    note: string | null
    dbdefault: string | null
    increment: boolean
}

export type DetailLevel = 'All' | 'Keys' | 'Tables'

export interface TableNodeData {
    tableName: string
    fields: TableField[]
    note: string | null
    detailLevel: DetailLevel
    [key: string]: unknown
}

// Exact colors from dbdiagram.io extension (@holistics/dbrenderer)
const THEME = {
    light: {
        HEADER_BG: '#316896',
        FIELD_BG: '#F2F2F2',
        FIELD_NAME_COLOR: '#3C3C3C',
        FIELD_TYPE_COLOR: '#6A6A6A',
        SETTING_BG: '#DEDEDE',
        PK_COLOR: '#2C2C2C',
        HIGHLIGHT_BG: '#DEECF3',
        BORDER: '#bbb',
        REF_COLOR: '#9B9CA4',
    },
    dark: {
        HEADER_BG: '#222',
        FIELD_BG: '#37383F',
        FIELD_NAME_COLOR: '#C5C5C7',
        FIELD_TYPE_COLOR: '#A5A5A7',
        SETTING_BG: '#666666',
        PK_COLOR: '#D7D7D9',
        HIGHLIGHT_BG: '#4B4C53',
        BORDER: '#555',
        REF_COLOR: '#9B9CA4',
    },
}

// dbdiagram uses HEADER_HEIGHT: 36, HEADER_PADDING: 12, BORDER_RADIUS: 3, FONT_SIZE: 13
const HEADER_HEIGHT = 36
const FIELD_ROW_HEIGHT = 32
const BORDER_RADIUS = 3

function TableNode({ data }: NodeProps) {
    const { isDark } = useThemeContext()
    const d = data as unknown as TableNodeData
    const t = isDark ? THEME.dark : THEME.light
    const detailLevel = d.detailLevel || 'All'

    // Filter fields based on detail level
    const displayFields = detailLevel === 'Tables' ? [] : detailLevel === 'Keys' ? d.fields.filter((f) => f.pk || f.name.endsWith('_id') || f.name === 'id') : d.fields

    const settings = (field: TableField) => {
        const tags: string[] = []
        if (field.pk) tags.push('pk')
        if (field.unique) tags.push('unique')
        if (field.increment) tags.push('increment')
        return tags
    }

    // META tag colors — visually distinct badges for each metadata annotation
    const META_COLORS: Record<string, { bg: string; color: string }> = {
        NATURAL_KEY: { bg: '#1e3a5f', color: '#7cb3f0' },
        BUSINESS_KEY: { bg: '#1e3a5f', color: '#7cb3f0' },
        SCD1: { bg: '#1a3a2a', color: '#6fcf97' },
        SCD2: { bg: '#3a2e1a', color: '#f2c94c' },
        HIVE_PARTITION_COLUMN: { bg: '#2e1a3a', color: '#bb86fc' },
    }

    const META_COLORS_LIGHT: Record<string, { bg: string; color: string }> = {
        NATURAL_KEY: { bg: '#dbeafe', color: '#1e40af' },
        BUSINESS_KEY: { bg: '#dbeafe', color: '#1e40af' },
        SCD1: { bg: '#dcfce7', color: '#166534' },
        SCD2: { bg: '#fef9c3', color: '#854d0e' },
        HIVE_PARTITION_COLUMN: { bg: '#f3e8ff', color: '#6b21a8' },
    }

    /** Extract short META labels from a note string */
    const getMetaLabels = (note: string | null): string[] => {
        if (!note) return []
        const labels: string[] = []
        const regex = /\{\{([^}]+)\}\}/g
        let match: RegExpExecArray | null
        while ((match = regex.exec(note)) !== null) {
            for (const part of match[1].split(',')) {
                const trimmed = part.trim()
                if (trimmed.startsWith('META:')) {
                    labels.push(trimmed.replace('META:', ''))
                }
            }
        }
        return labels
    }

    /** Strip {{...}} blocks from note for clean tooltip */
    const cleanNote = (note: string | null): string | undefined => {
        if (!note) return undefined
        const cleaned = note.replace(/\{\{[^}]+\}\}/g, '').trim()
        return cleaned || undefined
    }

    return (
        <div
            className="dbml-table-node"
            style={{
                borderRadius: BORDER_RADIUS,
                overflow: 'hidden',
                fontFamily: "'Open Sans', sans-serif",
                fontSize: 13,
                lineHeight: '1.4',
                boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                minWidth: 220,
            }}
        >
            {/* Header */}
            <div
                style={{
                    background: t.HEADER_BG,
                    color: '#fff',
                    height: HEADER_HEIGHT,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 12px',
                    fontWeight: 700,
                    fontSize: 13,
                    letterSpacing: '0.01em',
                    whiteSpace: 'nowrap',
                }}
                title={d.note || undefined}
            >
                {d.tableName}
            </div>

            {/* Generic handles for connections when fields are hidden (Keys/Tables mode) */}
            <Handle type="target" position={Position.Left} id={`${d.tableName}.__generic__.target`} className="dbml-handle" style={{ top: HEADER_HEIGHT / 2 }} />
            <Handle type="source" position={Position.Right} id={`${d.tableName}.__generic__.source`} className="dbml-handle" style={{ top: HEADER_HEIGHT / 2 }} />

            {/* Fields */}
            {displayFields.map((field, idx) => {
                const fieldSettings = settings(field)
                const metaLabels = getMetaLabels(field.note)
                const metaColors = isDark ? META_COLORS : META_COLORS_LIGHT
                return (
                    <div
                        key={field.name}
                        className="dbml-field-row"
                        style={{
                            background: t.FIELD_BG,
                            height: FIELD_ROW_HEIGHT,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 12px',
                            position: 'relative',
                            borderTop: idx === 0 ? 'none' : `1px solid ${isDark ? '#2e2f35' : '#E5E5E5'}`,
                            cursor: 'default',
                            gap: 6,
                        }}
                        title={cleanNote(field.note)}
                    >
                        {/* Left handle */}
                        <Handle type="target" position={Position.Left} id={`${d.tableName}.${field.name}.target`} className="dbml-handle" />

                        {/* Field name */}
                        <span
                            style={{
                                color: field.pk ? t.PK_COLOR : t.FIELD_NAME_COLOR,
                                fontWeight: field.pk ? 700 : 400,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                flex: 1,
                            }}
                        >
                            {field.name}
                        </span>

                        {/* META tag badges */}
                        {metaLabels.length > 0 && (
                            <span style={{ display: 'flex', gap: 3 }}>
                                {metaLabels.map((label) => {
                                    const mc = metaColors[label] || metaColors['NATURAL_KEY']
                                    return (
                                        <span
                                            key={label}
                                            style={{
                                                background: mc.bg,
                                                color: mc.color,
                                                borderRadius: 3,
                                                padding: '1px 4px',
                                                fontSize: 9,
                                                fontWeight: 600,
                                                lineHeight: '14px',
                                                whiteSpace: 'nowrap',
                                                letterSpacing: '0.02em',
                                            }}
                                        >
                                            {label}
                                        </span>
                                    )
                                })}
                            </span>
                        )}

                        {/* Field type */}
                        <span
                            style={{
                                fontFamily: "'Inconsolata', 'Consolas', monospace",
                                fontSize: 13,
                                color: t.FIELD_TYPE_COLOR,
                                whiteSpace: 'nowrap',
                                marginLeft: 8,
                            }}
                        >
                            {field.type}
                        </span>

                        {/* Setting badges */}
                        {fieldSettings.length > 0 && (
                            <span style={{ display: 'flex', gap: 3, marginLeft: 4 }}>
                                {fieldSettings.map((s) => (
                                    <span
                                        key={s}
                                        style={{
                                            background: t.SETTING_BG,
                                            borderRadius: 3,
                                            padding: '1px 5px',
                                            fontSize: 10,
                                            fontWeight: 600,
                                            color: field.pk ? t.PK_COLOR : t.FIELD_NAME_COLOR,
                                            lineHeight: '16px',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {s}
                                    </span>
                                ))}
                            </span>
                        )}

                        {/* Right handle */}
                        <Handle type="source" position={Position.Right} id={`${d.tableName}.${field.name}.source`} className="dbml-handle" />
                    </div>
                )
            })}
        </div>
    )
}

export default React.memo(TableNode)
