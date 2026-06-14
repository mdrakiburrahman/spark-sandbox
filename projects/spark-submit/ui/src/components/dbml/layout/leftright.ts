/**
 * Left-Right layout — Port-aware ELK layered (Sugiyama) algorithm.
 *
 * Strategy per detail level:
 *   All:    Full Sugiyama with port constraints, wide inter-layer spacing for routing
 *   Keys:   Sugiyama with compact layers, medium spacing
 *   Tables: Compact Sugiyama with tight edge-centric spacing
 *
 * Key improvements over the previous implementation:
 * - Detail-level-aware node dimensions
 * - ELK port definitions matching React Flow handle positions
 * - Orthogonal edge route extraction from ELK results
 * - Per-detail-level spacing tuning
 * - Network simplex node placement for compact layers
 */

import type { DetailLevel } from '../TableNode'
import { type DbmlTable, type DbmlRef, type Position, type LayoutResult, type RoutePoint, type EdgeRoute, FIELD_ROW_HEIGHT, HEADER_HEIGHT, computeNodeDimensions, filterFields } from './types'

// ─── Spacing per detail level ───────────────────────────────────

function spacingConfig(level: DetailLevel) {
    switch (level) {
        case 'All':
            return { base: 50, component: 100, edgeNode: 80, nodeNode: 50 }
        case 'Keys':
            return { base: 35, component: 70, edgeNode: 55, nodeNode: 35 }
        case 'Tables':
            return { base: 20, component: 45, edgeNode: 30, nodeNode: 20 }
    }
}

// ─── ELK type helpers ───────────────────────────────────────────

interface ElkPort {
    id: string
    x: number
    y: number
    width: number
    height: number
    properties?: Record<string, string>
}

interface ElkNode {
    id: string
    width: number
    height: number
    ports?: ElkPort[]
    properties?: Record<string, string>
}

interface ElkEdge {
    id: string
    sources: string[]
    targets: string[]
}

interface ElkGraph {
    id: string
    layoutOptions: Record<string, string>
    children: ElkNode[]
    edges: ElkEdge[]
}

// ─── Helpers ────────────────────────────────────────────────────

function isFieldVisibleAtLevel(tableName: string, fieldName: string, tables: DbmlTable[], detailLevel: DetailLevel): boolean {
    if (detailLevel === 'All') return true
    if (detailLevel === 'Tables') return false
    const table = tables.find((t) => t.name === tableName)
    const field = table?.fields.find((f) => f.name === fieldName)
    return !!(field?.pk || fieldName.endsWith('_id') || fieldName === 'id')
}

// ─── Public API ─────────────────────────────────────────────────

export async function layoutLeftRight(tables: DbmlTable[], refs: DbmlRef[], detailLevel: DetailLevel): Promise<LayoutResult> {
    if (tables.length === 0) return { positions: new Map() }

    const ELK = (await import('elkjs/lib/elk.bundled.js')).default
    const elk = new ELK()

    const spacing = spacingConfig(detailLevel)

    const layoutOptions: Record<string, string> = {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.layered.spacing.baseValue': String(spacing.base),
        'elk.spacing.componentComponent': String(spacing.component),
        'elk.layered.spacing.edgeNodeBetweenLayers': String(spacing.edgeNode),
        'elk.spacing.nodeNode': String(spacing.nodeNode),
        // Use network simplex for compact, balanced layers
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        // Edge routing: orthogonal
        'elk.edgeRouting': 'ORTHOGONAL',
        // Crossing minimization
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.crossingMinimization.forceNodeModelOrder': 'true',
        'elk.layered.considerModelOrder.strategy': 'PREFER_EDGES',
        // Merge edges sharing source/target for cleaner routing
        'elk.layered.mergeEdges': 'true',
        // Port constraints — we define exact port positions
        'elk.portConstraints': 'FIXED_POS',
    }

    // Build nodes with ports matching React Flow handles
    const children: ElkNode[] = tables.map((t) => {
        const dims = computeNodeDimensions(t, detailLevel)
        const visibleFields = filterFields(t.fields, detailLevel)

        const ports: ElkPort[] = []
        visibleFields.forEach((f, idx) => {
            const y = HEADER_HEIGHT + idx * FIELD_ROW_HEIGHT + FIELD_ROW_HEIGHT / 2
            ports.push({
                id: `${t.name}.${f.name}.source`,
                x: dims.width,
                y,
                width: 1,
                height: 1,
                properties: { 'elk.port.side': 'EAST' },
            })
            ports.push({
                id: `${t.name}.${f.name}.target`,
                x: 0,
                y,
                width: 1,
                height: 1,
                properties: { 'elk.port.side': 'WEST' },
            })
        })
        // Generic ports at header center
        ports.push({
            id: `${t.name}.__generic__.source`,
            x: dims.width,
            y: HEADER_HEIGHT / 2,
            width: 1,
            height: 1,
            properties: { 'elk.port.side': 'EAST' },
        })
        ports.push({
            id: `${t.name}.__generic__.target`,
            x: 0,
            y: HEADER_HEIGHT / 2,
            width: 1,
            height: 1,
            properties: { 'elk.port.side': 'WEST' },
        })

        return {
            id: t.name,
            width: dims.width,
            height: dims.height,
            ports,
        }
    })

    // Build edges referencing port ids
    const edges: ElkEdge[] = refs
        .filter((r) => r.endpoints.length >= 2)
        .map((r, i) => {
            const [ep0, ep1] = r.endpoints
            const srcField = ep0.fieldNames[0] || ''
            const tgtField = ep1.fieldNames[0] || ''
            const srcVisible = isFieldVisibleAtLevel(ep0.tableName, srcField, tables, detailLevel)
            const tgtVisible = isFieldVisibleAtLevel(ep1.tableName, tgtField, tables, detailLevel)

            return {
                id: `ref-${i}`,
                sources: [srcVisible ? `${ep0.tableName}.${srcField}.source` : `${ep0.tableName}.__generic__.source`],
                targets: [tgtVisible ? `${ep1.tableName}.${tgtField}.target` : `${ep1.tableName}.__generic__.target`],
            }
        })

    const graph: ElkGraph = { id: 'root', layoutOptions, children, edges }

    const result = await elk.layout(graph as any)

    // Extract positions
    const positions = new Map<string, Position>()
    result.children?.forEach((child: any) => {
        positions.set(child.id, { x: child.x || 0, y: child.y || 0 })
    })

    // Extract edge routes from ELK
    const edgeRoutes: EdgeRoute[] = []
    result.edges?.forEach((edge: any) => {
        const points: RoutePoint[] = []
        if (edge.sections) {
            for (const section of edge.sections) {
                if (section.startPoint) {
                    points.push({ x: section.startPoint.x, y: section.startPoint.y })
                }
                if (section.bendPoints) {
                    for (const bp of section.bendPoints) {
                        points.push({ x: bp.x, y: bp.y })
                    }
                }
                if (section.endPoint) {
                    points.push({ x: section.endPoint.x, y: section.endPoint.y })
                }
            }
        }
        if (points.length > 0) {
            edgeRoutes.push({ edgeId: edge.id, points })
        }
    })

    return { positions, edgeRoutes: edgeRoutes.length > 0 ? edgeRoutes : undefined }
}
