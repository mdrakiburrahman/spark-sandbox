import { execSync } from 'child_process';
import { resolve } from 'path';

const SPARK_SCALA_DIR = resolve(__dirname, '../..');
const GIT_ROOT = resolve(SPARK_SCALA_DIR, '../..');

/**
 * Runs Spark jobs via `npx nx run spark-scala:run`.
 */
export class NxRunner {
  static runJob(alias: string, timeoutMs = 600_000): void {
    execSync(
      `npx nx run spark-scala:run --JOB='${alias}' --verbose --output-style=stream`,
      {
        cwd: GIT_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'inherit', 'inherit'],
        timeout: timeoutMs,
      }
    );
  }
}
