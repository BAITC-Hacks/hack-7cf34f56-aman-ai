import { useMemo, useState } from 'react'
import { Network, Focus, X, SlidersHorizontal, Download, ArrowLeft, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { ErrorPanel, LoadingPanel, EmptyPanel } from './shared'
import { AMLGraph, type GraphViewportInsets } from './AMLGraph'
import { clusterColor, roleColors, money } from '@/lib/graph-presentation'
import { GraphSettingsPanel } from './graph-settings'
import { activeGraphFilterCount, applyGraphPreset, defaultGraphSettings, filterGraph } from '@/lib/graph-settings'
import { type AMLGraphData, nodeVolume, neighborhood } from '@/lib/graph-adapter'
import { roleLabels, amount } from '@/lib/format'
import { downloadCsv } from '@/lib/export'
import type { Cluster } from '@/lib/contracts'

type Props = { gid: string | null; graph?: AMLGraphData; loading: boolean; error?: string; retry: () => void; onSelect: (gid: string) => void; onClear: () => void; cluster?: Cluster; clusterLoading: boolean; clusterError?: string; clusterRetry: () => void; clusterId: number | null; closeCluster: () => void; onBack?: () => void; canGoBack?: boolean; viewportInsets?: GraphViewportInsets; settingsOpen?: boolean; onSettingsOpenChange?: (open: boolean) => void }
export function GraphPanel({ gid, graph, loading, error, retry, onSelect, onClear, cluster, clusterLoading, clusterError, clusterRetry, clusterId, closeCluster, onBack, canGoBack = false, viewportInsets, settingsOpen: controlledSettingsOpen, onSettingsOpenChange }: Props) {
  const [settings, setSettings] = useState(defaultGraphSettings)
  const [internalSettingsOpen, setInternalSettingsOpen] = useState(false)
  const settingsOpen = controlledSettingsOpen ?? internalSettingsOpen
  const setSettingsOpen = (open: boolean) => { setInternalSettingsOpen(open); onSettingsOpenChange?.(open) }
  const [view, setView] = useState('graph')
  const [navigation, setNavigation] = useState<{ gid: string | null; hops: 1|2|3|4; direction: 'both'|'incoming'|'outgoing' }>({ gid: null, hops: 1, direction: 'both' })
  const currentNavigation = navigation.gid === gid ? navigation : { gid, hops: 1 as const, direction: 'both' as const }
  if (navigation.gid !== gid) setNavigation(currentNavigation)
  const { hops, direction } = currentNavigation
  const [legendOpen, setLegendOpen] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const [resetRequest, setResetRequest] = useState(0)
  const [page, setPage] = useState(0)
  const { priority, minVolume, roles, cluster: clusterFilter, depths, seeds, seedNetwork, hideIsolated, topN } = settings
  const filtered = useMemo(() => graph ? filterGraph(graph, {
    priority, minVolume, roles, cluster: clusterFilter, depths, seeds, seedNetwork, hideIsolated, topN,
  }) : undefined, [graph, priority, minVolume, roles, clusterFilter, depths, seeds, seedNetwork, hideIsolated, topN])
  const visible = useMemo(() => {
    if (!filtered || !gid) return filtered
    const local = neighborhood(filtered,gid,hops,direction)
    return {...filtered,nodes:filtered.nodes.filter(n=>local.nodeIds.has(n.gid)),links:filtered.links.filter(l=>local.linkIds.has(`${l.source}->${l.target}`))}
  },[filtered,gid,hops,direction])
  const clusters = useMemo(()=>[...new Set(graph?.nodes.map(n=>n.cluster_id).filter((id): id is number => id !== null)??[])].sort((a,b)=>a-b),[graph])
  const maxVolume = useMemo(()=>Math.max(0,...(graph?.nodes.map(n=>nodeVolume(n)??0)??[])),[graph])
  const riskCount = graph?.nodes.filter(n=>n.risk_score!=null).length??0
  const metricLabel = riskCount===0?'Приоритет проверки':riskCount===graph?.nodes.length?'Оценка риска':'Риск / приоритет'
  const sortedLinks = useMemo(()=>[...(visible?.links??[])].sort((a,b)=>b.sum_kzt-a.sum_kzt),[visible])
  const currentPage = Math.min(page,Math.max(0,Math.ceil(sortedLinks.length/100)-1))
  const resetFilters = () => setSettings(current => applyGraphPreset(current, 'all', maxVolume))
  const clearSelection = () => { onClear(); setFocusRequest(value => value + 1) }
  const showAll = () => { resetFilters(); clearSelection() }
  const selectNode = (id: string) => { setSettingsOpen(false); onSelect(id); setFocusRequest(value => value + 1) }
  const activeFilters = activeGraphFilterCount(settings)
  return <section className="graph-panel panel aml-panel" data-view={view} data-selected={!!gid} aria-label="Граф связей">
    <header className="panel-heading">
      <div className="flex min-w-0 items-center gap-2"><Network className="size-4" /><h2>Граф переводов</h2></div>
      <div className="flex items-center gap-2">
        <Tabs value={view} onValueChange={setView}><TabsList><TabsTrigger value="graph">Граф</TabsTrigger><TabsTrigger value="table">Переводы</TabsTrigger></TabsList></Tabs>
        <Button variant={settingsOpen ? 'secondary' : 'outline'} size="sm" aria-label="Фильтры графа" aria-expanded={settingsOpen} aria-controls="graph-settings" onClick={() => setSettingsOpen(!settingsOpen)}><SlidersHorizontal data-icon="inline-start" />Фильтры{activeFilters > 0 && <Badge variant="secondary">{activeFilters}</Badge>}</Button>
        {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={resetFilters}>Сбросить</Button>}
      </div>
    </header>
    {graph?.scope==='neighborhood' && <div className="aml-coverage" role="status">Показаны загруженные связи клиента: до {graph.coverage.limit} узлов. Глубина поиска не расширяет доступную выборку; часть оценок и объёмов может отсутствовать.</div>}
    {riskCount>0&&riskCount!==graph?.nodes.length&&<div className="aml-coverage">Цвет показывает оценку риска, если она есть, иначе — приоритет проверки. Это разные показатели.</div>}
    {gid&&visible&&!visible.nodes.some(n=>n.gid===gid)&&<div className="aml-coverage">Выбранный клиент скрыт фильтрами. <Button variant="link" size="sm" onClick={resetFilters}>Сбросить фильтры</Button></div>}
    <div className="aml-surface">
      {gid && <div className="aml-selection-toolbar" aria-label="Исследование выбранного клиента">
        <div className="aml-selection-heading">
          {onBack && <Button variant="ghost" size="icon-sm" disabled={!canGoBack} aria-label="Предыдущий клиент" onClick={onBack}><ArrowLeft /></Button>}
          <strong className="truncate" title={`GID ${gid}`}>GID {gid}</strong>
          <Button variant="ghost" size="icon-sm" aria-label="Снять выбор клиента" onClick={clearSelection}><X /></Button>
        </div>
        <div className="aml-selection-actions">
          <Button variant="outline" size="sm" onClick={showAll}><Network data-icon="inline-start" />{graph?.scope === 'neighborhood' ? 'Загруженная выборка' : 'Вся выборка'}</Button>
          <Button variant="outline" size="sm" onClick={() => setFocusRequest(value => value + 1)}><Focus data-icon="inline-start" />В центре</Button>
          <span>Рядом: {Math.max(0, (visible?.nodes.length ?? 0) - (visible?.nodes.some(node => node.gid === gid) ? 1 : 0))}</span>
        </div>
        <div className="aml-neighborhood-controls">
          <ToggleGroup type="single" size="sm" variant="outline" value={direction} onValueChange={value => value && setNavigation({ ...currentNavigation, direction: value as typeof direction })} aria-label="Направление связей клиента">
            <ToggleGroupItem value="incoming" title="Кто переводит клиенту">Входящие</ToggleGroupItem><ToggleGroupItem value="outgoing" title="Кому переводит клиент">Исходящие</ToggleGroupItem><ToggleGroupItem value="both">Все связи</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center gap-2"><span>Шагов от клиента</span><ToggleGroup type="single" size="sm" variant="outline" value={String(hops)} onValueChange={value => value && setNavigation({ ...currentNavigation, hops: Number(value) as 1|2|3|4 })} aria-label="Число шагов от выбранного клиента">{[1,2,3,4].map(value => <ToggleGroupItem value={String(value)} key={value}>{value}</ToggleGroupItem>)}</ToggleGroup></div>
        </div>
        <p>1 шаг — прямые переводы. Нажмите на соседа, чтобы перейти к нему.</p>
      </div>}
      {loading?<LoadingPanel />:error?<ErrorPanel error={error} retry={retry}/>:!graph?<EmptyPanel title="Выберите клиента" description="Найдите GID или выберите клиента в списке приоритетов, чтобы увидеть его связи."/>:!visible?.nodes.length?<div className="aml-empty"><EmptyPanel title="Нет совпадений" description="Измените фильтры или сбросьте их, чтобы увидеть сеть."/><Button variant="outline" onClick={resetFilters}>Сбросить фильтры</Button></div>:view==='graph'?<AMLGraph data={visible} selected={gid} onSelect={selectNode} onClear={clearSelection} settings={settings} trace={false} hops={hops} direction={direction} focusRequest={focusRequest} resetRequest={resetRequest} viewportInsets={viewportInsets}/>:<ScrollArea className="min-h-0 flex-1"><div className="aml-transfers"><div className="flex items-center justify-between gap-2 p-3"><span>Связей между клиентами: {sortedLinks.length}</span><Button variant="outline" size="sm" disabled={!sortedLinks.length} onClick={()=>downloadCsv('observed-transfers.csv',['src','dst','sum_kzt','n_tx'],sortedLinks.map(l=>[l.source,l.target,l.sum_kzt,l.n_tx]))}><Download data-icon="inline-start"/>CSV</Button></div>{!sortedLinks.length?<EmptyPanel title="Нет наблюдаемых связей" description="Отсутствие переводов в выборке не доказывает отсутствие активности."/>:<Table><TableHeader><TableRow><TableHead>Отправитель → получатель</TableHead><TableHead>Сумма, KZT</TableHead><TableHead>Переводов</TableHead></TableRow></TableHeader><TableBody>{sortedLinks.slice(currentPage*100,(currentPage+1)*100).map(l=><TableRow key={`${l.source}->${l.target}`}><TableCell><div className="transfer-clients"><Button variant="link" size="sm" onClick={()=>selectNode(l.source)}>{l.source}</Button><span>↓</span><Button variant="link" size="sm" onClick={()=>selectNode(l.target)}>{l.target}</Button></div></TableCell><TableCell>{amount(l.sum_kzt)}</TableCell><TableCell>{l.n_tx??'Нет данных'}</TableCell></TableRow>)}</TableBody></Table>}<div className="flex items-center justify-between gap-2 p-3"><Button variant="outline" size="sm" disabled={!currentPage} onClick={()=>setPage(currentPage-1)}>Назад</Button><span>Страница {currentPage+1} / {Math.max(1,Math.ceil(sortedLinks.length/100))}</span><Button variant="outline" size="sm" disabled={(currentPage+1)*100>=sortedLinks.length} onClick={()=>setPage(currentPage+1)}>Далее</Button></div></div></ScrollArea>}
      {settingsOpen&&<aside id="graph-settings" className="aml-settings" aria-label="Фильтры графа"><div className="aml-settings-heading"><h3>Фильтры и отображение</h3><Button variant="ghost" size="icon-sm" aria-label="Закрыть фильтры графа" onClick={()=>setSettingsOpen(false)}><X/></Button></div><GraphSettingsPanel settings={settings} onChange={setSettings} clusters={clusters} maxVolume={maxVolume} metricLabel={metricLabel} onResetLayout={()=>setResetRequest(v=>v+1)}/></aside>}
      {clusterId!==null&&<div className="aml-cluster-summary"><Button variant="ghost" size="sm" onClick={closeCluster}><ArrowLeft data-icon="inline-start"/>К графу</Button>{clusterLoading?<LoadingPanel/>:clusterError?<ErrorPanel error={clusterError} retry={clusterRetry}/>:cluster&&<Card><CardHeader><CardTitle>Кластер {cluster.cluster_id}</CardTitle></CardHeader><CardContent><p>{cluster.n_nodes} клиентов · {cluster.n_seed} исходных</p><p>{money(cluster.sum_kzt_internal)} внутри сообщества</p><p className="my-3">{cluster.hypothesis}</p><p>Связность — основание для проверки, не доказательство общей деятельности.</p><div className="mt-3 flex flex-col items-start">{cluster.top_gids.map(id=><Button variant="link" key={id} onClick={()=>selectNode(id)}>{id}</Button>)}</div></CardContent></Card>}</div>}
    </div>
    {visible&&<div className="aml-legend"><Button variant="ghost" size="sm" aria-expanded={legendOpen} aria-controls="graph-legend-content" onClick={() => setLegendOpen(value => !value)}><Info data-icon="inline-start" />Как читать граф</Button>{legendOpen && <div id="graph-legend-content" className="aml-legend-content"><div className="aml-color-legend">{settings.colorBy==='risk'?<><strong>{metricLabel}</strong><div className="aml-gradient"/><div className="aml-gradient-labels"><span>0 · низкая оценка</span><span>100 · высокая оценка</span></div></>:settings.colorBy==='role'?<><strong>Гипотезы ролей</strong><div className="aml-categories">{Object.entries(roleColors).map(([role,color])=><span key={role}><i style={{background:color}}/>{roleLabels[role as keyof typeof roleLabels]}</span>)}</div></>:<><strong>Сообщества</strong><div className="aml-categories">{clusters.map(id=><span key={id}><i style={{background:clusterColor(id)}}/>#{id}</span>)}</div></>}</div><div className="aml-symbol-legend"><span>◎ Исходный клиент · → Направление</span><span>Размер узла = наблюдаемый объём*</span><span>Толщина связи = сумма переводов</span><small>*Если объём неизвестен — приоритет; серый = нет оценки.</small></div></div>}</div>}
    <div className="graph-bottom" aria-live="polite"><span>Показано {visible?.nodes.length??0} из {graph?.nodes.length??0} клиентов · {visible?.links.length??0} связей</span><span>{graph?.scope==='demo'?'Демонстрационные данные':graph?.scope==='dataset'?'Данные проекта':graph?.scope==='upload'?'Загруженный CSV':'Наблюдаемая выборка'}</span></div>
    {graph?.coverage.truncated&&<Alert><AlertDescription>Окружение усечено: получено {graph.nodes.length} из {graph.coverage.total_nodes??'неизвестного числа'} узлов. Видимые связи не исчерпывают сеть.</AlertDescription></Alert>}
  </section>
}
