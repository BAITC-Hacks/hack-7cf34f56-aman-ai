import { useEffect, useRef, type FormEvent } from 'react'
import { ArrowUp, Bot, Square, RotateCcw, ArrowUpRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { Message, MessageContent, MessageHeader } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { MessageScrollerProvider, MessageScroller, MessageScrollerViewport, MessageScrollerContent, MessageScrollerItem, MessageScrollerButton } from '@/components/ui/message-scroller'
import { Spinner } from '@/components/ui/spinner'
import type { ChatReply, ChatStatus } from '@/lib/chat'
import type { AgentSession } from '@/lib/use-agent-chat'
import { dataMode } from '@/lib/api'

export function AgentChat({ gid, onSelect, active, question, setQuestion, session }: { gid: string | null; onSelect: (gid: string) => void; active: boolean; question: string; setQuestion: (value: string) => void; session: AgentSession }) {
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (active) input.current?.focus() }, [active])
  const { status, messages, pending, error, failed, available, send, cancel, reset } = session
  function submit(event: FormEvent) { event.preventDefault(); void send(question.trim()) }
  return <section className="agent-chat" aria-label="AI-ассистент" hidden={!active}>
    <div className="chat-heading"><div><h2><Bot className="size-4" />Помощник аналитика</h2></div><Button variant="ghost" size="icon-sm" aria-label="Новый диалог" onClick={reset}><RotateCcw /></Button></div>
    <div className="chat-context"><span>Контекст</span><strong>{gid || 'Список приоритетов'}</strong><Badge variant="secondary">{dataMode === 'project' ? 'Данные проекта' : dataMode === 'demo' ? 'Демо-данные' : 'API'}</Badge></div>
    <div className="px-4 pb-2" role="status"><ProviderStatus status={status.data} loading={status.loading} /></div>
    {status.error || (!status.loading && !available) ? <div className="p-3"><Alert><AlertTitle>Ассистент не подключён</AlertTitle><AlertDescription>{status.error || 'Подключите AI-сервис с тем же источником данных. Карточки и граф доступны без AI.'}<Button size="sm" variant="outline" onClick={status.retry}>Проверить подключение</Button></AlertDescription></Alert></div> : null}
    <MessageScrollerProvider autoScroll><MessageScroller className="min-h-0 flex-1"><MessageScrollerViewport aria-label="История диалога"><MessageScrollerContent className="p-4">
      {!messages.length && <MessageScrollerItem messageId="welcome"><div className="chat-welcome"><Sparkles className="size-6" /><h3>Что хотите выяснить?</h3><p>Ассистент выбирает инструменты, сравнивает клиентов и проверяет направленные связи. Шаги анализа и ссылки на данные доступны под ответом.</p>{[gid ? 'Почему этот клиент в списке приоритетов?' : 'Кого проверить первым и почему?', gid ? 'Какие входящие и исходящие связи стоит проверить?' : 'Сравни первых двух клиентов по приоритету.', 'Каких данных не хватает для вывода?'].map(text => <Button key={text} variant="outline" className="h-auto justify-start whitespace-normal text-left" onClick={() => { setQuestion(text); input.current?.focus() }}>{text}<ArrowUpRight data-icon="inline-end" /></Button>)}</div></MessageScrollerItem>}
      {messages.map(m => <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === 'user'}><Message align={m.role === 'user' ? 'end' : 'start'}><MessageContent><MessageHeader>{m.role === 'user' ? 'Вы' : 'MoneyGraph · OpenAI'}</MessageHeader><Bubble variant={m.role === 'user' ? 'secondary' : 'ghost'} align={m.role === 'user' ? 'end' : 'start'}><BubbleContent><div className="chat-prose">{m.reply ? <Answer reply={m.reply} onSelect={onSelect} /> : m.content}</div></BubbleContent></Bubble>{m.gid && <span className="chat-turn-context">Клиент {m.gid}</span>}{m.reply && <><div className="chat-sources">{m.reply.sources.filter(s => m.content.includes(s.gid)).map(s => <Button key={s.gid} variant="outline" size="xs" onClick={() => onSelect(s.gid)} aria-label={`Открыть источник ${s.gid}`}>{s.gid}<ArrowUpRight data-icon="inline-end" /></Button>)}</div><ExecutionTrace trace={m.reply.trace} /></>}</MessageContent></Message></MessageScrollerItem>)}
      {pending && <MessageScrollerItem messageId="pending"><div className="flex items-center gap-2 text-sm" role="status"><Spinner />Изучаю факты…</div></MessageScrollerItem>}
      {error && <MessageScrollerItem messageId="error"><Alert variant={failed ? 'destructive' : 'default'}><AlertTitle>{failed ? 'Ответ не получен' : 'Запрос остановлен'}</AlertTitle><AlertDescription>{error}{failed && <Button variant="outline" size="sm" onClick={() => void send(failed.text, failed.gid, failed.history, true)}>Повторить вопрос</Button>}</AlertDescription></Alert></MessageScrollerItem>}
    </MessageScrollerContent></MessageScrollerViewport><MessageScrollerButton /></MessageScroller></MessageScrollerProvider>
    <form className="chat-composer" onSubmit={submit}><Field><FieldLabel htmlFor="agent-question" className="sr-only">Вопрос аналитику AI</FieldLabel><Textarea ref={input} id="agent-question" placeholder="Задайте вопрос…" value={question} maxLength={2000} disabled={pending || !available} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(question.trim()) } }} /></Field><div className="chat-composer-actions">{pending ? <Button type="button" variant="outline" size="icon" aria-label="Остановить ответ" onClick={cancel}><Square /></Button> : <Button type="submit" size="icon" aria-label="Отправить вопрос" disabled={!question.trim() || !available}><ArrowUp /></Button>}</div><p>Сверяйте гипотезы AI с числами.</p></form>
  </section>
}
function ProviderStatus({ status, loading }: { status?: ChatStatus; loading: boolean }) {
  const labels = {
    not_configured: 'OpenAI не настроен',
    unverified: 'OpenAI настроен · вызов ещё не проверен',
    verified: 'OpenAI · успешный вызов подтверждён',
    failed: 'OpenAI · последний вызов не удался',
  }
  const label = loading ? 'Проверяю настройку AI…' : status ? labels[status.verification] : 'Статус AI недоступен'
  const title = status ? `${status.model}${status.lastVerifiedAt ? ` · Последний успешный вызов: ${new Date(status.lastVerifiedAt).toLocaleString('ru-RU')}` : ''}` : undefined
  return <Badge variant={status?.verification === 'failed' ? 'destructive' : 'outline'} title={title}>{label}</Badge>
}

