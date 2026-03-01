'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeContext } from './ThemeProvider';

/* ── GitHub Permalinks (pinned to verified commit SHAs) ── */
const SPARK_BASE = 'https://github.com/apache/spark/blob/435f133a023f6646bb00b6300ec01d59932fb275';
const OL_BASE = 'https://github.com/OpenLineage/OpenLineage/blob/7ef60d612329403aa18f721e482dbabc5fd03ee5';
const DELTA_BASE = 'https://github.com/delta-io/delta/blob/0cb83411b230675605d81baafdda5872f139200c';

/* ── Types ── */
type Tech = 'spark' | 'openlineage' | 'delta';

interface ArchNode {
  id: string;
  step: number;
  label: string;
  subtitle: string;
  description: string;
  tech: Tech;
  sourceUrl: string;
  sourceLabel: string;
  col: number;
  row: number;
  icon: string;
  tooltip: { heading: string; sampleLabel: string; sample: string };
}

/* ── Step descriptions shown below the diagram ── */
const STEPS = [
  { num: 1, label: 'User Query', tech: 'spark' as Tech, text: 'A user submits SQL or DataFrame transformations via SparkSession.', sourceUrl: `${SPARK_BASE}/sql/core/src/main/scala/org/apache/spark/sql/SparkSession.scala`, sourceLabel: 'SparkSession.scala' },
  { num: 2, label: 'Catalyst Engine', tech: 'spark' as Tech, text: 'Spark parses the SQL, resolves table/column references through the catalog, and applies 70+ optimization rules.', sourceUrl: `${SPARK_BASE}/sql/core/src/main/scala/org/apache/spark/sql/execution/QueryExecution.scala`, sourceLabel: 'QueryExecution.scala' },
  { num: 3, label: 'Logical Plan', tech: 'spark' as Tech, text: 'The result is an optimized tree of relational operators (Project, Join, Aggregate) with resolved types.', sourceUrl: `${SPARK_BASE}/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/plans/logical/LogicalPlan.scala`, sourceLabel: 'LogicalPlan.scala' },
  { num: 4, label: 'Listener Bus', tech: 'spark' as Tech, text: 'As execution proceeds, Spark fires SparkListenerEvents (job start/end, stage completion) to all registered listeners.', sourceUrl: `${SPARK_BASE}/core/src/main/scala/org/apache/spark/scheduler/SparkListener.scala`, sourceLabel: 'SparkListener.scala' },
  { num: 5, label: 'Delta Lake', tech: 'delta' as Tech, text: 'Delta Lake tables appear in the plan as DeltaTableV2 nodes, backed by ACID transactions and a JSON commit log.', sourceUrl: `${DELTA_BASE}/spark/src/main/scala/org/apache/spark/sql/delta/OptimisticTransaction.scala`, sourceLabel: 'OptimisticTransaction.scala' },
  { num: 6, label: 'OL Spark Listener', tech: 'openlineage' as Tech, text: 'OpenLineage\'s listener intercepts these Spark events and triggers lineage extraction.', sourceUrl: `${OL_BASE}/integration/spark/app/src/main/java/io/openlineage/spark/agent/OpenLineageSparkListener.java`, sourceLabel: 'OpenLineageSparkListener.java' },
  { num: 7, label: 'Plan Visitors', tech: 'openlineage' as Tech, text: 'A chain of QueryPlanVisitor classes pattern-match on plan nodes to identify input/output datasets.', sourceUrl: `${OL_BASE}/integration/spark/shared/src/main/java/io/openlineage/spark/api/QueryPlanVisitor.java`, sourceLabel: 'QueryPlanVisitor.java' },
  { num: 8, label: 'Column Lineage', tech: 'openlineage' as Tech, text: 'ColumnLevelLineageBuilder traces each output column back through expressions to its source columns.', sourceUrl: `${OL_BASE}/integration/spark/shared/src/main/java/io/openlineage/spark/agent/lifecycle/plan/column/ColumnLevelLineageBuilder.java`, sourceLabel: 'ColumnLevelLineageBuilder.java' },
  { num: 9, label: 'RunEvent Output', tech: 'openlineage' as Tech, text: 'The final OpenLineage RunEvent JSON is assembled with job, run, datasets, and column lineage facets.', sourceUrl: `${OL_BASE}/integration/spark/shared/src/main/java/io/openlineage/spark/agent/lifecycle/OpenLineageRunEventBuilder.java`, sourceLabel: 'RunEventBuilder.java' },
  { num: 10, label: 'Event Emitter', tech: 'openlineage' as Tech, text: 'EventEmitter receives the built RunEvent and delegates to the OpenLineageClient, which routes it to the configured Transport.', sourceUrl: `${OL_BASE}/integration/spark/app/src/main/java/io/openlineage/spark/agent/EventEmitter.java`, sourceLabel: 'EventEmitter.java' },
  { num: 11, label: 'Transport (File)', tech: 'openlineage' as Tech, text: 'FileTransport appends the JSON event as a single line to the configured output file. Other transports include HttpTransport (POST to API) and ConsoleTransport.', sourceUrl: `${OL_BASE}/client/java/src/main/java/io/openlineage/client/transports/FileTransport.java`, sourceLabel: 'FileTransport.java' },
];

