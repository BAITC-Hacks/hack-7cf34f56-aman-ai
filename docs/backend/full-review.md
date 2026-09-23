# Полный предсабмишн-ревью MoneyGraph Investigator

**Дата проверки:** 2026-09-23
**Режим:** read-only аудит production-аналитики, исходных Parquet и фактических CSV. Frontend не проверялся и не изменялся.

> Historical pre-completion audit. Findings were addressed in the subsequent completion task; see [completion-report.md](completion-report.md) for current status and measured validation.

## 1. Executive summary

Детерминированное ядро построения графа, Seed Convergence, Louvain, CSV-выгрузки и базовые проверки работают на реальном наборе данных: 11/11 тестов проходят, полный расчёт занимает около секунды, а три обязательных CSV байт-в-байт совпадают при двух последовательных запусках в проверенном виртуальном окружении.

Однако статус **READY AFTER FIXES**, а не READY. Есть три практических препятствия для защиты:

1. **CRITICAL — README не позволяет жюри воспроизвести backend на чистой машине.** В нём есть только запуск frontend; отсутствуют установка Python-зависимостей, команда backend, описание CSV, ролей, ограничений и масштабирования. В текущей shell-среде команда `python main.py` не существует до выбора/активации Python-окружения, а README этого не объясняет.
2. **CRITICAL — роль `peripheral` получает несовместимый с выбранной ролью `role_score` у 406 из 511 назначенных Peripheral.** В том числе у всех 387 depth=4 Peripheral теоретический, но ineligible Terminal score уменьшает Peripheral score. Это противоречит смыслу `role_score`: пользователь видит почти нулевую уверенность в выбранной Peripheral-роли, хотя среди *eligible* ролей у узла нет уверенного совпадения.
3. **HIGH — Explorer падает на `explain` для Peripheral.** Это нарушает сценарий «жюри называет произвольный gid»: `python apps/backend/explore.py explain 100000008517061100` заканчивается `KeyError: 'peripheral'` после вывода карточки.

Также нет ни одной выбранной роли Transit, хотя ровно 72 реальных узла имеют observed outgoing/incoming ratio в диапазоне 0.8–1.2, как сказано в кейсе. Это не ошибка исполнения формулы: без temporal-сигнала Transit проигрывает другим независимым ролям. Но это серьёзный аналитический пробел и риск на защите.

## 2. Official must-have matrix

| Must-have | Статус | Проверенное доказательство | Вывод |
|---|---|---|---|
| 1. Воспроизводимый pipeline | **PARTIAL** | `.venv/bin/python main.py` создаёт 3 CSV за ~1 с, без API/LLM/DB/сети; `python main.py` не доступна в проверенной shell, README не содержит backend-инструкций | Код пригоден, доставка жюри — нет |
| 2. Роль, score, evidence для 2 248 узлов | **PASS** | 2 248 уникальных string gid; точная схема; роли валидны; scores в [0,1]; evidence 74–162 символа | CSV-контракт выполнен |
| 3. Объяснимые критерии ролей | **PARTIAL** | Формулы и evidence есть; Explorer объясняет Consolidator; но падает на Peripheral и Transit не выбран ни разу | Формулы объяснимы, live-разбор не покрывает произвольный gid |
| 4. Кластеризация | **PASS** | 65 детерминированных Louvain-кластеров; у всех узлов cluster_id; CSV содержит требуемые поля | Семантика направленности не смешана с Louvain |
| 5. Top-list + contract визуализации | **PARTIAL** | `top_nodes.csv` содержит корректные 20 строк, deterministic ranking; CSV и raw parquet позволяют разобрать узел | P1 `node_cards.json`/`graph.json` не генерируются, хотя design заявляет их как контракт для frontend; frontend не аудитировался |

## 3. Data limitation matrix

