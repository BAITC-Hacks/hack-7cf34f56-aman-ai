import { useMemo, useState } from 'react'
import { Network, Focus, X, SlidersHorizontal, Route, Download, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ErrorPanel, LoadingPanel, EmptyPanel } from './shared'
import { AMLGraph } from './AMLGraph'
import { clusterColor, roleColors, money } from '@/lib/graph-presentation'
import { GraphSettingsPanel } from './graph-settings'
import { defaultGraphSettings, filterGraph } from '@/lib/graph-settings'
import { type AMLGraphData, nodeVolume, neighborhood } from '@/lib/graph-adapter'
import { roleLabels, amount } from '@/lib/format'
import { downloadCsv } from '@/lib/export'
import type { Cluster } from '@/lib/contracts'

type Props = { gid: string | null; graph?: AMLGraphData; loading: boolean; error?: string; retry: () => void; onSelect: (gid: string) => void; onClear: () => void; cluster?: Cluster; clusterLoading: boolean; clusterError?: string; clusterRetry: () => void; clusterId: number | null; closeCluster: () => void }
export function GraphPanel({ gid, graph, loading, error, retry, onSelect, onClear, cluster, clusterLoading, clusterError, clusterRetry, clusterId, closeCluster }: Props) {
  const [settings, setSettings] = useState(defaultGraphSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mode, setMode] = useState('global')
  const [view, setView] = useState('graph')
  const [hops, setHops] = useState<1|2|3|4>(1)
  const [direction, setDirection] = useState<'both'|'incoming'|'outgoing'>('both')
  const [trace, setTrace] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [resetRequest, setResetRequest] = useState(0)
  const [page, setPage] = useState(0)
  const { priority, minVolume, roles, cluster: clusterFilter, depths, seeds, seedNetwork, hideIsolated, topN } = settings
  const filtered = useMemo(() => graph ? filterGraph(graph, {
    priority, minVolume, roles, cluster: clusterFilter, depths, seeds, seedNetwork, hideIsolated, topN,
  }) : undefined, [graph, priority, minVolume, roles, clusterFilter, depths, seeds, seedNetwork, hideIsolated, topN])
  const visible = useMemo(() => {
    if (!filtered || !gid || mode !== 'local') return filtered
    const local = neighborhood(filtered,gid,hops,direction)
    return {...filtered,nodes:filtered.nodes.filter(n=>local.nodeIds.has(n.gid)),links:filtered.links.filter(l=>local.linkIds.has(`${l.source}->${l.target}`))}
  },[filtered,gid,mode,hops,direction])
  const clusters = useMemo(()=>[...new Set(graph?.nodes.map(n=>n.cluster_id)??[])].sort((a,b)=>a-b),[graph])
  const maxVolume = useMemo(()=>Math.max(0,...(graph?.nodes.map(n=>nodeVolume(n)??0)??[])),[graph])
  const riskCount = graph?.nodes.filter(n=>n.risk_score!=null).length??0
  const metricLabel = riskCount===0?'Приоритет проверки':riskCount===graph?.nodes.length?'Риск сети':'Риск / приоритет'
  const sortedLinks = useMemo(()=>[...(visible?.links??[])].sort((a,b)=>b.sum_kzt-a.sum_kzt),[visible])
  const currentPage = Math.min(page,Math.max(0,Math.ceil(sortedLinks.length/100)-1))
  const resetFilters = () => setSettings(defaultGraphSettings)
  const clearSelection = () => {onClear();setTrace(false);setMode('global')}
  return <section className="graph-panel panel aml-panel" aria-label="Граф связей">
    <header className="panel-heading"><div className="flex items-center gap-2"><Network className="size-4" /><h2>Сеть денежных потоков</h2></div><div className="flex items-center gap-2"><Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="graph">Граф</TabsTrigger><TabsTrigger value="table">Переводы</TabsTrigger></TabsList></Tabs><Button variant={settingsOpen?'secondary':'ghost'} size="icon-sm" aria-label="Настройки графа" aria-expanded={settingsOpen} aria-controls="graph-settings" onClick={()=>setSettingsOpen(v=>!v)}><SlidersHorizontal /></Button></div></header>
    <div className="aml-toolbar"><ToggleGroup type="single" value={mode} onValueChange={v=>v&&setMode(v)} size="sm" variant="outline" aria-label="Режим графа"><ToggleGroupItem value="global">{graph?.scope==='neighborhood'?'Загруженный граф':'Вся сеть'}</ToggleGroupItem><ToggleGroupItem value="local" disabled={!gid}>Локальный</ToggleGroupItem></ToggleGroup><div className="flex items-center gap-1"><Button variant="ghost" size="sm" disabled={!gid} onClick={()=>setFocusRequest(v=>v+1)}><Focus data-icon="inline-start" />Фокус</Button><Button variant={trace?'secondary':'ghost'} size="sm" disabled={!gid} aria-pressed={trace} onClick={()=>setTrace(v=>!v)}><Route data-icon="inline-start" />Trace Flow</Button><Button variant="ghost" size="icon-sm" disabled={!gid} aria-label="Снять выбор клиента" onClick={clearSelection}><X /></Button></div></div>
    {(mode==='local'||trace) && <div className="aml-local-controls"><span>Шаги</span><ToggleGroup type="single" size="sm" value={String(hops)} onValueChange={v=>v&&setHops(Number(v) as 1|2|3|4)} aria-label="Глубина локального графа">{[1,2,3,4].map(n=><ToggleGroupItem value={String(n)} key={n}>{n}</ToggleGroupItem>)}</ToggleGroup><ToggleGroup type="single" size="sm" value={direction} onValueChange={v=>v&&setDirection(v as typeof direction)} aria-label="Направление обхода"><ToggleGroupItem value="both">Оба</ToggleGroupItem><ToggleGroupItem value="incoming">Входящие</ToggleGroupItem><ToggleGroupItem value="outgoing">Исходящие</ToggleGroupItem></ToggleGroup>{trace&&<Badge variant="outline">Трассировка</Badge>}</div>}
    {graph?.scope==='neighborhood' && <div className="aml-coverage" role="status">Доступно только загруженное окружение API (до 2 шагов, {graph.coverage.limit} узлов). Обход 3–4 шагов не расширяет выборку. Оценки и объёмы могут быть неизвестны.</div>}
    {riskCount>0&&riskCount!==graph?.nodes.length&&<div className="aml-coverage">Цвет: риск сети, где он предоставлен; иначе — приоритет проверки.</div>}
    {gid&&visible&&!visible.nodes.some(n=>n.gid===gid)&&<div className="aml-coverage">Выбранный клиент скрыт фильтрами. <Button variant="link" size="sm" onClick={resetFilters}>Сбросить фильтры</Button></div>}
    <div className="aml-surface">
      {loading?<LoadingPanel />:error?<ErrorPanel error={error} retry={retry}/>:!graph?<EmptyPanel title="Выберите клиента" description="Найдите GID или выберите приоритет слева, чтобы загрузить доступное окружение API."/>:!visible?.nodes.length?<div className="aml-empty"><EmptyPanel title="Нет совпадений" description="Измените фильтры или сбросьте их, чтобы увидеть сеть."/><Button variant="outline" onClick={resetFilters}>Сбросить фильтры</Button></div>:view==='graph'?<AMLGraph data={visible} selected={gid} onSelect={id=>{onSelect(id);setFocusRequest(v=>v+1)}} onClear={clearSelection} settings={settings} trace={trace&&!!gid} hops={hops} direction={direction} focusRequest={focusRequest} resetRequest={resetRequest}/>:<ScrollArea className="min-h-0 flex-1"><div className="aml-transfers"><div className="flex items-center justify-between gap-2 p-3"><span>{sortedLinks.length} загруженных переводов</span><Button variant="outline" size="sm" disabled={!sortedLinks.length} onClick={()=>downloadCsv('observed-transfers.csv',['src','dst','sum_kzt','n_tx'],sortedLinks.map(l=>[l.source,l.target,l.sum_kzt,l.n_tx]))}><Download data-icon="inline-start"/>CSV</Button></div>{!sortedLinks.length?<EmptyPanel title="Нет наблюдаемых связей" description="Отсутствие переводов в выборке не доказывает отсутствие активности."/>:<Table><TableHeader><TableRow><TableHead>Отправитель → получатель</TableHead><TableHead>Сумма, KZT</TableHead><TableHead>Переводов</TableHead></TableRow></TableHeader><TableBody>{sortedLinks.slice(currentPage*100,(currentPage+1)*100).map(l=><TableRow key={`${l.source}->${l.target}`}><TableCell><div className="transfer-clients"><Button variant="link" size="sm" onClick={()=>onSelect(l.source)}>{l.source}</Button><span>↓</span><Button variant="link" size="sm" onClick={()=>onSelect(l.target)}>{l.target}</Button></div></TableCell><TableCell>{amount(l.sum_kzt)}</TableCell><TableCell>{l.n_tx??'Нет данных'}</TableCell></TableRow>)}</TableBody></Table>}<div className="flex items-center justify-between gap-2 p-3"><Button variant="outline" size="sm" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Назад</Button><span>Страница {currentPage+1} / {Math.max(1,Math.ceil(sortedLinks.length/100))}</span><Button variant="outline" size="sm" disabled={(currentPage+1)*100>=sortedLinks.length} onClick={()=>setPage(currentPage+1)}>Далее</Button></div></div></ScrollArea>}
      {settingsOpen&&<aside id="graph-settings" className="aml-settings" aria-label="Настройки графа"><div className="aml-settings-heading"><h3>Настройки графа</h3><Button variant="ghost" size="icon-sm" aria-label="Закрыть настройки графа" onClick={()=>setSettingsOpen(false)}><X/></Button></div><GraphSettingsPanel settings={settings} onChange={setSettings} clusters={clusters} maxVolume={maxVolume} metricLabel={metricLabel} onResetLayout={()=>setResetRequest(v=>v+1)}/></aside>}
      {clusterId!==null&&<div className="aml-cluster-summary"><Button variant="ghost" size="sm" onClick={closeCluster}><ArrowLeft data-icon="inline-start"/>К графу</Button>{clusterLoading?<LoadingPanel/>:clusterError?<ErrorPanel error={clusterError} retry={clusterRetry}/>:cluster&&<Card><CardHeader><CardTitle>Кластер {cluster.cluster_id}</CardTitle></CardHeader><CardContent><p>{cluster.n_nodes} клиентов · {cluster.n_seed} исходных</p><p>{money(cluster.sum_kzt_internal)} внутри сообщества</p><p className="my-3">{cluster.hypothesis}</p><p>Связность — основание для проверки, не доказательство общей деятельности.</p><div className="mt-3 flex flex-col items-start">{cluster.top_gids.map(id=><Button variant="link" key={id} onClick={()=>onSelect(id)}>{id}</Button>)}</div></CardContent></Card>}</div>}
    </div>
    {visible&&<div className="aml-legend"><div className="aml-color-legend">{settings.colorBy==='risk'?<><strong>{metricLabel}</strong><div className="aml-gradient"/><div className="aml-gradient-labels"><span>Низкий наблюдаемый сигнал</span><span>Высокий приоритет</span></div></>:settings.colorBy==='role'?<><strong>Гипотезы ролей</strong><div className="aml-categories">{Object.entries(roleColors).map(([role,color])=><span key={role}><i style={{background:color}}/>{roleLabels[role as keyof typeof roleLabels]}</span>)}</div></>:<><strong>Сообщества</strong><div className="aml-categories">{clusters.map(id=><span key={id}><i style={{background:clusterColor(id)}}/>#{id}</span>)}</div></>}</div><div className="aml-symbol-legend"><span>◎ Исходный клиент · → Направление</span><span>Размер узла = наблюдаемый объём*</span><span>Толщина связи = сумма переводов</span><small>*Если объём неизвестен — приоритет; серый = нет оценки.</small></div></div>}
    <div className="graph-bottom" aria-live="polite"><span>{visible?.nodes.length??0} / {graph?.nodes.length??0} клиентов · {visible?.links.length??0} связей</span><span>{graph?.scope==='demo'?'Синтетический набор':'Наблюдаемая выборка'} · глубина данных 0–4</span></div>
    {graph?.coverage.truncated&&<Alert><AlertDescription>Окружение усечено: получено {graph.nodes.length} из {graph.coverage.total_nodes??'неизвестного числа'} узлов. Видимые связи не исчерпывают сеть.</AlertDescription></Alert>}
  </section>
}
