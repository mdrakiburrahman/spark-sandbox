import {
  LivyConfig,
  LivySessionResponse,
  LivyStatementResponse,
  LivyQueryResult,
  LivyResultPayload,
  LIVY_DEFAULTS,
  buildBaseUrl,
} from './types';

const INVALID_SESSION_STATES = new Set(['dead', 'shutting_down', 'killed', 'error', 'not_found']);
const RETRYABLE_KEYWORDS = ['pending', 'temporary', 'retry', 'timeout', 'unavailable', 'transient', 'throttling', 'rate limit', 'connection reset', 'service busy', 'not_found'];

function authHeaders(jwt: string): Record<string, string> {
  return {
    Authorization: `Bearer ${jwt}`,
    'Content-Type': 'application/json',
  };
}

function isRetryableError(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return RETRYABLE_KEYWORDS.some((kw) => msg.includes(kw));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Session management

export async function createSession(config: LivyConfig): Promise<string> {
  const url = `${buildBaseUrl(config)}/sessions`;
  const body = { name: 'marquito-livy-session' };

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(config.jwt),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create Livy session (${res.status}): ${text}`);
  }

  const data: LivySessionResponse = await res.json();
  return data.id;
}

export async function getSessionStatus(
  config: LivyConfig,
  sessionId: string
): Promise<LivySessionResponse> {
  const url = `${buildBaseUrl(config)}/sessions/${sessionId}`;
  const res = await fetch(url, { headers: authHeaders(config.jwt) });

  if (!res.ok) {
    if (res.status === 404) {
      return { id: sessionId, state: 'not_found' };
    }
    const text = await res.text();
    throw new Error(`Failed to get session status (${res.status}): ${text}`);
  }

  return res.json();
}

export function getSessionState(session: LivySessionResponse): string {
  return session.livyInfo?.currentState ?? session.state ?? 'unknown';
}

export async function pollSessionUntilIdle(
  config: LivyConfig,
  sessionId: string,
  onProgress?: (state: string) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  const interval = LIVY_DEFAULTS.sessionPollIntervalMs;
  // Fabric may return not_found briefly after session creation; allow a grace period
  let notFoundRetries = 3;

  while (true) {
    if (abortSignal?.aborted) throw new Error('Aborted');

    const session = await getSessionStatus(config, sessionId);
    const state = getSessionState(session);

    onProgress?.(state);

    if (state === 'idle') return;

    if (state === 'not_found') {
      if (notFoundRetries > 0) {
        notFoundRetries--;
        await delay(interval);
        continue;
      }
      throw new Error(`Livy session entered invalid state: ${state}`);
    }

    if (INVALID_SESSION_STATES.has(state)) {
      throw new Error(`Livy session entered invalid state: ${state}`);
    }

    await delay(interval);
  }
}

export async function tryReuseSession(
  config: LivyConfig,
  sessionId: string
): Promise<boolean> {
  try {
    const session = await getSessionStatus(config, sessionId);
    const state = getSessionState(session);

    if (INVALID_SESSION_STATES.has(state)) return false;
    if (state === 'idle') return true;

    // Session is starting/busy — wait for it
    await pollSessionUntilIdle(config, sessionId);
    return true;
  } catch {
    return false;
  }
}

export async function deleteSession(
  config: LivyConfig,
  sessionId: string
): Promise<void> {
  const url = `${buildBaseUrl(config)}/sessions/${sessionId}`;
  await fetch(url, {
    method: 'DELETE',
    headers: authHeaders(config.jwt),
  });
}

// Statement execution

export async function submitStatement(
  config: LivyConfig,
  sessionId: string,
  sql: string
): Promise<number> {
  const url = `${buildBaseUrl(config)}/sessions/${sessionId}/statements`;
  const body = { code: sql, kind: 'sql' };

  const res = await fetch(url, {
    method: 'POST',
    headers: authHeaders(config.jwt),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to submit statement (${res.status}): ${text}`);
  }

  const data: LivyStatementResponse = await res.json();
  return data.id;
}

export async function pollStatementUntilAvailable(
  config: LivyConfig,
  sessionId: string,
  statementId: number,
  abortSignal?: AbortSignal
): Promise<LivyStatementResponse> {
  const interval = LIVY_DEFAULTS.statementPollIntervalMs;
  const url = `${buildBaseUrl(config)}/sessions/${sessionId}/statements/${statementId}`;

  while (true) {
    if (abortSignal?.aborted) throw new Error('Aborted');

    const res = await fetch(url, { headers: authHeaders(config.jwt) });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to get statement status (${res.status}): ${text}`);
    }

    const data: LivyStatementResponse = await res.json();

    if (data.state === 'available') return data;
    if (data.state === 'error' || data.state === 'cancelled') {
      const msg = data.output?.evalue ?? 'Statement execution failed';
      throw new Error(msg);
    }

    await delay(interval);
  }
}

export function parseStatementResult(stmt: LivyStatementResponse): LivyQueryResult {
  if (!stmt.output || stmt.output.status !== 'ok') {
    throw new Error(`Statement error: ${stmt.output?.evalue ?? 'unknown error'}`);
  }

  const payload: LivyResultPayload | undefined = stmt.output.data?.['application/json'];
  if (!payload) {
    return { columns: [], columnTypes: [], rows: [] };
  }

  const columns = payload.schema.fields.map((f) => f.name);
  const columnTypes = payload.schema.fields.map((f) => f.type);
  const rows = payload.data.map((row) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      record[col] = row[idx];
    });
    return record;
  });

  return { columns, columnTypes, rows };
}

export async function executeQuery(
  config: LivyConfig,
  sessionId: string,
  sql: string,
  abortSignal?: AbortSignal
): Promise<LivyQueryResult> {
  const statementId = await submitStatement(config, sessionId, sql);
  const stmt = await pollStatementUntilAvailable(config, sessionId, statementId, abortSignal);
  return parseStatementResult(stmt);
}

// Connect with retry

export async function connectWithRetry(
  config: LivyConfig,
  existingSessionId?: string | null,
  onProgress?: (status: string, sql?: string) => void,
  retries: number = 2,
  retryDelayMs: number = 10_000
): Promise<{ sessionId: string; warning?: string }> {
  let warning: string | undefined;

  // Try reusing existing session
  if (existingSessionId) {
    onProgress?.('Checking existing session...', `GET /sessions/${existingSessionId}`);
    const reused = await tryReuseSession(config, existingSessionId);
    if (reused) {
      onProgress?.('Session reused');
      return { sessionId: existingSessionId };
    }
    warning = `Session ${existingSessionId} not found or terminated. Creating a new session.`;
    onProgress?.(warning);
  }

  // Create new session with retries
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      onProgress?.('Creating new Spark session...', 'POST /sessions');
      const sessionId = await createSession(config);
      onProgress?.('Waiting for session to become idle...', `GET /sessions/${sessionId}`);
      await pollSessionUntilIdle(config, sessionId, onProgress);
      return { sessionId, warning };
    } catch (err) {
      if (attempt < retries && isRetryableError(err)) {
        onProgress?.(`Retrying in ${retryDelayMs / 1000}s (attempt ${attempt + 1} of ${retries})...`);
        await delay(retryDelayMs);
      } else {
        throw err;
      }
    }
  }

  throw new Error('Failed to connect after all retries');
}
