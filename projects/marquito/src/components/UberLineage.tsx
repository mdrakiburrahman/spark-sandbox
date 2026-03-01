'use client';

import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useThemeContext } from './ThemeProvider';
import { UberLineage as UberLineageType } from '@/lib/livy/types';

interface UberLineageProps {
  lineage: UberLineageType;
}

const ROLE_COLORS: Record<string, { bg: string; border: string }> = {
  source: { bg: '#107C10', border: '#0B5A0B' },
  intermediate: { bg: '#F2C811', border: '#C4A000' },
  target: { bg: '#D83B01', border: '#A52B00' },
  standalone: { bg: '#A19F9D', border: '#797775' },
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;

function buildGraph(lineage: UberLineageType, isDark: boolean): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 30, ranksep: 80 });

  for (const ds of lineage.datasets) {
    g.setNode(ds.fqn, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of lineage.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const nodes: Node[] = lineage.datasets.map((ds) => {
    const nodeData = g.node(ds.fqn);
    const colors = ROLE_COLORS[ds.role] ?? ROLE_COLORS.standalone;
    return {
      id: ds.fqn,
      position: { x: nodeData.x - NODE_WIDTH / 2, y: nodeData.y - NODE_HEIGHT / 2 },
      data: { label: ds.fqn },
      style: {
        backgroundColor: colors.bg,
        color: '#FFFFFF',
        border: `2px solid ${colors.border}`,
        borderRadius: '6px',
        fontSize: '11px',
        fontFamily: "'Cascadia Code', monospace",
        fontWeight: 600,
        padding: '8px 12px',
        width: NODE_WIDTH,
        textAlign: 'center' as const,
      },
    };
  });

  const edges: Edge[] = lineage.edges.map((edge, i) => ({
    id: `e-${i}`,
    source: edge.source,
    target: edge.target,
    animated: true,
    style: { stroke: isDark ? '#605E5C' : '#A19F9D', strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

const UberLineage = ({ lineage }: UberLineageProps) => {
  const { isDark } = useThemeContext();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (lineage.datasets.length === 0) {
      return { initialNodes: [], initialEdges: [] };
    }
    const { nodes, edges } = buildGraph(lineage, isDark);
    return { initialNodes: nodes, initialEdges: edges };
  }, [lineage, isDark]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

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
    <div style={{ height: '500px', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onInit={onInit}
        connectionMode={ConnectionMode.Loose}
        fitView
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
      </ReactFlow>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', padding: '8px 16px', fontSize: '11px', fontFamily: "'Segoe UI', sans-serif" }}>
        {Object.entries(ROLE_COLORS).map(([role, colors]) => (
          <div key={role} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: colors.bg }} />
            <span style={{ color: isDark ? '#A19F9D' : '#605E5C', textTransform: 'capitalize' }}>{role}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UberLineage;
