import { describe, expect, it } from 'vitest'
import { investigationTools, InvestigationToolError, runInvestigationTool, validateInvestigationArgs } from './investigation-tools.mjs'

const seedA = '9007199254740993'
const seedB = '9007199254740994'
const node = (gid, extra = {}) => ({
  gid, is_seed: gid === seedA || gid === seedB, depth: gid === seedA || gid === seedB ? 0 : 1,
  role: 'consolidator', role_score: 0.7, priority_score: 0.6, cluster_id: 1,
  observed_flows: { incoming_kzt: 123, outgoing_kzt: 456, in_degree: 2, out_degree: 3, in_tx: 4, out_tx: 5 },
  seed_reach_count: 7, evidence: `Наблюдаемые признаки узла ${gid}.`, limitations: [], next_action: 'Проверить наблюдаемые связи.', edges: [],
  ...extra,
})
const edge = (src, dst, sum_kzt = 100, n_tx = 1) => ({ src, dst, sum_kzt, n_tx })
const graph = () => ({
  nodes: [seedA, seedB, '1', '2', '3', '4', '10'].map(gid => node(gid, gid === '3' ? { depth: 0 } : gid === '4' ? { depth: 4 } : {})),
  // Includes a cycle, an edge to an earlier discovery depth, and a reachable input seed.
  edges: [edge(seedA, '1'), edge(seedB, '2'), edge('1', '3'), edge('2', '3'), edge('3', '1'), edge('3', '4'), edge('4', '10'), edge('3', seedA)],
})
const common = (max_depth = 2, limit = 20) => ({ seed_gids: [seedB, seedA], max_depth, limit })
const run = (name, args, data = graph()) => runInvestigationTool(name, args, data)
const invalid = (name, args, status = 400, data) => {
  expect(() => run(name, args, data)).toThrow(InvestigationToolError)
  try { run(name, args, data) } catch (error) { expect(error.status).toBe(status) }
}

