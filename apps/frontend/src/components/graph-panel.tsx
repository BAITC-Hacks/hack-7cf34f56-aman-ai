import { useMemo, useState, type CSSProperties } from 'react'
import { ReactFlow, Background, Controls, MarkerType, Position, Handle, type NodeProps, type Node, type ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Focus, Network, MoveUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { RoleBadge, LoadingPanel, ErrorPanel, EmptyPanel } from './shared'
import { amount, compact, shortGid, roleLabels } from '@/lib/format'
import { roles, type Role, type Subgraph, type Cluster } from '@/lib/contracts'
import { cn } from '@/lib/utils'

type GraphNode = Node<{ gid: string; role: Role; cluster: number; seed: boolean; boundary: boolean; colorMode: string }, 'client'>
function ClientNode({ data, selected }: NodeProps<GraphNode>) {
  return <div className={cn('client-node', selected && 'client-selected', data.seed && 'client-seed', data.boundary && 'client-boundary')} data-role={data.role} style={data.colorMode === 'cluster' ? { '--node-color': `var(--cluster-${data.cluster % 6})` } as CSSProperties : undefined}>
    <Handle type="target" position={Position.Left} isConnectable={false} /><div className="client-node-top"><span>{data.seed ? 'SEED' : data.boundary ? 'ГЛУБИНА 4' : 'КЛИЕНТ'}</span><span className="node-marker" /></div><strong>{shortGid(data.gid)}</strong><span className="client-node-role">{data.colorMode === 'role' ? roleLabels[data.role] : `Кластер ${data.cluster}`}</span><Handle type="source" position={Position.Right} isConnectable={false} />
  </div>
}
const nodeTypes = { client: ClientNode }
type Props = { gid: string | null; graph?: Subgraph; loading: boolean; error?: string; retry: () => void; hop: 1 | 2; onHop: (hop: 1 | 2) => void; onSelect: (gid: string) => void; cluster?: Cluster; clusterLoading: boolean; clusterError?: string; clusterRetry: () => void; clusterId: number | null; closeCluster: () => void }
export function GraphPanel({ gid, graph, loading, error, retry, hop, onHop, onSelect, cluster, clusterLoading, clusterError, clusterRetry, clusterId, closeCluster }: Props) {
  const [colorMode, setColorMode] = useState('role')
  const [flow, setFlow] = useState<ReactFlowInstance<GraphNode> | null>(null)
  const elements = useMemo(() => {
    if (!graph || !gid) return { nodes: [], edges: [] }
    const others = graph.nodes.filter(n => n.gid !== gid).sort((a, b) => a.gid.localeCompare(b.gid))
    return { nodes: graph.nodes.map(n => {
      const index = others.findIndex(o => o.gid === n.gid)
      const angle = (index / Math.max(others.length, 1)) * Math.PI * 2 - Math.PI / 2
      const radius = others.length > 12 ? 450 : 310
      return { id: n.gid, type: 'client' as const, selected: n.gid === gid, ariaLabel: `Клиент ${n.gid}, ${roleLabels[n.role]}`, position: n.gid === gid ? { x: 0, y: 0 } : { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }, data: { gid: n.gid, role: n.role, cluster: n.cluster_id, seed: n.is_seed, boundary: n.depth === 4, colorMode } }
    }), edges: graph.edges.map(e => ({ id: `${e.src}-${e.dst}`, source: e.src, target: e.dst, type: 'default', markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: 'var(--graph-edge)' }, label: `${compact(e.sum_kzt)} ₸`, ariaLabel: `${e.src} → ${e.dst}: ${amount(e.sum_kzt)} KZT, ${e.n_tx ?? 'неизвестно'} переводов`, style: { stroke: 'var(--graph-edge)', strokeWidth: Math.min(3, 1 + Math.log1p(e.sum_kzt) / 12) }, labelStyle: { fill: 'var(--muted-foreground)', fontSize: 10 }, labelBgStyle: { fill: 'var(--card)', fillOpacity: .92 } })) }
  }, [graph, gid, colorMode])
  return <section className="graph-panel panel" aria-label="Граф связей">
    <header className="panel-heading"><div className="flex items-center gap-2"><Network className="size-4" /><h2>{clusterId !== null ? `Кластер ${clusterId}` : 'Карта связей'}</h2></div><span className="subtle">Направленный граф</span></header>
    {clusterId !== null ? <div className="cluster-view"><Button variant="ghost" onClick={closeCluster}><ArrowLeft data-icon="inline-start" />К связям клиента</Button>{clusterLoading ? <LoadingPanel /> : clusterError ? <ErrorPanel error={clusterError} retry={clusterRetry} /> : cluster && <Card><CardHeader><CardDescription>СООБЩЕСТВО В СЕТИ</CardDescription><CardTitle>Кластер {cluster.cluster_id}</CardTitle></CardHeader><CardContent><div className="cluster-metrics"><div><strong>{cluster.n_nodes}</strong><span>клиентов</span></div><div><strong>{cluster.n_seed}</strong><span>seed в кластере</span></div><div><strong>{amount(cluster.sum_kzt_internal)}</strong><span>KZT внутри кластера</span></div></div><p className="mt-5 text-sm leading-relaxed">{cluster.hypothesis}</p></CardContent><CardFooter className="flex-col items-start gap-2"><p className="subtle">Ключевые клиенты</p>{cluster.top_gids.map(id => <Button variant="link" key={id} onClick={() => onSelect(id)}><span className="font-mono">{id}</span><MoveUpRight data-icon="inline-end" /></Button>)}</CardFooter></Card>}</div> : <>
      <div className="graph-toolbar"><ToggleGroup type="single" value={String(hop)} onValueChange={v => v && onHop(v === '2' ? 2 : 1)} variant="outline" size="sm" spacing={0} disabled={!gid} aria-label="Глубина связей"><ToggleGroupItem value="1">1 шаг</ToggleGroupItem><ToggleGroupItem value="2">2 шага</ToggleGroupItem></ToggleGroup><ToggleGroup type="single" value={colorMode} onValueChange={v => v && setColorMode(v)} size="sm" aria-label="Раскраска графа"><ToggleGroupItem value="role">Роли</ToggleGroupItem><ToggleGroupItem value="cluster">Кластеры</ToggleGroupItem></ToggleGroup><Button variant="ghost" size="icon-sm" aria-label="Вписать граф" disabled={!gid} onClick={() => flow?.fitView({ padding: .2, duration: 0 })}><Focus /></Button></div>
      <div className="graph-canvas">
        {!gid ? <div className="graph-welcome"><div className="welcome-orbit" aria-hidden="true"><Network /></div><div className="eyebrow">ОТ СВЯЗЕЙ К ПОНИМАНИЮ</div><h2>Проследите движение денег</h2><p>Начните с клиента в списке приоритетов<br />или найдите его по идентификатору.</p><div className="welcome-steps"><span><span>01</span>Выберите клиента</span><span><span>02</span>Изучите связи</span><span><span>03</span>Проверьте гипотезу</span></div></div> : loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={retry} /> : graph && graph.nodes.length ? <><ReactFlow<GraphNode> key={`${gid}-${hop}`} nodes={elements.nodes} edges={elements.edges} nodeTypes={nodeTypes} onInit={setFlow} onNodeClick={(_, n) => onSelect(n.id)} fitView fitViewOptions={{ padding: .2 }} nodesDraggable={false} nodesConnectable={false} edgesReconnectable={false} deleteKeyCode={null} minZoom={.15} maxZoom={2} aria-label="Локальный граф клиента"><Background gap={22} size={1} color="var(--graph-dot)" /><Controls showInteractive={false} /></ReactFlow>{!graph.edges.length && <div className="isolated-note"><Badge variant="secondary">Нет наблюдаемых связей</Badge></div>}</> : <EmptyPanel title="Граф недоступен" description="В ответе нет узлов для выбранного клиента." />}
      </div>
      {graph?.coverage.truncated && <Alert><AlertDescription>Частичный граф: показано {graph.nodes.length} из {graph.coverage.total_nodes ?? 'неизвестного числа'} узлов. Выберите 1 шаг для более узкого обзора.</AlertDescription></Alert>}
      <div className="graph-legend">{colorMode === 'role' ? roles.map(r => <RoleBadge key={r} role={r} />) : [...new Set(graph?.nodes.map(n => n.cluster_id) || [])].map(id => <Badge variant="outline" key={id}><span className="cluster-dot" style={{ background: `var(--cluster-${id % 6})` }} />Кластер {id}</Badge>)}</div>
      <div className="graph-bottom"><span>{gid && graph ? `${graph.nodes.length} узлов · ${graph.edges.length} связей` : 'Локальный обзор · до 250 узлов'}</span><span>→ перевод · пунктир: глубина 4</span></div>
    </>}
  </section>
}
