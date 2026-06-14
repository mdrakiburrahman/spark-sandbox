/**
 * Spark Submit Command Builder
 *
 * Builds the spark-submit command array for job execution.
 */

import * as path from "path";
import type { Job, JobsConfig, RuntimeContext } from "../../interface/index.js";
import { SparkResourceConfigLoader } from "./spark-resources.js";
import { IvySettingsWriter } from "./ivy-settings.js";
import { JarResolver } from "./jar-resolver.js";

/**
 * Builds spark-submit commands from job configuration.
 */
export class SparkSubmitCommandBuilder {
  constructor(
    private readonly config: JobsConfig,
    private readonly ctx: RuntimeContext,
  ) {}

  /**
   * Build the spark-submit command array for a job.
   */
  build(jobName: string, job: Job): string[] {
    const module = this.config.modules[job.module];
    if (!module) {
      throw new Error(`Module '${job.module}' not found for job '${jobName}'`);
    }

    const jarPath = JarResolver.resolve(
      this.ctx.projectRoot,
      module.jarPattern,
    );
    if (!jarPath) {
      throw new Error(
        `JAR not found for pattern '${module.jarPattern}'. Run 'nx run spark-scala:build-jar' first.`,
      );
    }

    const configPath = path.resolve(this.ctx.projectRoot, module.configPath);
    const resourceConfigs = SparkResourceConfigLoader.load(configPath);
    const ivySettingsPath = IvySettingsWriter.write(this.ctx);

    const cmd: string[] = [
      path.join(this.ctx.sparkHome, "bin", "spark-submit"),
      "--master",
      "local[*]",
      "--deploy-mode",
      "client",
      "--driver-memory",
      resourceConfigs.driverMemory,
      "--executor-memory",
      resourceConfigs.executorMemory,
      "--driver-cores",
      String(resourceConfigs.driverCores),
      "--executor-cores",
      String(resourceConfigs.executorCores),
      "--num-executors",
      String(resourceConfigs.numExecutors),
    ];

    // ─────────────────────────────────────────────────────────────────────
    // Accumulate driver/executor `extraJavaOptions` so we can emit a single
    // `--conf` value per side (Spark overrides on duplicate `--conf`).
    // ─────────────────────────────────────────────────────────────────────
    const driverJavaOpts: string[] = [];
    const executorJavaOpts: string[] = [];

    // 1. Module-level `-Dconfig.file=` so DemoEnvironmentConfiguration picks
    //    up the right YAML.
    if (module.useSparkConfigs) {
      driverJavaOpts.push(`-Dconfig.file=${configPath}`);
      executorJavaOpts.push(`-Dconfig.file=${configPath}`);
    }

    // 2. Per-job heap-dump + GC defaults sourced from the module config (mirror
    //    of what the old run-spark-jobs.sh used to export).
    const dumpPrefix = `${jobName.replace(/[^a-zA-Z0-9_-]/g, "_")}_${Date.now()}`;
    const driverGcOpts = `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=${this.ctx.heapDumpDir}/driver_${dumpPrefix}.hprof -XX:+UseG1GC`;
    const executorGcOpts = `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=${this.ctx.heapDumpDir}/exec_${dumpPrefix}.hprof -XX:+UseG1GC`;
    driverJavaOpts.push(driverGcOpts);
    executorJavaOpts.push(executorGcOpts);

    if (resourceConfigs.driverDefaultJavaOptions) {
      driverJavaOpts.push(resourceConfigs.driverDefaultJavaOptions);
    }
    if (resourceConfigs.executorDefaultJavaOptions) {
      executorJavaOpts.push(resourceConfigs.executorDefaultJavaOptions);
    }

    // Ivy settings for JAR downloads
    cmd.push("--conf", `spark.jars.ivySettings=${ivySettingsPath}`);

    // Additional JARs (packages)
    const useAdditionalJars = job.useAdditionalJars ?? module.useAdditionalJars;
    if (useAdditionalJars && this.config.additionalJars.length > 0) {
      cmd.push("--packages", this.config.additionalJars.join(","));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Off-heap / shuffle defaults from the module YAML.
    // ─────────────────────────────────────────────────────────────────────
    if (resourceConfigs.offHeapEnabled) {
      cmd.push("--conf", `spark.memory.offHeap.enabled=true`);
      if (resourceConfigs.offHeapMemory) {
        cmd.push(
          "--conf",
          `spark.memory.offHeap.size=${resourceConfigs.offHeapMemory}`,
        );
      }
    }
    if (resourceConfigs.shufflePartitions !== undefined) {
      cmd.push(
        "--conf",
        `spark.sql.shuffle.partitions=${resourceConfigs.shufflePartitions}`,
      );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Walk sparkConfigSets. extraJavaOptions get merged into our buffers;
    // everything else is emitted as a normal `--conf` so per-job sets can
    // still override module defaults via Spark's last-write-wins.
    // ─────────────────────────────────────────────────────────────────────
    if (job.sparkConfigSets) {
      for (const setName of job.sparkConfigSets) {
        const configSet = this.config.sparkConfigSets[setName];
        if (!configSet) continue;
        for (const entry of configSet) {
          const value = this.substituteVariables(entry.value);
          if (entry.key === "spark.driver.extraJavaOptions") {
            driverJavaOpts.push(value);
          } else if (entry.key === "spark.executor.extraJavaOptions") {
            executorJavaOpts.push(value);
          } else {
            cmd.push("--conf", `${entry.key}=${value}`);
          }
        }
      }
    }

    // Emit merged extraJavaOptions (if any).
    if (driverJavaOpts.length > 0) {
      cmd.push(
        "--conf",
        `spark.driver.extraJavaOptions=${driverJavaOpts.join(" ")}`,
      );
    }
    if (executorJavaOpts.length > 0) {
      cmd.push(
        "--conf",
        `spark.executor.extraJavaOptions=${executorJavaOpts.join(" ")}`,
      );
    }

    // Main class and JAR
    cmd.push("--class", job.class);
    cmd.push(jarPath);

    // Config file path as first argument (required by all Scala drivers)
    cmd.push(configPath);

    // Additional driver arguments (with variable substitution)
    if (job.args) {
      const processedArgs = job.args.map((arg) =>
        this.substituteVariables(arg),
      );
      cmd.push(...processedArgs);
    }

    // Inline config (base64 encoded) - passed after other args.
    // Variable substitution is applied so `{sparkScalaDir}` etc. resolve
    // the same way they do inside `args[]`.
    if (job.inlineConfig) {
      const resolvedConfig = this.substituteVariables(job.inlineConfig);
      const base64Config = Buffer.from(resolvedConfig).toString("base64");
      cmd.push(base64Config);
    }

    return cmd;
  }

  /**
   * Substitute runtime variables in a value or arg.
   *
   * Supported tokens: {projectRoot} {sparkScalaDir} {sparkConfDir} {sparkHome}
   *                   {tempDir} {heapDumpDir} {logsDir} {ivyDir} {home}
   *                   {goldLoadTimestampB64}
   */
  private substituteVariables(value: string): string {
    if (value === "{goldLoadTimestampB64}") {
      const timestamp = new Date().toISOString();
      return Buffer.from(timestamp).toString("base64");
    }
    const tokens: Record<string, string> = {
      projectRoot: this.ctx.projectRoot,
      sparkScalaDir: this.ctx.sparkScalaDir,
      sparkConfDir: this.ctx.sparkConfDir,
      sparkHome: this.ctx.sparkHome,
      tempDir: this.ctx.tempDir,
      heapDumpDir: this.ctx.heapDumpDir,
      logsDir: this.ctx.logsDir,
      ivyDir: this.ctx.ivyDir,
      home: this.ctx.home,
    };
    let out = value;
    for (const [k, v] of Object.entries(tokens)) {
      out = out.split(`{${k}}`).join(v);
    }
    return out;
  }
}
