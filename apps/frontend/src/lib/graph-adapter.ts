import type { NodeCard, Role, Subgraph, TopNode } from './contracts'

/** GIDs are decimal strings: the dataset's int64 identifiers exceed JS precision. */
export type AMLGraphNode = {
  gid: string
  role: Role | null
  role_score: number | null
  priority_score: number | null
  risk_score?: number | null
  cluster_id: number | null
  depth: number | null
  is_seed: boolean | null
  incoming_kzt: number | null
  outgoing_kzt: number | null
  total_volume_kzt: number | null
  in_degree: number | null
  out_degree: number | null
  evidence: string | null
}

export type AMLGraphLink = { source: string; target: string; sum_kzt: number; n_tx: number | null }
export type AMLGraphData = {
  nodes: AMLGraphNode[]
  links: AMLGraphLink[]
  coverage: { truncated: boolean; total_nodes: number | null; total_edges: number | null; limit: number }
  scope: 'demo' | 'dataset' | 'neighborhood' | 'upload'
}
export type GraphDirection = 'both' | 'incoming' | 'outgoing'

/** Enrich only supplied measurements; never infer full account metrics from visible edges. */
export function mapBackendGraph(graph: Subgraph, cards: NodeCard[] = [], top: TopNode[] = []): AMLGraphData {
  const cardById = new Map(cards.map(card => [card.gid, card]))
  const topById = new Map(top.map(item => [item.gid, item]))
  return {
    nodes: graph.nodes.map(node => {
      const card = cardById.get(node.gid)
      const incoming = card?.observed_flows.incoming_kzt ?? node.incoming_kzt ?? node.observed_flows?.incoming_kzt ?? null
      const outgoing = card?.observed_flows.outgoing_kzt ?? node.outgoing_kzt ?? node.observed_flows?.outgoing_kzt ?? null
      return {
        gid: node.gid, role: card?.role ?? node.role,
        role_score: card?.role_score ?? node.role_score ?? null,
        priority_score: card?.priority_score ?? node.priority_score ?? topById.get(node.gid)?.priority_score ?? null,
        risk_score: card?.risk_score ?? node.risk_score ?? null,
        cluster_id: node.cluster_id, depth: node.depth, is_seed: node.is_seed,
        incoming_kzt: incoming, outgoing_kzt: outgoing,
        total_volume_kzt: card?.total_volume_kzt ?? node.total_volume_kzt ?? (incoming !== null && outgoing !== null ? incoming + outgoing : null),
        in_degree: card?.observed_flows.in_degree ?? node.in_degree ?? node.observed_flows?.in_degree ?? null,
        out_degree: card?.observed_flows.out_degree ?? node.out_degree ?? node.observed_flows?.out_degree ?? null,
        evidence: card?.evidence ?? node.evidence ?? null,
      }
    }),
    links: graph.edges.map(edge => ({ source: edge.src, target: edge.dst, sum_kzt: edge.sum_kzt, n_tx: edge.n_tx })),
    coverage: { ...graph.coverage },
    scope: 'neighborhood',
  }
}

export function nodeVolume(node: AMLGraphNode): number | null {
  return node.total_volume_kzt ?? (node.incoming_kzt !== null && node.outgoing_kzt !== null ? node.incoming_kzt + node.outgoing_kzt : null)
}

export function nodeScore(node: AMLGraphNode): number | null {
  return node.risk_score ?? node.priority_score
}

/** Continuous observed-signal palette; unknown scores use a separate neutral gray. */
export function priorityColor(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return '#8290a6'
  const stops = [[0, 82, 187, 138], [0.4, 216, 207, 91], [0.65, 232, 154, 73], [1, 237, 87, 99]]
  const value = Math.max(0, Math.min(1, score))
  const index = stops.findIndex((stop, i) => i > 0 && value <= stop[0])
  const right = stops[index < 0 ? stops.length - 1 : index]
  const left = stops[Math.max(0, (index < 0 ? stops.length - 1 : index) - 1)]
  const ratio = (value - left[0]) / (right[0] - left[0])
  return `#${left.slice(1).map((channel, i) => Math.round(channel + (right[i + 1] - channel) * ratio).toString(16).padStart(2, '0')).join('')}`
}

/** Bounded log scaling for money-volume radius and transfer width. */
export function logScale(value: number | null, maximum: number, minimumSize: number, maximumSize: number): number {
  if (value === null || !Number.isFinite(value) || value <= 0 || !Number.isFinite(maximum) || maximum <= 0) return minimumSize
  const ratio = Math.log1p(Math.min(value, maximum)) / Math.log1p(maximum)
  return minimumSize + ratio * (maximumSize - minimumSize)
}

/** Directed breadth-first paths; reciprocal transfers retain distinct link IDs. */
export function neighborhood(data: AMLGraphData, gid: string, hops: 1 | 2 | 3 | 4, direction: GraphDirection): { nodeIds: Set<string>; linkIds: Set<string> } {
  const nodeIds = new Set<string>()
  const linkIds = new Set<string>()
  if (!data.nodes.some(node => node.gid === gid)) return { nodeIds, linkIds }
  const adjacency = new Map<string, { other: string; id: string }[]>()
  const add = (from: string, other: string, id: string) => {
    const entries = adjacency.get(from)
    if (entries) entries.push({ other, id })
    else adjacency.set(from, [{ other, id }])
  }
  for (const link of data.links) {
    const id = `${link.source}->${link.target}`
    if (direction !== 'incoming') add(link.source, link.target, id)
    if (direction !== 'outgoing') add(link.target, link.source, id)
  }
  nodeIds.add(gid)
  let frontier = [gid]
  for (let depth = 0; depth < hops && frontier.length; depth++) {
    const next: string[] = []
    for (const from of frontier) for (const { other, id } of adjacency.get(from) ?? []) {
      linkIds.add(id)
      if (!nodeIds.has(other)) { nodeIds.add(other); next.push(other) }
    }
    frontier = next
  }
  return { nodeIds, linkIds }
}
