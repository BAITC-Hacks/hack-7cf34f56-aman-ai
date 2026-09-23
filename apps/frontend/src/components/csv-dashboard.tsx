import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowDownToLine, FileSpreadsheet, Network, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { EmptyPanel, LoadingPanel } from './shared'
import { Spinner } from '@/components/ui/spinner'
import { MAX_CSV_BYTES, type CsvAnalysis } from '@/lib/csv-analytics'
import type { AMLGraphData } from '@/lib/graph-adapter'
import { defaultGraphSettings } from '@/lib/graph-settings'
import { amount } from '@/lib/format'
import { downloadCsv } from '@/lib/export'

const AMLGraph = lazy(() => import('./AMLGraph').then(module => ({ default: module.AMLGraph })))
const graphSettings = { ...defaultGraphSettings, showSeedRings: false }
const count = (value: number | null) => value === null ? 'Нет данных' : amount(value)
const dateLabel = (value: string) => value.split('-').reverse().join('.')

type Props = { analysis: CsvAnalysis | null; onAnalysis: (analysis: CsvAnalysis) => void; onBack: () => void }

export function CsvDashboard({ analysis, onAnalysis, onBack }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [dayPage, setDayPage] = useState(0)
  const [tab, setTab] = useState('network')
  const worker = useRef<Worker | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const title = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => worker.current?.terminate(), [])

  function upload(files: FileList | null) {
    worker.current?.terminate(); worker.current = null
    setBusy(false); setError(''); setDragging(false)
    if (!files?.length) return
    if (files.length !== 1) { setError('Загрузите один CSV-файл за раз.'); return }
    const file = files[0]
    if (!/\.csv$/i.test(file.name)) { setError('Выберите файл с расширением .csv.'); return }
    if (file.size > MAX_CSV_BYTES) { setError('Файл слишком большой. Максимальный размер — 10 МБ.'); return }
    setBusy(true)
    try {
      const current = new Worker(new URL('../lib/csv.worker.ts', import.meta.url), { type: 'module' })
      worker.current = current
      current.onmessage = (event: MessageEvent<{ analysis?: CsvAnalysis; error?: string }>) => {
        if (worker.current !== current) return
        setBusy(false)
        if (event.data.analysis) {
          onAnalysis(event.data.analysis); setSelected(null); setQuery(''); setPage(0); setDayPage(0); setTab('network')
          title.current?.focus()
        } else setError(event.data.error || 'Не удалось обработать CSV.')
        current.terminate(); worker.current = null
      }
      current.onerror = () => {
        if (worker.current !== current) return
        setBusy(false); setError('Не удалось обработать файл. Повторите загрузку.')
        current.terminate(); worker.current = null
      }
      current.postMessage(file)
    } catch {
      setBusy(false); setError('Не удалось запустить обработку файла. Обновите страницу и повторите загрузку.')
    }
  }

  const ranked = useMemo(() => [...(analysis?.nodes ?? [])].sort((a, b) =>
    b.totalVolumeKzt - a.totalVolumeKzt || a.gid.localeCompare(b.gid)), [analysis])
  const graph = useMemo<AMLGraphData>(() => {
    const nodes = ranked.slice(0, 250)
    const picked = ranked.find(node => node.gid === selected)
    if (picked && !nodes.includes(picked)) nodes[nodes.length - 1] = picked
    const ids = new Set(nodes.map(node => node.gid))
    const edges = [...(analysis?.edges ?? [])].filter(edge => ids.has(edge.src) && ids.has(edge.dst))
      .sort((a, b) => b.sumKzt - a.sumKzt).slice(0, 2000)
    return {
      nodes: nodes.map(node => ({ gid: node.gid, role: null, role_score: null, priority_score: null,
        cluster_id: null, depth: null, is_seed: null, incoming_kzt: node.incomingKzt, outgoing_kzt: node.outgoingKzt,
        total_volume_kzt: node.totalVolumeKzt, in_degree: node.inDegree, out_degree: node.outDegree, evidence: null })),
      links: edges.map(edge => ({ source: edge.src, target: edge.dst, sum_kzt: edge.sumKzt, n_tx: edge.nTx })),
      coverage: { truncated: nodes.length < ranked.length || edges.length < (analysis?.edges.length ?? 0),
        total_nodes: ranked.length, total_edges: analysis?.edges.length ?? 0, limit: 250 }, scope: 'upload',
    }
  }, [ranked, analysis, selected])
  const selectedNode = analysis?.nodes.find(node => node.gid === selected)
  const exactMatch = analysis?.nodes.some(node => node.gid === query.trim()) ?? false
  const visibleClients = ranked.filter(node => exactMatch ? node.gid === query.trim() : node.gid.includes(query.trim()))
  const transfers = useMemo(() => [...(analysis?.edges ?? [])]
    .filter(edge => exactMatch ? edge.src === query.trim() || edge.dst === query.trim() : edge.src.includes(query.trim()) || edge.dst.includes(query.trim()))
    .sort((a, b) => b.sumKzt - a.sumKzt), [analysis, query, exactMatch])
  const totalPages = Math.max(1, Math.ceil(transfers.length / 50))
  const currentPage = Math.min(page, totalPages - 1)
  const dayPages = Math.max(1, Math.ceil((analysis?.daily.length ?? 0) / 50))
  const uploadButton = <Button onClick={() => input.current?.click()} disabled={busy}><Upload data-icon="inline-start" />{analysis ? 'Заменить CSV' : 'Выбрать CSV'}</Button>

  return <div className="csv-shell">
    <header className="app-header"><a className="brand" href="./" onClick={event => { event.preventDefault(); onBack() }}><span className="brand-symbol"><Network /></span><span>MoneyGraph<small>INVESTIGATOR</small></span></a><Badge variant="outline">Аналитика CSV</Badge><Button variant="outline" className="ml-auto" onClick={onBack}><ArrowLeft data-icon="inline-start" />К исследованию сети</Button></header>
    <main className="csv-main">
      <div className="csv-heading"><div><h1 ref={title} tabIndex={-1}>Аналитика переводов</h1><p>Загрузите CSV, чтобы увидеть объёмы, клиентов и связи.</p></div>{analysis && uploadButton}</div>
      <Input ref={input} type="file" accept=".csv,text/csv" className="hidden" aria-label="CSV-файл переводов" tabIndex={-1} onChange={event => { upload(event.target.files); event.target.value = '' }} />
      {error && <Alert variant="destructive"><AlertTitle>Файл не загружен</AlertTitle><AlertDescription>{error}{analysis && ' Предыдущий набор данных сохранён.'}</AlertDescription></Alert>}
      {busy && <Alert role="status" aria-label="Обработка CSV"><Spinner /><AlertTitle>Обрабатываем CSV…</AlertTitle><AlertDescription>Проверяем строки и рассчитываем показатели.</AlertDescription></Alert>}
      {!analysis && <Card className="csv-upload" data-dragging={dragging} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }} onDrop={event => { event.preventDefault(); upload(event.dataTransfer.files) }}>
        <CardHeader><FileSpreadsheet className="size-9 text-primary" /><CardTitle>Ваши переводы — в одном дашборде</CardTitle><CardDescription>Перетащите CSV сюда или выберите файл на компьютере.</CardDescription></CardHeader>
        <CardContent className="flex flex-col items-start gap-4">{uploadButton}<p className="text-sm text-muted-foreground">UTF-8 · до 10 МБ · до 50 000 строк. Файл обрабатывается в браузере.</p><div className="csv-format"><strong>Формат данных</strong><p><code>src</code> — GID отправителя · <code>dst</code> — GID получателя · <code>amount_kzt</code> — сумма в KZT.</p><p>Необязательно: <code>date</code> в формате ГГГГ-ММ-ДД. Транзакции из задания: <code>src,dst,date,sum_kzt</code>. Для агрегированных связей укажите <code>sum_kzt</code> и <code>n_tx</code> — число переводов (пустое, если неизвестно).</p><p>Разделитель: запятая, точка с запятой или табуляция.</p></div></CardContent>
        <CardFooter><Button variant="ghost" onClick={() => downloadCsv('transfers-template.csv', ['src', 'dst', 'amount_kzt', 'date'], [['100000000000000001', '100000000000000002', 12500, '2026-07-01'], ['100000000000000002', '100000000000000003', 7500, '2026-07-02']])}><ArrowDownToLine data-icon="inline-start" />Скачать пример CSV</Button></CardFooter>
      </Card>}
      {analysis && <>
        <div className="csv-source" role="status"><div><FileSpreadsheet className="size-4" /><strong>{analysis.fileName}</strong><Badge variant="secondary">{analysis.kind === 'edges' ? 'Агрегированные связи' : 'Транзакции'}</Badge><span>Строк: {amount(analysis.rowCount)}</span></div><span>{analysis.dateRange ? `${dateLabel(analysis.dateRange.start)} — ${dateLabel(analysis.dateRange.end)}` : 'Даты не указаны'}</span></div>
        <div className="csv-metrics">
          <Metric title="Объём переводов" value={`${amount(analysis.totalKzt)} ₸`} description="Сумма всех строк файла" />
          <Metric title="Клиенты" value={amount(analysis.nodes.length)} description="Уникальные GID в переводах" />
          <Metric title="Переводы" value={count(analysis.transactionCount)} description={analysis.transactionCount === null ? 'В CSV не указано число переводов' : 'Число наблюдаемых транзакций'} />
          <Metric title="Направленные связи" value={amount(analysis.edges.length)} description="Уникальные пары отправитель → получатель" />
        </div>
        {analysis.warnings.length > 0 && <Alert><AlertTitle>Особенности данных</AlertTitle><AlertDescription><ul className="list-disc pl-4">{analysis.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></AlertDescription></Alert>}
        <Tabs value={tab} onValueChange={setTab}>
          <div className="csv-toolbar"><TabsList aria-label="Разделы аналитики"><TabsTrigger value="network">Обзор сети</TabsTrigger><TabsTrigger value="transfers">Связи и суммы</TabsTrigger><TabsTrigger value="daily">По дням</TabsTrigger></TabsList><Field className="csv-search"><FieldLabel htmlFor="csv-gid" className="sr-only">Найти GID в CSV</FieldLabel><Input id="csv-gid" placeholder="Найти GID в CSV" inputMode="numeric" value={query} onChange={event => { setQuery(event.target.value); setSelected(null); setPage(0) }} /></Field></div>
          <TabsContent value="network">
            <div className="csv-network-grid">
              <section className="panel aml-panel csv-graph" aria-label="Граф CSV"><header className="panel-heading"><h2>Наблюдаемые денежные потоки</h2><Badge variant="secondary">Клиенты: {graph.nodes.length}</Badge></header><div className="aml-surface"><Suspense fallback={<LoadingPanel />}><AMLGraph data={graph} selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} settings={graphSettings} trace={false} hops={1} direction="both" focusRequest={0} resetRequest={0} /></Suspense></div><div className="csv-graph-caption">Размер — входящий + исходящий объём. Стрелка — направление перевода.</div>{graph.coverage.truncated && <div className="csv-graph-caption">Показано {graph.nodes.length} из {analysis.nodes.length} клиентов и {graph.links.length} из {analysis.edges.length} связей. Приоритет отображения — объём; выбранный клиент включён. Таблицы и итоги учитывают весь файл.</div>}</section>
              <Card className="csv-clients"><CardHeader><CardTitle>{selectedNode ? 'Наблюдаемые потоки клиента' : 'Клиенты по объёму'}</CardTitle><CardDescription>{selectedNode ? 'Только переводы из загруженного файла' : 'Входящий + исходящий объём, без оценки риска'}</CardDescription></CardHeader><CardContent>
                {selectedNode ? <div className="flex flex-col gap-4"><div className="flex items-center justify-between gap-2"><strong className="font-mono break-all">{selectedNode.gid}</strong><Button variant="ghost" size="icon-sm" aria-label="Закрыть клиента CSV" onClick={() => setSelected(null)}><X /></Button></div><dl className="csv-client-facts"><dt>Входящий объём</dt><dd>{amount(selectedNode.incomingKzt)} ₸</dd><dt>Исходящий объём</dt><dd>{amount(selectedNode.outgoingKzt)} ₸</dd><dt>Отправители</dt><dd>{selectedNode.inDegree}</dd><dt>Получатели</dt><dd>{selectedNode.outDegree}</dd><dt>Входящие переводы</dt><dd>{count(selectedNode.inTx)}</dd><dt>Исходящие переводы</dt><dd>{count(selectedNode.outTx)}</dd></dl><Button variant="outline" onClick={() => { setQuery(selectedNode.gid); setTab('transfers'); setPage(0) }}>Посмотреть связи</Button></div> : !visibleClients.length ? <EmptyPanel title="GID не найден" description="Попробуйте другой GID или очистите поиск." /> : <ol className="csv-client-list">{visibleClients.slice(0, 20).map(node => <li key={node.gid}><Button variant="ghost" onClick={() => setSelected(node.gid)}><span className="font-mono">{node.gid}</span><span>{amount(node.totalVolumeKzt)} ₸</span></Button></li>)}</ol>}
              </CardContent><CardFooter>{selectedNode ? 'Объёмы не являются балансом счёта.' : `Показано ${Math.min(20, visibleClients.length)} из ${visibleClients.length} клиентов`}</CardFooter></Card>
            </div>
          </TabsContent>
          <TabsContent value="transfers"><Card><CardHeader><CardTitle>Связи и суммы</CardTitle><CardDescription>Переводы одной направленной пары объединены. Сортировка по сумме.</CardDescription></CardHeader><CardContent><div className="csv-table-actions"><span>{amount(transfers.length)} связей</span><Button variant="outline" disabled={!transfers.length} onClick={() => downloadCsv('csv-observed-transfers.csv', ['src', 'dst', 'sum_kzt', 'n_tx'], transfers.map(edge => [edge.src, edge.dst, edge.sumKzt, edge.nTx]))}><ArrowDownToLine data-icon="inline-start" />Скачать CSV</Button></div>{transfers.length ? <Table><TableHeader><TableRow><TableHead>Отправитель</TableHead><TableHead>Получатель</TableHead><TableHead>Сумма, KZT</TableHead><TableHead>Переводов</TableHead></TableRow></TableHeader><TableBody>{transfers.slice(currentPage * 50, (currentPage + 1) * 50).map(edge => <TableRow key={`${edge.src}->${edge.dst}`}><TableCell><Button variant="link" onClick={() => { setSelected(edge.src); setTab('network') }}>{edge.src}</Button></TableCell><TableCell><Button variant="link" onClick={() => { setSelected(edge.dst); setTab('network') }}>{edge.dst}</Button></TableCell><TableCell>{amount(edge.sumKzt)}</TableCell><TableCell>{count(edge.nTx)}</TableCell></TableRow>)}</TableBody></Table> : <EmptyPanel title="Связи не найдены" description="Измените GID или очистите поиск." />}</CardContent><CardFooter className="justify-between"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Назад</Button><span>Страница {currentPage + 1} из {totalPages}</span><Button variant="outline" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Далее</Button></CardFooter></Card></TabsContent>
          <TabsContent value="daily"><Card><CardHeader><CardTitle>Объём по календарным дням</CardTitle><CardDescription>Все строки с указанной датой. Поиск по GID не изменяет эту сводку.</CardDescription></CardHeader><CardContent>{analysis.daily.length ? <div className="csv-daily-table"><Table><TableHeader><TableRow><TableHead>Дата</TableHead><TableHead>Сумма, KZT</TableHead><TableHead>Переводов</TableHead></TableRow></TableHeader><TableBody>{analysis.daily.slice(dayPage * 50, (dayPage + 1) * 50).map(day => <TableRow key={day.date}><TableCell>{dateLabel(day.date)}</TableCell><TableCell>{amount(day.sumKzt)}</TableCell><TableCell>{count(day.transactionCount)}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyPanel title="Нет данных о датах" description="Добавьте колонку date в формате ГГГГ-ММ-ДД, чтобы увидеть дневную сводку." />}</CardContent>{dayPages > 1 && <CardFooter className="justify-between"><Button variant="outline" disabled={dayPage === 0} onClick={() => setDayPage(dayPage - 1)}>Назад</Button><span>Страница {dayPage + 1} из {dayPages}</span><Button variant="outline" disabled={dayPage + 1 >= dayPages} onClick={() => setDayPage(dayPage + 1)}>Далее</Button></CardFooter>}</Card></TabsContent>
        </Tabs>
        <FieldDescription>Анализ описывает только загруженную выборку. Роли, приоритеты, сообщества и глубина наблюдения по этому CSV не рассчитаны. Отсутствие исходящих переводов не доказывает, что движение средств завершилось.</FieldDescription>
      </>}
    </main>
  </div>
}

function Metric({ title, value, description }: { title: string; value: string; description: string }) {
  return <Card size="sm"><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><strong className="csv-metric-value">{value}</strong><p className="text-xs text-muted-foreground mt-2">{description}</p></CardContent></Card>
}
