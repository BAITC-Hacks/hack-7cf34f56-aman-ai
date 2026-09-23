import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import { Minus, Plus, Maximize } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type AMLGraphData, type AMLGraphNode, nodeVolume, nodeScore, priorityColor, logScale, neighborhood } from '@/lib/graph-adapter'
import type { GraphSettings } from '@/lib/graph-settings'
import { roleLabels } from '@/lib/format'

import { roleColors, clusterColor, money } from '@/lib/graph-presentation'

type SimNode = NodeObject<AMLGraphNode>
type SimLink = LinkObject<SimNode, { sum_kzt: number; n_tx: number | null; key: string; reciprocal: boolean }>
type Props = { data: AMLGraphData; selected: string | null; onSelect: (gid: string) => void; onClear: () => void; settings: GraphSettings; trace: boolean; hops: 1 | 2 | 3 | 4; direction: 'both' | 'incoming' | 'outgoing'; focusRequest: number; resetRequest: number }
const endpointId = (node: SimLink['source']) => typeof node === 'object' ? node.gid : String(node)
const selectedDuration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500

/** Canvas renderer consumes only normalized graph data. Simulation mutates private copies. */
export function AMLGraph({ data, selected, onSelect, onClear, settings, trace, hops, direction, focusRequest, resetRequest }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const graph = useRef<ForceGraphMethods<SimNode, SimLink> | undefined>(undefined)
  const positions = useRef(new Map<string, SimNode>())
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [hover, setHover] = useState<SimNode | null>(null)
  const [hoverLink, setHoverLink] = useState<SimLink | null>(null)
  const [settled, setSettled] = useState(false)
  const fitted = useRef(false)
  const processedReset = useRef(0)
  const reducedMotion = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches)
  // The Canvas engine owns mutable simulation objects; the cache preserves positions across filters.
  /* oxlint-disable react/refs */
  const sim = useMemo(() => {
    const clusters = [...new Set(data.nodes.map(n => n.cluster_id))].sort((a,b) => a-b)
    const counts = new Map<number, number>()
    const pairs = new Set(data.links.map(l => `${l.source}->${l.target}`))
    return {
      nodes: data.nodes.map(n => {
        const previous = positions.current.get(n.gid)
        if (previous) { Object.assign(previous, n); return previous }
        const index = counts.get(n.cluster_id) ?? 0; counts.set(n.cluster_id, index + 1)
        const angle = clusters.indexOf(n.cluster_id) / clusters.length * Math.PI * 2
        const clusterRadius = data.nodes.length > 100 ? 550 : 120
        const spread = Math.sqrt(index) * 18
        const result: SimNode = { ...n, x: Math.cos(angle) * clusterRadius + Math.cos(index * 2.4) * spread, y: Math.sin(angle) * clusterRadius + Math.sin(index * 2.4) * spread }
        positions.current.set(n.gid, result); return result
      }),
      links: data.links.map(l => ({ ...l, key: `${l.source}->${l.target}`, reciprocal: pairs.has(`${l.target}->${l.source}`) })),
    }
  }, [data])
  /* oxlint-enable react/refs */
  const maxima = useMemo(() => ({ volume: Math.max(1, ...data.nodes.map(n => nodeVolume(n) ?? 0)), amount: Math.max(1, ...data.links.map(l => l.sum_kzt)) }), [data])
  const highlighted = useMemo(() => {
    const active = hover?.gid ?? selected
    return active && data.nodes.some(n=>n.gid===active) ? neighborhood(data, active, trace && !hover ? hops : 1, trace && !hover ? direction : 'both') : null
  }, [data, selected, hover, trace, hops, direction])
  const prominent = useMemo(() => new Set([...data.nodes].sort((a,b) => (nodeScore(b) ?? -1)-(nodeScore(a) ?? -1)).slice(0, 8).map(n=>n.gid)),[data])
  const radius = useCallback((n: AMLGraphNode) => {
    const volume = nodeVolume(n)
    return (volume === null ? 3 + (n.priority_score ?? 0) * 8 : logScale(volume, maxima.volume, 3, 17)) * settings.nodeScale
  }, [maxima.volume, settings.nodeScale])
  const color = useCallback((n: AMLGraphNode) => settings.colorBy === 'role' ? roleColors[n.role] : settings.colorBy === 'cluster' ? clusterColor(n.cluster_id) : priorityColor(nodeScore(n)), [settings.colorBy])
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      if (width && height) setSize({ width: Math.floor(width), height: Math.floor(height) })
    })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const fg = graph.current
    if (!fg) return
    fg.d3Force('charge')?.strength(-settings.repulsion).distanceMax(500)
    fg.d3Force('link')?.distance(settings.linkDistance).strength(settings.linkForce)
    // A weak, stable community attraction keeps the overview from collapsing into one knot.
    const clusterIds = [...new Set(data.nodes.map(n=>n.cluster_id))].sort((a,b)=>a-b)
    const anchors = new Map(clusterIds.map((id,i) => [id, {x: Math.cos(i / clusterIds.length * Math.PI * 2) * (data.nodes.length > 100 ? 550 : 100), y: Math.sin(i / clusterIds.length * Math.PI * 2) * (data.nodes.length > 100 ? 550 : 100)}]))
    let nodes: SimNode[] = []
    const communityForce = (alpha: number) => { for (const n of nodes) { const anchor=anchors.get(n.cluster_id); if (!anchor) continue; n.vx=(n.vx??0)+(anchor.x-(n.x??0))*settings.centerForce*alpha; n.vy=(n.vy??0)+(anchor.y-(n.y??0))*settings.centerForce*alpha } }
    communityForce.initialize = (value: SimNode[]) => { nodes=value }
    fg.d3Force('community', communityForce)
    // D3 nodes are private mutable copies, never React/API data.
    // oxlint-disable-next-line react/immutability
    if (resetRequest !== processedReset.current) { processedReset.current=resetRequest; for (const n of sim.nodes) { n.fx=undefined; n.fy=undefined }; fitted.current=false }
    setHover(null); setHoverLink(null); setSettled(false); fg.d3ReheatSimulation()
  }, [data, sim, settings.repulsion, settings.linkDistance, settings.linkForce, settings.centerForce, resetRequest])
  const focus = useCallback(() => {
    const n = sim.nodes.find(n=>n.gid===selected)
    if (n && graph.current && n.x !== undefined && n.y !== undefined) {
      const nearby = neighborhood(data, n.gid, 1, 'both').nodeIds
      let dx=60, dy=60
      for (const other of sim.nodes) if (nearby.has(other.gid)) {
        dx=Math.max(dx,Math.abs((other.x??0)-n.x)+radius(other)+24)
        dy=Math.max(dy,Math.abs((other.y??0)-n.y)+radius(other)+24)
      }
      const scale=Math.max(.1,Math.min(1.6,(size.width-110)/(2*dx),(size.height-90)/(2*dy)))
      graph.current.centerAt(n.x,n.y,selectedDuration()); graph.current.zoom(scale,selectedDuration())
    }
  }, [sim, selected, data, size.width, size.height, radius])
  const latestFocus = useRef(focus)
  useEffect(() => { latestFocus.current=focus }, [focus])
  useEffect(() => { const timer=setTimeout(()=>latestFocus.current(), 160); return () => clearTimeout(timer) }, [selected, sim, focusRequest, size.width, size.height])
  const paintNode = useCallback((n: SimNode, ctx: CanvasRenderingContext2D, scale: number) => {
    const x=n.x??0, y=n.y??0, r=radius(n), isSelected=n.gid===selected, isHover=n.gid===hover?.gid
    const visible = !highlighted || highlighted.nodeIds.has(n.gid)
    ctx.save(); ctx.globalAlpha=visible ? 1 : .14
    const fill=color(n)
    ctx.beginPath(); ctx.arc(x,y,r*(isSelected?1.12:1),0,2*Math.PI)
    if (visible && (isSelected || isHover || ((nodeScore(n)??0)>=.85 && scale>.45))) { ctx.shadowBlur=9; ctx.shadowColor=fill }
    ctx.fillStyle=fill; ctx.fill(); ctx.shadowBlur=0
    if ((n.is_seed && settings.showSeedRings) || isSelected) { ctx.beginPath(); ctx.arc(x,y,r+3/scale,0,2*Math.PI); ctx.strokeStyle=isSelected?'#ffffff':'#fff0bd'; ctx.lineWidth=(isSelected?2:1)/scale;ctx.stroke() }
    const showLabel = isSelected || isHover || (settings.showLabels && ((scale*settings.labelVisibility>1.6) || (prominent.has(n.gid) && scale*settings.labelVisibility>.4)))
    if (showLabel && visible) {
      const text=isSelected||isHover ? n.gid : `…${n.gid.slice(-6)}`
      ctx.font=`${11/scale}px ui-monospace, monospace`; const width=ctx.measureText(text).width
      const labelX=isSelected||isHover?x-width/2:x+r+9/scale
      const labelY=isSelected||isHover?y-r-12/scale:y
      ctx.fillStyle='rgba(9,11,16,.88)'; ctx.fillRect(labelX-4/scale,labelY-9/scale,width+8/scale,18/scale)
      ctx.fillStyle=isSelected||isHover?'#ffffff':'#bfc9d9';ctx.textBaseline='middle';ctx.fillText(text,labelX,labelY)
    }
    ctx.restore()
  }, [radius,color,selected,hover,highlighted,settings.showSeedRings,settings.showLabels,settings.labelVisibility,prominent])
  const activeLink = (link: SimLink) => highlighted?.linkIds.has(link.key) || link.key===hoverLink?.key
  const paintAmount = (link: SimLink, ctx: CanvasRenderingContext2D, scale: number) => {
    if (!settings.showAmounts || (scale < 1.2 && !activeLink(link))) return
    const a=link.source as SimNode, b=link.target as SimNode
    if (!a || !b || a.x===undefined || b.x===undefined || (highlighted&&!activeLink(link))) return
    ctx.save();ctx.font=`${10/scale}px sans-serif`;ctx.fillStyle='#c4cfdf';ctx.fillText(money(link.sum_kzt),(a.x+b.x)/2,((a.y??0)+(b.y??0))/2);ctx.restore()
  }
  return <div className="aml-canvas" ref={container} data-node-count={data.nodes.length} data-link-count={data.links.length} data-reciprocal-count={sim.links.filter(l=>l.reciprocal).length} data-settled={settled} tabIndex={0} role="region" aria-label="Интерактивный граф переводов. Поиск GID и таблица доступны с клавиатуры." onKeyDown={event=>{
    const fg=graph.current;if(!fg)return
    if(event.key==='Escape')onClear()
    else if(event.key==='+'||event.key==='='){event.preventDefault();fg.zoom(fg.zoom()*1.25,150)}
    else if(event.key==='-'){event.preventDefault();fg.zoom(fg.zoom()/1.25,150)}
    else if(event.key.startsWith('Arrow')){event.preventDefault();const p=fg.centerAt();fg.centerAt(p.x+(event.key==='ArrowRight'?60:event.key==='ArrowLeft'?-60:0)/fg.zoom(),p.y+(event.key==='ArrowDown'?60:event.key==='ArrowUp'?-60:0)/fg.zoom(),100)}
  }}>
    <ForceGraph2D<SimNode,SimLink> ref={graph} width={size.width} height={size.height} graphData={sim} nodeId="gid" backgroundColor="#090B10" minZoom={.08} maxZoom={5}
      nodeCanvasObject={paintNode} nodeVal={n=>(radius(n)/4)**2} nodeLabel="" linkLabel=""
      nodePointerAreaPaint={(n,c,ctx,scale)=>{ctx.fillStyle=c;ctx.beginPath();ctx.arc(n.x??0,n.y??0,radius(n)+4/scale,0,2*Math.PI);ctx.fill()}}
      linkColor={l=>activeLink(l)?'rgba(220,230,255,.8)':highlighted?'rgba(130,140,160,.035)':'rgba(130,140,160,.23)'}
      linkWidth={l=>logScale(l.sum_kzt,maxima.amount,.3,2.3)*settings.linkScale*(activeLink(l)?1.3:1)}
      // Both directed links use positive curvature: reversing endpoints bends to the other side.
      linkCurvature={l=>endpointId(l.source)===endpointId(l.target)?.65:l.reciprocal?.18:0}
      linkDirectionalArrowLength={l=>(settings.showArrows||trace)?(activeLink(l)?7:4):0} linkDirectionalArrowRelPos={.8}
      linkDirectionalArrowColor={l=>activeLink(l)?'#dce6ff':highlighted?'#29303c':'#778293'}
      linkDirectionalParticles={l=>!reducedMotion.current&&(trace||settings.animateFlow)&&(!highlighted||activeLink(l))?1:0} linkDirectionalParticleWidth={2} linkDirectionalParticleSpeed={.004} linkDirectionalParticleColor={()=> '#e3edff'}
      linkCanvasObject={paintAmount} linkCanvasObjectMode={()=>'after'} linkHoverPrecision={5}
      onNodeHover={n=>{setHover(n);setHoverLink(null)}} onLinkHover={setHoverLink}
      onNodeClick={n=>onSelect(n.gid)} onBackgroundClick={()=>{setHover(null);setHoverLink(null);onClear()}}
      onNodeDragEnd={n=>{n.fx=n.x;n.fy=n.y}}
      warmupTicks={50} cooldownTicks={120} d3AlphaDecay={.035} d3VelocityDecay={.4}
      onEngineStop={()=>{setSettled(true);if(!fitted.current){fitted.current=true;if(selected)focus();else graph.current?.zoomToFit(selectedDuration(),55)}}}
    />
    <div className="aml-map-status"><span className={settled?'settled':'settling'} />{settled?'Сеть готова к исследованию':'Расчёт расположения…'}</div>
    <div className="aml-zoom-controls"><Button variant="secondary" size="icon-sm" aria-label="Увеличить граф" onClick={()=>graph.current?.zoom((graph.current.zoom()??1)*1.4,200)}><Plus /></Button><Button variant="secondary" size="icon-sm" aria-label="Уменьшить граф" onClick={()=>graph.current?.zoom((graph.current.zoom()??1)/1.4,200)}><Minus /></Button><Button variant="secondary" size="icon-sm" aria-label="Вписать граф" onClick={()=>graph.current?.zoomToFit(selectedDuration(),50)}><Maximize /></Button></div>
    <div className="aml-map-help">Прокрутка — масштаб · перетаскивание — панорама</div>
    {hover && <div className="aml-tooltip" role="tooltip"><strong>GID {hover.gid}</strong><span>{hover.risk_score!=null?'Риск сети':'Приоритет проверки'} <b>{nodeScore(hover)?.toFixed(2)??'Нет данных'}</b></span><span>{(nodeScore(hover)??0)>=.75?'Высокий приоритет проверки':nodeScore(hover)===null?'Оценка неизвестна':'Наблюдаемый структурный сигнал'}</span><dl><dt>Гипотеза роли</dt><dd>{roleLabels[hover.role]}</dd><dt>Наблюдаемый объём</dt><dd>{money(nodeVolume(hover))}</dd><dt>Входящие / исходящие связи</dt><dd>{hover.in_degree??'—'} / {hover.out_degree??'—'}</dd><dt>Кластер · глубина</dt><dd>#{hover.cluster_id} · {hover.depth}</dd><dt>Исходный клиент</dt><dd>{hover.is_seed?'Да':'Нет'}</dd></dl></div>}
    {!hover && hoverLink && <div className="aml-tooltip" role="tooltip"><strong>Направление: отправитель → получатель</strong><span>От: GID {endpointId(hoverLink.source)}</span><span>Кому: GID {endpointId(hoverLink.target)}</span><span>Сумма: {money(hoverLink.sum_kzt)}</span><span>Переводов: {hoverLink.n_tx??'Нет данных'}</span></div>}
  </div>
}
