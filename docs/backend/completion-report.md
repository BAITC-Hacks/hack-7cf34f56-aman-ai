# MoneyGraph backend completion — A–J

Status: **READY — backend submission requirements**.
Frontend integration and a live OpenAI account call are not claimed as tested.
No commit or push was made. All frontend files remained byte-identical.

## Baseline and executed tests
- Baseline: 11 passed in 2.41s.
- Final working environment: 34 passed in 6.67s.
- Independent clean environment: 34 passed in 6.91s; pip check passed.
- Command: `PYTHONPATH=apps/backend python -m pytest apps/backend/tests -q`.
- Separate live Uvicorn process: /health and /api/top-nodes responded successfully.
- Two separate pipeline processes produced identical required CSVs and product JSON.

## Phase A — Peripheral semantics
Only eligible non-peripheral scores determine the complement.
511 Peripheral rows remain; 406 selected role scores and priorities changed in this
isolated phase. Top-20 membership and order did not change.
Old selected Peripheral score min/median/max: 0.000000/0.345372/0.644531.

New: 0.450339/0.553781/0.826524.
Tests cover depth 4 with high ineligible Terminal, depth 0 with ineligible
Transit/Terminal, low eligible signals, and an eligible score at the .55 floor.
Terminal ineligibility at depth 0 now reports depth_outside_1_3 truthfully.

## Phase B — Explorer
Peripheral breakdown shows eligible scores, .55 floor, eligible maximum and its
complement. Every score presentation includes applicability. Before temporal,
Transit had no real selected node and was explicitly skipped in this phase.
After temporal, all six roles pass actual explain CLI subprocesses.

## Phase C — Temporal
Outgoing on day d qualifies when incoming activity is observed on d, d−1 or d−2.
Amounts are counted once even with multiple matching incoming days. No exact
fund matching or intraday claim is made. Daily transaction counts use both
endpoints; duplicate transactions are retained. Daily sender counts are distinct.
Temporal priority is the approved maximum; no role/priority weights were retuned.
Selected Transit: **0 → 60**. Among the 72 observed-ratio candidates, final roles
are Transit 38, Distributor 31, Coordinator 2, Consolidator 1.
No zero-Transit calibration warning remains.
| feature | min | median | max |
| --- | --- | --- | --- |
| timing_consistent_turnover | 0.000000 | 0.000000 | 1.000000 |
| burst_pct | 0.112500 | 0.355964 | 1.000000 |
| synchronous_incoming_pct | 0.256250 | 0.461294 | 1.000000 |
| temporal | 0.256250 | 0.461294 | 1.000000 |

Average-rank percentiles can be positive for a tied raw zero in a nonconstant
depth group; raw maxima/turnover remain available. These normalized values are
relative ranks, not proof of activity or fraud.

## Phase D — Output impact
| role | before | after |
| --- | --- | --- |
| consolidator | 141 | 141 |
| transit | 0 | 60 |
| distributor | 575 | 522 |
| terminal | 954 | 954 |
| coordinator | 67 | 60 |
| peripheral | 511 | 511 |

Priority min/median/max before: 0.044622/0.370402/0.862398; after: 0.109541/0.426451/0.958316.
Changed priority rows after all changes: 2248.
Top-20: 19 members retained; entered 100000003635170100 (Transit), exited
100000000733451100 (Coordinator). Fifteen rank positions differ. All node scores
are valid; depth-4 Terminal count remains zero. Consolidator/Distributor/Terminal/
Coordinator raw role scores, PageRank, betweenness, seed reachability and cluster
IDs match the starting feature table exactly. The only formula change is the
approved Peripheral fix; Transit and temporal priority now receive measured data.
Top validation independently ranks all published node rows, not the supplied Top
table. Rounding is six decimals and exported ties use gid ascending.

