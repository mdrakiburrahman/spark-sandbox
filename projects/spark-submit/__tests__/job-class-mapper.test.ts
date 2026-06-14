/**
 * Unit tests for JobClassMapper.
 *
 * Tests the driver-class → job mapping, class lookup, and upstream
 * dependency analysis features.
 */

import { JobClassMapper } from "../server/services/job-class-mapper";
import type { JobsConfig, Job } from "../interface/types";

// ─────────────────────────────────────────────────────────────────────────────
// Test fixture helper
// ─────────────────────────────────────────────────────────────────────────────

function createTestConfig(jobs: Record<string, Partial<Job>>): JobsConfig {
  const fullJobs: Record<string, Job> = {};
  for (const [name, partial] of Object.entries(jobs)) {
    fullJobs[name] = {
      module: partial.module ?? "test-module",
      class: partial.class ?? `com.test.${name}`,
      category: partial.category ?? "demo",
      description: partial.description ?? `Test job ${name}`,
      args: partial.args,
      dependsOn: partial.dependsOn,
    };
  }

  return {
    defaults: {
      sparkHome: "/spark",
      sparkConfDir: "/spark/conf",
      ivyDir: "/ivy",
      tempDir: "/tmp",
      heapDumpDir: "/heapdumps",
      logsDir: "/logs",
    },
    additionalJars: [],
    modules: {
      "test-module": {
        jarPattern: "test-*.jar",
        configPath: "config/",
        useSparkConfigs: false,
        useAdditionalJars: false,
      },
    },
    sparkConfigSets: {},
    jobs: fullJobs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("JobClassMapper", () => {
  describe("getClassToJobMap", () => {
    it("should return all class-to-job mappings", () => {
      const config = createTestConfig({
        "bronze-ingest": {
          class: "com.example.BronzeIngestDriver",
          category: "bronze",
        },
        "silver-transform": {
          class: "com.example.SilverTransformDriver",
          category: "silver",
        },
        "gold-aggregate": {
          class: "com.example.GoldAggregateDriver",
          category: "gold",
        },
      });

      const mapper = new JobClassMapper(config);
      const mappings = mapper.getClassToJobMap();

      expect(mappings).toHaveLength(3);
      expect(mappings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            driverClass: "com.example.BronzeIngestDriver",
            jobName: "bronze-ingest",
            category: "bronze",
          }),
          expect.objectContaining({
            driverClass: "com.example.SilverTransformDriver",
            jobName: "silver-transform",
            category: "silver",
          }),
          expect.objectContaining({
            driverClass: "com.example.GoldAggregateDriver",
            jobName: "gold-aggregate",
            category: "gold",
          }),
        ]),
      );
    });

    it("should return an empty array for empty config", () => {
      const config = createTestConfig({});
      const mapper = new JobClassMapper(config);
      expect(mapper.getClassToJobMap()).toEqual([]);
    });

    it("should include description in mappings", () => {
      const config = createTestConfig({
        "my-job": {
          class: "com.example.MyDriver",
          description: "My custom description",
        },
      });

      const mapper = new JobClassMapper(config);
      const mappings = mapper.getClassToJobMap();

      expect(mappings[0].description).toBe("My custom description");
    });
  });

  describe("getJobForClass", () => {
    const config = createTestConfig({
      "bronze-ingest": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.bronze.BronzeIngestDriver",
        category: "bronze",
      },
      "silver-transform": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.silver.SilverTransformDriver",
        category: "silver",
      },
    });

    let mapper: JobClassMapper;

    beforeEach(() => {
      mapper = new JobClassMapper(config);
    });

    it("should find a job by exact class name", () => {
      const result = mapper.getJobForClass(
        "com.microsoft.azurearcdata.sparkmsit.etl.drivers.bronze.BronzeIngestDriver",
      );
      expect(result).not.toBeNull();
      expect(result!.jobName).toBe("bronze-ingest");
      expect(result!.category).toBe("bronze");
    });

    it("should be case-insensitive", () => {
      const result = mapper.getJobForClass(
        "COM.MICROSOFT.AZUREARCDATA.SPARKMSIT.ETL.DRIVERS.BRONZE.BRONZEINGESTDRIVER",
      );
      expect(result).not.toBeNull();
      expect(result!.jobName).toBe("bronze-ingest");
    });

    it("should return null for unknown class", () => {
      const result = mapper.getJobForClass("com.example.DoesNotExist");
      expect(result).toBeNull();
    });

    it("should return null for empty string", () => {
      expect(mapper.getJobForClass("")).toBeNull();
    });

    it("should return null for null/undefined input", () => {
      expect(mapper.getJobForClass(null as unknown as string)).toBeNull();
      expect(mapper.getJobForClass(undefined as unknown as string)).toBeNull();
    });
  });

  describe("getUpstreamDependents", () => {
    it("should return direct dependents", () => {
      // bronze → silver → gold
      const config = createTestConfig({
        bronze: { class: "com.example.BronzeDriver", dependsOn: undefined },
        silver: { class: "com.example.SilverDriver", dependsOn: ["bronze"] },
        gold: { class: "com.example.GoldDriver", dependsOn: ["silver"] },
      });

      const mapper = new JobClassMapper(config);
      const upstream = mapper.getUpstreamDependents("com.example.BronzeDriver");

      expect(upstream).toContain("silver");
      expect(upstream).toContain("gold");
      expect(upstream).not.toContain("bronze");
    });

    it("should handle diamond dependencies", () => {
      //       bronze
      //      /      \
      //   silver-a  silver-b
      //      \      /
      //       gold
      const config = createTestConfig({
        bronze: { class: "com.example.BronzeDriver" },
        "silver-a": {
          class: "com.example.SilverADriver",
          dependsOn: ["bronze"],
        },
        "silver-b": {
          class: "com.example.SilverBDriver",
          dependsOn: ["bronze"],
        },
        gold: {
          class: "com.example.GoldDriver",
          dependsOn: ["silver-a", "silver-b"],
        },
      });

      const mapper = new JobClassMapper(config);
      const upstream = mapper.getUpstreamDependents("com.example.BronzeDriver");

      expect(upstream).toEqual(
        expect.arrayContaining(["silver-a", "silver-b", "gold"]),
      );
      expect(upstream).toHaveLength(3);
    });

    it("should return empty for a leaf job with no dependents", () => {
      const config = createTestConfig({
        bronze: { class: "com.example.BronzeDriver" },
        gold: { class: "com.example.GoldDriver", dependsOn: ["bronze"] },
      });

      const mapper = new JobClassMapper(config);
      const upstream = mapper.getUpstreamDependents("com.example.GoldDriver");

      expect(upstream).toEqual([]);
    });

    it("should return empty for an unknown class", () => {
      const config = createTestConfig({
        bronze: { class: "com.example.BronzeDriver" },
      });

      const mapper = new JobClassMapper(config);
      expect(mapper.getUpstreamDependents("com.example.Unknown")).toEqual([]);
    });

    it("should handle deep transitive chains", () => {
      // a → b → c → d → e
      const config = createTestConfig({
        a: { class: "com.example.A" },
        b: { class: "com.example.B", dependsOn: ["a"] },
        c: { class: "com.example.C", dependsOn: ["b"] },
        d: { class: "com.example.D", dependsOn: ["c"] },
        e: { class: "com.example.E", dependsOn: ["d"] },
      });

      const mapper = new JobClassMapper(config);
      const upstream = mapper.getUpstreamDependents("com.example.A");

      expect(upstream).toEqual(["b", "c", "d", "e"]);
    });

    it("should not include the source job itself", () => {
      const config = createTestConfig({
        source: { class: "com.example.Source" },
        dependent: { class: "com.example.Dependent", dependsOn: ["source"] },
      });

      const mapper = new JobClassMapper(config);
      const upstream = mapper.getUpstreamDependents("com.example.Source");

      expect(upstream).not.toContain("source");
      expect(upstream).toContain("dependent");
    });

    it("should handle jobs with no dependencies at all", () => {
      const config = createTestConfig({
        "standalone-a": { class: "com.example.StandaloneA" },
        "standalone-b": { class: "com.example.StandaloneB" },
      });

      const mapper = new JobClassMapper(config);
      expect(mapper.getUpstreamDependents("com.example.StandaloneA")).toEqual(
        [],
      );
    });

    it("should handle multiple roots converging", () => {
      //  a1   a2
      //   \  /  \
      //    b     c
      //     \   /
      //       d
      const config = createTestConfig({
        a1: { class: "com.example.A1" },
        a2: { class: "com.example.A2" },
        b: { class: "com.example.B", dependsOn: ["a1", "a2"] },
        c: { class: "com.example.C", dependsOn: ["a2"] },
        d: { class: "com.example.D", dependsOn: ["b", "c"] },
      });

      const mapper = new JobClassMapper(config);

      // a2 impacts b, c, and d
      const upstreamA2 = mapper.getUpstreamDependents("com.example.A2");
      expect(upstreamA2).toEqual(expect.arrayContaining(["b", "c", "d"]));
      expect(upstreamA2).toHaveLength(3);

      // a1 impacts only b and d
      const upstreamA1 = mapper.getUpstreamDependents("com.example.A1");
      expect(upstreamA1).toEqual(expect.arrayContaining(["b", "d"]));
      expect(upstreamA1).toHaveLength(2);
    });

    it("should return sorted results", () => {
      const config = createTestConfig({
        root: { class: "com.example.Root" },
        zebra: { class: "com.example.Zebra", dependsOn: ["root"] },
        alpha: { class: "com.example.Alpha", dependsOn: ["root"] },
        middle: { class: "com.example.Middle", dependsOn: ["root"] },
      });

      const mapper = new JobClassMapper(config);
      const upstream = mapper.getUpstreamDependents("com.example.Root");

      expect(upstream).toEqual(["alpha", "middle", "zebra"]);
    });
  });

  describe("integration with real-shaped config", () => {
    const config = createTestConfig({
      "mirror-maker-bronze": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.bronze.MirrorMakerBronzeDriver",
        category: "bronze",
        description: "Event Hub Delta tables",
      },
      "arn-generic-silver": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.silver.arn.ArnGenericSilverDriver",
        category: "silver",
        description: "ARN generic notifications",
        dependsOn: ["mirror-maker-bronze"],
      },
      "arn-typed-silver-extensions": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.silver.arn.ArnTypedSilverExtensionsDriver",
        category: "silver",
        description: "ARN typed silver - extensions",
        dependsOn: ["arn-generic-silver"],
      },
      "arn-snapshot-silver-azuredata": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.silver.arn.ArnSnapshotSilverAzuredataDriver",
        category: "silver",
        description: "Filtered for Azure Data resources",
        dependsOn: ["arn-typed-silver-extensions"],
      },
      "arn-gold-staging-extensions": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.gold.staging.arn.ArnSnapshotGoldStagingDriver",
        category: "gold",
        description: "ARN gold staging - machines/extensions",
        dependsOn: ["arn-snapshot-silver-azuredata"],
      },
      "arn-gold-star-extensions": {
        class:
          "com.microsoft.azurearcdata.sparkmsit.etl.drivers.gold.star.arn.ArnGoldStarExtensionsDriver",
        category: "gold",
        description: "ARN gold star - extensions",
        dependsOn: ["arn-gold-staging-extensions"],
      },
    });

    let mapper: JobClassMapper;

    beforeEach(() => {
      mapper = new JobClassMapper(config);
    });

    it("should map all 6 jobs", () => {
      expect(mapper.getClassToJobMap()).toHaveLength(6);
    });

    it("should find bronze driver job", () => {
      const result = mapper.getJobForClass(
        "com.microsoft.azurearcdata.sparkmsit.etl.drivers.bronze.MirrorMakerBronzeDriver",
      );
      expect(result?.jobName).toBe("mirror-maker-bronze");
    });

    it("should show full upstream impact from bronze", () => {
      const upstream = mapper.getUpstreamDependents(
        "com.microsoft.azurearcdata.sparkmsit.etl.drivers.bronze.MirrorMakerBronzeDriver",
      );
      expect(upstream).toEqual([
        "arn-generic-silver",
        "arn-gold-staging-extensions",
        "arn-gold-star-extensions",
        "arn-snapshot-silver-azuredata",
        "arn-typed-silver-extensions",
      ]);
    });

    it("should show partial upstream impact from silver", () => {
      const upstream = mapper.getUpstreamDependents(
        "com.microsoft.azurearcdata.sparkmsit.etl.drivers.silver.arn.ArnSnapshotSilverAzuredataDriver",
      );
      expect(upstream).toEqual([
        "arn-gold-staging-extensions",
        "arn-gold-star-extensions",
      ]);
    });

    it("should show no upstream impact from gold star (leaf)", () => {
      const upstream = mapper.getUpstreamDependents(
        "com.microsoft.azurearcdata.sparkmsit.etl.drivers.gold.star.arn.ArnGoldStarExtensionsDriver",
      );
      expect(upstream).toEqual([]);
    });
  });
});
