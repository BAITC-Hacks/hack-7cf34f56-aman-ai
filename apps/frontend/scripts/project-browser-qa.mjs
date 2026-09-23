import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// Read canonical pipeline outputs independently from the exported browser JSON.
// Keep identifiers as strings; quoted evidence may contain commas or line breaks.
function readCanonicalCsv(name, columns) {
  const text = readFileSync(new URL(`../../../results/${name}.csv`, import.meta.url), 'utf8').replace(/^\uFEFF/, '')
  const rows = []
  let row = [], field = '', quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++ }
      else quoted = !quoted
    } else if (char === ',' && !quoted) { row.push(field); field = '' }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += char
  }
  if (quoted) throw new Error(`${name}.csv: unterminated quoted field`)
  if (row.length || field.length) rows.push([...row, field])
  const header = rows.shift()
  if (header?.join(',') !== columns.join(',')) throw new Error(`${name}.csv: unexpected canonical columns`)
  return rows.map((values, index) => {
    if (values.length !== columns.length) throw new Error(`${name}.csv: invalid row ${index + 2}; regenerate canonical results before QA`)
    return Object.fromEntries(columns.map((column, position) => [column, values[position]]))
  })
}

const canonicalTop = readCanonicalCsv('top_nodes', ['rank', 'gid', 'role', 'priority_score', 'why'])
  .map(row => ({ ...row, rank: Number(row.rank), priority_score: Number(row.priority_score) }))
const topIds = new Set(canonicalTop.map(row => row.gid))
const allCanonicalNodes = readCanonicalCsv('nodes_roles', ['gid', 'role', 'role_score', 'cluster_id', 'priority_score', 'evidence'])
  .map(row => ({ ...row, role_score: Number(row.role_score), cluster_id: Number(row.cluster_id), priority_score: Number(row.priority_score) }))