| Ограничение кейса | Текущая реализация | Риск | Статус |
|---|---|---|---|
| Cutoff depth=4 | Terminal ineligible; flag `observation_boundary`; retention исключён из Consolidator | Peripheral score всё ещё загрязнён theoretical Terminal score | **PARTIAL** |
| Экспорт построен только по outgoing | Используются `observed_*` метрики и осторожные evidence | Не все evidence/Explorer явно добавляют это ограничение для non-depth-4 | **PARTIAL** |
| Неполные incoming flows | `retention_obs`, `flow_balance` названы observed; нет claims balance | Наиболее чувствительны Transit/Terminal | **PARTIAL** |
| Заниженные входящие seed | Нет специального исключения seed из flow/retention | Seed может быть ошибочно интерпретирован через observed ratio | **QUESTIONABLE** |
| 354 узла отдают больше observed incoming | `flow_balance` bounded; не интерпретируется как account balance | ratio — лишь сигнал наблюдаемого подграфа | **PASS с ограничением** |
| Порог 5 000 KZT | Не восстанавливается и не выдумывается | README/evidence не напоминают о невидимом дроблении | **PARTIAL** |
| 19 seed вне рёбер, 12 только recipients | BFS включает каждый seed; seed self-reach сохраняется | Сырой `seed_reach_count` минимум 1 даже для изолированного seed; корректно по определению, но надо объяснять | **PASS** |
| Несколько weak components | Используются weak components и resilience; граф не считается монолитным | Документация должна явно объяснять 16 nontrivial vs 35 с isolates | **PARTIAL** |
| Нет customer attributes | Используются только graph/amount/date | Внешнего enrichment нет | **PASS** |
| Нет role ground truth | Нет classifier; explainable rules | Калибровка не может называться accuracy | **PASS** |

## 4. Actual graph findings

| Свойство | Фактический результат |
|---|---:|
| Nodes / directed edges / transactions / seeds | 2 248 / 3 119 / 4 840 / 81 |
| Depth 0/1/2/3/4 | 81 / 472 / 462 / 789 / 444 |
| `dst.depth-src.depth`: +1 / 0 / -1 / -2 / -3 | 2 374 / 236 / 433 / 56 / 20 |
| Cross-level or backward edges | 745 |
| SCC / cyclic SCC (>1) / nodes in cyclic SCC | 2 023 / 84 / 309 |
| Largest cyclic SCC / internal cyclic edges / self-loops | 85 / 548 / 0 |
| Weak components including isolates | 35 |
| Nontrivial weak components / isolated nodes | 16 / 19 |

Это разрешает кажущееся противоречие с кейсом: официальные **16** — компоненты с рёбрами; NetworkX сообщает **35**, потому что учитывает ещё 19 изолированных seed-узлов. Canonical directed graph не является DAG. Code сохраняет 745 cross-level edges; Seed BFS использует полный directed graph и не делает depth-ordered propagation.

## 5. Feature audit

| Feature | Формула/источник | Использование | Оценка и ограничение |
|---|---|---|---|
| in/out degree; unique senders/recipients | unique predecessors/successors in `edges.parquet` | roles | **Correct**; это наблюдаемые связи |
| incoming/outgoing KZT | сумма incident directed edge `sum_kzt` | roles, evidence | **Correct**; не account balance |
| weighted_degree | incoming + outgoing | diagnostic only | **Correct**, currently unused |
| amount_concentration | max incident amount/(incoming+outgoing) | diagnostic only | **Correct**, currently unused |
| retention_obs | incoming/(incoming+outgoing) | Consolidator, Terminal | **Questionable only as observed signal**; excluded from Consolidator at d4, still theoretical Terminal at d4 |
| flow_balance | `max(0, 1-abs(log((out+1)/(in+1))))` | Transit | **Correct bounded proxy**, but zeros dominate: 1 935/2 248 are zero |
| PageRank | directed weighted PageRank (`sum_kzt`) | Coordinator, priority | **Correct**; not proof of control |
| betweenness | directed shortest paths, distance `1/log1p(sum_kzt)` | Coordinator, priority | **Correct but interpret cautiously**; 1 661 zero |
| bridge_count | distinct neighbor Louvain clusters | Coordinator | **Correct structural proxy**, 1 930 zero |
| `pct_depth` | average ascending rank per same depth | roles, priority features | **Correct implementation**; makes ranks relative to a depth, including seeds and boundary group |
| seed_reach_count | per-seed deterministic BFS, full directed graph | Consolidator/Coordinator/evidence | **Correct**: distinct known seed gids that have an observed directed path |
| seed_convergence | `pct_depth(seed_reach_count)` | roles, priority | **Correct**, but raw count is 1–16 and should remain visible |
| observed_volume_pct | percentile of incoming+outgoing per depth | priority | **Correct observed-graph signal** |
| continuation | `in_degree>0 and out_degree>0` | Transit | **Correct but coarse** |
| temporal signals | all 0 | Transit / priority | **Not implemented by design** |
| resilience | node-removal on preliminary top 50; weak components + seed reach pairs | priority | **Correct, reconstructed exactly**; 50 candidates, 49 non-zero percentile values due a tied minimum |

