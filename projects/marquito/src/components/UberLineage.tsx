'use client';

import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
  NodeProps,
  useReactFlow,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useThemeContext } from './ThemeProvider';
import { UberLineage as UberLineageType, DeltaCommitEntry } from '@/lib/livy/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UberLineageProps {
  lineage: UberLineageType;
  commits?: Map<string, DeltaCommitEntry[]>;
}

// ---------------------------------------------------------------------------
// Role-based colors
// ---------------------------------------------------------------------------

const NODE_COLOR = { bg: '#0078D4', border: '#005A9E' };

// ---------------------------------------------------------------------------
// Simple table node — role-colored card
// ---------------------------------------------------------------------------

function TableNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    fqn: string;
    bgColor: string;
    borderColor: string;
    role: string;
  };

  return (
    <div
      style={{
        backgroundColor: d.bgColor,
        color: '#FFFFFF',
        border: `2px solid ${d.borderColor}`,
        borderRadius: '6px',
        padding: '8px 12px',
        fontSize: '10px',
        fontFamily: "'Cascadia Code', monospace",
        fontWeight: 600,
        textAlign: 'center',
        lineHeight: '1.3',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        width: NODE_WIDTH,
        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.2))',
      }}
      title={d.fqn}
    >
      <Handle type="target" position={Position.Left} style={{ visibility: 'hidden' }} />
      {d.label}
      <Handle type="source" position={Position.Right} style={{ visibility: 'hidden' }} />
    </div>
  );
}

const nodeTypes = { tableNode: TableNode };

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;
const STANDALONE_COLS = 5;
const STANDALONE_GAP_X = 20;
const STANDALONE_GAP_Y = 16;

function buildGraph(
  lineage: UberLineageType,
  isDark: boolean
): { nodes: Node[]; edges: Edge[] } {
  const connected = lineage.datasets.filter((ds) => ds.role !== 'standalone');
  const standalone = lineage.datasets.filter((ds) => ds.role === 'standalone');
  const connectedFqns = new Set(connected.map((ds) => ds.fqn));

  // Dagre layout for connected nodes
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 120 });

  for (const ds of connected) {
    g.setNode(ds.fqn, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of lineage.edges) {
    if (connectedFqns.has(edge.source) && connectedFqns.has(edge.target)) {
      g.setEdge(edge.source, edge.target);
    }
  }
  if (connected.length > 0) dagre.layout(g);

  let maxY = 0;
  for (const ds of connected) {
    const n = g.node(ds.fqn);
    if (n) maxY = Math.max(maxY, n.y + NODE_HEIGHT / 2);
  }

  const nodes: Node[] = [];

  for (const ds of connected) {
    const n = g.node(ds.fqn);
    const colors = NODE_COLOR;
    nodes.push({
      id: ds.fqn,
      type: 'tableNode',
      position: { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 },
      data: { label: ds.fqn, fqn: ds.fqn, bgColor: colors.bg, borderColor: colors.border, role: ds.role },
    });
  }

  // Standalone nodes: grid below the lineage
  const standaloneStartY = connected.length > 0 ? maxY + 80 : 0;
  standalone.forEach((ds, i) => {
    const col = i % STANDALONE_COLS;
    const row = Math.floor(i / STANDALONE_COLS);
    const colors = NODE_COLOR;
    nodes.push({
      id: ds.fqn,
      type: 'tableNode',
      position: {
        x: col * (NODE_WIDTH + STANDALONE_GAP_X),
        y: standaloneStartY + row * (NODE_HEIGHT + STANDALONE_GAP_Y),
      },
      data: { label: ds.fqn, fqn: ds.fqn, bgColor: colors.bg, borderColor: colors.border, role: ds.role },
    });
  });

  // Only include edges where both endpoints exist
  const allNodeIds = new Set(nodes.map((n) => n.id));
  const edges: Edge[] = lineage.edges
    .filter((edge) => allNodeIds.has(edge.source) && allNodeIds.has(edge.target))
    .map((edge, i) => ({
      id: `e-${i}`,
      source: edge.source,
      target: edge.target,
      animated: true,
      style: { stroke: isDark ? '#605E5C' : '#A19F9D', strokeWidth: 1.5 },
    }));

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// Spread-to-fit: rescale node positions to fill the viewport, then fitView
// ---------------------------------------------------------------------------

function SpreadFitButton() {
  const { getNodes, setNodes, fitView } = useReactFlow();
  const { isDark } = useThemeContext();

  const handleSpread = useCallback(() => {
    const nodes = getNodes();
    if (nodes.length < 2) { fitView({ padding: 0.15, duration: 300 }); return; }

    // Get current bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.position.y + NODE_HEIGHT);
    }
    const curW = maxX - minX || 1;
    const curH = maxY - minY || 1;

    // Target canvas: generous spread (scale up by 2x for breathing room)
    const targetW = Math.max(curW * 2, nodes.length * (NODE_WIDTH + 30));
    const targetH = Math.max(curH * 2, 600);

    const scaleX = targetW / curW;
    const scaleY = targetH / curH;

    setNodes(nodes.map((n) => ({
      ...n,
      position: {
        x: (n.position.x - minX) * scaleX,
        y: (n.position.y - minY) * scaleY,
      },
    })));

    setTimeout(() => fitView({ padding: 0.08, duration: 300 }), 50);
  }, [getNodes, setNodes, fitView]);

  return (
    <button
      onClick={handleSpread}
      title="Spread nodes to fill canvas"
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 5,
        padding: '6px 12px',
        fontSize: '11px',
        fontFamily: "'Segoe UI', sans-serif",
        fontWeight: 600,
        backgroundColor: isDark ? '#252423' : '#FFFFFF',
        color: isDark ? '#D2D0CE' : '#323130',
        border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
        borderRadius: '4px',
        cursor: 'pointer',
      }}
    >
      ⊞ Spread &amp; Fit
    </button>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const UberLineage = ({ lineage }: UberLineageProps) => {
  const { isDark } = useThemeContext();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (lineage.datasets.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }
    const { nodes, edges } = buildGraph(lineage, isDark);
    return { initialNodes: nodes, initialEdges: edges };
  }, [lineage, isDark]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync state when lineage data changes (useNodesState/useEdgesState only use initial value)
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onInit = useCallback((instance: { fitView: () => void }) => {
    instance.fitView();
  }, []);

  if (lineage.datasets.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: '13px', color: isDark ? '#605E5C' : '#A19F9D', fontFamily: "'Segoe UI', sans-serif" }}>
        No lineage data available. OpenLineage telemetry table not found.
      </div>
    );
  }

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color={isDark ? '#323130' : '#EDEBE9'} gap={16} />
        <Controls
          style={{
            backgroundColor: isDark ? '#252423' : '#FFFFFF',
            border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
            borderRadius: '4px',
          }}
        />
        <SpreadFitButton />
      </ReactFlow>
    </div>
  );
};

export default UberLineage;
