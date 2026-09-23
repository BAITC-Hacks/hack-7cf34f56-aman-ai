import { z } from 'zod'
import { gidSchema } from './contracts'
import { isDemo } from './api'

const statusSchema = z.object({ available: z.boolean(), reviewerAvailable: z.boolean(), dataMode: z.enum(['demo', 'api']) })
const replySchema = z.object({
  answer: z.string().min(1), dataMode: z.enum(['demo', 'api']),
  sources: z.array(z.object({ gid: gidSchema, label: z.string() })),
  trace: z.array(z.object({ tool: z.string(), status: z.string() })),
  review: z.object({ status: z.enum(['not_requested', 'completed', 'unavailable']), text: z.string().nullable() }),
})
export type ChatReply = z.infer<typeof replySchema>
export type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string; gid: string | null; reply?: ChatReply }
export const chatApi = {
  async status(signal?: AbortSignal) {
    const response = await fetch('/api/agent/status', { signal })
    if (!response.ok) throw new Error('AI-ассистент не подключён. Основные инструменты анализа доступны.')
    return statusSchema.parse(await response.json())
  },
  async send(message: string, selectedGid: string | null, history: ChatMessage[], review: boolean, signal: AbortSignal) {
    const response = await fetch('/api/agent/chat', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message, selectedGid, history: history.slice(-10).map(m => ({ role: m.role, content: m.content.slice(0, 6000) })), dataMode: isDemo ? 'demo' : 'api', review }) })
    const body = await response.json().catch(() => null)
    if (!response.ok) throw new Error(body?.error || 'Ассистент недоступен. Повторите запрос позже.')
    const parsed = replySchema.safeParse(body)
    if (!parsed.success || parsed.data.dataMode !== (isDemo ? 'demo' : 'api')) throw new Error('Ответ ассистента не соответствует текущему источнику данных.')
    return parsed.data
  },
}
