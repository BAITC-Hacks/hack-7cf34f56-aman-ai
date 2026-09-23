import { roles, type Role } from './contracts'
import { nodeScore, nodeVolume, type AMLGraphData } from './graph-adapter'

export type GraphSettings = {
  colorBy: 'risk' | 'role' | 'cluster'
  priority: 'all' | 'low' | 'medium' | 'elevated' | 'high'
  minVolume: number
  roles: Role[]
  cluster: string
  depths: number[]
  seeds: 'all' | 'seeds' | 'non-seeds'
  seedNetwork: boolean
  hideIsolated: boolean
  topN: number
  showArrows: boolean
  showLabels: boolean
  showAmounts: boolean
  showSeedRings: boolean
  animateFlow: boolean
  nodeScale: number
  linkScale: number
  labelVisibility: number
  centerForce: number
  repulsion: number
  linkForce: number
  linkDistance: number
}

export const defaultGraphSettings: GraphSettings = {
  colorBy: 'risk', priority: 'all', minVolume: 0, roles: [...roles],
  cluster: 'all', depths: [0, 1, 2, 3, 4], seeds: 'all', seedNetwork: false, hideIsolated: false, topN: 0,
  showArrows: true, showLabels: true, showAmounts: false, showSeedRings: true,
  animateFlow: false, nodeScale: 1, linkScale: 1, labelVisibility: 1,
  centerForce: 0.04, repulsion: 120, linkForce: 0.25, linkDistance: 90,
}

export type GraphPreset = 'priority' | 'volume' | 'seeds' | 'coordinators' | 'consolidators'

/** Presets replace all selection filters; appearance and force settings stay intact. */
export function applyGraphPreset(settings: GraphSettings, preset: GraphPreset | 'all', maxVolume: number): GraphSettings {
  const clean: GraphSettings = {
    ...settings, priority: 'all', minVolume: 0, roles: [...roles], cluster: 'all',
    depths: [0, 1, 2, 3, 4], seeds: 'all', seedNetwork: false, hideIsolated: false, topN: 0,
  }
  switch (preset) {
    case 'priority': return { ...clean, topN: 20 }
    case 'volume': return { ...clean, minVolume: Math.round(Math.max(0, maxVolume) * 0.25) }
    case 'seeds': return { ...clean, seedNetwork: true }
    case 'coordinators': return { ...clean, roles: ['coordinator'] }
    case 'consolidators': return { ...clean, roles: ['consolidator'] }
    default: return clean
  }
}

/** Intersect filters, then retain only links with both endpoints visible. */
export type GraphFilters = Pick<GraphSettings, 'priority' | 'minVolume' | 'roles' | 'cluster' | 'depths' | 'seeds' | 'seedNetwork' | 'hideIsolated' | 'topN'>

export function filterGraph(data: AMLGraphData, settings: GraphFilters): AMLGraphData {
  const selectedRoles = new Set(settings.roles)
  const selectedDepths = new Set(settings.depths)
  let seedNeighborhood: Set<string> | null = null
  if (settings.seedNetwork) {
    const seedIds = new Set(data.nodes.filter(node => node.is_seed).map(node => node.gid))
    seedNeighborhood = new Set(seedIds)
    for (const link of data.links) {
      if (seedIds.has(link.source)) seedNeighborhood.add(link.target)
      if (seedIds.has(link.target)) seedNeighborhood.add(link.source)
    }
  }
  const bounds = { low: [0, 0.25], medium: [0.25, 0.5], elevated: [0.5, 0.75], high: [0.75, 1] } as const
  let nodes = data.nodes.filter(node => {
    if (seedNeighborhood && !seedNeighborhood.has(node.gid)) return false
    if (!selectedRoles.has(node.role) || !selectedDepths.has(node.depth)) return false
    if (settings.cluster !== 'all' && String(node.cluster_id) !== settings.cluster) return false
    if (settings.seeds === 'seeds' && !node.is_seed || settings.seeds === 'non-seeds' && node.is_seed) return false
    if (settings.priority !== 'all') {
      const score = nodeScore(node)
      const [low, high] = bounds[settings.priority]
      if (score == null || !Number.isFinite(score) || score < low || (settings.priority === 'high' ? score > high : score >= high)) return false
    }
    if (settings.minVolume > 0) {
      const volume = nodeVolume(node)
      if (volume === null || !Number.isFinite(volume) || volume < settings.minVolume) return false
    }
    return true
  })
  if (settings.topN > 0) {
    // Top N is explicitly by investigation priority, never by inferred or missing scores.
    nodes = nodes.filter(node => node.priority_score !== null && Number.isFinite(node.priority_score))
      .sort((a, b) => (b.priority_score! - a.priority_score!) || a.gid.localeCompare(b.gid))
      .slice(0, settings.topN)
  }
  const visible = new Set(nodes.map(node => node.gid))
  const links = data.links.filter(link => visible.has(link.source) && visible.has(link.target))
  if (settings.hideIsolated) {
    const connected = new Set<string>()
    for (const link of links) { connected.add(link.source); connected.add(link.target) }
    nodes = nodes.filter(node => connected.has(node.gid))
  }
  return { ...data, nodes, links }
}
