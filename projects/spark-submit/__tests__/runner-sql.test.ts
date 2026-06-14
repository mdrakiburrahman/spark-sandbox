/**
 * Unit tests for `resolveSqlSource` — the helper that picks the SQL string
 * for SQL-mode CLI runs from exactly one of --sql / --sql-file.
 *
 * `--sql-stdin` was REMOVED (nx's `run-commands` executor uses
 * `child_process.exec()` which closes the child's stdin, so a stdin-based
 * flag would only work via direct `tsx` and silently hang via nx).
 *
 * The helper takes an injectable `SqlSourceDeps` so we can stub file reads
 * without touching `node:fs`.
 */

import { resolveSqlSource, type SqlSourceDeps } from "../client/cli/sql-source";
import type { CliArgs } from "../interface/types";

/**
 * Build a SqlSourceDeps for testing. readFile throws by default — tests
 * opt in by overriding it.
 */
function makeDeps(overrides: Partial<SqlSourceDeps> = {}): SqlSourceDeps {
  return {
    readFile:
      overrides.readFile ??
      (() => {
        throw new Error("readFile should not have been called");
      }),
  };
}

function baseArgs(): CliArgs {
  return {
    dryRun: false,
    list: false,
    noDag: false,
    parallel: true,
    api: false,
    ui: false,
  };
}

describe("resolveSqlSource", () => {
  // ─────────────────────────────────────────────────────────────────────
  // Happy paths
  // ─────────────────────────────────────────────────────────────────────

  it("returns inline SQL verbatim when only --sql is set", async () => {
    const args = { ...baseArgs(), sql: "SELECT *\nFROM t\nWHERE x = 'foo'" };
    const sql = await resolveSqlSource(args, makeDeps());
    expect(sql).toBe("SELECT *\nFROM t\nWHERE x = 'foo'");
  });

  it("reads SQL from --sql-file via the injected readFile", async () => {
    const fileContent = "SELECT 1\n-- a comment\nUNION ALL\nSELECT 2\n";
    let receivedPath = "";
    const sql = await resolveSqlSource(
      { ...baseArgs(), sqlFile: "/some/path/q.sql" },
      makeDeps({
        readFile: (p) => {
          receivedPath = p;
          return fileContent;
        },
      }),
    );
    expect(receivedPath).toBe("/some/path/q.sql");
    expect(sql).toBe(fileContent);
  });

  it("preserves trailing whitespace/newlines in the resolved SQL (sent verbatim)", async () => {
    const sql = await resolveSqlSource(
      { ...baseArgs(), sqlFile: "/q.sql" },
      makeDeps({ readFile: () => "SELECT 1;\n" }),
    );
    expect(sql).toBe("SELECT 1;\n");
  });

  // ─────────────────────────────────────────────────────────────────────
  // Mutex validation
  // ─────────────────────────────────────────────────────────────────────

  it("throws when no SQL source is provided", async () => {
    await expect(resolveSqlSource(baseArgs(), makeDeps())).rejects.toThrow(
      /one of --sql or --sql-file is required/,
    );
  });

  it("throws when --sql and --sql-file are both provided", async () => {
    await expect(
      resolveSqlSource(
        { ...baseArgs(), sql: "SELECT 1", sqlFile: "/q.sql" },
        makeDeps(),
      ),
    ).rejects.toThrow(/mutually exclusive.*--sql.*--sql-file/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Error wrapping
  // ─────────────────────────────────────────────────────────────────────

  it("wraps file-read errors with the path in the message", async () => {
    await expect(
      resolveSqlSource(
        { ...baseArgs(), sqlFile: "/missing.sql" },
        makeDeps({
          readFile: () => {
            throw new Error("ENOENT: no such file or directory");
          },
        }),
      ),
    ).rejects.toThrow(/failed to read --sql-file=\/missing\.sql:.*ENOENT/);
  });

  // ─────────────────────────────────────────────────────────────────────
  // Empty SQL validation
  // ─────────────────────────────────────────────────────────────────────

  it("throws when --sql is an empty string (treated as a source but rejected by trim check)", async () => {
    await expect(
      resolveSqlSource({ ...baseArgs(), sql: "" }, makeDeps()),
    ).rejects.toThrow(/resolved SQL is empty/);
  });

  it("throws when --sql-file resolves to whitespace-only content", async () => {
    await expect(
      resolveSqlSource(
        { ...baseArgs(), sqlFile: "/q.sql" },
        makeDeps({ readFile: () => "   \n\t\n" }),
      ),
    ).rejects.toThrow(/resolved SQL is empty/);
  });
});
