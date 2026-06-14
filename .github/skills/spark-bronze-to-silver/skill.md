---
name: spark-bronze-to-silver
description: "Interactive workflow to create Bronze-to-Silver Spark transformations. Discovers source data, catalogs existing transformers, validates schema design with the user, generates code (Constants, Loader, Transformer, Driver), registers tables for VACUUM, creates unit tests, and validates via spark-submit."
user-invocable: true
---

# Bronze-to-Silver Spark Transformation Generator

Interactive skill to create new Silver-layer Spark transformations from existing Bronze Delta tables.

---

## CRITICAL: Human-in-the-Loop

This skill is **interactive**. You MUST pause and ask the user for confirmation at designated checkpoints (marked with 🛑). Do not auto-generate destination database or table names without user input.

**NEVER `git add` or `git commit`** — all changes will be reviewed, committed and pushed by a human.

---

## The Job

Given source Bronze table(s), produce production-ready Silver transformation code:

```
Constants → Loader → Transformer(s) → Driver (reuse existing where possible — see Step 4) → Unit Tests → spark-jobs.yaml entry → VACUUM registration.
```

You will use `/fleet` mode and/or sub-agents to delegate and parallelize as much work as possible (e.g. schema discovery etc).

---

## Context

-   **Project**: `spark-scala` at `/workspaces/spark-sandbox/projects/spark-scala`
-   **Build system**: Nx with sbt for Scala compilation; 3 SBT submodules (`common-executor` → `common` → `spark-demo`)
-   **Spark Submit CLI**: `projects/spark-submit/` — see `projects/spark-submit/README.md`. Two entry points:
    -   `npx nx run spark-submit:query --sql="…"` — Spark SQL queries (auto-starts Livy + API server)
    -   `npx nx run spark-submit:run --job=<name>` — execute a registered job (DAG-resolved)
-   **Test framework**: ScalaTest `AnyFunSpec with Matchers` with forked JVMs
-   **Key patterns**:
    -   `common/src/main/scala/me/rakirahman/etl/transformer/DataTransformer.scala` — Base transformer trait
    -   `common/src/main/scala/me/rakirahman/etl/execution/stateless/Sequencer.scala` — Multi-table parallel orchestration to stream from one table to multiple
    -   `common/src/main/scala/me/rakirahman/feeds/schema/extensions/SchemaExtensions.scala` — `flattenedSchema()` for nested→flat
    -   `common/src/main/scala/me/rakirahman/etl/transformer/extensions/DataFrameArrayExtensions.scala` — `unionWithMergedSchema()` for wide tables
    -   `common/src/main/scala/me/rakirahman/etl/schema/openlineage/v1/OpenLineageConstants.scala` — Enum/schema mapping pattern
    -   `common-executor/src/main/scala/me/rakirahman/etl/transformer/sorter/DateSorter.scala` — `SortableColumnNames` + `DateTypes` enums (note: lives in `common-executor`, not `common`)

---

## Step 0: Gather Requirements

🛑 **ASK the user:**

> What source Bronze table(s) do you want to transform to Silver? Provide the fully qualified table names (e.g. `data_ops_inventory_db.openlineage`).

Collect:

-   Source table name(s) — one or more
-   Any known context about what the data represents (optional, but helpful)

If the user provides a topic name (e.g. `lineage-events`), help them discover the actual table names:

```bash
npx nx run spark-submit:query --sql="SHOW DATABASES"
npx nx run spark-submit:query --sql="SHOW TABLES IN <database>"
```

---

## Step 1: Data Discovery

For **each** source table, sample and analyze the data using the Spark Submit CLI:

### 1a: Sample raw data

```bash
cd /workspaces/spark-sandbox
npx nx run spark-submit:query --sql="SELECT * FROM <source_table> LIMIT 5"
```

### 1b: Inspect the schema

```bash
npx nx run spark-submit:query --sql="DESCRIBE <source_table>"
```

### 1c: Analyze the Body/payload column

Most Bronze tables have a `Body` column containing JSON. Parse it to get a sense of the actual data structure:

```bash
npx nx run spark-submit:query --sql="SELECT CAST(Body AS STRING) AS body FROM <source_table> LIMIT 10"
```

