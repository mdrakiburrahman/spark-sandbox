export interface OpenLineageEvent {
  eventTime: string;
  producer: string;
  schemaURL: string;
  eventType: 'START' | 'COMPLETE' | 'FAIL' | 'ABORT' | 'OTHER' | 'RUNNING';
  run: RunInfo;
  job: JobInfo;
  inputs: DatasetRef[];
  outputs: DatasetRef[];
}

export interface RunInfo {
  runId: string;
  facets?: {
    parent?: ParentFacet;
    spark_properties?: SparkPropertiesFacet;
    processing_engine?: ProcessingEngineFacet;
    spark_applicationDetails?: SparkAppDetailsFacet;
    [key: string]: unknown;
  };
}

export interface ParentFacet {
  run: { runId: string };
  job: { namespace: string; name: string };
  [key: string]: unknown;
}

export interface SparkPropertiesFacet {
  properties: Record<string, string>;
  [key: string]: unknown;
}

export interface ProcessingEngineFacet {
  version: string;
  name: string;
  openlineageAdapterVersion: string;
  [key: string]: unknown;
}

export interface SparkAppDetailsFacet {
  master: string;
  appName: string;
  applicationId: string;
  deployMode: string;
  driverHost: string;
  userName: string;
  uiWebUrl: string;
  [key: string]: unknown;
}

export interface JobInfo {
  namespace: string;
  name: string;
  facets?: {
    jobType?: JobTypeFacet;
    sql?: SqlFacet;
    [key: string]: unknown;
  };
}

export interface JobTypeFacet {
  processingType: string;
  integration: string;
  jobType: string;
  [key: string]: unknown;
}

export interface SqlFacet {
  query: string;
  [key: string]: unknown;
}

export interface DatasetRef {
  namespace: string;
  name: string;
  facets?: {
    schema?: SchemaFacet;
    columnLineage?: ColumnLineageFacet;
    symlinks?: SymlinksFacet;
    storage?: StorageFacet;
    lifecycleStateChange?: LifecycleStateFacet;
    [key: string]: unknown;
  };
}

export interface SchemaFacet {
  fields: SchemaField[];
  [key: string]: unknown;
}

export interface SchemaField {
  name: string;
  type: string;
  description?: string;
}

export interface ColumnLineageFacet {
  fields: Record<string, ColumnLineageField>;
  [key: string]: unknown;
}

export interface ColumnLineageField {
  inputFields: ColumnInputField[];
  transformationDescription?: string;
  transformationType?: string;
}

export interface ColumnInputField {
  namespace: string;
  name: string;
  field: string;
  transformations?: ColumnTransformation[];
}

export interface ColumnTransformation {
  type: string;
  subtype: string;
  description: string;
  masking: boolean;
}

export interface SymlinksFacet {
  identifiers: Array<{ namespace: string; name: string; type: string }>;
  [key: string]: unknown;
}

export interface StorageFacet {
  storageLayer: string;
  fileFormat: string;
  [key: string]: unknown;
}

export interface LifecycleStateFacet {
  lifecycleStateChange: string;
  [key: string]: unknown;
}

// Derived types for UI

export interface ParsedJob {
  name: string;
  namespace: string;
  type: string;
  processingType: string;
  integration: string;
  latestEventType: string;
  latestEventTime: string;
  sql?: string;
  runId: string;
}

export interface ParsedDataset {
  name: string;
  namespace: string;
  shortName: string;
  schema: SchemaField[];
  role: 'source' | 'intermediate' | 'target';
  columnLineage?: Record<string, ColumnLineageField>;
}

export interface ColumnLineageEdge {
  sourceDataset: string;
  sourceField: string;
  targetDataset: string;
  targetField: string;
  transformationType: string;
  transformationSubtype: string;
}

export interface ParsedLineage {
  events: OpenLineageEvent[];
  jobs: ParsedJob[];
  datasets: ParsedDataset[];
  columnLineageEdges: ColumnLineageEdge[];
  tableLineageEdges: Array<{ source: string; target: string; job: string }>;
  stats: {
    totalEvents: number;
    totalJobs: number;
    totalDatasets: number;
    columnLineageCount: number;
    startEvents: number;
    completeEvents: number;
  };
}