const toolLabels: Record<ChatReply['trace'][number]['tool'], string> = {
  get_node: 'Карточка клиента',
  get_top_nodes: 'Список приоритетов',
  get_cluster: 'Сводка кластера',
  compare_nodes: 'Сравнение клиентов',
  get_neighbors: 'Направленные связи',
  find_common_downstream: 'Общие достижимые получатели',
  unknown: 'Неизвестный инструмент',
}
const traceLabels: Record<ChatReply['trace'][number]['status'], string> = {
  completed: 'Готово', cached: 'Повторное чтение', not_found: 'Нет данных', rejected: 'Отклонено',
}
function ExecutionTrace({ trace }: { trace: ChatReply['trace'] }) {
  if (!trace.length) return null
  return <Accordion type="single" collapsible><AccordionItem value="trace"><AccordionTrigger>Шаги анализа · {trace.length}</AccordionTrigger><AccordionContent><ol className="flex list-decimal flex-col gap-2 pl-5">{trace.map((step, index) => <li key={index}><div className="flex flex-wrap items-center justify-between gap-2"><span>{toolLabels[step.tool]}</span><Badge variant={step.status === 'rejected' ? 'destructive' : 'secondary'}>{traceLabels[step.status]}</Badge></div></li>)}</ol><p className="mt-2 text-muted-foreground">Инструменты только читают данные. Это журнал обращений к данным.</p></AccordionContent></AccordionItem></Accordion>
}

function Answer({ reply, onSelect }: { reply: ChatReply; onSelect: (gid: string) => void }) {
  const known = new Set(reply.sources.map(s => s.gid))
  return <>{reply.answer.split(/(\[gid:\d+\])/g).map((part, i) => { const match = /^\[gid:(\d+)\]$/.exec(part); return match && known.has(match[1]) ? <Button key={i} variant="link" size="sm" className="h-auto p-0" onClick={() => onSelect(match[1])}>{match[1]}</Button> : <span key={i}>{part}</span> })}</>
}
