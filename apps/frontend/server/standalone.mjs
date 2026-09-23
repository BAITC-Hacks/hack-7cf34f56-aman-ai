import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createAgentHandler } from './agent.mjs'

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url))
if (existsSync(envFile)) process.loadEnvFile(envFile)
const handler = createAgentHandler({ env: process.env, dataMode: process.env.VITE_DATA_MODE === 'api' ? 'api' : 'demo' })
const server = createServer((req, res) => handler(req, res, () => { res.writeHead(404); res.end() }))
const port = Number(process.env.AGENT_PORT || 8787)
server.listen(port, '127.0.0.1', () => console.log(`MoneyGraph agent: http://127.0.0.1:${port}`))
