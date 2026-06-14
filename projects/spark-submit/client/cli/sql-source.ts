/**
 * SQL source resolver — picks the SQL string for SQL-mode CLI runs from
 * exactly one of `--sql=<inline>` or `--sql-file=<path>`.
 *
 * Lives in its own file (independent of the rest of `runner.ts`) so unit
 * tests can import it without pulling in the full CLI runner's import
 * graph. That keeps the surface tiny and avoids needing project-wide
 * jest config tweaks.
 */

import * as fs from "node:fs";
import type { CliArgs } from "../../interface/index.js";

/**
 * Injectable I/O surface for `resolveSqlSource` — kept as a separate type so
 * tests can stub file reads without monkey-patching `node:fs`.
 */
export interface SqlSourceDeps {
  readFile: (path: string) => string;
}

const defaultSqlSourceDeps: SqlSourceDeps = {
  readFile: (p) => fs.readFileSync(p, "utf-8"),
};

/**
 * Resolve the SQL string for SQL-mode runs from exactly one of two sources:
 * `--sql=<inline>` or `--sql-file=<path>`.
 *
 * Sources are mutually exclusive. The function throws on:
 *   - zero sources provided,
 *   - both sources provided,
 *   - file-read errors (path is wrapped into the error message),
 *   - resolved SQL that is empty or whitespace-only.
 *
 * The original untrimmed SQL is returned so any trailing newline or
 * formatting in the source is preserved on the wire.
 *
 * @param args CLI arguments (only `sql` and `sqlFile` are read).
 * @param deps Injectable I/O surface — defaults to real `fs.readFileSync`.
 */
export async function resolveSqlSource(
  args: CliArgs,
  deps: SqlSourceDeps = defaultSqlSourceDeps,
): Promise<string> {
  const sources: string[] = [];
  if (args.sql !== undefined) sources.push("--sql");
  if (args.sqlFile !== undefined) sources.push("--sql-file");

  if (sources.length === 0) {
    throw new Error("one of --sql or --sql-file is required");
  }
  if (sources.length > 1) {
    throw new Error(
      `--sql and --sql-file are mutually exclusive (got: ${sources.join(", ")})`,
    );
  }

  let sql: string;
  if (args.sqlFile !== undefined) {
    try {
      sql = deps.readFile(args.sqlFile);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`failed to read --sql-file=${args.sqlFile}: ${msg}`);
    }
  } else {
    sql = args.sql!;
  }

  if (sql.trim().length === 0) {
    throw new Error("resolved SQL is empty");
  }
  return sql;
}
