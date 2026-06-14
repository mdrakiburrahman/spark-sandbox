/**
 * Shared types and dimension computation for DBML layout algorithms.
 * All layout functions use detail-level-aware node sizing so that
 * each algorithm × detail-level combination produces a unique,
 * optimised arrangement.
 */

import type { TableField, DetailLevel } from '../TableNode'

// ─── Geometry primitives ────────────────────────────────────────

export interface Position {
    x: number
    y: number
}

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export interface Dimensions {
    width: number
    height: number
}

// ─── Edge routing primitives ────────────────────────────────────

/** A single point along a routed edge path */
export interface RoutePoint {
    x: number
    y: number
}

/** Complete routed path for one edge */
export interface EdgeRoute {
    edgeId: string
    points: RoutePoint[]
}

/** Combined output of a layout pass */
export interface LayoutResult {
    positions: Map<string, Position>
    edgeRoutes?: EdgeRoute[]
}

// ─── Schema subset types (mirrors DbmlVisualizer's schema) ─────

export interface DbmlTable {
    name: string
    note: string | null
    fields: TableField[]
}

export interface DbmlRefEndpoint {
    tableName: string
    fieldNames: string[]
    relation: string
}

export interface DbmlRef {
    name: string | null
    endpoints: DbmlRefEndpoint[]
}

// ─── Constants ──────────────────────────────────────────────────

export const FIELD_ROW_HEIGHT = 32
export const HEADER_HEIGHT = 36
export const CHAR_WIDTH = 7.5
export const NODE_MIN_WIDTH = 220
export const NODE_MAX_WIDTH = 420
export const NODE_PADDING = 36 // horizontal padding inside a node

// ─── Detail-level aware helpers ─────────────────────────────────

/** Return only the fields visible at the given detail level */
export function filterFields(fields: TableField[], level: DetailLevel): TableField[] {
    if (level === 'Tables') return []
    if (level === 'Keys') return fields.filter((f) => f.pk || f.name.endsWith('_id') || f.name === 'id')
    return fields
}

/** Estimate pixel width for a list of *visible* fields */
export function estimateTableWidth(fields: TableField[], tableName?: string): number {
    let maxLen = tableName ? tableName.length + 4 : 0
    for (const f of fields) {
        const len = f.name.length + f.type.length + (f.pk ? 4 : 0) + (f.unique ? 8 : 0) + 6
        maxLen = Math.max(maxLen, len)
    }
    return Math.max(NODE_MIN_WIDTH, Math.min(maxLen * CHAR_WIDTH + NODE_PADDING, NODE_MAX_WIDTH))
}

/** Compute the node height for a count of *visible* fields */
export function computeNodeHeight(visibleFieldCount: number): number {
    return HEADER_HEIGHT + visibleFieldCount * FIELD_ROW_HEIGHT
}

/**
 * Detail-level aware node dimensions.
 * This is the single source of truth that all layout algorithms must use.
 */
export function computeNodeDimensions(table: DbmlTable, detailLevel: DetailLevel): Dimensions {
    const visible = filterFields(table.fields, detailLevel)
    return {
        width: estimateTableWidth(visible, table.name),
        height: computeNodeHeight(visible.length),
    }
}

// ─── Graph helpers ──────────────────────────────────────────────

/** Build an undirected adjacency list from refs */
export function buildAdjacencyList(tables: DbmlTable[], refs: DbmlRef[]): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>()
    for (const t of tables) adj.set(t.name, new Set())
    for (const r of refs) {
        if (r.endpoints.length < 2) continue
        const a = r.endpoints[0].tableName
        const b = r.endpoints[1].tableName
        adj.get(a)?.add(b)
        adj.get(b)?.add(a)
    }
    return adj
}

/** Find connected components via BFS */
export function findConnectedComponents(tables: DbmlTable[], refs: DbmlRef[]): DbmlTable[][] {
    const adj = buildAdjacencyList(tables, refs)
    const visited = new Set<string>()
    const components: DbmlTable[][] = []
    const tableMap = new Map(tables.map((t) => [t.name, t]))

    for (const table of tables) {
        if (visited.has(table.name)) continue
        const component: DbmlTable[] = []
        const queue = [table.name]
        visited.add(table.name)

        while (queue.length > 0) {
            const name = queue.shift()!
            component.push(tableMap.get(name)!)
            for (const neighbor of adj.get(name) || []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor)
                    queue.push(neighbor)
                }
            }
        }
        components.push(component)
    }

    return components
}

/** BFS from a start node, returns array of rings (ring 0 = start node) */
export function bfsRings(adj: Map<string, Set<string>>, start: string): string[][] {
    const visited = new Set<string>([start])
    const rings: string[][] = [[start]]
    let frontier = [start]

    while (frontier.length > 0) {
        const nextFrontier: string[] = []
        for (const node of frontier) {
            for (const neighbor of adj.get(node) || []) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor)
                    nextFrontier.push(neighbor)
                }
            }
        }
        if (nextFrontier.length > 0) rings.push(nextFrontier)
        frontier = nextFrontier
    }

    return rings
}

/** All-pairs shortest paths (BFS-based, returns Map keyed "a|b" → distance) */
export function allPairsShortestPaths(tables: DbmlTable[], refs: DbmlRef[]): Map<string, number> {
    const adj = buildAdjacencyList(tables, refs)
    const dist = new Map<string, number>()

    for (const src of tables) {
        const visited = new Map<string, number>([[src.name, 0]])
        const queue = [src.name]

        while (queue.length > 0) {
            const node = queue.shift()!
            const d = visited.get(node)!
            for (const neighbor of adj.get(node) || []) {
                if (!visited.has(neighbor)) {
                    visited.set(neighbor, d + 1)
                    queue.push(neighbor)
                    dist.set(`${src.name}|${neighbor}`, d + 1)
                }
            }
        }
    }

    return dist
}

/** Check whether two axis-aligned rectangles overlap */
export function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
    return !(a.x + a.width + padding <= b.x || b.x + b.width + padding <= a.x || a.y + a.height + padding <= b.y || b.y + b.height + padding <= a.y)
}

/** Compute bounding box of a set of positioned nodes */
export function computeBoundingBox(positions: Map<string, Position>, dims: Map<string, Dimensions>): Rect {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity
    positions.forEach((pos, name) => {
        const d = dims.get(name)
        if (!d) return
        minX = Math.min(minX, pos.x)
        minY = Math.min(minY, pos.y)
        maxX = Math.max(maxX, pos.x + d.width)
        maxY = Math.max(maxY, pos.y + d.height)
    })
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
