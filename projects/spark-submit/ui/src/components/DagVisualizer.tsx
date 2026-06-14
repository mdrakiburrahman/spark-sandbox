'use client'

import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, useReactFlow, type Node, type Edge, BackgroundVariant, ConnectionMode } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'

import JobNode from './JobNode'
import { useThemeContext } from './ThemeProvider'
import { JobsConfig, JobStatus } from '@/lib/types'
import { getEdges } from '@/lib/dag'

const nodeTypes = {
    jobNode: JobNode,
}

const NODE_WIDTH = 340
const NODE_HEIGHT = 180

// Define our node type
type JobFlowNode = Node<{
    jobName: string
    job: { module: string; class: string; category: string; description: string; dependsOn?: string[]; inlineConfig?: string }
    status: JobStatus
    output: string
    error: string
    expanded: boolean
    onAddThisOnly: (jobName: string) => void
    onAddDag: (jobName: string) => void
    onToggleExpand: (jobName: string) => void
    onToggleSelect: (jobName: string) => void
    isSelected: boolean
    isInPendingDag: boolean
    isExecuting: boolean
    isDark: boolean
    isHighlighted: boolean
    isDimmed: boolean
}>

export interface DagVisualizerHandle {
    focusOnJob: (jobName: string) => void
}

interface DagVisualizerProps {
    config: JobsConfig
    jobStates: Record<string, { status: JobStatus; output: string; error: string; expanded: boolean }>
    selectedJobs: Set<string>
    pendingDagJobs: Set<string>
    highlightedJob: string | null
    focusedFailedJob: string | null
    isExecuting: boolean
    onAddThisOnly: (jobName: string) => void
    onAddDag: (jobName: string) => void
    onToggleExpand: (jobName: string) => void
    onToggleSelect: (jobName: string) => void
    spreadTrigger?: number
}

function getLayoutedElements(nodes: JobFlowNode[], edges: Edge[], direction: 'LR' | 'TB' = 'LR'): { nodes: JobFlowNode[]; edges: Edge[] } {
    const dagreGraph = new dagre.graphlib.Graph()
    dagreGraph.setDefaultEdgeLabel(() => ({}))
    dagreGraph.setGraph({ rankdir: direction, nodesep: 80, ranksep: 120 })

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
    })

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target)
    })

    dagre.layout(dagreGraph)

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id)
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - NODE_WIDTH / 2,
                y: nodeWithPosition.y - NODE_HEIGHT / 2,
            },
        }
    })

    return { nodes: spreadPositions(layoutedNodes), edges }
}

// Rescale node positions to fill the canvas with breathing room
function spreadPositions(nodes: JobFlowNode[]): JobFlowNode[] {
    if (nodes.length < 2) return nodes

    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity
    for (const n of nodes) {
        minX = Math.min(minX, n.position.x)
        minY = Math.min(minY, n.position.y)
        maxX = Math.max(maxX, n.position.x + NODE_WIDTH)
        maxY = Math.max(maxY, n.position.y + NODE_HEIGHT)
    }
    const curW = maxX - minX || 1
    const curH = maxY - minY || 1

    const targetW = Math.max(curW * 2, nodes.length * (NODE_WIDTH + 30))
    const targetH = Math.max(curH * 2, 600)

    const scaleX = targetW / curW
    const scaleY = targetH / curH

    return nodes.map((n) => ({
        ...n,
        position: {
            x: (n.position.x - minX) * scaleX,
            y: (n.position.y - minY) * scaleY,
        },
    }))
}