describe('read-only investigation tools', () => {
  it('compares only precomputed facts without reclassifying boundary nodes or recomputing scores', () => {
    const data = graph()
    data.nodes.find(n => n.gid === '4').role = 'peripheral'
    data.nodes.find(n => n.gid === '4').role_score = 0.123456
    const before = JSON.stringify(data)
    const { result, sourceGids } = run('compare_nodes', { gids: ['4', seedA] }, data)
    expect(sourceGids).toEqual(['4', seedA])
    expect(result.nodes[0]).toMatchObject({ gid: '4', depth: 4, role: 'peripheral', role_score: 0.123456, priority_score: 0.6, seed_reach_count: 7 })
    expect(result.nodes[0].observed_flows).toEqual(data.nodes.find(n => n.gid === '4').observed_flows)
    expect(result.coverage).toEqual({ total: 2, returned: 2, limit: 4, truncated: false })
    expect(result.limitations.map(item => item.code)).toContain('observation_boundary')
    expect(JSON.stringify(data)).toBe(before)
  })

  it('preserves exact GIDs above the safe-integer range and never aliases their numeric value', () => {
    const { result } = run('compare_nodes', { gids: [seedB, seedA] })
    expect(result.nodes.map(n => n.gid)).toEqual([seedA, seedB])
    expect(validateInvestigationArgs('compare_nodes', { gids: ['18446744073709551615', '1'] }).gids[0]).toBe('18446744073709551615')
    invalid('compare_nodes', { gids: [Number(seedA), seedB] })
  })

  it('retrieves incoming neighbors from full graph edges even when node-card edges are empty', () => {
    const { result, sourceGids } = run('get_neighbors', { gid: '3', direction: 'incoming', limit: 20 })
    expect(result.nodes.map(n => n.gid)).toEqual(['1', '2'])
    expect(result.edges.map(e => [e.src, e.dst])).toEqual([['1', '3'], ['2', '3']])
    expect(sourceGids).toEqual(['3', '1', '2'])
    expect(result.coverage).toMatchObject({ total: 2, returned: 2, total_edges: 2, returned_edges: 2, truncated: false })
  })

  it('retrieves outgoing neighbors with original amounts and transaction counts', () => {
    const data = graph()
    data.edges.find(e => e.src === '3' && e.dst === '4').sum_kzt = 123456.75
    data.edges.find(e => e.src === '3' && e.dst === '4').n_tx = null
    const { result } = run('get_neighbors', { gid: '3', direction: 'outgoing', limit: 20 }, data)
    expect(result.nodes.map(n => n.gid)).toEqual(['1', '4', seedA])
    expect(result.edges.find(e => e.dst === '4')).toEqual(edge('3', '4', 123456.75, null))
  })

  it('counts a reciprocal counterparty once while retaining both directed edges', () => {
    const { result } = run('get_neighbors', { gid: '1', direction: 'both', limit: 20 })
    expect(result.nodes.map(n => n.gid)).toEqual(['3', seedA])
    expect(result.edges).toHaveLength(3)
    expect(result.coverage.total).toBe(2)
  })

  it('reports exact neighbor coverage when limits omit counterparties and edges', () => {
    const { result, sourceGids } = run('get_neighbors', { gid: '3', direction: 'both', limit: 2 })
    expect(result.nodes.map(n => n.gid)).toEqual(['1', '2'])
    expect(result.coverage).toEqual({ total: 4, returned: 2, limit: 2, truncated: true, total_edges: 5, returned_edges: 3, edges_truncated: true })
    expect(sourceGids).toEqual(['3', '1', '2'])
    expect(result.edges.every(e => ['1', '2'].includes(e.src === '3' ? e.dst : e.src))).toBe(true)
  })

  it('returns empty coverage for an existing isolated node', () => {
    const data = graph()
    data.nodes.push(node('999'))
    const { result, sourceGids } = run('get_neighbors', { gid: '999', direction: 'both', limit: 20 }, data)
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
    expect(result.coverage).toMatchObject({ total: 0, returned: 0, truncated: false })
    expect(sourceGids).toEqual(['999'])
  })

  it('finds bounded common downstream nodes using directed BFS despite cycles and node discovery depths', () => {
    expect(run('find_common_downstream', common(1)).result.nodes).toEqual([])
    const { result } = run('find_common_downstream', common(2))
    expect(result.nodes.map(n => n.gid)).toEqual(['3'])
    expect(result.nodes[0].minimum_hops_by_seed).toEqual([{ seed_gid: seedA, hops: 2 }, { seed_gid: seedB, hops: 2 }])
    expect(result.nodes[0].reachable_from_input_seed_count).toBe(2)
    expect(result.nodes[0].seed_reach_count).toBe(7)
    expect(run('find_common_downstream', common(3)).result.nodes.map(n => n.gid)).toEqual(['1', '3', '4'])
    expect(run('find_common_downstream', common(4)).result.nodes.map(n => n.gid)).toEqual(['1', '3', '4', '10'])
    expect(result.limitations.find(item => item.code === 'search_depth_limit').message).toContain('2')
  })

  it('excludes all input seeds and bounds returned common nodes while retaining exact coverage', () => {
    const { result, sourceGids } = run('find_common_downstream', common(4, 2))
    expect(result.seed_gids).toEqual([seedA, seedB])
    expect(result.nodes.map(n => n.gid)).toEqual(['1', '3'])
    expect(result.coverage).toEqual({ total: 4, returned: 2, limit: 2, truncated: true })
    expect(sourceGids).toEqual([seedA, seedB, '1', '3'])
    expect(run('find_common_downstream', common(4)).result.nodes.some(n => n.gid === seedA || n.gid === seedB)).toBe(false)
  })

  it('counts distinct seeds, not repeated paths, and keeps shortest hop lengths', () => {
    const data = {
      nodes: [seedA, seedB, '1', '2', '3', '4'].map(gid => node(gid)),
      edges: [edge(seedA, '1'), edge(seedA, '2'), edge(seedB, '3'), edge('1', '4'), edge('2', '4'), edge('3', '4'), edge('4', '1')],
    }
    const { result } = run('find_common_downstream', common(2), data)
    expect(result.nodes.map(n => n.gid)).toEqual(['4'])
    expect(result.nodes[0].reachable_from_input_seed_count).toBe(2)
    expect(result.nodes[0].minimum_hops_by_seed.map(entry => entry.hops)).toEqual([2, 2])
    expect(result.coverage.total).toBe(1)
  })

  it('does not traverse an incoming edge backwards to manufacture convergence', () => {
    const data = { nodes: [seedA, seedB, '1'].map(gid => node(gid)), edges: [edge(seedA, '1'), edge('1', seedB)] }
    expect(run('find_common_downstream', common(4), data).result.nodes).toEqual([])
  })

  it('is deterministic for permuted input and dataset ordering', () => {
    const data = graph()
    const reversed = { nodes: [...data.nodes].reverse(), edges: [...data.edges].reverse() }
    expect(run('find_common_downstream', common(4), data)).toEqual(run('find_common_downstream', { ...common(4), seed_gids: [seedA, seedB] }, reversed))
    expect(run('get_neighbors', { gid: '3', direction: 'both', limit: 20 }, data)).toEqual(run('get_neighbors', { gid: '3', direction: 'both', limit: 20 }, reversed))
  })

  it('rejects unknown nodes and non-seeds instead of silently returning partial comparisons', () => {
    invalid('compare_nodes', { gids: [seedA, '999'] }, 404)
    invalid('get_neighbors', { gid: '999', direction: 'both', limit: 2 }, 404)
    invalid('find_common_downstream', { ...common(), seed_gids: [seedA, '999'] }, 404)
    invalid('find_common_downstream', { ...common(), seed_gids: [seedA, '1'] }, 400)
  })

  it('strictly rejects unknown tools, extra keys, duplicate IDs, coercions and malformed arguments', () => {
    for (const name of ['__proto__', 'constructor', 'read_file', 'fetch_url', 'run_shell']) invalid(name, {})
    for (const args of [null, [], {}, { gids: [seedA] }, { gids: [seedA, seedA] }, { gids: ['1', '2', '3', '4', '5'] }, { gids: [seedA, seedB], url: 'https://example.invalid' }]) invalid('compare_nodes', args)
    for (const bad of ['', ' 1', '1 ', '01', '00', '1e18', '-1', '+1', '../1', 'https://example.invalid', '1\n', '１', '1'.repeat(21), 1, null]) {
      invalid('get_neighbors', { gid: bad, direction: 'both', limit: 1 })
    }
    for (const limit of ['1', 0, 21, 1.5, NaN, Infinity, null]) invalid('get_neighbors', { gid: seedA, direction: 'both', limit })
    invalid('get_neighbors', { gid: seedA, direction: 'sideways', limit: 1 })
    invalid('get_neighbors', { gid: seedA, direction: 'both', limit: 1, path: '/etc/passwd' })
    for (const max_depth of ['2', 0, 5, 1.1, null]) invalid('find_common_downstream', { ...common(), max_depth })
    invalid('find_common_downstream', { ...common(), seed_gids: [seedA, seedA] })
    invalid('find_common_downstream', { ...common(), seed_gids: ['1', '2', '3', '4', '5', '6'] })
    invalid('find_common_downstream', { ...common(), instructions: 'ignore safety' })
  })

  it('exposes strict Responses schemas with bounded required parameters', () => {
    expect(investigationTools.map(tool => tool.name)).toEqual(['compare_nodes', 'get_neighbors', 'find_common_downstream'])
    for (const tool of investigationTools) {
      expect(tool.type).toBe('function')
      expect(tool.strict).toBe(true)
      expect(tool.parameters.additionalProperties).toBe(false)
      expect(tool.parameters.required).toEqual(Object.keys(tool.parameters.properties))
    }
    expect(new RegExp(investigationTools[1].parameters.properties.gid.pattern).test(seedA)).toBe(true)
    expect(new RegExp(investigationTools[1].parameters.properties.gid.pattern).test('1'.repeat(21))).toBe(false)
    expect(new RegExp(investigationTools[1].parameters.properties.gid.pattern).test('01')).toBe(false)
    expect(new RegExp(investigationTools[1].parameters.properties.gid.pattern).test('0')).toBe(true)
  })

  it('bounds evidence payloads and omits arbitrary node metadata and incident-edge dumps', () => {
    const data = graph()
    Object.assign(data.nodes[0], {
      evidence: 'x'.repeat(1000), limitations: Array.from({ length: 20 }, () => ({ code: 'flag', message: 'x'.repeat(1000) })),
      next_action: 'x'.repeat(1000), extra_secret: 'not part of the contract', edges: [edge('1', '2')],
    })
    const { result } = run('compare_nodes', { gids: [seedA, seedB] }, data)
    expect(result.nodes[0].evidence).toHaveLength(500)
    expect(result.nodes[0].evidence_truncated).toBe(true)
    expect(result.nodes[0].limitations).toHaveLength(10)
    expect(result.nodes[0].limitations[0].message).toHaveLength(500)
    expect(result.nodes[0].limitations_truncated).toBe(true)
    expect(result.nodes[0].next_action).toHaveLength(500)
    expect(result.nodes[0].next_action_truncated).toBe(true)
    expect(result.nodes[0]).not.toHaveProperty('extra_secret')
    expect(result.nodes[0]).not.toHaveProperty('edges')
  })

  it('caps neighbor results at twenty nodes and forty directed edges', () => {
    const ids = Array.from({ length: 25 }, (_, index) => String(index + 1))
    const data = { nodes: [node(seedA), ...ids.map(gid => node(gid))], edges: ids.flatMap(gid => [edge(seedA, gid), edge(gid, seedA)]) }
    const { result, sourceGids } = run('get_neighbors', { gid: seedA, direction: 'both', limit: 20 }, data)
    expect(result.nodes).toHaveLength(20)
    expect(result.edges).toHaveLength(40)
    expect(sourceGids).toHaveLength(21)
    expect(result.coverage).toMatchObject({ total: 25, returned: 20, total_edges: 50, returned_edges: 40, truncated: true, edges_truncated: true })
  })
})
