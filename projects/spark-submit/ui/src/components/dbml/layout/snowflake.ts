/**
 * Snowflake layout — Stress majorization + radial BFS.
 *
 * Strategy per detail level:
 *   All:    Stress majorization seeded with radial placement, overlap removal
 *   Keys:   Stress majorization with tighter ideal edge lengths
 *   Tables: Pure radial BFS layout (concentric rings, most-connected at center)
 *
 * The stress majorization approach preserves graph-theoretic distances:
 * tables that are many hops apart end up proportionally far apart,
 * naturally producing the "snowflake" pattern for star schemas.
 */

import type { DetailLevel } from '../TableNode'
import { type DbmlTable, type DbmlRef, type Position, type Dimensions, computeNodeDimensions, buildAdjacencyList, bfsRings, allPairsShortestPaths } from './types'

// ─── Configuration ──────────────────────────────────────────────

function idealEdgeLength(level: DetailLevel): number {
    switch (level) {
        case 'All':
            return 300
        case 'Keys':
            return 200
        case 'Tables':
            return 120
    }
}

function iterationsForDetail(level: DetailLevel): number {
    switch (level) {
        case 'All':
            return 150
        case 'Keys':
            return 120
        case 'Tables':
            return 80
    }
}

// ─── Radial BFS Layout ─────────────────────────────────────────

function layoutRadial(tables: DbmlTable[], refs: DbmlRef[], dims: Map<string, Dimensions>, ringSpacing: number): Map<string, Position> {
    if (tables.length === 0) return new Map()

    const adj = buildAdjacencyList(tables, refs)

    // Find center: node with highest degree
    let centerName = tables[0].name
    let maxDeg = 0
    for (const [name, neighbors] of adj) {
        if (neighbors.size > maxDeg) {
            maxDeg = neighbors.size
            centerName = name
        }
    }

    const rings = bfsRings(adj, centerName)
    const positions = new Map<string, Position>()

    // Place center at origin
    positions.set(centerName, { x: 0, y: 0 })

    // Place each ring concentrically
    for (let r = 1; r < rings.length; r++) {
        const nodes = rings[r]
        const radius = r * ringSpacing

        // Order nodes within ring by their parent's angle for crossing reduction
        const ordered = nodes.sort((a, b) => {
            // Find parent angle for each node
            const aParentAngle = getParentAngle(a, adj, positions)
            const bParentAngle = getParentAngle(b, adj, positions)
            return aParentAngle - bParentAngle
        })

        const angleStep = (2 * Math.PI) / ordered.length
        ordered.forEach((name, idx) => {
            // Offset by -π/2 so first node is at top
            const angle = idx * angleStep - Math.PI / 2
            positions.set(name, {
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
            })
        })
    }

    // Handle disconnected nodes (no edges at all)
    let offsetX = 0
    for (const t of tables) {
        if (!positions.has(t.name)) {
            const d = dims.get(t.name)!
            positions.set(t.name, { x: offsetX, y: (rings.length + 1) * ringSpacing })
            offsetX += d.width + 40
        }
    }

    return positions
}

function getParentAngle(node: string, adj: Map<string, Set<string>>, positions: Map<string, Position>): number {
    // Find already-placed neighbor closest to this node (its "parent" in BFS)
    for (const neighbor of adj.get(node) || []) {
        const pos = positions.get(neighbor)
        if (pos) return Math.atan2(pos.y, pos.x)
    }
    return 0
}

// ─── Overlap Removal ────────────────────────────────────────────

