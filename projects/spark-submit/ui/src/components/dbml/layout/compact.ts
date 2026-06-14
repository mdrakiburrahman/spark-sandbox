/**
 * Compact layout — MaxRects bin packing with connectivity awareness.
 *
 * Strategy per detail level:
 *   All:    MaxRects with routing-channel gaps, connectivity grouping
 *   Keys:   MaxRects with medium gaps, connectivity grouping
 *   Tables: Skyline packing (uniform height → optimal row packing)
 *
 * Algorithm overview:
 * 1. Detect connected components via BFS
 * 2. Within each component: BFS traversal from most-connected node,
 *    place each table adjacent to its already-placed neighbors
 * 3. Pack component bounding boxes via MaxRects (Contact Point heuristic)
 * 4. For Tables mode: use Skyline packing (all nodes same height)
 */

import type { DetailLevel } from '../TableNode'
import { type DbmlTable, type DbmlRef, type Position, type Dimensions, type Rect, computeNodeDimensions, buildAdjacencyList, findConnectedComponents, computeBoundingBox } from './types'

// ─── Gap configuration per detail level ─────────────────────────

function gapForDetail(level: DetailLevel): { colGap: number; rowGap: number } {
    switch (level) {
        case 'All':
            return { colGap: 60, rowGap: 40 }
        case 'Keys':
            return { colGap: 40, rowGap: 30 }
        case 'Tables':
            return { colGap: 24, rowGap: 16 }
    }
}

// ─── MaxRects Bin Packer ────────────────────────────────────────

interface FreeRect extends Rect {}

class MaxRectsPacker {
    private freeRects: FreeRect[]
    private placed: Rect[] = []
    private growable: boolean

    constructor(width: number, height: number, growable = true) {
        this.freeRects = [{ x: 0, y: 0, width, height }]
        this.growable = growable
    }

    /** Insert a rectangle using Contact-Point scoring */
    insert(w: number, h: number): Position | null {
        let bestScore = -1
        let bestPos: Position | null = null

        for (const free of this.freeRects) {
            if (w <= free.width && h <= free.height) {
                const score = this.contactPointScore(free.x, free.y, w, h)
                if (score > bestScore) {
                    bestScore = score
                    bestPos = { x: free.x, y: free.y }
                }
            }
        }

        // If nothing fit and we can grow, expand the bin
        if (!bestPos && this.growable) {
            const maxX = Math.max(0, ...this.freeRects.map((r) => r.x + r.width))
            const maxY = Math.max(0, ...this.freeRects.map((r) => r.y + r.height))
            // Grow in the shorter dimension to keep aspect ratio
            if (maxX <= maxY) {
                this.freeRects.push({ x: maxX, y: 0, width: w + 100, height: maxY + h + 100 })
            } else {
                this.freeRects.push({ x: 0, y: maxY, width: maxX + w + 100, height: h + 100 })
            }
            return this.insert(w, h) // retry
        }

        if (bestPos) {
            const placed: Rect = { x: bestPos.x, y: bestPos.y, width: w, height: h }
            this.placed.push(placed)
            this.splitFreeRects(placed)
            this.pruneFreeRects()
        }

        return bestPos
    }

    /** Score: total length of perimeter that touches already-placed items or bin edges */
    private contactPointScore(x: number, y: number, w: number, h: number): number {
        let score = 0
        // Touching left edge of bin
        if (x === 0) score += h
        // Touching top edge of bin
        if (y === 0) score += w

        for (const p of this.placed) {
            // Right edge of placed touches our left edge
            if (Math.abs(p.x + p.width - x) < 1) {
                score += Math.max(0, Math.min(p.y + p.height, y + h) - Math.max(p.y, y))
            }
            // Left edge of placed touches our right edge
            if (Math.abs(p.x - (x + w)) < 1) {
                score += Math.max(0, Math.min(p.y + p.height, y + h) - Math.max(p.y, y))
            }
            // Bottom edge of placed touches our top edge
            if (Math.abs(p.y + p.height - y) < 1) {
                score += Math.max(0, Math.min(p.x + p.width, x + w) - Math.max(p.x, x))
            }
            // Top edge of placed touches our bottom edge
            if (Math.abs(p.y - (y + h)) < 1) {
                score += Math.max(0, Math.min(p.x + p.width, x + w) - Math.max(p.x, x))
            }
        }

        return score
    }

