'use client'

import React, { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, type Node, type Edge, BackgroundVariant, ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import TableNode, { type TableNodeData, type TableField, type DetailLevel } from './TableNode'
import OrthogonalEdge from './OrthogonalEdge'
import BottomToolbar, { type LayoutAlgorithm } from './BottomToolbar'
import RightSidebar from './RightSidebar'
import { useThemeContext } from '../ThemeProvider'
import './dbml-styles.css'

// Layout algorithm imports
import { type Position, type EdgeRoute, estimateTableWidth, filterFields } from './layout/types'
import { layoutCompact } from './layout/compact'
import { layoutLeftRight } from './layout/leftright'
import { layoutSnowflake } from './layout/snowflake'

interface DbmlRef {
    name: string | null
    endpoints: {
        tableName: string
        fieldNames: string[]
        relation: string
    }[]
}

interface DbmlSchema {
    tables: {
        name: string
        note: string | null
        fields: TableField[]
    }[]
    refs: DbmlRef[]
}

const nodeTypes = { tableNode: TableNode }
const edgeTypes = { orthogonal: OrthogonalEdge }

function isFieldVisible(tableName: string, fieldName: string, tables: DbmlSchema['tables'], detailLevel: DetailLevel): boolean {
    if (detailLevel === 'All') return true
    if (detailLevel === 'Tables') return false
    const table = tables.find((t) => t.name === tableName)
    const field = table?.fields.find((f) => f.name === fieldName)
    return !!(field?.pk || fieldName.endsWith('_id') || fieldName === 'id')
}

function buildEdges(schema: DbmlSchema, isDark: boolean, highlightMode: boolean, hoveredTable: string | null, detailLevel: DetailLevel = 'All', edgeRouteMap?: Map<string, EdgeRoute>): Edge[] {
    const refColor = '#9B9CA4'
    // Extension highlight colors
    const highlightColor = isDark ? '#3EA8DE' : '#619BCC'

    // Build hovered table's connected edges for hover emphasis
    const hoveredEdgeIds = new Set<string>()
    if (hoveredTable) {
        schema.refs.forEach((ref, idx) => {
            if (ref.endpoints.length < 2) return
            const [ep0, ep1] = ref.endpoints
            if (ep0.tableName === hoveredTable || ep1.tableName === hoveredTable) {
                hoveredEdgeIds.add(`ref-${idx}`)
            }
        })
    }

    return schema.refs
        .map((ref, idx) => {
            if (ref.endpoints.length < 2) return null
            const [ep0, ep1] = ref.endpoints
            const source = ep0.tableName
            const target = ep1.tableName
            const sourceField = ep0.fieldNames[0] || ''
            const targetField = ep1.fieldNames[0] || ''
            const srcLabel = ep0.relation === '*' ? '*' : '1'
            const tgtLabel = ep1.relation === '*' ? '*' : '1'
            const edgeId = `ref-${idx}`

            // Fall back to generic handles when field rows are hidden
            const srcVisible = isFieldVisible(source, sourceField, schema.tables, detailLevel)
            const tgtVisible = isFieldVisible(target, targetField, schema.tables, detailLevel)

            // Determine edge visual state
            const isHoveredEdge = hoveredTable && hoveredEdgeIds.has(edgeId)
            const isDimmedByHover = hoveredTable && !isHoveredEdge

            let stroke = refColor
            let strokeWidth = 1
            let opacity = 1
            let animated = false

            if (highlightMode) {
                // Highlight ON: all edges are prominent blue
                stroke = highlightColor
                strokeWidth = 2
                animated = true
                if (isHoveredEdge) {
                    // Hovered table's edges get extra emphasis
                    strokeWidth = 3
                } else if (isDimmedByHover) {
                    // Non-hovered edges dim slightly
                    opacity = 0.4
                    strokeWidth = 1.5
                }
            } else if (isHoveredEdge) {
                // Highlight OFF but hovering: emphasize hovered edges
                stroke = highlightColor
                strokeWidth = 2.5
            } else if (isDimmedByHover) {
                // Highlight OFF, hovering: dim non-hovered edges
                stroke = isDark ? '#3a3b42' : '#D0D2D8'
                strokeWidth = 0.8
                opacity = 0.3
            }

            // Look up pre-computed route points if available
            const routeData = edgeRouteMap?.get(edgeId)

            return {
                id: edgeId,
                source,
                target,
                sourceHandle: srcVisible ? `${source}.${sourceField}.source` : `${source}.__generic__.source`,
                targetHandle: tgtVisible ? `${target}.${targetField}.target` : `${target}.__generic__.target`,
                type: routeData ? 'orthogonal' : 'smoothstep',
                animated,
                data: routeData ? { routePoints: routeData.points } : undefined,
                style: {
                    stroke,
                    strokeWidth,
                    opacity,
                    transition: 'all 0.3s ease',
                },
                label: isDimmedByHover && !highlightMode ? undefined : `${srcLabel} ─ ${tgtLabel}`,
                labelStyle: {
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: "'Inconsolata', monospace",
                    fill: highlightMode ? highlightColor : refColor,
                },
                labelBgStyle: {
                    fill: isDark ? '#37383F' : '#F2F2F2',
                    fillOpacity: 0.95,
                },
                labelBgPadding: [4, 2] as [number, number],
                labelBgBorderRadius: 2,
            }
        })
        .filter(Boolean) as Edge[]
}

function DbmlVisualizerInner({ schema }: { schema: DbmlSchema }) {
    const { isDark } = useThemeContext()
    const { fitView, setCenter, getZoom } = useReactFlow()

    // Feature state
    const [highlightMode, setHighlightMode] = useState(false)
    const [gridEnabling, setGridEnabling] = useState(true)
    const [detailLevel, setDetailLevel] = useState<DetailLevel>('All')
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [showTableSearch, setShowTableSearch] = useState(false)
    const [hoveredTable, setHoveredTable] = useState<string | null>(null)
    const [visibleTables, setVisibleTables] = useState<Set<string>>(() => new Set(schema.tables.map((t) => t.name)))

    // Build nodes with current settings
    const visibleSchema = useMemo(
        () => ({
            tables: schema.tables.filter((t) => visibleTables.has(t.name)),
            refs: schema.refs.filter((r) => r.endpoints.length >= 2 && visibleTables.has(r.endpoints[0].tableName) && visibleTables.has(r.endpoints[1].tableName)),
        }),
        [schema, visibleTables]
    )

    const initialPositions = useMemo(() => layoutCompact(visibleSchema.tables, visibleSchema.refs, detailLevel), [visibleSchema, detailLevel])

    // Edge route data from layout algorithms (Left-Right provides ELK routes)
    const edgeRouteMapRef = useRef<Map<string, EdgeRoute> | undefined>(undefined)

    // Build set of tables connected to hovered table (for hover highlight)
    const connectedTables = useMemo(() => {
        const set = new Set<string>()
        if (!hoveredTable) return set
        set.add(hoveredTable)
        visibleSchema.refs.forEach((r) => {
            if (r.endpoints.length < 2) return
            const [ep0, ep1] = r.endpoints
            if (ep0.tableName === hoveredTable || ep1.tableName === hoveredTable) {
                set.add(ep0.tableName)
                set.add(ep1.tableName)
            }
        })
        return set
    }, [hoveredTable, visibleSchema.refs])

    // Extension colors for highlight
    const highlightColor = isDark ? '#619BCC' : '#619BCC'
    const highlightFieldBg = isDark ? '#4B4C53' : '#DEECF3'
    const tableBorderHighlight = isDark ? '#619BCC' : '#619BCC'

    const buildNodes = useCallback(
        (positions: Map<string, { x: number; y: number }>): Node<TableNodeData>[] =>
            visibleSchema.tables.map((table) => {
                const isHovered = hoveredTable === table.name
                const isConnected = connectedTables.has(table.name)
                const isDimmedByHover = hoveredTable && !isConnected

                return {
                    id: table.name,
                    type: 'tableNode',
                    position: positions.get(table.name) || { x: 0, y: 0 },
                    data: {
                        tableName: table.name,
                        fields: table.fields,
                        note: table.note,
                        detailLevel,
                    },
                    style: {
                        opacity: isDimmedByHover ? 0.25 : 1,
                        transition: 'opacity 0.2s ease, box-shadow 0.2s ease',
                        ...(isHovered
                            ? {
                                  boxShadow: `0 0 0 2px ${tableBorderHighlight}, 0 0 15px rgba(97,155,204,0.5)`,
                                  borderRadius: 3,
                              }
                            : {}),
                    },
                }
            }),
        [visibleSchema, detailLevel, hoveredTable, connectedTables, tableBorderHighlight]
    )

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

    // Layout effect: set node positions on mount and when visibility/detail changes
    useEffect(() => {
        edgeRouteMapRef.current = undefined
        setNodes(buildNodes(initialPositions))
        setEdges(buildEdges(visibleSchema, isDark, highlightMode, hoveredTable, detailLevel, edgeRouteMapRef.current))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialPositions])

    // Style effect: update node styles/data and edges without resetting positions
    useEffect(() => {
        setNodes((prev) =>
            prev.length === 0
                ? prev
                : prev.map((node) => {
                      const isHovered = hoveredTable === node.id
                      const isConnected = connectedTables.has(node.id)
                      const isDimmedByHover = hoveredTable && !isConnected

                      return {
                          ...node,
                          data: { ...node.data, detailLevel },
                          style: {
                              opacity: isDimmedByHover ? 0.25 : 1,
                              transition: 'opacity 0.2s ease, box-shadow 0.2s ease',
                              ...(isHovered
                                  ? {
                                        boxShadow: `0 0 0 2px ${tableBorderHighlight}, 0 0 15px rgba(97,155,204,0.5)`,
                                        borderRadius: 3,
                                    }
                                  : {}),
                          },
                      }
                  })
        )
        setEdges(buildEdges(visibleSchema, isDark, highlightMode, hoveredTable, detailLevel, edgeRouteMapRef.current))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlightMode, hoveredTable, connectedTables, detailLevel, isDark])

    // Fit view on initial load
    const onInit = useCallback(() => {
        setTimeout(() => fitView({ padding: 0.06, duration: 500 }), 250)
    }, [fitView])

    // Handle node hover for relationship highlighting
    const onNodeMouseEnter = useCallback((_: React.MouseEvent, node: Node) => {
        setHoveredTable(node.id)
    }, [])

    const onNodeMouseLeave = useCallback(() => {
        setHoveredTable(null)
    }, [])

    // Clear hover when clicking background
    const onPaneClick = useCallback(() => {
        setHoveredTable(null)
    }, [])

    // Auto Arrange handler — each algorithm is detail-level aware
    const handleAutoArrange = useCallback(
        async (algorithm: LayoutAlgorithm) => {
            let positions: Map<string, Position>
            let routeMap: Map<string, EdgeRoute> | undefined

            if (algorithm === 'default') {
                positions = layoutCompact(visibleSchema.tables, visibleSchema.refs, detailLevel)
            } else if (algorithm === 'leftright') {
                const result = await layoutLeftRight(visibleSchema.tables, visibleSchema.refs, detailLevel)
                positions = result.positions
                // Build route map from ELK edge routes
                if (result.edgeRoutes) {
                    routeMap = new Map(result.edgeRoutes.map((r) => [r.edgeId, r]))
                }
            } else {
                // snowflake
                positions = layoutSnowflake(visibleSchema.tables, visibleSchema.refs, detailLevel)
            }

            edgeRouteMapRef.current = routeMap
            setNodes(buildNodes(positions))
            setEdges(buildEdges(visibleSchema, isDark, highlightMode, hoveredTable, detailLevel, routeMap))
            setTimeout(() => fitView({ padding: 0.06, duration: 400 }), 150)
        },
        [visibleSchema, buildNodes, setNodes, setEdges, fitView, detailLevel, isDark, highlightMode, hoveredTable]
    )

    // Toggle highlight — when ON, all edges become prominent blue
    const handleToggleHighlight = useCallback(() => {
        setHighlightMode((prev) => !prev)
    }, [])

    // Table visibility
    const handleToggleTable = useCallback((name: string) => {
        setVisibleTables((prev) => {
            const next = new Set(prev)
            if (next.has(name)) next.delete(name)
            else next.add(name)
            return next
        })
    }, [])

    const handleShowAll = useCallback(() => {
        setVisibleTables(new Set(schema.tables.map((t) => t.name)))
    }, [schema])

    const handleHideAll = useCallback(() => {
        setVisibleTables(new Set())
    }, [])

    // Focus on table
    const handleFocusTable = useCallback(
        (name: string) => {
            const node = nodes.find((n) => n.id === name)
            if (node) {
                const zoom = getZoom()
                const nodeData = node.data as unknown as TableNodeData
                const visibleFields = filterFields(nodeData.fields, detailLevel)
                setCenter(node.position.x + estimateTableWidth(visibleFields, nodeData.tableName) / 2, node.position.y + 50, { zoom: Math.max(zoom, 0.5), duration: 500 })
            }
        },
        [nodes, setCenter, getZoom, detailLevel]
    )

    // Keyboard shortcut: Ctrl+F for search
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault()
                setSidebarOpen(true)
            }
        }
        document.addEventListener('keydown', handler)
        return () => document.removeEventListener('keydown', handler)
    }, [])

    // Canvas background matching dbdiagram.io
    const canvasBg = isDark ? '#2A2B30' : '#E7E9ED'
    const dotColor = isDark ? '#3a3b42' : '#D0D2D8'

    // Table metadata for sidebar
    const tablesMeta = useMemo(() => schema.tables.map((t) => ({ name: t.name, note: t.note, fieldCount: t.fields.length })), [schema])

    return (
        <div className="dbml-viewer-container" style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onInit={onInit}
                onNodeMouseEnter={onNodeMouseEnter}
                onNodeMouseLeave={onNodeMouseLeave}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                minZoom={0.02}
                maxZoom={2.5}
                defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
                proOptions={{ hideAttribution: true }}
                style={{ background: canvasBg }}
            >
                {gridEnabling && <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color={dotColor} />}
                <Controls
                    position="bottom-left"
                    style={{
                        borderRadius: 4,
                        overflow: 'hidden',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                />
                <MiniMap
                    position="bottom-right"
                    style={{
                        background: isDark ? '#2A2B30' : '#E7E9ED',
                        borderRadius: 4,
                        overflow: 'hidden',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        marginRight: sidebarOpen ? 312 : 0,
                        transition: 'margin-right 0.2s ease',
                    }}
                    nodeColor={isDark ? '#555' : '#316896'}
                    maskColor={isDark ? 'rgba(42,43,48,0.8)' : 'rgba(231,233,237,0.8)'}
                    pannable
                    zoomable
                />
            </ReactFlow>

            {/* Bottom Toolbar */}
            <BottomToolbar
                onAutoArrange={handleAutoArrange}
                highlight={highlightMode}
                onToggleHighlight={handleToggleHighlight}
                gridEnabling={gridEnabling}
                onToggleGrid={() => setGridEnabling((prev) => !prev)}
                detailLevel={detailLevel}
                onDetailLevelChanged={setDetailLevel}
                onToggleTableSearch={() => setSidebarOpen((prev) => !prev)}
                showTableSearch={sidebarOpen}
            />

            {/* Right Sidebar */}
            <RightSidebar
                tables={tablesMeta}
                visibleTables={visibleTables}
                onToggleTable={handleToggleTable}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                onFocusTable={handleFocusTable}
                sidebarOpen={sidebarOpen}
                onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            />
        </div>
    )
}

export interface DbmlVisualizerProps {
    schema: DbmlSchema
}

export default function DbmlVisualizer({ schema }: DbmlVisualizerProps) {
    return (
        <ReactFlowProvider>
            <DbmlVisualizerInner schema={schema} />
        </ReactFlowProvider>
    )
}
