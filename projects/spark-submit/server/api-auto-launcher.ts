/**
 * API Auto-Launcher
 *
 * Used by SQL mode in `index.ts` to make `nx run spark-submit:run -- --sql-file=...`
 * self-contained. If the Express API server (api/src/server.ts) is already up on
 * the target port, we reuse it; otherwise we spawn it as a child process, wait
 * for `/api/health`, and tear it down on exit.
 *
 * The full SQL/Livy route surface lives only in the Express API server, not in
 * the lightweight EmbeddedServer that serves job execution to the CLI/UI.
 */

import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

import { SystemLogger } from "../logging/logger.js";

export interface ApiAutoLauncherOptions {
  apiUrl: string;
  projectRoot: string;
  readyTimeoutMs?: number;
  pollIntervalMs?: number;
}

export class ApiAutoLauncher {
  private child: ChildProcess | null = null;
  private spawned = false;
  private readonly apiUrl: string;
  private readonly projectRoot: string;
  private readonly readyTimeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(opts: ApiAutoLauncherOptions) {
    this.apiUrl = opts.apiUrl.replace(/\/$/, "");
    this.projectRoot = opts.projectRoot;
    this.readyTimeoutMs = opts.readyTimeoutMs ?? 30_000;
    this.pollIntervalMs = opts.pollIntervalMs ?? 250;
  }

  async ensureReady(): Promise<void> {
    if (await this.isHealthy()) {
      SystemLogger.debug(`API server already up at ${this.apiUrl}`);
      return;
    }

    SystemLogger.info(`Starting API server in background at ${this.apiUrl}...`);
    const apiDir = resolve(this.projectRoot, "api");
    const port = this.parsePort();

    this.child = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: apiDir,
      env: {
        ...process.env,
        PORT: String(port),
        PROJECT_ROOT: this.projectRoot,
      },
      stdio: ["ignore", "ignore", "pipe"],
      detached: false,
    });
    this.spawned = true;

    this.child.on("exit", (code) => {
      if (this.spawned && code !== null && code !== 0) {
        SystemLogger.warn(`API server exited unexpectedly with code ${code}`);
      }
    });

    if (this.child.stderr) {
      this.child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim();
        if (text) SystemLogger.debug(`[api] ${text}`);
      });
    }

    await this.waitForHealthy();
    SystemLogger.success(`API server ready at ${this.apiUrl}`);
  }

  async stop(): Promise<void> {
    if (!this.spawned || !this.child) return;
    SystemLogger.debug("Stopping background API server...");
    this.child.kill("SIGTERM");
    await new Promise<void>((res) => {
      const timeout = setTimeout(() => {
        if (this.child && !this.child.killed) this.child.kill("SIGKILL");
        res();
      }, 5_000);
      this.child!.on("exit", () => {
        clearTimeout(timeout);
        res();
      });
    });
    this.child = null;
    this.spawned = false;
  }

  private async isHealthy(): Promise<boolean> {
    try {
      const res = await fetch(`${this.apiUrl}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async waitForHealthy(): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < this.readyTimeoutMs) {
      if (await this.isHealthy()) return;
      await new Promise((res) => setTimeout(res, this.pollIntervalMs));
    }
    throw new Error(
      `API server did not become healthy at ${this.apiUrl} within ${this.readyTimeoutMs}ms`,
    );
  }

  private parsePort(): number {
    try {
      return new URL(this.apiUrl).port
        ? parseInt(new URL(this.apiUrl).port, 10)
        : 4000;
    } catch {
      return 4000;
    }
  }
}