    /** Split overlapping free rects by removing the placed rectangle */
    private splitFreeRects(placed: Rect): void {
        const newFree: FreeRect[] = []

        for (const free of this.freeRects) {
            // No overlap → keep as is
            if (placed.x >= free.x + free.width || placed.x + placed.width <= free.x || placed.y >= free.y + free.height || placed.y + placed.height <= free.y) {
                newFree.push(free)
                continue
            }

            // Left remainder
            if (placed.x > free.x) {
                newFree.push({
                    x: free.x,
                    y: free.y,
                    width: placed.x - free.x,
                    height: free.height,
                })
            }
            // Right remainder
            if (placed.x + placed.width < free.x + free.width) {
                newFree.push({
                    x: placed.x + placed.width,
                    y: free.y,
                    width: free.x + free.width - placed.x - placed.width,
                    height: free.height,
                })
            }
            // Top remainder
            if (placed.y > free.y) {
                newFree.push({
                    x: free.x,
                    y: free.y,
                    width: free.width,
                    height: placed.y - free.y,
                })
            }
            // Bottom remainder
            if (placed.y + placed.height < free.y + free.height) {
                newFree.push({
                    x: free.x,
                    y: placed.y + placed.height,
                    width: free.width,
                    height: free.y + free.height - placed.y - placed.height,
                })
            }
        }

        this.freeRects = newFree
    }

    /** Remove free rects fully contained within another */
    private pruneFreeRects(): void {
        const result: FreeRect[] = []
        for (let i = 0; i < this.freeRects.length; i++) {
            let contained = false
            for (let j = 0; j < this.freeRects.length; j++) {
                if (i === j) continue
                const a = this.freeRects[i]
                const b = this.freeRects[j]
                if (a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height) {
                    contained = true
                    break
                }
            }
            if (!contained) result.push(this.freeRects[i])
        }
        this.freeRects = result
    }
}

// ─── Skyline Packer (uniform-height mode for Tables) ────────────

function skylinePack(items: { name: string; width: number; height: number }[], gap: number): Map<string, Position> {
    // Sort widest first for better packing
    const sorted = [...items].sort((a, b) => b.width - a.width)
    const positions = new Map<string, Position>()

    // Target roughly square aspect ratio
    const totalArea = sorted.reduce((s, i) => s + (i.width + gap) * (i.height + gap), 0)
    const binWidth = Math.max(800, Math.ceil(Math.sqrt(totalArea) * 1.3))

    // Skyline: array of { x, y, width } segments
    let skyline = [{ x: 0, y: 0, width: binWidth }]

    for (const item of sorted) {
        let bestIdx = -1
        let bestY = Infinity
        let bestX = 0

        // Find lowest position where item fits
        for (let i = 0; i < skyline.length; i++) {
            if (skyline[i].width < item.width + gap) continue
            if (skyline[i].y < bestY) {
                bestY = skyline[i].y
                bestX = skyline[i].x
                bestIdx = i
            }
        }

        if (bestIdx === -1) {
            // Doesn't fit on any segment — place at the bottom
            const maxY = Math.max(...skyline.map((s) => s.y))
            bestX = 0
            bestY = maxY
        }

        positions.set(item.name, { x: bestX, y: bestY })

        // Update skyline: raise the segment under this item
        const newSkyline: typeof skyline = []
        for (const seg of skyline) {
            const segEnd = seg.x + seg.width
            const itemEnd = bestX + item.width + gap

            if (segEnd <= bestX || seg.x >= itemEnd) {
                // No overlap
                newSkyline.push(seg)
            } else {
                // Left part
                if (seg.x < bestX) {
                    newSkyline.push({ x: seg.x, y: seg.y, width: bestX - seg.x })
                }
                // Raised part
                newSkyline.push({
                    x: Math.max(seg.x, bestX),
                    y: bestY + item.height + gap,
                    width: Math.min(segEnd, itemEnd) - Math.max(seg.x, bestX),
                })
                // Right part
                if (segEnd > itemEnd) {
                    newSkyline.push({ x: itemEnd, y: seg.y, width: segEnd - itemEnd })
                }
            }
        }
        skyline = newSkyline
    }

    return positions
}

// ─── Within-component layout ────────────────────────────────────

