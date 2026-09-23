const BODY_LIMIT = 32 * 1024
const HOUR = 60 * 60 * 1000

class RequestError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

const isLoopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)
const localHost = host => /^(localhost|127\.0\.0\.1|\[::1\])(?::([1-9]\d{0,4}))?$/.test(host) && Number(host.match(/:(\d+)$/)?.[1] || 1) <= 65535

function configuredOrigin(env) {
  const value = env.APP_ORIGIN || env.RENDER_EXTERNAL_URL
  if (!value) return null
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_ORIGIN must be a complete HTTP(S) origin without credentials, path, query or fragment.')
  if (url.protocol !== 'https:' && !localHost(url.host)) throw new Error('APP_ORIGIN must use HTTPS outside localhost.')
  return url
}

function trustedRequest(req, origin) {
  const host = req.headers.host
  if (typeof host !== 'string' || /[\s/@\\?#,]/.test(host)) return false
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false
  if (origin) {
    try { if (new URL(`${origin.protocol}//${host}`).host !== origin.host) return false } catch { return false }
    if (req.headers.origin && req.headers.origin !== origin.origin) return false
    // Browsers omit Origin on same-origin status GETs, but send it for POSTs.
    if (req.method === 'POST' && !req.headers.origin && !isLoopback(req.socket.remoteAddress)) return false
    return true
  }
  if (!isLoopback(req.socket.remoteAddress) || !localHost(host.toLowerCase())) return false
  return !req.headers.origin || [`http://${host}`, `https://${host}`].includes(req.headers.origin)
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function readBody(req, signal) {
  return new Promise((resolve, reject) => {
    let bytes = 0
    const chunks = []
    const cleanup = () => {
      req.off('data', data); req.off('end', end); req.off('error', fail); req.off('aborted', disconnected)
      signal.removeEventListener('abort', abort)
    }
    const fail = error => { cleanup(); req.pause(); reject(error) }
    const abort = () => fail(signal.reason)
    const disconnected = () => fail(new RequestError('Соединение закрыто.', 400))
    const data = chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += buffer.length
      if (bytes > BODY_LIMIT) { fail(new RequestError('Запрос слишком большой.', 413)); return }
      chunks.push(buffer)
    }
    const end = () => {
      cleanup()
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))) }
      catch { reject(new RequestError('Ожидается корректный JSON в UTF-8.', 400)) }
    }
    req.on('data', data); req.once('end', end); req.once('error', fail); req.once('aborted', disconnected)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function publicError(error, signal) {
  if (signal?.aborted) return signal.reason instanceof RequestError ? signal.reason : new RequestError('Запрос остановлен.', 504)
  if (error instanceof RequestError) return error
  if (error?.name === 'ZodError') return new RequestError('Проверьте вопрос и параметры запроса.', 400)
  if (error?.name === 'AgentError' && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599) return error
  if (error?.status === 401 || error?.status === 403) return new RequestError('OpenAI отклонил авторизацию. Проверьте серверный ключ. Карточки и граф работают без AI.', 503)
  if (error?.name === 'APIConnectionTimeoutError') return new RequestError('Время ожидания истекло. Уточните вопрос и повторите.', 504)
  return new RequestError('AI-сервис временно недоступен. Проверьте подключение и доступ к модели.', 502)
}

/** Shared by Vite, preview, standalone and the production server. No proxy headers confer trust. */
export function createSecureAgentHandler(service, { env = process.env, now = Date.now, bodyTimeoutMs = 10000, requestTimeoutMs = 90000 } = {}) {
  const origin = configuredOrigin(env)
  const maxRequests = Number(env.AGENT_REQUESTS_PER_HOUR || 20)
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 1 || maxRequests > 500) throw new Error('AGENT_REQUESTS_PER_HOUR must be an integer between 1 and 500.')
  let active = 0, windowStart = now(), count = 0
  return async (req, res, next) => {
    const path = req.url?.split('?')[0]
    if (!path?.startsWith('/api/agent/')) { next?.(); return }
    const send = (status, body) => {
      if (res.destroyed || res.writableEnded) return
      // Do not keep an unread/partially read request alive after rejection.
      if (!req.complete && status >= 400) {
        res.shouldKeepAlive = false
        res.setHeader('Connection', 'close')
        res.once('finish', () => req.destroy())
      }
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      res.end(JSON.stringify(body))
    }
    if (!trustedRequest(req, origin)) { send(403, { error: 'Недопустимый источник запроса.' }); return }
    if (path === '/api/agent/status' && req.method === 'GET') {
      try { send(200, await service.status()) } catch { send(503, { error: 'AI-сервис временно недоступен.' }) }
      return
    }
    if (path !== '/api/agent/chat' || req.method !== 'POST') { send(404, { error: 'Маршрут не найден.' }); return }
    if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(req.headers['content-type'] || '') || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
      send(415, { error: 'Ожидается несжатый application/json в UTF-8.' }); return
    }
    const length = req.headers['content-length']
    if (length && (!/^\d+$/.test(length) || Number(length) > BODY_LIMIT)) { send(413, { error: 'Запрос слишком большой.' }); return }
    if (now() - windowStart >= HOUR) { windowStart = now(); count = 0 }
    if (count >= maxRequests) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((HOUR - (now() - windowStart)) / 1000))))
      send(429, { error: 'Достигнут часовой лимит AI-запросов. Карточки и граф остаются доступны.' }); return
    }
    if (active >= 2) { res.setHeader('Retry-After', '10'); send(429, { error: 'Ассистент занят. Повторите запрос позже.' }); return }
    active++
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new RequestError('Время ожидания истекло. Уточните вопрос и повторите.', 504)), requestTimeoutMs)
    const bodyTimer = setTimeout(() => controller.abort(new RequestError('Истекло время отправки запроса.', 408)), bodyTimeoutMs)
    timer.unref(); bodyTimer.unref()
    const disconnected = () => { if (!res.writableEnded) controller.abort(new RequestError('Соединение закрыто.', 400)) }
    res.once('close', disconnected)
    let reservedWindow
    try {
      const payload = await readBody(req, controller.signal)
      clearTimeout(bodyTimer)
      // Recheck after the body read: another request may have claimed the last slot.
      if (count >= maxRequests) throw new RequestError('Достигнут часовой лимит AI-запросов.', 429)
      count++
      reservedWindow = windowStart
      send(200, await abortable(service.chat(payload, controller.signal), controller.signal))
    } catch (error) {
      // These trusted service errors occur before inference, so invalid inputs do
      // not spend the paid-call budget. Provider failures/cancellations still do.
      const invalidInput = error?.name === 'ZodError' || (error?.name === 'AgentError' && [400, 409].includes(error.status))
      if (reservedWindow !== undefined && reservedWindow === windowStart && invalidInput) count--
      const safe = publicError(error, controller.signal)
      send(safe.status, { error: safe.message })
    } finally {
      active--
      clearTimeout(timer); clearTimeout(bodyTimer)
      res.off('close', disconnected)
    }
  }
}
