import { z } from 'zod'

// These tools receive a server-validated full export, never browser-supplied facts.
// They have no filesystem, network, executable-code, or write capabilities.
const gid = z.string().regex(/^(0|[1-9]\d{0,19})$/)
const uniqueGids = (minimum, maximum) => z.array(gid).min(minimum).max(maximum)
  .refine(values => new Set(values).size === values.length, 'GIDs must be unique')
const argumentSchemas = new Map([
  ['compare_nodes', z.object({ gids: uniqueGids(2, 4) }).strict()],
  ['get_neighbors', z.object({ gid, direction: z.enum(['incoming', 'outgoing', 'both']), limit: z.number().int().min(1).max(20) }).strict()],
  ['find_common_downstream', z.object({ seed_gids: uniqueGids(2, 5), max_depth: z.number().int().min(1).max(4), limit: z.number().int().min(1).max(20) }).strict()],
])

const gidParameter = { type: 'string', pattern: '^(0|[1-9]\\d{0,19})$' }
const limitParameter = { type: 'integer', minimum: 1, maximum: 20 }
const tool = (name, description, properties) => ({
  type: 'function', name, description, strict: true,
  parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
})

export const investigationTools = [
  tool('compare_nodes', 'Compare 2–4 distinct nodes using precomputed roles, priorities, observed flows and evidence. GIDs must be exact decimal strings; no identity inference or score recalculation.', {
    gids: { type: 'array', items: gidParameter, minItems: 2, maxItems: 4 },
  }),
  tool('get_neighbors', 'Read immediate incoming/outgoing counterparties and directed aggregated transfers from the full observed graph. At most 20 counterparties, with coverage and observation limitations.', {
    gid: gidParameter, direction: { type: 'string', enum: ['incoming', 'outgoing', 'both'] }, limit: limitParameter,
  }),
  tool('find_common_downstream', 'Find nodes reachable from every one of 2–5 distinct actual seeds by observed directed paths of at most max_depth edges. Cycles count once, input seeds are excluded. This is structural reachability, not proof of the same funds.', {
    seed_gids: { type: 'array', items: gidParameter, minItems: 2, maxItems: 5 },
    max_depth: { type: 'integer', minimum: 1, maximum: 4 }, limit: limitParameter,
  }),
]

export class InvestigationToolError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'InvestigationToolError'
    this.status = status
  }
}

export function validateInvestigationArgs(name, args) {
  const schema = argumentSchemas.get(name)
  if (!schema) throw new InvestigationToolError('Неизвестный инструмент исследования.', 400)
  const parsed = schema.safeParse(args)
  if (!parsed.success) throw new InvestigationToolError('Некорректные параметры инструмента: проверьте строковые gid и допустимые пределы.', 400)
  return parsed.data
}

const snippet = value => typeof value === 'string' ? value.slice(0, 500) : null
const compareGids = (left, right) => {
  const a = BigInt(left); const b = BigInt(right)
  return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0
}
const coverage = (total, returned, limit) => ({ total, returned, limit, truncated: returned < total })
const baseLimitations = [
  { code: 'observed_transactions_only', message: 'Только наблюдаемые переводы внутри предоставленной выгрузки; это не полная история счёта и не баланс.' },
  { code: 'observation_boundary', message: 'Наблюдение обрывается на depth=4. Отсутствие исходящих связей не доказывает остановку средств.' },
  { code: 'incomplete_seed_inflows', message: 'Входящие потоки seed-узлов неполны.' },
  { code: 'structural_hypothesis', message: 'Роли — гипотезы для проверки, не выводы о виновности. Наличие направленного пути не доказывает движение одних и тех же средств.' },
]

function summarizeNode(node) {
  const flows = node.observed_flows
  const limitations = (node.limitations ?? []).slice(0, 10).map(item => ({ code: snippet(item.code), message: snippet(item.message) }))
  return {
    gid: node.gid, role: node.role, role_score: node.role_score, priority_score: node.priority_score,
    cluster_id: node.cluster_id, depth: node.depth, is_seed: node.is_seed,
    observed_flows: flows ? {
      incoming_kzt: flows.incoming_kzt, outgoing_kzt: flows.outgoing_kzt,
      in_degree: flows.in_degree, out_degree: flows.out_degree, in_tx: flows.in_tx, out_tx: flows.out_tx,
    } : null,
    seed_reach_count: node.seed_reach_count ?? null,
    evidence: snippet(node.evidence), limitations,
    evidence_truncated: typeof node.evidence === 'string' && node.evidence.length > 500,
    limitations_truncated: (node.limitations?.length ?? 0) > limitations.length || (node.limitations ?? []).some(item => item.code.length > 500 || item.message.length > 500),
    next_action: snippet(node.next_action),
    next_action_truncated: typeof node.next_action === 'string' && node.next_action.length > 500,
  }
}

