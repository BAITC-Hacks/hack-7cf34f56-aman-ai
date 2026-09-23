/** Browser-local summaries of the supplied rows, without inferred investigation scores. */
export const MAX_CSV_BYTES = 10 * 1024 * 1024
export const MAX_CSV_ROWS = 50_000

export type CsvAnalysis = {
  fileName: string
  rowCount: number
  kind: 'transactions' | 'edges'
  nodes: {
    gid: string
    incomingKzt: number
    outgoingKzt: number
    totalVolumeKzt: number
    inDegree: number
    outDegree: number
    inTx: number | null
    outTx: number | null
  }[]
  edges: { src: string; dst: string; sumKzt: number; nTx: number | null }[]
  totalKzt: number
  transactionCount: number | null
  daily: { date: string; sumKzt: number; transactionCount: number | null }[]
  dateRange: { start: string; end: string } | null
  warnings: string[]
}

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER)
const moneyHeaders = ['amount_kzt', 'amount', 'sum_kzt']
const dateHeaders = ['date', 'transaction_date', 'dt']

function csvError(message: string, row?: number): never {
  throw new Error(row === undefined ? message : `Строка ${row}: ${message}`)
}

function detectDelimiter(text: string): string {
  const counts = new Map([[',', 0], [';', 0], ['\t', 0]])
  let quoted = false
  let hasContent = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      hasContent = true
      if (quoted && text[index + 1] === '"') index++
      else quoted = !quoted
    } else if (!quoted) {
      if (char === '\r' || char === '\n') {
        if (hasContent) break
      } else {
        if (counts.has(char)) counts.set(char, counts.get(char)! + 1)
        if (char.trim() || counts.has(char)) hasContent = true
      }
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0]
}

/** Parse quoted delimiters/newlines and reject damaged records instead of repairing them. */
function parseRecords(text: string, delimiter: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false
  let hasContent = false

  const finishField = () => {
    record.push(field)
    field = ''
    closedQuote = false
  }
  const finishRecord = () => {
    if (hasContent) {
      finishField()
      records.push(record)
      if (records.length > MAX_CSV_ROWS + 1) {
        csvError(`В CSV больше ${MAX_CSV_ROWS.toLocaleString('ru-RU')} строк данных. Разделите файл.`)
      }
    }
    record = []
    field = ''
    closedQuote = false
    hasContent = false
  }

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index++
        } else {
          quoted = false
          closedQuote = true
        }
      } else {
        field += char
      }
      continue
    }
    if (char === delimiter) {
      hasContent = true
      finishField()
    } else if (char === '\r' || char === '\n') {
      finishRecord()
      if (char === '\r' && text[index + 1] === '\n') index++
    } else if (closedQuote) {
      if (char !== ' ' && char !== '\t') csvError('лишний текст после закрывающей кавычки.', records.length + 1)
    } else if (char === '"') {
      if (field.length !== 0) csvError('кавычка внутри неэкранированного поля.', records.length + 1)
      quoted = true
      hasContent = true
    } else {
      field += char
      if (char.trim()) hasContent = true
    }
  }
  if (quoted) csvError('не закрыты кавычки.', records.length + 1)
  finishRecord()
  return records
}

function compareGids(a: string, b: string): number {
  // Decimal comparison without converting an identifier to Number, even for sorting.
  const left = a.replace(/^0+(?=\d)/, '')
  const right = b.replace(/^0+(?=\d)/, '')
  return left.length - right.length || (left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0)
}

function parseGid(value: string, name: string, row: number): string {
  if (!/^\d+$/.test(value)) csvError(`${name} должен содержать GID целиком, только цифры; без экспоненты и округления.`, row)
  return value
}

function parseMoney(value: string, row: number): bigint {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    csvError('сумма должна быть неотрицательным числом с точкой и не более чем двумя знаками после неё.', row)
  }
  const [whole, fraction = ''] = value.split('.')
  const significant = whole.replace(/^0+/, '')
  if (significant.length > 14) csvError('сумма слишком велика для точного отображения.', row)
  const cents = BigInt(significant || '0') * 100n + BigInt(fraction.padEnd(2, '0'))
  if (cents > MAX_SAFE_CENTS) csvError('сумма слишком велика для точного отображения.', row)
  return cents
}