const sampleIndices = new Set()
let sampleSeed = 42
while (sampleIndices.size < Math.min(3, allCanonicalNodes.length)) {
  sampleSeed = (Math.imul(sampleSeed, 1664525) + 1013904223) >>> 0
  sampleIndices.add(sampleSeed % allCanonicalNodes.length)
}
const canonical = {
  top: canonicalTop,
  nodes: allCanonicalNodes.filter(row => topIds.has(row.gid)),
  spotChecks: [...sampleIndices].map(index => allCanonicalNodes[index]),
}

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5173/'
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('QA requires a local server')
mkdirSync('qa', { recursive: true })
const client = new Client({ name: 'moneygraph-project-qa', version: '2.0' })
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--executable-path', chromium.executablePath(), '--output-dir', resolve('qa')] }))
  const tool = (await client.listTools()).tools.find(item => /^browser_run_code/.test(item.name))
  const scenario = async (page, base, expected) => {
    const passed = [], errors = [], requests = [], screenshots = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('request', request => requests.push(request.url()))
    const assert = (condition, label) => { if (!condition) throw new Error(label); passed.push(label) }
    const screenshot = async name => { const path = `qa/${name}.png`; await page.screenshot({ path }); screenshots.push(path) }
    const fixture = await (await page.request.get(base.replace(/\/$/, '') + '/project-data.json')).json()
    assert(fixture.metadata.source === 'project', 'Authoritative project provenance')
    assert(fixture.nodes.length === 2248 && fixture.edges.length === 3119 && fixture.clusters.length === 65, 'Real dataset counts')
    assert(expected.top.length > 1 && fixture.top.length === expected.top.length && expected.top.every((row, index) =>
      ['rank', 'gid', 'role', 'priority_score', 'why'].every(key => fixture.top[index]?.[key] === row[key])), 'Exported ranking, exact GIDs, scores and explanations match canonical top_nodes.csv')
    assert(expected.nodes.length === expected.top.length && expected.nodes.every(row => {
      const node = fixture.nodes.find(item => item.gid === row.gid)
      return node && ['gid', 'role', 'role_score', 'cluster_id', 'priority_score', 'evidence'].every(key => node[key] === row[key])
    }), 'Top-node cards independently match canonical nodes_roles.csv')
    const canvas = page.locator('.aml-canvas')
    const waitSelection = gid => page.locator(`.aml-canvas[data-selected-gid="${gid}"]`).waitFor()
    const search = async gid => {
      await page.getByRole('textbox', { name: 'Поиск по gid' }).fill(gid)
      await page.getByRole('button', { name: 'Найти', exact: true }).click()
      await waitSelection(gid)
    }
    const expectedNeighborhood = (gid, hops, direction) => {
      const found = new Set([gid]), traversed = new Set()
      let frontier = [gid]
      for (let step = 0; step < hops; step++) {
        const next = []
        for (const current of frontier) for (const edge of fixture.edges) {
          const other = direction !== 'incoming' && edge.src === current ? edge.dst : direction !== 'outgoing' && edge.dst === current ? edge.src : null
          if (other === null) continue
          traversed.add(`${edge.src}->${edge.dst}`)
          if (!found.has(other)) { found.add(other); next.push(other) }
        }
        frontier = next
      }
      return { nodes: found.size, links: traversed.size }
    }
    const checkNeighborhood = async (gid, hops, direction, label) => {
      const expected = expectedNeighborhood(gid, hops, direction)
      await page.locator(`.aml-canvas[data-node-count="${expected.nodes}"][data-link-count="${expected.links}"]`).waitFor()
      assert(Number(await canvas.getAttribute('data-node-count')) === expected.nodes && Number(await canvas.getAttribute('data-link-count')) === expected.links, label)
    }
    const directions = page.locator('[aria-label="Направление связей клиента"]')
    const hops = page.locator('[aria-label="Число шагов от выбранного клиента"]')
    const noOverflow = async label => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), label)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(base)
    await page.locator('.aml-canvas[data-settled=true]').waitFor()
    assert(await canvas.getAttribute('data-node-count') === '2248', 'Full real network on first load')
    assert(await canvas.getAttribute('data-link-count') === '3119', 'All canonical directed links')
    assert(await page.locator('.canvas-drawer, [role="dialog"], #graph-settings').count() === 0, 'Initial canvas has no open drawers')
    const initialBox = await canvas.boundingBox()
    assert(initialBox.width === 1440 && initialBox.height >= 800 && initialBox.y <= 80, 'Canvas fills viewport below compact header')
    assert(!requests.some(url => url.includes('/demo.json') || url.includes('/api/top-nodes') || url.includes('/api/nodes/')), 'Project mode never fetches demo or invented API')
    assert(await page.getByRole('textbox', { name: 'Поиск по gid' }).getAttribute('placeholder') === 'GID', 'Concise GID input')
    assert(await page.getByRole('button', { name: 'AI-помощник', exact: true }).count() === 1, 'One AI launcher on initial canvas')
    await page.waitForTimeout(650)
    await screenshot('project-1440')
    await noOverflow('1440 fullscreen canvas has no page overflow')

    await page.getByRole('button', { name: 'Данные и запуск' }).click()
    await page.getByRole('heading', { name: 'Данные и воспроизводимый запуск' }).waitFor()
    assert((await page.locator('.data-source-sheet').innerText()).includes('python3 scripts/run-local.py'), 'Data panel explains reproducible launch')
    assert((await page.locator('.header-status').innerText()).includes('Данные проекта'), 'Project provenance label')
    await page.keyboard.press('Escape')
    const top = fixture.top[0], card = fixture.nodes.find(node => node.gid === top.gid)
    await page.getByRole('button', { name: 'Приоритеты', exact: true }).click()
    await page.locator('.canvas-drawer-left').waitFor()
    assert(await page.locator('.canvas-drawer').count() === 1, 'Priority list opens as one drawer')
    await page.getByRole('button', { name: 'Открыть клиента ' + top.gid }).click()
    await waitSelection(top.gid)
    await page.locator('.node-gid').filter({ hasText: top.gid }).waitFor()
    assert(await page.locator('.canvas-drawer-left').count() === 0 && await page.locator('.canvas-drawer-right').count() === 1, 'Selecting priority replaces list with same-node inspector')
    await checkNeighborhood(top.gid, 1, 'both', 'Selection automatically opens exact one-step neighborhood')
    const canonicalCard = expected.nodes.find(node => node.gid === top.gid)
    assert(await page.locator('.inspector .evidence-text').first().innerText() === canonicalCard.evidence, 'Inspector uses exact canonical CSV evidence')
    const format = value => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
    const flow = await page.locator('.inspector .flow-number').allTextContents()
    assert(flow[0].includes(format(card.observed_flows.incoming_kzt)) && flow[1].includes(format(card.observed_flows.outgoing_kzt)), 'Inspector flows match complete canonical edges')
    assert(await page.getByRole('button', { name: 'AI-помощник', exact: true }).count() === 1, 'One AI launcher with inspector open')
    await page.getByRole('button', { name: 'В центре', exact: true }).click()
    await page.locator('.aml-canvas[data-settled=true]').waitFor()
    await page.waitForTimeout(700)
    const focusedBox = await canvas.boundingBox()
    await page.mouse.move(focusedBox.x + (focusedBox.width - 370) / 2, focusedBox.y + (focusedBox.height + 180 - 65) / 2)
    await page.locator('.aml-tooltip').filter({ hasText: 'GID ' + top.gid }).waitFor()
    assert((await page.locator('.aml-tooltip').first().innerText()).includes(top.gid), 'Focused client stays in uncovered canvas beside inspector')
    await page.mouse.move(5, 5)
    await page.locator('.aml-tooltip').waitFor({ state: 'hidden' })
    passed.push('Hover tooltip closes when pointer leaves canvas')
    await screenshot('project-selected-1440')
    await directions.getByRole('radio', { name: 'Входящие', exact: true }).click()
    await checkNeighborhood(top.gid, 1, 'incoming', 'Incoming filter follows sender-to-client links')
    await directions.getByRole('radio', { name: 'Исходящие', exact: true }).click()
    await checkNeighborhood(top.gid, 1, 'outgoing', 'Outgoing filter follows client-to-recipient links')
    await hops.getByRole('radio', { name: '4', exact: true }).click()
    await checkNeighborhood(top.gid, 4, 'outgoing', 'Four-step exploration follows directed paths')
    await directions.getByRole('radio', { name: 'Все связи', exact: true }).click()
    await checkNeighborhood(top.gid, 4, 'both', 'All-directions exploration preserves observed directed links')

    await page.getByRole('tab', { name: 'Связи', exact: true }).click()
    const neighbor = await page.locator('.inspector .connection-gid').first().innerText()
    await page.locator('.inspector .connection-gid').first().click()
    await waitSelection(neighbor)
    await checkNeighborhood(neighbor, 1, 'both', 'Linked-client navigation resets to one step and both directions')
    await page.getByRole('button', { name: 'Предыдущий клиент' }).click()
    await waitSelection(top.gid)
    assert(await page.locator('.node-gid').innerText() === top.gid, 'Previous-client control restores graph and inspector together')
    await checkNeighborhood(top.gid, 1, 'both', 'Returning to previous client starts with direct links')
    await canvas.click({ position: { x: 3, y: 3 } })
    assert(await canvas.getAttribute('data-selected-gid') === top.gid, 'Clicking canvas background preserves selected client')
    await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click()
    assert(await page.locator('.canvas-drawer').count() === 0 && await canvas.getAttribute('data-selected-gid') === top.gid, 'Hiding inspector keeps node investigation active')
    await canvas.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('+')
    await page.keyboard.press('f')
    await page.keyboard.press('0')
    assert(await canvas.getAttribute('data-selected-gid') === top.gid, 'Keyboard pan, zoom, focus and fit retain selected client')
    await page.keyboard.press('f')
    await page.waitForTimeout(700)
    const openCanvasBox = await canvas.boundingBox()
    const clientPoint = { x: openCanvasBox.x + openCanvasBox.width / 2, y: openCanvasBox.y + (openCanvasBox.height + 180 - 65) / 2 }
    await page.mouse.move(clientPoint.x, clientPoint.y)
    await page.locator('.aml-tooltip').filter({ hasText: 'GID ' + top.gid }).waitFor()
    await page.mouse.click(clientPoint.x, clientPoint.y)
    await page.locator('.canvas-drawer-right .node-gid').filter({ hasText: top.gid }).waitFor()
    passed.push('Real canvas node click reopens matching inspector')
    await page.getByRole('tab', { name: 'Основания', exact: true }).click()
    await page.getByText('Источник содержит итоговый приоритет без разбивки по компонентам.').waitFor()
    passed.push('Missing priority components explicitly unavailable')
    await page.getByRole('button', { name: 'Кластер ' + card.cluster_id, exact: true }).click()
    await page.locator('.aml-cluster-summary').getByText(fixture.clusters.find(cluster => cluster.cluster_id === card.cluster_id).hypothesis.trim(), { exact: true }).waitFor()
    passed.push('Cluster hypothesis matches CSV')
    await page.getByRole('button', { name: 'К графу', exact: true }).click()
    const boundary = fixture.nodes.find(node => node.depth === 4 && node.observed_flows.out_degree === 0)
    await search(boundary.gid)
    await page.getByText('Граница графа', { exact: true }).waitFor()
    passed.push('Real depth-four boundary warning')
    const seed = fixture.nodes.find(node => node.is_seed)
    await search(seed.gid)
    await page.getByText('Неполные входящие потоки', { exact: true }).waitFor()
    passed.push('Real incomplete seed inflows warning')
    await page.getByRole('textbox', { name: 'Поиск по gid' }).fill('1')
    await page.getByRole('button', { name: 'Найти', exact: true }).click()
    await page.getByText('Клиент не найден', { exact: true }).waitFor()
    assert(await page.locator('.node-gid').innerText() === seed.gid, 'Unknown GID retains selected node')
    await page.getByRole('textbox', { name: 'Поиск по gid' }).fill('')
    for (const sample of expected.spotChecks) {
      await search(sample.gid)
      await page.locator('.node-gid').filter({ hasText: sample.gid }).waitFor()
      const displayedEvidence = await page.locator('.inspector .evidence-text').first().innerText()
      const displayedPriority = Number(await page.locator('.inspector').getByRole('progressbar', { name: 'Приоритет проверки', exact: true }).getAttribute('aria-valuenow'))
      const displayedRoleScore = Number(await page.locator('.inspector').getByRole('progressbar', { name: 'Соответствие роли', exact: true }).getAttribute('aria-valuenow'))
      const incoming = fixture.edges.filter(edge => edge.dst === sample.gid).reduce((sum, edge) => sum + edge.sum_kzt, 0)
      const outgoing = fixture.edges.filter(edge => edge.src === sample.gid).reduce((sum, edge) => sum + edge.sum_kzt, 0)
      const displayedFlows = await page.locator('.inspector .flow-number').allTextContents()
      assert(displayedEvidence === sample.evidence && await page.locator(`.inspector .role-dot[data-role="${sample.role}"]`).count() === 1 &&
        Math.abs(displayedPriority - sample.priority_score * 100) < 1e-8 && Math.abs(displayedRoleScore - sample.role_score * 100) < 1e-8 &&
        displayedFlows[0].includes(format(incoming)) && displayedFlows[1].includes(format(outgoing)),
      `Arbitrary GID ${sample.gid}: role, scores and evidence match CSV; flows match directed edges`)
    }
    await page.getByRole('button', { name: 'Вся выборка', exact: true }).click()
    await page.locator('.aml-canvas[data-node-count="2248"]').waitFor()
    assert(await canvas.getAttribute('data-selected-gid') === '' && await page.locator('.canvas-drawer').count() === 0, 'Full-selection action restores entire graph and closes inspector')
    await page.getByRole('tab', { name: 'Переводы', exact: true }).click()
    assert(await page.locator('.aml-transfers tbody tr').count() === 100, 'Transfer table paginates the complete observed graph')
    const exportDownload = page.waitForEvent('download')
    await page.locator('.aml-transfers').getByRole('button', { name: 'CSV', exact: true }).click()
    assert((await exportDownload).suggestedFilename() === 'observed-transfers.csv', 'Observed graph CSV export downloads successfully')
    await page.getByRole('tab', { name: 'Граф', exact: true }).click()

    await page.getByRole('button', { name: 'Как читать граф', exact: true }).click()
    await page.getByText('Толщина связи = сумма переводов', { exact: true }).waitFor()
    passed.push('Graph legend opens with numerical and directional encodings')
    await page.getByRole('button', { name: 'Как читать граф', exact: true }).click()
    await page.getByRole('button', { name: 'Фильтры графа', exact: true }).click()
    await page.getByRole('button', { name: '20 приоритетных', exact: true }).click()
    await page.locator('.aml-canvas[data-node-count="20"]').waitFor()
    assert((await page.locator('#graph-settings').innerText()).includes('Активных фильтров: 1'), 'Active filter count explains top-20 restriction')
    await page.getByRole('spinbutton', { name: 'Минимальный объём клиента, ₸' }).fill('999999999999999')
    await page.getByText('Нет совпадений', { exact: true }).waitFor()
    assert((await page.locator('#graph-settings').innerText()).includes('Активных фильтров: 2'), 'Filters combine with clear empty-result state')
    await page.locator('#graph-settings').getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.locator('.aml-canvas[data-node-count="2248"]').waitFor()
    assert((await page.locator('#graph-settings').innerText()).includes('Активных фильтров: 0'), 'Reset restores full graph and zero active filters')
    await page.getByRole('checkbox', { name: 'Транзит', exact: true }).uncheck()
    const withoutTransit = fixture.nodes.filter(node => node.role !== 'transit').length
    await page.locator(`.aml-canvas[data-node-count="${withoutTransit}"]`).waitFor()
    assert((await page.locator('#graph-settings').innerText()).includes('Активных фильтров: 1'), 'Role filter matches calculated roles and updates active count')
    await page.locator('#graph-settings').getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    const chosenCluster = fixture.clusters[0].cluster_id
    await page.getByRole('combobox', { name: 'Сообщество клиентов', exact: true }).click()
    await page.getByRole('option', { name: 'Кластер ' + chosenCluster, exact: true }).click()
    const clusterSize = fixture.nodes.filter(node => node.cluster_id === chosenCluster).length
    await page.locator(`.aml-canvas[data-node-count="${clusterSize}"]`).waitFor()
    assert((await page.locator('#graph-settings').innerText()).includes('Активных фильтров: 1'), 'Community filter matches source cluster membership')
    await page.locator('#graph-settings').getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await page.getByRole('button', { name: 'Цвет узлов', exact: true }).click()
    await page.getByRole('radio', { name: 'Роль', exact: true }).click()
    await page.getByRole('button', { name: 'Как читать граф', exact: true }).click()
    assert((await page.locator('.aml-color-legend').innerText()).includes('Гипотезы ролей') && await page.locator('.aml-categories > span').count() === 6, 'Role coloring exposes all six role hypotheses in the graph legend')
    await page.getByRole('radio', { name: 'Кластер', exact: true }).click()
    assert((await page.locator('.aml-color-legend').innerText()).includes('Сообщества') && await page.locator('.aml-categories > span').count() === fixture.clusters.length, 'Community coloring exposes every computed cluster in the graph legend')
    await page.getByRole('radio', { name: 'Приоритет', exact: true }).click()
    await page.getByRole('button', { name: 'Как читать граф', exact: true }).click()
    await page.getByRole('button', { name: 'Закрыть фильтры графа' }).click()
    await page.getByRole('button', { name: 'На весь экран', exact: true }).click()
    await page.getByRole('button', { name: 'Выйти из полноэкранного режима', exact: true }).waitFor()
    assert(await page.evaluate(() => !!document.fullscreenElement), 'Browser fullscreen control enters fullscreen')
    await page.getByRole('button', { name: 'Выйти из полноэкранного режима', exact: true }).click()
    await page.getByRole('button', { name: 'На весь экран', exact: true }).waitFor()
    await page.getByRole('button', { name: 'AI-помощник', exact: true }).click()
    await page.getByRole('textbox', { name: 'Вопрос аналитику AI' }).waitFor()
    assert(await page.getByRole('button', { name: 'AI-помощник', exact: true }).count() === 1, 'One AI launcher while chat is open')
    assert(await page.getByRole('textbox', { name: 'Вопрос аналитику AI' }).getAttribute('placeholder') === 'Задайте вопрос…', 'Concise chat placeholder')
    await page.getByRole('button', { name: 'Закрыть панель', exact: true }).click()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await noOverflow('1920 fullscreen canvas has no page overflow')
    await page.waitForTimeout(700)
    await screenshot('project-1920')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(base)
    await canvas.waitFor()
    await noOverflow('390 mobile canvas has no page overflow')
    await search(top.gid)
    await checkNeighborhood(top.gid, 1, 'both', 'Mobile search keeps selected-node neighborhood usable')
    assert(await page.getByRole('dialog').count() === 0, 'Mobile node selection leaves canvas visible without automatic modal')
    await page.locator('.aml-canvas[data-settled=true]').waitFor()
    await page.waitForTimeout(700)
    await screenshot('project-selected-mobile')
    await page.getByRole('button', { name: 'Карточка клиента', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.locator('.node-gid').filter({ hasText: top.gid }).waitFor()
    passed.push('Mobile inspector opens explicitly for selected client')
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: 'Приоритеты', exact: true }).click()
    await page.getByRole('button', { name: 'Открыть клиента ' + fixture.top[1].gid }).click()
    await waitSelection(fixture.top[1].gid)
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert(await page.getByRole('dialog').count() === 0, 'Mobile priority choice closes drawer and returns to graph')
    await noOverflow('Mobile selected graph remains within viewport')
    await page.locator('.aml-canvas[data-settled=true]').waitFor()
    await page.waitForTimeout(700)
    await screenshot('project-mobile')
    assert(errors.length === 0, `No browser errors in real-data workflows: ${errors.join('; ')}`)

    await page.setViewportSize({ width: 1440, height: 900 })
    let release
    const gate = new Promise(resolve => { release = resolve })
    await page.route('**/project-data.json', async route => { await gate; await route.continue() })
    await page.goto(base)
    await page.getByRole('status', { name: 'Загрузка данных' }).first().waitFor()
    release()
    await canvas.waitFor()
    await page.unroute('**/project-data.json')
    passed.push('Project loading state')
    await page.route('**/project-data.json', route => route.fulfill({ json: { nodes: [], edges: [], top: [], clusters: [], metadata: { ...fixture.metadata, node_count: 0, edge_count: 0, transaction_count: 0, total_kzt: 0 } } }))
    await page.goto(base)
    await page.getByText('Нет совпадений', { exact: true }).waitFor()
    await page.unroute('**/project-data.json')
    passed.push('Empty project response')
    let fail = true
    await page.route('**/project-data.json', route => fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : route.continue())
    await page.goto(base)
    await page.locator('.graph-panel').getByText('Не удалось загрузить', { exact: true }).waitFor()
    fail = false
    await page.locator('.graph-panel').getByRole('button', { name: 'Повторить', exact: true }).click()
    await canvas.waitFor()
    await page.unroute('**/project-data.json')
    passed.push('Project failure and retry without demo fallback')
    await page.goto(base)
    await canvas.waitFor()
    assert(errors.every(error => error.includes('503')), 'Only intentional HTTP errors after recovery checks')
    return { passed, expected503: true, screenshots, nodeCount: fixture.nodes.length, linkCount: fixture.edges.length, clusters: fixture.clusters.length, totalKzt: fixture.metadata.total_kzt }
  }
  const result = await client.callTool({ name: tool.name, arguments: { code: `async (page) => { try { return await (${scenario.toString()})(page, ${JSON.stringify(baseUrl)}, ${JSON.stringify(canonical)}) } catch (error) { await page.screenshot({ path: 'qa/project-failure.png' }); throw error } }` } }, undefined, { timeout: 120000 })
  writeFileSync('qa/project-browser-report.json', JSON.stringify(result, null, 2))
  for (const item of result.content ?? []) if (item.type === 'text') console.log(item.text.split('### Ran')[0])
  if (result.isError) process.exitCode = 1
} finally { await client.close() }
