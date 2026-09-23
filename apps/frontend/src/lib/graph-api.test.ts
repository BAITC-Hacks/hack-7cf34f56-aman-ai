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
