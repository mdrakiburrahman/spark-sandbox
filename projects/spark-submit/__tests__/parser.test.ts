/**
 * Unit tests for CliParser — focused on the SQL-mode flags, since those
 * are the recent (and trickiest) additions to the parser.
 */

import { CliParser } from "../client/cli/parser";

/**
 * Helper: run CliParser.parse() with a synthetic argv. The parser reads
 * `process.argv.slice(2)` directly, so we mutate process.argv around the
 * call and restore it afterwards.
 */
function parseWith(args: string[]): ReturnType<typeof CliParser.parse> {
  const original = process.argv;
  process.argv = ["node", "script", ...args];
  try {
    return CliParser.parse();
  } finally {
    process.argv = original;
  }
}

describe("CliParser — SQL flags", () => {
  it("parses --sql=<inline> verbatim and leaves --sql-file undefined", () => {
    const result = parseWith(["--sql=SELECT 1"]);
    expect(result.sql).toBe("SELECT 1");
    expect(result.sqlFile).toBeUndefined();
  });

  it("preserves embedded newlines, single quotes, and en-dashes in --sql", () => {
    const sql = "SELECT *\nFROM t\nWHERE x = 'PostgreSQL – Azure Arc'";
    const result = parseWith([`--sql=${sql}`]);
    expect(result.sql).toBe(sql);
  });

  it("preserves embedded `=` in --sql values (substring, not split)", () => {
    const sql = "SELECT '1=2' AS x";
    const result = parseWith([`--sql=${sql}`]);
    expect(result.sql).toBe(sql);
  });

  it("parses --sql-file=<path> verbatim using substring (path may contain =)", () => {
    const result = parseWith(["--sql-file=/tmp/some=weird/path.sql"]);
    expect(result.sqlFile).toBe("/tmp/some=weird/path.sql");
    expect(result.sql).toBeUndefined();
  });

  it("does not set any SQL field when none are passed", () => {
    const result = parseWith(["--list"]);
    expect(result.sql).toBeUndefined();
    expect(result.sqlFile).toBeUndefined();
  });

  it("captures both SQL fields in parallel (mutex is enforced by the resolver, not the parser)", () => {
    const result = parseWith(["--sql=foo", "--sql-file=/x.sql"]);
    expect(result.sql).toBe("foo");
    expect(result.sqlFile).toBe("/x.sql");
  });

  it("does not consume --sql when it appears as a fragment of another flag", () => {
    // Sanity: --sql-file= must NOT be matched by --sql= startsWith check
    const result = parseWith(["--sql-file=/q.sql"]);
    expect(result.sqlFile).toBe("/q.sql");
    expect(result.sql).toBeUndefined();
  });

  it("does not accept --sql-stdin (the flag was removed because nx cannot forward stdin)", () => {
    // The parser should silently ignore unknown flags; --sql-stdin should NOT
    // resurrect as a side-effect of touching some other field.
    const result = parseWith(["--sql-stdin"]);
    // No `sqlStdin` field exists on CliArgs anymore; this asserts the flag
    // is a no-op (nothing in the result reflects it).
    expect(result.sql).toBeUndefined();
    expect(result.sqlFile).toBeUndefined();
    expect(
      (result as unknown as Record<string, unknown>).sqlStdin,
    ).toBeUndefined();
  });
});

describe("CliParser — --job flag (single + comma-separated)", () => {
  it("keeps the raw value in args.job and populates args.jobs with one entry", () => {
    const result = parseWith(["--job=arn-gold-star-extensions"]);
    expect(result.job).toBe("arn-gold-star-extensions");
    expect(result.jobs).toEqual(["arn-gold-star-extensions"]);
  });

  it("splits --job=a,b,c into args.jobs and preserves the raw string in args.job", () => {
    const result = parseWith(["--job=a,b,c"]);
    expect(result.job).toBe("a,b,c");
    expect(result.jobs).toEqual(["a", "b", "c"]);
  });

  it("trims whitespace around each comma-separated job name", () => {
    const result = parseWith(["--job=  alpha , beta ,gamma  "]);
    expect(result.jobs).toEqual(["alpha", "beta", "gamma"]);
  });

  it("drops empty segments from --job=a,,b", () => {
    const result = parseWith(["--job=a,,b,"]);
    expect(result.jobs).toEqual(["a", "b"]);
  });

  it("leaves args.job and args.jobs unset when --job is not passed", () => {
    const result = parseWith(["--list"]);
    expect(result.job).toBeUndefined();
    expect(result.jobs).toBeUndefined();
  });

  it("preserves embedded `=` within a job name segment (substring split, not split-on-=)", () => {
    // Defensive: job names won't contain `=` in practice, but the parser
    // already uses substring() for sql/sql-file — make sure --job behaves the same.
    const result = parseWith(["--job=foo=bar,baz"]);
    expect(result.job).toBe("foo=bar,baz");
    expect(result.jobs).toEqual(["foo=bar", "baz"]);
  });
});