// Inner component that has access to ReactFlow hooks
function DagVisualizerInner({
    config,
    jobStates,
    selectedJobs,
    pendingDagJobs,
    highlightedJob,
    focusedFailedJob,
    isExecuting,
    onAddThisOnly,
    onAddDag,
    onToggleExpand,
    onToggleSelect,
    spreadTrigger,
}: DagVisualizerProps) {
    const { isDark } = useThemeContext()
    const [nodes, setNodes, onNodesChange] = useNodesState<JobFlowNode>([])
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
    const { setCenter, getNode, fitView } = useReactFlow()
    const prevConfigKeyRef = useRef<string>('')

    // Determine if we should dim nodes (nodes not in pending DAG when there are selections)
    const hasPendingDag = pendingDagJobs.size > 0

    // Focus on a specific job node (from search)
    useEffect(() => {
        if (highlightedJob) {
            const node = getNode(highlightedJob)
            if (node) {
                setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, { duration: 500, zoom: 0.8 })
            }
        }
    }, [highlightedJob, getNode, setCenter])

    // Focus on a failed job (zoomed in for inspection)
    useEffect(() => {
        if (focusedFailedJob) {
            const node = getNode(focusedFailedJob)
            if (node) {
                setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, { duration: 600, zoom: 1.2 })
            }
        }
    }, [focusedFailedJob, getNode, setCenter])

    // Build initial nodes and edges from config (positions include spread scaling)
    const layoutResult = useMemo((): { nodes: JobFlowNode[]; edges: Edge[] } => {
        if (!config) return { nodes: [], edges: [] }

        const jobNames = Object.keys(config.jobs)
        const dagEdges = getEdges(config)

        const initialNodes: JobFlowNode[] = jobNames.map((jobName) => {
            const job = config.jobs[jobName]
            const state = jobStates[jobName] || { status: 'idle' as JobStatus, output: '', error: '', expanded: false }
            const isDimmed = hasPendingDag && !pendingDagJobs.has(jobName)

            return {
                id: jobName,
                type: 'jobNode',
                position: { x: 0, y: 0 },
                data: {
                    jobName,
                    job,
                    status: state.status,
                    output: state.output,
                    error: state.error,
                    expanded: state.expanded,
                    onAddThisOnly,
                    onAddDag,
                    onToggleExpand,
                    onToggleSelect,
                    isSelected: selectedJobs.has(jobName),
                    isInPendingDag: pendingDagJobs.has(jobName),
                    isExecuting,
                    isDark,
                    isHighlighted: highlightedJob === jobName || pendingDagJobs.has(jobName),
                    isDimmed,
                },
            }
        })

        const initialEdges: Edge[] = dagEdges.map(({ source, target }) => ({
            id: `${source}-${target}`,
            source,
            target,
            animated: false,
            style: {
                stroke: isDark ? 'rgba(249, 115, 22, 0.5)' : 'rgba(249, 115, 22, 0.7)',
                strokeWidth: 2,
            },
        }))

        return getLayoutedElements(initialNodes, initialEdges)
    }, [config, isDark])

    // Apply layout only when the job set structurally changes (not on every poll)
    useEffect(() => {
        if (!config || layoutResult.nodes.length === 0) return
        const configKey = Object.keys(config.jobs).sort().join(',')
        if (configKey !== prevConfigKeyRef.current) {
            prevConfigKeyRef.current = configKey
            setNodes(layoutResult.nodes)
            setEdges(layoutResult.edges)
        }
    }, [layoutResult, setNodes, setEdges, config])

    // Reset node positions to the spread layout and fit the viewport
    const spreadAndFit = useCallback(() => {
        if (layoutResult.nodes.length < 2) {
            fitView({ padding: 0.15, duration: 300 })
            return
        }
        const posMap = new Map(layoutResult.nodes.map((n) => [n.id, n.position]))
        setNodes((nds) =>
            nds.map(
                (n): JobFlowNode => ({
                    ...n,
                    position: posMap.get(n.id) || n.position,
                })
            )
        )
        setTimeout(() => fitView({ padding: 0.08, duration: 300 }), 50)
    }, [layoutResult, setNodes, fitView])

    // Re-spread when triggered externally (e.g. from ControlPanel button)
    const spreadAndFitRef = useRef(spreadAndFit)
    spreadAndFitRef.current = spreadAndFit

    useEffect(() => {
        if (spreadTrigger && spreadTrigger > 0) {
            spreadAndFitRef.current()
        }
    }, [spreadTrigger])

    // Update node data when states change (without re-layouting)
    useEffect(() => {
        setNodes((nds) =>
            nds.map((node): JobFlowNode => {
                const state = jobStates[node.id] || { status: 'idle', output: '', error: '', expanded: false }
                const job = config?.jobs[node.id]
                const isDimmed = hasPendingDag && !pendingDagJobs.has(node.id)

                return {
                    ...node,
                    data: {
                        ...node.data,
                        status: state.status,
                        output: state.output,
                        error: state.error,
                        expanded: state.expanded,
                        isSelected: selectedJobs.has(node.id),
                        isInPendingDag: pendingDagJobs.has(node.id),
                        isExecuting,
                        isDark,
                        job,
                        onAddThisOnly,
                        onAddDag,
                        onToggleExpand,
                        onToggleSelect,
                        isHighlighted: highlightedJob === node.id || pendingDagJobs.has(node.id),
                        isDimmed,
                    },
                }
            })
        )
    }, [jobStates, selectedJobs, pendingDagJobs, isDark, config, onAddThisOnly, onAddDag, onToggleExpand, onToggleSelect, setNodes, highlightedJob, hasPendingDag, isExecuting])

    // Update edge styles based on job states and pending DAG
    useEffect(() => {
        setEdges((eds) =>
            eds.map((edge) => {
                const sourceState = jobStates[edge.source]
                const targetState = jobStates[edge.target]
                const sourceStatus = sourceState?.status || 'idle'
                const targetStatus = targetState?.status || 'idle'
                const isRunning = sourceStatus === 'running' || targetStatus === 'running'

                // Highlight edges that are part of the pending DAG
                const isInPendingDag = pendingDagJobs.has(edge.source) && pendingDagJobs.has(edge.target)
                const isDimmedEdge = hasPendingDag && !isInPendingDag

                // Determine edge color based on state of the nodes
                const getPendingDagEdgeColor = () => {
                    if (sourceStatus === 'running' || targetStatus === 'running') {
                        return '#3b82f6' // Blue for running
                    }
                    if (sourceStatus === 'success' && targetStatus === 'success') {
                        return '#22c55e' // Green for both done
                    }
                    if (sourceStatus === 'success') {
                        return '#f97316' // Orange - source done, target pending/running
                    }
                    // Selected jobs get orange, dependencies get yellow
                    if (selectedJobs.has(edge.target)) {
                        return '#f97316' // Orange for selected
                    }
                    return '#eab308' // Yellow for dependencies
                }

                return {
                    ...edge,
                    animated: isRunning || (isInPendingDag && isExecuting),
                    style: {
                        stroke: isInPendingDag
                            ? getPendingDagEdgeColor()
                            : isDimmedEdge
                            ? isDark
                                ? 'rgba(107, 114, 128, 0.2)'
                                : 'rgba(107, 114, 128, 0.3)'
                            : isDark
                            ? 'rgba(249, 115, 22, 0.5)'
                            : 'rgba(249, 115, 22, 0.7)',
                        strokeWidth: isInPendingDag ? 3 : 2,
                        opacity: isDimmedEdge ? 0.3 : 1,
                    },
                }
            })
        )
    }, [jobStates, isDark, setEdges, hasPendingDag, pendingDagJobs, selectedJobs, isExecuting])

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                connectionMode={ConnectionMode.Loose}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.1}
                maxZoom={1.5}
                defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} />
                <Controls
                    style={{
                        backgroundColor: isDark ? '#1a1a1a' : '#ffffff',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                        borderRadius: '8px',
                    }}
                />
                <MiniMap
                    nodeColor={(node) => {
                        // Highlight searched node in minimap
                        if (highlightedJob === node.id) {
                            return '#3b82f6'
                        }
                        // Show pending dag jobs in orange/yellow
                        if (pendingDagJobs.has(node.id)) {
                            if (selectedJobs.has(node.id)) {
                                return '#f97316' // Orange for selected
                            }
                            return '#eab308' // Yellow for dependencies
                        }
                        const state = jobStates[node.id]
                        switch (state?.status) {
                            case 'running':
                                return '#3b82f6'
                            case 'success':
                                return '#22c55e'
                            case 'failed':
                                return '#ef4444'
                            default:
                                return isDark ? '#4b5563' : '#9ca3af'
                        }
                    }}
                    maskColor={isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)'}
                    style={{
                        backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                    }}
                />
            </ReactFlow>
        </div>
    )
}

// Wrapper component that provides ReactFlowProvider
import { ReactFlowProvider } from '@xyflow/react'

export default function DagVisualizer(props: DagVisualizerProps) {
    return (
        <ReactFlowProvider>
            <DagVisualizerInner {...props} />
        </ReactFlowProvider>
    )
}
