import { execSync, execFile } from "child_process";
import { resolve } from "path";

const SPARK_SCALA_DIR = resolve(__dirname, "../..");
const SPARK_SQL_BIN = "/opt/spark/bin/spark-sql";

const SPARK_SQL_ARGS = [
  "--packages io.delta:delta-spark_2.12:3.2.0",
  '--conf "spark.sql.extensions=io.delta.sql.DeltaSparkSessionExtension"',
  '--conf "spark.sql.catalog.spark_catalog=org.apache.spark.sql.delta.catalog.DeltaCatalog"',
  '--conf "spark.hadoop.hive.cli.print.header=true"',
].join(" ");

/**
 * Executes queries via the spark-sql CLI and parses results.
 */
export class SparkSql {
  static query(sql: string, timeoutMs = 120_000): string {
    console.log(`[SparkSql] ▶ ${sql}`);
    const start = performance.now();
    const result = execSync(
      `${SPARK_SQL_BIN} ${SPARK_SQL_ARGS} -e "${sql}" --silent 2>/dev/null`,
      {
        cwd: SPARK_SCALA_DIR,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: timeoutMs,
      },
    );
    const elapsed = ((performance.now() - start) / 1000).toFixed(2);
    console.log(`[SparkSql] Done ${sql} (${elapsed}s)`);
    return result;
  }

  static queryAsync(sql: string, timeoutMs = 120_000): Promise<string> {
    console.log(`[SparkSql] ▶ ${sql}`);
    const start = performance.now();
    return new Promise((resolve, reject) => {
      execFile(
        "bash",
        ["-c", `${SPARK_SQL_BIN} ${SPARK_SQL_ARGS} -e "${sql}" --silent 2>/dev/null`],
        { cwd: SPARK_SCALA_DIR, encoding: "utf-8", timeout: timeoutMs, maxBuffer: 50 * 1024 * 1024 },
        (err, stdout) => {
          const elapsed = ((performance.now() - start) / 1000).toFixed(2);
          if (err) {
            console.log(`[SparkSql] ✘ ${sql} (${elapsed}s)`);
            reject(err);
          } else {
            console.log(`[SparkSql] ✔ ${sql} (${elapsed}s)`);
            resolve(stdout);
          }
        },
      );
    });
  }

  static async queryRowsAsync(sql: string, timeoutMs = 120_000): Promise<string[]> {
    return this.parseRows(await this.queryAsync(sql, timeoutMs));
  }

  static parseRows(raw: string): string[] {
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("::"));
  }

  static queryRows(sql: string, timeoutMs = 120_000): string[] {
    return this.parseRows(this.query(sql, timeoutMs));
  }
}