function toKzt(cents: bigint): number {
  const decimal = `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
  const value = Number(decimal)
  // Large floating-point values can lose a cent even when the minor-unit integer is safe.
  // Intl.NumberFormat and CSV/JSON exports use the shortest decimal representation,
  // which can differ from toFixed (for example 90071992547409.91 becomes ...409.9).
  const [serializedWhole, serializedFraction = ''] = String(value).split('.')
  const serializedDecimal = `${serializedWhole}.${serializedFraction.padEnd(2, '0')}`
  if (cents > MAX_SAFE_CENTS || value.toFixed(2) !== decimal || serializedDecimal !== decimal) {
    csvError('Итоговая сумма слишком велика для точного отображения. Разделите файл на меньшие части.')
  }
  return value
}

function parseCount(value: string, row: number): number | null {
  if (value === '') return null
  if (!/^\d+$/.test(value)) csvError('n_tx должен быть положительным целым числом.', row)
  const count = Number(value)
  if (!Number.isSafeInteger(count) || count < 1) csvError('n_tx должен быть положительным целым числом в безопасном диапазоне.', row)
  return count
}

function addCounts(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null
  const total = left + right
  if (!Number.isSafeInteger(total)) csvError('Итоговое число транзакций превышает безопасный диапазон.')
  return total
}

function parseDate(value: string, row: number): string | null {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) csvError('дата должна быть в формате ГГГГ-ММ-ДД.', row)
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    csvError('указана несуществующая календарная дата.', row)
  }
  return value
}

export function parseCsvAnalysis(text: string, fileName: string): CsvAnalysis {
  if (text.length > MAX_CSV_BYTES || new TextEncoder().encode(text).byteLength > MAX_CSV_BYTES) {
    csvError('CSV превышает 10 МиБ. Разделите файл на меньшие части.')
  }
  const content = text.replace(/^\uFEFF/, '')
  const records = parseRecords(content, detectDelimiter(content))
  if (records.length === 0) csvError('CSV пуст. Добавьте заголовки и хотя бы одну строку данных.')
  const headers = records[0].map(value => value.trim().toLowerCase())
  if (headers.some(value => !value)) csvError('В CSV есть колонка без названия.')
  if (new Set(headers).size !== headers.length) csvError('В CSV повторяются названия колонок.')
  const moneyColumns = headers.filter(value => moneyHeaders.includes(value))
  const dateColumns = headers.filter(value => dateHeaders.includes(value))
  if (!headers.includes('src') || !headers.includes('dst') || moneyColumns.length === 0) {
    csvError('В CSV нужны колонки src, dst и amount_kzt (или amount / sum_kzt).')
  }
  if (moneyColumns.length > 1) csvError('Оставьте одну колонку суммы: amount_kzt, amount или sum_kzt.')
  if (dateColumns.length > 1) csvError('Оставьте одну колонку даты: date, transaction_date или dt.')
  if (records.length < 2) csvError('В CSV есть только заголовки. Добавьте хотя бы одну строку данных.')

  const srcIndex = headers.indexOf('src')
  const dstIndex = headers.indexOf('dst')
  const moneyIndex = headers.indexOf(moneyColumns[0])
  const dateIndex = dateColumns.length ? headers.indexOf(dateColumns[0]) : -1
  const countIndex = headers.indexOf('n_tx')
  const kind = moneyColumns[0] === 'sum_kzt' || countIndex >= 0 ? 'edges' : 'transactions'
  const edges = new Map<string, { src: string; dst: string; cents: bigint; nTx: number | null }>()
  const daily = new Map<string, { cents: bigint; nTx: number | null }>()
  let totalCents = 0n
  let knownTransactionCount = 0
  let transactionCount: number | null = 0
  let missingDates = 0
  let unknownCounts = 0
  let selfLoops = 0

  for (let index = 1; index < records.length; index++) {
    const values = records[index].map(value => value.trim())
    const row = index + 1
    if (values.length !== headers.length) {
      csvError(`ожидалось ${headers.length} колонок, получено ${values.length}. Проверьте разделители и кавычки.`, row)
    }
    const src = parseGid(values[srcIndex], 'src', row)
    const dst = parseGid(values[dstIndex], 'dst', row)
    const cents = parseMoney(values[moneyIndex], row)
    const nTx = countIndex >= 0 ? parseCount(values[countIndex], row) : kind === 'transactions' ? 1 : null
    const date = dateIndex >= 0 ? parseDate(values[dateIndex], row) : null
    totalCents += cents
    if (totalCents > MAX_SAFE_CENTS) csvError('Итоговая сумма слишком велика для точного отображения.', row)
    knownTransactionCount = addCounts(knownTransactionCount, nTx ?? 0)!
    transactionCount = addCounts(transactionCount, nTx)
    if (nTx === null) unknownCounts++
    if (src === dst) selfLoops++
    // Valid GIDs contain digits only, so the separator cannot collide with an ID.
    const key = `${src}>${dst}`
    const edge = edges.get(key)
    if (edge) {
      edge.cents += cents
      edge.nTx = addCounts(edge.nTx, nTx)
    } else {
      edges.set(key, { src, dst, cents, nTx })
    }
    if (date) {
      const day = daily.get(date)
      if (day) {
        day.cents += cents
        day.nTx = addCounts(day.nTx, nTx)
      } else {
        daily.set(date, { cents, nTx })
      }
    } else {
      missingDates++
    }
  }

  const nodes = new Map<string, {
    gid: string; incomingCents: bigint; outgoingCents: bigint
    inDegree: number; outDegree: number; inTx: number | null; outTx: number | null
  }>()
  const getNode = (gid: string) => {
    let node = nodes.get(gid)
    if (!node) {
      node = { gid, incomingCents: 0n, outgoingCents: 0n, inDegree: 0, outDegree: 0, inTx: 0, outTx: 0 }
      nodes.set(gid, node)
    }
    return node
  }
  const sortedEdges = [...edges.values()].sort((a, b) => compareGids(a.src, b.src) || compareGids(a.dst, b.dst))
  for (const edge of sortedEdges) {
    const source = getNode(edge.src)
    const target = getNode(edge.dst)
    source.outgoingCents += edge.cents
    source.outDegree++
    source.outTx = addCounts(source.outTx, edge.nTx)
    target.incomingCents += edge.cents
    target.inDegree++
    target.inTx = addCounts(target.inTx, edge.nTx)
  }
  const sortedDays = [...daily].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  const warnings: string[] = []
  if (missingDates > 0) {
    warnings.push(missingDates === records.length - 1
      ? 'Даты не указаны: динамика по дням недоступна.'
      : `Строк без даты: ${missingDates}. Динамика по дням и период охватывают только строки с датой.`)
  }
  if (unknownCounts > 0) warnings.push(`Строк без n_tx: ${unknownCounts}. Полное число транзакций неизвестно; количество строк не заменяет его.`)
  if (selfLoops > 0) warnings.push(`Переводы на тот же GID: ${selfLoops}. Они сохранены в суммах и связях.`)

  return {
    fileName,
    rowCount: records.length - 1,
    kind,
    nodes: [...nodes.values()].sort((a, b) => compareGids(a.gid, b.gid)).map(node => ({
      gid: node.gid,
      incomingKzt: toKzt(node.incomingCents),
      outgoingKzt: toKzt(node.outgoingCents),
      totalVolumeKzt: toKzt(node.incomingCents + node.outgoingCents),
      inDegree: node.inDegree,
      outDegree: node.outDegree,
      inTx: node.inTx,
      outTx: node.outTx,
    })),
    edges: sortedEdges.map(edge => ({ src: edge.src, dst: edge.dst, sumKzt: toKzt(edge.cents), nTx: edge.nTx })),
    totalKzt: toKzt(totalCents),
    transactionCount,
    daily: sortedDays.map(([date, day]) => ({ date, sumKzt: toKzt(day.cents), transactionCount: day.nTx })),
    dateRange: sortedDays.length ? { start: sortedDays[0][0], end: sortedDays[sortedDays.length - 1][0] } : null,
    warnings,
  }
}