`pct_depth` handles ties, constants, single-node and invalid groups as documented. It inevitably compares heterogeneous observed states inside depth 0 (seeds) and censored states inside depth 4; that is acceptable only when raw values and limitations remain visible. It must never be described as a global percentile.

## 6. Role-by-role audit

| Role | Production formula / eligibility | Distribution / conclusion |
|---|---|---|
| Consolidator | `.30 senders_pct + .25 inbound_volume_pct + .30 seed_convergence + .15 retention_used`; at d4 `retention_used=0`; eligible all depths | 141 selected. **SOUND after boundary patch**; d4 median score .423 vs .535 below d4, 49 d4 selected. It measures observed fan-in/convergence, not provenance of funds. |
| Transit | `.25 mean(in_degree_pct,out_degree_pct)+.30 flow_balance+.25 timing+.20 continuation`; d1–3 only | 0 selected. **NEEDS RECALIBRATION/temporal completion**; see section 7. |
| Distributor | `.50 receivers_pct + .25 outbound_volume_pct + .25 out_degree_pct`; eligible all | 575 selected. **SOUND**: max out-degree is 116, and strong candidates are captured. d4 naturally none because zero observed outdegree. |
| Terminal | `.50 inbound_volume_pct+.30 retention_obs+.20 no_observed_outgoing`; d1–3 + incoming only | 954 selected: d1 264, d2 238, d3 452, d0/d4 0. **SOUND selection**, but theoretical d4 values are not a consumer role. |
| Coordinator | `.30 pagerank_pct+.30 betweenness_pct+.20 bridge_pct+.20 seed_convergence`; eligible all | 67 selected. **SOUND structural hypothesis**; 691 score >=.55 show high overlap with other roles, so selected set is narrow by deterministic maximum. |
| Peripheral | selected if all eligible non-peripheral scores <.55; stored score currently `1-max(all theoretical scores)` | 511 selected. **CONCEPTUALLY WRONG score semantics** when an ineligible role is the max; see critical finding C-2. |

Tie-breaker is documented and implemented: `coordinator`, `consolidator`, `transit`, `distributor`, `terminal`. All formulas are bounded [0,1]. Eligibility is stored in internal DataFrame and displayed by Explorer for Transit/Terminal; fixed mandatory CSV intentionally cannot carry it. No product JSON currently exposes it.

### Top-scoring role candidates

The audit captured deterministic top-20 gid lists for every role from the same run. The strongest examples are: Consolidator `100000001282143100`, `100000001303311100`, `100000004015047100`; Transit `100000008692291100`, `100000008165763100`, `100000008379273100`; Distributor `100000008489922100`, `100000000331309100`, `100000004156082100`; Terminal `100000005075949100`, `100000001053894100`, `100000008175078100`; Coordinator `100000003115284100`, `100000003684369100`, `100000008489922100`. The full reproducible lists can be regenerated from the documented Explorer/pipeline state; they are not hardcoded gid results.

## 7. Transit investigation

The official fact is reproduced exactly: **72** nodes have positive observed outgoing/incoming ratio in `[0.8, 1.2]`: d0=2, d1=22, d2=18, d3=30. Current selected roles among them are 65 Distributor, 6 Coordinator and 1 Consolidator; none Transit.

There are 132 depth-eligible nodes with Transit score >=.55, yet all lose to another role because `timing_consistent_turnover=0` for every node and the distribution/fan-out signals are often stronger. The best real candidates are:

| gid | d | observed ratio | Transit score | current role | Why it loses |
|---|---:|---:|---:|---|---|
| 100000008692291100 | 3 | .975 | .729 | distributor | strong 3×3 observed fan-out |
| 100000008165763100 | 1 | 1.088 | .724 | distributor | 15 incoming, 17 outgoing links |
| 100000008379273100 | 3 | 1.056 | .714 | distributor | high out-degree percentile |
| 100000006518161100 | 1 | 1.003 | .712 | distributor | distribution score dominates |
| 100000005519998100 | 2 | 1.033 | .709 | distributor | distribution score dominates |
| 100000003635170100 | 1 | .944 | .707 | distributor | distribution score dominates |
| 100000003509750100 | 2 | .953 | .704 | distributor | distribution score dominates |
| 100000003747133100 | 2 | 1.055 | .703 | distributor | distribution score dominates |
| 100000001616816100 | 0 | 1.029 | .703 | coordinator | ineligible due depth 0; coordinator dominates |
| 100000001660397100 | 1 | 1.008 | .701 | distributor | distribution score dominates |

