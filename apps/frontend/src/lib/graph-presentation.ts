// Canvas cannot resolve CSS variables. These match the shared light theme tokens.
export const graphPalette = {
  foreground: '#203432', muted: '#687d79', primary: '#167e70',
  unknown: '#84918e', seed: '#8c6821', labelBackground: 'rgba(255,255,255,.94)',
}
export const roleColors = { consolidator: '#168778', transit: '#528abe', distributor: '#b28534', terminal: '#647f90', coordinator: '#8972b6', peripheral: '#84918e' }
export const clusterColor = (id: number | null) => id === null ? graphPalette.unknown : `hsl(${(id * 137.508 + 190) % 360} 48% 47%)`
export const money = (value: number | null) => value === null ? 'Нет данных' : `${new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 2 }).format(value)} ₸`
