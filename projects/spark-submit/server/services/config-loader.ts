/**
 * Configuration Loader Implementation
 *
 * Concrete implementation of IConfigLoader interface.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";
import type { JobsConfig, IConfigLoader } from "../../interface/index.js";

/** Directory containing spark_submit config files */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_DIR = path.join(__dirname, "..", "..", "config");

/**
 * Default implementation of configuration loader.
 */
export class ConfigLoader implements IConfigLoader {
  private static instance: ConfigLoader | null = null;
  private cachedConfig: JobsConfig | null = null;
  private configPath: string;

  private constructor() {
    this.configPath = path.join(CONFIG_DIR, "spark-jobs.yaml");
  }

  /**
   * Get singleton instance.
   */
  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Load the jobs configuration from spark-jobs.yaml.
   */
  loadJobsConfig(_projectRoot: string): JobsConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    const content = fs.readFileSync(this.configPath, "utf-8");
    this.cachedConfig = yaml.parse(content) as JobsConfig;
    return this.cachedConfig;
  }

  /**
   * Clear cached configuration (useful for testing).
   */
  clearCache(): void {
    this.cachedConfig = null;
  }

  /**
   * Set custom config path (useful for testing).
   */
  setConfigPath(configPath: string): void {
    this.configPath = configPath;
    this.cachedConfig = null;
  }
}