The formula is mathematically valid, but the intended distinction requires the approved temporal component (same-day/one/two-day observed turnover) or a future documented role-selection calibration. Do **not** retune weights silently. Until then, describe Transit as implemented scoring but absent in final assignment, not as a demonstrated role.

## 8. Boundary bias investigation

The approved narrow correction is present: `consolidator_retention_used=0` at depth 4 and the 0.15 weight is not redistributed. Node `100000006638021100` now has Consolidator `.817946` (formerly `.967946` before the patch), with raw retention 1.0 retained only diagnostically. It remains Consolidator due high sender, inbound-volume and seed-reachability percentiles; it correctly has Terminal `N/A` in Explorer despite theoretical Terminal `.961625`.

This removes the specific d4 Consolidator retention bias. It does **not** remove the related Peripheral score bug: node `100000008517061100` is selected Peripheral because eligible maximum is Consolidator `.535102` (<.55), yet shows Peripheral `.003386` because ineligible theoretical Terminal `.996614` is subtracted. Across Peripheral: 406/511 mismatch the score derived from eligible roles: 387/387 at depth 4 and 19/30 at depth 0.

## 9. Priority audit

Production formula exactly reconstructs for all 2 248 rows (maximum absolute difference `0.0`):

`0.30*role_weight*role_score + 0.25*seed_convergence + 0.15*centrality + 0.15*observed_volume_pct + 0.10*temporal + 0.05*resilience_pct`.

`temporal=0` by approved fallback. Preliminary ranking correctly uses resilience 0 and stable `DESC priority, ASC gid`; only its first 50 nodes undergo removal simulation. Resilience raw is based on largest weak-component change and reachable ordered (seed, non-seed) pairs. Final `resilience_pct` is nonzero for 49 candidates because one candidate receives the zero percentile rank. Final scores: min `.044622`, median `.370402`, max `.862398`.

Priority is differentiated. It is necessarily driven by structural/volume/seed signals while temporal is absent; no Top-20 node has depth 4. The main semantic dependency is C-2: if a selected Peripheral score is wrong, its priority role contribution is also wrong.

## 10. Top-20 audit

| rank | gid | role | role score | priority | seeds | PR pct | BTW pct | volume pct | resilience | d | cluster |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
|1|100000003115284100|consolidator|.965410|.862398|11|.970|.904|.987|.735|1|6|
|2|100000004015047100|consolidator|.977396|.830523|11|.992|.805|.919|.347|1|3|
|3|100000006274203100|consolidator|.948999|.822513|9|.924|.911|.995|.296|3|6|
|4|100000006889963100|consolidator|.941370|.818271|11|.824|.816|.964|.418|1|8|
|5|100000001887715100|consolidator|.917399|.809464|9|.947|.865|.982|.296|3|29|
|6|100000004997515100|consolidator|.934478|.803960|9|.744|.957|.841|.673|3|29|
|7|100000008489922100|distributor|.999365|.798372|8|.911|.991|.997|.959|3|29|
|8|100000003684369100|distributor|.968750|.792105|10|.938|.975|1.000|.980|0|4|
|9|100000001616816100|coordinator|.927500|.784717|11|1.000|.925|.675|.592|0|3|
|10|100000003390036100|consolidator|.857337|.781848|11|.937|.872|.744|.612|2|6|
|11|100000007908818100|distributor|.930732|.781537|11|.845|.917|.926|.796|1|26|
|12|100000001141268100|consolidator|.927142|.779645|9|.764|.863|.857|.296|3|29|
|13|100000005074393100|distributor|.944533|.779589|10|.941|.930|.938|.878|1|4|
|14|100000001937767100|distributor|.929936|.779198|11|.932|.862|.970|.571|1|16|
|15|100000008165763100|distributor|.984607|.778178|9|.934|.949|.981|.898|1|6|
|16|100000002849158100|consolidator|.868050|.776861|9|.713|.867|.980|.296|3|29|
|17|100000005382566100|consolidator|.934322|.776668|15|.963|.888|.688|.184|0|38|
|18|100000000733451100|coordinator|.810533|.761593|10|.878|.871|.808|.378|3|4|
|19|100000002343825100|consolidator|.891073|.758153|8|.708|.918|.838|.500|3|29|
|20|100000005514161100|consolidator|.890926|.757184|9|.919|.839|.820|.531|1|3|

