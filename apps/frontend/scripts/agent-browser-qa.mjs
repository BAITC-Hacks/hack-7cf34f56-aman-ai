import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'

const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5187/'
mkdirSync('qa', { recursive: true })
const client = new Client({ name: 'moneygraph-agent-qa', version: '1.0.0' })
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--executable-path', chromium.executablePath(), '--output-dir', resolve('qa')] }))
  const tool = (await client.listTools()).tools.find(item => /^browser_run_code/.test(item.name))
  const scenario = async (page, base) => {
    const passed = [], errors = []
    const assert = (condition, label) => { if (!condition) throw new Error(label); passed.push(label) }
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width: 1440, height: 900 })
    let verification = 'unverified', responseMode = 'success', release, held
    const gid = '900000000000100001'
    const status = () => ({ available: verification !== 'not_configured', reviewerAvailable: false, dataMode: 'demo', model: 'gpt-4.1-mini', verification, lastVerifiedAt: verification === 'verified' ? '2026-09-23T12:00:00.000Z' : null, tools: ['get_node', 'get_top_nodes', 'get_cluster', 'compare_nodes', 'get_neighbors', 'find_common_downstream'] })
    const answer = () => ({ answer: `Синтетические факты [gid:${gid}]. <img src=x onerror="window.__agentXss=true"> [gid:999]`, dataMode: 'demo', sources: [{ gid, label: 'Тестовый источник' }], trace: [{ tool: 'get_node', status: 'completed' }, { tool: 'compare_nodes', status: 'completed' }, { tool: 'get_neighbors', status: 'completed' }], review: { status: 'not_requested', text: null } })
    await page.route('**/api/agent/status', route => route.fulfill({ json: status() }))
    // All provider calls in this browser regression are intercepted synthetic replies.
    await page.route('**/api/agent/chat', async route => {
      if (responseMode === 'error') { verification = 'failed'; await route.fulfill({ status: 429, json: { error: 'Тест: лимит запросов.' } }); return }
      if (responseMode === 'hold') {
        held?.()
        await new Promise(resolve => { release = resolve })
        try { await route.fulfill({ json: { ...answer(), answer: 'STALE_REPLY_SHOULD_NOT_APPEAR' } }) } catch { /* Aborted request */ }
        return
      }
      verification = 'verified'; await route.fulfill({ json: answer() })
    })
    await page.goto(base)
    await page.locator('.aml-canvas').waitFor()
    await page.getByRole('button', { name: 'AI-помощник', exact: true }).click()
    const chat = page.locator('.agent-chat')
    await chat.getByText('OpenAI настроен · вызов ещё не проверен', { exact: true }).waitFor()
    assert(await chat.getByText('Что хотите выяснить?', { exact: true }).isVisible(), 'Empty chat and honest unverified provider status')
    const question = page.getByRole('textbox', { name: 'Вопрос аналитику AI' })
    const send = async text => { await question.fill(text); await page.getByRole('button', { name: 'Отправить вопрос', exact: true }).click() }
    await send('Сравни демонстрационные узлы.')
    await chat.getByText('OpenAI · успешный вызов подтверждён', { exact: true }).waitFor()
    await chat.getByRole('button', { name: 'Шаги анализа · 3', exact: true }).click()
    await chat.getByText('Сравнение клиентов', { exact: true }).waitFor()
    await chat.getByText('Направленные связи', { exact: true }).waitFor()
    assert(await chat.locator('.chat-prose img').count() === 0 && !await page.evaluate(() => window.__agentXss), 'Model HTML is escaped, never executed')
    assert(await chat.getByRole('button', { name: '999', exact: true }).count() === 0, 'Unknown citation has no actionable link')
    assert(await chat.getByRole('button', { name: `Открыть источник ${gid}`, exact: true }).count() === 1, 'Known source is available')
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '1440x900 layout has no horizontal overflow')
    await page.screenshot({ path: 'qa/agent-trace-1440.png' })
    responseMode = 'error'; await send('Проверь ошибку.')
    await chat.getByText('Тест: лимит запросов.', { exact: true }).waitFor()
    await chat.getByText('OpenAI · последний вызов не удался', { exact: true }).waitFor()
    responseMode = 'success'; await chat.getByRole('button', { name: 'Повторить вопрос', exact: true }).click()
    await chat.getByText('OpenAI · успешный вызов подтверждён', { exact: true }).waitFor()
    assert(await chat.getByText('Тест: лимит запросов.', { exact: true }).count() === 0, 'Failure is recoverable through retry')
    responseMode = 'hold'; let started = new Promise(resolve => { held = resolve })
    await send('Медленный ответ для отмены.'); await started
    await chat.getByText('Изучаю факты…', { exact: true }).waitFor()
    await chat.getByRole('button', { name: 'Остановить ответ', exact: true }).click(); release()
    await chat.getByText('Запрос остановлен. Можно задать новый вопрос.', { exact: true }).waitFor()
    assert(await chat.getByText('STALE_REPLY_SHOULD_NOT_APPEAR', { exact: true }).count() === 0, 'Cancellation discards a late reply')
    started = new Promise(resolve => { held = resolve })
    await send('Медленный ответ для нового диалога.'); await started
    await chat.getByRole('button', { name: 'Новый диалог', exact: true }).click(); release()
    await chat.getByText('Что хотите выяснить?', { exact: true }).waitFor()
    assert(await chat.getByText('STALE_REPLY_SHOULD_NOT_APPEAR', { exact: true }).count() === 0, 'New conversation aborts old request and clears state')
    responseMode = 'success'; await send('Новый диалог работает.')
    await chat.getByRole('button', { name: 'Шаги анализа · 3', exact: true }).waitFor()
    assert(await chat.getByText('STALE_REPLY_SHOULD_NOT_APPEAR', { exact: true }).count() === 0, 'New reply is isolated from cancelled conversations')
    verification = 'not_configured'; await page.reload(); await page.getByRole('button', { name: 'AI-помощник', exact: true }).click()
    await chat.getByText('OpenAI не настроен', { exact: true }).waitFor()
    assert(await page.getByRole('textbox', { name: 'Вопрос аналитику AI' }).isDisabled(), 'Missing provider disables submission without blocking graph')
    assert(errors.length === 0, 'No browser JavaScript errors')
    return { passed, data: 'synthetic demo', providerResponses: 'intercepted', viewport: '1440x900', errors }
  }
  const result = await client.callTool({ name: tool.name, arguments: { code: `async (page) => { try { return await (${scenario.toString()})(page, ${JSON.stringify(base)}) } catch(error) { await page.screenshot({path:'qa/agent-failure.png'}); throw error } }` } }, undefined, { timeout: 90000 })
  writeFileSync('qa/agent-browser-report.json', JSON.stringify(result, null, 2))
  for (const item of result.content ?? []) if (item.type === 'text') console.log(item.text.split('### Ran')[0])
  if (result.isError) process.exitCode = 1
} finally { await client.close() }
