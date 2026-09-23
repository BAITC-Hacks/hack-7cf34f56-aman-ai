import { describe, it, expect, vi } from 'vitest'
import { createAgentService, chatRequest } from './agent.mjs'

// Real-source integration cases need `npm run data:project` once before this
// suite on a clean checkout. Provider clients are always injected local mocks.
const request = { message: 'Почему этот клиент?', selectedGid: '900000000000100001', dataMode: 'demo', history: [], review: false }
const done = { status: 'completed', output: [], output_text: 'Клиент [gid:900000000000100001]: гипотеза, требующая проверки.' }
const stub = (...responses) => ({ responses: { create: vi.fn().mockImplementation(async () => responses.shift() || done) } })
describe('server-side analyst agent', () => {
  it('rejects browser-supplied facts, numeric IDs and oversized questions', () => {
    expect(chatRequest.safeParse({ ...request, selectedGid: Number('900000000000100001') }).success).toBe(false)
    expect(chatRequest.safeParse({ ...request, facts: { priority_score: 1 } }).success).toBe(false)
    expect(chatRequest.safeParse({ ...request, message: 'x'.repeat(2001) }).success).toBe(false)
  })
  it('retrieves authoritative context and executes a validated node tool', async () => {
    const client = stub({ output: [{ type: 'function_call', name: 'get_node', call_id: 'call_1', arguments: '{"gid":"900000000000100002"}' }] }, done)
    const result = await createAgentService({ env: {}, dataMode: 'demo', openai: client }).chat(request)
    expect(result.sources.map(s => s.gid)).toEqual(['900000000000100001', '900000000000100002'])
    expect(result.trace).toEqual([{ tool: 'get_node', status: 'completed' }, { tool: 'get_node', status: 'completed' }])
    const submitted = client.responses.create.mock.calls[0][0]
    expect(submitted.store).toBe(false)
    expect(submitted.input.find(i => i.role === 'developer').content).toContain('3197000')
    expect(submitted.input.some(i => i.type === 'function_call_output' && i.output.includes('900000000000100002'))).toBe(true)
  })
  it('does not substitute demo data after a backend failure', async () => {
    const client = stub(done)
    const service = createAgentService({ env: { ANALYTICS_API_BASE_URL: 'http://backend.invalid' }, dataMode: 'api', openai: client, fetchImpl: async () => new Response('', { status: 503 }) })
    await expect(service.chat({ ...request, dataMode: 'api' })).rejects.toMatchObject({ status: 503 })
    expect(client.responses.create).not.toHaveBeenCalled()
  })
  it('blocks mismatched data modes and missing credentials before inference', async () => {
    const client = stub(done)
    await expect(createAgentService({ env: {}, dataMode: 'api', openai: client }).chat(request)).rejects.toMatchObject({ status: 409 })
    await expect(createAgentService({ env: {}, dataMode: 'demo' }).chat(request)).rejects.toMatchObject({ status: 503 })
    expect(client.responses.create).not.toHaveBeenCalled()
  })
  it('keeps a useful answer while reporting failed NVIDIA review honestly', async () => {
    const service = createAgentService({ env: { NVIDIA_API_KEY: 'test-only' }, dataMode: 'demo', openai: stub(done), fetchImpl: async () => new Response('', { status: 401 }) })
    const result = await service.chat({ ...request, review: true })
    expect(result.answer).toBe(done.output_text)
    expect(result.review.status).toBe('unavailable')
    expect(result.review.text).toContain('авторизацию')
  })
  it('returns NVIDIA critique separately and bounds its request', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'Уточните ограничения выборки.' } }] }))
    const service = createAgentService({ env: { NVIDIA_API_KEY: 'test-only' }, dataMode: 'demo', openai: stub(done), fetchImpl })
    const result = await service.chat({ ...request, review: true })
    expect(result.review).toEqual({ status: 'completed', text: 'Уточните ограничения выборки.' })
    expect(result.answer).toBe(done.output_text)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).max_tokens).toBe(1000)
  })
  it('does not add nonexistent IDs to evidence sources', async () => {
    const client = stub({ output: [{ type: 'function_call', name: 'get_node', call_id: 'missing', arguments: '{"gid":"123"}' }] }, done)
    const result = await createAgentService({ env: {}, dataMode: 'demo', openai: client }).chat(request)
    expect(result.sources.some(s => s.gid === '123')).toBe(false)
    expect(result.trace[1].status).toBe('not_found')
  })
  it('uses project results by default and retrieves real top, node and cluster facts locally', async () => {
    const gid = '100000003115284100'
    const client = stub(
      { output: [{ type: 'function_call', name: 'get_node', call_id: 'node', arguments: JSON.stringify({ gid }) }] },
      { output: [{ type: 'function_call', name: 'get_cluster', call_id: 'cluster', arguments: '{"cluster_id":1}' }] },
      { ...done, output_text: `Клиент [gid:${gid}]: гипотеза консолидации.` },
    )
    const fetchImpl = vi.fn(() => { throw new Error('Network is forbidden in this test') })
    const service = createAgentService({ env: {}, openai: client, fetchImpl })
    expect(service.status()).toEqual({ available: true, reviewerAvailable: false, dataMode: 'project' })
    const result = await service.chat({ ...request, selectedGid: null, dataMode: 'project' })
    expect(result.dataMode).toBe('project')
    expect(result.sources[0].gid).toBe(gid)
    const input = client.responses.create.mock.calls[0][0].input
    const initialContext = input.find(item => item.role === 'developer').content
    expect(initialContext).toContain(`"gid":"${gid}"`)
    expect(initialContext).toContain('"priority_score":0.862398')
    expect(initialContext).not.toContain('900000000000100001')
    const nodeOutput = JSON.parse(input.find(item => item.call_id === 'node' && item.type === 'function_call_output').output)
    expect(nodeOutput.source).toBe('project')
    expect(nodeOutput.result).toMatchObject({ gid, role: 'consolidator', priority_score: 0.862398 })
    const clusterOutput = JSON.parse(input.find(item => item.call_id === 'cluster' && item.type === 'function_call_output').output)
    expect(clusterOutput.result).toMatchObject({ cluster_id: 1, n_nodes: 239, n_seed: 4 })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('returns not-found evidence for an unknown project node without substituting demo facts', async () => {
    const client = stub({ ...done, output_text: 'Клиент не найден в результатах проекта.' })
    const result = await createAgentService({ env: {}, openai: client }).chat({ ...request, selectedGid: '123', dataMode: 'project' })
    expect(result.sources).toEqual([])
    expect(result.trace).toEqual([{ tool: 'get_node', status: 'not_found' }])
    expect(client.responses.create.mock.calls[0][0].input.find(item => item.role === 'developer').content).toContain('Клиент или кластер не найден.')
  })
  it('reports a missing project export as unavailable before inference', async () => {
    const client = stub(done)
    const fetchImpl = vi.fn()
    const service = createAgentService({ env: {}, openai: client, fetchImpl, projectDataPath: new URL('./missing-project-data.test.json', import.meta.url) })
    await expect(service.chat({ ...request, dataMode: 'project' })).rejects.toMatchObject({ status: 503 })
    expect(client.responses.create).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects a fixture without project provenance before inference', async () => {
    const client = stub(done)
    const fetchImpl = vi.fn()
    const service = createAgentService({ env: {}, openai: client, fetchImpl, projectDataPath: new URL('../public/demo.json', import.meta.url) })
    await expect(service.chat({ ...request, dataMode: 'project' })).rejects.toMatchObject({ status: 503 })
    expect(client.responses.create).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('rejects browser/server project mode mismatches before reading context', async () => {
    const client = stub(done)
    await expect(createAgentService({ env: {}, openai: client }).chat(request)).rejects.toMatchObject({ status: 409 })
    await expect(createAgentService({ env: {}, dataMode: 'demo', openai: client }).chat({ ...request, dataMode: 'project' })).rejects.toMatchObject({ status: 409 })
    expect(client.responses.create).not.toHaveBeenCalled()
  })
})