Membership is structurally differentiated: 10 Consolidator, 8 Distributor, 2 Coordinator; 8 clusters; largest cluster contribution is cluster 29 with 6 nodes; 3 seeds; depths 0–3 only. Seed reach count is 8–15, so it is high but not saturated at the maximum 16. Main limitation: priority has no temporal distinction and no top node is an assigned Transit.

## 11. Cluster audit

Louvain uses undirected projection with `log1p(sum_kzt)`, `resolution=1.0`, `seed=42`, then stable IDs ordered by minimum gid. The implementation and documentation match. There are 65 clusters, 10 with more than one seed — consistent in direction with the case statement of approximately 8 stable multi-seed communities, while not asserting identical community labels/configuration.

Largest: cluster 1 (239 nodes, 4 seeds, 29.90M internal observed KZT), 5 (187, 8, 25.58M), 29 (174, 1, 43.26M), 6 (164, 2, 16.65M), 8 (157, 0, 36.96M). Cluster 38 has 14 seeds in 26 nodes. `sum_kzt_internal` sums directed canonical edges whose endpoints share a Louvain cluster. Hypotheses use only size, seed count and deterministic predominant role; they are cautious but generic.

## 12. Optional-feature matrix

| Optional feature | Status | Evidence |
|---|---|---|
| depth-4 cutoff | **IMPLEMENTED** | Terminal ineligibility, limitation flags, d4 retention correction |
| temporal patterns | **NOT IMPLEMENTED** | explicit zero placeholders |
| recurring routes | **NOT IMPLEMENTED** | Explorer offers shortest observed paths, not recurring-route analysis |
| return flows/cycles | **NOT IMPLEMENTED** | cycles are retained but not analyzed |
| anomaly detection | **NOT IMPLEMENTED** | no model/rules |
| network resilience | **IMPLEMENTED** | top-50 deterministic removal impact |
| AI assistant | **NOT IMPLEMENTED** | no external LLM dependency |
| auto node card | **PARTIAL** | CLI Explorer; no generated node-card artifact/API |
| completeness recommendation | **PARTIAL** | boundary limitation text; no structured next-data recommendation |

## 13. Prohibited-approach audit

No hardcoded analytical gid lists found; no black-box classifier; no customer attributes or external enrichment; no cloud/GPU/paid service in mandatory pipeline; evidence avoids guilt/criminal assertions; gid is converted to string at graph/CSV/CLI boundaries and CSV contains no scientific notation. The data remain intentionally tracked in this repository, which is a project decision rather than an analytics violation.

Stale user-facing terminology remains in `AGENTS.md`, `docs/moneygraph-investigator-design.md`, and `docs/features.md`: examples still say `seed-веток` / `seed branches`. Code evidence is correct (`достижим из N известных seed-узлов`). Documentation must use observed directed reachability, not independent branches.

## 14. Deliverable audit

| Deliverable | Status |
|---|---|
| repository source | present |
| required CSVs | present and valid |
| README: one command/backend install | **missing** |
| README: role criteria/thresholds | **missing** |
| README: outputs/limitations/scaling | **missing** |
| solution architecture diagram | architecture text exists in design; no submission-ready diagram linked from README |
| 5-minute demo script | partial: Explorer exists, but Peripheral explain fails |
| dependency pins | present: pandas 3.0.6, pyarrow 25.0.1, NetworkX 3.7, SciPy 1.18.1; Python `.python-version` is 3.14.0 |
| frontend integration contract | partial: P1 JSON/API documented but not generated |

Current uncommitted workspace contains the depth-4 patch, refreshed results and Explorer. The submission branch must not be presented as containing these improvements until they are intentionally committed after fixes and verification.

## 15. Jury simulation

Deterministic random sample (`random_state=20260923`):

| gid | role | Can answer in <1 min? | Evidence |
|---|---|---|---|
|100000001534244100|consolidator|yes|2 observed senders, reachable from 8 known seeds, incoming 366k KZT|
|100000001690439100|terminal|yes|14.2k KZT incoming, no observed outgoing; d3 eligible|
|100000008517061100|peripheral|**no with Explorer**|correct boundary caveat is printed, then `explain` crashes; printed Peripheral score .003 is misleading|

