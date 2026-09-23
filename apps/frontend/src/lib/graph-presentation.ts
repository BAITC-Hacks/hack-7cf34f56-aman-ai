export const roleColors = { consolidator: '#a78bfa', transit: '#64b5f6', distributor: '#fbad70', terminal: '#e59bce', coordinator: '#f1cf77', peripheral: '#86b8ab' }
export const clusterColor = (id: number) => `hsl(${(id * 137.508 + 190) % 360} 64% 68%)`
export const money = (value: number | null) => value === null ? 'Нет данных' : `₸${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`
