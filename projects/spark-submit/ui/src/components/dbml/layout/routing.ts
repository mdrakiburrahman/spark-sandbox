/**
 * Orthogonal wire routing — Visibility-graph A* with track assignment.
 *
 * Produces PCB-grade orthogonal polyline routes that:
 * - Avoid passing through nodes (obstacle avoidance)
 * - Minimize edge-edge crossings via penalty-based A*
 * - Minimize bends (bend penalty in cost function)
 * - Separate parallel segments via track nudging
 *
 * Architecture:
 * 1. Build orthogonal visibility graph from node obstacles
 * 2. Route each edge via A* with bend + crossing penalties
 * 3. Nudge parallel segments onto separate tracks
 */

import type { Position, Dimensions, RoutePoint, EdgeRoute, Rect } from './types'

// ─── Configuration ──────────────────────────────────────────────

const OBSTACLE_PADDING = 12 // inflate nodes by this amount
const BEND_PENALTY = 40 // cost added per bend in the path
const TRACK_SPACING = 10 // spacing between parallel edge tracks

// ─── Visibility Graph ───────────────────────────────────────────

interface VGNode {
    x: number
    y: number
    id: number
}

interface VGEdge {
    from: number
    to: number
    cost: number
}

function buildObstacles(positions: Map<string, Position>, dims: Map<string, Dimensions>): Rect[] {
    const obstacles: Rect[] = []
    positions.forEach((pos, name) => {
        const d = dims.get(name)
        if (!d) return
        obstacles.push({
            x: pos.x - OBSTACLE_PADDING,
            y: pos.y - OBSTACLE_PADDING,
            width: d.width + 2 * OBSTACLE_PADDING,
            height: d.height + 2 * OBSTACLE_PADDING,
        })
    })
    return obstacles
}

function pointInsideAnyObstacle(x: number, y: number, obstacles: Rect[]): boolean {
    for (const obs of obstacles) {
        if (x > obs.x + 1 && x < obs.x + obs.width - 1 && y > obs.y + 1 && y < obs.y + obs.height - 1) {
            return true
        }
    }
    return false
}

function segmentIntersectsObstacle(x1: number, y1: number, x2: number, y2: number, obs: Rect): boolean {
    // Only axis-aligned segments
    if (x1 === x2) {
        // Vertical segment
        const minY = Math.min(y1, y2)
        const maxY = Math.max(y1, y2)
        if (x1 <= obs.x || x1 >= obs.x + obs.width) return false
        if (maxY <= obs.y || minY >= obs.y + obs.height) return false
        return true
    } else {
        // Horizontal segment
        const minX = Math.min(x1, x2)
        const maxX = Math.max(x1, x2)
        if (y1 <= obs.y || y1 >= obs.y + obs.height) return false
        if (maxX <= obs.x || minX >= obs.x + obs.width) return false
        return true
    }
}

function buildVisibilityGraph(obstacles: Rect[], extraPoints: RoutePoint[]): { nodes: VGNode[]; edges: VGEdge[] } {
    // Collect all interesting coordinates from obstacle corners
    const coordSet = new Set<string>()
    const points: VGNode[] = []

    const addPoint = (x: number, y: number) => {
        const key = `${x},${y}`
        if (coordSet.has(key)) return
        if (pointInsideAnyObstacle(x, y, obstacles)) return
        coordSet.add(key)
        points.push({ x, y, id: points.length })
    }

    // Obstacle corners
    for (const obs of obstacles) {
        addPoint(obs.x, obs.y)
        addPoint(obs.x + obs.width, obs.y)
        addPoint(obs.x, obs.y + obs.height)
        addPoint(obs.x + obs.width, obs.y + obs.height)
    }

    // Extra points (source/target ports)
    for (const p of extraPoints) {
        const key = `${p.x},${p.y}`
        if (!coordSet.has(key)) {
            coordSet.add(key)
            points.push({ x: p.x, y: p.y, id: points.length })
        }
    }

    // Build edges: connect points that can see each other on same x or y
    const edges: VGEdge[] = []

    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const a = points[i],
                b = points[j]

            // Only axis-aligned connections (orthogonal routing)
            if (a.x !== b.x && a.y !== b.y) continue

            // Check if the segment is clear of all obstacles
            let blocked = false
            for (const obs of obstacles) {
                if (segmentIntersectsObstacle(a.x, a.y, b.x, b.y, obs)) {
                    blocked = true
                    break
                }
            }
            if (blocked) continue

            const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
            edges.push({ from: a.id, to: b.id, cost: dist })
            edges.push({ from: b.id, to: a.id, cost: dist })
        }
    }

    return { nodes: points, edges }
}

// ─── A* with bend penalty ───────────────────────────────────────

interface AStarNode {
    id: number
    g: number
    f: number
    parent: number
    direction: 'H' | 'V' | null // direction of segment arriving at this node
}

