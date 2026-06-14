/**
 * Buffered, CRLF-tolerant Server-Sent Events parser built on top of `fetch`.
 *
 * Why not `EventSource`?
 *   - `EventSource` auto-reconnects and fires `onerror` whenever the server
 *     closes the stream, even on the clean end-of-response — leading to a
 *     race with the final `onmessage` (the "Refresh schema button rapidly
 *     exits" bug). With `fetch` + AbortController we observe the real
 *     end-of-stream cleanly.
 *   - Browsers cap `EventSource` to 6 concurrent connections per origin;
 *     `fetch` is not subject to that cap, so rapid refreshes can never
 *     "rapid exit" because an old slot hadn't been released.
 *   - We get explicit cancellation via `AbortController.abort()`.
 *
 * Parser semantics (matches the SSE spec we care about):
 *   - Frame separator: `\n\n` or `\r\n\r\n` (both supported).
 *   - Each frame may contain multiple `data:` lines; their values are
 *     joined with `\n` per spec.
 *   - Lines starting with `:` are SSE comments (skipped).
 *   - Empty / unrecognised fields are skipped.
 *   - Buffered across chunk boundaries — a frame split across two reads
 *     is reassembled before parsing.
 */

export interface SseEvent<T = unknown> {
    /** The `event:` field if the server set one, otherwise undefined. */
    event?: string
    /** The parsed JSON payload from the joined `data:` field(s). */
    data: T
}

export interface StreamSseOptions<T> {
    /** Optional AbortSignal — abort the underlying fetch. */
    signal?: AbortSignal
    /** Called once per parsed SSE frame, in order. */
    onEvent: (event: SseEvent<T>) => void
    /** Override fetch (used by tests). */
    fetchImpl?: typeof fetch
}

/**
 * Open an SSE stream and dispatch every frame to `onEvent`.
 *
 * Resolves when the stream reaches end-of-response. Rejects on fetch
 * failure, non-OK status, or non-AbortError thrown during read.
 *
 * Abort (via `options.signal`) resolves with `aborted: true` so callers
 * can distinguish "user superseded this request" from a real failure.
 */
export async function streamSse<T = unknown>(url: string, options: StreamSseOptions<T>): Promise<{ aborted: boolean }> {
    const fetchImpl = options.fetchImpl ?? fetch
    let response: Response
    try {
        response = await fetchImpl(url, {
            method: 'GET',
            headers: { Accept: 'text/event-stream' },
            cache: 'no-store',
            signal: options.signal,
        })
    } catch (err) {
        if (isAbortError(err)) return { aborted: true }
        throw err
    }

    if (!response.ok) {
        throw new Error(`SSE request failed: ${response.status} ${response.statusText}`)
    }

    if (!response.body) {
        throw new Error('SSE response has no body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    try {
        while (true) {
            let chunk: ReadableStreamReadResult<Uint8Array>
            try {
                chunk = await reader.read()
            } catch (err) {
                if (isAbortError(err)) return { aborted: true }
                throw err
            }
            if (chunk.done) break
            buffer += decoder.decode(chunk.value, { stream: true })

            // Drain every complete frame in the buffer.
            for (;;) {
                const sep = findFrameSeparator(buffer)
                if (sep === -1) break
                const frame = buffer.slice(0, sep.start)
                buffer = buffer.slice(sep.end)
                const parsed = parseFrame<T>(frame)
                if (parsed) options.onEvent(parsed)
            }
        }

        // Flush any trailing bytes from the decoder; usually empty for SSE.
        buffer += decoder.decode()

        // Per SSE spec, a final frame without a trailing blank line is
        // discarded. We follow that — partial trailing data is ignored.
        return { aborted: options.signal?.aborted === true }
    } finally {
        try {
            await reader.cancel()
        } catch {
            // Reader may already be closed; ignore.
        }
    }
}

interface FrameSeparator {
    /** Index of the first separator character. */
    start: number
    /** Index just past the separator (where the next frame starts). */
    end: number
}

/**
 * Find the earliest occurrence of `\n\n` or `\r\n\r\n` in `buffer`.
 * Returns -1 if no full separator is present yet.
 */
function findFrameSeparator(buffer: string): FrameSeparator | -1 {
    const lf = buffer.indexOf('\n\n')
    const crlf = buffer.indexOf('\r\n\r\n')
    if (lf === -1 && crlf === -1) return -1
    if (lf === -1) return { start: crlf, end: crlf + 4 }
    if (crlf === -1) return { start: lf, end: lf + 2 }
    return lf < crlf ? { start: lf, end: lf + 2 } : { start: crlf, end: crlf + 4 }
}

/**
 * Parse a single SSE frame (without the trailing blank line) into an
 * `SseEvent<T>`. Returns null if the frame has no `data:` field or if
 * the data isn't valid JSON (we treat parse failure as "not for us"
 * rather than throwing — defensive against keep-alive comments).
 */
function parseFrame<T>(frame: string): SseEvent<T> | null {
    const lines = frame.split(/\r?\n/)
    const dataLines: string[] = []
    let eventName: string | undefined

    for (const line of lines) {
        if (line.length === 0) continue
        if (line.startsWith(':')) continue

        const colon = line.indexOf(':')
        const field = colon === -1 ? line : line.slice(0, colon)
        let value = colon === -1 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)

        if (field === 'data') {
            dataLines.push(value)
        } else if (field === 'event') {
            eventName = value
        }
        // id / retry / unknown — ignored
    }

    if (dataLines.length === 0) return null

    const raw = dataLines.join('\n')
    try {
        return { event: eventName, data: JSON.parse(raw) as T }
    } catch {
        return null
    }
}

function isAbortError(err: unknown): boolean {
    return err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))
}
