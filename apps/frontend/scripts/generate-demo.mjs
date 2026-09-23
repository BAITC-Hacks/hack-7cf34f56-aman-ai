// Synthetic UI fixtures only. This does not analyze the hackathon dataset.
import { writeFileSync } from 'node:fs'
const roles = ['consolidator', 'coordinator', 'transit', 'distributor', 'terminal', 'peripheral']
const ids = Array.from({ length: 26 }, (_, i) => (900000000000100001n + BigInt(i)).toString())
const edges = []
const add = (s, d, sum, count) => edges.push({ src: ids[s], dst: ids[d], sum_kzt: sum, n_tx: count })
for (let i = 1; i <= 6; i++) add(i, 0, 225000 + i * 87000, i + 2)
add(0, 7, 480000, 4); add(0, 8, 220000, 3); add(7, 9, 435000, 4)
add(9, 7, 45000, 1); add(8, 10, 180000, 2); add(10, 0, 20000, 1)
for (let i = 11; i < 22; i++) add(9, i, 25000 + i * 5200, 2)
add(11, 22, 95000, 2); add(12, 23, 79000, 1); add(20, 24, 45000, 1)
const nodes = ids.map((gid, i) => {
  const incoming = edges.filter(e => e.dst === gid), outgoing = edges.filter(e => e.src === gid)
  const depth = i === 25 || (i >= 1 && i <= 6) ? 0 : i >= 22 ? 4 : i === 0 ? 2 : 3
  const role = i === 0 ? 'consolidator' : i === 9 ? 'distributor' : i === 25 || depth === 4 ? 'peripheral' : depth === 0 ? 'distributor' : !outgoing.length ? 'terminal' : i === 10 ? 'coordinator' : 'transit'
  const roleScore = role === 'peripheral' ? 0.38 : +(0.94 - (i % 6) * 0.04).toFixed(2)
  const weights = [.30, .25, .15, .15, .10, .05]
  const keys = ['Роль и её значимость', 'Схождение seed-веток', 'Центральность', 'Наблюдаемый объём', 'Временные сигналы', 'Устойчивость']
  const priority_components = weights.map((weight, j) => ({ key: keys[j], weight, value: j < 4 ? Math.max(.08, .98 - i * .024 - j * .01) : null, contribution: j < 4 ? +(weight * Math.max(.08, .98 - i * .024 - j * .01)).toFixed(6) : 0, computed: j < 4 }))
  const observed_flows = { incoming_kzt: incoming.reduce((s, e) => s + e.sum_kzt, 0), outgoing_kzt: outgoing.reduce((s, e) => s + e.sum_kzt, 0), in_degree: incoming.length, out_degree: outgoing.length, in_tx: incoming.reduce((s, e) => s + e.n_tx, 0), out_tx: outgoing.reduce((s, e) => s + e.n_tx, 0) }
  const limitations = [{ code: 'synthetic', message: 'Синтетический пример интерфейса. Роли и приоритеты не являются результатом анализа датасета.' }]
  if (depth === 4) limitations.unshift({ code: 'depth_boundary', message: 'Граница наблюдения · глубина 4. Дальнейшие переводы не видны; отсутствие исходящих не доказывает удержание средств.' })
  if (depth === 0) limitations.unshift({ code: 'seed_inflow', message: 'Входящие переводы seed-клиента неполны. Наблюдаемый входящий объём не отражает все поступления.' })
  return { gid, role, role_score: roleScore, priority_score: +priority_components.reduce((s, c) => s + c.contribution, 0).toFixed(6), depth, is_seed: depth === 0, cluster_id: i === 25 ? 2 : i >= 11 ? 1 : 0, observed_flows,
    evidence: `${incoming.length} отправителей · ${outgoing.length} получателей · ${observed_flows.incoming_kzt.toLocaleString('ru-RU')} KZT входящих в демонстрационном графе.`,
    seed_reach_count: null,
    role_scores: Object.fromEntries(roles.map(r => [r, { score: r === role ? roleScore : .12, applicable: !(['terminal', 'transit'].includes(r) && (depth === 0 || depth === 4)), reason: ['terminal', 'transit'].includes(r) && (depth === 0 || depth === 4) ? 'Не применяется на этой глубине' : null }])),
    priority_components, limitations, next_action: depth === 4 ? 'Запросить исходящие переводы за пределами 4-го колена и проверить продолжение цепочки.' : depth === 0 ? 'Запросить полную историю входящих переводов за период.' : 'Проверить источники поступлений и дальнейшее движение средств за пределами наблюдаемого периода.', edges: [...incoming, ...outgoing] }
})
const top = nodes.slice(0, 20).map((n, i) => ({ rank: i + 1, gid: n.gid, role: n.role, priority_score: n.priority_score, why: n.evidence }))
const clusters = [0, 1, 2].map(cluster_id => {
  const members = nodes.filter(n => n.cluster_id === cluster_id), set = new Set(members.map(n => n.gid))
  return { cluster_id, n_nodes: members.length, n_seed: members.filter(n => n.is_seed).length, sum_kzt_internal: edges.filter(e => set.has(e.src) && set.has(e.dst)).reduce((s, e) => s + e.sum_kzt, 0), top_gids: members.slice(0, 3).map(n => n.gid), hypothesis: cluster_id === 2 ? 'Изолированный seed в демонстрационном наборе.' : 'Демонстрационная группа для проверки навигации и структуры карточки. Аналитическая гипотеза ещё не рассчитана.' }
})
writeFileSync(new URL('../public/demo.json', import.meta.url), JSON.stringify({ nodes, edges, top, clusters }, null, 2) + '\n')
