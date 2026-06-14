/**
 * Custom orthogonal edge component for React Flow.
 * Renders routed polylines with rounded corners at bends,
 * producing a clean PCB-trace aesthetic.
 *
 * When route data is available (via edge data.routePoints),
 * renders the precomputed orthogonal path.
 * Otherwise falls back to a smooth step edge.
 */

'use client'

import React from 'react'
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { routeToSvgPath } from './layout/routing'
import type { RoutePoint } from './layout/types'

const CORNER_RADIUS = 6

export interface OrthogonalEdgeData {
    routePoints?: RoutePoint[]
    [key: string]: unknown
}

function OrthogonalEdge({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    markerStart,
    label,
    labelStyle,
    labelBgStyle,
    labelBgPadding,
    labelBgBorderRadius,
    data,
}: EdgeProps) {
    const routePoints = (data as OrthogonalEdgeData)?.routePoints

    if (routePoints && routePoints.length >= 2) {
        const pathD = routeToSvgPath(routePoints, CORNER_RADIUS)

        // Compute label position at midpoint of the route
        const midIdx = Math.floor(routePoints.length / 2)
        const labelX = routePoints[midIdx]?.x ?? (sourceX + targetX) / 2
        const labelY = routePoints[midIdx]?.y ?? (sourceY + targetY) / 2

        return (
            <>
                <path id={id} className="react-flow__edge-path" d={pathD} fill="none" style={style} markerEnd={markerEnd} markerStart={markerStart} />
                {label && (
                    <foreignObject width={60} height={20} x={labelX - 30} y={labelY - 10} requiredExtensions="http://www.w3.org/1999/xhtml">
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                width: '100%',
                                height: '100%',
                                ...((labelBgStyle as React.CSSProperties) || {}),
                                borderRadius: labelBgBorderRadius ?? 2,
                                padding: labelBgPadding ? `${(labelBgPadding as [number, number])[1]}px ${(labelBgPadding as [number, number])[0]}px` : '2px 4px',
                            }}
                        >
                            <span style={labelStyle as React.CSSProperties}>{label as string}</span>
                        </div>
                    </foreignObject>
                )}
            </>
        )
    }

    // Fallback to smooth step
    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        targetX,
        targetY,
        sourcePosition,
        targetPosition,
    })

    return (
        <BaseEdge
            id={id}
            path={edgePath}
            style={style}
            markerEnd={markerEnd}
            markerStart={markerStart}
            label={label}
            labelStyle={labelStyle}
            labelBgStyle={labelBgStyle}
            labelBgPadding={labelBgPadding}
            labelBgBorderRadius={labelBgBorderRadius}
            labelX={labelX}
            labelY={labelY}
        />
    )
}

export default React.memo(OrthogonalEdge)
