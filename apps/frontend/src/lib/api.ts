import { z } from 'zod'
import { clusterSchema, fixtureSchema, gidSchema, localGraph, nodeSchema, subgraphSchema, topSchema, type Fixture } from './contracts'

export const isDemo = import.meta.env.VITE_DATA_MODE !== 'api'
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
function demo() {
  fixture ??= request(`${import.meta.env.BASE_URL}demo.json`, fixtureSchema).catch(error => { fixture = undefined; throw error })
  return fixture
}
export const api = {
  async top(signal?: AbortSignal) { return isDemo ? (await demo()).top : request(`${base}/api/top-nodes`, topSchema, signal) },
  async node(gid: string, signal?: AbortSignal) {
    gidSchema.parse(gid)
    if (!isDemo) return request(`${base}/api/nodes/${gid}`, nodeSchema, signal)
    const node = (await demo()).nodes.find(n => n.gid === gid)
    if (!node) throw new ApiError('Клиент не найден', 404)
    return node
  },
  async search(gid: string, signal?: AbortSignal) {
    gidSchema.parse(gid)
    if (isDemo) return (await api.node(gid)).gid
    // Proposed exact-search envelope; confirm with the backend owner before integration.
    return (await request(`${base}/api/search?gid=${encodeURIComponent(gid)}`, z.object({ gid: gidSchema }), signal)).gid
  },
  async graph(gid: string, hop: 1 | 2, signal?: AbortSignal) {
    return isDemo ? localGraph(await demo(), gid, hop) : request(`${base}/api/nodes/${gid}/subgraph?hop=${hop}`, subgraphSchema, signal)
  },
  async cluster(id: number, signal?: AbortSignal) {
    if (!isDemo) return request(`${base}/api/clusters/${id}`, clusterSchema, signal)
    const cluster = (await demo()).clusters.find(c => c.cluster_id === id)
    if (!cluster) throw new ApiError('Кластер не найден', 404)
    return cluster
  },
}
