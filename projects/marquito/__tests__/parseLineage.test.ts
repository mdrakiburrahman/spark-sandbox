import { parseLineageText, validateJsonl, SAMPLE_DATASETS } from '../src/lib/parseLineage';

// ---------------------------------------------------------------------------
// Helper: build a minimal OpenLineage event as a JSON string
// ---------------------------------------------------------------------------
function makeEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventTime: '2024-01-01T00:00:00Z',
    producer: 'test',
    schemaURL: 'https://openlineage.io/spec/2-0-2/OpenLineage.json',
    eventType: 'COMPLETE',
    run: { runId: 'run-1' },
    job: {
      namespace: 'test-ns',
      name: 'job1',
      facets: {
        jobType: { processingType: 'BATCH', integration: 'SPARK', jobType: 'SQL_JOB' },
      },
    },
    inputs: [],
    outputs: [],
    ...overrides,
  };
}

function toJsonl(...objects: Record<string, unknown>[]): string {
  return objects.map((o) => JSON.stringify(o)).join('\n');
}

// ---------------------------------------------------------------------------
// Realistic two-job pipeline events for integration tests
//
//   table_a (source)  ──►  job1  ──►  table_b (intermediate)  ──►  job2  ──►  table_c (target)
//
// Column lineage:
//   table_a.id    ──IDENTITY──►  table_b.id    ──IDENTITY──►  table_c.id
//   table_a.name  ──TRANSFORM──► table_b.full_name ──TRANSFORM──► table_c.customer_name
// ---------------------------------------------------------------------------

const job1Start = makeEvent({
  eventType: 'START',
  eventTime: '2024-01-01T00:00:00Z',
  run: { runId: 'run-1' },
  job: {
    namespace: 'test-ns',
    name: 'job1',
    facets: { jobType: { processingType: 'BATCH', integration: 'SPARK', jobType: 'SQL_JOB' } },
  },
  inputs: [
    {
      namespace: 'file',
      name: '/data/source.db/table_a',
      facets: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'name', type: 'string' },
          ],
        },
      },
    },
  ],
  outputs: [],
});

const job1Complete = makeEvent({
  eventType: 'COMPLETE',
  eventTime: '2024-01-01T00:01:00Z',
  run: { runId: 'run-1' },
  job: {
    namespace: 'test-ns',
    name: 'job1',
    facets: { jobType: { processingType: 'BATCH', integration: 'SPARK', jobType: 'SQL_JOB' } },
  },
  inputs: [
    {
      namespace: 'file',
      name: '/data/source.db/table_a',
      facets: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'name', type: 'string' },
          ],
        },
      },
    },
  ],
  outputs: [
    {
      namespace: 'file',
      name: '/data/target.db/table_b',
      facets: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'full_name', type: 'string' },
          ],
        },
        columnLineage: {
          fields: {
            id: {
              inputFields: [
                {
                  namespace: 'file',
                  name: '/data/source.db/table_a',
                  field: 'id',
                  transformations: [{ type: 'DIRECT', subtype: 'IDENTITY', description: '', masking: false }],
                },
              ],
            },
            full_name: {
              inputFields: [
                {
                  namespace: 'file',
                  name: '/data/source.db/table_a',
                  field: 'name',
                  transformations: [{ type: 'DIRECT', subtype: 'TRANSFORMATION', description: '', masking: false }],
                },
              ],
            },
          },
        },
      },
    },
  ],
});

const job2Start = makeEvent({
  eventType: 'START',
  eventTime: '2024-01-01T00:02:00Z',
  run: { runId: 'run-2' },
  job: {
    namespace: 'test-ns',
    name: 'job2',
    facets: { jobType: { processingType: 'BATCH', integration: 'SPARK', jobType: 'SQL_JOB' } },
  },
  inputs: [
    {
      namespace: 'file',
      name: '/data/target.db/table_b',
      facets: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'full_name', type: 'string' },
          ],
        },
      },
    },
  ],
  outputs: [],
});