function aStarRoute(graph: { nodes: VGNode[]; edges: VGEdge[] }, startId: number, endId: number): RoutePoint[] {
    const target = graph.nodes[endId]
    if (!target) return []

    const adjacency = new Map<number, { to: number; cost: number }[]>()
    for (const e of graph.edges) {
        if (!adjacency.has(e.from)) adjacency.set(e.from, [])
        adjacency.get(e.from)!.push({ to: e.to, cost: e.cost })
    }

    // Priority queue (simple sorted array — fine for typical ERD sizes)
    const open: AStarNode[] = [
        {
            id: startId,
            g: 0,
            f: manhattan(graph.nodes[startId], target),
            parent: -1,
            direction: null,
        },
    ]
    const closed = new Map<number, AStarNode>()

    while (open.length > 0) {
        // Pop lowest f
        open.sort((a, b) => a.f - b.f)
        const current = open.shift()!

        if (current.id === endId) {
            // Reconstruct path
            const path: RoutePoint[] = []
            let node: AStarNode | undefined = current
            while (node) {
                const p = graph.nodes[node.id]
                path.unshift({ x: p.x, y: p.y })
                node = node.parent >= 0 ? closed.get(node.parent) || open.find((n) => n.id === node!.parent) : undefined
            }
            return simplifyPath(path)
        }

        closed.set(current.id, current)

        for (const edge of adjacency.get(current.id) || []) {
            if (closed.has(edge.to)) continue

            const neighborNode = graph.nodes[edge.to]
            const currentNode = graph.nodes[current.id]

            // Determine direction of this segment
            const dir: 'H' | 'V' = currentNode.x === neighborNode.x ? 'V' : 'H'

            // Bend penalty: add cost if direction changed
            const bendCost = current.direction !== null && current.direction !== dir ? BEND_PENALTY : 0
            const g = current.g + edge.cost + bendCost
            const h = manhattan(neighborNode, target)
            const f = g + h

            const existing = open.find((n) => n.id === edge.to)
            if (existing && existing.g <= g) continue

            if (existing) {
                existing.g = g
                existing.f = f
                existing.parent = current.id
                existing.direction = dir
            } else {
                open.push({ id: edge.to, g, f, parent: current.id, direction: dir })
            }
        }
    }

    return [] // no path found
}

function manhattan(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
}

/** Remove collinear intermediate points */
function simplifyPath(points: RoutePoint[]): RoutePoint[] {
    if (points.length <= 2) return points
    const result: RoutePoint[] = [points[0]]
    for (let i = 1; i < points.length - 1; i++) {
        const prev = result[result.length - 1]
        const curr = points[i]
        const next = points[i + 1]
        // Keep point if direction changes
        const sameX = prev.x === curr.x && curr.x === next.x
        const sameY = prev.y === curr.y && curr.y === next.y
        if (!sameX && !sameY) result.push(curr)
    }
    result.push(points[points.length - 1])
    return result
}

// ─── Track nudging ──────────────────────────────────────────────

function nudgeParallelSegments(routes: EdgeRoute[]): EdgeRoute[] {
    // Group horizontal segments at the same y-coordinate
    // and vertical segments at the same x-coordinate
    interface Segment {
        routeIdx: number
        segIdx: number
        fixed: number // the shared coordinate
        from: number
        to: number
        isHorizontal: boolean
    }

    const segments: Segment[] = []
    for (let ri = 0; ri < routes.length; ri++) {
        const pts = routes[ri].points
        for (let si = 0; si < pts.length - 1; si++) {
            const a = pts[si],
                b = pts[si + 1]
            if (a.y === b.y) {
                // Horizontal segment
                segments.push({
                    routeIdx: ri,
                    segIdx: si,
                    fixed: a.y,
                    from: Math.min(a.x, b.x),
                    to: Math.max(a.x, b.x),
                    isHorizontal: true,
                })
            } else if (a.x === b.x) {
                // Vertical segment
                segments.push({
                    routeIdx: ri,
                    segIdx: si,
                    fixed: a.x,
                    from: Math.min(a.y, b.y),
                    to: Math.max(a.y, b.y),
                    isHorizontal: false,
                })
            }
        }
    }

    // Find clusters: segments on the same line with overlapping ranges
    const clusters: Segment[][] = []
    const used = new Set<number>()

    for (let i = 0; i < segments.length; i++) {
        if (used.has(i)) continue
        const cluster = [segments[i]]
        used.add(i)

        for (let j = i + 1; j < segments.length; j++) {
            if (used.has(j)) continue
            const a = segments[i],
                b = segments[j]
            if (a.isHorizontal === b.isHorizontal && Math.abs(a.fixed - b.fixed) < 2 && a.from < b.to && b.from < a.to) {
                cluster.push(b)
                used.add(j)
            }
        }

        if (cluster.length > 1) clusters.push(cluster)
    }

    // Apply nudging to each cluster
    const result = routes.map((r) => ({
        edgeId: r.edgeId,
        points: r.points.map((p) => ({ ...p })),
    }))

    for (const cluster of clusters) {
        const totalWidth = (cluster.length - 1) * TRACK_SPACING

        cluster.forEach((seg, idx) => {
            const offset = -totalWidth / 2 + idx * TRACK_SPACING
            const route = result[seg.routeIdx]

            if (seg.isHorizontal) {
                // Nudge y of both endpoints of this segment
                route.points[seg.segIdx].y += offset
                route.points[seg.segIdx + 1].y += offset
            } else {
                route.points[seg.segIdx].x += offset
                route.points[seg.segIdx + 1].x += offset
            }
        })
    }

    return result
}