function removeOverlaps(positions: Map<string, Position>, dims: Map<string, Dimensions>, padding: number = 20): void {
    const names = [...positions.keys()]
    const maxIter = 50

    for (let iter = 0; iter < maxIter; iter++) {
        let moved = false
        for (let i = 0; i < names.length; i++) {
            for (let j = i + 1; j < names.length; j++) {
                const a = names[i],
                    b = names[j]
                const pa = positions.get(a)!,
                    pb = positions.get(b)!
                const da = dims.get(a)!,
                    db = dims.get(b)!

                // Check overlap
                const overlapX = pa.x + da.width + padding - pb.x
                const overlapY = pa.y + da.height + padding - pb.y
                const overlapXr = pb.x + db.width + padding - pa.x
                const overlapYr = pb.y + db.height + padding - pa.y

                if (overlapX > 0 && overlapXr > 0 && overlapY > 0 && overlapYr > 0) {
                    // There is overlap — push apart along the axis of minimum overlap
                    const minOverlapX = Math.min(overlapX, overlapXr)
                    const minOverlapY = Math.min(overlapY, overlapYr)

                    if (minOverlapX < minOverlapY) {
                        const push = minOverlapX / 2 + 1
                        if (pa.x <= pb.x) {
                            pa.x -= push
                            pb.x += push
                        } else {
                            pa.x += push
                            pb.x -= push
                        }
                    } else {
                        const push = minOverlapY / 2 + 1
                        if (pa.y <= pb.y) {
                            pa.y -= push
                            pb.y += push
                        } else {
                            pa.y += push
                            pb.y -= push
                        }
                    }
                    moved = true
                }
            }
        }
        if (!moved) break
    }
}

// ─── Stress Majorization ────────────────────────────────────────

function layoutStressMajorization(tables: DbmlTable[], refs: DbmlRef[], dims: Map<string, Dimensions>, detailLevel: DetailLevel): Map<string, Position> {
    if (tables.length <= 1) {
        const positions = new Map<string, Position>()
        if (tables.length === 1) positions.set(tables[0].name, { x: 0, y: 0 })
        return positions
    }

    const edgeLen = idealEdgeLength(detailLevel)
    const iterations = iterationsForDetail(detailLevel)

    // Compute all-pairs shortest paths
    const dist = allPairsShortestPaths(tables, refs)

    // Seed with radial layout for good initial placement
    let positions = layoutRadial(tables, refs, dims, edgeLen)

    // Stress majorization iterations
    for (let iter = 0; iter < iterations; iter++) {
        const newPositions = new Map<string, Position>()

        for (const t of tables) {
            let wx = 0,
                wy = 0,
                wSum = 0
            const pi = positions.get(t.name)!

            for (const u of tables) {
                if (t.name === u.name) continue

                const dij = dist.get(`${t.name}|${u.name}`)
                if (dij === undefined) continue // disconnected

                const wij = 1 / (dij * dij)
                const pj = positions.get(u.name)!
                const dx = pi.x - pj.x
                const dy = pi.y - pj.y
                const currentDist = Math.sqrt(dx * dx + dy * dy) || 1

                const idealDist = dij * edgeLen

                wx += wij * (pj.x + (dx / currentDist) * idealDist)
                wy += wij * (pj.y + (dy / currentDist) * idealDist)
                wSum += wij
            }

            if (wSum > 0) {
                newPositions.set(t.name, { x: wx / wSum, y: wy / wSum })
            } else {
                newPositions.set(t.name, { ...pi })
            }
        }

        positions = newPositions
    }

    // Overlap removal pass
    removeOverlaps(positions, dims, detailLevel === 'All' ? 30 : 20)

    return positions
}

// ─── Public API ─────────────────────────────────────────────────

export function layoutSnowflake(tables: DbmlTable[], refs: DbmlRef[], detailLevel: DetailLevel): Map<string, Position> {
    if (tables.length === 0) return new Map()

    const dims = new Map<string, Dimensions>()
    for (const t of tables) dims.set(t.name, computeNodeDimensions(t, detailLevel))

    if (detailLevel === 'Tables') {
        // Pure radial for table-names-only mode
        return layoutRadial(tables, refs, dims, idealEdgeLength(detailLevel))
    }

    // Stress majorization for All / Keys
    return layoutStressMajorization(tables, refs, dims, detailLevel)
}
