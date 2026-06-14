/**
 * Unit tests for spark-jobs.yaml configuration validation.
 *
 * These tests ensure the YAML configuration is valid and catches regressions
 * when users add or modify job definitions.
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import yaml from "yaml";
import {
  JobsConfig,
  Job,
  Module,
  SparkConfigEntry,
  JobCategory,
  parseJobCategory,
  isValidJobCategory,
  ValidCategories,
} from "../interface/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, "..", "config");
const YAML_PATH = path.join(CONFIG_DIR, "spark-jobs.yaml");

describe("spark-jobs.yaml", () => {
  let config: JobsConfig;

  beforeAll(() => {
    const content = fs.readFileSync(YAML_PATH, "utf-8");
    config = yaml.parse(content) as JobsConfig;
  });

  describe("YAML parsing", () => {
    it("should parse without errors", () => {
      expect(config).toBeDefined();
    });

    it("should have required top-level keys", () => {
      expect(config.defaults).toBeDefined();
      expect(config.additionalJars).toBeDefined();
      expect(config.modules).toBeDefined();
      expect(config.sparkConfigSets).toBeDefined();
      expect(config.jobs).toBeDefined();
    });
  });

  describe("defaults", () => {
    it("should have all required default fields", () => {
      expect(config.defaults.sparkHome).toBeDefined();
      expect(config.defaults.sparkConfDir).toBeDefined();
      expect(config.defaults.ivyDir).toBeDefined();
      expect(config.defaults.tempDir).toBeDefined();
      expect(config.defaults.heapDumpDir).toBeDefined();
      expect(config.defaults.logsDir).toBeDefined();
    });
  });

  describe("additionalJars", () => {
    it("should be an array", () => {
      expect(Array.isArray(config.additionalJars)).toBe(true);
    });

    it("should contain valid Maven coordinates", () => {
      const mavenCoordinateRegex = /^[\w.-]+:[\w.-]+:[\w.-]+$/;
      for (const jar of config.additionalJars) {
        expect(jar).toMatch(mavenCoordinateRegex);
      }
    });
  });

  describe("modules", () => {
    it("should have at least one module", () => {
      expect(Object.keys(config.modules).length).toBeGreaterThan(0);
    });

    it("should have valid module definitions", () => {
      for (const [name, module] of Object.entries(config.modules)) {
        expect(module.jarPattern).toBeDefined();
        expect(typeof module.jarPattern).toBe("string");
        expect(module.jarPattern.length).toBeGreaterThan(0);

        expect(module.configPath).toBeDefined();
        expect(typeof module.configPath).toBe("string");

        expect(typeof module.useSparkConfigs).toBe("boolean");
        expect(typeof module.useAdditionalJars).toBe("boolean");
      }
    });

    it("should have jar patterns with wildcards", () => {
      for (const [name, module] of Object.entries(config.modules)) {
        expect(module.jarPattern).toContain("*");
      }
    });
  });

  describe("sparkConfigSets", () => {
    it("should have valid config set definitions", () => {
      for (const [name, entries] of Object.entries(config.sparkConfigSets)) {
        expect(Array.isArray(entries)).toBe(true);

        for (const entry of entries) {
          expect(entry.key).toBeDefined();
          expect(typeof entry.key).toBe("string");
          expect(entry.key.startsWith("spark.")).toBe(true);

          expect(entry.value).toBeDefined();
          expect(typeof entry.value).toBe("string");
        }
      }
    });
  });

  describe("inlineConfigs on jobs", () => {
    it("should have valid inline config when specified", () => {
      for (const [name, job] of Object.entries(config.jobs)) {
        if (job.inlineConfig) {
          expect(typeof job.inlineConfig).toBe("string");
          expect(job.inlineConfig.length).toBeGreaterThan(0);

          // Should be valid YAML
          expect(() => yaml.parse(job.inlineConfig as string)).not.toThrow();
        }
      }
    });
  });

  describe("job categories", () => {
    it("should have a non-null category for every job", () => {
      for (const [name, job] of Object.entries(config.jobs)) {
        expect(job.category).toBeDefined();
        expect(job.category).not.toBeNull();
        expect(typeof job.category).toBe("string");
        expect(job.category.trim().length).toBeGreaterThan(0);
      }
    });

    it("should have categories that map to valid JobCategory enum values", () => {
      const invalidCategories: Array<{ jobName: string; category: string }> =
        [];

      for (const [name, job] of Object.entries(config.jobs)) {
        if (!isValidJobCategory(job.category)) {
          invalidCategories.push({ jobName: name, category: job.category });
        }
      }

      if (invalidCategories.length > 0) {
        const errorMsg = invalidCategories
          .map(({ jobName, category }) => `  - ${jobName}: "${category}"`)
          .join("\n");
        fail(
          `The following jobs have invalid categories:\n${errorMsg}\n\nValid categories are: ${Array.from(ValidCategories).join(", ")}`,
        );
      }
    });

    it("should parse all job categories without throwing errors", () => {
      for (const [name, job] of Object.entries(config.jobs)) {
        expect(() => parseJobCategory(job.category)).not.toThrow();
      }
    });

    it("should categorize jobs into the expected buckets", () => {
      const categoryCounts: Record<JobCategory, number> = {
        [JobCategory.Bronze]: 0,
        [JobCategory.Silver]: 0,
        [JobCategory.Gold]: 0,
        [JobCategory.Staging]: 0,
        [JobCategory.App]: 0,
        [JobCategory.Demo]: 0,
        [JobCategory.Ops]: 0,
      };

      for (const [name, job] of Object.entries(config.jobs)) {
        const category = parseJobCategory(job.category);
        categoryCounts[category]++;
      }

      // Ensure we have at least some jobs in expected categories
      // This helps catch if category mappings are accidentally broken
      const totalJobs = Object.keys(config.jobs).length;
      const categorizedJobs = Object.values(categoryCounts).reduce(
        (a, b) => a + b,
        0,
      );

      expect(categorizedJobs).toBe(totalJobs);
    });
  });

  describe("jobs", () => {
    it("should have at least one job", () => {
      expect(Object.keys(config.jobs).length).toBeGreaterThan(0);
    });

    it("should have valid job definitions", () => {
      for (const [name, job] of Object.entries(config.jobs)) {
        // Required fields
        expect(job.module).toBeDefined();
        expect(typeof job.module).toBe("string");

        expect(job.class).toBeDefined();
        expect(typeof job.class).toBe("string");
        expect(job.class.includes(".")).toBe(true); // Fully qualified class name

        expect(job.category).toBeDefined();
        expect(typeof job.category).toBe("string");

        expect(job.description).toBeDefined();
        expect(typeof job.description).toBe("string");
      }
    });

    it("should reference valid modules", () => {
      const moduleNames = Object.keys(config.modules);
      for (const [name, job] of Object.entries(config.jobs)) {
        expect(moduleNames).toContain(job.module);
      }
    });

    it("should reference valid sparkConfigSets when specified", () => {
      const configSetNames = Object.keys(config.sparkConfigSets);
      for (const [name, job] of Object.entries(config.jobs)) {
        if (job.sparkConfigSets) {
          for (const setName of job.sparkConfigSets) {
            expect(configSetNames).toContain(setName);
          }
        }
      }
    });

    it("should have valid args when specified", () => {
      for (const [name, job] of Object.entries(config.jobs)) {
        if (job.args) {
          expect(Array.isArray(job.args)).toBe(true);
          for (const arg of job.args) {
            expect(typeof arg).toBe("string");
          }
        }
      }
    });

    it("should have unique job names", () => {
      const jobNames = Object.keys(config.jobs);
      const uniqueNames = new Set(jobNames);
      expect(uniqueNames.size).toBe(jobNames.length);
    });

    it("should have valid dependsOn references", () => {
      const jobNames = Object.keys(config.jobs);
      for (const [name, job] of Object.entries(config.jobs)) {
        if (job.dependsOn) {
          expect(Array.isArray(job.dependsOn)).toBe(true);
          for (const dep of job.dependsOn) {
            expect(jobNames).toContain(dep);
          }
        }
      }
    });

    it("should not have circular dependencies", () => {
      const visited = new Set<string>();
      const visiting = new Set<string>();

      const hasCycle = (jobName: string): boolean => {
        if (visiting.has(jobName)) return true;
        if (visited.has(jobName)) return false;

        visiting.add(jobName);
        const job = config.jobs[jobName];
        if (job?.dependsOn) {
          for (const dep of job.dependsOn) {
            if (hasCycle(dep)) return true;
          }
        }
        visiting.delete(jobName);
        visited.add(jobName);
        return false;
      };

      for (const jobName of Object.keys(config.jobs)) {
        visited.clear();
        visiting.clear();
        expect(hasCycle(jobName)).toBe(false);
      }
    });
  });
});
