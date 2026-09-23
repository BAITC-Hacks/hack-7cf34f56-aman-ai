import { z } from 'zod'
import { clusterSchema, fixtureSchema, projectDataSchema, gidSchema, localGraph, nodeSchema, subgraphSchema, topSchema, type Fixture } from './contracts'
import { mapBackendGraph, type AMLGraphData } from './graph-adapter'
import { expandDemoFixture } from './graph-demo'

export const dataMode: 'project' | 'demo' | 'api' = import.meta.env.VITE_DATA_MODE === 'demo' ? 'demo' : import.meta.env.VITE_DATA_MODE === 'api' ? 'api' : 'project'
export const isDemo = dataMode === 'demo'
export const isLocal = dataMode !== 'api'
const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
let fixture: Promise<Fixture> | undefined
export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) { super(message); this.status = status }
}
async function request<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok) throw new ApiError(response.status === 404 ? 'Клиент не найден' : `Сервис недоступен (${response.status})`, response.status)
  const parsed = schema.safeParse(await response.json())
  if (!parsed.success) throw new ApiError('Ответ не соответствует контракту данных. Проверьте формат API.')
  return parsed.data
}
function localData() {
  fixture ??= request(`${import.meta.env.BASE_URL}${isDemo ? 'demo.json' : 'project-data.json'}`, isDemo ? fixtureSchema : projectDataSchema)
    .then(data => isDemo ? expandDemoFixture(data) : data)
    .catch(error => {
      fixture = undefined
      if (!isDemo && error instanceof ApiError && error.status === 404) throw new ApiError('Данные проекта не подготовлены. Запустите npm run data:project.', 404)
      throw error
    })
  return fixture
}
export const api = {
  async top(signal?: AbortSignal) { return isLocal ? (await localData()).top : request(`${base}/api/top-nodes`, topSchema, signal) },
  async node(gid: string, signal?: AbortSignal) {
    gidSchema.parse(gid)
    if (!isLocal) return request(`${base}/api/nodes/${gid}`, nodeSchema, signal)
    const node = (await localData()).nodes.find(n => n.gid === gid)
    if (!node) throw new ApiError('Клиент не найден', 404)
    return node
  },
  async search(gid: string, signal?: AbortSignal) {
    gidSchema.parse(gid)
    if (isLocal) return (await api.node(gid, signal)).gid
    // Proposed exact-search envelope; confirm with the backend owner before integration.
    return (await request(`${base}/api/search?gid=${encodeURIComponent(gid)}`, z.object({ gid: gidSchema }), signal)).gid
  },
  async graph(gid: string, hop: 1 | 2, signal?: AbortSignal) {
    return isLocal ? localGraph(await localData(), gid, hop) : request(`${base}/api/nodes/${gid}/subgraph?hop=${hop}`, subgraphSchema, signal)
  },
  async network(gid: string | null, signal?: AbortSignal): Promise<AMLGraphData> {
    if (isLocal) {
      const data = await localData()
      return {
        ...mapBackendGraph({ nodes: data.nodes, edges: data.edges, coverage: { truncated: false, total_nodes: data.nodes.length, total_edges: data.edges.length, limit: data.nodes.length } }, data.nodes, data.top),
        scope: isDemo ? 'demo' : 'dataset',
      }
    }
    if (!gid) return { nodes: [], links: [], coverage: { truncated: false, total_nodes: null, total_edges: null, limit: 250 }, scope: 'neighborhood' }
    gidSchema.parse(gid)
    // The current API only promises a bounded two-hop neighborhood. Do not
    // invent a global route or fetch thousands of individual account cards.
    const [graph, card, top] = await Promise.all([
      api.graph(gid, 2, signal),
      api.node(gid, signal).catch(() => undefined),
      api.top(signal).catch(() => []),
    ])
    return mapBackendGraph(graph, card ? [card] : [], top)
  },
  async cluster(id: number, signal?: AbortSignal) {
    if (!isLocal) return request(`${base}/api/clusters/${id}`, clusterSchema, signal)
    const cluster = (await localData()).clusters.find(c => c.cluster_id === id)
    if (!cluster) throw new ApiError('Кластер не найден', 404)
    return cluster
  },
}
