import { describe, expect, it } from 'vitest'
import type { AMLGraphData, AMLGraphNode } from './graph-adapter'
import { activeGraphFilterCount, applyGraphPreset, defaultGraphSettings, filterGraph, type GraphFilters } from './graph-settings'

const node = (gid: string, priority_score: number | null, extra: Partial<AMLGraphNode> = {}): AMLGraphNode => ({
  gid, priority_score, role: 'transit', role_score: null, cluster_id: 0, depth: 1, is_seed: false,
  incoming_kzt: null, outgoing_kzt: null, total_volume_kzt: null,
  in_degree: null, out_degree: null, evidence: null, ...extra,
})
const data: AMLGraphData = {
  nodes: [
    node('1001', 0.1, { is_seed: true, depth: 0, total_volume_kzt: 10 }),
    node('1002', 0.25, { total_volume_kzt: 80 }),
    node('1003', 0.5, { risk_score: 0.8, role: 'coordinator', cluster_id: 1, total_volume_kzt: 100 }),
    node('1004', 0.75, { role: 'consolidator', cluster_id: 1, depth: 4, total_volume_kzt: 200 }),
    node('1005', null), node('1006', 0.95, { total_volume_kzt: 300 }),
  ],
  links: [
    { source: '1001', target: '1002', sum_kzt: 10, n_tx: 1 },
    { source: '1002', target: '1003', sum_kzt: 20, n_tx: 2 },
    { source: '1003', target: '1004', sum_kzt: 50, n_tx: 3 },
    { source: '1004', target: '1003', sum_kzt: 25, n_tx: 1 },
  ],
  scope: 'demo', coverage: { truncated: false, total_nodes: 6, total_edges: 4, limit: 6 },
}

const ids = (graph: AMLGraphData) => graph.nodes.map(item => item.gid)

describe('AML graph filters', () => {
  it('counts only active data restrictions and clears them with reset', () => {
    const settings = { ...defaultGraphSettings, priority: 'high' as const, roles: ['transit'] as const, seedNetwork: true, repulsion: 200 }
    const filters = { ...settings, roles: [...settings.roles] }
    expect(activeGraphFilterCount(defaultGraphSettings)).toBe(0)
    expect(activeGraphFilterCount(filters)).toBe(3)
    expect(activeGraphFilterCount(applyGraphPreset(filters, 'all', 100))).toBe(0)
  })
  it('preserves unknown measurements and data provenance in the unfiltered graph', () => {
    const result = filterGraph(data, defaultGraphSettings)
    expect(ids(result)).toEqual(ids(data))
    expect(result.nodes[0]).toBe(data.nodes[0])
    expect(result.links[0]).toBe(data.links[0])
    expect(result.coverage).toBe(data.coverage)
  })

  it('keeps uploaded nodes with unknown metadata visible without inventing classifications', () => {
    const unknown = node('9007199254740993123', null, { role: null, cluster_id: null, depth: null, is_seed: null })
    const uploaded: AMLGraphData = { ...data, scope: 'upload', nodes: [unknown], links: [] }
    expect(filterGraph(uploaded, defaultGraphSettings).nodes).toEqual([unknown])
    const narrowerFilters: Partial<GraphFilters>[] = [
      { roles: ['peripheral'] }, { depths: [0] }, { cluster: '0' },
      { seeds: 'seeds' }, { seeds: 'non-seeds' }, { priority: 'low' },
    ]
    for (const filter of narrowerFilters) {
      expect(filterGraph(uploaded, { ...defaultGraphSettings, ...filter }).nodes).toEqual([])
    }
    expect(unknown).toMatchObject({ role: null, cluster_id: null, depth: null, is_seed: null, priority_score: null })
  })

  it('uses disjoint bands, supplied risk before priority, and never classifies unknown as low', () => {
    expect(ids(filterGraph(data, { ...defaultGraphSettings, priority: 'low' }))).toEqual(['1001'])
    expect(ids(filterGraph(data, { ...defaultGraphSettings, priority: 'medium' }))).toEqual(['1002'])
    expect(ids(filterGraph(data, { ...defaultGraphSettings, priority: 'elevated' }))).toEqual([])
    expect(ids(filterGraph(data, { ...defaultGraphSettings, priority: 'high' }))).toEqual(['1003', '1004', '1006'])
  })

  it('intersects volume, role, cluster and depth while keeping reciprocal transfers', () => {
    const result = filterGraph(data, {
      ...defaultGraphSettings, minVolume: 100, roles: ['consolidator', 'coordinator'], cluster: '1', depths: [1, 4],
    })
    expect(ids(result)).toEqual(['1003', '1004'])
    expect(result.links.map(link => `${link.source}->${link.target}`)).toEqual(['1003->1004', '1004->1003'])
  })

  it('removes isolation after all other filters rather than using full-network degree', () => {
    const result = filterGraph(data, { ...defaultGraphSettings, minVolume: 100, hideIsolated: true })
    expect(ids(result)).toEqual(['1003', '1004'])
    expect(filterGraph(data, { ...defaultGraphSettings, seeds: 'seeds', hideIsolated: true }).nodes).toEqual([])
  })

  it('ranks top N by known priority, excludes unknown scores, and leaves input ordering intact', () => {
    const originalIds = ids(data)
    expect(ids(filterGraph(data, { ...defaultGraphSettings, topN: 3 }))).toEqual(['1006', '1004', '1003'])
    expect(filterGraph(data, { ...defaultGraphSettings, topN: 20 }).nodes).toHaveLength(5)
    expect(ids(data)).toEqual(originalIds)
  })

  it('shows seeds and their direct incoming/outgoing neighbors without expanding a second hop', () => {
    const seedData = {
      ...data,
      nodes: data.nodes.map(item => item.gid === '1005' ? { ...item, is_seed: true } : item),
      links: [...data.links, { source: '1006', target: '1001', sum_kzt: 5, n_tx: 1 }],
    }
    const preset = applyGraphPreset(defaultGraphSettings, 'seeds', 300)
    expect(preset).toMatchObject({ seedNetwork: true, seeds: 'all' })
    const result = filterGraph(seedData, preset)
    expect(ids(result)).toEqual(['1001', '1002', '1005', '1006'])
    expect(result.links).toHaveLength(2)
    expect(ids(filterGraph(seedData, { ...preset, seeds: 'seeds' }))).toEqual(['1001', '1005'])
    expect(ids(filterGraph(seedData, { ...preset, minVolume: 100 }))).toEqual(['1006'])
  })

  it('resets conflicting filters for quick presets and preserves display/physics choices', () => {
    const settings = {
      ...defaultGraphSettings, cluster: '7', depths: [4], minVolume: 900, priority: 'high' as const,
      seeds: 'non-seeds' as const, seedNetwork: true, hideIsolated: true, topN: 50, nodeScale: 1.5, repulsion: 200,
    }
    const preset = applyGraphPreset(settings, 'coordinators', 1000)
    expect(preset).toMatchObject({
      cluster: 'all', depths: [0, 1, 2, 3, 4], roles: ['coordinator'], minVolume: 0,
      seeds: 'all', seedNetwork: false, priority: 'all', hideIsolated: false, topN: 0, nodeScale: 1.5, repulsion: 200,
    })
    expect(ids(filterGraph(data, preset))).toEqual(['1003'])
  })
})
