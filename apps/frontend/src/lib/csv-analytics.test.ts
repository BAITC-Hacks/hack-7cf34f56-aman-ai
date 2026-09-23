import { describe, expect, it } from 'vitest'
import { MAX_CSV_BYTES, MAX_CSV_ROWS, parseCsvAnalysis } from './csv-analytics'
import { csvText } from './export'

const parse = (text: string) => parseCsvAnalysis(text, 'transfers.csv')

describe('CSV observations', () => {
  it('preserves huge GIDs, duplicates, reciprocal edges, and exact decimal totals', () => {
    const result = parse([
      'src,dst,amount_kzt,date',
      '9007199254740993,9007199254740992,0.10,2026-07-02',
      '9007199254740993,9007199254740992,0.10,2026-07-02',
      '9007199254740992,9007199254740993,0.20,2026-07-01',
      '2,9007199254740992,0.30,2026-07-01',
    ].join('\n'))
    expect(result).toMatchObject({ fileName: 'transfers.csv', rowCount: 4, kind: 'transactions', totalKzt: 0.7, transactionCount: 4 })
    expect(result.nodes).toEqual([
      { gid: '2', incomingKzt: 0, outgoingKzt: 0.3, totalVolumeKzt: 0.3, inDegree: 0, outDegree: 1, inTx: 0, outTx: 1 },
      { gid: '9007199254740992', incomingKzt: 0.5, outgoingKzt: 0.2, totalVolumeKzt: 0.7, inDegree: 2, outDegree: 1, inTx: 3, outTx: 1 },
      { gid: '9007199254740993', incomingKzt: 0.2, outgoingKzt: 0.2, totalVolumeKzt: 0.4, inDegree: 1, outDegree: 1, inTx: 1, outTx: 2 },
    ])
    expect(result.edges).toEqual([
      { src: '2', dst: '9007199254740992', sumKzt: 0.3, nTx: 1 },
      { src: '9007199254740992', dst: '9007199254740993', sumKzt: 0.2, nTx: 1 },
      { src: '9007199254740993', dst: '9007199254740992', sumKzt: 0.2, nTx: 2 },
    ])
    expect(result.daily).toEqual([
      { date: '2026-07-01', sumKzt: 0.5, transactionCount: 2 },
      { date: '2026-07-02', sumKzt: 0.2, transactionCount: 2 },
    ])
    expect(result.dateRange).toEqual({ start: '2026-07-01', end: '2026-07-02' })
    expect(result.warnings).toEqual([])
    expect(JSON.stringify(result)).not.toMatch(/role|priority|cluster|depth|seed/)
  })

  it('aggregates provided transaction counts instead of counting edge rows', () => {
    const result = parse('src,dst,sum_kzt,n_tx\n10,2,100,3\n10,2,50,2\n2,10,20,1')
    expect(result.kind).toBe('edges')
    expect(result.transactionCount).toBe(6)
    expect(result.edges).toEqual([
      { src: '2', dst: '10', sumKzt: 20, nTx: 1 },
      { src: '10', dst: '2', sumKzt: 150, nTx: 5 },
    ])
    expect(result.nodes.find(node => node.gid === '10')).toMatchObject({ incomingKzt: 20, outgoingKzt: 150, inDegree: 1, outDegree: 1, inTx: 1, outTx: 5 })
  })

  it('does not assume sum_kzt represents a single transaction, even with dates', () => {
    const result = parse('src,dst,sum_kzt,date\n1,2,40,2026-01-01\n1,2,60,2026-01-01')
    expect(result).toMatchObject({ kind: 'edges', rowCount: 2, transactionCount: null, totalKzt: 100 })
    expect(result.edges[0]).toEqual({ src: '1', dst: '2', sumKzt: 100, nTx: null })
    expect(result.nodes[0]).toMatchObject({ inTx: 0, outTx: null })
    expect(result.daily[0].transactionCount).toBeNull()
    expect(result.warnings.join(' ')).toContain('число транзакций неизвестно')
  })

  it('propagates unknown counts only to affected aggregates', () => {
    const result = parse('src,dst,amount,n_tx,date\n1,2,10,3,2026-01-01\n1,2,20,,2026-01-02\n2,3,30,2,2026-01-03')
    expect(result.kind).toBe('edges')
    expect(result.transactionCount).toBeNull()
    expect(result.nodes.find(node => node.gid === '2')).toMatchObject({ inTx: null, outTx: 2 })
    expect(result.daily.map(day => day.transactionCount)).toEqual([3, null, 2])
  })

  it('keeps missing dates out of daily summaries without losing their amounts', () => {
    const result = parse('src,dst,amount_kzt,transaction_date\n1,2,20,2026-04-02\n2,3,10,\n3,4,5,2026-04-01')
    expect(result.totalKzt).toBe(35)
    expect(result.daily.reduce((total, day) => total + day.sumKzt, 0)).toBe(25)
    expect(result.dateRange).toEqual({ start: '2026-04-01', end: '2026-04-02' })
    expect(result.warnings.join(' ')).toContain('Строк без даты: 1')
  })

  it('exposes absent dates and retains self-transfers exactly once in the total', () => {
    const result = parse('src,dst,amount\n1,1,10')
    expect(result.totalKzt).toBe(10)
    expect(result.daily).toEqual([])
    expect(result.dateRange).toBeNull()
    expect(result.nodes[0]).toEqual({ gid: '1', incomingKzt: 10, outgoingKzt: 10, totalVolumeKzt: 20, inDegree: 1, outDegree: 1, inTx: 1, outTx: 1 })
    expect(result.warnings).toHaveLength(2)
    expect(result.warnings.join(' ')).toContain('тот же GID: 1')
  })

  it('orders decimal identifiers deterministically while preserving leading zeroes', () => {
    const rows = ['10,02,1.10', '2,001,2.20', '02,1,3.30']
    const first = parse(`src,dst,amount\n${rows.join('\n')}`)
    const second = parse(`src,dst,amount\n${rows.toReversed().join('\n')}`)
    expect(first).toEqual(second)
    expect(first.nodes.map(node => node.gid)).toEqual(['001', '1', '02', '2', '10'])
    expect(first.totalKzt).toBe(6.6)
  })

  it('accepts zero amounts and real leap days without inferring time-of-day', () => {
    const result = parse('src,dst,amount,dt\n0,2,0,2000-02-29\n2,3,00.01,2024-02-29')
    expect(result.totalKzt).toBe(0.01)
    expect(result.transactionCount).toBe(2)
    expect(result.dateRange).toEqual({ start: '2000-02-29', end: '2024-02-29' })
  })
})

