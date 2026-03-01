'use client';

import React, { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
  Position,
  MarkerType,
  Handle,
  NodeProps,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useThemeContext } from './ThemeProvider';
import { UberLineage as UberLineageType, LivyColumnLineageEdge } from '@/lib/livy/types';

interface LivyColumnLineageProps {
  lineage: UberLineageType;
}

// Custom node: dataset card with columns listed inside
function ColumnDatasetNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    columns: string[];
    highlightedColumns: string[];
    selectedColumns: string[];
    hasSelection: boolean;
    isDark: boolean;
    accentColor: string;
    onColumnClick: (dsKey: string, col: string) => void;
    datasetKey: string;
  };

  return (
    <div
      style={{
        backgroundColor: d.isDark ? '#252423' : '#FFFFFF',
        border: `1px solid ${d.isDark ? '#484644' : '#EDEBE9'}`,
        borderLeft: `3px solid ${d.accentColor}`,
        borderRadius: '6px',
        minWidth: '200px',
        fontFamily: "'Segoe UI', sans-serif",
        boxShadow: d.isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
        opacity: d.hasSelection && d.selectedColumns.length === 0 ? 0.4 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${d.isDark ? '#323130' : '#EDEBE9'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill={d.accentColor}>
          <path d="M8 1C4.5 1 2 2.1 2 3.5v9C2 13.9 4.5 15 8 15s6-1.1 6-2.5v-9C14 2.1 11.5 1 8 1zm0 1.5c3 0 4.5.8 4.5 1S11 4.5 8 4.5 3.5 3.7 3.5 3.5 5 2.5 8 2.5z" />
        </svg>
        <span style={{ fontSize: '12px', fontWeight: 600, color: d.isDark ? '#FAF9F8' : '#323130' }} title={d.label}>
          {d.label}
        </span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {d.columns.map((col) => {
          const isSelected = d.selectedColumns.includes(col);
          const isDimmed = d.hasSelection && !isSelected;
          return (
            <div
              key={col}
              onClick={(e) => { e.stopPropagation(); d.onColumnClick(d.datasetKey, col); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 12px',
                fontSize: '11px',
                fontFamily: "monospace",
                cursor: 'pointer',
                color: isSelected ? '#FFFFFF' : isDimmed ? (d.isDark ? '#605E5C' : '#A19F9D') : (d.isDark ? '#A19F9D' : '#605E5C'),
                backgroundColor: isSelected ? '#0078D4' : 'transparent',
                borderRadius: isSelected ? '3px' : '0',
                transition: 'background-color 0.15s, color 0.15s',
                position: 'relative',
              }}
            >
              <Handle type="target" position={Position.Left} id={`${d.label}::${col}::target`}
                style={{ background: isSelected ? '#0078D4' : (d.isDark ? '#484644' : '#C8C6C4'), border: 'none', width: 6, height: 6, left: -3 }} />
              <span style={{ marginLeft: '4px' }}>{col}</span>
              <Handle type="source" position={Position.Right} id={`${d.label}::${col}::source`}
                style={{ background: isSelected ? '#0078D4' : (d.isDark ? '#484644' : '#C8C6C4'), border: 'none', width: 6, height: 6, right: -3 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const nodeTypes = { columnDataset: ColumnDatasetNode };

const ROLE_COLORS: Record<string, string> = {
  source: '#0078D4',
  intermediate: '#F2C811',
  target: '#107C10',
  standalone: '#A19F9D',
};

// Trace upstream/downstream through column edges
function traceColumns(
  dsKey: string, field: string, edges: LivyColumnLineageEdge[], direction: 'up' | 'down' | 'both'
): Set<string> {
  const visited = new Set<string>();
  const queue = [`${dsKey}::${field}`];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const sep1 = cur.indexOf('::');
    const ds = cur.slice(0, sep1);
    const col = cur.slice(sep1 + 2);
    for (const e of edges) {
      if ((direction === 'up' || direction === 'both') && e.targetDataset === ds && e.targetField === col) {
        const k = `${e.sourceDataset}::${e.sourceField}`;
        if (!visited.has(k)) queue.push(k);
      }
      if ((direction === 'down' || direction === 'both') && e.sourceDataset === ds && e.sourceField === col) {
        const k = `${e.targetDataset}::${e.targetField}`;
        if (!visited.has(k)) queue.push(k);
      }
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Spread-to-fit button for column lineage
// ---------------------------------------------------------------------------

function ColSpreadFitButton() {
  const { getNodes, setNodes, fitView } = useReactFlow();
  const { isDark } = useThemeContext();

  const handleSpread = useCallback(() => {
    const nodes = getNodes();
    if (nodes.length < 2) { fitView({ padding: 0.15, duration: 300 }); return; }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const w = (n.measured?.width ?? n.width ?? 200) as number;
      const h = (n.measured?.height ?? n.height ?? 100) as number;
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }
    const curW = maxX - minX || 1;
    const curH = maxY - minY || 1;
    const targetW = Math.max(curW * 2, nodes.length * 250);
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

const LivyColumnLineage = ({ lineage }: LivyColumnLineageProps) => {
  const { isDark } = useThemeContext();
  const [selectedColumn, setSelectedColumn] = useState<{ dsKey: string; field: string } | null>(null);
  const colEdges = lineage.columnEdges;

  // Build dataset → columns map from column edges
  const dsColumnsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of colEdges) {
      if (!map.has(e.sourceDataset)) map.set(e.sourceDataset, new Set());
      map.get(e.sourceDataset)!.add(e.sourceField);
      if (!map.has(e.targetDataset)) map.set(e.targetDataset, new Set());
      map.get(e.targetDataset)!.add(e.targetField);
    }
    return map;
  }, [colEdges]);

  // Resolve role for each dataset in column lineage
  const dsRoles = useMemo(() => {
    const roles = new Map<string, string>();
    for (const ds of lineage.datasets) {
      if (dsColumnsMap.has(ds.fqn)) roles.set(ds.fqn, ds.role);
    }
    // Also check column edge datasets that might not be in lineage.datasets
    for (const key of dsColumnsMap.keys()) {
      if (!roles.has(key)) roles.set(key, 'intermediate');
    }
    return roles;
  }, [lineage.datasets, dsColumnsMap]);

  const handleColumnClick = useCallback((dsKey: string, col: string) => {
    setSelectedColumn((prev) =>
      prev && prev.dsKey === dsKey && prev.field === col ? null : { dsKey, field: col }
    );
  }, []);

  const handlePaneClick = useCallback(() => setSelectedColumn(null), []);

  const { nodes, edges } = useMemo(() => {
    const traceSet = selectedColumn
      ? new Set([
        ...traceColumns(selectedColumn.dsKey, selectedColumn.field, colEdges, 'up'),
        ...traceColumns(selectedColumn.dsKey, selectedColumn.field, colEdges, 'down'),
      ])
      : null;
    const hasSelection = selectedColumn !== null;

    const nodes: Node[] = [];
    for (const [dsKey, cols] of dsColumnsMap) {
      const colArr = Array.from(cols);
      const selectedCols = traceSet ? colArr.filter((c) => traceSet.has(`${dsKey}::${c}`)) : [];
      nodes.push({
        id: dsKey,
        type: 'columnDataset',
        position: { x: 0, y: 0 },
        data: {
          label: dsKey,
          columns: colArr,
          highlightedColumns: colArr,
          selectedColumns: selectedCols,
          hasSelection,
          isDark,
          accentColor: ROLE_COLORS[dsRoles.get(dsKey) ?? 'intermediate'],
          onColumnClick: handleColumnClick,
          datasetKey: dsKey,
        },
      });
    }

    const rfEdges: Edge[] = colEdges.map((e, i) => {
      const srcLabel = e.sourceDataset;
      const tgtLabel = e.targetDataset;
      const isTraced = traceSet
        ? traceSet.has(`${e.sourceDataset}::${e.sourceField}`) && traceSet.has(`${e.targetDataset}::${e.targetField}`)
        : false;
      return {
        id: `cl-${i}`,
        source: e.sourceDataset,
        sourceHandle: `${srcLabel}::${e.sourceField}::source`,
        target: e.targetDataset,
        targetHandle: `${tgtLabel}::${e.targetField}::target`,
        animated: isTraced,
        style: {
          stroke: isTraced ? '#0078D4' : hasSelection ? (isDark ? '#323130' : '#E1DFDD') : (isDark ? '#484644' : '#C8C6C4'),
          strokeWidth: isTraced ? 2.5 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isTraced ? '#0078D4' : (isDark ? '#484644' : '#C8C6C4'),
          width: 10, height: 10,
        },
        label: isTraced && e.transformationSubtype !== 'UNKNOWN' ? e.transformationSubtype : undefined,
        labelStyle: { fontSize: 9, fill: '#0078D4', fontWeight: 600 },
        labelBgStyle: { fill: isDark ? '#201F1E' : '#FAF9F8', fillOpacity: 0.9 },
      };
    });

    // Layout with dagre
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });
    for (const n of nodes) {
      const h = (n.data.columns as string[]).length * 24 + 50;
      g.setNode(n.id, { width: 220, height: h });
    }
    for (const e of rfEdges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    for (const n of nodes) {
      const pos = g.node(n.id);
      const h = (n.data.columns as string[]).length * 24 + 50;
      n.position = { x: pos.x - 110, y: pos.y - h / 2 };
    }

    return { nodes, edges: rfEdges };
  }, [dsColumnsMap, dsRoles, colEdges, selectedColumn, isDark, handleColumnClick]);

  if (colEdges.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', fontSize: '13px', color: isDark ? '#605E5C' : '#A19F9D' }}>
        No column-level lineage data available.
      </div>
    );
  }

  return (
    <div style={{ height: '600px', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onPaneClick={handlePaneClick}
      >
        <Background color={isDark ? '#323130' : '#EDEBE9'} gap={20} size={1} />
        <Controls showInteractive={false}
          style={{ backgroundColor: isDark ? '#252423' : '#FFFFFF', border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`, borderRadius: '4px' }} />
        <ColSpreadFitButton />
      </ReactFlow>
      <div style={{ padding: '6px 16px', fontSize: '11px', color: isDark ? '#A19F9D' : '#605E5C' }}>
        Click a column to trace its lineage upstream and downstream. Click the background to deselect.
      </div>
    </div>
  );
};

export default LivyColumnLineage;
