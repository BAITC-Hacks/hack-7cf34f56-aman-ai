import { roles, type Fixture, type NodeCard, type Role } from './contracts'
import { mapBackendGraph, type AMLGraphData } from './graph-adapter'

export const DEMO_NODE_COUNT = 2248
export const DEMO_EDGE_COUNT = 3119
const DEMO_TRANSACTION_COUNT = 4840

/**
 * A reproducible, explicitly synthetic performance fixture. The original 26
 * investigation examples, including their isolated seed and reciprocal flows,
 * remain unchanged. Additional IDs never come from the production dataset.
 */
export function expandDemoFixture(original: Fixture): Fixture {
  if (original.nodes.length >= DEMO_NODE_COUNT) return original
  let randomState = 0x4d475250
  const random = () => {
    randomState ^= randomState << 13
    randomState ^= randomState >>> 17
    randomState ^= randomState << 5
    return (randomState >>> 0) / 4294967296
  }
  const targetDepths = [81, 472, 462, 789, 444]
  const existingByDepth = targetDepths.map((_, depth) => original.nodes.filter(node => node.depth === depth).length)
  const descriptors: { gid: string; depth: number; cluster_id: number }[] = []
  for (let depth = 0; depth <= 4; depth++) {
    for (let i = existingByDepth[depth]; i < targetDepths[depth]; i++) {
      const index = descriptors.length
      descriptors.push({ gid: (900000000001000001n + BigInt(index)).toString(), depth, cluster_id: 3 + (index % 8) })
    }
  }
  const generatedEdges: Fixture['edges'] = []
  const edgeKeys = new Set<string>()
  const add = (source: typeof descriptors[number], target: typeof descriptors[number], amount?: number) => {
    const key = `${source.gid}->${target.gid}`
    if (source.gid === target.gid || edgeKeys.has(key)) return false
    edgeKeys.add(key)
    generatedEdges.push({ src: source.gid, dst: target.gid, sum_kzt: amount ?? 5000 + Math.round(random() ** 4 * 9000) * 1000, n_tx: 1 })
    return true
  }
  const byClusterDepth = new Map<string, typeof descriptors>()
  for (const node of descriptors) {
    const key = `${node.cluster_id}:${node.depth}`
    const members = byClusterDepth.get(key)
    if (members) members.push(node)
    else byClusterDepth.set(key, [node])
  }
  // Each new depth has a real incoming path from the previous depth. Seed hubs
  // and a few cross-community transfers make the topology useful for tracing.
  for (const node of descriptors) {
    if (node.depth === 0) continue
    const parents = byClusterDepth.get(`${node.cluster_id}:${node.depth - 1}`)!
    const parent = parents[Math.floor(random() ** 2 * parents.length)]
    add(parent, node)
  }
  const hubs = Array.from({ length: 8 }, (_, index) => byClusterDepth.get(`${index + 3}:0`)![0])
  for (const hub of hubs) {
    for (const seed of byClusterDepth.get(`${hub.cluster_id}:0`)!.slice(1)) add(hub, seed)
  }
  for (let index = 0; index < hubs.length - 1; index++) {
    add(hubs[index], hubs[index + 1], 18000000 + index * 3100000)
    add(hubs[index + 1], hubs[index], 900000 + index * 175000)
  }
  const sources = descriptors.filter(node => node.depth < 4)
  const targetEdgeCount = DEMO_EDGE_COUNT - original.edges.length
  while (generatedEdges.length < targetEdgeCount) {
    const source = sources[Math.floor(random() * sources.length)]
    const targetDepth = Math.floor(random() * (source.depth + 2))
    const targetCluster = random() < 0.94 ? source.cluster_id : 3 + Math.floor(random() * 8)
    const targets = byClusterDepth.get(`${targetCluster}:${targetDepth}`)!
    add(source, targets[Math.floor(random() * targets.length)])
  }
  // Preserve original transaction counts and make the complete demonstration
  // agree with the documented dataset scale without pretending it is real data.
  const existingTransactions = original.edges.reduce((sum, edge) => sum + (edge.n_tx ?? 0), 0)
  const extraTransactions = DEMO_TRANSACTION_COUNT - existingTransactions - generatedEdges.length
  for (let index = 0; index < extraTransactions; index++) {
    const edge = generatedEdges[index % generatedEdges.length]
    edge.n_tx = (edge.n_tx ?? 0) + 1
  }
  const incoming = new Map<string, Fixture['edges']>()
  const outgoing = new Map<string, Fixture['edges']>()
  for (const edge of generatedEdges) {
    const inEdges = incoming.get(edge.dst)
    if (inEdges) inEdges.push(edge)
    else incoming.set(edge.dst, [edge])
    const outEdges = outgoing.get(edge.src)
    if (outEdges) outEdges.push(edge)
    else outgoing.set(edge.src, [edge])
  }
  const generatedNodes: NodeCard[] = descriptors.map((descriptor, index) => {
    const inEdges = incoming.get(descriptor.gid) ?? []
    const outEdges = outgoing.get(descriptor.gid) ?? []
    const boundary = descriptor.depth === 4
    const seed = descriptor.depth === 0
    const role: Role = boundary ? 'peripheral' : index % 137 === 0 ? 'coordinator' : inEdges.length >= 6 ? 'consolidator' : outEdges.length >= 8 ? 'distributor' : !outEdges.length ? 'terminal' : inEdges.length && outEdges.length ? 'transit' : 'peripheral'
    const roleScore = +(0.42 + random() * 0.53).toFixed(3)
    const priority = +(index % 137 === 0 ? 0.91 + random() * 0.07 : 0.03 + random() ** 1.8 * 0.71).toFixed(3)
    const observed = {
      incoming_kzt: inEdges.reduce((sum, edge) => sum + edge.sum_kzt, 0),
      outgoing_kzt: outEdges.reduce((sum, edge) => sum + edge.sum_kzt, 0),
      in_degree: inEdges.length, out_degree: outEdges.length,
      in_tx: inEdges.reduce((sum, edge) => sum + (edge.n_tx ?? 0), 0),
      out_tx: outEdges.reduce((sum, edge) => sum + (edge.n_tx ?? 0), 0),
    }
    const limitations = [{ code: 'synthetic', message: 'Синтетический пример для проверки интерфейса и производительности. Оценки не являются анализом исходного датасета.' }]
    if (boundary) limitations.push({ code: 'depth_boundary', message: 'Граница графа · глубина 4. Исходящие переводы за этой границей не видны; отсутствие исходящего потока не доказывает удержание средств.' })
    if (seed) limitations.push({ code: 'seed_inflow', message: 'Входящие переводы исходного клиента неполны. Наблюдаемый объём не отражает все поступления.' })
    return {
      ...descriptor, is_seed: seed, role, role_score: roleScore, priority_score: priority,
      observed_flows: observed,
      evidence: `Синтетический пример: ${inEdges.length} отправителей, ${outEdges.length} получателей; ${observed.incoming_kzt.toLocaleString('ru-RU')} KZT входящих и ${observed.outgoing_kzt.toLocaleString('ru-RU')} KZT исходящих. Роль — демонстрационная гипотеза.`,
      seed_reach_count: null,
      role_scores: Object.fromEntries(roles.map(candidate => {
        const applicable = !(['terminal', 'transit'].includes(candidate) && (seed || boundary))
        return [candidate, { score: applicable ? candidate === role ? roleScore : 0.12 : null, applicable, reason: applicable ? null : 'Не применяется на этой глубине' }]
      })) as NodeCard['role_scores'],
      priority_components: [{ key: 'Синтетический приоритет для проверки интерфейса', value: priority, weight: 1, contribution: priority, computed: true }],
      limitations,
      next_action: boundary ? 'Запросить исходящие переводы за пределами глубины 4.' : seed ? 'Запросить полную историю входящих переводов за период.' : 'Проверить источники и дальнейшее движение средств.',
      edges: [...inEdges, ...outEdges],
    }
  })
  const generatedClusters = hubs.map(hub => {
    const members = generatedNodes.filter(node => node.cluster_id === hub.cluster_id)
    const membersSet = new Set(members.map(node => node.gid))
    return {
      cluster_id: hub.cluster_id, n_nodes: members.length, n_seed: members.filter(node => node.is_seed).length,
      sum_kzt_internal: generatedEdges.filter(edge => membersSet.has(edge.src) && membersSet.has(edge.dst)).reduce((sum, edge) => sum + edge.sum_kzt, 0),
      top_gids: [...members].sort((a, b) => b.priority_score - a.priority_score).slice(0, 3).map(node => node.gid),
      hypothesis: 'Синтетическое сообщество для проверки фильтров и трассировки; аналитическая гипотеза по данным не рассчитана.',
    }
  })
  return { nodes: [...original.nodes, ...generatedNodes], edges: [...original.edges, ...generatedEdges], top: original.top, clusters: [...original.clusters, ...generatedClusters] }
}

export function demoGraph(fixture: Fixture): AMLGraphData {
  const graph = mapBackendGraph({
    nodes: fixture.nodes,
    edges: fixture.edges,
    coverage: { truncated: false, total_nodes: fixture.nodes.length, total_edges: fixture.edges.length, limit: fixture.nodes.length },
  }, fixture.nodes, fixture.top)
  return { ...graph, scope: 'demo' }
}
