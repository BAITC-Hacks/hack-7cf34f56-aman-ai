import { z } from 'zod'

export const roles = ['consolidator', 'transit', 'distributor', 'terminal', 'coordinator', 'peripheral'] as const
export const gidSchema = z.string().regex(/^\d+$/, 'gid must be decimal text')
const score = z.number().finite().min(0).max(1)
const count = z.number().int().nonnegative()
const amount = z.number().finite().nonnegative()
export const roleSchema = z.enum(roles)
export type Role = z.infer<typeof roleSchema>
export const edgeSchema = z.object({ src: gidSchema, dst: gidSchema, sum_kzt: amount, n_tx: count.nullable() })
export const graphNodeSchema = z.object({ gid: gidSchema, role: roleSchema, cluster_id: count, depth: count.max(4), is_seed: z.boolean() })
export const nodeSchema = graphNodeSchema.extend({
  role_score: score, priority_score: score, evidence: z.string().min(1),
  observed_flows: z.object({ incoming_kzt: amount, outgoing_kzt: amount, in_degree: count, out_degree: count, in_tx: count, out_tx: count }),
  seed_reach_count: count.nullable(),
  role_scores: z.record(roleSchema, z.object({ score: score.nullable(), applicable: z.boolean(), reason: z.string().nullable() })),
  priority_components: z.array(z.object({ key: z.string(), value: score.nullable(), weight: score, contribution: score, computed: z.boolean() })),
  limitations: z.array(z.object({ code: z.string(), message: z.string() })),
  next_action: z.string().nullable(), edges: z.array(edgeSchema),
})
export const topSchema = z.array(z.object({ rank: count.positive(), gid: gidSchema, role: roleSchema, priority_score: score, why: z.string().min(1) }))
export const subgraphSchema = z.object({ nodes: z.array(graphNodeSchema).max(250), edges: z.array(edgeSchema), coverage: z.object({ truncated: z.boolean(), total_nodes: count.nullable(), total_edges: count.nullable(), limit: count.positive() }) })
export const clusterSchema = z.object({ cluster_id: count, n_nodes: count, n_seed: count, sum_kzt_internal: amount, top_gids: z.array(gidSchema), hypothesis: z.string() })
export const fixtureSchema = z.object({ nodes: z.array(nodeSchema), top: topSchema, edges: z.array(edgeSchema), clusters: z.array(clusterSchema) })
export type NodeCard = z.infer<typeof nodeSchema>
export type TopNode = z.infer<typeof topSchema>[number]
export type Subgraph = z.infer<typeof subgraphSchema>
export type Cluster = z.infer<typeof clusterSchema>
export type Fixture = z.infer<typeof fixtureSchema>

/** Incident-edge neighborhood: scope is undirected, returned transfers are directed. */
export function localGraph(data: Fixture, gid: string, hop: 1 | 2): Subgraph {
  const found = new Set([gid])
  for (let step = 0; step < hop; step++) {
    const frontier = new Set(found)
    for (const edge of data.edges) {
      if (frontier.has(edge.src)) found.add(edge.dst)
      if (frontier.has(edge.dst)) found.add(edge.src)
    }
  }
  const selected = [gid, ...[...found].filter(id => id !== gid).sort()].slice(0, 250)
  const visible = new Set(selected)
  return subgraphSchema.parse({ nodes: data.nodes.filter(n => visible.has(n.gid)), edges: data.edges.filter(e => visible.has(e.src) && visible.has(e.dst)), coverage: {
    truncated: found.size > visible.size, total_nodes: found.size,
    total_edges: data.edges.filter(e => found.has(e.src) && found.has(e.dst)).length, limit: 250,
  } })
}