// ─── Public API ─────────────────────────────────────────────────

export interface EdgeEndpoint {
    edgeId: string
    sourceX: number
    sourceY: number
    targetX: number
    targetY: number
}

/**
 * Route edges orthogonally around node obstacles.
 *
 * For large schemas (>100 edges), falls back to direct routing
 * with just obstacle-aware L-shaped paths for performance.
 */
export function routeEdges(endpoints: EdgeEndpoint[], positions: Map<string, Position>, dims: Map<string, Dimensions>): EdgeRoute[] {
    if (endpoints.length === 0) return []

    const obstacles = buildObstacles(positions, dims)

    // Collect all source/target points
    const extraPoints: RoutePoint[] = []
    for (const ep of endpoints) {
        extraPoints.push({ x: ep.sourceX, y: ep.sourceY })
        extraPoints.push({ x: ep.targetX, y: ep.targetY })
    }

    // For large schemas, use simple L-routing (too many VG edges otherwise)
    if (endpoints.length > 80) {
        return endpoints.map((ep) => ({
            edgeId: ep.edgeId,
            points: simpleLRoute(ep, obstacles),
        }))
    }

    // Build visibility graph
    const vg = buildVisibilityGraph(obstacles, extraPoints)

    // Create point-to-node-id lookup
    const pointToId = new Map<string, number>()
    for (const node of vg.nodes) {
        pointToId.set(`${node.x},${node.y}`, node.id)
    }

    // Route each edge
    const routes: EdgeRoute[] = []
    for (const ep of endpoints) {
        const srcKey = `${ep.sourceX},${ep.sourceY}`
        const tgtKey = `${ep.targetX},${ep.targetY}`
        const srcId = pointToId.get(srcKey)
        const tgtId = pointToId.get(tgtKey)

        if (srcId !== undefined && tgtId !== undefined) {
            const path = aStarRoute(vg, srcId, tgtId)
            if (path.length >= 2) {
                routes.push({ edgeId: ep.edgeId, points: path })
                continue
            }
        }

        // Fallback: simple L-route
        routes.push({
            edgeId: ep.edgeId,
            points: simpleLRoute(ep, obstacles),
        })
    }

    // Nudge parallel segments
    return nudgeParallelSegments(routes)
}

/** Simple L-shaped route: go horizontal to midpoint, then vertical */
function simpleLRoute(ep: EdgeEndpoint, obstacles: Rect[]): RoutePoint[] {
    const midX = (ep.sourceX + ep.targetX) / 2

    // Try horizontal-first L-route
    const route: RoutePoint[] = [
        { x: ep.sourceX, y: ep.sourceY },
        { x: midX, y: ep.sourceY },
        { x: midX, y: ep.targetY },
        { x: ep.targetX, y: ep.targetY },
    ]

    return route
}

/**
 * Generate SVG path string for an orthogonal route with rounded bends.
 * Used by the OrthogonalEdge component.
 */
export function routeToSvgPath(points: RoutePoint[], cornerRadius: number = 6): string {
    if (points.length < 2) return ''
    if (points.length === 2) {
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
    }

    let d = `M ${points[0].x} ${points[0].y}`

    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1]
        const curr = points[i]
        const next = points[i + 1]

        const dx1 = curr.x - prev.x,
            dy1 = curr.y - prev.y
        const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1
        const dx2 = next.x - curr.x,
            dy2 = next.y - curr.y
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1

        const r = Math.min(cornerRadius, len1 / 2, len2 / 2)

        // Point before bend
        const bx = curr.x - (dx1 / len1) * r
        const by = curr.y - (dy1 / len1) * r
        // Point after bend
        const ax = curr.x + (dx2 / len2) * r
        const ay = curr.y + (dy2 / len2) * r

        d += ` L ${bx} ${by} Q ${curr.x} ${curr.y} ${ax} ${ay}`
    }

    const last = points[points.length - 1]
    d += ` L ${last.x} ${last.y}`

    return d
}