### 1d: Detect data characteristics

For each source table, determine:

| Characteristic          | How to detect                             | Impact                                |
| ----------------------- | ----------------------------------------- | ------------------------------------- |
| **JSON body**           | `CAST(Body AS STRING)` returns JSON       | Need `from_json()` with schema        |
| **XML body**            | Body starts with `<`                      | Need `databricks-xml` library         |
| **Base64 encoded**      | Body contains base64                      | Need `unbase64()` + decode            |
| **GZip compressed**     | Payload contains gzip bytes               | Need decompression logic              |
| **Multiplexed data**    | Different schemas in same table           | Need enum-based routing               |
| **Array[Struct]**       | Schema shows `ArrayType(StructType(...))` | Need `explode_outer()` → flat columns |
| **Array[primitive]**    | Schema shows `ArrayType(StringType)` etc. | Keep as-is                            |
| **Has `region` column** | `DESCRIBE` shows `region`                 | Add region partition                  |
| **Has timestamp**       | Various timestamp columns exist           | Add time series partition             |

### 1e: For multiplexed data, identify distinct types

If a table contains multiple event types (detectable via a discriminator field like `eventType`, `event_type`, `subject`, or `api_url`):

```bash
npx nx run spark-submit:query --sql="SELECT DISTINCT <discriminator_field> FROM <source_table> LIMIT 50"
```

Document each distinct type — these will become enum values for routing.

---

## Step 2: Build Transformer Catalog

Search the codebase for existing `DataTransformer` implementations to find the best patterns to model after.

### 2a: Find all implementations

```bash
cd /workspaces/spark-sandbox/projects/spark-scala
grep -rn "extends DataTransformer\|with DataTransformer" --include="*.scala" \
  | grep -v "test/" \
  | grep -v "target/"
```

### 2b: Catalog each transformer

For each implementation found, note:

| Field                   | How to determine                                               |
| ----------------------- | -------------------------------------------------------------- |
| **Class name**          | From the grep output                                           |
| **Data type**           | From the file path and class comments                          |
| **Methods implemented** | `transform()`, `transformBatch()`, `transformBatchSequencer()` |
| **Multi-table output?** | Uses Sequencer with multiple Actions                           |
| **Schema handling**     | Static StructType, dynamic `from_json()`, `flattenedSchema()`  |
| **Partitioning**        | Which partition columns it uses                                |

### 2c: Rank by similarity

🛑 **Present the catalog to the user** with a recommendation of which 1-3 transformers most closely match the current task. Factors:

-   Same data source type (HTTP-dumped events, Delta stream, etc.)
-   Similar body format (JSON, XML, base64)
-   Similar multiplexing pattern (single vs multi-table output)
-   Similar complexity (simple cast vs explode + flatten)

Example output (this repo has a small Silver catalog — usually `OpenLineageSilverTransformer` is the closest match):

```
Transformer Catalog (ranked by relevance):
1. ⭐ OpenLineageSilverTransformer — Multi-eventType JSON routing via Sequencer, dynamic flattening
2.    RedditIngestionLoader        — Bronze-side cast/select example for HTTP-sourced JSON
...
```

Then, for this data source, unless there's an existing transformer where this payload belongs, use the existing patterns in the codebase to create a new Transformer.

---

## Step 3: Design Validation

Based on the data analysis (Step 1) and transformer catalog (Step 2), propose:

### 3a: Destination database and table names

Follow existing naming conventions:

-   Database: `<domain>_db` (e.g., `data_ops_inventory_db`, `reddit_db`)
-   Table: `silver_<descriptive_name>` (e.g., `silver_lineage_events`, `silver_commit_history`)
-   For multi-table outputs, use a common prefix: `silver_<domain>_<type>`

### 3b: Schema design

For each output table, propose:

-   Column names and types
-   Which nested fields to flatten
-   Which arrays to explode
-   Partition columns:
    -   **Always** include a time series partition from `DateSorter.scala` → `SortableColumnNames`, which can be built from an existing column with `DateSorter.convert()`
    -   **Always** include `region` partition if the source data has a `region` column
