/**
 * Unit tests for the streamSse SSE parser.
 *
 * We mock `fetch` via the `fetchImpl` option so we never hit the network and
 * can fully control chunk boundaries, separators, and abort timing.
 */

import { streamSse } from '../streamSse'

/** Build a Response whose body emits `chunks` one at a time via an underlying ReadableStream. */
function responseFromChunks(chunks: string[], init?: { status?: number; statusText?: string }): Response {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const c of chunks) controller.enqueue(encoder.encode(c))
            controller.close()
        },
    })
    return new Response(stream, {
        status: init?.status ?? 200,
        statusText: init?.statusText ?? 'OK',
        headers: { 'Content-Type': 'text/event-stream' },
    })
}

describe('streamSse', () => {
    it('parses a single complete frame', async () => {
        const events: { data: unknown }[] = []
        const fetchImpl = jest.fn(async () => responseFromChunks(['data: {"type":"complete","data":{"x":1}}\n\n']))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events).toHaveLength(1)
        expect(events[0].data).toEqual({ type: 'complete', data: { x: 1 } })
    })

    it('handles CRLF separators', async () => {
        const events: { data: unknown }[] = []
        const fetchImpl = jest.fn(async () => responseFromChunks(['data: {"type":"progress","data":{"message":"ok"}}\r\n\r\n']))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events[0].data).toEqual({ type: 'progress', data: { message: 'ok' } })
    })

    it('joins multiple data: lines with a newline before JSON parsing', async () => {
        const events: { data: unknown }[] = []
        const body = 'data: {"k":\ndata: 42}\n\n'
        const fetchImpl = jest.fn(async () => responseFromChunks([body]))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events[0].data).toEqual({ k: 42 })
    })

    it('skips comment lines starting with ":"', async () => {
        const events: { data: unknown }[] = []
        const body = ': keep-alive\n\ndata: {"v":1}\n\n: another comment\n\ndata: {"v":2}\n\n'
        const fetchImpl = jest.fn(async () => responseFromChunks([body]))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events.map((e) => e.data)).toEqual([{ v: 1 }, { v: 2 }])
    })

    it('reassembles a frame split across two chunks', async () => {
        const events: { data: unknown }[] = []
        const fetchImpl = jest.fn(async () => responseFromChunks(['data: {"type":"complete","data":{"x":', '"hello"}}\n', '\n']))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events).toHaveLength(1)
        expect(events[0].data).toEqual({ type: 'complete', data: { x: 'hello' } })
    })

    it('dispatches multiple frames received in a single chunk', async () => {
        const events: { data: unknown }[] = []
        const fetchImpl = jest.fn(async () => responseFromChunks(['data: {"i":1}\n\ndata: {"i":2}\n\ndata: {"i":3}\n\n']))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events.map((e) => e.data)).toEqual([{ i: 1 }, { i: 2 }, { i: 3 }])
    })

    it('captures the SSE event: field if the server sets one', async () => {
        const events: { event?: string; data: unknown }[] = []
        const fetchImpl = jest.fn(async () => responseFromChunks(['event: complete\ndata: {"x":1}\n\n']))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events[0].event).toBe('complete')
        expect(events[0].data).toEqual({ x: 1 })
    })

    it('throws on non-OK HTTP status', async () => {
        const fetchImpl = jest.fn(async () => responseFromChunks(['no body'], { status: 500, statusText: 'Internal Server Error' }))

        await expect(
            streamSse('http://test/', {
                onEvent: () => {},
                fetchImpl: fetchImpl as unknown as typeof fetch,
            })
        ).rejects.toThrow(/500/)
    })

    it('resolves with aborted=true when the signal aborts during fetch', async () => {
        const controller = new AbortController()
        const fetchImpl = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
            return await new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    const err = new Error('aborted')
                    err.name = 'AbortError'
                    reject(err)
                })
            })
        })

        const pending = streamSse('http://test/', {
            signal: controller.signal,
            onEvent: () => {},
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        controller.abort()
        const result = await pending
        expect(result.aborted).toBe(true)
    })

    it('resolves with aborted=true when the signal fires while reading the body', async () => {
        const controller = new AbortController()

        const stream = new ReadableStream<Uint8Array>({
            start(streamController) {
                const encoder = new TextEncoder()
                streamController.enqueue(encoder.encode('data: {"v":1}\n\n'))
                controller.signal.addEventListener('abort', () => {
                    const err = new Error('aborted')
                    err.name = 'AbortError'
                    streamController.error(err)
                })
            },
        })
        const response = new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })

        const fetchImpl = jest.fn(async () => response)

        const events: unknown[] = []
        const pending = streamSse('http://test/', {
            signal: controller.signal,
            onEvent: (e) => {
                events.push(e.data)
                controller.abort()
            },
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        const result = await pending
        expect(events).toEqual([{ v: 1 }])
        expect(result.aborted).toBe(true)
    })

    it('rethrows non-abort fetch errors', async () => {
        const fetchImpl = jest.fn(async () => {
            throw new Error('connection refused')
        })

        await expect(
            streamSse('http://test/', {
                onEvent: () => {},
                fetchImpl: fetchImpl as unknown as typeof fetch,
            })
        ).rejects.toThrow(/connection refused/)
    })

    it('silently skips frames whose data is not valid JSON', async () => {
        const events: unknown[] = []
        const fetchImpl = jest.fn(async () => responseFromChunks(['data: not-json\n\ndata: {"ok":true}\n\n']))

        await streamSse('http://test/', {
            onEvent: (e) => events.push(e.data),
            fetchImpl: fetchImpl as unknown as typeof fetch,
        })

        expect(events).toEqual([{ ok: true }])
    })
})