function layoutComponent(component: DbmlTable[], allRefs: DbmlRef[], dims: Map<string, Dimensions>, gap: { colGap: number; rowGap: number }): Map<string, Position> {
    if (component.length === 0) return new Map()
    if (component.length === 1) {
        return new Map([[component[0].name, { x: 0, y: 0 }]])
    }

    const names = new Set(component.map((t) => t.name))
    const adj = buildAdjacencyList(
        component,
        allRefs.filter((r) => r.endpoints.length >= 2 && names.has(r.endpoints[0].tableName) && names.has(r.endpoints[1].tableName))
    )

    // Find most-connected node as start
    let startNode = component[0].name
    let maxDeg = 0
    for (const [name, neighbors] of adj) {
        if (neighbors.size > maxDeg) {
            maxDeg = neighbors.size
            startNode = name
        }
    }

    // BFS traversal order
    const visited = new Set<string>([startNode])
    const order: string[] = [startNode]
    const queue = [startNode]
    while (queue.length > 0) {
        const node = queue.shift()!
        // Sort neighbors by degree (most connected first) for stable layout
        const neighbors = [...(adj.get(node) || [])].sort((a, b) => (adj.get(b)?.size || 0) - (adj.get(a)?.size || 0))
        for (const n of neighbors) {
            if (!visited.has(n)) {
                visited.add(n)
                order.push(n)
                queue.push(n)
            }
        }
    }
    // Add any unvisited (disconnected within component — shouldn't happen)
    for (const t of component) {
        if (!visited.has(t.name)) order.push(t.name)
    }

    // Place using MaxRects, but in BFS order so connected nodes stay close
    const totalArea = component.reduce((s, t) => {
        const d = dims.get(t.name)!
        return s + (d.width + gap.colGap) * (d.height + gap.rowGap)
    }, 0)
    const binSize = Math.max(600, Math.ceil(Math.sqrt(totalArea) * 1.4))
    const packer = new MaxRectsPacker(binSize, binSize, true)

    const positions = new Map<string, Position>()
    for (const name of order) {
        const d = dims.get(name)!
        const pos = packer.insert(d.width + gap.colGap, d.height + gap.rowGap)
        positions.set(name, pos || { x: 0, y: 0 })
    }

    return positions
}

// ─── Public API ─────────────────────────────────────────────────

export function layoutCompact(tables: DbmlTable[], refs: DbmlRef[], detailLevel: DetailLevel): Map<string, Position> {
    if (tables.length === 0) return new Map()

    // Compute detail-level-aware dimensions for every table
    const dims = new Map<string, Dimensions>()
    for (const t of tables) dims.set(t.name, computeNodeDimensions(t, detailLevel))

    const { colGap, rowGap } = gapForDetail(detailLevel)

    // ── Tables mode: uniform height → Skyline packing ───────────
    if (detailLevel === 'Tables') {
        const items = tables.map((t) => {
            const d = dims.get(t.name)!
            return { name: t.name, width: d.width, height: d.height }
        })
        return skylinePack(items, Math.max(colGap, rowGap))
    }

    // ── All / Keys mode: connectivity-aware MaxRects ────────────
    const components = findConnectedComponents(tables, refs)

    if (components.length === 1) {
        return layoutComponent(components[0], refs, dims, { colGap, rowGap })
    }

    // Layout each component internally
    const componentResults: { positions: Map<string, Position>; bbox: Rect }[] = []
    for (const comp of components) {
        const positions = layoutComponent(comp, refs, dims, { colGap, rowGap })
        componentResults.push({
            positions,
            bbox: computeBoundingBox(positions, dims),
        })
    }

    // Sort components by area (largest first) for MaxRects packing
    componentResults.sort((a, b) => {
        const aA = a.bbox.width * a.bbox.height
        const bA = b.bbox.width * b.bbox.height
        return bA - aA
    })

    // Pack component bounding boxes
    const totalArea = componentResults.reduce((s, c) => s + (c.bbox.width + colGap * 2) * (c.bbox.height + rowGap * 2), 0)
    const outerBin = Math.max(800, Math.ceil(Math.sqrt(totalArea) * 1.3))
    const outerPacker = new MaxRectsPacker(outerBin, outerBin, true)

    const finalPositions = new Map<string, Position>()
    for (const comp of componentResults) {
        const padW = comp.bbox.width + colGap * 2
        const padH = comp.bbox.height + rowGap * 2
        const outerPos = outerPacker.insert(padW, padH) || { x: 0, y: 0 }

        // Offset all tables in this component
        const offsetX = outerPos.x + colGap - comp.bbox.x
        const offsetY = outerPos.y + rowGap - comp.bbox.y
        comp.positions.forEach((pos, name) => {
            finalPositions.set(name, { x: pos.x + offsetX, y: pos.y + offsetY })
        })
    }

    return finalPositions
}
