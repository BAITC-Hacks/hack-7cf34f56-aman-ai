import { afterEach, describe, expect, it, vi } from 'vitest'
import raw from '../../public/demo.json'

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules() })

describe('graph API integration', () => {
  it('exposes generated demo nodes through the same exact-GID lookup as the graph', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'demo')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => raw })
    vi.stubGlobal('fetch', fetch)
    const { api } = await import('./api')
    const graph = await api.network(null)
    const generatedGid = graph.nodes.at(-1)!.gid
    expect(graph.nodes).toHaveLength(2248)
    expect((await api.node(generatedGid)).gid).toBe(generatedGid)
    expect(await api.search(generatedGid)).toBe(generatedGid)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('demo.json')
  })
  it('requests only existing selected-neighborhood, node-card and top endpoints in API mode', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const selected = raw.nodes[0]
    const graphResponse = {
      nodes: raw.nodes.slice(0, 2).map(node => ({ gid: node.gid, role: node.role, cluster_id: node.cluster_id, depth: node.depth, is_seed: node.is_seed })),
      edges: [], coverage: { truncated: true, total_nodes: 350, total_edges: null, limit: 250 },
    }
    const fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('/subgraph?') ? graphResponse : url.endsWith('/top-nodes') ? raw.top : selected,
    }))
    vi.stubGlobal('fetch', fetch)
    const { api } = await import('./api')
    const graph = await api.network(selected.gid)
    expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([
      `http://localhost:8000/api/nodes/${selected.gid}`,
      `http://localhost:8000/api/nodes/${selected.gid}/subgraph?hop=2`,
      'http://localhost:8000/api/top-nodes',
    ].sort())
    expect(graph.scope).toBe('neighborhood')
    expect(graph.coverage.truncated).toBe(true)
    expect(graph.nodes[0].incoming_kzt).toBe(selected.observed_flows.incoming_kzt)
    expect(graph.nodes[1].incoming_kzt).toBeNull()
    expect(graph.nodes[1].priority_score).toBe(raw.top[1].priority_score)
  })
  it('returns an explicitly empty API selection without attempting a global endpoint', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'api')
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { api } = await import('./api')
    expect((await api.network(null)).nodes).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('project CSV data mode', () => {
  const project = { ...raw, metadata: { source: 'project', node_count: raw.nodes.length, edge_count: raw.edges.length, transaction_count: 100, total_kzt: 1000, generated_at: '2026-09-23T00:00:00Z', files: ['results/nodes_roles.csv'] } }
  it('defaults to project artifacts and never expands their nodes into demo data', async () => {
    vi.stubEnv('VITE_DATA_MODE', '')
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => project })
    vi.stubGlobal('fetch', fetch)
    const { api, dataMode, isDemo } = await import('./api')
    expect(dataMode).toBe('project'); expect(isDemo).toBe(false)
    const graph = await api.network(null)
    expect(graph.scope).toBe('dataset')
    expect(graph.nodes).toHaveLength(raw.nodes.length)
    expect(graph.links).toHaveLength(raw.edges.length)
    expect((await api.top())[0]).toEqual(raw.top[0])
    expect(await api.search(raw.nodes[0].gid)).toBe(raw.nodes[0].gid)
    expect((await api.node(raw.nodes[0].gid)).evidence).toBe(raw.nodes[0].evidence)
    expect((await api.cluster(raw.clusters[0].cluster_id)).hypothesis).toBe(raw.clusters[0].hypothesis)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('project-data.json')
  })
  it('reports missing project data without fetching demo or API', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'project')
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetch)
    const { api } = await import('./api')
    await expect(api.network(null)).rejects.toThrow('Данные проекта не подготовлены')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('project-data.json')
  })
  it('rejects a demo-shaped file without project provenance', async () => {
    vi.stubEnv('VITE_DATA_MODE', 'project')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => raw }))
    const { api } = await import('./api')
    await expect(api.network(null)).rejects.toThrow('Ответ не соответствует контракту')
  })
})
