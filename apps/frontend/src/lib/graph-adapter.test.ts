import { describe, expect, it } from 'vitest'
import raw from '../../public/demo.json'
import { fixtureSchema, subgraphSchema } from './contracts'
import { logScale, mapBackendGraph, neighborhood, nodeScore, nodeVolume, priorityColor, type AMLGraphData } from './graph-adapter'
import { DEMO_EDGE_COUNT, DEMO_NODE_COUNT, demoGraph, expandDemoFixture } from './graph-demo'

const fixture = fixtureSchema.parse(raw)
const selected = fixture.nodes[0]
const sparseGraph = subgraphSchema.parse({
  nodes: [{ gid: selected.gid, role: selected.role, cluster_id: 0, depth: 2, is_seed: false }],
  edges: [], coverage: { truncated: true, total_nodes: null, total_edges: null, limit: 250 },
})

describe('normalized graph adapter', () => {
  it('preserves exact int64 decimal IDs and leaves absent metrics unknown', () => {
    const graph = mapBackendGraph(sparseGraph)
    expect(graph.nodes[0].gid).toBe('900000000000100001')
    expect(graph.nodes[0].priority_score).toBeNull()
    expect(graph.nodes[0].incoming_kzt).toBeNull()
    expect(graph.nodes[0].total_volume_kzt).toBeNull()
    expect(graph.nodes[0].in_degree).toBeNull()
    expect(graph.nodes[0].evidence).toBeNull()
    expect(graph.coverage).toEqual(sparseGraph.coverage)
    expect(graph.scope).toBe('neighborhood')
  })
  it('accepts supplied graph metrics and prefers backend risk over priority', () => {
    const response = subgraphSchema.parse({ ...sparseGraph, nodes: [{ ...sparseGraph.nodes[0], risk_score: 0, priority_score: 0.95, role_score: 0.75, incoming_kzt: 1234, outgoing_kzt: null, in_degree: 2 }] })
    const node = mapBackendGraph(response).nodes[0]
    expect(nodeScore(node)).toBe(0)
    expect(nodeVolume(node)).toBeNull()
    expect(node.incoming_kzt).toBe(1234)
    expect(node.role_score).toBe(0.75)
    expect(node.in_degree).toBe(2)
  })
  it('enriches full observed metrics from a matching card and top score only from a matching ID', () => {
    const enriched = mapBackendGraph(sparseGraph, [selected], fixture.top).nodes[0]
    expect(enriched.total_volume_kzt).toBe(selected.observed_flows.incoming_kzt + selected.observed_flows.outgoing_kzt)
    expect(enriched.evidence).toBe(selected.evidence)
    const topOnly = mapBackendGraph(sparseGraph, [], fixture.top).nodes[0]
    expect(topOnly.priority_score).toBe(fixture.top[0].priority_score)
    expect(topOnly.role_score).toBeNull()
    expect(topOnly.total_volume_kzt).toBeNull()
    expect(mapBackendGraph(sparseGraph, [fixture.nodes[1]], [fixture.top[1]]).nodes[0].priority_score).toBeNull()
  })
})

describe('graph money and score scales', () => {
  it('bounds logarithmic scales without allowing one transfer to dominate', () => {
    expect(logScale(0, 1000000000, 3, 18)).toBe(3)
    expect(logScale(null, 1000000000, 3, 18)).toBe(3)
    expect(logScale(1000000000, 1000000000, 3, 18)).toBe(18)
    expect(logScale(9000000000, 1000000000, 3, 18)).toBe(18)
    expect(logScale(1000000, 1000000000, 3, 18)).toBeGreaterThan(12)
    expect(logScale(1, 0, 0.5, 3)).toBe(0.5)
    expect(logScale(Number.NaN, 100, 0.5, 3)).toBe(0.5)
  })
  it('interpolates the priority palette and distinguishes missing scores from zero', () => {
    expect(priorityColor(0)).toBe('#52bb8a')
    expect(priorityColor(1)).toBe('#ed5763')
    expect(priorityColor(-1)).toBe(priorityColor(0))
    expect(priorityColor(2)).toBe(priorityColor(1))
    expect(priorityColor(null)).not.toBe(priorityColor(0))
    expect(priorityColor(0.4)).not.toBe(priorityColor(0.41))
  })
})

