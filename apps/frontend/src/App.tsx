import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Network, Search, ShieldCheck, CalendarDays, ArrowRight, PanelRightOpen, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PriorityPanel } from '@/components/priority-panel'
import { NodeInspector } from '@/components/node-inspector'
import { AgentChat } from '@/components/agent-chat'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingPanel } from '@/components/shared'
import { AnnotationBoundary } from '@/components/annotation-boundary'
const GraphPanel = lazy(() => import('@/components/graph-panel').then(m => ({ default: m.GraphPanel })))
import { useResource } from '@/lib/use-resource'
import { useAgentChat } from '@/lib/use-agent-chat'
import { api, isDemo } from '@/lib/api'
import { cn } from '@/lib/utils'

const Agentation = import.meta.env.DEV
  ? lazy(() => import('agentation').then(m => ({ default: m.Agentation })))
  : null

function locationState() { const p = new URLSearchParams(location.search); return { gid: p.get('gid'), hop: (p.get('hop') === '2' ? 2 : 1) as 1 | 2 } }
export default function App() {
  const [selection, setSelection] = useState(locationState)
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState('all')
  const [clusterId, setClusterId] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState('graph')
  const [side, setSide] = useState('details')
  const [question, setQuestion] = useState('')
  const chatTrigger = useRef<HTMLButtonElement>(null)
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 1280px)').matches)
  const searchController = useRef<AbortController | null>(null)
  const inspectorTrigger = useRef<HTMLButtonElement>(null)
  const { gid } = selection
  const chatSession = useAgentChat(gid, () => setQuestion(''))
  useEffect(() => {
    const media = matchMedia('(min-width: 1280px)')
    const resize = () => { setDesktop(media.matches); if (media.matches) setSheetOpen(false) }
    const back = () => { setSelection(locationState()); setClusterId(null) }
    media.addEventListener('change', resize); window.addEventListener('popstate', back)
    return () => { media.removeEventListener('change', resize); window.removeEventListener('popstate', back); searchController.current?.abort() }
  }, [])
  const top = useResource('top', api.top)
  const node = useResource(gid ? `node:${gid}` : null, signal => api.node(gid!, signal))
  const graph = useResource(isDemo ? 'network:demo' : gid ? `network:${gid}` : null, signal => api.network(gid, signal))
  const cluster = useResource(clusterId === null ? null : `cluster:${clusterId}`, signal => api.cluster(clusterId!, signal))
  function navigate(nextGid: string, nextHop: 1 | 2 = 1) {
    searchController.current?.abort(); setSearching(false); setSearchError('')
    const url = new URL(location.href); url.searchParams.set('gid', nextGid); url.searchParams.set('hop', String(nextHop))
    history.pushState(null, '', url); setSelection({ gid: nextGid, hop: nextHop }); setClusterId(null); setMobileTab('graph'); setSide('details')
    if (nextGid !== gid && !desktop) setSheetOpen(true)
  }
  function clearSelection() {
    searchController.current?.abort(); setSearching(false); setSearchError(''); setQuery('')
    const url = new URL(location.href); url.searchParams.delete('gid'); url.searchParams.delete('hop')
    history.pushState(null, '', url); setSelection({ gid: null, hop: 1 }); setClusterId(null); setSheetOpen(false)
  }
  async function search(event: FormEvent) {
    event.preventDefault(); searchController.current?.abort()
    const value = query.trim()
    if (!/^\d+$/.test(value)) { setSearchError('Введите gid: только цифры, без пробелов.'); setSearching(false); return }
    const controller = new AbortController(); searchController.current = controller
    setSearching(true); setSearchError('')
    try { const found = await api.search(value, controller.signal); if (!controller.signal.aborted) navigate(found) }
    catch (error) { if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Ошибка поиска') }
    finally { if (!controller.signal.aborted) setSearching(false) }
  }
  function openChat(text?: string) { setSide('chat'); if (text) setQuestion(text); if (!desktop) setSheetOpen(true) }
  const inspector = <NodeInspector onExplain={() => openChat('Объясни роль и приоритет выбранного клиента. Укажи факты, ограничения и следующий шаг.')}  gid={gid} node={node.data} loading={node.loading} error={node.error} retry={node.retry} onSelect={navigate} onCluster={id => { setClusterId(id); setSheetOpen(false); setMobileTab('graph') }} />
  const sidePanel = <Tabs value={side} onValueChange={setSide} className="side-panel panel"><div className="side-tabs"><TabsList className="w-full"><TabsTrigger value="details">3. Проверка клиента</TabsTrigger><TabsTrigger value="chat"><Bot />AI-помощник</TabsTrigger></TabsList></div><TabsContent value="details" forceMount className="inspector-slot" hidden={side !== 'details'}>{inspector}</TabsContent><TabsContent value="chat" forceMount className="chat-slot" hidden={side !== 'chat'}><AgentChat session={chatSession} gid={gid} active={side === 'chat'} question={question} setQuestion={setQuestion} onSelect={id => { navigate(id); setSide('details') }} /></TabsContent></Tabs>
  return <TooltipProvider delayDuration={250}><div className="app-shell">
    <header className="app-header"><a className="brand" href="./" aria-label="MoneyGraph — начало"><span className="brand-symbol"><Network /></span><span>MoneyGraph<small>INVESTIGATOR</small></span></a><div className="header-divider" /><div className="workspace-label">Финансовый мониторинг<br /><strong>Рабочее место аналитика</strong></div>
      <form className="gid-search" onSubmit={search}><Field><FieldLabel htmlFor="gid-search" className="sr-only">Поиск по gid</FieldLabel><div className="search-row"><Search className="search-icon" /><Input id="gid-search" placeholder="Найти клиента по gid" value={query} inputMode="numeric" autoComplete="off" aria-invalid={!!searchError} aria-describedby={searchError ? 'search-error' : undefined} onChange={e => { searchController.current?.abort(); setSearching(false); setQuery(e.target.value); setSearchError('') }} /><Button type="submit" variant="secondary" disabled={searching}>{searching ? <Spinner /> : <ArrowRight />}<span className="sr-only">Найти</span></Button></div></Field>{searchError && <div id="search-error" className="search-error" role="alert">{searchError}</div>}</form>
      <div className="header-status"><Badge variant="outline"><span className="status-dot" />{isDemo ? 'Демо-данные' : 'Данные анализа'}</Badge></div>
      <Button ref={chatTrigger} variant="outline" onClick={() => openChat()}><Bot data-icon="inline-start" />AI-помощник</Button>
    </header>
    <div className="dataset-bar"><div className="flex items-center gap-2"><CalendarDays className="size-3.5" /><span>{isDemo ? 'Демо-сценарий · июль 2026' : 'Выборка · июль 2026'}</span></div><Separator orientation="vertical" /><span>Внутрибанковские переводы</span><Separator orientation="vertical" /><span>От 5 000 KZT</span><Separator orientation="vertical" /><span>Глубина наблюдения 0–4</span><span className="dataset-end"><ShieldCheck className="size-3.5" />Локальное исследование</span></div>
    <div className="page-heading"><div><h1>Исследование сети</h1><p>От структуры переводов — к объяснимой гипотезе.</p></div><span className="subtle">{isDemo ? 'Режим знакомства с интерфейсом' : 'Результаты аналитического пайплайна'}</span></div>
    {isDemo && <Alert className="demo-notice"><AlertDescription>Демо: {graph.data?.nodes.length.toLocaleString('ru-RU') ?? '2 248'} синтетических клиентов. Роли и приоритеты — примеры интерфейса, не результаты анализа исходных данных.</AlertDescription></Alert>}
    <div className="mobile-navigation"><Tabs value={mobileTab} onValueChange={setMobileTab}><TabsList><TabsTrigger value="priorities">Приоритеты</TabsTrigger><TabsTrigger value="graph">Связи</TabsTrigger></TabsList></Tabs></div>
    <main className={cn('workspace', mobileTab === 'graph' && 'mobile-graph')}>
      <PriorityPanel nodes={top.data} loading={top.loading} error={top.error} retry={top.retry} selected={gid} onSelect={navigate} filter={filter} onFilter={setFilter} />
      <Suspense fallback={<section className="panel"><LoadingPanel /></section>}><GraphPanel gid={gid} graph={graph.data} loading={graph.loading} error={graph.error} retry={graph.retry} onClear={clearSelection} onSelect={navigate} cluster={cluster.data} clusterId={clusterId} clusterLoading={cluster.loading} clusterError={cluster.error} clusterRetry={cluster.retry} closeCluster={() => setClusterId(null)} /></Suspense>
      {desktop && sidePanel}
    </main>
    {!desktop && <><Button ref={inspectorTrigger} className="inspector-toggle" disabled={!gid} onClick={() => { setSide('details'); setSheetOpen(true) }}><PanelRightOpen data-icon="inline-start" />Карточка клиента</Button><Sheet open={sheetOpen} onOpenChange={setSheetOpen}><SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]" onCloseAutoFocus={e => { e.preventDefault(); (side === 'chat' ? chatTrigger : inspectorTrigger).current?.focus() }}><SheetHeader><SheetTitle>Исследование клиента</SheetTitle><SheetDescription>Наблюдаемые связи и гипотеза о роли</SheetDescription></SheetHeader>{sidePanel}</SheetContent></Sheet></>}
    <footer className="app-footer"><span><ShieldCheck className="size-3.5" />Выводы — гипотезы для проверки, а не утверждение о виновности.</span><span>MONEYGRAPH <span className="footer-dot">/</span> HACKALEM 2026</span></footer>
  </div>{Agentation && <AnnotationBoundary><Suspense fallback={null}><Agentation endpoint="http://localhost:4747" /></Suspense></AnnotationBoundary>}</TooltipProvider>
}
