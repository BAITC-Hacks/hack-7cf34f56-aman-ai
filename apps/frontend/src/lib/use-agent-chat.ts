import { useEffect, useRef, useState } from 'react'
import { useResource } from './use-resource'
import { chatApi, type ChatMessage } from './chat'
import { dataMode } from './api'

export function useAgentChat(gid: string | null, clearQuestion: () => void) {
  const status = useResource('agent-status', chatApi.status)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [review, setReview] = useState('off')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState<{ text: string; gid: string | null; history: ChatMessage[] } | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])
  const available = status.data?.available && status.data.dataMode === dataMode
  async function send(text: string, context = gid, history = messages, retry = false) {
    if (!text.trim() || pending || !available) return
    const abort = new AbortController(); controller.current = abort
    setPending(true); setError(''); setFailed(null)
    if (!retry) { setMessages([...history, { id: crypto.randomUUID(), role: 'user', content: text, gid: context }]); clearQuestion() }
    try {
      const reply = await chatApi.send(text, context, history, review === 'on', abort.signal)
      if (!abort.signal.aborted) setMessages(current => [...current, { id: crypto.randomUUID(), role: 'assistant', content: reply.answer, gid: context, reply }])
    } catch (failure) {
      if (!abort.signal.aborted) { setError(failure instanceof Error ? failure.message : 'Не удалось получить ответ.'); setFailed({ text, gid: context, history }) }
    } finally { if (controller.current === abort) { controller.current = null; setPending(false) } }
  }
  function cancel() { controller.current?.abort(); controller.current = null; setPending(false); setError('Запрос остановлен. Можно задать новый вопрос.') }
  function reset() { setMessages([]); setError(''); setFailed(null); clearQuestion() }
  return { status, messages, review, setReview, pending, error, failed, available, send, cancel, reset }
}
export type AgentSession = ReturnType<typeof useAgentChat>
