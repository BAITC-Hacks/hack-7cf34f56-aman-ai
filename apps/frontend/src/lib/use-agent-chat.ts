import { useEffect, useRef, useState } from 'react'
import { useResource } from './use-resource'
import { chatApi, type ChatMessage } from './chat'
import { dataMode } from './api'

export function useAgentChat(gid: string | null, clearQuestion: () => void) {
  const status = useResource('agent-status', chatApi.status)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<{ text: string; gid: string | null; history: ChatMessage[] } | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const available = status.data?.available && status.data.dataMode === dataMode
  async function send(text: string, context = gid, history = messages, retry = false) {
    if (!text.trim() || controller.current || !available) return
    const abort = new AbortController(); controller.current = abort
    setPending(true); setError(''); setFailed(null)
    if (!retry) { setMessages([...history, { id: crypto.randomUUID(), role: 'user', content: text, gid: context }]); clearQuestion() }
    try {
      const reply = await chatApi.send(text, context, history, abort.signal)
      if (!abort.signal.aborted && controller.current === abort) setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: reply.answer, gid: context, reply }])
    } catch (failure) {
      if (!abort.signal.aborted && controller.current === abort) { setError(failure instanceof Error ? failure.message : 'Не удалось получить ответ.'); setFailed({ text, gid: context, history }) }
    } finally { if (controller.current === abort) { controller.current = null; setPending(false); status.retry() } }
  }
  function cancel() { controller.current?.abort(); controller.current = null; setPending(false); setFailed(null); setError('Запрос остановлен. Можно задать новый вопрос.') }
  function reset() { controller.current?.abort(); controller.current = null; setPending(false); setMessages([]); setError(''); setFailed(null); clearQuestion() }
  return { status, messages, pending, error, failed, available, send, cancel, reset }
}
export type AgentSession = ReturnType<typeof useAgentChat>
