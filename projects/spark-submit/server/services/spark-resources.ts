/**
 * Spark Resource Configuration Loader
 *
 * Parses Spark resource configurations from module config files.
 */

import * as fs from "fs";
import yaml from "yaml";
import type { SparkResourceConfigs } from "../../interface/index.js";

const DEFAULT_CONFIGS: SparkResourceConfigs = {
  driverMemory: "1g",
  executorMemory: "1g",
  driverCores: 1,
  executorCores: 1,
  numExecutors: 1,
};

/**
 * Loads Spark resource configurations from config files.
 */
export class SparkResourceConfigLoader {
  /**
   * Load Spark resource configurations from a module's config file.
   * Falls back to defaults if file doesn't exist or can't be parsed.
   *
   * Accepts both `driverCore`/`driverCores` (and the executor variants) so the same
   * loader works for monitoring-style YAMLs and the spark-scala YAML.
   */
  static load(configPath: string): SparkResourceConfigs {
    if (!fs.existsSync(configPath)) {
      return { ...DEFAULT_CONFIGS };
    }

    try {
      const content = fs.readFileSync(configPath, "utf-8");
      const config = yaml.parse(content);

      const spark = config?.environment?.spark || config?.spark || {};

      const toBool = (v: unknown): boolean | undefined =>
        v === undefined ? undefined : Boolean(v);
      const toNum = (v: unknown): number | undefined => {
        if (v === undefined || v === null || v === "") return undefined;
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };

      return {
        driverMemory: spark.driverMemory || DEFAULT_CONFIGS.driverMemory,
        executorMemory: spark.executorMemory || DEFAULT_CONFIGS.executorMemory,
        driverCores:
          toNum(spark.driverCores) ??
          toNum(spark.driverCore) ??
          DEFAULT_CONFIGS.driverCores,
        executorCores:
          toNum(spark.executorCores) ??
          toNum(spark.executorCore) ??
          DEFAULT_CONFIGS.executorCores,
        numExecutors: toNum(spark.numExecutors) ?? DEFAULT_CONFIGS.numExecutors,
        driverDefaultJavaOptions: spark.driverDefaultJavaOptions || undefined,
        executorDefaultJavaOptions:
          spark.executorDefaultJavaOptions || undefined,
        offHeapEnabled: toBool(spark.offHeapEnabled),
        offHeapMemory: spark.offHeapMemory || undefined,
        shufflePartitions: toNum(spark.shufflePartitions),
      };
    } catch {
      return { ...DEFAULT_CONFIGS };
    }
  }
}