-   For multiplexed data: create a comprehensive set of enum values and routing strategy, similar to `OpenLineageConstants.scala`

### 3c: Enum design (if applicable)

If the source data is multiplexed, propose enum values and the discriminator logic.

🛑 **PAUSE — Present the complete design to the user and wait for confirmation.**

Ask:

> Here is my proposed schema design for the Silver tables. Please confirm or suggest changes to:
>
> 1. Database name(s)
> 2. Table name(s)
> 3. Column selections
> 4. Partition strategy
> 5. Enum values (if applicable)

Do NOT proceed until the user confirms.

---

## Step 4: Driver Reuse Analysis

Search for existing Driver classes that can be reused or extended.

### 4a: Find candidate drivers

```bash
cd /workspaces/spark-sandbox/projects/spark-scala
grep -rn "class.*Driver.*extends\|object.*Driver.*extends" --include="*.scala" \
  | grep -v "test/" \
  | grep -v "target/" \
  | grep -i "silver"
```

### 4b: Evaluate reuse candidates

For each candidate driver, check:

-   Does it support the same input format (Delta stream, HTTP-pull, etc.)?
-   Does it support typed/enum-based processing?
-   Can new enum values be added without modifying the driver — simply by updating `projects/spark-submit/config/spark-jobs.yaml` (e.g. via the job entry's `args` / `inlineConfig`)?
-   Does it support multi-table output via Sequencer?

### 4c: Decision

-   **Reuse existing driver**: If a driver already supports the pattern (e.g., `OpenLineageSilverDriver` for Delta-stream → Silver typed processing), add new enum values and a new Loader/Transformer.
-   **Extend existing driver**: If a driver is close but needs minor modifications.
-   **Create new driver**: Only if no existing driver fits. Follow the patterns in `OpenLineageSilverDriver`.

🛑 **PAUSE — Present the driver reuse decision to the user and wait for confirmation.**

---

## Step 5: Code Generation

Generate the Scala code following established patterns. All Silver code goes in:

```
spark-demo/src/main/scala/me/rakirahman/sparkdemo/etl/
```

If code can be shared (e.g. a cross-domain concept), place shared code in:

```
common/src/main/scala/me/rakirahman/etl/
```

If the code must be loadable by Spark executors (e.g. custom UDFs, plugins, sorter enums), place it in:

```
common-executor/src/main/scala/me/rakirahman/etl/
```

### 5a: Constants / Metadata object

Create an enum + metadata object following the `OpenLineageConstants.scala` pattern:

```scala
// Example structure
object MyDataConstants {
  object MyDataTypes extends Enumeration {
    val TypeA, TypeB, TypeC = Value
  }

  // Table name generators, view name generators, schema mappings
}
```

Key patterns to follow:

-   Use `Enumeration` for type-safe routing
-   Map enums → `ResourceConfig` case classes (source view, output tables, partitions)
-   Use `GenericDataLoaderMetadata[EnumType, ConfigType]` for metadata

### 5b: Transformer(s)

Implement `DataTransformer` following the closest catalog match from Step 2:

-   **`transform()`**: Always implement for basic column transformations that Spark Streaming supports out of the box
-   **`transformBatchSequencer()`**: Implement if multi-table output is needed (returns `Sequencer[DataFrame]`)
-   **`transformBatch()`**: Implement if single-table micro-batch is needed due to window operations or complex logic that can't be expressed in `transform()`

**Mandatory transformation steps:**

The goal is to unnest, flatten, explode the data as much as possible to achieve maximum columnar compression.

-   Cast `Body` to string (if Base64 encoded source)
-   Parse payload (`from_json()`, XML parser, `unbase64()`, etc.)
-   Flatten nested structs using `SchemaExtensions.scala -> flattenedSchema()` if needed
-   Explode `Array[Struct]` using `explode_outer()` — keep original struct column too
-   Add computed columns (ingest timestamps, derived fields)
-   If the opportunity exists to create a wide table due to shared columns, opt-in to do so with `DataFrameArrayExtensions.scala -> unionWithMergedSchema()`
-   **Add time series partition** using `DateSorter.convert()`:
    -   Use `SortableColumnNames.YEAR_MONTH_LIT` or `YEAR_MONTH_DATE_LIT` for synthetic partition columns (`YearMonth` / `YearMonthDate`)
    -   Use `YEAR_MONTH_EVENT` / `YEAR_MONTH_DATE_EVENT` if the source already has the partition column under the `event_year_*` name
    -   Choose granularity based on data volume: high volume → `YearMonthDate`, low volume → `YearMonth`
-   **Add region partition** if source has `region` column
-   Select final columns in explicit order
-   For multiplexed data: use enum-based filtering and build `Sequencer` with `Job`s and `Action`s

### 5c: Loader

Create a Loader composing Readers + Transformer following the `OpenLineageSilverTransformer` / `RedditIngestionLoader` patterns:

```scala
class MySilverLoader(...) extends DataLoader {
  def load(): DataFrame = {
    readers
      .map(_.read())
      .map(transformer.transform)
      .reduce(_ unionByName _)
  }
}
```

### 5d: Driver (if new one is needed)

Follow the existing Driver → Loader → Transformer chain (see `OpenLineageSilverDriver`):

-   Parse config and arguments
-   Extract regional table mappings (if applicable)
-   Build feed format objects
-   Create Loader with regional feeds
-   Configure output with partitions
-   Execute and write to Delta
-   Always use base classes
-   Always use Spark Streaming
-   Driver classes extend `App with Logging`

### 5e: Code quality checklist

Before proceeding, verify:

-   [ ] All imports are explicit (no wildcards except for implicits)
-   [ ] Column names should use snake_case
-   [ ] Partition columns should match the design from Step 3
-   [ ] Region column should be included if source data has regions
-   [ ] Time series partition should be present
-   [ ] For multi-table: Sequencer Actions should have `maxRetries` set (typically 3-5)
-   [ ] No hardcoded strings for column names — use constants

---

## Step 6: VACUUM Registration

**ALWAYS** add new Silver tables to `LakeDeltaVacuumMetadata` in:

```
spark-demo/src/main/scala/me/rakirahman/sparkdemo/etl/drivers/general/maintenance/MaintenanceDeltaVacuumDriver.scala
```

### 6a: Check for existing prefix matches

Before adding, check if an existing entry already covers the new table via prefix matching:

```bash
cd /workspaces/spark-sandbox/projects/spark-scala
grep -n "DesiredDeltaTableConfig" \
  spark-demo/src/main/scala/me/rakirahman/sparkdemo/etl/drivers/general/maintenance/MaintenanceDeltaVacuumDriver.scala \
  | grep "<database_name>"
```

If an existing entry with `isPrefix = true` already matches (e.g., a `*` entry for the same database), **do not add a duplicate**.

### 6b: Add new entries

If no prefix match exists, add a `DesiredDeltaTableConfig` entry. The local style is **one entry per line, columns aligned for diff-friendliness, alphabetical-by-`tableNameOrPrefix` per database block**. Example matching the existing pattern in this repo:

```scala
DesiredDeltaTableConfig(database = "<database>",  tableNameOrPrefix = "silver_<prefix>",  isPrefix = true,  skipVacuum = false,  skipOptimize = true,   skipPurge = false,  purgePartitionColumn = SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString,  purgePartitionColumnDateType = DateTypes.YearMonthDate,  numPartitionsToRetain = 30,  zOrderColumns = Array("<key>")),
```

Guidelines:

-   `skipOptimize = true` for Silver tables fed by streaming (most cases)
-   `numPartitionsToRetain`: 12 for `YearMonth`, 30 for `YearMonthDate`, `Int.MaxValue` for dimension/snapshot tables that never purge
-   Use `isPrefix = true` with a common prefix if you have multiple tables sharing a naming pattern
-   Use `skipPurge = true` (with empty `purgePartitionColumn` and `null` `purgePartitionColumnDateType`) for dimension/seed tables that should retain all history
-   Use `SortableColumnNames.YEAR_MONTH_DATE_EVENT` when the partition column in your table is named `event_year_date` (this repo's standard); use `YEAR_MONTH_DATE_LIT` (`YearMonthDate`) when you've added a synthetic partition column
-   Maintain the file's wide-line aligned layout — each entry is one line for visual diff alignment

---

## Step 7: Unit Tests

Create unit tests following the integration test pattern in:

```
spark-demo/src/test/scala/me/rakirahman/sparkdemo/etl/
```

### 7a: Reference test

Study the existing integration test pattern:

```
spark-demo/src/test/scala/me/rakirahman/sparkdemo/etl/OpenLineageIntegrationTest.scala
```

(Other reference tests in this repo: `RedditIngestionTransformerTest.scala`, `MicrosoftEmployeesSeedLoaderTest.scala`.)

### 7b: Test structure

```scala
class MySilverTransformerTest extends AnyFunSpec with Matchers with SparkSessionTestHelper {

  describe("MySilverTransformer") {
    it("should transform raw JSON to silver schema") {
      // 1. Create test DataFrame with sample data from Step 1
      // 2. Instantiate transformer
      // 3. Call transform() or transformBatchSequencer()
      // 4. Assert output schema matches expected
      // 5. Assert row counts
      // 6. Assert specific column values
      // 7. Assert partition columns exist
    }

    it("should handle null/missing fields gracefully") { /* ... */ }

    it("should handle multiplexed data types") { /* ... */ }  // if applicable

    it("should explode array fields correctly") { /* ... */ }  // if applicable
  }
}
```

### 7c: Test data

Use the sample data from Step 1 as test fixtures. Create inline JSON strings or resource files.

---

## Step 8: Update spark-jobs.yaml

Register the new job(s) in:

```
projects/spark-submit/config/spark-jobs.yaml
```

### 8a: Add job driver definition

This is only required if you're not reusing an existing driver. If you are reusing existing, update the config to register this new source.

```yaml
<job-name>-silver:
    module: spark-demo
    class: <fully.qualified.DriverClass>
    category: silver
    description: "<descriptive name>"
    args: [<config-file>, <type-args>]
    useAdditionalJars: false
    dependsOn: [<bronze-job-name>]
```

### 8b: Verify Directed Acyclic Graph

```bash
cd /workspaces/spark-sandbox
npx nx run spark-submit:run --upstream=<fully.qualified.DriverClass>
```

Ensure the dependency chain of the Directed Acyclic Graph is correct (bronze → silver).

---

## Step 9: Build and Test

### 9a: Compile + lint

```bash
cd /workspaces/spark-sandbox
npx nx run spark-scala:lint
cd projects/spark-scala && sbt compile
```

Fix any compilation errors before proceeding.

### 9b: Build JAR

```bash
cd /workspaces/spark-sandbox
npx nx run spark-scala:build-jar
```

### 9c: Run tests

```bash
npx nx run spark-scala:test-scala
```

If tests fail:

1.  Identify failing test class
2.  Run only that test: `cd projects/spark-scala && sbt "sparkDemo/testOnly *MyTest"`
3.  Fix the code
4.  Re-run full suite

Do NOT proceed until all tests pass.

---

## Step 10: Spark Submit Validation

### 10a: Dry run

```bash
cd /workspaces/spark-sandbox
npx nx run spark-submit:run --job=<job-name> --dry-run=true
```

### 10b: Execute

```bash
npx nx run spark-submit:run --job=<job-name> --dry-run=false
```

### 10c: Validate output data

```bash
npx nx run spark-submit:query --sql="SELECT * FROM <destination_db>.<silver_table> LIMIT 5"
npx nx run spark-submit:query --sql="SELECT COUNT(*) FROM <destination_db>.<silver_table>"
npx nx run spark-submit:query --sql="DESCRIBE <destination_db>.<silver_table>"
```

Verify:

-   Data exists in Silver tables
-   Schema matches the design from Step 3
-   Partition columns are present and populated
-   No NULL values in required columns

### 10d: Clean and retest (if needed)

```bash
npx nx run spark-scala:clean
```

Then re-run from Step 10b.

---

## Step 11: Ralph Regression Loop

Run the full regression suite to ensure nothing is broken:

```bash
cd /workspaces/spark-sandbox
```

Follow the instructions in:

```
.github/skills/ralph-spark-scala/skill.md
```

This includes compile → build → test → spark-submit DAG validation.