const job2Complete = makeEvent({
  eventType: 'COMPLETE',
  eventTime: '2024-01-01T00:03:00Z',
  run: { runId: 'run-2' },
  job: {
    namespace: 'test-ns',
    name: 'job2',
    facets: { jobType: { processingType: 'BATCH', integration: 'SPARK', jobType: 'SQL_JOB' } },
  },
  inputs: [
    {
      namespace: 'file',
      name: '/data/target.db/table_b',
      facets: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'full_name', type: 'string' },
          ],
        },
      },
    },
  ],
  outputs: [
    {
      namespace: 'file',
      name: '/data/target.db/table_c',
      facets: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'customer_name', type: 'string' },
          ],
        },
        columnLineage: {
          fields: {
            id: {
              inputFields: [
                {
                  namespace: 'file',
                  name: '/data/target.db/table_b',
                  field: 'id',
                  transformations: [{ type: 'DIRECT', subtype: 'IDENTITY', description: '', masking: false }],
                },
              ],
            },
            customer_name: {
              inputFields: [
                {
                  namespace: 'file',
                  name: '/data/target.db/table_b',
                  field: 'full_name',
                  transformations: [{ type: 'DIRECT', subtype: 'TRANSFORMATION', description: '', masking: false }],
                },
              ],
            },
          },
        },
      },
    },
  ],
});

const applicationEvent = makeEvent({
  eventType: 'COMPLETE',
  eventTime: '2024-01-01T00:04:00Z',
  run: { runId: 'run-app' },
  job: {
    namespace: 'test-ns',
    name: 'spark-app',
    facets: { jobType: { processingType: 'NONE', integration: 'SPARK', jobType: 'APPLICATION' } },
  },
  inputs: [],
  outputs: [],
});

const pipelineJsonl = toJsonl(job1Start, job1Complete, job2Start, job2Complete, applicationEvent);

// ===========================================================================
// Tests
// ===========================================================================

describe('validateJsonl', () => {
  it('returns valid for proper OpenLineage JSONL', () => {
    const text = toJsonl(makeEvent(), makeEvent({ eventType: 'START', run: { runId: 'run-2' } }));
    const result = validateJsonl(text);
    expect(result.valid).toBe(true);
    expect(result.eventCount).toBe(2);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid for empty input', () => {
    const result = validateJsonl('');
    expect(result.valid).toBe(false);
    expect(result.eventCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/empty/i);
  });

  it('returns invalid for whitespace-only input', () => {
    const result = validateJsonl('   \n  \n  ');
    expect(result.valid).toBe(false);
    expect(result.eventCount).toBe(0);
  });

  it('reports error for invalid JSON on a line', () => {
    const text = JSON.stringify(makeEvent()) + '\n{not valid json}';
    const result = validateJsonl(text);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/Line 2.*Invalid JSON/)]));
  });

  it('reports error for missing eventType', () => {
    const event = makeEvent();
    delete event.eventType;
    const result = validateJsonl(JSON.stringify(event));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/eventType/);
  });

  it('reports error for missing job field', () => {
    const event = makeEvent();
    delete event.job;
    const result = validateJsonl(JSON.stringify(event));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/job/);
  });

  it('reports error for missing run field', () => {
    const event = makeEvent();
    delete event.run;
    const result = validateJsonl(JSON.stringify(event));
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/run/);
  });

  it('validates fields in order: eventType → job → run', () => {
    // Missing eventType is checked first even if job/run also missing
    const result = validateJsonl(JSON.stringify({}));
    expect(result.errors[0]).toMatch(/eventType/);
  });

  it('handles a mix of valid and invalid lines', () => {
    const lines = [
      JSON.stringify(makeEvent()),
      '{bad json',
      JSON.stringify(makeEvent({ eventType: 'START', run: { runId: 'run-x' } })),
      JSON.stringify({}), // missing eventType
    ];
    const result = validateJsonl(lines.join('\n'));
    expect(result.valid).toBe(false);
    expect(result.eventCount).toBe(2);
    expect(result.errors).toHaveLength(2);
  });

  it('stops collecting errors after 5', () => {
    const badLines = Array.from({ length: 10 }, () => '{bad}');
    const result = validateJsonl(badLines.join('\n'));
    // 5 actual error messages + 1 "stopped after 5" message
    expect(result.errors).toHaveLength(6);
    expect(result.errors[5]).toMatch(/stopped after 5/);
  });
});

