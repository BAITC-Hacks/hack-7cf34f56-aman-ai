import type { Role } from './contracts'
export const roleLabels: Record<Role, string> = { consolidator: 'Консолидация', transit: 'Транзит', distributor: 'Распределение', terminal: 'Конечный получатель', coordinator: 'Координация', peripheral: 'Периферия' }
export const amount = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)
export const compact = (value: number) => new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
export const percent = (value: number) => `${Math.round(value * 100)}%`
export const shortGid = (gid: string) => `…${gid.slice(-6)}`
