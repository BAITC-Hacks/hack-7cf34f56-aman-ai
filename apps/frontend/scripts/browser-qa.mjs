import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const output = resolve('qa')
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5173/'
mkdirSync(output, { recursive: true })
const client = new Client({ name: 'moneygraph-frontend-qa', version: '1.0' })
const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--executable-path', chromium.executablePath(), '--output-dir', output] })
try {
  await client.connect(transport)
  const tools = (await client.listTools()).tools
  const runTool = tools.find(t => /^browser_run_code/.test(t.name))
  if (!runTool) throw new Error('Playwright MCP browser_run_code unavailable')
  const result = await client.callTool({ name: runTool.name, arguments: { code: `async (page) => {
    const failures = []; const requests = []; const passed = [];
    page.on('pageerror', e => failures.push(e.message));
    page.on('console', m => { if (m.type() === 'error') failures.push(m.text()); });
    page.on('requestfailed', r => { if (!(r.url().endsWith('/api/agent/status') && r.failure()?.errorText === 'net::ERR_ABORTED')) requests.push(r.url()); });
    const assert = (ok, text) => { if (!ok) throw new Error(text); passed.push(text); };
    await page.setViewportSize({width:1440,height:900});
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByRole('button', {name:'Открыть клиент 900000000000100001'}).waitFor();
    await page.locator('.aml-canvas').waitFor();
    await page.locator('.graph-bottom').filter({hasText:'2248 / 2248 клиентов'}).waitFor();
    await page.getByRole('button', {name:'Start feedback mode',exact:true}).waitFor();
    passed.push('Agentation resolves React and mounts alongside MoneyGraph');
    assert(await page.locator('.inspector').getByText('Здесь начинается проверка').isVisible(), 'Initial full Canvas graph and empty inspector');
    assert(await page.getByRole('button', {name:/Открыть клиент/}).count() === 20, 'Top-20 complete');
    await page.locator('.aml-canvas[data-settled="true"]').waitFor();
    await page.waitForTimeout(650); // Let the Canvas camera finish its fit animation.
    await page.screenshot({animations:'disabled',path:${JSON.stringify(resolve('qa/initial-desktop.png'))}});
    await page.getByRole('button', {name:'Открыть клиент 900000000000100001'}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100001'}).waitFor();
    await page.locator('.aml-canvas').waitFor();
    await page.getByRole('radio', {name:'Локальный',exact:true}).click();
    await page.locator('.graph-bottom').filter({hasText:'10 / 2248 клиентов'}).waitFor();
    passed.push('Local one-hop Canvas graph contains 10 clients');
    assert(await page.locator('[role=progressbar]').first().getAttribute('aria-valuenow') !== null, 'Score accessible value');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No desktop horizontal overflow');
    await page.locator('.aml-canvas[data-settled="true"]').waitFor();
    await page.waitForTimeout(650);
    await page.screenshot({animations:'disabled',path:${JSON.stringify(resolve('qa/selected-desktop.png'))}});
    await page.getByRole('tab', {name:'Основания', exact:true}).click();
    await page.getByText('Из чего складывается приоритет').waitFor();
    passed.push('Evidence and priority breakdown');
    await page.getByRole('tab', {name:'Связи', exact:true}).click();
    await page.locator('.inspector').getByRole('button', {name:'900000000000100002', exact:true}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100002'}).waitFor();
    assert(await page.getByText(/Входящие переводы seed-клиента неполны/).isVisible(), 'Connection navigation and seed inflow caveat');
    await page.getByRole('button', {name:'Кластер 0', exact:true}).click();
    await page.locator('.aml-cluster-summary').getByText('Кластер 0', {exact:true}).waitFor();
    await page.locator('.aml-cluster-summary').getByRole('button', {name:'900000000000100001', exact:true}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100001'}).waitFor();
    passed.push('Cluster summary and return selection');
    await page.getByRole('radio', {name:'2',exact:true}).click();
    assert(await page.getByRole('radio', {name:'2',exact:true}).getAttribute('aria-checked') === 'true', 'Two-hop local graph depth');
    await page.getByRole('textbox', {name:'Поиск по gid'}).fill('900000000000100023');
    await page.getByRole('button', {name:'Найти',exact:true}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100023'}).waitFor();
    assert(await page.getByText(/Граница наблюдения · глубина 4/).isVisible(), 'Boundary warning and exact long-ID search');
    await page.getByRole('textbox', {name:'Поиск по gid'}).fill('900000000000100026');
    await page.getByRole('button', {name:'Найти',exact:true}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100026'}).waitFor();
    await page.locator('.graph-bottom').filter({hasText:'1 / 2248 клиентов · 0 связей'}).waitFor();
    passed.push('Isolated seed remains selectable');
    await page.getByRole('textbox', {name:'Поиск по gid'}).fill('123');
    await page.getByRole('button', {name:'Найти',exact:true}).click();
    await page.getByText('Клиент не найден', {exact:true}).waitFor();
    assert(await page.locator('.node-gid').textContent()==='900000000000100026', 'Unknown search preserves valid selection');
    assert(failures.length===0, 'No console or runtime errors: '+JSON.stringify(failures));
    assert(requests.length===0, 'No failed network requests: '+JSON.stringify(requests));
    await page.getByRole('combobox', {name:'Фильтр по роли'}).click();
    await page.getByRole('option', {name:'Периферия',exact:true}).click();
    await page.getByText('Нет совпадений', {exact:true}).waitFor();
    await page.getByRole('button', {name:'Сбросить фильтр'}).click();
    assert(await page.getByRole('button', {name:/Открыть клиент/}).count()===20, 'Empty role filter and reset');
    await page.setViewportSize({width:390,height:844});
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByRole('tab', {name:'Приоритеты',exact:true}).click();
    await page.getByRole('button', {name:'Открыть клиент 900000000000100001'}).click();
    await page.getByRole('dialog').waitFor();
    await page.locator('.node-gid').waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile no horizontal overflow');
    await page.screenshot({animations:'disabled',path:${JSON.stringify(resolve('qa/mobile-inspector.png'))}});
    await page.getByRole('button', {name:'Close',exact:true}).click();
    assert(await page.getByRole('button', {name:'Карточка клиента',exact:true}).evaluate(el=>el===document.activeElement), 'Sheet closes and restores keyboard focus');
    await page.setViewportSize({width:1440,height:900});
    await page.route('**/demo.json', async route => { const response = await route.fetch(); const body = await response.json(); body.top = []; await route.fulfill({response,json:body}); });
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByText('Анализ ещё не готов', {exact:true}).waitFor();
    passed.push('Empty pipeline output is not a fabricated ranking');
    await page.unroute('**/demo.json');
    let release; const gate = new Promise(resolve => { release=resolve; });
    await page.route('**/demo.json', async route => { await gate; await route.continue(); });
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByRole('status', {name:'Загрузка данных'}).first().waitFor();
    passed.push('Deterministic loading state');
    release();
    await page.getByRole('button', {name:'Открыть клиент 900000000000100001'}).waitFor();
    await page.unroute('**/demo.json');
    let fail=true;
    await page.route('**/demo.json', async route => { if(fail) await route.fulfill({status:503,body:'Unavailable'}); else await route.continue(); });
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByText('Не удалось загрузить', {exact:true}).first().waitFor();
    fail=false;
    await page.getByRole('button', {name:'Повторить',exact:true}).first().click();
    await page.getByRole('button', {name:'Открыть клиент 900000000000100001'}).waitFor();
    passed.push('HTTP failure and retry recovery');
    await page.unroute('**/demo.json');
    await page.route('**/demo.json', async route => { const response=await route.fetch(); const body=await response.json(); body.nodes[0].gid=123; await route.fulfill({response,json:body}); });
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByText(/Ответ не соответствует контракту данных/).first().waitFor();
    passed.push('Malformed response rejected');
    await page.unroute('**/demo.json');
    assert(failures.filter(s=>!s.includes('503')).length===0, 'No unexpected runtime errors after state checks');
    await page.route('**/agentation.js*', route => route.fulfill({contentType:'application/javascript',body:'throw new Error("Simulated annotation module failure")'}));
    await page.goto(${JSON.stringify(baseUrl)});
    await page.getByText('Аннотации недоступны',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Открыть клиент 900000000000100001'}).click();
    await page.locator('.node-gid').filter({hasText:'900000000000100001'}).waitFor();
    await page.locator('.aml-canvas').waitFor();
    passed.push('Optional toolbar failure cannot blank the investigator');
    await page.unroute('**/agentation.js*');
    await page.reload();
    await page.getByRole('button', {name:'Start feedback mode',exact:true}).waitFor();
    await page.locator('.node-gid').waitFor();
    await page.locator('.aml-canvas').waitFor();
    assert(await page.getByText('Аннотации недоступны',{exact:true}).count()===0,'Toolbar recovers on reload');
    await page.screenshot({animations:'disabled',path:${JSON.stringify(resolve('qa/startup-recovered.png'))}});
    return {passed, expectedHttp503:true, expectedAnnotationFailure:true};
  }` } }, undefined, { timeout: 60000 })
  const report = JSON.stringify(result, null, 2)
  writeFileSync(resolve(output, 'browser-report.json'), report)
  console.log(report)
  if (result.isError) process.exitCode = 1
} finally { await client.close() }
