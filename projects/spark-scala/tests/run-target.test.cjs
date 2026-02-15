const { execSync } = require('child_process');
const { resolve } = require('path');

const SPARK_SCALA_DIR = resolve(__dirname, '..');
const SCRIPT = resolve(SPARK_SCALA_DIR, '.scripts/run-spark-jobs.sh');

describe('spark-scala run target', () => {
  it('forwards JOB arg to run-spark-jobs.sh and fails on invalid alias', () => {
    expect(() => {
      execSync(`bash ${SCRIPT} invalid-job-alias`, {
        cwd: SPARK_SCALA_DIR,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
    }).toThrow();
  });

  it('forwards JOB arg and prints available jobs when no alias given', () => {
    try {
      execSync(`bash ${SCRIPT}`, {
        cwd: SPARK_SCALA_DIR,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30_000,
      });
      throw new Error('Expected command to fail');
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || '');
      expect(output).toContain('Available job aliases');
    }
  });
});
