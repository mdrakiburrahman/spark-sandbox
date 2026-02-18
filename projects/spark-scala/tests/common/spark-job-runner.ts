import { execSync } from "child_process";
import { resolve } from "path";

const SPARK_SCALA_DIR = resolve(__dirname, "../..");

/**
 * Runs Spark jobs by invoking run-spark-jobs.sh directly,
 * bypassing nested Nx which can swallow output.
 */
export class SparkJobRunner {
  static runJob(alias: string, timeoutMs = 600_000): void {
    console.log(`[SparkJobRunner] ▶ ${alias}`);
    const start = performance.now();
    execSync(`.scripts/run-spark-jobs.sh ${alias}`, {
      cwd: SPARK_SCALA_DIR,
      encoding: "utf-8",
      stdio: ["pipe", "inherit", "inherit"],
      timeout: timeoutMs,
    });
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`[SparkJobRunner] Done ${alias} (${elapsed}s)`);
  }
}