### Final Top-20
| rank | gid | role | role_score | priority_score | depth | cluster_id | old_rank |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 100000003115284100 | consolidator | 0.965410 | 0.958316 | 1 | 6 | 1 |
| 2 | 100000004015047100 | consolidator | 0.977396 | 0.925174 | 1 | 3 | 2 |
| 3 | 100000006274203100 | consolidator | 0.948999 | 0.919597 | 3 | 6 | 3 |
| 4 | 100000006889963100 | consolidator | 0.941370 | 0.917761 | 1 | 8 | 4 |
| 5 | 100000001887715100 | consolidator | 0.917399 | 0.909974 | 3 | 29 | 5 |
| 6 | 100000008489922100 | distributor | 0.999365 | 0.895120 | 3 | 29 | 7 |
| 7 | 100000003684369100 | distributor | 0.968750 | 0.890064 | 0 | 4 | 8 |
| 8 | 100000001141268100 | consolidator | 0.927142 | 0.880156 | 3 | 29 | 12 |
| 9 | 100000005382566100 | consolidator | 0.934322 | 0.876668 | 0 | 38 | 17 |
| 10 | 100000002849158100 | consolidator | 0.868050 | 0.876546 | 3 | 29 | 16 |
| 11 | 100000008165763100 | distributor | 0.984607 | 0.874692 | 1 | 6 | 15 |
| 12 | 100000007908818100 | distributor | 0.930732 | 0.871086 | 1 | 26 | 11 |
| 13 | 100000001937767100 | distributor | 0.929936 | 0.863292 | 1 | 16 | 14 |
| 14 | 100000001616816100 | coordinator | 0.927500 | 0.858531 | 0 | 3 | 9 |
| 15 | 100000005074393100 | distributor | 0.944533 | 0.852324 | 1 | 4 | 13 |
| 16 | 100000003390036100 | consolidator | 0.857337 | 0.852106 | 2 | 6 | 10 |
| 17 | 100000002343825100 | consolidator | 0.891073 | 0.851671 | 3 | 29 | 19 |
| 18 | 100000005514161100 | consolidator | 0.890926 | 0.848774 | 1 | 3 | 20 |
| 19 | 100000003635170100 | transit | 0.956878 | 0.846356 | 1 | 11 | new |
| 20 | 100000004997515100 | consolidator | 0.934478 | 0.846008 | 3 | 29 | 6 |

### Role distribution by depth (before)
| depth | consolidator | transit | distributor | terminal | coordinator | peripheral |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 16 | 0 | 27 | 0 | 8 | 30 |
| 1 | 28 | 0 | 135 | 264 | 13 | 32 |
| 2 | 20 | 0 | 161 | 238 | 16 | 27 |
| 3 | 28 | 0 | 252 | 452 | 22 | 35 |
| 4 | 49 | 0 | 0 | 0 | 8 | 387 |

### Role distribution by depth (after)
| depth | consolidator | transit | distributor | terminal | coordinator | peripheral |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 16 | 0 | 27 | 0 | 8 | 30 |
| 1 | 28 | 18 | 120 | 264 | 10 | 32 |
| 2 | 20 | 16 | 148 | 238 | 13 | 27 |
| 3 | 28 | 26 | 227 | 452 | 21 | 35 |
| 4 | 49 | 0 | 0 | 0 | 8 | 387 |

## Phase E — Product JSON
node_cards.json: all 2,248 string gids, six score/eligibility/reason entries,
raw and normalized metrics, weighted priority components, evidence, limitations,
next action and directed incident edges.
graph.json: 2,248 minimal nodes and 3,119 directed edges.
Strict JSON rejects NaN; product validator checks gids, eligibility and priority
component sums. Cards occupy about 4.82MB, graph about 0.57MB.

## Phase F — API
Implemented GET /health, /api/top-nodes, /api/nodes/{gid},
/api/nodes/{gid}/subgraph?hop=1, /api/clusters/{cluster_id}, /api/search?gid=.
Reads precomputed snapshots at startup. No expensive metrics per request.
Tests cover health, known/unknown/malformed gid, cluster, exact/prefix search,
both hops, invalid hop, string gids, eligibility, missing artifacts and 250-node cap.
Frontend handoff documents exact shapes, errors, localhost CORS and restart policy.

## Phase G — README and clean environment
Tested Python 3.14.0. A fresh venv and separate checkout copy were created under
the task work directory. Installation used requirements.txt, then python main.py.
Before API/AI installation, neither fastapi nor openai was importable; all three
CSVs and both product JSONs still matched the working environment exactly.
First clean analytical run: **5.862s**. Later clean run: **1.920s**.
Then optional/dev dependencies were installed and all 34 tests passed.
README preserves the teammate's frontend section and adds backend setup, criteria,
limits, CSVs, API/Explorer commands, a Mermaid architecture diagram and scaling.
Tested commands:
```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r apps/backend/requirements.txt
python main.py
python -m pip install -r apps/backend/requirements-api.txt
python -m uvicorn moneygraph.api:app --app-dir apps/backend --host 127.0.0.1 --port 8000
```
The actual HTTP smoke test used the same invocation with an available loopback port.

## Phase H — Louvain
Python 3.14.0, NetworkX 3.7. Reciprocal directed amounts are summed before log1p.
Resolution=1.0, seed=42; stable cluster IDs unchanged.
Both runs: 65 communities, 10 multi-seed communities.
Assignment SHA256:
`ed50bc32ce5e8e10fb21dd2f65c3150693be9d35a495ab42f0ef0573e5a91517`.
No changes were made to match NetworkX 3.6.1. The pinned-environment hash is
reproducible; version-dependent partitions do not establish a ground truth.

