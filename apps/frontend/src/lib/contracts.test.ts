import { describe, expect, it } from 'vitest'
import raw from '../../public/demo.json'
import { fixtureSchema, gidSchema, localGraph, nodeSchema } from './contracts'

const fixture = fixtureSchema.parse(raw)
describe('frontend data contract', () => {
  it('keeps identifiers beyond Number.MAX_SAFE_INTEGER as exact strings', () => {
    expect(gidSchema.parse('900000000000100001')).toBe('900000000000100001')
    expect(gidSchema.safeParse(Number('900000000000100001')).success).toBe(false)
    expect(gidSchema.safeParse('9e17').success).toBe(false)
  })
  it('rejects blank starter roles, missing evidence and scores outside the contract', () => {
    expect(nodeSchema.safeParse({ ...fixture.nodes[0], role: '' }).success).toBe(false)
    expect(nodeSchema.safeParse({ ...fixture.nodes[0], evidence: '' }).success).toBe(false)
    expect(nodeSchema.safeParse({ ...fixture.nodes[0], role_score: 1.2 }).success).toBe(false)
  })
  it('preserves both directions of a cycle and includes incoming neighbors', () => {
    const node = fixture.nodes[7]
    const graph = localGraph(fixture, node.gid, 1)
    expect(graph.edges).toContainEqual(fixture.edges.find(e => e.src === node.gid && e.dst === fixture.nodes[9].gid))
    expect(graph.edges).toContainEqual(fixture.edges.find(e => e.dst === node.gid && e.src === fixture.nodes[9].gid))
    expect(graph.nodes.some(n => n.gid === fixture.nodes[0].gid)).toBe(true)
  })
  it('preserves an isolated seed rather than omitting it', () => {
    const gid = fixture.nodes[25].gid
    const graph = localGraph(fixture, gid, 2)
    expect(graph.nodes.map(n => n.gid)).toEqual([gid])
    expect(graph.edges).toEqual([])
  })
  it('caps graph views while keeping the selected node and explicit coverage', () => {
    const selected = fixture.nodes[0]
    const neighbors = Array.from({ length: 260 }, (_, i) => ({ ...selected, gid: String(i + 1) }))
    const edges = neighbors.map(n => ({ src: selected.gid, dst: n.gid, n_tx: 1, sum_kzt: 5000 }))
    const graph = localGraph({ ...fixture, nodes: [selected, ...neighbors], edges }, selected.gid, 1)
    expect(graph.nodes).toHaveLength(250)
    expect(graph.nodes.some(n => n.gid === selected.gid)).toBe(true)
    expect(graph.coverage.truncated).toBe(true)
    expect(graph.coverage.total_nodes).toBe(261)
    expect(graph.edges.every(e => graph.nodes.some(n => n.gid === e.dst))).toBe(true)
  })
  it('fixture flow values reconcile to its edges and ranking contributions', () => {
    for (const node of fixture.nodes) {
      expect(node.observed_flows.incoming_kzt).toBe(fixture.edges.filter(e => e.dst === node.gid).reduce((s, e) => s + e.sum_kzt, 0))
      expect(node.priority_score).toBeCloseTo(node.priority_components.reduce((s, c) => s + c.contribution, 0), 6)
    }
  })
})
