import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { createAgentHandler } from './server/agent.mjs'

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../../', import.meta.url))
  // Vite exposes only VITE_* variables to the browser. Provider keys stay here.
  const env = { ...loadEnv(mode, envDir, ''), ...process.env }
  const agentOptions = { env, dataMode: env.VITE_DATA_MODE === 'api' ? 'api' as const : env.VITE_DATA_MODE === 'demo' ? 'demo' as const : 'project' as const }
  return {
    envDir,
    plugins: [react(), tailwindcss(), {
      name: 'moneygraph-agent',
      generateBundle() {
        // Bind the deployed server to the same data mode compiled into the UI.
        this.emitFile({ type: 'asset', fileName: 'runtime-config.json', source: JSON.stringify({ dataMode: agentOptions.dataMode }) })
      },
      configureServer(server) { server.middlewares.use(createAgentHandler(agentOptions)) },
      configurePreviewServer(server) { server.middlewares.use(createAgentHandler(agentOptions)) },
    }],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
      dedupe: ['react', 'react-dom'],
    },
    build: { rolldownOptions: { output: { codeSplitting: { groups: [
      { name: 'validation', test: /node_modules\/zod\// },
    ] } } } },
  }
})
