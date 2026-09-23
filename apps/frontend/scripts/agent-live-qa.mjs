// Opt-in paid smoke test. Only explicitly synthetic demo fixtures are allowed.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'

const base = new URL(process.env.QA_BASE_URL || 'http://127.0.0.1:5187/')
assert(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'Use a local demo app')
assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password, 'Invalid app URL')
const status = await (await fetch(new URL('/api/agent/status', base))).json()
assert.equal(status.dataMode, 'demo', 'Live smoke test refuses to send project data. Start VITE_DATA_MODE=demo.')
assert(status.available, 'Configure the server-side OpenAI key before this opt-in test')
const response = await fetch(new URL('/api/agent/chat', base), {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.origin },
  body: JSON.stringify({
    message: 'На синтетических демо-данных сравни 900000000000100001 и 900000000000100002 через compare_nodes, затем проверь исходящих соседей первого клиента через get_neighbors с limit=3. Укажи наблюдаемые факты, ограничения и источники.',
    selectedGid: '900000000000100001', dataMode: 'demo', history: [], review: false,
  }), signal: AbortSignal.timeout(95000),
})
const reply = await response.json()
assert.equal(response.status, 200, reply.error || 'Live model request failed')
assert(reply.answer.length > 20)
assert(reply.trace.some(step => step.tool === 'compare_nodes' && step.status === 'completed'), 'Model must execute comparison')
assert(reply.trace.some(step => step.tool === 'get_neighbors' && step.status === 'completed'), 'Model must execute directed neighbor lookup')
assert(reply.sources.some(source => source.gid === '900000000000100002'))
const after = await (await fetch(new URL('/api/agent/status', base))).json()
assert.equal(after.verification, 'verified')
const report = { testedAt: new Date().toISOString(), source: 'synthetic demo only', model: after.model, httpStatus: response.status, trace: reply.trace, sourceCount: reply.sources.length, verification: after.verification }
await mkdir('qa', { recursive: true })
await writeFile('qa/agent-live-report.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
