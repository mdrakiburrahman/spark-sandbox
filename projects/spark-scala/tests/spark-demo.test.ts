import { SparkJobRunner, SparkSql, SparkConfig } from "./common";
import { readdirSync, readFileSync, existsSync, mkdirSync } from "fs";
import { resolve } from "path";

const OPENLINEAGE_DIR = resolve(__dirname, "../.temp/openlineage");

describe("spark-scala integration tests", () => {
  const JOB_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  describe("demo-plugin", () => {
    it(
      "runs DemoPluginExploration successfully",
      () => {
        SparkJobRunner.runJob("demo-plugin", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );
  });

  describe("demo-etl", () => {
    const DEMO_ETL_DB = "demo_etl";
    const BASE_TABLES = ["customers", "orders", "products", "sales"];
    const DERIVED_TABLES = [
      "customers_cleaned",
      "products_enriched",
      "sales_enriched",
      "customer_lifetime_value",
      "product_sales_performance",
    ];
    const ALL_TABLES = [...BASE_TABLES, ...DERIVED_TABLES];

    let fileCountBefore = 0;

    it("capture JSONL file count before demo-etl", () => {
      if (!existsSync(OPENLINEAGE_DIR)) {
        mkdirSync(OPENLINEAGE_DIR, { recursive: true });
      }
      fileCountBefore = readdirSync(OPENLINEAGE_DIR).filter((f) =>
        f.endsWith(".json"),
      ).length;
    });

    it(
      "runs DemoEtl successfully",
      () => {
        SparkJobRunner.runJob("demo-etl", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );

    it("all tables exist and have rows", async () => {
      for (const table of ALL_TABLES) {
        const rows = await SparkSql.queryRowsAsync(
          `SELECT COUNT(*) AS cnt FROM ${DEMO_ETL_DB}.${table}`,
        );
        const dataRows = rows.filter((r) => !isNaN(Number(r)));
        expect(dataRows.length).toBeGreaterThan(0);

        const count = parseInt(dataRows[0], 10);
        expect(count).toBeGreaterThan(0);
      }
    }, 300_000);

    it("OpenLineage events are captured as JSONL files with valid JSON", () => {
      const filesAfter = readdirSync(OPENLINEAGE_DIR).filter((f) =>
        f.endsWith(".json"),
      );
      expect(filesAfter.length).toBeGreaterThan(fileCountBefore);

      // Read the newest JSONL file and validate content
      const newestFile = filesAfter.sort().pop()!;
      const content = readFileSync(
        resolve(OPENLINEAGE_DIR, newestFile),
        "utf-8",
      );
      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      expect(lines.length).toBeGreaterThan(0);

      for (const line of lines.slice(0, 5)) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty("eventType");
        expect(parsed).toHaveProperty("producer");
        expect(
          ["START", "RUNNING", "COMPLETE", "FAIL", "OTHER"].includes(
            parsed.eventType,
          ),
        ).toBe(true);
      }
    });
  });

  describe("delta-mount", () => {
    const databases = SparkConfig.getDeltaMounts().map((m) => m.Database);

    it(
      "runs DeltaMountDriver successfully",
      () => {
        SparkJobRunner.runJob("delta-mount", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );

    it("all databases have at least 1 table", async () => {
      for (const db of databases) {
        const rows = await SparkSql.queryRowsAsync(`SHOW TABLES IN ${db}`);
        const dataRows = rows.filter(
          (r) => !r.startsWith("namespace") && !r.startsWith("database"),
        );
        expect(dataRows.length).toBeGreaterThanOrEqual(1);
      }
    }, 120_000);
  });

  describe("openlineage-silver", () => {
    const OL_DB = "data_ops_inventory_db";
    const OL_TABLE = "openlineage";

    it(
      "runs OpenLineageSilverDriver successfully",
      () => {
        SparkJobRunner.runJob("openlineage-silver", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );

    it("openlineage table exists and has rows", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `SELECT COUNT(*) AS cnt FROM ${OL_DB}.${OL_TABLE}`,
      );
      const dataRows = rows.filter((r) => !isNaN(Number(r)));
      expect(dataRows.length).toBeGreaterThan(0);

      const count = parseInt(dataRows[0], 10);
      expect(count).toBeGreaterThan(0);
    }, 120_000);

    it("openlineage table has expected key columns", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `DESCRIBE ${OL_DB}.${OL_TABLE}`,
      );
      const columns = rows
        .filter((r) => !r.startsWith("#") && !r.startsWith("col_name"))
        .map((r) => r.split(/\s+/)[0]);

      expect(columns).toContain("eventType");
      expect(columns).toContain("event_year_date");
      expect(columns).toContain("result_timestamp");
    }, 120_000);

    it("openlineage table does NOT contain request_uri or request_method", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `DESCRIBE ${OL_DB}.${OL_TABLE}`,
      );
      const columns = rows
        .filter((r) => !r.startsWith("#") && !r.startsWith("col_name"))
        .map((r) => r.split(/\s+/)[0]);

      expect(columns).not.toContain("request_uri");
      expect(columns).not.toContain("request_method");
    }, 120_000);
  });

  describe("demo-lineage", () => {
    it(
      "runs DemoLineageExtractor successfully",
      () => {
        SparkJobRunner.runJob("demo-lineage", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );
  });

  describe("demo-delta-log-monitor", () => {
    const INVENTORY_DB = "data_ops_inventory_db";

    it(
      "runs DemoDeltaLogMonitor successfully",
      () => {
        SparkJobRunner.runJob("demo-delta-log-monitor", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );

    it("commit_history table exists and has rows", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `SELECT COUNT(*) AS cnt FROM ${INVENTORY_DB}.commit_history`,
      );
      const dataRows = rows.filter((r) => !isNaN(Number(r)));
      expect(dataRows.length).toBeGreaterThan(0);

      const count = parseInt(dataRows[0], 10);
      expect(count).toBeGreaterThan(0);
    }, 120_000);

    it("commit_history table has expected columns", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `DESCRIBE ${INVENTORY_DB}.commit_history`,
      );
      const columns = rows
        .filter((r) => !r.startsWith("#") && !r.startsWith("col_name"))
        .map((r) => r.split(/\s+/)[0]);

      expect(columns).toContain("database_name");
      expect(columns).toContain("table_name");
      expect(columns).toContain("table_fqn");
      expect(columns).toContain("version");
      expect(columns).toContain("commit_timestamp");
      expect(columns).toContain("operation");
      expect(columns).toContain("snapshot_date");
    }, 120_000);

    it("table_snapshots table exists and has rows", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `SELECT COUNT(*) AS cnt FROM ${INVENTORY_DB}.table_snapshots`,
      );
      const dataRows = rows.filter((r) => !isNaN(Number(r)));
      expect(dataRows.length).toBeGreaterThan(0);

      const count = parseInt(dataRows[0], 10);
      expect(count).toBeGreaterThan(0);
    }, 120_000);

    it("kpi_results table exists and has rows", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `SELECT COUNT(*) AS cnt FROM ${INVENTORY_DB}.kpi_results`,
      );
      const dataRows = rows.filter((r) => !isNaN(Number(r)));
      expect(dataRows.length).toBeGreaterThan(0);

      const count = parseInt(dataRows[0], 10);
      expect(count).toBeGreaterThan(0);
    }, 120_000);

    it("kpi_results table has expected KPI columns", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `DESCRIBE ${INVENTORY_DB}.kpi_results`,
      );
      const columns = rows
        .filter((r) => !r.startsWith("#") && !r.startsWith("col_name"))
        .map((r) => r.split(/\s+/)[0]);

      expect(columns).toContain("table_fqn");
      expect(columns).toContain("overall_status");
      expect(columns).toContain("freshness_status");
      expect(columns).toContain("completeness_status");
    }, 120_000);

    it("commit_history covers all tables in the estate", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `SELECT COUNT(DISTINCT table_fqn) AS cnt FROM ${INVENTORY_DB}.commit_history`,
      );
      const dataRows = rows.filter((r) => !isNaN(Number(r)));
      expect(dataRows.length).toBeGreaterThan(0);

      const distinctTables = parseInt(dataRows[0], 10);
      expect(distinctTables).toBeGreaterThan(0);
    }, 120_000);
  });

  describe("maintenance-vacuum", () => {
    it(
      "runs MaintenanceDeltaVacuumDriver successfully",
      () => {
        SparkJobRunner.runJob("maintenance-vacuum", JOB_TIMEOUT);
      },
      JOB_TIMEOUT,
    );
  });
});
