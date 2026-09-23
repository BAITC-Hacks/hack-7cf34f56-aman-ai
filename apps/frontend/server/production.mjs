import { createServer } from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { createAgentHandler } from './agent.mjs'
import { fixtureSchema, projectDataSchema } from '../src/lib/contracts.ts'

const defaultDist = fileURLToPath(new URL('../dist/', import.meta.url))
const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
const digest = value => createHash('sha256').update(value).digest()
const reply = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(value))
}

export async function createProductionServer({ env = process.env, distDir = defaultDist, agentFactory = createAgentHandler, now = Date.now } = {}) {
  const root = await realpath(distDir)
  const { dataMode } = JSON.parse(await readFile(resolve(root, 'runtime-config.json'), 'utf8'))
  if (!['project', 'demo'].includes(dataMode)) throw new Error('Production deployment supports project or demo data. Build with VITE_DATA_MODE=project.')
  if (env.VITE_DATA_MODE && env.VITE_DATA_MODE !== dataMode) throw new Error('VITE_DATA_MODE differs from the built dashboard. Rebuild before changing data mode.')
  await stat(resolve(root, 'index.html'))
  const dataPath = pathToFileURL(resolve(root, dataMode === 'project' ? 'project-data.json' : 'demo.json'))
  // Fail startup when the baked data is missing or invalid, before passing health checks.
  const schema = dataMode === 'project' ? projectDataSchema : fixtureSchema
  schema.parse(JSON.parse(await readFile(dataPath, 'utf8')))
  const accessMode = env.APP_ACCESS_MODE || 'password'
  if (!['password', 'public'].includes(accessMode)) throw new Error('APP_ACCESS_MODE must be password or public.')
  const user = env.APP_ACCESS_USER || 'judge'
  if (user.includes(':')) throw new Error('APP_ACCESS_USER cannot contain a colon.')
  if (accessMode === 'password' && (!env.APP_ACCESS_PASSWORD || env.APP_ACCESS_PASSWORD.length < 16)) throw new Error('Set APP_ACCESS_PASSWORD to at least 16 characters, or explicitly set APP_ACCESS_MODE=public.')
  const expectedAuth = digest(`${user}:${env.APP_ACCESS_PASSWORD || ''}`)
  const publicOrigin = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL
  const secureOrigin = publicOrigin && new URL(publicOrigin).protocol === 'https:'
  const agent = agentFactory({ env: { ...env, APP_ORIGIN: publicOrigin }, now, dataMode, projectDataPath: pathToFileURL(resolve(root, 'project-data.json')), demoDataPath: pathToFileURL(resolve(root, 'demo.json')) })
  // Socket peers cannot be forged through client-supplied forwarding headers.
  // A reverse proxy can share a bucket; use a trusted edge limiter for larger deployments.
  const authFailures = new Map()
  const authWindow = 60000
  let nextAuthCleanup = now() + authWindow
  function authKey(req, instant) {
    if (instant >= nextAuthCleanup) {
      for (const [key, entry] of authFailures) if (instant - entry.start >= authWindow) authFailures.delete(key)
      nextAuthCleanup = instant + authWindow
    }
    const peer = req.socket.remoteAddress || 'unknown'
    // An overflow bucket avoids attacker-controlled eviction and bounds memory.
    const key = authFailures.has(peer) || authFailures.size < 1023 ? peer : 'overflow'
    const entry = authFailures.get(key)
    if (entry && instant - entry.start >= authWindow) authFailures.delete(key)
    return key
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    if (secureOrigin) res.setHeader('Strict-Transport-Security', 'max-age=31536000')
    // Canvas styles and CSV blob downloads/workers remain supported.
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'")
    try {
      let path
      try { path = decodeURIComponent((req.url || '/').split(/[?#]/)[0]) } catch { reply(res, 400, { error: 'Invalid URL.' }); return }
      if (!path.startsWith('/') || path.includes('\\') || path.includes('\0') || path.split('/').some(part => part.startsWith('.'))) { reply(res, 400, { error: 'Invalid path.' }); return }
      if (path === '/healthz' && ['GET', 'HEAD'].includes(req.method)) { reply(res, 200, { status: 'ok' }); return }
      if (accessMode === 'password') {
        const instant = now()
        const key = authKey(req, instant)
        const failures = authFailures.get(key)
        if (failures?.count >= 10) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil((authWindow - (instant - failures.start)) / 1000))))
          reply(res, 429, { error: 'Too many unsuccessful sign-in attempts. Try again in one minute.' }); return
        }
        const header = req.headers.authorization || ''
        const supplied = /^Basic /i.test(header) ? Buffer.from(header.slice(6), 'base64').toString('utf8') : ''
        if (!timingSafeEqual(expectedAuth, digest(supplied))) {
          authFailures.set(key, { start: failures?.start ?? instant, count: (failures?.count || 0) + 1 })
          res.setHeader('WWW-Authenticate', 'Basic realm="MoneyGraph judges", charset="UTF-8"')
          reply(res, 401, { error: 'Sign in with the demo credentials supplied by the team.' }); return
        }
      }
      if (path.startsWith('/api/agent/')) {
        req.url = path
        // Shared middleware validates origin/body before reserving the AI budget.
        await agent(req, res); return
      }
      if (path === '/api' || path.startsWith('/api/')) { reply(res, 404, { error: 'Route not found.' }); return }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); reply(res, 405, { error: 'Method not allowed.' }); return }
      let file = resolve(root, '.' + path)
      if (path === '/') file = resolve(root, 'index.html')
      try {
        file = await realpath(file)
        if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { reply(res, 404, { error: 'File not found.' }); return }
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error
        if (!extname(path) && req.headers.accept?.includes('text/html')) file = resolve(root, 'index.html')
        else { reply(res, 404, { error: 'File not found.' }); return }
      }
      const type = mimeTypes[extname(file)] || 'application/octet-stream'
      const compress = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(req.headers['accept-encoding'] || '') && /^(text\/|application\/json|image\/svg)/.test(type)
      res.setHeader('Content-Type', type)
      res.setHeader('Cache-Control', dirname(file) === resolve(root, 'assets') ? 'private, max-age=31536000, immutable' : 'no-store')
      res.setHeader('Vary', 'Accept-Encoding')
      if (compress) res.setHeader('Content-Encoding', 'gzip')
      else res.setHeader('Content-Length', (await stat(file)).size)
      res.writeHead(200)
      if (req.method === 'HEAD') { res.end(); return }
      if (compress) await pipeline(createReadStream(file), createGzip(), res)
      else await pipeline(createReadStream(file), res)
    } catch (error) {
      if (res.destroyed) return
      if (res.headersSent) res.destroy()
      else reply(res, 500, { error: 'The application could not complete this request.' })
      // Never log credentials, prompts, financial facts, or file paths.
      console.error('Request failed:', error.code || error.name)
    }
  })
  server.requestTimeout = 100000
  server.headersTimeout = 15000
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const port = Number(process.env.PORT || 3000)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.')
    const server = await createProductionServer()
    server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`MoneyGraph ready on port ${port}`))
    server.on('error', error => { console.error('Server failed:', error.code); process.exitCode = 1 })
    const shutdown = () => {
      server.close(() => process.exit(0))
      setTimeout(() => { server.closeAllConnections(); process.exit(0) }, 10000).unref()
    }
    process.once('SIGTERM', shutdown)
    process.once('SIGINT', shutdown)
  } catch (error) { console.error('Startup failed:', error.message); process.exitCode = 1 }
}