describe('parseLineageText', () => {
  const parsed = parseLineageText(pipelineJsonl);

  it('parses all events including APPLICATION events', () => {
    // parseLineageText parses all lines; APPLICATION is filtered during processing
    expect(parsed.events).toHaveLength(5);
  });

  it('extracts correct number of jobs (skips APPLICATION)', () => {
    expect(parsed.jobs).toHaveLength(2);
    const jobNames = parsed.jobs.map((j) => j.name);
    expect(jobNames).toContain('job1');
    expect(jobNames).toContain('job2');
    expect(jobNames).not.toContain('spark-app');
  });

  it('extracts correct number of datasets', () => {
    expect(parsed.datasets).toHaveLength(3);
  });

  it('creates table lineage edges', () => {
    // job1: table_a→job1, job1→table_b
    // job2: table_b→job2, job2→table_c
    expect(parsed.tableLineageEdges.length).toBe(4);
  });

  it('extracts column lineage edges', () => {
    // job1 produces 2 column edges (id, full_name)
    // job2 produces 2 column edges (id, customer_name)
    expect(parsed.columnLineageEdges).toHaveLength(4);
  });

  it('records correct transformation types on column edges', () => {
    const identityEdges = parsed.columnLineageEdges.filter(
      (e) => e.transformationSubtype === 'IDENTITY'
    );
    const transformEdges = parsed.columnLineageEdges.filter(
      (e) => e.transformationSubtype === 'TRANSFORMATION'
    );
    expect(identityEdges).toHaveLength(2);
    expect(transformEdges).toHaveLength(2);
  });

  it('column edge references correct source and target datasets', () => {
    const edge = parsed.columnLineageEdges.find(
      (e) => e.sourceField === 'name' && e.targetField === 'full_name'
    );
    expect(edge).toBeDefined();
    expect(edge!.sourceDataset).toBe('file::/data/source.db/table_a');
    expect(edge!.targetDataset).toBe('file::/data/target.db/table_b');
  });

  it('computes stats correctly', () => {
    expect(parsed.stats).toEqual({
      totalEvents: 5,
      totalJobs: 2,
      totalDatasets: 3,
      columnLineageCount: 4,
      startEvents: 2,
      completeEvents: 3, // 2 job completes + 1 application complete (counted in events)
    });
  });

  it('stores job metadata from COMPLETE events', () => {
    const job1 = parsed.jobs.find((j) => j.name === 'job1')!;
    expect(job1.latestEventType).toBe('COMPLETE');
    expect(job1.namespace).toBe('test-ns');
    expect(job1.type).toBe('SQL_JOB');
    expect(job1.processingType).toBe('BATCH');
    expect(job1.integration).toBe('SPARK');
    expect(job1.runId).toBe('run-1');
  });

  it('stores schema fields on datasets', () => {
    const tableA = parsed.datasets.find((d) => d.name === '/data/source.db/table_a')!;
    expect(tableA.schema).toHaveLength(2);
    expect(tableA.schema.map((f) => f.name)).toEqual(['id', 'name']);
  });

  it('generates short names for datasets', () => {
    const tableA = parsed.datasets.find((d) => d.name === '/data/source.db/table_a')!;
    expect(tableA.shortName).toBe('source.db/table_a');
  });
});

describe('dataset role classification', () => {
  const parsed = parseLineageText(pipelineJsonl);

  it('classifies source datasets (only used as input)', () => {
    const tableA = parsed.datasets.find((d) => d.name === '/data/source.db/table_a')!;
    expect(tableA.role).toBe('source');
  });

  it('classifies target datasets (only used as output)', () => {
    const tableC = parsed.datasets.find((d) => d.name === '/data/target.db/table_c')!;
    expect(tableC.role).toBe('target');
  });

  it('classifies intermediate datasets (used as both input and output)', () => {
    const tableB = parsed.datasets.find((d) => d.name === '/data/target.db/table_b')!;
    expect(tableB.role).toBe('intermediate');
  });
});

describe('SAMPLE_DATASETS constant', () => {
  it('contains exactly 3 sample datasets', () => {
    expect(SAMPLE_DATASETS).toHaveLength(3);
  });

  it.each(SAMPLE_DATASETS)('sample "$id" has required fields', (sample) => {
    expect(sample.id).toBeTruthy();
    expect(sample.label).toBeTruthy();
    expect(sample.fileName).toBeTruthy();
    expect(sample.localPath).toBeTruthy();
  });

  it('has unique ids', () => {
    const ids = SAMPLE_DATASETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
