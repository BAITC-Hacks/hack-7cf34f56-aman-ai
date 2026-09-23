import { ArrowDownLeft, ArrowUpRight, FileSearch, Layers, ShieldAlert } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { EmptyPanel, ErrorPanel, LoadingPanel, RoleBadge, CopyButton, Hint } from './shared'
import { amount, percent, roleLabels } from '@/lib/format'
import { roles, type NodeCard } from '@/lib/contracts'

type Props = { gid: string | null; node?: NodeCard; loading: boolean; error?: string; retry: () => void; onSelect: (gid: string) => void; onCluster: (id: number) => void }
export function NodeInspector({ gid, node, loading, error, retry, onSelect, onCluster }: Props) {
  return <aside className="inspector panel" aria-labelledby="inspector-heading">
    <header className="panel-heading"><div className="flex items-center gap-2"><FileSearch className="size-4" /><h2 id="inspector-heading">Карточка клиента</h2></div><Badge variant="outline">GID</Badge></header>
    {!gid ? <EmptyPanel title="Здесь начинается проверка" description="Выберите клиента в списке или на графе, чтобы изучить его связи и признаки роли." /> : loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={retry} /> : node ? <>
      <div className="node-identity"><div className="eyebrow">КЛИЕНТ · ГЛУБИНА {node.depth}</div><div className="flex items-center justify-between gap-1"><h3 className="node-gid">{node.gid}</h3><CopyButton value={node.gid} /></div><div className="flex flex-wrap items-center gap-2"><RoleBadge role={node.role} />{node.is_seed && <Badge variant="secondary">Seed</Badge>}<Button variant="ghost" size="xs" onClick={() => onCluster(node.cluster_id)}><Layers data-icon="inline-start" />Кластер {node.cluster_id}</Button></div></div>
      {node.limitations.filter(l => l.code !== 'synthetic').map(l => <div className="mx-4 mb-3" key={l.code}><Alert><ShieldAlert /><AlertTitle>Ограничение наблюдения</AlertTitle><AlertDescription>{l.message}</AlertDescription></Alert></div>)}
      <Tabs key={node.gid} defaultValue="summary" className="min-h-0 flex-1 gap-0"><TabsList variant="line" className="mx-4 mb-3 w-[calc(100%-2rem)]"><TabsTrigger value="summary">Обзор</TabsTrigger><TabsTrigger value="evidence">Основания</TabsTrigger><TabsTrigger value="connections">Связи</TabsTrigger></TabsList>
        <ScrollArea className="min-h-0 flex-1"><div className="inspector-content">
          <TabsContent value="summary"><div className="flex flex-col gap-4">
            <div className="score-grid"><Score label="Приоритет проверки" value={node.priority_score} priority /><Score label="Уверенность в роли" value={node.role_score} /></div>
            <Card size="sm"><CardHeader><CardDescription>ГИПОТЕЗА ДЛЯ ПРОВЕРКИ</CardDescription><CardTitle>Почему этот клиент</CardTitle></CardHeader><CardContent><p className="evidence-text">{node.evidence}</p></CardContent></Card>
            <div><h4 className="section-label">Наблюдаемые потоки <Hint text="Только переводы внутри предоставленной выборки. Это не баланс счёта." /></h4><div className="flow-grid"><div><div className="flow-label"><ArrowDownLeft />Входящие</div><div className="flow-number">{amount(node.observed_flows.incoming_kzt)} <small>₸</small></div><p>{node.observed_flows.in_degree} отправителей · {node.observed_flows.in_tx} переводов</p></div><div><div className="flow-label"><ArrowUpRight />Исходящие</div><div className="flow-number">{amount(node.observed_flows.outgoing_kzt)} <small>₸</small></div><p>{node.observed_flows.out_degree} получателей · {node.observed_flows.out_tx} переводов</p></div></div></div>
            <Separator /><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1 text-sm">Связанные seed-клиенты<Hint text="Число разных seed, от которых существует наблюдаемый направленный путь. Не доказывает движение одних и тех же средств." /></span><strong>{node.seed_reach_count ?? 'Нет данных'}</strong></div>
            <NextRequest node={node} />
          </div></TabsContent>
          <TabsContent value="evidence"><div className="flex flex-col gap-4"><p className="subtle">Оценки — признаки структуры, а не вероятность виновности.</p><h4 className="section-label">Оценки ролей</h4>{roles.map(role => { const detail = node.role_scores[role]; return <div key={role} className="role-score"><div className="flex items-center justify-between gap-2"><span>{roleLabels[role]}</span><span>{!detail.applicable ? 'Не применяется' : detail.score === null ? 'Нет данных' : percent(detail.score)}</span></div>{detail.applicable && detail.score !== null ? <Progress value={detail.score * 100} aria-label={roleLabels[role]} /> : <p className="subtle">{detail.reason}</p>}</div> })}<Separator /><h4 className="section-label">Из чего складывается приоритет</h4>{node.priority_components.map(c => <div className="contribution" key={c.key}><span>{c.key}<small>Вес {percent(c.weight)}</small></span><strong>{c.computed ? `+${(c.contribution * 100).toFixed(1)}` : 'Не рассчитано'}</strong></div>)}<Separator />{node.limitations.map(l => <p className="subtle" key={l.code}>{l.message}</p>)}</div></TabsContent>
          <TabsContent value="connections"><div className="flex flex-col gap-5">{(['in', 'out'] as const).map(direction => { const edges = node.edges.filter(e => direction === 'in' ? e.dst === node.gid : e.src === node.gid); return <section key={direction}><h4 className="section-label">{direction === 'in' ? 'Входящие связи' : 'Исходящие связи'} · {edges.length}</h4>{!edges.length ? <p className="subtle">Нет наблюдаемых связей</p> : <Table><TableHeader><TableRow><TableHead>Клиент</TableHead><TableHead className="text-right">KZT / переводов</TableHead></TableRow></TableHeader><TableBody>{edges.map(e => { const other = direction === 'in' ? e.src : e.dst; return <TableRow key={`${e.src}-${e.dst}`}><TableCell><Button variant="link" size="sm" className="h-auto p-0" onClick={() => onSelect(other)}><span className="connection-gid">{other}</span></Button></TableCell><TableCell className="text-right font-mono text-xs">{amount(e.sum_kzt)}<span className="block text-muted-foreground">{e.n_tx ?? 'Нет данных'} пер.</span></TableCell></TableRow> })}</TableBody></Table>}</section> })}</div></TabsContent>
        </div></ScrollArea>
      </Tabs>
    </> : null}
  </aside>
}
function Score({ label, value, priority = false }: { label: string; value: number; priority?: boolean }) {
  return <div className="score"><div className="score-label">{label}<Hint text={priority ? 'Относительный приоритет для аналитика, не риск виновности.' : 'Эвристическая оценка соответствия роли, не калиброванная вероятность.'} /></div><div className="score-value">{Math.round(value * 100)}<small>{priority ? '/ 100' : '%'}</small></div><Progress value={value * 100} aria-label={label} /></div>
}
function NextRequest({ node }: { node: NodeCard }) {
  return <Card size="sm"><CardHeader><CardTitle>Следующий шаг</CardTitle></CardHeader><CardContent><p className="evidence-text">{node.next_action ?? 'Рекомендация ещё не рассчитана.'}</p></CardContent>{node.next_action && <CardFooter><span className="subtle">Запрос дополнительных данных</span><CopyButton value={node.next_action} label="Копировать рекомендацию" /></CardFooter>}</Card>
}