describe('CSV syntax', () => {
  it.each([',', ';', '\t'])('detects %j delimiter with BOM, CRLF and quoted values', delimiter => {
    const lines = [
      ['"src"', '"dst"', '"amount_kzt"', '"date"', '"note"'],
      ['"9223372036854775807"', '"2"', '"12.34"', '"2026-01-01"', '"a, b; c\td"'],
    ]
    const result = parse(`\uFEFF${lines.map(line => line.join(delimiter)).join('\r\n')}\r\n`)
    expect(result.totalKzt).toBe(12.34)
    expect(result.nodes.map(node => node.gid)).toEqual(['2', '9223372036854775807'])
  })

  it('accepts quoted newlines, escaped quotes, reordered columns and blank lines', () => {
    const result = parse('\n\r\n NOTE ,DST,AMOUNT,SRC\r\n"First line\r\nSecond line, with ""quotes""",2,1.23,1\r\n  \r\n"end",3,2,2')
    expect(result.rowCount).toBe(2)
    expect(result.totalKzt).toBe(3.23)
  })

  it.each([
    ['src,dst,amount\n1,2,"3', 'не закрыты кавычки'],
    ['src,dst,amount\n1,2,"3"suffix', 'после закрывающей кавычки'],
    ['src,dst,amount\n1,2,3"', 'кавычка внутри'],
    ['src,dst,amount\n1,2', 'ожидалось 3 колонок, получено 2'],
    ['src,dst,amount\n1,2,3,4', 'ожидалось 3 колонок, получено 4'],
    ['src,dst,amount\n1,2,3,', 'ожидалось 3 колонок, получено 4'],
  ])('rejects damaged CSV %j', (csv, error) => {
    expect(() => parse(csv)).toThrow(error)
  })

  it.each([
    ['', 'CSV пуст'],
    ['\uFEFF \r\n', 'CSV пуст'],
    ['src,dst,amount', 'только заголовки'],
    ['src,dst,note\n1,2,3', 'нужны колонки'],
    ['src,amount\n1,2', 'нужны колонки'],
    ['src,dst,amount,AMOUNT\n1,2,3,3', 'повторяются'],
    ['src,dst,amount,\n1,2,3,4', 'без названия'],
    ['src,dst,amount,sum_kzt\n1,2,3,3', 'одну колонку суммы'],
    ['src,dst,amount,date,dt\n1,2,3,,', 'одну колонку даты'],
  ])('rejects invalid headers or empty inputs %j', (csv, error) => {
    expect(() => parse(csv)).toThrow(error)
  })
})

