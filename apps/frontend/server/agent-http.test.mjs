import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer, request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { createSecureAgentHandler } from './agent-http.mjs'

const servers = new Set()
afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise(resolve => { server.close(resolve); server.closeAllConnections() })))
  servers.clear()
})
const payload = JSON.stringify({ message: 'Explain the observed evidence', selectedGid: null, dataMode: 'demo' })

async function setup({ service = { status: () => ({ available: true }), chat: vi.fn(async () => ({ answer: 'Observed evidence' })) }, remoteAddress, ...options } = {}) {
  const handler = createSecureAgentHandler(service, { env: {}, ...options })
  const server = createServer((req, res) => {
    if (remoteAddress) Object.defineProperty(req.socket, 'remoteAddress', { value: remoteAddress, configurable: true })
    void handler(req, res, () => { res.writeHead(404); res.end() })
  })
  servers.add(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const host = `127.0.0.1:${server.address().port}`
  function start({ path = '/api/agent/chat', method = 'POST', headers = {}, body = payload, end = true } = {}) {
    let req
    const result = new Promise((resolve, reject) => {
      req = httpRequest({ host: '127.0.0.1', port: server.address().port, path, method, headers: { Host: host, 'Content-Type': 'application/json', ...headers } }, res => {
        const chunks = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
        res.on('error', reject)
      })
      req.on('error', reject)
      if (body !== null) req.write(body)
      if (end) req.end()
      else req.flushHeaders()
    })
    return { req, result }
  }
  return { service, host, start, send: options => start(options).result }
}

describe('shared AI HTTP security boundary', () => {
  it('allows local chat and returns service-managed status without inference', async () => {
    const { send, service } = await setup()
    expect((await send({ path: '/api/agent/status', method: 'GET', body: null })).body).toBe('{"available":true}')
    expect(service.chat).not.toHaveBeenCalled()
    expect((await send()).status).toBe(200)
    expect(service.chat).toHaveBeenCalledTimes(1)
  })

  it('rejects DNS-rebinding hosts even with a matching Origin or forged proxy headers', async () => {
    const { send, service } = await setup()
    for (const headers of [
      { Host: 'attacker.example', Origin: 'http://attacker.example' },
      { Host: 'attacker.example' },
      { Host: '127.0.0.1.attacker.example', Origin: 'http://127.0.0.1.attacker.example' },
      { Host: 'attacker.example', 'X-Forwarded-Host': 'localhost', 'X-Forwarded-For': '127.0.0.1' },
      { Host: '127.1', Origin: 'http://127.1' },
    ]) expect((await send({ headers })).status).toBe(403)
    expect(service.chat).not.toHaveBeenCalled()
  })

  it('requires loopback connections when no public origin is configured', async () => {
    const { send, service } = await setup({ remoteAddress: '203.0.113.10' })
    expect((await send({ headers: { Host: 'localhost', Origin: 'http://localhost', 'X-Forwarded-For': '127.0.0.1' } })).status).toBe(403)
    expect(service.chat).not.toHaveBeenCalled()
  })

  it('rejects cross-site requests including null Origin, same-site sibling domains and fetch metadata', async () => {
    const { send, host, service } = await setup()
    for (const headers of [
      { Origin: 'https://attacker.example' }, { Origin: 'null' },
      { Origin: `http://${host}`, 'Sec-Fetch-Site': 'cross-site' },
      { Origin: `http://${host}`, 'Sec-Fetch-Site': 'same-site' },
    ]) expect((await send({ headers })).status).toBe(403)
    expect(service.chat).not.toHaveBeenCalled()
  })

  it('checks configured host AND origin, rejects remote originless writes, and supports browser status GETs', async () => {
    const { send, service } = await setup({ env: { APP_ORIGIN: 'https://moneygraph.example' }, remoteAddress: '203.0.113.10' })
    expect((await send({ headers: { Host: 'moneygraph.example', Origin: 'https://moneygraph.example' } })).status).toBe(200)
    for (const headers of [
      { Host: 'attacker.example', Origin: 'https://moneygraph.example' },
      { Host: 'moneygraph.example', Origin: 'https://attacker.example' },
      { Host: 'moneygraph.example', 'X-Forwarded-For': '127.0.0.1' },
    ]) expect((await send({ headers })).status).toBe(403)
    expect((await send({ path: '/api/agent/status', method: 'GET', body: null, headers: { Host: 'moneygraph.example', 'Sec-Fetch-Site': 'same-origin' } })).status).toBe(200)
    expect(service.chat).toHaveBeenCalledTimes(1)
  })

  it('supports Render origin and refuses insecure or ambiguous origin configuration', async () => {
    const { send } = await setup({ env: { RENDER_EXTERNAL_URL: 'https://demo.onrender.com' } })
    expect((await send({ headers: { Host: 'demo.onrender.com', Origin: 'https://demo.onrender.com' } })).status).toBe(200)
    for (const origin of ['http://moneygraph.example', 'https://user:pass@moneygraph.example', 'https://moneygraph.example/path', 'https://moneygraph.example?x=1', 'file:///tmp']) {
      expect(() => createSecureAgentHandler({}, { env: { APP_ORIGIN: origin } })).toThrow()
    }
    for (const value of ['0', '501', 'NaN', '-1', '1.5']) expect(() => createSecureAgentHandler({}, { env: { AGENT_REQUESTS_PER_HOUR: value } })).toThrow()
  })

  it('requires exact JSON MIME and rejects compression and malformed JSON before inference', async () => {
    const { send, service } = await setup()
    for (const headers of [
      { 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/json-attacker' },
      { 'Content-Type': 'application/json; charset=iso-8859-1' }, { 'Content-Encoding': 'gzip' },
    ]) expect((await send({ headers })).status).toBe(415)
    expect((await send({ body: '{' })).status).toBe(400)
    expect((await send({ body: Buffer.from([123, 34, 255, 34, 58, 49, 125]) })).status).toBe(400)
    expect(service.chat).not.toHaveBeenCalled()
    expect((await send({ headers: { 'Content-Type': 'application/json; charset=utf-8' } })).status).toBe(200)
  })

  it('bounds Content-Length and chunked bodies and closes rejected uploads', async () => {
    const { send, start, service } = await setup()
    const declared = await send({ headers: { 'Content-Length': '32769' }, body: null })
    expect(declared.status).toBe(413)
    expect(declared.headers.connection).toBe('close')
    const chunked = start({ body: Buffer.alloc(32769, 32), end: false })
    expect((await chunked.result).status).toBe(413)
    expect(service.chat).not.toHaveBeenCalled()
    expect((await send()).status).toBe(200)
  })

  it('times out unfinished uploads and releases concurrency slots', async () => {
    const { start, send, service } = await setup({ bodyTimeoutMs: 100 })
    const first = start({ body: '{', end: false })
    const second = start({ body: '{', end: false })
    await delay(20)
    expect((await send()).status).toBe(429)
    expect((await first.result).status).toBe(408)
    expect((await second.result).status).toBe(408)
    expect(service.chat).not.toHaveBeenCalled()
    expect((await send()).status).toBe(200)
  })

  it('bounds concurrent calls, propagates cancellation, and releases timed-out calls', async () => {
    const signals = []
    const service = { status: () => ({}), chat: vi.fn((_payload, signal) => { signals.push(signal); return new Promise(() => {}) }) }
    const { start, send } = await setup({ service, requestTimeoutMs: 150 })
    const first = start(); const second = start()
    await vi.waitFor(() => expect(service.chat).toHaveBeenCalledTimes(2), { interval: 5 })
    expect((await send()).status).toBe(429)
    expect((await first.result).status).toBe(504)
    expect((await second.result).status).toBe(504)
    expect(signals.every(signal => signal.aborted)).toBe(true)
    service.chat.mockResolvedValue({ answer: 'Recovered' })
    expect((await send()).status).toBe(200)
  })

  it('aborts provider work on client disconnect', async () => {
    let signal
    const service = { status: () => ({}), chat: vi.fn((_payload, value) => { signal = value; return new Promise(() => {}) }) }
    const { start, send } = await setup({ service })
    const pending = start()
    const disconnected = pending.result.catch(() => null)
    await vi.waitFor(() => expect(service.chat).toHaveBeenCalledTimes(1), { interval: 5 })
    pending.req.destroy()
    await disconnected
    await vi.waitFor(() => expect(signal.aborted).toBe(true), { interval: 5 })
    service.chat.mockResolvedValue({ answer: 'Recovered' })
    expect((await send()).status).toBe(200)
  })

  it('enforces a shared hourly budget before inference, resets, and leaves status available', async () => {
    let now = 0
    const { send, service } = await setup({ env: { AGENT_REQUESTS_PER_HOUR: '1' }, now: () => now })
    expect((await send({ body: '{' })).status).toBe(400)
    expect((await send()).status).toBe(200)
    const limited = await send()
    expect(limited.status).toBe(429)
    expect(limited.headers['retry-after']).toBe('3600')
    expect(service.chat).toHaveBeenCalledTimes(1)
    expect((await send({ path: '/api/agent/status', method: 'GET', body: null })).status).toBe(200)
    now = 3600000
    expect((await send()).status).toBe(200)
    expect(service.chat).toHaveBeenCalledTimes(2)
  })

  it('redacts unexpected provider messages, maps auth failures, and exposes only intentional errors', async () => {
    const service = { status: () => ({}), chat: vi.fn() }
    const { send } = await setup({ service })
    for (const status of [401, 403, 429, 500]) {
      service.chat.mockRejectedValueOnce(Object.assign(new Error('PRIVATE_PROVIDER_DETAILS_TEST_ONLY'), { status }))
      const result = await send()
      expect(result.status).toBe([401, 403].includes(status) ? 503 : 502)
      expect(result.body).not.toContain('PRIVATE_PROVIDER_DETAILS_TEST_ONLY')
    }
    service.chat.mockRejectedValueOnce(Object.assign(new Error('Invalid private input details'), { name: 'ZodError' }))
    const invalid = await send()
    expect(invalid.status).toBe(400)
    expect(invalid.body).not.toContain('private')
    service.chat.mockRejectedValueOnce(Object.assign(new Error('Источник данных недоступен.'), { name: 'AgentError', status: 503 }))
    expect((await send()).body).toContain('Источник данных недоступен.')
  })

  it('does not spend inference budget on trusted schema or data-mode validation failures', async () => {
    const service = { status: () => ({}), chat: vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('Invalid payload'), { name: 'AgentError', status: 400 }))
      .mockRejectedValueOnce(Object.assign(new Error('Mode mismatch'), { name: 'AgentError', status: 409 }))
      .mockResolvedValue({ answer: 'Observed facts' }) }
    const { send } = await setup({ service, env: { AGENT_REQUESTS_PER_HOUR: '1' } })
    expect((await send()).status).toBe(400)
    expect((await send()).status).toBe(409)
    expect((await send()).status).toBe(200)
    expect((await send()).status).toBe(429)
    expect(service.chat).toHaveBeenCalledTimes(3)
  })
})
