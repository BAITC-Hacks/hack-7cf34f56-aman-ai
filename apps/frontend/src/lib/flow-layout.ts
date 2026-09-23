import type { Subgraph } from './contracts'

/** Columns describe observed relations to the selection, not dataset depth. */
export function flowLayout(graph: Subgraph, gid: string) {
  const neighbors = new Map<string, { column: number; amount: number }>()
  for (const edge of graph.edges) {
    if (edge.src !== gid && edge.dst !== gid) continue
    const id = edge.src === gid ? edge.dst : edge.src
    if (id === gid) continue
    const previous = neighbors.get(id)
    neighbors.set(id, { column: previous?.column ?? (edge.src === gid ? 1 : -1), amount: (previous?.amount ?? 0) + edge.sum_kzt })
  }
  const columns = new Map<string, number>([[gid, 0]])
  for (const column of [-1, 1]) {
    [...neighbors.entries()].filter(([, n]) => n.column === column)
      .sort((a, b) => b[1].amount - a[1].amount || a[0].localeCompare(b[0]))
      .slice(0, 3).forEach(([id]) => columns.set(id, column))
  }
  // Second-hop nodes only attach to displayed first-hop nodes. No orphan nodes.
  for (const column of [-1, 1]) {
    const candidates = new Map<string, number>()
    for (const edge of graph.edges) {
      const id = columns.get(edge.src) === column ? edge.dst : columns.get(edge.dst) === column ? edge.src : null
      if (id && !columns.has(id) && !neighbors.has(id)) candidates.set(id, (candidates.get(id) ?? 0) + edge.sum_kzt)
    }
    [...candidates.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
      .forEach(([id]) => columns.set(id, column * 2))
  }
  const positions = new Map<string, { x: number; y: number }>()
  for (const column of [-2, -1, 0, 1, 2]) {
    const ids = [...columns].filter(([, c]) => c === column).map(([id]) => id)
    ids.forEach((id, index) => positions.set(id, { x: column * 265, y: (index - (ids.length - 1) / 2) * 145 }))
  }
  return {
    nodes: graph.nodes.filter(n => positions.has(n.gid)).map(n => ({ ...n, position: positions.get(n.gid)! })),
    edges: graph.edges.filter(e => positions.has(e.src) && positions.has(e.dst)),
    hiddenNodes: graph.nodes.filter(n => !positions.has(n.gid)).length,
  }
}