describe('directed graph neighborhoods', () => {
  const graph: AMLGraphData = {
    ...mapBackendGraph(sparseGraph),
    nodes: ['1', '2', '3', '4', '5', '6', '7'].map(gid => ({ ...mapBackendGraph(sparseGraph).nodes[0], gid })),
    links: [['1', '2'], ['2', '1'], ['2', '3'], ['3', '4'], ['4', '5'], ['6', '1']].map(([source, target]) => ({ source, target, sum_kzt: 5000, n_tx: null })),
  }
  it('keeps reciprocal flows distinct and honors the selected direction', () => {
    expect(neighborhood(graph, '1', 1, 'outgoing')).toEqual({ nodeIds: new Set(['1', '2']), linkIds: new Set(['1->2']) })
    expect(neighborhood(graph, '1', 1, 'incoming')).toEqual({ nodeIds: new Set(['1', '2', '6']), linkIds: new Set(['2->1', '6->1']) })
    expect(neighborhood(graph, '1', 1, 'both').linkIds).toEqual(new Set(['1->2', '2->1', '6->1']))
  })
  it('limits traversal by hops and retains isolated selections', () => {
    expect(neighborhood(graph, '1', 2, 'outgoing').nodeIds).toEqual(new Set(['1', '2', '3']))
    expect(neighborhood(graph, '1', 3, 'outgoing').nodeIds).toEqual(new Set(['1', '2', '3', '4']))
    expect(neighborhood(graph, '1', 4, 'outgoing').nodeIds).toEqual(new Set(['1', '2', '3', '4', '5']))
    expect(neighborhood(graph, '7', 4, 'both')).toEqual({ nodeIds: new Set(['7']), linkIds: new Set() })
    expect(neighborhood(graph, '999', 4, 'both')).toEqual({ nodeIds: new Set(), linkIds: new Set() })
  })
})

describe('full-size synthetic graph fixture', () => {
  const expanded = expandDemoFixture(fixture)
  it('is deterministic, keeps the original examples, and matches target scale', () => {
    expect(fixtureSchema.safeParse(expanded).success).toBe(true)
    expect(expanded.nodes).toHaveLength(DEMO_NODE_COUNT)
    expect(expanded.edges).toHaveLength(DEMO_EDGE_COUNT)
    expect(expanded.edges.reduce((sum, edge) => sum + (edge.n_tx ?? 0), 0)).toBe(4840)
    expect(expanded.nodes.slice(0, fixture.nodes.length)).toEqual(fixture.nodes)
    expect(expanded.edges.slice(0, fixture.edges.length)).toEqual(fixture.edges)
    expect(expanded.top).toEqual(fixture.top)
    expect(expandDemoFixture(fixture).edges).toEqual(expanded.edges)
    expect(expandDemoFixture(fixture).nodes.map(node => node.priority_score)).toEqual(expanded.nodes.map(node => node.priority_score))
    expect(expanded.nodes.filter(node => node.is_seed)).toHaveLength(81)
    expect(expanded.nodes.filter(node => node.depth === 4)).toHaveLength(444)
  })
  it('has valid unique endpoints, reciprocal examples, and reconciled measurements', () => {
    const ids = new Set(expanded.nodes.map(node => node.gid))
    const keys = new Set(expanded.edges.map(edge => `${edge.src}->${edge.dst}`))
    expect(ids.size).toBe(DEMO_NODE_COUNT)
    expect(keys.size).toBe(DEMO_EDGE_COUNT)
    expect(expanded.edges.every(edge => ids.has(edge.src) && ids.has(edge.dst))).toBe(true)
    expect(expanded.edges.some(edge => keys.has(`${edge.dst}->${edge.src}`))).toBe(true)
    const graph = demoGraph(expanded)
    expect(graph.scope).toBe('demo')
    expect(graph.coverage.truncated).toBe(false)
    expect(neighborhood(graph, fixture.nodes[25].gid, 4, 'both').nodeIds.size).toBe(1)
    for (const node of expanded.nodes) {
      const incoming = node.edges.filter(edge => edge.dst === node.gid)
      const outgoing = node.edges.filter(edge => edge.src === node.gid)
      expect(node.observed_flows.incoming_kzt).toBe(incoming.reduce((sum, edge) => sum + edge.sum_kzt, 0))
      expect(node.observed_flows.outgoing_kzt).toBe(outgoing.reduce((sum, edge) => sum + edge.sum_kzt, 0))
      expect(node.observed_flows.in_degree).toBe(incoming.length)
      expect(node.observed_flows.out_degree).toBe(outgoing.length)
      if (node.depth === 4) {
        expect(node.role).not.toBe('terminal')
        expect(node.observed_flows.out_degree).toBe(0)
        expect(node.limitations.some(item => item.code === 'depth_boundary')).toBe(true)
      }
    }
    expect(expanded.nodes.some(node => node.priority_score > 0.9)).toBe(true)
    expect(expanded.nodes.some(node => node.priority_score < 0.1)).toBe(true)
  })
})
