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
  private cleanupInstalled = false;
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

  /**
   * Install best-effort cleanup hooks so a spawned API child never leaks if
   * the parent process dies via `process.exit(N)`, Ctrl-C, or SIGTERM.
   * Idempotent — only installed once per launcher instance.
   */
  private installCleanupHooks(): void {
    if (this.cleanupInstalled) return;
    this.cleanupInstalled = true;

    const synchronousKill = () => {
      if (!this.child || this.child.killed) return;
      const pid = this.child.pid;
      if (pid === undefined) return;
      try {
        // Kill the whole process group (we spawned with detached:true so the
        // child is the group leader, PGID === PID, npx/tsx grandchildren too).
        process.kill(-pid, "SIGKILL");
      } catch {
        // Fallback: try direct kill in case the group is already gone.
        try {
          this.child.kill("SIGKILL");
        } catch {
          // best-effort
        }
      }
    };

    process.on("exit", synchronousKill);
    process.on("SIGINT", () => {
      synchronousKill();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      synchronousKill();
      process.exit(143);
    });
  }

  async ensureReady(): Promise<void> {
    if (await this.isHealthy()) {
      SystemLogger.debug(`API server already up at ${this.apiUrl}`);
      return;
    }

    // Disambiguate: is port already bound by a different server (e.g. the
    // lightweight EmbeddedServer that handles job execution)? If so, spawning
    // would just fail with EADDRINUSE — surface a clear error instead.
    if (await this.portBoundByOther()) {
      throw new Error(
        `Port ${this.parsePort()} is bound by a different process (likely a running ` +
          `spark-submit job using EmbeddedServer). Stop that process or pass ` +
          `--api-url=http://localhost:<other-port> to point SQL at a different API server.`,
      );
    }

    SystemLogger.info(`Starting API server in background at ${this.apiUrl}...`);
    const apiDir = resolve(this.projectRoot, "api");
    const port = this.parsePort();

    this.installCleanupHooks();

    this.child = spawn("npx", ["tsx", "src/server.ts"], {
      cwd: apiDir,
      env: {
        ...process.env,
        PORT: String(port),
        PROJECT_ROOT: this.projectRoot,
      },
      stdio: ["ignore", "ignore", "pipe"],
      // Detach so the child becomes its own process group leader. This lets us
      // kill the whole tree (npx → tsx → node) via `process.kill(-pid, sig)`,
      // which is necessary because the actual server runs in a grandchild.
      detached: true,
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
    const pid = this.child.pid;
    const killGroup = (sig: NodeJS.Signals) => {
      if (pid === undefined) return;
      try {
        process.kill(-pid, sig);
      } catch {
        try {
          this.child?.kill(sig);
        } catch {
          // best-effort
        }
      }
    };
    killGroup("SIGTERM");
    await new Promise<void>((res) => {
      const timeout = setTimeout(() => {
        killGroup("SIGKILL");
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
      // Probe a route that ONLY the Express API server has — not the lightweight
      // EmbeddedServer used by job mode. Both serve `/api/health` on port 4000,
      // so we need a SQL-specific endpoint to disambiguate.
      const res = await fetch(`${this.apiUrl}/api/sql/session`, {
        signal: AbortSignal.timeout(2_000),
        method: "GET",
      });
      // Any non-404 (including 200, 500, or Livy-down errors) means the API
      // server with SQL routes is up.
      return res.status !== 404;
    } catch {
      return false;
    }
  }

  private async portBoundByOther(): Promise<boolean> {
    try {
      // If `/api/health` answers but `/api/sql/session` 404s, something else
      // (EmbeddedServer) holds the port.
      const res = await fetch(`${this.apiUrl}/api/health`, {
        signal: AbortSignal.timeout(2_000),
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