## Phase I — optional OpenAI
Implemented: YES. Seven tools: get_node, get_cluster, find_common_downstream,
get_paths, get_seed_paths, get_temporal_patterns, compare_nodes.
CLI: python apps/backend/investigate.py "question".
Optional API: POST /api/investigate {"question":"..."}.
Strict function schemas; at most six model turns/twelve calls; 30s per model call;
bounded seed/path/node tools; no raw Parquet upload; model cannot mutate analytics.
Installed SDK 3.19.0 is exercised via mock HTTP transport through real Responses
serialization and parsing. All deterministic tools are tested.
**Live provider authentication/model behavior is unverified:** OPENAI_API_KEY and
OPENAI_MODEL were unset. Missing config returns a clear error/503 while mandatory
pipeline and read-only API remain operational. NVIDIA was not added.
The OpenAI docs MCP was unavailable; official web docs were used:
[function calling](https://developers.openai.com/api/docs/guides/function-calling).
API testing reference: [FastAPI testing](https://fastapi.tiangolo.com/tutorial/testing/).

## Phase J — final validation
2,248 unique exact gids, valid role/priority values, nonempty evidence <=200 chars,
all clusters present, global Top-20 correct, depth-4 Terminal excluded, Peripheral
semantics reconstructed for all nodes, 72 diagnostic rows, valid product JSON/API.
11 CLI scenarios (including repeated-role samples) succeeded.
| scenario | gid | result |
| --- | --- | --- |
| random_259 | 100000001534244100 | PASS |
| random_298 | 100000001690439100 | PASS |
| random_1928 | 100000008517061100 | PASS |
| top | 100000003115284100 | PASS |
| boundary | 100000000018102100 | PASS |
| consolidator | 100000000011452100 | PASS |
| coordinator | 100000000190228100 | PASS |
| distributor | 100000000031787100 | PASS |
| peripheral | 100000000018102100 | PASS |
| terminal | 100000000041368100 | PASS |
| transit | 100000000201868100 | PASS |

Two final process wall times (including interpreter/imports): 2.417s, 2.105s. Internal pipeline logs: 1.814s / 1.759s.

| artifact | sha256 |
| --- | --- |
| nodes_roles.csv | a95bdedd1071c31079bb45b49959dbc8da9a771689f1710fe352c9f2c3aab55f |
| clusters.csv | 35a25e809fc929afe482aa520702202833235534babdfb0eb0cde17b589da6a2 |
| top_nodes.csv | 57e647af5c010bb86f709346c65af9ac684ff272eca30804b6ba22c757e2893d |
| node_cards.json | 150834ff97991ae0bb89b6c23469be59d419f7a64b0597f6b1115a4722d76f70 |
| graph.json | 55e5554f3213d9ea352b5a6207c8b6ecb15f7e39e1190d151aa462aec9b0520c |
| analytics_diagnostics.json | d72aa7016e9f033ed873138f8e85e54b2ea2d0e40f53a2edaebfabe4d817c37c |

Frontend hash comparison: 51 files unchanged. No commit/push.
Remaining mandatory/backend product blockers: **none**.
Remaining optional verification: live OpenAI call with configured account/model.
Whole-product UI integration must be verified by the frontend owner.

## Appendix — all 72 observed ratio candidates
Winning score is role_score; Transit score is independent and may not win.
| gid | depth | incoming_kzt | outgoing_kzt | observed_ratio | timing_consistent_turnover | transit_score | role | role_score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100000000031787100 | 2 | 90000.000000 | 90000.000000 | 1.000000 | 0.444444 | 0.756583 | distributor | 0.794197 |
| 100000000201868100 | 2 | 190000.000000 | 190000.000000 | 1.000000 | 1.000000 | 0.879474 | transit | 0.879474 |
| 100000000291906100 | 2 | 388000.000000 | 455854.000000 | 1.174881 | 0.418674 | 0.754935 | distributor | 0.819685 |
| 100000000489417100 | 2 | 73504.000000 | 80000.000000 | 1.088376 | 1.000000 | 0.919415 | transit | 0.919415 |
| 100000000656682100 | 3 | 71000.000000 | 80000.000000 | 1.126761 | 0.000000 | 0.625919 | distributor | 0.862468 |
| 100000000661912100 | 1 | 393036.000000 | 430700.000000 | 1.095828 | 0.751567 | 0.884696 | transit | 0.884696 |
| 100000000785800100 | 2 | 19000.000000 | 19000.000000 | 1.000000 | 1.000000 | 0.879474 | transit | 0.879474 |
| 100000000850297100 | 2 | 17520.000000 | 17520.000000 | 1.000000 | 1.000000 | 0.879474 | transit | 0.879474 |
| 100000000922570100 | 1 | 47101.000000 | 50000.000000 | 1.061549 | 0.000000 | 0.612655 | distributor | 0.729034 |
| 100000000976943100 | 3 | 70000.000000 | 84000.000000 | 1.200000 | 0.130952 | 0.622792 | distributor | 0.761580 |
| 100000001102676100 | 2 | 50000.000000 | 50000.000000 | 1.000000 | 1.000000 | 0.879474 | transit | 0.879474 |
| 100000001382002100 | 2 | 55000.000000 | 56500.000000 | 1.027273 | 0.000000 | 0.621402 | distributor | 0.688449 |
| 100000001601320100 | 2 | 43500.000000 | 46200.000000 | 1.062069 | 0.000000 | 0.664554 | distributor | 0.683568 |
| 100000001616816100 | 0 | 176195.000000 | 181326.000000 | 1.029121 | 0.693921 | 0.876588 | coordinator | 0.927500 |
| 100000001660397100 | 1 | 48600.000000 | 49000.000000 | 1.008230 | 0.755102 | 0.889873 | transit | 0.889873 |
| 100000002293421100 | 2 | 41000.000000 | 47000.000000 | 1.146341 | 0.319149 | 0.737433 | distributor | 0.780098 |
| 100000002433697100 | 3 | 130000.000000 | 110000.000000 | 0.846154 | 1.000000 | 0.844634 | transit | 0.844634 |
| 100000002531406100 | 3 | 520000.000000 | 500000.000000 | 0.961538 | 0.000000 | 0.632983 | distributor | 0.789816 |
| 100000002575080100 | 3 | 13000.000000 | 12500.000000 | 0.961538 | 1.000000 | 0.882984 | transit | 0.882984 |
| 100000002738256100 | 2 | 150200.000000 | 175000.000000 | 1.165113 | 1.000000 | 0.833629 | transit | 0.833629 |
| 100000002781227100 | 1 | 191167.620000 | 212420.000000 | 1.111171 | 0.811694 | 0.874855 | transit | 0.874855 |
| 100000003163256100 | 1 | 13485.000000 | 15000.000000 | 1.112347 | 0.000000 | 0.598634 | distributor | 0.708864 |
| 100000003254277100 | 3 | 49200.000000 | 44997.000000 | 0.914573 | 1.000000 | 0.867961 | transit | 0.867961 |
| 100000003265158100 | 1 | 146100.400000 | 154200.000000 | 1.055439 | 1.000000 | 0.946393 | transit | 0.946393 |
| 100000003299365100 | 1 | 200000.000000 | 200000.000000 | 1.000000 | 1.000000 | 0.880573 | transit | 0.880573 |
| 100000003509750100 | 2 | 82290.000000 | 78400.000000 | 0.952728 | 0.744898 | 0.890650 | transit | 0.890650 |
| 100000003635170100 | 1 | 268500.000000 | 253500.000000 | 0.944134 | 1.000000 | 0.956878 | transit | 0.956878 |
| 100000003747133100 | 2 | 237068.000000 | 250000.000000 | 1.054550 | 0.920000 | 0.933155 | transit | 0.933155 |
| 100000003942602100 | 1 | 30000.000000 | 30000.000000 | 1.000000 | 1.000000 | 0.880573 | transit | 0.880573 |
| 100000003946524100 | 1 | 133757.000000 | 144750.000000 | 1.082186 | 0.000000 | 0.672563 | distributor | 0.825106 |
| 100000004094958100 | 1 | 39000.000000 | 40000.000000 | 1.025641 | 1.000000 | 0.872978 | transit | 0.872978 |
| 100000004135268100 | 1 | 1239000.000000 | 1000200.000000 | 0.807264 | 0.849830 | 0.851782 | distributor | 0.898620 |
| 100000004325327100 | 1 | 70817.000000 | 70000.000000 | 0.988463 | 1.000000 | 0.929773 | transit | 0.929773 |
| 100000004336312100 | 2 | 90415.000000 | 72650.000000 | 0.803517 | 0.518238 | 0.774752 | distributor | 0.789859 |
| 100000004386331100 | 3 | 20000.000000 | 17500.000000 | 0.875000 | 0.000000 | 0.621665 | distributor | 0.834867 |
| 100000004676985100 | 3 | 32260.000000 | 27102.000000 | 0.840112 | 0.000000 | 0.592485 | distributor | 0.740324 |
| 100000004697956100 | 3 | 10000.000000 | 10000.000000 | 1.000000 | 0.000000 | 0.644749 | distributor | 0.724302 |
| 100000004707703100 | 1 | 239300.000000 | 231650.000000 | 0.968032 | 0.889273 | 0.922497 | transit | 0.922497 |
| 100000004737477100 | 1 | 49598.000000 | 40500.000000 | 0.816565 | 0.370370 | 0.715053 | distributor | 0.724257 |
| 100000004739664100 | 1 | 12000.000000 | 10000.000000 | 0.833333 | 0.000000 | 0.575882 | distributor | 0.705414 |
| 100000004770073100 | 3 | 5462.400000 | 5466.970000 | 1.000837 | 1.000000 | 0.894499 | transit | 0.894499 |
| 100000004820260100 | 2 | 234200.000000 | 215350.000000 | 0.919513 | 1.000000 | 0.878433 | transit | 0.878433 |
| 100000005171642100 | 3 | 696800.000000 | 683600.000000 | 0.981056 | 0.962551 | 0.939215 | transit | 0.939215 |
| 100000005186131100 | 3 | 10000.000000 | 10000.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000005363908100 | 1 | 19500.000000 | 19500.000000 | 1.000000 | 1.000000 | 0.880573 | transit | 0.880573 |
| 100000005367445100 | 3 | 5000.000000 | 5000.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000005519998100 | 2 | 182000.000000 | 188000.000000 | 1.032967 | 0.329787 | 0.791670 | distributor | 0.853579 |
| 100000005619339100 | 2 | 5000.000000 | 5442.600000 | 1.088520 | 0.000000 | 0.604033 | distributor | 0.652657 |
| 100000005661829100 | 3 | 37790.000000 | 40362.000000 | 1.068060 | 0.837174 | 0.851263 | transit | 0.851263 |
| 100000005873152100 | 3 | 10000.000000 | 10000.000000 | 1.000000 | 0.000000 | 0.644749 | coordinator | 0.747843 |
| 100000006020215100 | 3 | 30000.000000 | 33800.000000 | 1.126667 | 0.000000 | 0.625945 | distributor | 0.845654 |
| 100000006069103100 | 1 | 228818.000000 | 270000.000000 | 1.179977 | 0.166667 | 0.711896 | distributor | 0.878450 |
| 100000006111439100 | 3 | 20570.000000 | 24000.000000 | 1.166748 | 0.000000 | 0.693425 | distributor | 0.894036 |
| 100000006518161100 | 1 | 594200.000000 | 595899.000000 | 1.002859 | 0.714717 | 0.890402 | transit | 0.890402 |
| 100000006641671100 | 3 | 22000.000000 | 25000.000000 | 1.136364 | 0.800000 | 0.865966 | transit | 0.865966 |
| 100000006664478100 | 3 | 55000.000000 | 60000.000000 | 1.090909 | 0.666667 | 0.802286 | distributor | 0.858027 |
| 100000006704530100 | 3 | 450500.000000 | 428000.000000 | 0.950055 | 0.000000 | 0.652856 | distributor | 0.929093 |
| 100000007131370100 | 3 | 30000.000000 | 30000.000000 | 1.000000 | 0.000000 | 0.644749 | distributor | 0.742227 |
| 100000007170072100 | 3 | 100000.000000 | 99500.000000 | 0.995000 | 1.000000 | 0.910219 | transit | 0.910219 |
| 100000007544358100 | 1 | 322500.000000 | 350000.000000 | 1.085271 | 0.285714 | 0.730133 | distributor | 0.763535 |
| 100000008086440100 | 3 | 199733.000000 | 161300.000000 | 0.807578 | 0.235586 | 0.667768 | distributor | 0.943052 |
| 100000008165763100 | 1 | 1165815.000000 | 1267858.000000 | 1.087529 | 0.680585 | 0.893647 | distributor | 0.984607 |
| 100000008192264100 | 3 | 162810.000000 | 187910.000000 | 1.154167 | 0.874993 | 0.820484 | transit | 0.820484 |
| 100000008314203100 | 0 | 382076.000000 | 327000.000000 | 0.855851 | 0.486239 | 0.753768 | consolidator | 0.788950 |
| 100000008324800100 | 2 | 526500.000000 | 511000.000000 | 0.970560 | 1.000000 | 0.935857 | transit | 0.935857 |
| 100000008379273100 | 3 | 36000.000000 | 38000.000000 | 1.055556 | 0.000000 | 0.714348 | distributor | 0.903553 |
| 100000008493007100 | 3 | 26150.000000 | 26150.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000008501413100 | 3 | 5000.000000 | 5100.000000 | 1.020000 | 1.000000 | 0.888810 | transit | 0.888810 |
| 100000008561016100 | 3 | 180000.000000 | 185000.000000 | 1.027778 | 1.000000 | 0.886530 | transit | 0.886530 |
| 100000008582730100 | 3 | 5000.000000 | 5000.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000008692291100 | 3 | 160000.000000 | 156000.000000 | 0.975000 | 0.134615 | 0.762972 | distributor | 0.913388 |
| 100000008723830100 | 1 | 459785.000000 | 455000.000000 | 0.989593 | 1.000000 | 0.930115 | transit | 0.930115 |

## Appendix — top 20 theoretical Transit scores
| gid | depth | incoming_kzt | outgoing_kzt | observed_ratio | timing_consistent_turnover | transit_score | role | role_score |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 100000003635170100 | 1 | 268500.000000 | 253500.000000 | 0.944134 | 1.000000 | 0.956878 | transit | 0.956878 |
| 100000003265158100 | 1 | 146100.400000 | 154200.000000 | 1.055439 | 1.000000 | 0.946393 | transit | 0.946393 |
| 100000005171642100 | 3 | 696800.000000 | 683600.000000 | 0.981056 | 0.962551 | 0.939215 | transit | 0.939215 |
| 100000008324800100 | 2 | 526500.000000 | 511000.000000 | 0.970560 | 1.000000 | 0.935857 | transit | 0.935857 |
| 100000003747133100 | 2 | 237068.000000 | 250000.000000 | 1.054550 | 0.920000 | 0.933155 | transit | 0.933155 |
| 100000008723830100 | 1 | 459785.000000 | 455000.000000 | 0.989593 | 1.000000 | 0.930115 | transit | 0.930115 |
| 100000004325327100 | 1 | 70817.000000 | 70000.000000 | 0.988463 | 1.000000 | 0.929773 | transit | 0.929773 |
| 100000004707703100 | 1 | 239300.000000 | 231650.000000 | 0.968032 | 0.889273 | 0.922497 | transit | 0.922497 |
| 100000000489417100 | 2 | 73504.000000 | 80000.000000 | 1.088376 | 1.000000 | 0.919415 | transit | 0.919415 |
| 100000007170072100 | 3 | 100000.000000 | 99500.000000 | 0.995000 | 1.000000 | 0.910219 | transit | 0.910219 |
| 100000002448088100 | 3 | 20000.000000 | 25000.000000 | 1.250000 | 1.000000 | 0.896496 | transit | 0.896496 |
| 100000005186131100 | 3 | 10000.000000 | 10000.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000005367445100 | 3 | 5000.000000 | 5000.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000008493007100 | 3 | 26150.000000 | 26150.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000008582730100 | 3 | 5000.000000 | 5000.000000 | 1.000000 | 1.000000 | 0.894749 | transit | 0.894749 |
| 100000004770073100 | 3 | 5462.400000 | 5466.970000 | 1.000837 | 1.000000 | 0.894499 | transit | 0.894499 |
| 100000008165763100 | 1 | 1165815.000000 | 1267858.000000 | 1.087529 | 0.680585 | 0.893647 | distributor | 0.984607 |
| 100000003509750100 | 2 | 82290.000000 | 78400.000000 | 0.952728 | 0.744898 | 0.890650 | transit | 0.890650 |
| 100000006518161100 | 1 | 594200.000000 | 595899.000000 | 1.002859 | 0.714717 | 0.890402 | transit | 0.890402 |
| 100000001660397100 | 1 | 48600.000000 | 49000.000000 | 1.008230 | 0.755102 | 0.889873 | transit | 0.889873 |

## Appendix — cluster role distribution before/after
| cluster_id | role | before | after |
| --- | --- | --- | --- |
| 1 | consolidator | 7 | 7 |
| 1 | coordinator | 7 | 4 |
| 1 | distributor | 77 | 71 |
| 1 | peripheral | 64 | 64 |
| 1 | terminal | 84 | 84 |
| 1 | transit | 0 | 9 |
| 2 | consolidator | 4 | 4 |
| 2 | coordinator | 1 | 1 |
| 2 | distributor | 16 | 15 |
| 2 | peripheral | 17 | 17 |
| 2 | terminal | 22 | 22 |
| 2 | transit | 0 | 1 |
| 3 | consolidator | 5 | 5 |
| 3 | coordinator | 5 | 5 |
| 3 | distributor | 29 | 26 |
| 3 | peripheral | 10 | 10 |
| 3 | terminal | 40 | 40 |
| 3 | transit | 0 | 3 |
| 4 | consolidator | 13 | 13 |
| 4 | coordinator | 8 | 8 |
| 4 | distributor | 25 | 24 |
| 4 | peripheral | 5 | 5 |
| 4 | terminal | 54 | 54 |
| 4 | transit | 0 | 1 |
| 5 | consolidator | 11 | 11 |
| 5 | coordinator | 10 | 9 |
| 5 | distributor | 64 | 58 |
| 5 | peripheral | 29 | 29 |
| 5 | terminal | 73 | 73 |
| 5 | transit | 0 | 7 |
| 6 | consolidator | 18 | 18 |
| 6 | coordinator | 5 | 4 |
| 6 | distributor | 50 | 46 |
| 6 | peripheral | 43 | 43 |
| 6 | terminal | 48 | 48 |
| 6 | transit | 0 | 5 |
| 7 | consolidator | 1 | 1 |
| 7 | coordinator | 1 | 1 |
| 7 | distributor | 23 | 18 |
| 7 | peripheral | 32 | 32 |
| 7 | terminal | 29 | 29 |
| 7 | transit | 0 | 5 |
| 8 | consolidator | 7 | 7 |
| 8 | coordinator | 2 | 2 |
| 8 | distributor | 35 | 29 |
| 8 | peripheral | 48 | 48 |
| 8 | terminal | 65 | 65 |
| 8 | transit | 0 | 6 |
| 9 | consolidator | 2 | 2 |
| 9 | coordinator | 2 | 2 |
| 9 | distributor | 22 | 22 |
| 9 | peripheral | 10 | 10 |
| 9 | terminal | 24 | 24 |
| 10 | distributor | 4 | 4 |
| 10 | peripheral | 1 | 1 |
| 10 | terminal | 1 | 1 |
| 11 | consolidator | 1 | 1 |
| 11 | coordinator | 6 | 5 |
| 11 | distributor | 11 | 9 |
| 11 | peripheral | 2 | 2 |
| 11 | terminal | 24 | 24 |
| 11 | transit | 0 | 3 |
| 12 | consolidator | 1 | 1 |
| 12 | coordinator | 1 | 0 |
| 12 | distributor | 5 | 5 |
| 12 | peripheral | 6 | 6 |
| 12 | terminal | 2 | 2 |
| 12 | transit | 0 | 1 |
| 13 | distributor | 4 | 4 |
| 13 | peripheral | 6 | 6 |
| 13 | terminal | 5 | 5 |
| 14 | distributor | 10 | 9 |
| 14 | peripheral | 9 | 9 |
| 14 | terminal | 2 | 2 |
| 14 | transit | 0 | 1 |
| 15 | peripheral | 1 | 1 |
| 16 | coordinator | 4 | 4 |
| 16 | distributor | 11 | 11 |
| 16 | peripheral | 13 | 13 |
| 16 | terminal | 23 | 23 |
| 17 | coordinator | 1 | 1 |
| 17 | distributor | 3 | 3 |
| 17 | peripheral | 3 | 3 |
| 18 | distributor | 6 | 5 |
| 18 | peripheral | 11 | 11 |
| 18 | terminal | 103 | 103 |
| 18 | transit | 0 | 1 |
| 19 | distributor | 3 | 3 |
| 19 | peripheral | 2 | 2 |
| 19 | terminal | 1 | 1 |
| 20 | consolidator | 1 | 1 |
| 20 | distributor | 12 | 12 |
| 20 | peripheral | 12 | 12 |
| 20 | terminal | 30 | 30 |
| 21 | distributor | 4 | 4 |
| 21 | peripheral | 4 | 4 |
| 22 | distributor | 7 | 7 |
| 22 | peripheral | 1 | 1 |
| 22 | terminal | 5 | 5 |
| 23 | coordinator | 1 | 1 |
| 23 | distributor | 15 | 14 |
| 23 | peripheral | 12 | 12 |
| 23 | terminal | 15 | 15 |
| 23 | transit | 0 | 1 |
| 24 | distributor | 5 | 5 |
| 24 | peripheral | 3 | 3 |
| 24 | terminal | 31 | 31 |
| 25 | consolidator | 2 | 2 |
| 25 | distributor | 10 | 9 |
| 25 | peripheral | 16 | 16 |
| 25 | terminal | 11 | 11 |
| 25 | transit | 0 | 1 |
| 26 | consolidator | 4 | 4 |
| 26 | coordinator | 2 | 2 |
| 26 | distributor | 14 | 13 |
| 26 | peripheral | 19 | 19 |
| 26 | terminal | 15 | 15 |
| 26 | transit | 0 | 1 |
| 27 | distributor | 4 | 3 |
| 27 | peripheral | 13 | 13 |
| 27 | terminal | 94 | 94 |
| 27 | transit | 0 | 1 |
| 28 | distributor | 8 | 8 |
| 28 | peripheral | 1 | 1 |
| 28 | terminal | 8 | 8 |
| 29 | consolidator | 52 | 52 |
| 29 | coordinator | 1 | 1 |
| 29 | distributor | 33 | 30 |
| 29 | peripheral | 21 | 21 |
| 29 | terminal | 67 | 67 |
| 29 | transit | 0 | 3 |
| 30 | distributor | 3 | 3 |
| 30 | peripheral | 3 | 3 |
| 30 | terminal | 3 | 3 |
| 31 | distributor | 2 | 1 |
| 31 | terminal | 1 | 1 |
| 31 | transit | 0 | 1 |
| 32 | coordinator | 1 | 1 |
| 32 | distributor | 2 | 1 |
| 32 | terminal | 1 | 1 |
| 32 | transit | 0 | 1 |
| 33 | consolidator | 4 | 4 |
| 33 | coordinator | 3 | 3 |
| 33 | distributor | 10 | 9 |
| 33 | peripheral | 25 | 25 |
| 33 | terminal | 27 | 27 |
| 33 | transit | 0 | 1 |
| 34 | coordinator | 2 | 2 |
| 34 | distributor | 14 | 11 |
| 34 | peripheral | 2 | 2 |
| 34 | terminal | 22 | 22 |
| 34 | transit | 0 | 3 |
| 35 | distributor | 3 | 3 |
| 35 | peripheral | 5 | 5 |
| 35 | terminal | 3 | 3 |
| 36 | distributor | 5 | 5 |
| 36 | peripheral | 4 | 4 |
| 36 | terminal | 3 | 3 |
| 37 | consolidator | 1 | 1 |
| 37 | distributor | 1 | 1 |
| 37 | peripheral | 27 | 27 |
| 38 | consolidator | 7 | 7 |
| 38 | coordinator | 4 | 4 |
| 38 | distributor | 9 | 8 |
| 38 | peripheral | 4 | 4 |
| 38 | terminal | 2 | 2 |
| 38 | transit | 0 | 1 |
| 39 | distributor | 2 | 2 |
| 39 | peripheral | 1 | 1 |
| 39 | terminal | 1 | 1 |
| 40 | distributor | 1 | 1 |
| 40 | peripheral | 1 | 1 |
| 40 | terminal | 4 | 4 |
| 41 | distributor | 4 | 3 |
| 41 | terminal | 1 | 1 |
| 41 | transit | 0 | 1 |
| 42 | peripheral | 1 | 1 |
| 42 | terminal | 1 | 1 |
| 43 | peripheral | 1 | 1 |
| 44 | peripheral | 1 | 1 |
| 45 | distributor | 2 | 2 |
| 45 | peripheral | 3 | 3 |
| 45 | terminal | 3 | 3 |
| 46 | peripheral | 1 | 1 |
| 47 | peripheral | 1 | 1 |
| 47 | terminal | 1 | 1 |
| 48 | peripheral | 1 | 1 |
| 49 | distributor | 5 | 3 |
| 49 | terminal | 1 | 1 |
| 49 | transit | 0 | 2 |
| 50 | peripheral | 1 | 1 |
| 51 | distributor | 1 | 1 |
| 51 | terminal | 2 | 2 |
| 52 | peripheral | 1 | 1 |
| 53 | peripheral | 1 | 1 |
| 54 | peripheral | 1 | 1 |
| 55 | peripheral | 1 | 1 |
| 56 | peripheral | 1 | 1 |
| 57 | peripheral | 1 | 1 |
| 58 | peripheral | 1 | 1 |
| 59 | peripheral | 1 | 1 |
| 60 | distributor | 1 | 1 |
| 60 | peripheral | 2 | 2 |
| 60 | terminal | 2 | 2 |
| 61 | peripheral | 1 | 1 |
| 62 | peripheral | 1 | 1 |
| 63 | peripheral | 1 | 1 |
| 64 | peripheral | 1 | 1 |
| 65 | peripheral | 1 | 1 |

## Tested pinned dependencies

### requirements.txt

```text
pandas==3.0.6
pyarrow==25.0.1
networkx==3.7
scipy==1.18.1
numpy==2.5.3
python-dateutil==2.9.0.post0
six==1.17.0
```

### requirements-api.txt

```text
-r requirements.txt
fastapi==0.141.1
uvicorn==0.53.0
starlette==1.7.0
pydantic==2.13.5
pydantic-core==2.46.5
typing-extensions==4.16.0
typing-inspection==0.4.4
annotated-doc==0.0.5
annotated-types==0.8.0
click==8.5.0
h11==0.16.0
anyio==4.15.1
idna==3.20
```

### requirements-ai.txt

```text
-r requirements-api.txt
openai==3.19.0
httpx2==2.13.1
httpcore2==2.13.1
truststore==0.10.4
jiter==0.17.0
sniffio==1.3.1
```

### requirements-dev.txt

```text
-r requirements-ai.txt
pytest==9.1.1
httpx==0.28.1
httpcore==1.0.9
certifi==2026.7.22
iniconfig==2.3.0
packaging==26.3
pluggy==1.6.0
pygments==2.21.0
```