/* ── Nodes with rich descriptions and tooltip sample data ── */
const NODES: ArchNode[] = [
  {
    id: 'query',
    step: 1,
    label: 'User Query',
    subtitle: 'SQL / DataFrame API',
    description: 'Entry point — user submits SQL or chains DataFrame transformations via SparkSession',
    tech: 'spark',
    sourceUrl: `${SPARK_BASE}/sql/core/src/main/scala/org/apache/spark/sql/SparkSession.scala`,
    sourceLabel: 'SparkSession.scala',
    col: 1, row: 0,
    icon: 'terminal',
    tooltip: {
      heading: 'User submits a query to SparkSession',
      sampleLabel: 'Sample SQL',
      sample: `spark.sql("""
  SELECT o.id, c.name, SUM(o.amount)
  FROM orders o
  JOIN customers c
    ON o.customer_id = c.id
  GROUP BY o.id, c.name
""")`,
    },
  },
  {
    id: 'catalyst',
    step: 2,
    label: 'Catalyst Engine',
    subtitle: 'Parse → Analyze → Optimize',
    description: 'Parses SQL into an unresolved plan, resolves references via catalog, then applies 70+ optimization rules',
    tech: 'spark',
    sourceUrl: `${SPARK_BASE}/sql/core/src/main/scala/org/apache/spark/sql/execution/QueryExecution.scala`,
    sourceLabel: 'QueryExecution.scala',
    col: 1, row: 1,
    icon: 'gears',
    tooltip: {
      heading: 'QueryExecution orchestrates the pipeline',
      sampleLabel: 'Pipeline stages',
      sample: `lazy val analyzed  = analyzer.execute(logical)
lazy val optimized = optimizer.execute(analyzed)
lazy val sparkPlan = planner.plan(optimized)
lazy val executed  = preparations.foldLeft(sparkPlan) {
  (plan, rule) => rule.apply(plan)
}`,
    },
  },
  {
    id: 'logicalplan',
    step: 3,
    label: 'Logical Plan',
    subtitle: 'Optimized plan tree',
    description: 'A tree of relational operators — Project, Join, Filter, Aggregate — with resolved columns & types',
    tech: 'spark',
    sourceUrl: `${SPARK_BASE}/sql/catalyst/src/main/scala/org/apache/spark/sql/catalyst/plans/logical/LogicalPlan.scala`,
    sourceLabel: 'LogicalPlan.scala',
    col: 1, row: 2,
    icon: 'tree',
    tooltip: {
      heading: 'Tree of logical operators',
      sampleLabel: 'Sample plan tree',
      sample: `Aggregate [id, name], [id, name, sum(amount)]
└─ Join Inner (customer_id = id)
   ├─ Relation[orders] (id, customer_id, amount)
   └─ Relation[customers] (id, name)
       └─ DeltaTableV2(default.customers)`,
    },
  },
  {
    id: 'listenerbus',
    step: 4,
    label: 'Listener Bus',
    subtitle: 'Event dispatch to all listeners',
    description: 'Spark fires SparkListenerEvents on job start/end, stage completion, SQL execution — broadcast to registered listeners',
    tech: 'spark',
    sourceUrl: `${SPARK_BASE}/core/src/main/scala/org/apache/spark/scheduler/SparkListener.scala`,
    sourceLabel: 'SparkListener.scala',
    col: 1, row: 3,
    icon: 'broadcast',
    tooltip: {
      heading: 'SparkListenerBus broadcasts events',
      sampleLabel: 'Event payload',
      sample: `SparkListenerJobEnd(
  jobId = 42,
  time  = 1708617600000,
  jobResult = JobSucceeded
)
// Also fires:
// SparkListenerSQLExecutionEnd
// SparkListenerStageCompleted`,
    },
  },
  {
    id: 'delta',
    step: 5,
    label: 'Delta Lake',
    subtitle: 'ACID transactions & log',
    description: 'DeltaTableV2 plugs into Spark\'s DataSource V2, providing ACID commits via OptimisticTransaction and a JSON-based _delta_log',
    tech: 'delta',
    sourceUrl: `${DELTA_BASE}/spark/src/main/scala/org/apache/spark/sql/delta/OptimisticTransaction.scala`,
    sourceLabel: 'OptimisticTransaction.scala',
    col: 0, row: 2,
    icon: 'layers',
    tooltip: {
      heading: 'Delta manages ACID transactions',
      sampleLabel: '_delta_log/00000000000000000042.json',
      sample: `{
  "commitInfo": {
    "operation": "WRITE",
    "operationMetrics": {
      "numFiles": "4",
      "numOutputRows": "125000"
    }
  },
  "add": { "path": "part-00001.parquet",
           "size": 48210, ... }
}`,
    },
  },
  {
    id: 'ol-listener',
    step: 6,
    label: 'OL Spark Listener',
    subtitle: 'Hooks into Spark events',
    description: 'Extends SparkListenerInterface — captures onJobStart, onJobEnd, onOtherEvent and routes them to the OpenLineage context',
    tech: 'openlineage',
    sourceUrl: `${OL_BASE}/integration/spark/app/src/main/java/io/openlineage/spark/agent/OpenLineageSparkListener.java`,
    sourceLabel: 'OpenLineageSparkListener.java',
    col: 1, row: 4,
    icon: 'hook',
    tooltip: {
      heading: 'OpenLineageSparkListener intercepts events',
      sampleLabel: 'Listener code',
      sample: `@Override
public void onJobEnd(SparkListenerJobEnd event) {
  executionContext.end(event);
  // Triggers plan walking, facet building,
  // and emitting the COMPLETE RunEvent
}

@Override
public void onOtherEvent(SparkListenerEvent e) {
  if (e instanceof SparkListenerSQLExecutionStart)
    executionContext.start((SparkListenerSQLStart) e);
}`,
    },
  },
  {
    id: 'plan-visitor',
    step: 7,
    label: 'Plan Visitors',
    subtitle: 'Walk the LogicalPlan tree',
    description: 'A chain of QueryPlanVisitor subclasses that pattern-match on LogicalPlan nodes to extract input/output datasets',
    tech: 'openlineage',
    sourceUrl: `${OL_BASE}/integration/spark/shared/src/main/java/io/openlineage/spark/api/QueryPlanVisitor.java`,
    sourceLabel: 'QueryPlanVisitor.java',
    col: 1, row: 5,
    icon: 'magnifier',
    tooltip: {
      heading: 'Visitors pattern-match plan nodes',
      sampleLabel: 'Visitor dispatch',
      sample: `// For each node in LogicalPlan tree:
visitors.stream()
  .filter(v -> v.isDefinedAt(node))
  .flatMap(v -> v.apply(node))
  .collect(toList());

// Matched visitors:
//  → DataSourceV2RelationVisitor
//  → DeltaRelationVisitor
//  → JdbcRelationVisitor`,
    },
  },
  {
    id: 'col-lineage',
    step: 8,
    label: 'Column Lineage',
    subtitle: 'Field-level dependency edges',
    description: 'ColumnLevelLineageBuilder traces each output column back through expressions to source columns, building a dependency graph',
    tech: 'openlineage',
    sourceUrl: `${OL_BASE}/integration/spark/shared/src/main/java/io/openlineage/spark/agent/lifecycle/plan/column/ColumnLevelLineageBuilder.java`,
    sourceLabel: 'ColumnLevelLineageBuilder.java',
    col: 1, row: 6,
    icon: 'columns',
    tooltip: {
      heading: 'Traces column-level dependencies',
      sampleLabel: 'Column edges built',
      sample: `output.id ← orders.id
  transformationType: IDENTITY

output.name ← customers.name
  transformationType: IDENTITY

output.total ← orders.amount
  transformationType: AGGREGATION
  expression: "sum(amount)"`,
    },
  },
  {
    id: 'event-builder',
    step: 9,
    label: 'RunEvent Output',
    subtitle: 'OpenLineage JSON emitted',
    description: 'OpenLineageRunEventBuilder assembles the final RunEvent with job, run, input/output datasets, and all facets including column lineage',
    tech: 'openlineage',
    sourceUrl: `${OL_BASE}/integration/spark/shared/src/main/java/io/openlineage/spark/agent/lifecycle/OpenLineageRunEventBuilder.java`,
    sourceLabel: 'RunEventBuilder.java',
    col: 1, row: 7,
    icon: 'json',
    tooltip: {
      heading: 'Final OpenLineage RunEvent',
      sampleLabel: 'JSON event emitted',
      sample: `{
  "eventType": "COMPLETE",
  "eventTime": "2026-02-22T16:30:00Z",
  "job":  { "namespace": "spark", "name": "execute_insert_into" },
  "run":  { "runId": "a1b2c3d4-..." },
  "outputs": [{
    "name": "default.summary",
    "facets": {
      "columnLineage": {
        "fields": { "id": { "inputFields": [...] }}
      }
    }
  }]
}`,
    },
  },
  {
    id: 'emitter',
    step: 10,
    label: 'Event Emitter',
    subtitle: 'Routes to OpenLineageClient',
    description: 'EventEmitter.emit(event) delegates to OpenLineageClient which serializes the RunEvent and passes it to the configured Transport',
    tech: 'openlineage',
    sourceUrl: `${OL_BASE}/integration/spark/app/src/main/java/io/openlineage/spark/agent/EventEmitter.java`,
    sourceLabel: 'EventEmitter.java',
    col: 1, row: 8,
    icon: 'broadcast',
    tooltip: {
      heading: 'EventEmitter delegates to transport',
      sampleLabel: 'Emitter code path',
      sample: `// EventEmitter.java
public void emit(RunEvent event) {
  client.emit(event);
  // → OpenLineageClient.emit()
  //   → transport.emit(event)
}

// Configured via spark conf:
// spark.openlineage.transport.type=file
// spark.openlineage.transport.location=lineage.json`,
    },
  },
  {
    id: 'transport',
    step: 11,
    label: 'File Transport',
    subtitle: 'Writes JSONL to disk',
    description: 'FileTransport appends each RunEvent as a single JSON line to the output file — this is the lineage JSONL file you load into this visualizer',
    tech: 'openlineage',
    sourceUrl: `${OL_BASE}/client/java/src/main/java/io/openlineage/client/transports/FileTransport.java`,
    sourceLabel: 'FileTransport.java',
    col: 1, row: 9,
    icon: 'file',
    tooltip: {
      heading: 'FileTransport writes to JSONL',
      sampleLabel: 'Transport output',
      sample: `// FileTransport.java
public void emit(OpenLineage.RunEvent event) {
  String json = OpenLineageClientUtils
    .toJson(event);
  // Append single line (no internal newlines)
  writer.write(json);
  writer.newLine();
  writer.flush();
}

// Output: lineage-from-spark-default.json
// Each line = one RunEvent JSON object`,
    },
  },
];

