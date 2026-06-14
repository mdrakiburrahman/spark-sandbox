/**
 * Embedded API Server
 *
 * A lightweight embedded server that runs alongside the CLI/UI.
 * Implements the IServer interface for lifecycle management.
 */

import * as http from "http";
import type { IServer, JobsConfig } from "../interface/index.js";
import { ConfigLoader } from "./services/config-loader.js";

/**
 * Options for creating the embedded server.
 */
export interface EmbeddedServerOptions {
  /** Port to listen on (default: 4000) */
  port?: number;
  /** Project root directory */
  projectRoot?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Embedded API server implementation.
 * Uses native http module for simplicity - no express dependency.
 */
export class EmbeddedServer implements IServer {
  private server: http.Server | null = null;
  private config: JobsConfig | null = null;
  private readonly port: number;
  private readonly projectRoot: string;
  private readonly debug: boolean;
  private running: boolean = false;

  constructor(options: EmbeddedServerOptions = {}) {
    this.port = options.port || parseInt(process.env.PORT || "4000", 10);
    this.projectRoot = options.projectRoot || process.cwd();
    this.debug = options.debug || false;
  }

  /**
   * Start the server.
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    // Load configuration
    const configLoader = ConfigLoader.getInstance();
    this.config = configLoader.loadJobsConfig(this.projectRoot);

    // Create HTTP server
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Start server
    return new Promise((resolve, reject) => {
      this.server!.listen(this.port, () => {
        this.running = true;
        if (this.debug) {
          console.log(
            `🚀 Embedded server running on http://localhost:${this.port}`,
          );
        }
        resolve();
      });

      this.server!.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          // Port already in use - another server is already running
          if (this.debug) {
            console.log(
              `ℹ️ Port ${this.port} already in use - reusing existing server`,
            );
          }
          this.running = true;
          resolve();
        } else {
          reject(err);
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests.
   */
  private handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): void {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Content-Type", "application/json");

    // Handle preflight
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = req.url || "/";

    if (this.debug) {
      console.log(`${req.method} ${url}`);
    }

    // Route handling
    if (url === "/api/health") {
      this.sendJson(res, 200, {
        success: true,
        data: {
          status: "healthy",
          configLoaded: this.config !== null,
        },
      });
    } else if (url === "/api/config" && req.method === "GET") {
      if (!this.config) {
        this.sendJson(res, 503, {
          success: false,
          error: "Configuration not loaded",
        });
        return;
      }
      this.sendJson(res, 200, { success: true, data: this.config });
    } else if (url === "/api/config/jobs" && req.method === "GET") {
      if (!this.config) {
        this.sendJson(res, 503, {
          success: false,
          error: "Configuration not loaded",
        });
        return;
      }
      const jobs = Object.entries(this.config.jobs).map(([name, job]) => ({
        name,
        ...job,
      }));
      this.sendJson(res, 200, { success: true, data: jobs });
    } else {
      this.sendJson(res, 404, {
        success: false,
        error: `Not found: ${req.method} ${url}`,
      });
    }
  }

  /**
   * Send JSON response.
   */
  private sendJson(
    res: http.ServerResponse,
    status: number,
    data: unknown,
  ): void {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  }

  /**
   * Stop the server gracefully.
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      return;
    }

    // Close server
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        if (this.debug) {
          console.log("🛑 Server stopped");
        }
        resolve();
      });
    });
  }

  /**
   * Get the server URL.
   */
  getUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /**
   * Check if the server is running.
   */
  isRunning(): boolean {
    return this.running;
  }
}