function getNode(nodes, id) {
  const found = nodes.get(id)
  if (!found) throw new InvestigationToolError('Клиент не найден в текущем источнике данных.', 404)
  return found
}

function neighbors(args, dataset, nodes) {
  getNode(nodes, args.gid)
  // Node-card edges may be capped. Only the export's complete edge array is used.
  const incident = dataset.edges.filter(edge =>
    (args.direction !== 'outgoing' && edge.dst === args.gid) ||
    (args.direction !== 'incoming' && edge.src === args.gid))
  const counterparties = [...new Set(incident.map(edge => edge.src === args.gid ? edge.dst : edge.src))].sort(compareGids)
  const chosen = counterparties.slice(0, args.limit)
  const chosenSet = new Set(chosen)
  const selectedEdges = incident.filter(edge => chosenSet.has(edge.src === args.gid ? edge.dst : edge.src))
    .sort((left, right) => compareGids(left.src, right.src) || compareGids(left.dst, right.dst) || left.sum_kzt - right.sum_kzt || (left.n_tx ?? -1) - (right.n_tx ?? -1))
  const edges = selectedEdges.slice(0, 40).map(edge => ({ src: edge.src, dst: edge.dst, sum_kzt: edge.sum_kzt, n_tx: edge.n_tx }))
  return {
    result: {
      gid: args.gid, direction: args.direction,
      nodes: chosen.map(id => summarizeNode(getNode(nodes, id))), edges,
      coverage: { ...coverage(counterparties.length, chosen.length, args.limit), total_edges: incident.length, returned_edges: edges.length, edges_truncated: edges.length < incident.length },
      limitations: baseLimitations,
    },
    sourceGids: [...new Set([args.gid, ...chosen])],
  }
}

function commonDownstream(args, dataset, nodes) {
  const seeds = [...args.seed_gids].sort(compareGids)
  for (const seed of seeds) {
    if (!getNode(nodes, seed).is_seed) throw new InvestigationToolError('Для поиска общих потомков нужны исходные seed-узлы.', 400)
  }
  const adjacency = new Map()
  for (const edge of dataset.edges) {
    if (!adjacency.has(edge.src)) adjacency.set(edge.src, new Set())
    adjacency.get(edge.src).add(edge.dst)
  }
  const sortedAdjacency = new Map([...adjacency].map(([source, destinations]) => [source, [...destinations].sort(compareGids)]))
  const distances = seeds.map(seed => {
    const visited = new Map([[seed, 0]])
    const queue = [seed]
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index]
      const depth = visited.get(current)
      if (depth >= args.max_depth) continue
      for (const next of sortedAdjacency.get(current) ?? []) {
        if (visited.has(next)) continue
        visited.set(next, depth + 1)
        queue.push(next)
      }
    }
    return visited
  })
  const inputSeeds = new Set(seeds)
  const common = [...distances[0].keys()].filter(id => !inputSeeds.has(id) && distances.every(reached => reached.has(id))).sort(compareGids)
  const chosen = common.slice(0, args.limit)
  return {
    result: {
      seed_gids: seeds, max_depth: args.max_depth,
      nodes: chosen.map(id => ({
        ...summarizeNode(getNode(nodes, id)),
        reachable_from_input_seed_count: seeds.length,
        minimum_hops_by_seed: seeds.map((seed, index) => ({ seed_gid: seed, hops: distances[index].get(id) })),
      })),
      coverage: coverage(common.length, chosen.length, args.limit),
      limitations: [...baseLimitations, { code: 'search_depth_limit', message: `Поиск ограничен ${args.max_depth} рёбрами от каждого seed. Пустой результат не исключает более длинные пути в наблюдаемом графе.` }],
    },
    sourceGids: [...seeds, ...chosen],
  }
}

export function runInvestigationTool(name, rawArgs, dataset) {
  const args = validateInvestigationArgs(name, rawArgs)
  const nodes = new Map(dataset.nodes.map(node => [node.gid, node]))
  if (name === 'compare_nodes') {
    const gids = [...args.gids].sort(compareGids)
    return {
      result: { nodes: gids.map(id => summarizeNode(getNode(nodes, id))), coverage: coverage(gids.length, gids.length, 4), limitations: baseLimitations },
      sourceGids: gids,
    }
  }
  if (name === 'get_neighbors') return neighbors(args, dataset, nodes)
  return commonDownstream(args, dataset, nodes)
}
