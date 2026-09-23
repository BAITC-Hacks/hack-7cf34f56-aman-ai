import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { Network, Search, ArrowRight, PanelRightOpen, Bot, Upload, ListOrdered, X, Database, Maximize, Minimize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { PriorityPanel } from '@/components/priority-panel'
import { NodeInspector } from '@/components/node-inspector'
import { AgentChat } from '@/components/agent-chat'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LoadingPanel } from '@/components/shared'
import { AnnotationBoundary } from '@/components/annotation-boundary'
import { useResource } from '@/lib/use-resource'
import { useAgentChat } from '@/lib/use-agent-chat'
import { api, isDemo, isLocal, dataMode } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CsvDashboard } from '@/components/csv-dashboard'
import type { CsvAnalysis } from '@/lib/csv-analytics'

const GraphPanel = lazy(() => import('@/components/graph-panel').then(module => ({ default: module.GraphPanel })))
const Agentation = import.meta.env.DEV ? lazy(() => import('agentation').then(module => ({ default: module.Agentation }))) : null
type Selection = { gid: string | null; hop: 1 | 2 }
type Drawer = 'priorities' | 'details' | 'chat' | 'filters' | null
function locationState(): Selection {
  const params = new URLSearchParams(location.search)
  return { gid: params.get('gid'), hop: params.get('hop') === '2' ? 2 : 1 }
}
export default function App() {
  const [view, setView] = useState<'investigation' | 'csv'>('investigation')
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null)
  return view === 'csv'
    ? <TooltipProvider delayDuration={250}><CsvDashboard analysis={analysis} onAnalysis={setAnalysis} onBack={() => setView('investigation')} /></TooltipProvider>
    : <InvestigationApp onUpload={() => setView('csv')} />
}