Selected cases: high priority `100000003115284100` is explained well (8 senders, 11 reachable seeds, high centrality); ordinary `100000001690439100` is explainable; boundary `100000006638021100` is handled correctly with Terminal N/A and excluded retention. The remaining hard case is any Peripheral affected by C-2.

## 16. Test-gap analysis

Existing tests correctly cover data validation, graph direction, seed BFS fixtures, percentile edge cases, Louvain determinism, basic synthetic roles, d4 Terminal eligibility, d4 consolidator retention exclusion, outputs and evidence wording. Missing high-value tests:

1. Peripheral `role_score` uses only eligible non-peripheral scores; add depth-4 and depth-0 fixtures with a high ineligible Terminal/Transit theoretical score.
2. Explorer `explain` succeeds for all six selected roles, especially Peripheral.
3. Full Top-20 must equal top 20 rows of `nodes_roles.csv`, not merely be sorted internally. Current validator sorts the supplied Top table itself and does not cross-check membership against nodes.
4. Independent priority reconstruction across a full fixture and candidate-set boundary/tie behavior.
5. Clean-environment command from README: create venv, install pinned requirements, execute `python main.py`.
6. Stale terminology scan/test across user-facing docs and mock payloads.
7. Product JSON eligibility serialization once that P1 contract is implemented.

## 17. Findings and minimal fixes

### CRITICAL

**C-1 — Backend reproducibility is not deliverable to a clean-machine jury.**
*Evidence:* README only documents synthetic frontend; it omits backend install and run. In the audit shell `python` was absent; `.venv/bin/python main.py` succeeds.
*Smallest fix:* rewrite README with exact tested backend bootstrap (`python3 -m venv .venv`, activation, `python -m pip install -r apps/backend/requirements.txt`, `python main.py`), expected files/runtime, role criteria/threshold, limitations and scaling link. Test it in a clean venv.

**C-2 — Peripheral score ignores eligibility semantics.**
*Evidence:* 406/511 selected Peripheral rows mismatch the score based on eligible roles: all 387 d4 Peripheral and 19 depth-0 Peripheral. `100000008517061100` is selected Peripheral but has score `.003386` because theoretical/ineligible Terminal is `.996614`; eligible maximum is Consolidator `.535102`, implying peripheral confidence `.464898` under the present complement convention.
*Smallest fix:* make `peripheral_score` and selected Peripheral `role_score` use the same eligible-score set used in selection; add explicit unit tests. Re-run outputs, priority and Top-20 audit because role contribution may change.

### HIGH

**H-1 — Explorer cannot explain an arbitrary Peripheral gid.**
*Evidence:* `explain 100000008517061100` raises `KeyError: 'peripheral'`.
*Smallest fix:* add deterministic Peripheral breakdown (“all eligible non-peripheral scores below .55”) and a test invoking explain for each role.

**H-2 — Transit is never selected despite 72 observed balance candidates.**
*Evidence:* zero selected, 132 eligible nodes score >=.55; temporal input is zero.
*Smallest fix:* implement the already-approved calendar-date temporal feature before making Transit claims, then evaluate the fixed formulas; if still zero, submit a separately reviewed calibration amendment rather than silently changing weights.

**H-3 — Frontend-safe node-card/graph artifact is documented but absent.**
*Evidence:* P1 output contract/design calls for `node_cards.json` and `graph.json`; only Explorer/CSV are generated.
*Smallest fix:* either implement the documented P1 artifacts with string gids and eligibility metadata, or revise the handoff/design to the actual frontend data source before demo integration.

### MEDIUM

**M-1 — Stale `seed branches`/`seed-веток` remains in three user-facing documents.**
*Smallest fix:* replace with “достижим из N известных seed-узлов” / observed directed path wording.

**M-2 — Top-output validation is self-referential.**
*Smallest fix:* validate Top-20 membership/order against the globally sorted node output, not only a sort of `top` itself.

**M-3 — Generic observed-data limitations are not always visible in node evidence.**
*Smallest fix:* use a compact standard disclaimer in README/node-card, without exceeding mandatory evidence length.

