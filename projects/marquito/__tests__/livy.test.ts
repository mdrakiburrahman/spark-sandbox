import { parseStatementResult } from '../src/lib/livy/client';
import { LivyStatementResponse } from '../src/lib/livy/types';
import { buildBaseUrl } from '../src/lib/livy/types';

describe('Livy Client', () => {
  describe('buildBaseUrl', () => {
    it('builds URL with defaults', () => {
      const url = buildBaseUrl({
        jwt: 'token',
        workspaceId: 'ws-123',
        lakehouseId: 'lh-456',
      });
      expect(url).toBe(
        'https://api.fabric.microsoft.com/v1/workspaces/ws-123/lakehouses/lh-456/livyApi/versions/2023-12-01'
      );
    });

    it('uses custom endpoint and version', () => {
      const url = buildBaseUrl({
        jwt: 'token',
        workspaceId: 'ws-123',
        lakehouseId: 'lh-456',
        endpoint: 'https://custom.api.com/v2',
        livyApiVersion: '2024-01-01',
      });
      expect(url).toBe(
        'https://custom.api.com/v2/workspaces/ws-123/lakehouses/lh-456/livyApi/versions/2024-01-01'
      );
    });
  });

  describe('parseStatementResult', () => {
    it('parses a successful SQL result', () => {
      const stmt: LivyStatementResponse = {
        id: 1,
        state: 'available',
        output: {
          status: 'ok',
          data: {
            'application/json': {
              schema: {
                type: 'struct',
                fields: [
                  { name: 'id', type: 'integer', nullable: false, metadata: {} },
                  { name: 'name', type: 'string', nullable: true, metadata: {} },
                  { name: 'value', type: 'double', nullable: true, metadata: {} },
                ],
              },
              data: [
                [1, 'alpha', 10.5],
                [2, 'beta', 20.3],
                [3, 'gamma', 30.1],
              ],
            },
          },
        },
      };

      const result = parseStatementResult(stmt);

      expect(result.columns).toEqual(['id', 'name', 'value']);
      expect(result.columnTypes).toEqual(['integer', 'string', 'double']);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual({ id: 1, name: 'alpha', value: 10.5 });
      expect(result.rows[1]).toEqual({ id: 2, name: 'beta', value: 20.3 });
      expect(result.rows[2]).toEqual({ id: 3, name: 'gamma', value: 30.1 });
    });

    it('returns empty result for no data', () => {
      const stmt: LivyStatementResponse = {
        id: 2,
        state: 'available',
        output: {
          status: 'ok',
          data: {},
        },
      };

      const result = parseStatementResult(stmt);
      expect(result.columns).toEqual([]);
      expect(result.rows).toEqual([]);
    });

    it('throws on error status', () => {
      const stmt: LivyStatementResponse = {
        id: 3,
        state: 'available',
        output: {
          status: 'error',
          evalue: 'Table not found: foo.bar',
        },
      };

      expect(() => parseStatementResult(stmt)).toThrow('Table not found: foo.bar');
    });

    it('handles SHOW DATABASES response format', () => {
      const stmt: LivyStatementResponse = {
        id: 4,
        state: 'available',
        output: {
          status: 'ok',
          data: {
            'application/json': {
              schema: {
                type: 'struct',
                fields: [
                  { name: 'namespace', type: 'string', nullable: false, metadata: {} },
                ],
              },
              data: [['default'], ['staging'], ['production']],
            },
          },
        },
      };

      const result = parseStatementResult(stmt);
      expect(result.columns).toEqual(['namespace']);
      expect(result.rows).toEqual([
        { namespace: 'default' },
        { namespace: 'staging' },
        { namespace: 'production' },
      ]);
    });

    it('handles DESCRIBE HISTORY response', () => {
      const stmt: LivyStatementResponse = {
        id: 5,
        state: 'available',
        output: {
          status: 'ok',
          data: {
            'application/json': {
              schema: {
                type: 'struct',
                fields: [
                  { name: 'version', type: 'long', nullable: false, metadata: {} },
                  { name: 'timestamp', type: 'string', nullable: false, metadata: {} },
                  { name: 'operation', type: 'string', nullable: true, metadata: {} },
                  { name: 'operationMetrics', type: 'map', nullable: true, metadata: {} },
                ],
              },
              data: [
                [5, '2025-01-15T10:00:00Z', 'WRITE', { numOutputRows: '1000', numAddedFiles: '2' }],
                [4, '2025-01-14T10:00:00Z', 'MERGE', { numOutputRows: '500', numAddedFiles: '1' }],
                [3, '2025-01-13T10:00:00Z', 'OPTIMIZE', null],
              ],
            },
          },
        },
      };

      const result = parseStatementResult(stmt);
      expect(result.rows).toHaveLength(3);
      expect(result.rows[0]).toEqual({
        version: 5,
        timestamp: '2025-01-15T10:00:00Z',
        operation: 'WRITE',
        operationMetrics: { numOutputRows: '1000', numAddedFiles: '2' },
      });
    });
  });
});
