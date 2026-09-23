import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { chromium } from '@playwright/test'
import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import interactions from './graph-qa/interactions.mjs'
import settings from './graph-qa/settings.mjs'
import encoding from './graph-qa/encoding.mjs'

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:5173/'
if (!['localhost', '127.0.0.1'].includes(new URL(baseUrl).hostname)) throw new Error('Graph QA is restricted to a local development server.')
mkdirSync('qa', { recursive: true })
const client = new Client({ name: 'moneygraph-canvas-qa', version: '1.0' })
try {
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--executable-path', chromium.executablePath(), '--output-dir', resolve('qa')] }))
  const tool = (await client.listTools()).tools.find(t => /^browser_run_code/.test(t.name))
  if (!tool) throw new Error('Playwright MCP code tool unavailable')
  const report = {}
  for (const [name, scenario] of Object.entries({ interactions, settings, encoding })) {
    const result = await client.callTool({ name: tool.name, arguments: { code: `async (page) => { page.removeAllListeners('pageerror'); page.removeAllListeners('console'); return await (${scenario.toString()})(page, ${JSON.stringify(baseUrl)}); }` } }, undefined, { timeout: 60000 })
    report[name] = result
    writeFileSync('qa/graph-browser-report.json', JSON.stringify(report, null, 2))
    console.log(`${name}: ${result.isError ? 'FAILED' : 'passed'}`)
    if (result.isError) throw new Error(JSON.stringify(result))
  }
} finally { await client.close() }
