import { ListOrdered, ArrowUpRight, SlidersHorizontal, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select'
import { RoleBadge, EmptyPanel, ErrorPanel, LoadingPanel } from './shared'
import { roles, type TopNode } from '@/lib/contracts'
import { roleLabels } from '@/lib/format'
import { downloadCsv } from '@/lib/export'
import { isDemo } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = { nodes?: TopNode[]; loading: boolean; error?: string; retry: () => void; selected: string | null; onSelect: (gid: string) => void; filter: string; onFilter: (role: string) => void }
export function PriorityPanel({ nodes, loading, error, retry, selected, onSelect, filter, onFilter }: Props) {
  const visible = nodes?.filter(n => filter === 'all' || n.role === filter) || []
  return <section className="priority-panel panel" aria-labelledby="priority-title">
    <header className="panel-heading"><div className="flex items-center gap-2"><ListOrdered className="size-4" /><h2 id="priority-title">1. Выберите клиента</h2></div><Badge variant="secondary">{nodes?.length ?? 0}</Badge></header>
    <div className="priority-intro"><p>Приоритеты проверки</p><span>Сверху — клиенты, которых стоит изучить раньше</span></div>
    <div className="flex items-center gap-2 px-4 pb-3"><SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" /><Select value={filter} onValueChange={onFilter}><SelectTrigger className="w-full" aria-label="Фильтр по роли"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Все роли</SelectItem>{roles.map(role => <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>)}</SelectGroup></SelectContent></Select></div>
    <div className="list-caption"><span>{visible.length} из {nodes?.length ?? 0} клиентов</span><span>Из 100</span></div>
    <ScrollArea className="min-h-0 flex-1">
      {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={retry} /> : !nodes?.length ? <EmptyPanel title="Анализ ещё не готов" description="Для списка приоритетов нужны завершённые результаты пайплайна." /> : !visible.length ? <div><EmptyPanel title="Нет совпадений" description="В Top-20 нет клиентов с выбранной ролью." /><div className="px-5 pb-5"><Button variant="outline" onClick={() => onFilter('all')}>Сбросить фильтр</Button></div></div> : <ol className="priority-list">{visible.map(n => <li key={n.gid}><Button variant="ghost" className={cn('priority-item', selected === n.gid && 'is-selected')} aria-pressed={selected === n.gid} onClick={() => onSelect(n.gid)} aria-label={`Открыть клиент ${n.gid}`}>
        <span className="priority-rank">{String(n.rank).padStart(2, '0')}</span><span className="priority-body"><span className="priority-id"><span className="font-mono">{n.gid}</span><ArrowUpRight className="size-3" /></span><span className="flex items-center justify-between gap-2"><RoleBadge role={n.role} /><span className="priority-number">{Math.round(n.priority_score * 100)}</span></span><span className="priority-why">{n.why}</span></span>
      </Button></li>)}</ol>}
    </ScrollArea><div className="panel-footnote"><Button variant="ghost" size="sm" className="w-full" disabled={!nodes?.length || loading || !!error} onClick={() => nodes && downloadCsv(isDemo ? 'demo-top-nodes.csv' : 'top_nodes.csv', ['rank', 'gid', 'role', 'priority_score', 'why'], nodes.map(n => [n.rank, n.gid, n.role, n.priority_score, n.why]))}><Download data-icon="inline-start" />Скачать список приоритетов</Button></div>
  </section>
}
