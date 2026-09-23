import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react'
import { Network, Search, ShieldCheck, CalendarDays, ArrowRight, PanelRightOpen, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PriorityPanel } from '@/components/priority-panel'
import { NodeInspector } from '@/components/node-inspector'
import { LoadingPanel } from '@/components/shared'
const GraphPanel = lazy(() => import('@/components/graph-panel').then(m => ({ default: m.GraphPanel })))
import { useResource } from '@/lib/use-resource'
import { api, isDemo } from '@/lib/api'
import { cn } from '@/lib/utils'

function locationState() { const p = new URLSearchParams(location.search); return { gid: p.get('gid'), hop: (p.get('hop') === '2' ? 2 : 1) as 1 | 2 } }
export default function App() {
  const [selection, setSelection] = useState(locationState)
  const [query, setQuery] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  const [filter, setFilter] = useState('all')
  const [clusterId, setClusterId] = useState<number | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [mobileTab, setMobileTab] = useState('priorities')
  const [desktop, setDesktop] = useState(() => matchMedia('(min-width: 1280px)').matches)
  const searchController = useRef<AbortController | null>(null)
  const inspectorTrigger = useRef<HTMLButtonElement>(null)
  const { gid, hop } = selection
  useEffect(() => {
    const media = matchMedia('(min-width: 1280px)')
    const resize = () => { setDesktop(media.matches); if (media.matches) setSheetOpen(false) }
    const back = () => { setSelection(locationState()); setClusterId(null) }
    media.addEventListener('change', resize); window.addEventListener('popstate', back)
    return () => { media.removeEventListener('change', resize); window.removeEventListener('popstate', back); searchController.current?.abort() }
  }, [])
  const top = useResource('top', api.top)
  const node = useResource(gid ? `node:${gid}` : null, signal => api.node(gid!, signal))
  const graph = useResource(gid ? `graph:${gid}:${hop}` : null, signal => api.graph(gid!, hop, signal))
  const cluster = useResource(clusterId === null ? null : `cluster:${clusterId}`, signal => api.cluster(clusterId!, signal))
  function navigate(nextGid: string, nextHop: 1 | 2 = 1) {
    searchController.current?.abort(); setSearching(false); setSearchError('')
    const url = new URL(location.href); url.searchParams.set('gid', nextGid); url.searchParams.set('hop', String(nextHop))
    history.pushState(null, '', url); setSelection({ gid: nextGid, hop: nextHop }); setClusterId(null); setMobileTab('graph')
    if (nextGid !== gid && !desktop) setSheetOpen(true)
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
  const inspector = <NodeInspector gid={gid} node={node.data} loading={node.loading} error={node.error} retry={node.retry} onSelect={navigate} onCluster={id => { setClusterId(id); setSheetOpen(false); setMobileTab('graph') }} />
  return <TooltipProvider delayDuration={250}><div className="app-shell">
    <header className="app-header"><a className="brand" href="./" aria-label="MoneyGraph — начало"><span className="brand-symbol"><Network /></span><span>MoneyGraph<small>INVESTIGATOR</small></span></a><div className="header-divider" /><div className="workspace-label">Рабочее пространство<br /><strong>Исследование сети</strong></div>
      <form className="gid-search" onSubmit={search}><Field><FieldLabel htmlFor="gid-search" className="sr-only">Поиск по gid</FieldLabel><div className="search-row"><Search className="search-icon" /><Input id="gid-search" placeholder="Найти клиента по gid" value={query} inputMode="numeric" autoComplete="off" aria-invalid={!!searchError} aria-describedby={searchError ? 'search-error' : undefined} onChange={e => { searchController.current?.abort(); setSearching(false); setQuery(e.target.value); setSearchError('') }} /><Button type="submit" variant="secondary" disabled={searching}>{searching ? <Spinner /> : <ArrowRight />}<span className="sr-only">Найти</span></Button></div></Field>{searchError && <div id="search-error" className="search-error" role="alert">{searchError}</div>}</form>
      <div className="header-status"><Badge variant="outline"><span className="status-dot" />{isDemo ? 'Демонстрационные данные' : 'Backend API'}</Badge></div>
    </header>
    <div className="dataset-bar"><div className="flex items-center gap-2"><CalendarDays className="size-3.5" /><span>{isDemo ? 'Демо-сценарий · июль 2026' : 'Выборка · июль 2026'}</span></div><Separator orientation="vertical" /><span>Внутрибанковские переводы</span><Separator orientation="vertical" /><span>От 5 000 KZT</span><Separator orientation="vertical" /><span>Глубина наблюдения 0–4</span><span className="dataset-end"><ShieldCheck className="size-3.5" />Локальное исследование</span></div>
    <div className="page-heading"><div><div className="eyebrow">ФИНАНСОВЫЙ МОНИТОРИНГ</div><h1>Каждая связь имеет значение<span>.</span></h1><p>От приоритета проверки — к объяснимой структуре сети.</p></div><div className="page-meta"><span className="meta-number">{isDemo ? '26' : '2 248'}</span><span>{isDemo ? 'синтетических клиентов' : 'клиентов в выборке'}</span></div></div>
    {isDemo && <div className="demo-notice"><Info className="size-3.5 shrink-0" /><span>Режим прототипа. Все клиенты, роли и оценки синтетические; это не результаты анализа датасета.</span></div>}
    <div className="mobile-navigation"><Tabs value={mobileTab} onValueChange={setMobileTab}><TabsList><TabsTrigger value="priorities">Приоритеты</TabsTrigger><TabsTrigger value="graph">Связи</TabsTrigger></TabsList></Tabs></div>
    <main className={cn('workspace', mobileTab === 'graph' && 'mobile-graph')}>
      <PriorityPanel nodes={top.data} loading={top.loading} error={top.error} retry={top.retry} selected={gid} onSelect={navigate} filter={filter} onFilter={setFilter} />
      <Suspense fallback={<section className="panel"><LoadingPanel /></section>}><GraphPanel gid={gid} graph={graph.data} loading={graph.loading} error={graph.error} retry={graph.retry} hop={hop} onHop={h => gid && navigate(gid, h)} onSelect={navigate} cluster={cluster.data} clusterId={clusterId} clusterLoading={cluster.loading} clusterError={cluster.error} clusterRetry={cluster.retry} closeCluster={() => setClusterId(null)} /></Suspense>
      {desktop && inspector}
    </main>
    {!desktop && <><Button ref={inspectorTrigger} className="inspector-toggle" disabled={!gid} onClick={() => setSheetOpen(true)}><PanelRightOpen data-icon="inline-start" />Карточка клиента</Button><Sheet open={sheetOpen} onOpenChange={setSheetOpen}><SheetContent className="w-full sm:max-w-[420px]" onCloseAutoFocus={e => { e.preventDefault(); inspectorTrigger.current?.focus() }}><SheetHeader><SheetTitle>Проверка клиента</SheetTitle><SheetDescription>Наблюдаемые связи и гипотеза о роли</SheetDescription></SheetHeader>{inspector}</SheetContent></Sheet></>}
    <footer className="app-footer"><span><ShieldCheck className="size-3.5" />Выводы — гипотезы для проверки, а не утверждение о виновности.</span><span>MONEYGRAPH <span className="footer-dot">/</span> HACKALEM 2026</span></footer>
  </div></TooltipProvider>
}
