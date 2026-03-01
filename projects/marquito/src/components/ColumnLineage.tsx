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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { useThemeContext } from './ThemeProvider';
import { ParsedLineage, ColumnLineageEdge, ParsedDataset } from '@/lib/types';

interface ColumnLineageProps {
  data: ParsedLineage;
}

// Custom node: a dataset "card" with columns listed inside
function ColumnDatasetNode({ data }: NodeProps) {
  const nodeData = data as {
    label: string;
    columns: string[];
    highlightedColumns: string[];
    selectedColumns: string[];
    dimmedColumns: string[];
    hasSelection: boolean;
    isDark: boolean;
    accentColor: string;
    onColumnClick: (datasetKey: string, column: string) => void;
    datasetKey: string;
  };
  const { isDark, hasSelection } = nodeData;

  return (
    <div
      style={{
        backgroundColor: isDark ? '#252423' : '#FFFFFF',
        border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
        borderLeft: `3px solid ${nodeData.accentColor}`,
        borderRadius: '6px',
        minWidth: '200px',
        fontFamily: "'Segoe UI', sans-serif",
        boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.08)',
        opacity: hasSelection && nodeData.selectedColumns.length === 0 ? 0.4 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill={nodeData.accentColor}>
          <path d="M8 1C4.5 1 2 2.1 2 3.5v9C2 13.9 4.5 15 8 15s6-1.1 6-2.5v-9C14 2.1 11.5 1 8 1zm0 1.5c3 0 4.5.8 4.5 1S11 4.5 8 4.5 3.5 3.7 3.5 3.5 5 2.5 8 2.5z" />
        </svg>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isDark ? '#FAF9F8' : '#323130',
          }}
          title={nodeData.label}
        >
          {nodeData.label}
        </span>
      </div>
      <div style={{ padding: '4px 0' }}>
        {nodeData.columns.map((col) => {
          const isSelected = nodeData.selectedColumns.includes(col);
          const isHighlighted = nodeData.highlightedColumns.includes(col);
          const isDimmed = hasSelection && !isSelected;

          return (
            <div
              key={col}
              onClick={(e) => {
                e.stopPropagation();
                nodeData.onColumnClick(nodeData.datasetKey, col);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px 12px',
                fontSize: '11px',
                fontFamily: "monospace, 'Segoe UI'",
                cursor: 'pointer',
                color: isSelected
                  ? '#FFFFFF'
                  : isDimmed
                    ? isDark ? '#605E5C' : '#A19F9D'
                    : isHighlighted
                      ? isDark ? '#FAF9F8' : '#323130'
                      : isDark ? '#A19F9D' : '#605E5C',
                backgroundColor: isSelected
                  ? '#0078D4'
                  : isDimmed
                    ? 'transparent'
                    : isHighlighted
                      ? isDark ? 'rgba(0,120,212,0.15)' : 'rgba(0,120,212,0.08)'
                      : 'transparent',
                position: 'relative',
                transition: 'background-color 0.15s, color 0.15s',
                borderRadius: isSelected ? '3px' : '0',
              }}
            >
              <Handle
                type="target"
                position={Position.Left}
                id={`${nodeData.label}::${col}::target`}
                style={{
                  background: isSelected ? '#0078D4' : isHighlighted && !isDimmed ? '#0078D4' : isDark ? '#484644' : '#C8C6C4',
                  border: 'none',
                  width: 6,
                  height: 6,
                  left: -3,
                }}
              />
              <span style={{ marginLeft: '4px' }}>{col}</span>
              <Handle
                type="source"
                position={Position.Right}
                id={`${nodeData.label}::${col}::source`}
                style={{
                  background: isSelected ? '#0078D4' : isHighlighted && !isDimmed ? '#0078D4' : isDark ? '#484644' : '#C8C6C4',
                  border: 'none',
                  width: 6,
                  height: 6,
                  right: -3,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const nodeTypes = { columnDataset: ColumnDatasetNode };

function getLayoutedElements(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 80, ranksep: 200 });

  nodes.forEach((node) => {
    g.setNode(node.id, { width: 220, height: (node.data.columns as string[]).length * 24 + 50 });
  });
  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });
  dagre.layout(g);

  return {
    nodes: nodes.map((node) => {
      const pos = g.node(node.id);
      return { ...node, position: { x: pos.x - 110, y: pos.y - ((node.data.columns as string[]).length * 24 + 50) / 2 } };
    }),
    edges,
  };
}

// Trace all upstream ancestors of a column through the lineage edges
function traceUpstream(
  datasetKey: string,
  field: string,
  edges: ColumnLineageEdge[]
): Set<string> {
  const visited = new Set<string>();
  const queue = [`${datasetKey}::${field}`];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const [ds1, ds2, col] = splitColumnKey(current);
    const dsKey = `${ds1}::${ds2}`;

    // Find all edges where this column is a target → trace back to sources
    for (const edge of edges) {
      if (edge.targetDataset === dsKey && edge.targetField === col) {
        const srcKey = `${edge.sourceDataset}::${edge.sourceField}`;
        if (!visited.has(srcKey)) {
          queue.push(srcKey);
        }
      }
    }
  }

  return visited;
}

// Also trace downstream from a column
function traceDownstream(
  datasetKey: string,
  field: string,
  edges: ColumnLineageEdge[]
): Set<string> {
  const visited = new Set<string>();
  const queue = [`${datasetKey}::${field}`];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const [ds1, ds2, col] = splitColumnKey(current);
    const dsKey = `${ds1}::${ds2}`;

    for (const edge of edges) {
      if (edge.sourceDataset === dsKey && edge.sourceField === col) {
        const tgtKey = `${edge.targetDataset}::${edge.targetField}`;
        if (!visited.has(tgtKey)) {
          queue.push(tgtKey);
        }
      }
    }
  }

  return visited;
}

function splitColumnKey(key: string): [string, string, string] {
  // key format: "namespace::datasetName::columnName"
  const firstSep = key.indexOf('::');
  const secondSep = key.indexOf('::', firstSep + 2);
  return [key.slice(0, firstSep), key.slice(firstSep + 2, secondSep), key.slice(secondSep + 2)];
}

const ColumnLineage = ({ data }: ColumnLineageProps) => {
  const { isDark } = useThemeContext();
  const [selectedColumn, setSelectedColumn] = useState<{ datasetKey: string; field: string } | null>(null);

  // Build the base graph data (stable across selection changes)
  const { baseNodes, baseEdges, connectedFields, dsColumnsMap } = useMemo(() => {
    const dsInLineage = new Set<string>();
    for (const edge of data.columnLineageEdges) {
      dsInLineage.add(edge.sourceDataset);
      dsInLineage.add(edge.targetDataset);
    }

    const dsMap = new Map<string, { ds: ParsedDataset; columns: Set<string> }>();
    for (const ds of data.datasets) {
      const key = `${ds.namespace}::${ds.name}`;
      if (!dsInLineage.has(key)) continue;
      if (!dsMap.has(key)) {
        dsMap.set(key, { ds, columns: new Set(ds.schema.map((f) => f.name)) });
      }
    }

    for (const edge of data.columnLineageEdges) {
      const srcEntry = dsMap.get(edge.sourceDataset);
      if (srcEntry) srcEntry.columns.add(edge.sourceField);
      const tgtEntry = dsMap.get(edge.targetDataset);
      if (tgtEntry) tgtEntry.columns.add(edge.targetField);
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const roleColors: Record<string, string> = {
      source: '#0078D4',
      intermediate: '#F2C811',
      target: '#107C10',
    };

    for (const [key, { ds, columns }] of dsMap) {
      nodes.push({
        id: key,
        type: 'columnDataset',
        position: { x: 0, y: 0 },
        data: {
          label: ds.shortName,
          columns: Array.from(columns),
          highlightedColumns: [] as string[],
          selectedColumns: [] as string[],
          dimmedColumns: [] as string[],
          hasSelection: false,
          isDark,
          accentColor: roleColors[ds.role] || '#0078D4',
          onColumnClick: () => {},
          datasetKey: key,
        },
      });
    }

    for (const clEdge of data.columnLineageEdges) {
      const edgeId = `${clEdge.sourceDataset}::${clEdge.sourceField}->${clEdge.targetDataset}::${clEdge.targetField}`;
      edges.push({
        id: edgeId,
        source: clEdge.sourceDataset,
        sourceHandle: `${dsMap.get(clEdge.sourceDataset)?.ds.shortName}::${clEdge.sourceField}::source`,
        target: clEdge.targetDataset,
        targetHandle: `${dsMap.get(clEdge.targetDataset)?.ds.shortName}::${clEdge.targetField}::target`,
        animated: false,
        style: { stroke: isDark ? '#484644' : '#C8C6C4', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#484644' : '#C8C6C4', width: 10, height: 10 },
        label: clEdge.transformationSubtype !== 'UNKNOWN' ? clEdge.transformationSubtype : undefined,
        labelStyle: { fontSize: 9, fill: isDark ? '#A19F9D' : '#605E5C', fontFamily: "'Segoe UI', sans-serif" },
        labelBgStyle: { fill: isDark ? '#201F1E' : '#FAF9F8', fillOpacity: 0.9 },
      });
    }

    const connected = new Set<string>();
    for (const edge of data.columnLineageEdges) {
      connected.add(`${edge.sourceDataset}::${edge.sourceField}`);
      connected.add(`${edge.targetDataset}::${edge.targetField}`);
    }

    return { baseNodes: nodes, baseEdges: edges, connectedFields: connected, dsColumnsMap: dsMap };
  }, [data, isDark]);

  const handleColumnClick = useCallback((datasetKey: string, column: string) => {
    setSelectedColumn((prev) => {
      if (prev && prev.datasetKey === datasetKey && prev.field === column) {
        return null; // toggle off
      }
      return { datasetKey, field: column };
    });
  }, []);

  const handlePaneClick = useCallback(() => {
    setSelectedColumn(null);
  }, []);

  // Compute highlighted columns and edges based on selection
  const { finalNodes, finalEdges } = useMemo(() => {
    let traceSet: Set<string> | null = null;

    if (selectedColumn) {
      const upstream = traceUpstream(selectedColumn.datasetKey, selectedColumn.field, data.columnLineageEdges);
      const downstream = traceDownstream(selectedColumn.datasetKey, selectedColumn.field, data.columnLineageEdges);
      traceSet = new Set([...upstream, ...downstream]);
    }

    const hasSelection = selectedColumn !== null;

    const finalNodes = baseNodes.map((node) => {
      const cols = node.data.columns as string[];
      const selectedCols = traceSet
        ? cols.filter((col: string) => traceSet!.has(`${node.id}::${col}`))
        : [];

      return {
        ...node,
        data: {
          ...node.data,
          highlightedColumns: cols.filter((col: string) => connectedFields.has(`${node.id}::${col}`)),
          selectedColumns: selectedCols,
          hasSelection,
          onColumnClick: handleColumnClick,
          datasetKey: node.id,
        },
      };
    });

    const finalEdges = baseEdges.map((edge) => {
      if (!traceSet) return edge;

      // Check if this edge connects two traced columns
      const clEdge = data.columnLineageEdges.find((cl) => {
        const eid = `${cl.sourceDataset}::${cl.sourceField}->${cl.targetDataset}::${cl.targetField}`;
        return eid === edge.id;
      });

      if (clEdge) {
        const srcKey = `${clEdge.sourceDataset}::${clEdge.sourceField}`;
        const tgtKey = `${clEdge.targetDataset}::${clEdge.targetField}`;
        const isTraced = traceSet.has(srcKey) && traceSet.has(tgtKey);

        if (isTraced) {
          return {
            ...edge,
            animated: true,
            style: { stroke: '#0078D4', strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#0078D4', width: 10, height: 10 },
            labelStyle: { fontSize: 9, fill: '#0078D4', fontWeight: 600, fontFamily: "'Segoe UI', sans-serif" },
          };
        }
      }

      // Dim non-traced edges
      return {
        ...edge,
        style: { stroke: isDark ? '#323130' : '#E1DFDD', strokeWidth: 1 },
        markerEnd: { type: MarkerType.ArrowClosed, color: isDark ? '#323130' : '#E1DFDD', width: 10, height: 10 },
        label: undefined,
      };
    });

    return { finalNodes, finalEdges };
  }, [baseNodes, baseEdges, selectedColumn, data.columnLineageEdges, connectedFields, handleColumnClick, isDark]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => getLayoutedElements(finalNodes, baseEdges),
    [finalNodes, baseEdges]
  );

  // Use finalEdges for rendering (with highlighting) but layoutedNodes for positions
  const renderEdges = useMemo(() => {
    return finalEdges;
  }, [finalEdges]);

  return (
    <section style={{ padding: '0 24px 32px', maxWidth: '1600px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: isDark ? '#FAF9F8' : '#323130',
              fontFamily: "'Segoe UI', sans-serif",
            }}
          >
            Column-Level Lineage
          </h2>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#FFFFFF',
              backgroundColor: '#D83B01',
              padding: '2px 8px',
              borderRadius: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Featured
          </span>
        </div>
        <p style={{ fontSize: '13px', color: isDark ? '#A19F9D' : '#605E5C', fontFamily: "'Segoe UI', sans-serif", maxWidth: '720px', lineHeight: '1.5' }}>
          Click any column to trace its full lineage upstream and downstream. Click the background to
          deselect.
        </p>
      </div>
      <div
        style={{
          height: '600px',
          backgroundColor: isDark ? '#201F1E' : '#FAF9F8',
          border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        <ReactFlow
          nodes={layoutedNodes}
          edges={renderEdges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          onPaneClick={handlePaneClick}
        >
          <Background color={isDark ? '#323130' : '#EDEBE9'} gap={20} size={1} />
          <Controls
            showInteractive={false}
            style={{
              backgroundColor: isDark ? '#252423' : '#FFFFFF',
              border: `1px solid ${isDark ? '#484644' : '#EDEBE9'}`,
              borderRadius: '4px',
            }}
          />
        </ReactFlow>
      </div>
    </section>
  );
};

export default ColumnLineage;
