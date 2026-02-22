import { SparkJobRunner, SparkSql, SparkConfig } from "./common";

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

    it("OpenLineage events are captured in http_dumper_plugin table and contain valid JSON", async () => {
      const rows = await SparkSql.queryRowsAsync(
        `SELECT request_body FROM data_ops_inventory_db.http_dumper_plugin`,
      );
      const dataRows = rows.filter((r) => r !== "request_body");
      expect(dataRows.length).toBeGreaterThan(0);

      for (const row of dataRows) {
        const parsed = JSON.parse(row);
        expect(parsed).toHaveProperty("eventType");
        expect(parsed).toHaveProperty("producer");
        expect(
          ["START", "RUNNING", "COMPLETE", "FAIL", "OTHER"].includes(
            parsed.eventType,
          ),
        ).toBe(true);
      }
    }, 120_000);
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
});
