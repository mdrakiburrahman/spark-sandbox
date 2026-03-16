// Ralph Wiggum — long-running Copilot agent loop
// Usage: npx tsx tools/scripts/ralph.ts <prompt.md> [--mcp <server>]... [-n 10] [--skip-to "Step 4"]

import { Command } from "commander";
import { readFileSync } from "fs";
import { spawn } from "child_process";

const program = new Command()
  .name("ralph")
  .description("Ralph Wiggum — long-running Copilot agent loop")
  .argument("<promptFile>", "Markdown file to pipe into copilot")
  .option("--mcp <servers...>", "MCP server names to pass to copilot")
  .option("-n, --iterations <count>", "Max iterations", "30")
  .option(
    "--skip-to <instruction>",
    'Prepend instruction to skip to a specific step (e.g. "Skip to Step 4")',
  )
  .parse();

const {
  mcp = [],
  iterations,
  skipTo,
} = program.opts<{ mcp?: string[]; iterations: string; skipTo?: string }>();
const [promptFile] = program.args;
const maxIter = parseInt(iterations, 10);

let prompt: string;
try {
  prompt = readFileSync(promptFile, "utf-8");
} catch {
  console.error(`Error: Cannot read '${promptFile}'`);
  process.exit(1);
}

if (skipTo) {
  prompt = `**INSTRUCTION: ${skipTo}** — Skip earlier steps and begin from this point.\n\n${prompt}`;
}

/** Parse the completion signal from copilot output. */
function parseCompletionSignal(output: string): "Succeeded" | "Failed" | null {
  // Search from the end of the output for the JSON signal
  const lines = output.trimEnd().split("\n");
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
    const line = lines[i].trim();
    // Match { "status": "Succeeded" } or { "status": "Failed" } with flexible whitespace/quotes
    const match = line.match(/\{\s*"?status"?\s*:\s*"(Succeeded|Failed)"\s*\}/);
    if (match) return match[1] as "Succeeded" | "Failed";
  }
  return null;
}

/** Run copilot and capture output while streaming to terminal. */
function runCopilot(
  args: string[],
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn("copilot", args, {
      stdio: ["inherit", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stdout.write(text);
      output += text;
    });

    child.stderr.on("data", (data: Buffer) => {
      const text = data.toString();
      process.stderr.write(text);
      output += text;
    });

    child.on("error", (err) => {
      console.error(`Failed to spawn copilot: ${err.message}`);
      process.exit(1);
    });

    child.on("close", (code) => {
      resolve({ exitCode: code, output });
    });
  });
}

(async () => {
  console.log(
    `Starting Ralph — Prompt: ${promptFile} — Max iterations: ${maxIter}`,
  );
  if (skipTo) console.log(`Skip-to: ${skipTo}`);
  if (mcp.length) console.log(`MCP servers: ${mcp.join(", ")}`);

  for (let i = 1; i <= maxIter; i++) {
    console.log(
      `\n${"=".repeat(63)}\n  Ralph Iteration ${i} of ${maxIter}\n${"=".repeat(63)}`,
    );

    const args = [...mcp.flatMap((s) => ["--mcp", s]), "-p", prompt, "--yolo"];
    const { output } = await runCopilot(args);

    // Check for completion signal
    const signal = parseCompletionSignal(output);
    if (signal === "Succeeded") {
      console.log(`\n${"=".repeat(63)}`);
      console.log(`  Ralph completed successfully!`);
      console.log(`  Completed at iteration ${i} of ${maxIter}`);
      console.log(`${"=".repeat(63)}`);
      process.exit(0);
    }
    if (signal === "Failed") {
      console.log(`\n${"=".repeat(63)}`);
      console.log(`  Ralph reported failure.`);
      console.log(`  Failed at iteration ${i} of ${maxIter}`);
      console.log(`${"=".repeat(63)}`);
      process.exit(1);
    }

    console.log(
      `Iteration ${i} complete — no completion signal found. Continuing...`,
    );
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(
    `\nRalph reached max iterations (${maxIter}) without completing.`,
  );
  process.exit(1);
})();
