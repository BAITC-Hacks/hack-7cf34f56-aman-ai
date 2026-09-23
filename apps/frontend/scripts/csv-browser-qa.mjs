import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5184/'
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('QA requires a local server')
mkdirSync('qa', { recursive: true })
const client = new Client({ name: 'moneygraph-csv-qa', version: '1.0' })
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--executable-path', chromium.executablePath(), '--output-dir', resolve('qa')] }))
  const tool = (await client.listTools()).tools.find(item => /^browser_run_code/.test(item.name))
  const scenario = async (page, base) => {
    const passed = [], errors = [], requests = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', request => { if (request.method() === 'POST') requests.push(request.url()) })
    const assert = (condition, label) => { if (!condition) throw new Error(label); passed.push(label) }
    const upload = async (text, name = 'transfers.csv') => page.getByLabel('CSV-файл переводов').evaluate((input, file) => {
      const transfer = new DataTransfer()
      transfer.items.add(new File([file.text], file.name, { type: 'text/csv' }))
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }, { text, name })
    const a = '100000000000000001', b = '100000000000000002', c = '100000000000000003'
    const csv = `src,dst,amount_kzt,date\n${a},${b},100.10,2026-07-01\n${a},${b},100.10,2026-07-01\n${b},${c},50.20,2026-07-02\n${c},${a},25,2026-07-03`
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(base)
    await page.getByRole('button', { name: 'Загрузить CSV', exact: true }).click()
    await page.getByRole('heading', { name: 'Аналитика переводов' }).waitFor()
    assert(await page.getByText('Ваши переводы — в одном дашборде').isVisible(), 'CSV empty state')
    assert(await page.getByText('Результаты проекта — в основном графе', { exact: true }).isVisible(), 'Upload screen distinguishes project results from transaction inputs')
    for (const [name, text] of [
      ['nodes_roles.csv', 'gid,role,role_score,cluster_id,priority_score,evidence\n100000000000000001,,0,-1,0,'],
      ['clusters.csv', 'cluster_id,n_nodes,n_seed,sum_kzt_internal,top_gids,hypothesis'],
      ['top_nodes.csv', 'rank,gid,role,priority_score,why'],
    ]) {
      await upload(text, name)
      await page.getByRole('alert').filter({ hasText: 'Это CSV с результатами расчёта' }).waitFor()
      passed.push(`${name} identified as a result file, not a transfer input`)
    }
    const template = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Скачать пример CSV' }).click()
    assert((await template).suggestedFilename() === 'transfers-template.csv', 'CSV template download')
    await upload('src,dst,amount_kzt\n1,2,-1')
    await page.getByRole('alert').filter({ hasText: 'неотрицательным' }).waitFor()
    passed.push('Negative amount rejected with row error')
    await upload('src,dst,amount_kzt')
    await page.getByRole('alert').filter({ hasText: 'только заголовки' }).waitFor()
    passed.push('Header-only CSV rejected')
    let releaseWorker
    const workerGate = new Promise(resolve => { releaseWorker = resolve })
    await page.route('**/csv.worker-*.js', async route => { await workerGate; await route.continue() })
    await upload(csv)
    await page.getByRole('status', { name: 'Обработка CSV' }).waitFor()
    passed.push('CSV processing state')
    releaseWorker()
    await page.locator('.csv-metrics').waitFor()
    await page.unroute('**/csv.worker-*.js')
    await page.locator('.aml-canvas').waitFor()
    assert((await page.locator('.csv-metrics').innerText()).includes('275,4'), 'Exact aggregate amount including duplicates')
    assert((await page.locator('.csv-metric-value').allTextContents()).slice(1).join('|') === '3|4|3', 'Distinct clients, transactions and directed links')
    assert(await page.locator('.aml-canvas').getAttribute('data-node-count') === '3', 'Uploaded graph replaces project graph')
    await page.getByRole('button', { name: new RegExp(a) }).click()
    assert((await page.locator('.csv-client-facts').innerText()).includes('200,2'), 'Exact GID selection and observed outgoing amount')
    await page.getByRole('button', { name: 'Посмотреть связи' }).click()
    assert(await page.getByRole('row').count() === 3, 'Selected GID filters incident links')
    const exported = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Скачать CSV', exact: true }).click()
    assert((await exported).suggestedFilename() === 'csv-observed-transfers.csv', 'Analytical CSV export')
    await page.getByRole('tab', { name: 'По дням', exact: true }).click()
    assert(await page.getByRole('row').count() === 4, 'Daily summary remains full dataset')
    await page.getByRole('tab', { name: 'Обзор сети', exact: true }).click()
    await page.getByRole('button', { name: 'Закрыть клиента CSV' }).click()
    await page.getByRole('textbox', { name: 'Найти GID в CSV' }).fill('999999')
    await page.getByText('GID не найден', { exact: true }).waitFor()
    passed.push('GID no-results state')
    await page.getByRole('textbox', { name: 'Найти GID в CSV' }).fill('')
    await upload('src,dst,sum_kzt\n1,2,10\n1,2,15')
    await page.getByText('Агрегированные связи', { exact: true }).waitFor()
    assert((await page.locator('.csv-metric-value').allTextContents()).join('|') === '25 ₸|2|Нет данных|1', 'Aggregated CSV retains unknown transaction count')
    await page.getByRole('tab', { name: 'По дням', exact: true }).click()
    await page.getByText('Нет данных о датах', { exact: true }).waitFor()
    passed.push('Missing date state')
    await upload('garbage')
    await page.getByRole('alert').filter({ hasText: 'Предыдущий набор данных сохранён' }).waitFor()
    assert((await page.locator('.csv-metric-value').allTextContents())[0] === '25 ₸', 'Invalid replacement preserves previous data')
    await upload('src,dst,amount_kzt,date\n1,2,10,2026-07-01\n11,22,20,2026-07-02')
    await page.getByText('Транзакции', { exact: true }).waitFor()
    await page.locator('.csv-client-list button').filter({ has: page.getByText('1', { exact: true }) }).click()
    await page.getByRole('textbox', { name: 'Найти GID в CSV' }).fill('11')
    assert(await page.locator('.csv-client-list button').count() === 1, 'Search replaces selected client with exact matching result')
    await page.getByRole('textbox', { name: 'Найти GID в CSV' }).fill('1')
    await page.locator('.csv-client-list button').click()
    await page.getByRole('button', { name: 'Посмотреть связи' }).click()
    assert(await page.getByRole('row').count() === 2, 'Client 1 incident links exclude unrelated client 11')
    const days = Array.from({ length: 60 }, (_, index) => `1,2,10,${new Date(Date.UTC(2026, 6, index + 1)).toISOString().slice(0, 10)}`)
    await upload('src,dst,amount_kzt,date\n' + days.join('\n'))
    await page.getByText('Строк: 60', { exact: true }).waitFor()
    await page.getByRole('tab', { name: 'По дням', exact: true }).click()
    assert(await page.getByRole('row').count() === 51, 'Daily table renders at most 50 data rows')
    await page.getByRole('button', { name: 'Далее', exact: true }).click()
    assert(await page.getByRole('row').count() === 11, 'Daily pagination reaches remaining rows')
    await upload(csv)
    await page.getByText('Строк: 4', { exact: true }).waitFor()
    await page.locator('.aml-canvas[data-settled=true]').waitFor()
    await page.screenshot({ path: 'qa/csv-dashboard-1440.png', fullPage: true })
    const overflow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, elements: [...document.querySelectorAll('body *')].filter(element => element.getBoundingClientRect().right > innerWidth + 1).slice(0, 10).map(element => ({ tag: element.tagName, class: element.className, width: element.getBoundingClientRect().width })) }))
    assert(overflow.scroll <= overflow.width, `1440 CSV layout has no horizontal overflow: ${JSON.stringify(overflow)}`)
    assert(await page.locator('.aml-panel').evaluate(element => getComputedStyle(element).backgroundColor) === 'rgb(255, 255, 255)', 'CSV canvas uses shared light theme')
    await page.screenshot({ path: 'qa/csv-dashboard-1440.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '390 CSV layout has no horizontal overflow')
    await page.screenshot({ path: 'qa/csv-dashboard-mobile.png', fullPage: true })
    await page.getByRole('button', { name: 'К исследованию сети' }).click()
    await page.getByRole('button', { name: 'Загрузить CSV', exact: true }).click()
    assert((await page.locator('.csv-metric-value').allTextContents())[0] === '275,4 ₸', 'Uploaded analysis persists when switching views')
    assert(requests.length === 0, 'Uploaded CSV never sent to server or AI')
    assert(errors.length === 0, `No browser errors: ${errors.join('; ')}`)
    return { passed, errors, requests }
  }
  const result = await client.callTool({ name: tool.name, arguments: { code: `async (page) => await (${scenario.toString()})(page, ${JSON.stringify(baseUrl)})` } }, undefined, { timeout: 60000 })
  writeFileSync('qa/csv-browser-report.json', JSON.stringify(result, null, 2))
  for (const item of result.content ?? []) if (item.type === 'text') console.log(item.text.split('### Ran')[0])
  if (result.isError) process.exitCode = 1
} finally { await client.close() }
