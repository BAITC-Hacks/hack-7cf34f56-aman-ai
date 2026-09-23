import { afterEach, describe, expect, it, vi } from 'vitest'
import { chatApi, replySchema, serializeChatRequest, statusSchema, type ChatMessage } from './chat'

const reply = {
  answer: 'Наблюдаемые связи требуют проверки [gid:900000000000100001].',
  dataMode: 'project', sources: [{ gid: '900000000000100001', label: 'Карточка клиента' }],
  trace: [{ tool: 'get_node', status: 'completed' }],
  review: { status: 'not_requested', text: null },
}
const status = {
  available: true, reviewerAvailable: false, dataMode: 'project', model: 'gpt-4.1-mini',
  verification: 'unverified', lastVerifiedAt: null, tools: ['get_node'],
}
function history(content: string, count = 10): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({ id: String(i), role: i % 2 ? 'assistant' : 'user', content: `${i}: ${content}`, gid: null }))
}

afterEach(() => vi.unstubAllGlobals())

describe('agent request boundaries', () => {
  it('keeps recent conversation within the aggregate budget and preserves exact GIDs', () => {
    const request = JSON.parse(serializeChatRequest('Сравни клиентов', '900000000000100001', history('я'.repeat(2000), 14)))
    expect(request.selectedGid).toBe('900000000000100001')
    expect(request.history.reduce((sum: number, turn: { content: string }) => sum + turn.content.length, 0)).toBeLessThanOrEqual(6000)
    expect(request.history.at(-1).content).toContain('13: ')
    expect(request.history).toHaveLength(3)
    expect(request.history.every((turn: object) => Object.keys(turn).sort().join() === 'content,role')).toBe(true)
  })

  it('keeps escaped control characters and multibyte text under the HTTP byte limit', () => {
    for (const text of ['\u0000'.repeat(6000), '🧭'.repeat(3000), 'я'.repeat(6000)]) {
      const body = serializeChatRequest('\u0001'.repeat(1999), null, history(text))
      expect(new TextEncoder().encode(body).byteLength).toBeLessThanOrEqual(32 * 1024)
    }
  })

  it('rejects oversized messages and noncanonical or numeric GIDs before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    for (const gid of ['01', '1e17', '123456789012345678901']) {
      await expect(chatApi.send('Вопрос', gid, [], new AbortController().signal)).rejects.toThrow()
    }
    expect(() => serializeChatRequest('x'.repeat(2001), null, [])).toThrow()
    expect(() => serializeChatRequest('Вопрос', Number('900000000000100001') as unknown as string, [])).toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('agent response boundaries', () => {
  it('requires explicit verification separately from a configured key', () => {
    expect(statusSchema.parse(status).verification).toBe('unverified')
    expect(statusSchema.safeParse({ available: true, reviewerAvailable: false, dataMode: 'project' }).success).toBe(false)
    expect(statusSchema.safeParse({ ...status, verification: 'connected' }).success).toBe(false)
    expect(statusSchema.safeParse({ ...status, lastVerifiedAt: 'not a date' }).success).toBe(false)
  })

  it('accepts only bounded trace states and string source identifiers', () => {
    expect(replySchema.parse(reply).sources[0].gid).toBe('900000000000100001')
    for (const malformed of [
      { ...reply, answer: 'x'.repeat(8001) },
      { ...reply, sources: [{ gid: Number('900000000000100001'), label: 'node' }] },
      { ...reply, trace: [{ tool: 'execute_code', status: 'completed' }] },
      { ...reply, trace: [{ tool: 'get_node', status: 'invented' }] },
      { ...reply, trace: Array(11).fill(reply.trace[0]) },
    ]) expect(replySchema.safeParse(malformed).success).toBe(false)
    expect(replySchema.safeParse({ ...reply, trace: [{ tool: 'unknown', status: 'rejected' }] }).success).toBe(true)
  })

  it('rejects an answer from another data source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...reply, dataMode: 'demo' }))))
    await expect(chatApi.send('Вопрос', null, [], new AbortController().signal)).rejects.toThrow('источнику данных')
  })

  it('does not expose arbitrarily large provider error payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'x'.repeat(301) }), { status: 502 })))
    await expect(chatApi.send('Вопрос', null, [], new AbortController().signal)).rejects.toThrow('Ассистент недоступен')
  })
})
