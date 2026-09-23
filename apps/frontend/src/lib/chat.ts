import { z } from 'zod'
import { dataMode } from './api'

const modeSchema = z.enum(['project', 'demo', 'api'])
const gidSchema = z.string().regex(/^(0|[1-9]\d{0,19})$/)
const toolSchema = z.enum(['get_node', 'get_top_nodes', 'get_cluster', 'compare_nodes', 'get_neighbors', 'find_common_downstream'])
export const statusSchema = z.object({
  available: z.boolean(), reviewerAvailable: z.boolean(), dataMode: modeSchema,
  model: z.string().min(1).max(100),
  verification: z.enum(['not_configured', 'unverified', 'verified', 'failed']),
  lastVerifiedAt: z.iso.datetime().nullable(), tools: z.array(toolSchema).max(6),
}).strict()
export const replySchema = z.object({
  answer: z.string().min(1).max(8000), dataMode: modeSchema,
  sources: z.array(z.object({ gid: gidSchema, label: z.string().max(200) }).strict()).max(250),
  trace: z.array(z.object({ tool: z.union([toolSchema, z.literal('unknown')]), status: z.enum(['completed', 'cached', 'not_found', 'rejected']) }).strict()).max(10),
  review: z.object({ status: z.enum(['not_requested', 'completed', 'unavailable']), text: z.string().max(6000).nullable() }).strict(),
}).strict()
export type ChatStatus = z.infer<typeof statusSchema>
export type ChatReply = z.infer<typeof replySchema>
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; gid: string | null; reply?: ChatReply }

export function serializeChatRequest(message: string, selectedGid: string | null, history: ChatMessage[]) {
  const safeMessage = z.string().trim().min(1).max(2000).parse(message)
  const safeGid = gidSchema.nullable().parse(selectedGid)
  let remaining = 6000
  const boundedHistory: { role: 'user' | 'assistant'; content: string }[] = []
  for (const turn of history.slice(-10).reverse()) {
    if (!remaining) break
    const content = turn.content.slice(0, remaining)
    if (!content.trim()) continue
    boundedHistory.unshift({ role: turn.role, content })
    remaining -= content.length
  }
  const serialize = () => JSON.stringify({ message: safeMessage, selectedGid: safeGid, history: boundedHistory, dataMode, review: false })
  let body = serialize()
  // JSON escaping can expand control characters beyond their UTF-8 text size.
  while (new TextEncoder().encode(body).byteLength > 32 * 1024 && boundedHistory.length) {
    boundedHistory.shift()
    body = serialize()
  }
  return body
}

export const chatApi = {
  async status(signal?: AbortSignal) {
    const response = await fetch('/api/agent/status', { signal, cache: 'no-store' })
    if (!response.ok) throw new Error('AI-ассистент не подключён. Основные инструменты анализа доступны.')
    return statusSchema.parse(await response.json())
  },
  async send(message: string, selectedGid: string | null, history: ChatMessage[], signal: AbortSignal) {
    const response = await fetch('/api/agent/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: serializeChatRequest(message, selectedGid, history) })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(typeof body?.error === 'string' && body.error.length <= 300 ? body.error : 'Ассистент недоступен. Повторите запрос позже.')
    const parsed = replySchema.safeParse(body)
    if (!parsed.success || parsed.data.dataMode !== dataMode) throw new Error('Ответ ассистента не соответствует текущему источнику данных.')
    return parsed.data
  },
}
