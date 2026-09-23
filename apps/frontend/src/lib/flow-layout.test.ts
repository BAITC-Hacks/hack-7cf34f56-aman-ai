import raw from '../../public/demo.json'
import { describe, expect, it } from 'vitest'
import { fixtureSchema, localGraph } from './contracts'
import { flowLayout } from './flow-layout'
import { csvText } from './export'
const data = fixtureSchema.parse(raw)
describe('readable flow layout', () => {
  it('places senders before the selected node and recipients after it, without overlaps', () => {
    const graph = localGraph(data, data.top[0].gid, 1)
    const layout = flowLayout(graph, data.top[0].gid)
    expect(layout.nodes.length).toBeLessThanOrEqual(7)
    expect(layout.hiddenNodes + layout.nodes.length).toBe(graph.nodes.length)
    const positions = new Map(layout.nodes.map(n => [n.gid, n.position]))
    expect(positions.get(data.top[0].gid)).toEqual({ x: 0, y: 0 })
    expect(new Set(layout.nodes.map(n => `${n.position.x}:${n.position.y}`)).size).toBe(layout.nodes.length)
    for (const edge of layout.edges) {
      expect(graph.edges).toContainEqual(edge)
      if (edge.dst === data.top[0].gid) expect(positions.get(edge.src)!.x).toBeLessThan(0)
      if (edge.src === data.top[0].gid) expect(positions.get(edge.dst)!.x).toBeGreaterThan(0)
    }
  })
  it('preserves real directions in a cycle and keeps an isolated seed visible', () => {
    const graph = localGraph(data, '900000000000100008', 2)
    const layout = flowLayout(graph, '900000000000100008')
    layout.edges.forEach(e => expect(graph.edges).toContainEqual(e))
    expect(layout.nodes.some(n => n.gid === '900000000000100008')).toBe(true)
    expect(flowLayout(localGraph(data, '900000000000100026', 1), '900000000000100026').nodes).toHaveLength(1)
  })
  it('exports exact decimal IDs and protects spreadsheet cells', () => {
    const csv = csvText(['gid', 'why', 'missing'], [['900000000000100001', '=SUM(1,2)', null]])
    expect(csv).toContain('"900000000000100001"')
    expect(csv).toContain('"\'=SUM(1,2)"')
    expect(csv).toContain(',""')
  })
})