**M-4 — Terminal ineligible reason is inaccurate for depth-0 nodes with observed incoming.**
*Evidence:* 39 depth-0 nodes have observed incoming, are correctly Terminal-ineligible by depth, but record `requires_observed_incoming` instead of a depth reason.
*Smallest fix:* produce a truthful `depth_outside_1_3` reason before exposing eligibility metadata.

**M-5 — Results and patch are uncommitted.**
*Smallest fix:* after required fixes/tests, stage intended backend/docs/results only, review diff, commit and push without touching frontend.

### LOW

**L-1 — Cluster hypotheses are valid but low-information.**
*Smallest fix:* include internal observed turnover only if it remains within CSV length/readability.

**L-2 — 19 isolated seed self-reach values need demo wording.**
*Smallest fix:* state that seed self-reach is reachability, not a downstream counterparty.

## 18. Things that must not be changed

- Do not discard cross-level/cyclic canonical directed edges or restore a DAG assumption.
- Do not retune Distributor, Coordinator, priority weights, Louvain settings, or Seed Convergence reachability without a separate approved decision.
- Do not use theoretical Terminal as a consumer-facing eligible role at depth 4.
- Do not infer full balances, timing below calendar-day precision, identities, guilt or criminal coordination.
- Do not add a cloud/LLM dependency to `python main.py`.
- Do not modify frontend while correcting backend analytical and documentation findings.

## 19. Submission readiness

**READY AFTER FIXES.** The deterministic analytics core is credible and reproducible inside its pinned environment, but C-1 and C-2 must be corrected, H-1 must be fixed for the arbitrary-gid jury scenario, and the Transit/JSON-handoff risks must be explicitly resolved or transparently scoped before submission.

## Appendix A. Top-20 by theoretical role score

These lists are audit evidence only, generated from the live deterministic feature table; they are not hardcoded targets. An ineligible theoretical score (notably Terminal at depth 4) must not be presented as an applicable role.

**coordinator:** 100000003115284100, 100000003684369100, 100000008489922100, 100000008165763100, 100000004015047100, 100000001616816100, 100000006274203100, 100000007908818100, 100000005382566100, 100000005074393100, 100000001937767100, 100000003016635100, 100000004403675100, 100000004159526100, 100000006866783100, 100000003796063100, 100000005473151100, 100000004997515100, 100000005704413100, 100000008603629100.

**consolidator:** 100000001282143100, 100000001303311100, 100000004015047100, 100000003404627100, 100000007229557100, 100000002956769100, 100000002369874100, 100000002793881100, 100000003115284100, 100000003157679100, 100000001875239100, 100000002605308100, 100000002945626100, 100000002547110100, 100000002718366100, 100000002894076100, 100000002883402100, 100000006274203100, 100000002559089100, 100000003111305100.

**transit:** 100000008692291100, 100000008165763100, 100000008379273100, 100000006518161100, 100000005519998100, 100000003635170100, 100000003509750100, 100000003747133100, 100000001616816100, 100000001660397100, 100000004707703100, 100000005171642100, 100000000661912100, 100000003265158100, 100000006111439100, 100000008324800100, 100000008723830100, 100000004325327100, 100000005074393100, 100000003946524100.

**distributor:** 100000008489922100, 100000000331309100, 100000004156082100, 100000004400305100, 100000003880331100, 100000005704413100, 100000002578405100, 100000001697501100, 100000005910114100, 100000008465789100, 100000008304139100, 100000000437046100, 100000008517538100, 100000008603629100, 100000003016635100, 100000008742053100, 100000008748408100, 100000008477350100, 100000003796063100, 100000008165763100.

**terminal:** 100000005075949100, 100000001053894100, 100000008175078100, 100000002605308100, 100000008517061100, 100000002718366100, 100000001282143100, 100000001131403100, 100000002547110100, 100000001072022100, 100000002126791100, 100000001303311100, 100000003220685100, 100000002872399100, 100000002884708100, 100000002173161100, 100000004035925100, 100000001875167100, 100000003964910100, 100000002459832100.

**peripheral:** 100000000456947100, 100000003265658100, 100000003349739100, 100000003770083100, 100000004021459100, 100000004174835100, 100000005017150100, 100000005087431100, 100000005235389100, 100000005480435100, 100000005495722100, 100000005550592100, 100000005560900100, 100000005568407100, 100000008117324100, 100000008205000100, 100000008513251100, 100000008669037100, 100000008701222100, 100000005543136100.