/* ── Edges ── */
interface Edge {
  from: string;
  to: string;
  label?: string;
}

const EDGES: Edge[] = [
  { from: 'query', to: 'catalyst', label: 'Unresolved plan' },
  { from: 'catalyst', to: 'logicalplan', label: 'Optimized plan' },
  { from: 'logicalplan', to: 'listenerbus', label: 'Execution events' },
  { from: 'listenerbus', to: 'ol-listener', label: 'SparkListenerEvent' },
  { from: 'ol-listener', to: 'plan-visitor', label: 'QueryExecution' },
  { from: 'plan-visitor', to: 'col-lineage', label: 'Dataset list' },
  { from: 'col-lineage', to: 'event-builder', label: 'Facets' },
  { from: 'event-builder', to: 'emitter', label: 'RunEvent object' },
  { from: 'emitter', to: 'transport', label: 'Serialized JSON' },
  { from: 'delta', to: 'logicalplan', label: 'DeltaTableV2 node' },
];

/* ── Palettes ── */
const PALETTES: Record<Tech, {
  gradStart: string; gradEnd: string; glow: string;
  text: string; accent: string; particle: string;
  bgZone: string; bgZoneDark: string; label: string;
}> = {
  spark: {
    gradStart: '#FF6B2B', gradEnd: '#D4470A',
    glow: 'rgba(226,90,28,0.3)', text: '#FFFFFF',
    accent: '#E25A1C', particle: '#FF8C42',
    bgZone: 'rgba(226,90,28,0.04)', bgZoneDark: 'rgba(226,90,28,0.08)',
    label: 'Apache Spark',
  },
  openlineage: {
    gradStart: '#FFD93D', gradEnd: '#E5B800',
    glow: 'rgba(242,200,17,0.3)', text: '#1A1A1A',
    accent: '#F2C811', particle: '#FFE066',
    bgZone: 'rgba(242,200,17,0.04)', bgZoneDark: 'rgba(242,200,17,0.08)',
    label: 'OpenLineage',
  },
  delta: {
    gradStart: '#00C4F0', gradEnd: '#0089AD',
    glow: 'rgba(0,173,216,0.3)', text: '#FFFFFF',
    accent: '#00ADD8', particle: '#33D6FF',
    bgZone: 'rgba(0,173,216,0.04)', bgZoneDark: 'rgba(0,173,216,0.08)',
    label: 'Delta Lake',
  },
};

