import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { loadEnv } from 'vite'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const mode = process.argv[2] || 'development'
const env = { ...loadEnv(mode, root, 'VITE_'), ...process.env }
if (mode === 'export' || !['api', 'demo'].includes(env.VITE_DATA_MODE)) {
  const localPython = join(root, '.venv', 'bin', 'python')
  const python = process.env.MONEYGRAPH_PYTHON || (existsSync(localPython) ? localPython : 'python3')
  const result = spawnSync(python, [fileURLToPath(new URL('./export-project-data.py', import.meta.url))], { cwd: root, stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    console.error('Project data could not be prepared. Install the backend Python requirements and run python main.py, then retry npm run data:project. No demo fallback was used.')
    process.exit(result.status || 1)
  }
}
