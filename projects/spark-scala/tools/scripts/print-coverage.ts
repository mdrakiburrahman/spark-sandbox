#!/usr/bin/env npx tsx
/**
 * Parse scoverage XML reports and print a per-project coverage summary.
 */

import { readFileSync } from "fs";
import { resolve, sep, dirname } from "path";
import { fileURLToPath } from "url";
import { globSync } from "glob";
import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");
const REPORT_GLOB = "*/target/scala-*/scoverage-report/scoverage.xml";
const HTML_GLOB = "*/target/scala-*/scoverage-report/index.html";
const SEP = "─".repeat(72);

interface CoverageData {
  project: string;
  statementRate: number;
  branchRate: number;
  statementsInvoked: number;
  statementCount: number;
}

function parseReport(path: string): Omit<CoverageData, "project"> {
  const xml = readFileSync(path, "utf-8");
  const parser = new XMLParser({ ignoreAttributes: false });
  const doc = parser.parse(xml);
  const root = doc["statement-coverage"] ?? doc["scoverage"] ?? {};
  const attrs = (key: string) => root[`@_${key}`] ?? root[key] ?? 0;

  return {
    statementRate: parseFloat(attrs("statement-rate")),
    branchRate: parseFloat(attrs("branch-rate")),
    statementsInvoked: parseInt(attrs("statements-invoked"), 10),
    statementCount: parseInt(attrs("statement-count"), 10),
  };
}

function projectName(path: string): string {
  const parts = path.split(sep);
  const idx = parts.indexOf("target");
  return idx > 0 ? parts[idx - 1] : "unknown";
}

function pad(s: string, len: number, right = false): string {
  return right ? s.padEnd(len) : s.padStart(len);
}

function main(): void {
  const reports = globSync(REPORT_GLOB, { cwd: PROJECT_ROOT })
    .map((r) => resolve(PROJECT_ROOT, r))
    .sort();

  if (reports.length === 0) {
    console.log(
      "\n⚠  No scoverage reports found. Coverage may not have been generated.\n",
    );
    return;
  }

  const rows: CoverageData[] = reports.map((r) => ({
    project: projectName(r),
    ...parseReport(r),
  }));

  console.log(`\n${SEP}`);
  console.log("  📊  Line Coverage Summary (scoverage)");
  console.log(SEP);
  console.log(
    `  ${pad("Project", 25, true)} ${pad("Lines", 14)} ${pad("Statement", 12)} ${pad("Branch", 10)}`,
  );
  console.log(
    `  ${"─".repeat(25)} ${"─".repeat(14)} ${"─".repeat(12)} ${"─".repeat(10)}`,
  );

  let totalInvoked = 0;
  let totalStmts = 0;

  for (const row of rows) {
    totalInvoked += row.statementsInvoked;
    totalStmts += row.statementCount;
    const lines = `${row.statementsInvoked}/${row.statementCount}`;
    console.log(
      `  ${pad(row.project, 25, true)} ${pad(lines, 14)} ${pad(`${row.statementRate.toFixed(1)}%`, 12)} ${pad(`${row.branchRate.toFixed(1)}%`, 10)}`,
    );
  }

  if (rows.length > 1) {
    const overall = totalStmts > 0 ? (totalInvoked / totalStmts) * 100 : 0;
    const lines = `${totalInvoked}/${totalStmts}`;
    console.log(
      `  ${"─".repeat(25)} ${"─".repeat(14)} ${"─".repeat(12)} ${"─".repeat(10)}`,
    );
    console.log(
      `  ${pad("TOTAL", 25, true)} ${pad(lines, 14)} ${pad(`${overall.toFixed(1)}%`, 12)}`,
    );
  }

  console.log(SEP);

  const htmlReports = globSync(HTML_GLOB, { cwd: PROJECT_ROOT })
    .map((r) => resolve(PROJECT_ROOT, r))
    .sort();

  if (htmlReports.length > 0) {
    console.log("  HTML reports:");
    for (const r of htmlReports) {
      console.log(`    → ${r}`);
    }
    console.log();
  }

  const MIN_COVERAGE = 95;
  const overall = totalStmts > 0 ? (totalInvoked / totalStmts) * 100 : 0;
  if (overall < MIN_COVERAGE) {
    console.error(
      `  ❌  Coverage ${overall.toFixed(1)}% is below the minimum threshold of ${MIN_COVERAGE}%\n`,
    );
    process.exit(1);
  } else {
    console.log(
      `  ✅  Coverage ${overall.toFixed(1)}% meets the minimum threshold of ${MIN_COVERAGE}%\n`,
    );
  }
}

main();