function InvestigationApp({ onUpload }: { onUpload: () => void }) {
  const [selection, setSelection] = useState(locationState)
  const [trail, setTrail] = useState<Selection[]>([])
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState('all')
  const [clusterId, setClusterId] = useState<number | null>(null)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [dataOpen, setDataOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState('')
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 900px)').matches)
  const searchController = useRef<AbortController | null>(null)
  const shell = useRef<HTMLDivElement>(null)
  const priorityTrigger = useRef<HTMLButtonElement>(null)
  const detailTrigger = useRef<HTMLButtonElement>(null)
  const chatTrigger = useRef<HTMLButtonElement>(null)
  const lastDrawer = useRef<Drawer>('priorities')
  const { gid } = selection
  const chatSession = useAgentChat(gid, () => setQuestion(''))
  useEffect(() => { if (drawer && drawer !== 'filters') lastDrawer.current = drawer }, [drawer])
  useEffect(() => {
    const media = matchMedia('(min-width: 900px)')
    const resize = () => setDesktop(media.matches)
    const back = () => { setSelection(locationState()); setClusterId(null); setTrail([]); setDrawer(null) }
    const full = () => setFullscreen(!!document.fullscreenElement)
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawer(null) }
    media.addEventListener('change', resize); window.addEventListener('popstate', back)
    document.addEventListener('fullscreenchange', full); document.addEventListener('keydown', escape)
    return () => {
      media.removeEventListener('change', resize); window.removeEventListener('popstate', back)
      document.removeEventListener('fullscreenchange', full); document.removeEventListener('keydown', escape)
      searchController.current?.abort()
    }
  }, [])
  const top = useResource('top', api.top)
  const node = useResource(gid ? `node:${gid}` : null, signal => api.node(gid!, signal))
  const graph = useResource(isLocal ? `network:${dataMode}` : gid ? `network:${gid}` : null, signal => api.network(gid, signal))
  const cluster = useResource(clusterId === null ? null : `cluster:${clusterId}`, signal => api.cluster(clusterId!, signal))
  function applySelection(next: Selection) {
    searchController.current?.abort(); setSearching(false); setSearchError(''); setQuery('')
    const url = new URL(location.href)
    if (next.gid) { url.searchParams.set('gid', next.gid); url.searchParams.set('hop', String(next.hop)) }
    else { url.searchParams.delete('gid'); url.searchParams.delete('hop') }
    history.pushState(null, '', url); setSelection(next); setClusterId(null)
    setDrawer(next.gid && desktop ? 'details' : null)
  }
  function navigate(nextGid: string, nextHop: 1 | 2 = 1) {
    if (nextGid !== gid) setTrail(previous => [...previous, selection].slice(-50))
    applySelection({ gid: nextGid, hop: nextHop })
  }
  function goBack() {
    const previous = trail.at(-1)
    if (previous) { setTrail(trail.slice(0, -1)); applySelection(previous) }
  }
  function clearSelection() {
    if (gid) setTrail(previous => [...previous, selection].slice(-50))
    applySelection({ gid: null, hop: 1 })
  }
  async function search(event: FormEvent) {
    event.preventDefault(); searchController.current?.abort()
    const value = query.trim()
    if (!/^\d+$/.test(value)) { setSearchError('GID должен содержать только цифры.'); setSearching(false); return }
    const controller = new AbortController(); searchController.current = controller
    setSearching(true); setSearchError('')
    try { const found = await api.search(value, controller.signal); if (!controller.signal.aborted) navigate(found) }
    catch (error) { if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Ошибка поиска') }
    finally { if (!controller.signal.aborted) setSearching(false) }
  }
  function toggleDrawer(next: Drawer) { setDrawer(current => current === next ? null : next) }
  async function toggleFullscreen() {
    setFullscreenError('')
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch { setFullscreenError('Полноэкранный режим недоступен в этом браузере. Граф уже занимает рабочую область.') }
  }
  const drawerTitle = drawer === 'priorities' ? 'Приоритеты проверки' : drawer === 'chat' ? 'AI-помощник' : 'Карточка клиента'
  const restoreFocus = () => (lastDrawer.current === 'chat' ? chatTrigger : lastDrawer.current === 'priorities' ? priorityTrigger : detailTrigger).current?.focus()
  const drawerContent = drawer === 'priorities'
    ? <PriorityPanel nodes={top.data} loading={top.loading} error={top.error} retry={top.retry} selected={gid} onSelect={navigate} filter={filter} onFilter={setFilter} />
    : drawer === 'chat'
      ? <AgentChat session={chatSession} gid={gid} active question={question} setQuestion={setQuestion} onSelect={navigate} />
      : <NodeInspector gid={gid} node={node.data} loading={node.loading} error={node.error} retry={node.retry} onSelect={navigate} onCluster={id => { setClusterId(id); setDrawer(null) }} />
  const leftInset = desktop && drawer === 'priorities' ? 310 : 0
  const rightInset = desktop && drawer && drawer !== 'priorities' ? 370 : 0
  const drawerVisible = drawer !== null && drawer !== 'filters'
  return <TooltipProvider delayDuration={250}><div className="app-shell canvas-shell" ref={shell}>
    <header className="app-header canvas-header">
      <a className="brand" href="./" onClick={event => { event.preventDefault(); clearSelection() }} aria-label="MoneyGraph — вся сеть"><span className="brand-symbol"><Network /></span><span>MoneyGraph<small>INVESTIGATOR</small></span></a>
      <h1 className="sr-only">Исследование сети</h1>
      <Button ref={priorityTrigger} variant={drawer === 'priorities' ? 'secondary' : 'outline'} aria-label="Приоритеты" aria-expanded={drawer === 'priorities'} onClick={() => toggleDrawer('priorities')}><ListOrdered data-icon="inline-start" /><span className="header-action-text">Приоритеты</span></Button>
      <form className="gid-search" onSubmit={search}><Field data-invalid={!!searchError}><FieldLabel htmlFor="gid-search" className="sr-only">Поиск по gid</FieldLabel><div className="search-row"><Search className="search-icon" /><Input id="gid-search" placeholder="GID" value={query} inputMode="numeric" autoComplete="off" aria-invalid={!!searchError} aria-describedby={searchError ? 'search-error' : undefined} onChange={event => { searchController.current?.abort(); setSearching(false); setQuery(event.target.value); setSearchError('') }} /><Button type="submit" variant="secondary" disabled={searching}>{searching ? <Spinner /> : <ArrowRight />}<span className="sr-only">Найти</span></Button></div></Field>{searchError && <div id="search-error" className="search-error" role="alert">{searchError}</div>}</form>
      <Button ref={detailTrigger} variant={drawer === 'details' ? 'secondary' : 'outline'} disabled={!gid} aria-expanded={drawer === 'details'} onClick={() => toggleDrawer('details')} aria-label="Карточка клиента"><PanelRightOpen data-icon="inline-start" /><span className="header-action-text">Карточка</span></Button>
      <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Данные и запуск" onClick={() => setDataOpen(true)}><Database /></Button></TooltipTrigger><TooltipContent>Данные и запуск</TooltipContent></Tooltip>
      <Button variant="outline" aria-label="Загрузить CSV" onClick={onUpload}><Upload data-icon="inline-start" /><span className="header-action-text">CSV</span></Button>
      <Button ref={chatTrigger} variant={drawer === 'chat' ? 'secondary' : 'outline'} aria-expanded={drawer === 'chat'} onClick={() => toggleDrawer('chat')} aria-label="AI-помощник"><Bot data-icon="inline-start" /><span className="header-action-text">AI-помощник</span></Button>
      <Tooltip><TooltipTrigger asChild><Button className="fullscreen-toggle" variant="ghost" size="icon-sm" aria-label={fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'} onClick={toggleFullscreen}>{fullscreen ? <Minimize /> : <Maximize />}</Button></TooltipTrigger><TooltipContent>{fullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}</TooltipContent></Tooltip>
    </header>
    {fullscreenError && <Alert><AlertDescription>{fullscreenError}</AlertDescription></Alert>}
    {isDemo && <Alert className="canvas-demo-notice"><AlertDescription>Демонстрационные данные. Роли и приоритеты — примеры интерфейса.</AlertDescription></Alert>}
    <main className="canvas-workspace" style={{ '--canvas-left-inset': `${leftInset}px`, '--canvas-right-inset': `${rightInset}px` } as CSSProperties}>
      <Suspense fallback={<section className="panel canvas-loading"><LoadingPanel /></section>}><GraphPanel gid={gid} graph={graph.data} loading={graph.loading} error={graph.error} retry={graph.retry} onClear={clearSelection} onSelect={navigate} cluster={cluster.data} clusterId={clusterId} clusterLoading={cluster.loading} clusterError={cluster.error} clusterRetry={cluster.retry} closeCluster={() => setClusterId(null)} onBack={goBack} canGoBack={trail.length > 0} viewportInsets={{ left: leftInset, right: rightInset }} settingsOpen={drawer === 'filters'} onSettingsOpenChange={open => setDrawer(open ? 'filters' : null)} /></Suspense>
      {desktop && drawerVisible && <aside className={cn('canvas-drawer', drawer === 'priorities' ? 'canvas-drawer-left' : 'canvas-drawer-right')} aria-label={drawerTitle}><div className="canvas-drawer-heading"><span>{drawerTitle}</span><Button variant="ghost" size="icon-sm" aria-label="Закрыть панель" onClick={() => { restoreFocus(); setDrawer(null) }}><X /></Button></div><div className="canvas-drawer-content">{drawerContent}</div></aside>}
    </main>
    <Sheet open={!desktop && drawerVisible} onOpenChange={open => { if (!open) setDrawer(null) }}><SheetContent className="mobile-canvas-sheet" side={drawer === 'priorities' ? 'left' : 'right'} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus() }}><SheetHeader><SheetTitle>{drawerTitle}</SheetTitle><SheetDescription>{drawer === 'chat' ? 'Объяснение наблюдаемых фактов и ограничений.' : 'Наблюдаемые связи и гипотезы для проверки.'}</SheetDescription></SheetHeader><div className="canvas-drawer-content">{drawerContent}</div></SheetContent></Sheet>
    <Sheet open={dataOpen} onOpenChange={setDataOpen}><SheetContent className="data-source-sheet"><SheetHeader><SheetTitle>Данные и воспроизводимый запуск</SheetTitle><SheetDescription>Исходные файлы из задания HackAlem.</SheetDescription></SheetHeader><div className="flex flex-col gap-5 overflow-y-auto px-4 pb-6"><div className="header-status"><Badge variant="outline"><span className="status-dot" />{isDemo ? 'Демо' : dataMode === 'project' ? 'Данные проекта' : 'API'}</Badge></div><p>Официальный вход — три файла в папке <code>data/</code>:</p><ul className="data-file-list"><li><strong>nodes.parquet</strong><span>GID, глубина, исходные клиенты</span></li><li><strong>edges.parquet</strong><span>Направленные связи, суммы и число переводов</span></li><li><strong>transactions.parquet</strong><span>Отдельные переводы с календарными датами</span></li></ul><p>Июль 2026 · один банк · переводы от 5 000 KZT. Глубина 4 — граница наблюдения; входящие потоки исходных клиентов могут быть неполными.</p><div><strong>Запуск из корня проекта</strong><pre className="startup-command">python3 scripts/run-local.py</pre><p>Команда проверяет данные, воспроизводимость CSV и собирает интерфейс. Для аналитики и графа AI-ключи не нужны.</p></div><Alert><AlertDescription>Загрузка CSV — отдельный обзор переводов. Полный расчёт ролей и приоритетов использует исходные Parquet-файлы. Выводы системы — гипотезы для проверки.</AlertDescription></Alert></div></SheetContent></Sheet>
  </div>{Agentation && <AnnotationBoundary><Suspense fallback={null}><Agentation endpoint="http://localhost:4747" /></Suspense></AnnotationBoundary>}</TooltipProvider>
}
