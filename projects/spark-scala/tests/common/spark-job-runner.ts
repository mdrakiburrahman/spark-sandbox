import { execSync } from "child_process";
import { resolve } from "path";

const SPARK_SCALA_DIR = resolve(__dirname, "../..");
const SPARK_SUBMIT_DIR = resolve(SPARK_SCALA_DIR, "../spark-submit");

/**
 * Runs Spark jobs by invoking the spark-submit CLI directly,
 * bypassing nested Nx which can swallow output.
 *
 * Replaces the legacy `.scripts/run-spark-jobs.sh` bash wrapper:
 *   - alias resolution lives in `projects/spark-submit/config/spark-jobs.yaml`
 *   - resource/configs are derived from `spark-demo/.../config-dev-devcontainer.yaml`
 *   - logs land under `projects/spark-submit/.logs/session-*/`
 */
export class SparkJobRunner {
  static runJob(alias: string, timeoutMs = 600_000): void {
    console.log(`[SparkJobRunner] ▶ ${alias}`);
    const start = performance.now();
    execSync(`npx tsx index.ts --job=${alias} --no-dag`, {
      cwd: SPARK_SUBMIT_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "inherit", "inherit"],
      timeout: timeoutMs,
    });
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`[SparkJobRunner] Done ${alias} (${elapsed}s)`);
  }
}
