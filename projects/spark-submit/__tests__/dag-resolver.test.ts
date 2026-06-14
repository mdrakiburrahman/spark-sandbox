/**
 * Unit tests for DagResolver — focused on the multi-target helpers
 * (`resolveAll` / `printPlanAll`) that back the CLI's
 * `--job=a,b,c` fan-out feature.
 *
 * The single-target `resolve` is exercised transitively here.
 */

import { jest } from "@jest/globals";
import { DagResolver } from "../server/services/dag-resolver";
import type { JobsConfig, Job } from "../interface/types";

function makeConfig(jobs: Record<string, Partial<Job>>): JobsConfig {
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

describe("DagResolver.resolveAll", () => {
  // DAG used across cases:
  //   a              (root)
  //   ├── b          (depends on a)
  //   └── c          (depends on a)
  //        └── d     (depends on c)
  //   e              (root, independent)
  const config = makeConfig({
    a: {},
    b: { dependsOn: ["a"] },
    c: { dependsOn: ["a"] },
    d: { dependsOn: ["c"] },
    e: {},
  });

  it("returns single-target chain identical to resolve() when given one job", () => {
    const r = new DagResolver(config);
    expect(r.resolveAll(["d"])).toEqual(r.resolve("d"));
  });

  it("unions chains across multiple targets and dedupes shared deps (a appears once)", () => {
    const r = new DagResolver(config);
    const merged = r.resolveAll(["b", "d"]);

    // Both chains share `a`, so it must appear exactly once.
    expect(merged.filter((j) => j === "a").length).toBe(1);

    // The merged list must contain every job from both chains.
    expect(new Set(merged)).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("preserves topological order — every dependency appears before the job that needs it", () => {
    const r = new DagResolver(config);
    const merged = r.resolveAll(["b", "d", "e"]);

    const indexOf = (j: string) => merged.indexOf(j);
    expect(indexOf("a")).toBeLessThan(indexOf("b"));
    expect(indexOf("a")).toBeLessThan(indexOf("c"));
    expect(indexOf("c")).toBeLessThan(indexOf("d"));
    // Independent root `e` must still be present, position is flexible.
    expect(merged).toContain("e");
  });

  it("returns [] for an empty target list", () => {
    const r = new DagResolver(config);
    expect(r.resolveAll([])).toEqual([]);
  });

  it("throws when any target is unknown", () => {
    const r = new DagResolver(config);
    expect(() => r.resolveAll(["b", "ghost"])).toThrow(/not found/);
  });
});

describe("DagResolver.printPlanAll", () => {
  it("invokes printPlan once per target", () => {
    const config = makeConfig({ a: {}, b: { dependsOn: ["a"] } });
    const r = new DagResolver(config);
    const spy = jest.spyOn(r, "printPlan").mockImplementation(() => undefined);

    r.printPlanAll(["a", "b"]);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, "a");
    expect(spy).toHaveBeenNthCalledWith(2, "b");
    spy.mockRestore();
  });
});