describe('CSV value validation and resource limits', () => {
  it.each(['', '-1', '+1', '1.0', '1e18', '9.007199254740993E+15', 'NaN', '1 234', 'client-1'])('rejects invalid GID %j', value => {
    expect(() => parse(`src,dst,amount\n${value},2,1`)).toThrow('GID')
    expect(() => parse(`src,dst,amount\n1,${value},1`)).toThrow('GID')
  })

  it.each(['', '-0.01', '+1', '1e3', 'NaN', 'Infinity', '.1', '1.', '1.001', '1 000', '1,23'])('rejects invalid amount %j', value => {
    expect(() => parse(`src,dst,amount\n1,2,"${value}"`)).toThrow('сумма должна')
  })

  it.each(['0', '-1', '1.5', '1e2', 'Infinity', '9007199254740992'])('rejects invalid n_tx %j', value => {
    expect(() => parse(`src,dst,sum_kzt,n_tx\n1,2,1,${value}`)).toThrow('n_tx')
  })

  it.each(['2025-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '0000-01-01'])('rejects nonexistent date %j', value => {
    expect(() => parse(`src,dst,amount,date\n1,2,1,${value}`)).toThrow('несуществующая календарная дата')
  })

  it.each(['2026-1-01', '01/07/2026', '2026-07-01T12:30:00Z', 'yesterday'])('rejects non-calendar-date value %j', value => {
    expect(() => parse(`src,dst,amount,date\n1,2,1,${value}`)).toThrow('ГГГГ-ММ-ДД')
  })

  it('rejects unsafe amounts, exact-sum overflow, and loss of a display cent', () => {
    expect(() => parse('src,dst,amount\n1,2,90071992547410')).toThrow('слишком велика')
    expect(() => parse('src,dst,amount\n1,2,50000000000000\n2,3,50000000000000')).toThrow('слишком велика')
    expect(() => parse('src,dst,amount\n1,2,90071992547409.90')).toThrow('слишком велика')
    expect(() => parse('src,dst,amount\n1,2,90071992547409.91')).toThrow('слишком велика')
    expect(parse('src,dst,amount\n1,2,1234567890.12\n2,3,0.01').totalKzt).toBe(1234567890.13)
  })

  it('preserves accepted money, large GIDs and unknown counts through Intl and CSV export', () => {
    const original = parse('src,dst,sum_kzt,n_tx\n9007199254740993,2,90071992547409.89,')
    expect(new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 2 }).format(original.totalKzt))
      .toBe('90071992547409.89')
    const exported = csvText(['src', 'dst', 'sum_kzt', 'n_tx'], original.edges.map(edge => [edge.src, edge.dst, edge.sumKzt, edge.nTx]))
    const imported = parse(exported)
    expect(imported.edges).toEqual(original.edges)
    expect(imported.nodes).toEqual(original.nodes)
    expect(imported.totalKzt).toBe(original.totalKzt)
    expect(imported.transactionCount).toBeNull()
  })

  it('calculates combined node volume in exact minor units and rejects unsafe combined volume', () => {
    const result = parse('src,dst,amount\n1,2,0.1\n2,3,0.2')
    expect(result.nodes.find(node => node.gid === '2')).toMatchObject({ incomingKzt: 0.1, outgoingKzt: 0.2, totalVolumeKzt: 0.3 })
    // The row and each incoming/outgoing total are safe individually, but the
    // self-transfer contributes to both directions of the node's displayed volume.
    expect(() => parse('src,dst,amount\n1,1,50000000000000')).toThrow('слишком велика')
    expect(() => parse('src,dst,amount\n1,1,45035996273704.95')).toThrow('слишком велика')
  })

  it('rejects unsafe combined counts even when another row has an unknown count', () => {
    expect(() => parse('src,dst,sum_kzt,n_tx\n1,2,1,9007199254740991\n2,3,1,1')).toThrow('число транзакций')
    expect(() => parse('src,dst,sum_kzt,n_tx\n1,2,1,\n2,3,1,9007199254740991\n3,4,1,1')).toThrow('число транзакций')
  })

  it('enforces the input byte limit, including multibyte UTF-8', () => {
    expect(() => parse(' '.repeat(MAX_CSV_BYTES + 1))).toThrow('10 МиБ')
    const oversized = `src,dst,amount,note\n1,2,1,${'я'.repeat(MAX_CSV_BYTES / 2)}`
    expect(oversized.length).toBeLessThan(MAX_CSV_BYTES)
    expect(() => parse(oversized)).toThrow('10 МиБ')
  })

  it('accepts the maximum row count and rejects one more row', () => {
    const csv = `src,dst,amount\n${'1,2,0.01\n'.repeat(MAX_CSV_ROWS)}`
    const result = parse(csv)
    expect(result.rowCount).toBe(MAX_CSV_ROWS)
    expect(result.totalKzt).toBe(500)
    expect(result.transactionCount).toBe(MAX_CSV_ROWS)
    expect(() => parse(`${csv}1,2,0.01`)).toThrow('строк данных')
  })
})
