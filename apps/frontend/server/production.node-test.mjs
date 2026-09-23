import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request as httpRequest } from 'node:http'
import { createProductionServer } from './production.mjs'
import { createAgentHandler } from './agent.mjs'

const password = 'test-password-not-for-deployment'
const auth = 'Basic ' + Buffer.from(`judge:${password}`).toString('base64')
const fixture = JSON.parse(await readFile(new URL('../public/demo.json', import.meta.url), 'utf8'))
const payload = { message: 'Explain this synthetic node', selectedGid: fixture.nodes[0].gid, dataMode: 'demo', review: false, history: [] }

async function setup(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'moneygraph-server-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const distDir = join(root, 'dist')
  await mkdir(join(distDir, 'assets'), { recursive: true })
  await Promise.all([
    writeFile(join(distDir, 'index.html'), '<!doctype html><title>MoneyGraph</title>'),
    writeFile(join(distDir, 'runtime-config.json'), JSON.stringify({ dataMode: 'demo' })),
    writeFile(join(distDir, 'demo.json'), JSON.stringify(fixture)),
    writeFile(join(distDir, 'assets', 'app-test.js'), 'export const ready = true'),
    writeFile(join(root, 'secret.txt'), 'DO NOT SERVE'),
  ])
  await symlink(join(root, 'secret.txt'), join(distDir, 'outside.txt'))
  const server = await createProductionServer({ distDir, ...options, env: { APP_ACCESS_PASSWORD: password, ...options.env } })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}`
  const get = (path, init = {}) => fetch(base + path, { ...init, headers: { Authorization: auth, ...init.headers } })
  // Node fetch can normalize Host; raw requests exercise Host validation itself.
  const rawGet = (path, init = {}) => new Promise((resolve, reject) => {
    const req = httpRequest(base + path, { method: init.method || 'GET', headers: { Authorization: auth, ...init.headers } }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })))
      res.on('error', reject)
    })
    req.on('error', reject); req.end(init.body)
  })
  return { base, get, rawGet, root, distDir }
}

test('health is public; dashboard, dataset and chat require correct credentials', async t => {
  const { base, get } = await setup(t)
  assert.equal((await fetch(base + '/healthz')).status, 200)
  for (const path of ['/', '/demo.json', '/assets/app-test.js', '/api/agent/status']) {
    const anonymous = await fetch(base + path)
    assert.equal(anonymous.status, 401, path)
    assert.match(anonymous.headers.get('www-authenticate'), /Basic/)
    assert.equal((await get(path, { headers: { Authorization: 'Basic invalid' } })).status, 401)
    assert.equal((await get(path)).status, 200)
  }
})

test('serves HTML, JSON, JS and SPA routes with cache and compression headers', async t => {
  const { get } = await setup(t)
  const page = await get('/')
  assert.match(page.headers.get('content-type'), /text\/html/)
  assert.equal(page.headers.get('cache-control'), 'no-store')
  assert.match(page.headers.get('content-security-policy'), /worker-src 'self' blob:/)
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff')
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.match(await page.text(), /MoneyGraph/)
  const script = await get('/assets/app-test.js')
  assert.match(script.headers.get('content-type'), /javascript/)
  assert.match(script.headers.get('cache-control'), /private.*immutable/)
  const data = await get('/demo.json', { headers: { 'Accept-Encoding': 'gzip' } })
  assert.equal(data.headers.get('content-encoding'), 'gzip')
  assert.deepEqual(await data.json(), fixture)
  const head = await get('/demo.json', { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  assert.equal((await get('/investigate/client', { headers: { Accept: 'text/html' } })).status, 200)
  for (const path of ['/missing.js', '/missing.json', '/api/no-such-route']) assert.equal((await get(path, { headers: { Accept: 'text/html' } })).status, 404)
  assert.equal((await get('/', { method: 'POST' })).status, 405)
})

test('denies dotfiles, traversal, malformed encoding and symlinks outside dist', async t => {
  const { base, get } = await setup(t)
  for (const path of ['/.env', '/%2eenv', '/..%2fsecret.txt', '/assets%5c..%5csecret.txt', '/%00', '/%zz']) {
    assert.equal((await get(path)).status, 400, path)
  }
  // Raw HTTP preserves ../, which fetch normally normalizes before transmission.
  const status = await new Promise((resolve, reject) => {
    const req = httpRequest(base + '/', { path: '/../secret.txt', headers: { Authorization: auth } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject); req.end()
  })
  assert.equal(status, 400)
  assert.equal((await get('/outside.txt')).status, 404)
})

test('no-key deployment remains healthy and returns an explicit chat unavailable response', async t => {
  const { get } = await setup(t)
  const status = await (await get('/api/agent/status')).json()
  assert.equal(status.available, false)
  assert.equal(status.reviewerAvailable, false)
  assert.equal(status.dataMode, 'demo')
  const response = await get('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /OPENAI_API_KEY/)
})

test('chat reads the deployed snapshot and honors an explicit proxy origin', async t => {
  const calls = []
  const { rawGet } = await setup(t, {
    env: { APP_ORIGIN: 'https://moneygraph.example' },
    agentFactory: options => createAgentHandler({ ...options, openai: { responses: { create: async input => { calls.push(input); return { output: [], output_text: 'Synthetic evidence only', status: 'completed' } } } } }),
  })
  const send = origin => rawGet('/api/%61gent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'moneygraph.example', Origin: origin }, body: JSON.stringify(payload) })
  assert.equal((await send('https://malicious.example')).status, 403)
  assert.equal(calls.length, 0)
  const result = await send('https://moneygraph.example')
  assert.equal(result.status, 200)
  assert.equal((await result.json()).sources[0].gid, payload.selectedGid)
  assert.equal(calls.length, 1)
  assert.match(calls[0].input.find(item => item.type === 'function_call_output').output, new RegExp(payload.selectedGid))
  assert.equal(result.headers.get('strict-transport-security'), 'max-age=31536000')
})

test('chat budget blocks provider calls, resets after an hour, and leaves graph available', async t => {
  let instant = 0, calls = 0
  const { get } = await setup(t, {
    env: { AGENT_REQUESTS_PER_HOUR: '1' }, now: () => instant,
    agentFactory: options => createAgentHandler({ ...options, openai: { responses: { create: async () => { calls++; return { output: [], output_text: 'Synthetic evidence only', status: 'completed' } } } } }),
  })
  const send = headers => get('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) })
  // Rejected cross-site and MIME attempts do not exhaust the inference budget.
  assert.equal((await send({ Origin: 'https://attacker.example' })).status, 403)
  assert.equal((await send({ 'Content-Type': 'text/plain' })).status, 415)
  assert.equal((await get('/api/agent/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, facts: { forged: true } }) })).status, 400)
  assert.equal(calls, 0)
  assert.equal((await send()).status, 200)
  const limited = await send()
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '3600')
  assert.equal(calls, 1)
  assert.equal((await get('/demo.json')).status, 200)
  instant = 3600000
  assert.equal((await send()).status, 200)
  assert.equal(calls, 2)
})

test('bounds failed sign-in attempts by socket peer and ignores spoofed forwarding headers', async t => {
  let instant = 0
  const { base, get } = await setup(t, { now: () => instant })
  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await get('/', { headers: { Authorization: 'Basic invalid', 'X-Forwarded-For': `203.0.113.${attempt}`, 'X-Real-IP': `203.0.113.${attempt}` } })
    assert.equal(response.status, 401)
  }
  const blocked = await get('/', { headers: { Authorization: 'Basic invalid', 'X-Forwarded-For': '192.0.2.200' } })
  assert.equal(blocked.status, 429)
  assert.equal(blocked.headers.get('retry-after'), '60')
  assert.equal((await get('/demo.json')).status, 429)
  assert.equal((await fetch(base + '/healthz')).status, 200)
  instant = 60000
  assert.equal((await get('/demo.json')).status, 200)
  assert.equal((await get('/', { headers: { Authorization: 'Basic invalid' } })).status, 401)
})

test('public local mode does not assert HTTPS and rejects rebound chat hosts', async t => {
  const { get, rawGet } = await setup(t, { env: { APP_ACCESS_MODE: 'public' } })
  assert.equal((await get('/')).headers.get('strict-transport-security'), null)
  const rebound = await rawGet('/api/agent/chat', { method: 'POST', headers: { Host: 'attacker.example', Origin: 'http://attacker.example', 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  assert.equal(rebound.status, 403)
})

test('public access requires explicit opt-in; startup rejects unsafe or mismatched configuration', async t => {
  const { base, distDir } = await setup(t, { env: { APP_ACCESS_MODE: 'public', APP_ACCESS_PASSWORD: '' } })
  assert.equal((await fetch(base + '/')).status, 200)
  await assert.rejects(createProductionServer({ distDir, env: {} }), /APP_ACCESS_PASSWORD/)
  await assert.rejects(createProductionServer({ distDir, env: { APP_ACCESS_PASSWORD: password, AGENT_REQUESTS_PER_HOUR: 'NaN' } }), /AGENT_REQUESTS_PER_HOUR/)
  await assert.rejects(createProductionServer({ distDir, env: { APP_ACCESS_MODE: 'public', VITE_DATA_MODE: 'project' } }), /differs from/)
  await writeFile(join(distDir, 'demo.json'), '{}')
  await assert.rejects(createProductionServer({ distDir, env: { APP_ACCESS_MODE: 'public' } }))
})
