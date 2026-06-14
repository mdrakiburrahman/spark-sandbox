/**
 * Runtime Context Factory Implementation
 *
 * Concrete implementation of IRuntimeContextFactory interface.
 */

import * as fs from "fs";
import type {
  JobsConfig,
  RuntimeContext,
  IRuntimeContextFactory,
} from "../../interface/index.js";

/**
 * Default implementation of runtime context factory.
 */
export class RuntimeContextFactory implements IRuntimeContextFactory {
  private static instance: RuntimeContextFactory | null = null;

  private constructor() {}

  /**
   * Get singleton instance.
   */
  static getInstance(): RuntimeContextFactory {
    if (!RuntimeContextFactory.instance) {
      RuntimeContextFactory.instance = new RuntimeContextFactory();
    }
    return RuntimeContextFactory.instance;
  }

  /**
   * Create a runtime context from configuration.
   * Resolves template variables and ensures directories exist.
   */
  create(config: JobsConfig, projectRoot: string): RuntimeContext {
    const home = process.env.HOME || "/root";

    // Two-pass resolver: first fill {projectRoot}/{home}, then any nested {sparkScalaDir}/etc.
    // We resolve sparkScalaDir first since other tokens may reference it.
    const baseTokens: Record<string, string> = { projectRoot, home };

    const substitute = (
      value: string,
      tokens: Record<string, string>,
    ): string => {
      let out = value;
      for (const [k, v] of Object.entries(tokens)) {
        out = out.split(`{${k}}`).join(v);
      }
      return out;
    };

    const sparkScalaRaw =
      config.defaults.sparkScalaDir ?? "{projectRoot}/../spark-scala";
    const sparkScalaDir = substitute(sparkScalaRaw, baseTokens);

    const allTokens: Record<string, string> = { ...baseTokens, sparkScalaDir };

    const resolve = (value: string): string => substitute(value, allTokens);

    const sparkHome = resolve(config.defaults.sparkHome);
    const sparkConfDir = resolve(config.defaults.sparkConfDir);
    const ivyDir = resolve(config.defaults.ivyDir);
    const tempDir = resolve(config.defaults.tempDir);
    const heapDumpDir = resolve(config.defaults.heapDumpDir);
    const logsDir = resolve(config.defaults.logsDir);

    // Ensure directories exist
    [tempDir, heapDumpDir, logsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    return {
      projectRoot,
      home,
      sparkHome,
      sparkConfDir,
      sparkScalaDir,
      ivyDir,
      tempDir,
      heapDumpDir,
      logsDir,
    };
  }

  /**
   * Static factory method for backward compatibility.
   */
  static create(config: JobsConfig, projectRoot: string): RuntimeContext {
    return RuntimeContextFactory.getInstance().create(config, projectRoot);
  }
}
