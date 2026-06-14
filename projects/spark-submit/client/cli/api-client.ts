/**
 * API Client Implementation
 *
 * Client for communicating with the Spark Orchestrator API server.
 * Implements IApiClient interface.
 */

import type {
  IApiClient,
  ApiResponse,
  JobsConfig,
  ExecutionRequest,
  ExecutionSession,
  DagResponse,
  JobLogsResponse,
  SystemStats,
  ApiExecutionResult,
  WaitOptions,
} from "../../interface/index.js";

/**
 * Options for creating the API client.
 */
export interface ApiClientOptions {
  /** Base URL of the API server (default: http://localhost:4000) */
  baseUrl?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Whether to log debug info (default: false) */
  debug?: boolean;
}

/**
 * Client for interacting with the Spark Orchestrator API.
 */
export class ApiClient implements IApiClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly debug: boolean;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl =
      options.baseUrl || process.env.SPARK_API_URL || "http://localhost:4000";
    this.timeout = options.timeout || 30000;
    this.debug = options.debug || false;
  }

  private log(message: string): void {
    if (this.debug) {
      console.log(`[API Client] ${message}`);
    }
  }

  /**
   * Make an HTTP request to the API.
   */
  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    this.log(`${method} ${url}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = (await response.json()) as ApiResponse<T>;
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  // ========================================================================
  // Health & Config
  // ========================================================================

  async checkHealth(): Promise<{ healthy: boolean; configLoaded: boolean }> {
    try {
      const response = await this.request<{
        status: string;
        configLoaded: boolean;
      }>("GET", "/api/health");
      return {
        healthy: response.success && response.data?.status === "healthy",
        configLoaded: response.data?.configLoaded || false,
      };
    } catch {
      return { healthy: false, configLoaded: false };
    }
  }

  async waitForReady(
    maxWaitMs: number = 30000,
    pollIntervalMs: number = 1000,
  ): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWaitMs) {
      const { healthy, configLoaded } = await this.checkHealth();
      if (healthy && configLoaded) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    return false;
  }

  async getConfig(): Promise<JobsConfig | null> {
    const response = await this.request<JobsConfig>("GET", "/api/config");
    return response.success ? response.data || null : null;
  }

  async listJobs(): Promise<Array<{ name: string; [key: string]: unknown }>> {
    const response = await this.request<Array<{ name: string }>>(
      "GET",
      "/api/config/jobs",
    );
    return response.success ? response.data || [] : [];
  }

  async getJobsByCategory(): Promise<Record<string, string[]>> {
    const response = await this.request<Record<string, string[]>>(
      "GET",
      "/api/config/jobs/by-category",
    );
    return response.success ? response.data || {} : {};
  }

  // ========================================================================
  // DAG Operations
  // ========================================================================

  async computeDag(selectedJobs: string[]): Promise<DagResponse | null> {
    const response = await this.request<DagResponse>(
      "POST",
      "/api/dag/compute",
      { selectedJobs },
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to compute DAG");
    }
    return response.data || null;
  }

  async filterJobsByCategory(categories: string[]): Promise<string[]> {
    const response = await this.request<string[]>("POST", "/api/dag/filter", {
      categories,
    });
    return response.success ? response.data || [] : [];
  }

  // ========================================================================
  // Execution Operations
  // ========================================================================

  async submitExecution(request: ExecutionRequest): Promise<ExecutionSession> {
    const response = await this.request<ExecutionSession>(
      "POST",
      "/api/execution",
      request,
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to submit execution");
    }
    if (!response.data) {
      throw new Error("No session returned from server");
    }
    return response.data;
  }

  async getExecutionState(): Promise<{
    session: ExecutionSession | null;
    isExecuting: boolean;
  }> {
    const response = await this.request<{
      session: ExecutionSession | null;
      isExecuting: boolean;
    }>("GET", "/api/execution");
    if (!response.success) {
      throw new Error(response.error || "Failed to get execution state");
    }
    return response.data || { session: null, isExecuting: false };
  }

  async stopExecution(): Promise<void> {
    const response = await this.request<{ message: string }>(
      "DELETE",
      "/api/execution",
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to stop execution");
    }
  }

  async resetExecution(): Promise<void> {
    const response = await this.request<{ message: string }>(
      "POST",
      "/api/execution/reset",
    );
    if (!response.success) {
      throw new Error(response.error || "Failed to reset execution");
    }
  }

  async getJobLogs(jobName: string): Promise<JobLogsResponse | null> {
    const response = await this.request<JobLogsResponse>(
      "GET",
      `/api/execution/logs/${encodeURIComponent(jobName)}`,
    );
    return response.success ? response.data || null : null;
  }

  async waitForCompletion(
    pollIntervalMs: number = 2000,
    onProgress?: (session: ExecutionSession) => void,
  ): Promise<ExecutionSession | null> {
    while (true) {
      const state = await this.getExecutionState();

      if (!state.session) {
        return null;
      }

      if (onProgress) {
        onProgress(state.session);
      }

      if (!state.isExecuting) {
        return state.session;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
  }

  async executeAndWait(
    request: ExecutionRequest,
    options: WaitOptions = {},
  ): Promise<ApiExecutionResult> {
    const { pollIntervalMs = 2000, onProgress, onLog } = options;

    try {
      // Submit execution
      await this.submitExecution(request);

      // Poll until complete
      let lastJobStates: Record<string, { output: string; error: string }> = {};

      const session = await this.waitForCompletion(
        pollIntervalMs,
        async (session) => {
          if (onProgress) {
            onProgress(session);
          }

          // Stream logs for running jobs
          if (onLog) {
            for (const jobName of session.effectiveDag) {
              const state = session.jobStates[jobName];
              if (
                state.status === "running" ||
                state.status === "success" ||
                state.status === "failed"
              ) {
                const logs = await this.getJobLogs(jobName);
                if (logs) {
                  const lastState = lastJobStates[jobName] || {
                    output: "",
                    error: "",
                  };

                  // Check for new output
                  if (logs.output.length > lastState.output.length) {
                    const newOutput = logs.output.slice(
                      lastState.output.length,
                    );
                    for (const line of newOutput.split("\n").filter((l) => l)) {
                      onLog(jobName, line, false);
                    }
                  }

                  // Check for new error output
                  if (logs.error.length > lastState.error.length) {
                    const newError = logs.error.slice(lastState.error.length);
                    for (const line of newError.split("\n").filter((l) => l)) {
                      onLog(jobName, line, true);
                    }
                  }

                  lastJobStates[jobName] = {
                    output: logs.output,
                    error: logs.error,
                  };
                }
              }
            }
          }
        },
      );

      if (!session) {
        return { success: false, error: "No session returned" };
      }

      return {
        success: session.status === "completed",
        session,
        error: session.error,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Execution failed",
      };
    }
  }

  // ========================================================================
  // System Stats
  // ========================================================================

  async getSystemStats(): Promise<SystemStats | null> {
    const response = await this.request<SystemStats>(
      "GET",
      "/api/system-stats",
    );
    return response.success ? response.data || null : null;
  }
}

// Export for backward compatibility
export { ApiClient as SparkOrchestratorApiClient };