/* ── Layout (top-to-bottom) ── */
const NODE_W = 260;
const NODE_H = 140;
const COL_GAP = 48;
const ROW_GAP = 52;
const PAD_X = 44;
const PAD_Y = 44;
const LEGEND_W = 140;

function nodeX(col: number) { return PAD_X + col * (NODE_W + COL_GAP); }
function nodeY(row: number) { return PAD_Y + row * (NODE_H + ROW_GAP); }

function getNodeRect(n: ArchNode) {
  return { x: nodeX(n.col), y: nodeY(n.row), w: NODE_W, h: NODE_H };
}
function getNodeCenter(n: ArchNode) {
  const r = getNodeRect(n);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/* ── Inline illustrations (small SVG icons drawn inside each block) ── */
function NodeIllustration({ icon, color }: { icon: string; color: string }) {
  const opacity = 0.25;
  const s = 56;
  switch (icon) {
    case 'terminal':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <rect x="4" y="6" width="40" height="36" rx="4" stroke={color} strokeWidth="2" fill="none" />
          <polyline points="12,18 20,24 12,30" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="24" y1="30" x2="36" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case 'gears':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <circle cx="20" cy="20" r="7" stroke={color} strokeWidth="2" fill="none" />
          <circle cx="20" cy="20" r="2.5" fill={color} />
          <path d="M20 11v-2M20 31v-2M11 20h-2M31 20h-2M13.3 13.3l-1.4-1.4M28.1 28.1l-1.4-1.4M28.1 13.3l1.4-1.4M13.3 28.1l-1.4 1.4" stroke={color} strokeWidth="1.5" />
          <circle cx="34" cy="32" r="5" stroke={color} strokeWidth="1.5" fill="none" />
          <circle cx="34" cy="32" r="1.5" fill={color} />
          <path d="M34 25.5V27M34 37v1.5M27.5 32H29M39 32h1.5" stroke={color} strokeWidth="1" />
        </svg>
      );
    case 'tree':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <circle cx="24" cy="10" r="5" stroke={color} strokeWidth="2" fill="none" />
          <circle cx="12" cy="28" r="4" stroke={color} strokeWidth="1.5" fill="none" />
          <circle cx="36" cy="28" r="4" stroke={color} strokeWidth="1.5" fill="none" />
          <circle cx="6" cy="40" r="3" stroke={color} strokeWidth="1.5" fill="none" />
          <circle cx="18" cy="40" r="3" stroke={color} strokeWidth="1.5" fill="none" />
          <circle cx="36" cy="40" r="3" stroke={color} strokeWidth="1.5" fill="none" />
          <line x1="24" y1="15" x2="12" y2="24" stroke={color} strokeWidth="1.5" />
          <line x1="24" y1="15" x2="36" y2="24" stroke={color} strokeWidth="1.5" />
          <line x1="12" y1="32" x2="6" y2="37" stroke={color} strokeWidth="1.5" />
          <line x1="12" y1="32" x2="18" y2="37" stroke={color} strokeWidth="1.5" />
          <line x1="36" y1="32" x2="36" y2="37" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    case 'broadcast':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <line x1="24" y1="22" x2="24" y2="42" stroke={color} strokeWidth="2.5" />
          <circle cx="24" cy="18" r="4" fill={color} />
          <path d="M14 12a14 14 0 0 1 20 0" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M8 6a22 22 0 0 1 32 0" stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <line x1="18" y1="42" x2="30" y2="42" stroke={color} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'layers':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <path d="M24 8L4 18L24 28L44 18Z" stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" />
          <path d="M4 24L24 34L44 24" stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
          <path d="M4 30L24 40L44 30" stroke={color} strokeWidth="1.5" fill="none" strokeLinejoin="round" />
        </svg>
      );
    case 'hook':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <path d="M16 8v18a8 8 0 0 0 16 0V20" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <circle cx="32" cy="16" r="4" stroke={color} strokeWidth="2" fill="none" />
          <path d="M8 14l8-6 8 6" stroke={color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="10" y1="20" x2="10" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="22" y1="20" x2="22" y2="14" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case 'magnifier':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <circle cx="20" cy="20" r="11" stroke={color} strokeWidth="2" fill="none" />
          <line x1="28" y1="28" x2="40" y2="40" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx="16" cy="16" r="2" fill={color} />
          <circle cx="24" cy="16" r="2" fill={color} />
          <circle cx="20" cy="23" r="2" fill={color} />
          <line x1="16" y1="18" x2="20" y2="21" stroke={color} strokeWidth="1" />
          <line x1="24" y1="18" x2="20" y2="21" stroke={color} strokeWidth="1" />
        </svg>
      );
    case 'columns':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <rect x="4" y="8" width="14" height="32" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
          <line x1="4" y1="16" x2="18" y2="16" stroke={color} strokeWidth="1" />
          <line x1="4" y1="22" x2="18" y2="22" stroke={color} strokeWidth="1" />
          <line x1="4" y1="28" x2="18" y2="28" stroke={color} strokeWidth="1" />
          <rect x="30" y="8" width="14" height="32" rx="2" stroke={color} strokeWidth="1.5" fill="none" />
          <line x1="30" y1="16" x2="44" y2="16" stroke={color} strokeWidth="1" />
          <line x1="30" y1="22" x2="44" y2="22" stroke={color} strokeWidth="1" />
          <line x1="30" y1="28" x2="44" y2="28" stroke={color} strokeWidth="1" />
          <path d="M18 12 C24 12, 26 19, 30 19" stroke={color} strokeWidth="1.5" fill="none" />
          <path d="M18 19 C24 19, 26 25, 30 25" stroke={color} strokeWidth="1.5" fill="none" />
          <path d="M18 25 C24 25, 26 12, 30 12" stroke={color} strokeWidth="1.5" fill="none" />
        </svg>
      );
    case 'json':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <rect x="6" y="4" width="36" height="40" rx="4" stroke={color} strokeWidth="2" fill="none" />
          <text x="12" y="18" fontSize="9" fontFamily="monospace" fontWeight="700" fill={color}>{'{'}</text>
          <text x="16" y="27" fontSize="7" fontFamily="monospace" fill={color}>{'"event":'}</text>
          <text x="16" y="35" fontSize="7" fontFamily="monospace" fill={color}>{'"facets":'}</text>
          <text x="12" y="42" fontSize="9" fontFamily="monospace" fontWeight="700" fill={color}>{'}'}</text>
        </svg>
      );
    case 'file':
      return (
        <svg width={s} height={s} viewBox="0 0 48 48" opacity={opacity}>
          <path d="M10 4h20l10 10v30H10V4z" stroke={color} strokeWidth="2" fill="none" strokeLinejoin="round" />
          <path d="M30 4v10h10" stroke={color} strokeWidth="1.5" fill="none" />
          <line x1="16" y1="22" x2="32" y2="22" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="28" x2="32" y2="28" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
          <line x1="16" y1="34" x2="26" y2="34" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/* ── Edge path generation (vertical layout) ── */
function getEdgePath(fromId: string, toId: string): string {
  const fromNode = NODES.find((n) => n.id === fromId)!;
  const toNode = NODES.find((n) => n.id === toId)!;
  const fromR = getNodeRect(fromNode);
  const toR = getNodeRect(toNode);

  if (fromNode.col === toNode.col) {
    // Straight down (same column)
    const x = fromR.x + fromR.w / 2;
    const sy = fromR.y + fromR.h;
    const ey = toR.y;
    const cp = (ey - sy) * 0.4;
    return `M ${x} ${sy} C ${x} ${sy + cp}, ${x} ${ey - cp}, ${x} ${ey}`;
  }

  // Delta (col 0, row 2) → LogicalPlan (col 1, row 2): horizontal
  if (fromNode.row === toNode.row) {
    const sx = fromR.x + fromR.w;
    const sy = fromR.y + fromR.h / 2;
    const ex = toR.x;
    const ey = toR.y + toR.h / 2;
    const cp = (ex - sx) * 0.4;
    return `M ${sx} ${sy} C ${sx + cp} ${sy}, ${ex - cp} ${ey}, ${ex} ${ey}`;
  }

  // Cross-column vertical: curve from bottom of one to top of another
  const sx = fromR.x + fromR.w / 2;
  const sy = fromR.y + fromR.h;
  const ex = toR.x + toR.w / 2;
  const ey = toR.y;
  const midy = (sy + ey) / 2;
  return `M ${sx} ${sy} C ${sx} ${midy}, ${ex} ${midy}, ${ex} ${ey}`;
}

/* ── Get edge label position ── */
function getEdgeLabelPos(fromId: string, toId: string): { x: number; y: number; angle: number } {
  const fromNode = NODES.find((n) => n.id === fromId)!;
  const toNode = NODES.find((n) => n.id === toId)!;
  const fromR = getNodeRect(fromNode);
  const toR = getNodeRect(toNode);

  if (fromNode.col === toNode.col) {
    // Vertical — label to the right of midpoint
    const x = fromR.x + fromR.w / 2;
    const midY = (fromR.y + fromR.h + toR.y) / 2;
    return { x: x + 12, y: midY, angle: 0 };
  }
  if (fromNode.row === toNode.row) {
    // Horizontal — label above midpoint
    const midX = (fromR.x + fromR.w + toR.x) / 2;
    const y = fromR.y + fromR.h / 2 - 10;
    return { x: midX, y, angle: 0 };
  }
  // Cross
  const midX = (fromR.x + fromR.w / 2 + toR.x + toR.w / 2) / 2;
  const midY = (fromR.y + fromR.h + toR.y) / 2;
  return { x: midX + 12, y: midY, angle: 0 };
}

/* ── Main Component ── */
const ArchitectureDiagram = () => {
  const { isDark } = useThemeContext();
  const [inView, setInView] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  /* Zoom / pan state */
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const [expanded, setExpanded] = useState(false);

  const totalCols = 2;
  const totalRows = 10;
  const svgW = PAD_X * 2 + (totalCols + 1) * NODE_W + totalCols * COL_GAP;
  const svgH = PAD_Y * 2 + totalRows * NODE_H + (totalRows - 1) * ROW_GAP;

  useEffect(() => {
    const timer = setTimeout(() => setInView(true), 300);
    return () => clearTimeout(timer);
  }, []);

  /* Wheel zoom */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      setScale((s) => Math.min(3, Math.max(0.3, s * delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* Pan handlers */
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (hoveredNode && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    if (!isPanning) return;
    setPan({
      x: panStart.current.panX + (e.clientX - panStart.current.x),
      y: panStart.current.panY + (e.clientY - panStart.current.y),
    });
  }, [isPanning, hoveredNode]);

  const onPointerUp = useCallback(() => { setIsPanning(false); }, []);

  /* Fit to container */
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight || 500;
    const fitScale = Math.min(cw / svgW, ch / svgH) * 0.95;
    setScale(fitScale);
    setPan({ x: 0, y: 0 });
  }, [svgW, svgH]);

  /* Reset zoom */
  const resetZoom = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const bgColor = isDark ? '#1B1A19' : '#FAFAF9';
  const borderColor = isDark ? '#3D3B39' : '#E1DFDD';
  const hoveredNodeData = hoveredNode ? NODES.find((n) => n.id === hoveredNode) : null;

  /* Zone backgrounds — highlight grouped areas */
  const sparkZone = {
    x: nodeX(0) - 16,
    y: nodeY(0) - 16,
    w: 2 * (NODE_W + COL_GAP) + NODE_W + 32 - COL_GAP,
    h: 4 * (NODE_H + ROW_GAP) - ROW_GAP + 32,
  };
  const olZone = {
    x: nodeX(1) - 16,
    y: nodeY(4) - 16,
    w: NODE_W + 32,
    h: 6 * (NODE_H + ROW_GAP) - ROW_GAP + 32,
  };
  const deltaZone = {
    x: nodeX(0) - 16,
    y: nodeY(2) - 16,
    w: NODE_W + 32,
    h: NODE_H + 32,
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        overflow: 'hidden',
        borderRadius: '12px',
        border: `1px solid ${borderColor}`,
        backgroundColor: bgColor,
        position: 'relative',
        cursor: isPanning ? 'grabbing' : 'grab',
        height: expanded ? '85vh' : 'auto',
        maxHeight: expanded ? '85vh' : undefined,
        transition: 'height 0.3s ease',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${svgW} ${svgH}`}
        width="100%"
        style={{
          display: 'block',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.2s ease',
        }}
      >
        <defs>
          {Object.entries(PALETTES).map(([tech, pal]) => (
            <linearGradient key={tech} id={`grad-${tech}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={pal.gradStart} />
              <stop offset="100%" stopColor={pal.gradEnd} />
            </linearGradient>
          ))}
          <filter id="packetGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="nodeShadow" x="-10%" y="-10%" width="130%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="5" floodOpacity={isDark ? 0.5 : 0.12} />
          </filter>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <path d="M0,0 L10,3.5 L0,7" fill={isDark ? '#605E5C' : '#A19F9D'} />
          </marker>
        </defs>

        {/* ── Zone backgrounds ── */}
        <motion.rect
          x={sparkZone.x} y={sparkZone.y}
          width={sparkZone.w} height={sparkZone.h}
          rx={12}
          fill={isDark ? PALETTES.spark.bgZoneDark : PALETTES.spark.bgZone}
          stroke={PALETTES.spark.glow}
          strokeWidth={1}
          strokeDasharray="6 3"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
        />
        <motion.rect
          x={olZone.x} y={olZone.y}
          width={olZone.w} height={olZone.h}
          rx={12}
          fill={isDark ? PALETTES.openlineage.bgZoneDark : PALETTES.openlineage.bgZone}
          stroke={PALETTES.openlineage.glow}
          strokeWidth={1}
          strokeDasharray="6 3"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
        <motion.rect
          x={deltaZone.x} y={deltaZone.y}
          width={deltaZone.w} height={deltaZone.h}
          rx={12}
          fill={isDark ? PALETTES.delta.bgZoneDark : PALETTES.delta.bgZone}
          stroke={PALETTES.delta.glow}
          strokeWidth={1}
          strokeDasharray="6 3"
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
        />

        {/* ── Edge paths with labels ── */}
        {EDGES.map((edge, i) => {
          const pathD = getEdgePath(edge.from, edge.to);
          const fromNode = NODES.find((n) => n.id === edge.from)!;
          const particleColor = PALETTES[fromNode.tech].particle;
          const labelPos = edge.label ? getEdgeLabelPos(edge.from, edge.to) : null;

          return (
            <g key={`edge-${edge.from}-${edge.to}`}>
              <motion.path
                d={pathD}
                fill="none"
                stroke={isDark ? '#555250' : '#B8B6B4'}
                strokeWidth={2}
                strokeDasharray="6 4"
                markerEnd="url(#arrowhead)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={inView ? { pathLength: 1, opacity: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.6 + i * 0.12, ease: 'easeOut' }}
              />
              {/* Edge label */}
              {labelPos && edge.label && (
                <motion.text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="'Segoe UI', sans-serif"
                  fontWeight={600}
                  fill={isDark ? '#8A8886' : '#797775'}
                  transform={labelPos.angle ? `rotate(${labelPos.angle}, ${labelPos.x}, ${labelPos.y})` : undefined}
                  initial={{ opacity: 0 }}
                  animate={inView ? { opacity: 1 } : {}}
                  transition={{ delay: 1.6 + i * 0.1 }}
                >
                  {edge.label}
                </motion.text>
              )}
              {/* Animated data packet */}
              {inView && (
                <motion.circle
                  r={5}
                  fill={particleColor}
                  filter="url(#packetGlow)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 3, delay: 2.5 + i * 0.5, repeat: Infinity, repeatDelay: 4, ease: 'linear' }}
                >
                  <animateMotion dur="3s" begin={`${2.5 + i * 0.5}s`} repeatCount="indefinite" path={pathD} />
                </motion.circle>
              )}
            </g>
          );
        })}

        {/* ── Nodes ── */}
        {NODES.map((node, i) => {
          const rect = getNodeRect(node);
          const pal = PALETTES[node.tech];
          const isHovered = hoveredNode === node.id;

          return (
            <motion.g
              key={node.id}
              initial={{ opacity: 0, y: 25 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.07, ease: 'easeOut' }}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer' }}
            >
              {/* Glow ring */}
              <motion.rect
                x={rect.x - 4}
                y={rect.y - 4}
                width={rect.w + 8}
                height={rect.h + 8}
                rx={14}
                fill="none"
                stroke={pal.glow}
                strokeWidth={isHovered ? 3 : 1.5}
                animate={{ strokeWidth: isHovered ? 3 : 1.5, opacity: isHovered ? 1 : 0.5 }}
                transition={{ duration: 0.2 }}
              />
              {/* Background card */}
              <rect
                x={rect.x}
                y={rect.y}
                width={rect.w}
                height={rect.h}
                rx={10}
                fill={`url(#grad-${node.tech})`}
                filter="url(#nodeShadow)"
              />
              {/* Illustration in top-right */}
              <foreignObject x={rect.x + rect.w - 62} y={rect.y + 4} width={58} height={58}>
                <NodeIllustration icon={node.icon} color={pal.text} />
              </foreignObject>
              {/* Step number badge (top-left corner) */}
              <circle
                cx={rect.x}
                cy={rect.y}
                r={13}
                fill={isDark ? '#1B1A19' : '#FFFFFF'}
                stroke={pal.gradStart}
                strokeWidth={2.5}
              />
              <text
                x={rect.x}
                y={rect.y + 5}
                textAnchor="middle"
                fill={pal.gradStart}
                fontSize={13}
                fontWeight={800}
                fontFamily="'Segoe UI', sans-serif"
              >
                {node.step}
              </text>
              {/* Label */}
              <text
                x={rect.x + 16}
                y={rect.y + 30}
                fill={pal.text}
                fontSize={17}
                fontWeight={700}
                fontFamily="'Segoe UI', sans-serif"
              >
                {node.label}
              </text>
              {/* Subtitle */}
              <text
                x={rect.x + 16}
                y={rect.y + 50}
                fill={pal.text}
                fontSize={12.5}
                fontWeight={600}
                fontFamily="'Segoe UI', sans-serif"
                opacity={0.85}
              >
                {node.subtitle}
              </text>
              {/* Multi-line description */}
              <foreignObject x={rect.x + 14} y={rect.y + 58} width={rect.w - 28} height={72}>
                <div style={{
                  fontSize: '11.5px',
                  lineHeight: '1.4',
                  color: pal.text,
                  opacity: 0.75,
                  fontFamily: "'Segoe UI', sans-serif",
                  overflow: 'hidden',
                }}>
                  {node.description}
                </div>
              </foreignObject>
            </motion.g>
          );
        })}

        {/* ── Legend (top-right, vertical) ── */}
        {(() => {
          const lx = svgW - LEGEND_W - 16;
          const ly = PAD_Y + 20;
          const items: { tech: Tech; label: string }[] = [
            { tech: 'spark', label: 'Apache Spark' },
            { tech: 'openlineage', label: 'OpenLineage' },
            { tech: 'delta', label: 'Delta Lake' },
          ];
          return (
            <motion.g
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ delay: 2 }}
            >
              <rect
                x={lx - 10}
                y={ly - 16}
                width={LEGEND_W}
                height={items.length * 28 + 28}
                rx={8}
                fill={isDark ? 'rgba(37,36,35,0.9)' : 'rgba(255,255,255,0.9)'}
                stroke={isDark ? '#3D3B39' : '#E1DFDD'}
                strokeWidth={1}
              />
              <text
                x={lx}
                y={ly}
                fontSize={9}
                fontWeight={700}
                fill={isDark ? '#A19F9D' : '#605E5C'}
                fontFamily="'Segoe UI', sans-serif"
                letterSpacing={0.5}
              >
                LEGEND
              </text>
              {items.map((item, idx) => (
                <g key={item.tech}>
                  <rect
                    x={lx}
                    y={ly + 10 + idx * 28}
                    width={16}
                    height={16}
                    rx={4}
                    fill={`url(#grad-${item.tech})`}
                  />
                  <text
                    x={lx + 24}
                    y={ly + 22 + idx * 28}
                    fontSize={10}
                    fontWeight={500}
                    fill={isDark ? '#D2D0CE' : '#323130'}
                    fontFamily="'Segoe UI', sans-serif"
                  >
                    {item.label}
                  </text>
                </g>
              ))}
            </motion.g>
          );
        })()}
      </svg>

      {/* ── Zoom / Pan controls (bottom-right) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          right: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          zIndex: 50,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {[
          { label: '+', title: 'Zoom in', action: () => setScale((s) => Math.min(3, s * 1.25)) },
          { label: '−', title: 'Zoom out', action: () => setScale((s) => Math.max(0.3, s * 0.8)) },
          { label: '⤢', title: expanded ? 'Collapse' : 'Expand to fit', action: () => { setExpanded((v) => !v); setTimeout(fitToView, 350); } },
          { label: '↺', title: 'Reset view', action: () => { setExpanded(false); resetZoom(); } },
        ].map((btn) => (
          <button
            key={btn.label}
            title={btn.title}
            onClick={btn.action}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: `1px solid ${isDark ? '#484644' : '#E1DFDD'}`,
              backgroundColor: isDark ? '#2D2C2B' : '#FFFFFF',
              color: isDark ? '#D2D0CE' : '#323130',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Segoe UI', sans-serif",
              transition: 'border-color 0.15s, background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = '#0078D4';
              (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#383736' : '#F3F2F1';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.borderColor = isDark ? '#484644' : '#E1DFDD';
              (e.currentTarget as HTMLElement).style.backgroundColor = isDark ? '#2D2C2B' : '#FFFFFF';
            }}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* ── Hover Tooltip (HTML overlay) ── */}
      <AnimatePresence>
        {hoveredNodeData && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'absolute',
              left: Math.min(tooltipPos.x + 16, (containerRef.current?.clientWidth || 600) - 380),
              top: tooltipPos.y + 16,
              width: '360px',
              maxHeight: '320px',
              backgroundColor: isDark ? '#2D2C2B' : '#FFFFFF',
              border: `1px solid ${isDark ? '#484644' : '#E1DFDD'}`,
              borderRadius: '10px',
              boxShadow: isDark
                ? '0 8px 32px rgba(0,0,0,0.5)'
                : '0 8px 32px rgba(0,0,0,0.12)',
              padding: '16px',
              pointerEvents: 'none',
              zIndex: 100,
              fontFamily: "'Segoe UI', sans-serif",
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '8px',
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${PALETTES[hoveredNodeData.tech].gradStart}, ${PALETTES[hoveredNodeData.tech].gradEnd})`,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize: '13px',
                fontWeight: 700,
                color: isDark ? '#FAF9F8' : '#323130',
              }}>
                {hoveredNodeData.tooltip.heading}
              </span>
            </div>
            <div style={{
              fontSize: '10px',
              fontWeight: 600,
              color: isDark ? '#A19F9D' : '#605E5C',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '6px',
            }}>
              {hoveredNodeData.tooltip.sampleLabel}
            </div>
            <pre style={{
              fontSize: '10.5px',
              lineHeight: '1.45',
              color: isDark ? '#D2D0CE' : '#323130',
              backgroundColor: isDark ? '#1B1A19' : '#F3F2F1',
              borderRadius: '6px',
              padding: '10px 12px',
              margin: 0,
              overflowX: 'auto',
              whiteSpace: 'pre',
              fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
              border: `1px solid ${isDark ? '#323130' : '#EDEBE9'}`,
            }}>
              {hoveredNodeData.tooltip.sample}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export { STEPS, PALETTES };
export default ArchitectureDiagram;
