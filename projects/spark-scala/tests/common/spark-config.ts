import { resolve } from 'path';
import { readFileSync } from 'fs';
import { load as loadYaml } from 'js-yaml';

const SPARK_SCALA_DIR = resolve(__dirname, '../..');
const DEVCONTAINER_CONFIG = resolve(
  SPARK_SCALA_DIR,
  'spark-demo/src/main/resources/config/config-dev-devcontainer.yaml'
);

/**
 * Reads and parses the devcontainer YAML configuration.
 */
export class SparkConfig {
  private static _cache: Record<string, any> | null = null;

  static load(): Record<string, any> {
    if (!this._cache) {
      this._cache = loadYaml(
        readFileSync(DEVCONTAINER_CONFIG, 'utf-8')
      ) as Record<string, any>;
    }
    return this._cache;
  }

  static getDeltaMounts(): Array<{ Database: string; RootPath: string }> {
    return this.load()['DeltaMountDriver']?.['Mounts'] ?? [];
  }
}
