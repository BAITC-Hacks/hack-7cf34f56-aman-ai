# MoneyGraph Investigator — UI design contract

Status: proposed implementation contract, ready for frontend/backend review.  
Prepared: 2026-09-23. Scope: independent frontend in `apps/frontend/`.  
Primary reference: [approved investigator design](moneygraph-investigator-design.md).

This document defines the investigation workspace, required components, interaction rules, data dependencies, and verification criteria. It does not claim that the frontend or API already exists. The approved product brief remains the source for scoring; this contract does not implement or change scoring formulas.

## 1. Repository findings and decisions

| Inspected source | Current state | Design consequence |
| --- | --- | --- |
| [Investigator design](moneygraph-investigator-design.md) | Approved pipeline → API → independent UI; Top-20, search, node cards, local subgraphs | One investigation workspace is the MVP entry point |
| [Hackathon requirements](project_description.md) | Explainable roles, clusters, ranked targets, directed graph, gid search, local execution | Evidence and data limitations must be visible during the main workflow |
| [Dataset schema](../starter/READ_2.md) and `data/*.parquet` | 2,248 nodes, 3,119 edges, 4,840 transactions; July 2026 | Display the observed period and scope; avoid live-monitoring language |
| [Starter](../starter/starter.py) and `starter/out/` | 2,248 rows with blank roles; cluster and Top-20 files contain headers only | These are incomplete pipeline outputs, not valid ranked fixtures or a completed analysis |
| `apps/frontend/`, `apps/backend/` | Placeholder directories; no package, components, routes, or API implementation | Component/file names below are proposed; no installed framework or component base is assumed |
| [Frontend skills](../.codex/skills/frontend-design/README.md) | shadcn, Bklit UI, MoneyGraph frontend, frontend QA | Compose existing shadcn primitives; reserve Bklit for optional charts |
| [AGENTS.md](../AGENTS.md) | Frontend ownership, read-only backend review, browser QA requirements | Keep backend edits out of frontend work and report integration gaps |

### Verified conflicts to resolve before integration

These findings come from reading the local Parquet files, not from inferred customer behavior.

| Finding | Evidence | Required response |
| --- | --- | --- |
| The approved brief assumes edges only connect successive depths | 745 edges do not satisfy `dst.depth == src.depth + 1`; there are 84 strongly connected components containing multiple nodes | Preserve all actual directions. Depth means minimum discovery depth, not transaction order. Backend must review the depth-ordered seed-mask algorithm; do not build the UI around a DAG assumption |
| Component counts depend on whether isolated nodes are included | 16 weak components for edge endpoints; 35 after adding all 2,248 nodes, including 19 isolated seeds | If component count is displayed, use all-node scope and name it explicitly |
| IDs exceed JavaScript's safe integer range | Confirmed in `nodes.parquet` | Serialize every `gid`, `src`, `dst`, and `top_gids` element as a decimal string before JSON serialization |
| Some guidance links have moved | `starter/project_description.md` and `public/skills/` are absent in this checkout | Use `docs/project_description.md` and `.codex/skills/frontend-design/`; repair old guidance links when maintaining those documents |
| Dataset restrictions prevent full balances | 444 depth-4 nodes have no outgoing edges; seed inflows are incomplete | Describe observed volumes, boundary uncertainty, and missing data rather than account balances |

Cycles are a data fact, but cycle detection UI remains outside the MVP. Neither discard reverse/same-depth edges nor advertise cycle analysis as implemented.

## 2. User outcome and scope

An AML analyst must answer: **“Which client should I inspect first, why, and what should I request next?”**

The default workflow is:

1. Open the ranked Top-20 or search any exact gid, including an isolated node.
2. Select a client and see the same selection in the list, graph, and inspector.
3. Read the role hypothesis, numerical evidence, observed flows, and connected seed count.
4. Follow incoming/outgoing links or inspect the client's cluster.
5. Read limitations and the recommended next data request.

| Release | Included |
| --- | --- |
| MVP | Workspace shell, dataset context, Top-20, exact gid search, one-hop graph, two-hop switch, node inspector, selected-cluster summary, complete loading/empty/error states |
| After MVP | Cluster graph when its payload and cap behavior are agreed; daily temporal charts; resilience explanation; CSV download UI when artifact delivery is defined |
| Optional last | OpenAI Investigator with grounded node links; Agentation for development feedback |
| Outside this contract | Authentication, customer identity enrichment, editing roles/scores, blocking accounts, case management, upload/recompute UI, full-network rendering |

Mandatory CSV generation stays independent of the frontend. The UI must work without an LLM or paid service. All must-have assets should run locally after dependencies are installed.

## 3. Screen composition

### Main investigation workspace

Desktop acceptance viewport: **1440 × 900 CSS pixels**. The initial screen shows Top-20 and a prompt to select a client. Do not auto-select the first client or render the full network.

```text
┌────────────────────────────────────────────────────────────────────────┐
│ MoneyGraph Investigator     [Search exact gid____________] [Search]     │
│ July 2026 · Intra-bank transfers · ≥5,000 KZT · Observed depth 0–4       │
├──────────────────┬─────────────────────────────┬───────────────────────┤
│ Investigation    │ Connections                  │ Node Inspector        │
│ priorities       │ [1 hop | 2 hops] [Fit]        │ gid + Copy             │
│ Top-20           │ [Role | Cluster colors]      │ Role · Seed · Depth    │
│ [Role filter]    │                             │ Boundary/seed notice  │
│                  │                             │                       │
│ # gid            │    Directed local graph     │ Summary | Evidence    │
│ Role · priority  │                             │ Connections           │
│ Why this node    │                             │                       │
│ ...              │                             │ Role / priority       │
│                  │                             │ Observed flows        │
│                  │ Legend · shown count · cap  │ Next data request     │
├──────────────────┴─────────────────────────────┴───────────────────────┤
│ Observed-data hypotheses. No conclusion about guilt.                    │
└────────────────────────────────────────────────────────────────────────┘
```

- Header: approximately 64 px; dataset context: approximately 36 px; footer: approximately 28 px. These are layout targets, not fixed heights that clip zoomed text.
- At 1440 px: 16 px outer spacing, 12 px gaps, approximately 288 px left list, 400 px inspector, remaining width for the graph (approximately 696 px before panel borders).
- Each list/inspector body scrolls independently; header, panel titles, and selection remain visible. Avoid nested scroll containers in each card.
- Inspector heading exposes the full gid, with wrapping if needed. Compact list labels may truncate but must support full-value tooltip and copy/accessibility text.
- Cluster summary opens within the center panel as a `Card` with a clear “Back to connections” action. Node selection stays intact.

### Responsive behavior

| Width | Layout |
| --- | --- |
| 1280 px and above | Three columns with persistent inspector |
| 900–1279 px | List + graph; inspector opens in a right `Sheet` with a title and focus return |
| Below 900 px | One main panel; `Tabs` switch Priorities / Connections; inspector is a `Sheet`; search stays reachable |

The same selection state powers all layouts. Do not mount separate mobile data stores. At 200% zoom, essential information and controls remain accessible without page-level horizontal scrolling.

## 4. Component inventory

Names in the first column are proposed application components. They compose the primitives in the second column; they are not alternative implementations of shadcn components.

| Application component | shadcn primitives / rendering | Responsibility and interaction |
| --- | --- | --- |
| `InvestigationWorkspace` | Layout CSS, `Separator` | Own selection and arrange the three panels |
| `DatasetContext` | `Badge`, `Tooltip`, `Alert` | Period, data scope, API availability; persistent visible fixture badge in mock mode |
| `GidSearch` | `Field`, `Input`, `Button`, `Spinner` | Validate digits as text; submit exact lookup; announce result/error |
| `PriorityPanel` | `ScrollArea`, `Select`, `Empty`, `Skeleton` | Render server-ranked Top-20; optional role filter only within those 20 |
| `PriorityListItem` | `Button`, `Badge`, `Tooltip` | Rank, gid, role, priority, and readable `why`; selected styling and keyboard activation |
| `GraphPanel` | `Card`, graph renderer, `Alert`, `Empty` | Render only the selected local subgraph with original arrows |
| `GraphToolbar` | `ToggleGroup`, `Button`, `Tooltip` | One/two hops, role/cluster coloring, fit, zoom and reset |
| `GraphLegend` | `Badge`, `Separator` | Role/cluster encoding, seed marker, selection marker, boundary marker |
| `GraphCoverageNotice` | `Alert`, `Badge` | Shown/total counts and explicit truncation; distinguish cap from absence of connections |
| `NodeInspector` | `Card`, `Tabs`, `ScrollArea`, `Separator` | Compose the seven required inspector primitives with one scrolling body |
| `NodeIdentity` | `CardHeader`, `CardTitle`, `Badge`, `Button`, `Tooltip` | Full gid, copy action, hypothesis label, seed/depth/cluster |
| `ScoreSummary` | `Progress`, `Tooltip` | Separate role confidence and analyst priority, with numeric labels |
| `ObservedFlowSummary` | `CardContent`, `Separator` | Incoming/outgoing KZT, unique counterparties, transaction counts |
| `EvidenceBreakdown` | `Progress`, `Tooltip`, `Table` | Actual evidence, six role scores/applicability, weighted priority contributions |
| `LimitationNotice` | `Alert` | Boundary and incomplete inflow notices above the inspector tabs |
| `NextDataRequest` | `CardFooter`, `Button` | Backend recommendation; copy text with success/error feedback |
| `NodeConnections` | `Table`, `Badge`, `Button` | Incoming/outgoing counterparties with amounts and counts; accessible graph alternative |
| `ClusterSummary` | `Card`, `Badge`, `Separator`, `Button` | Size, seed members, internal volume, hypothesis, clickable top gids |
| `PanelFeedback` | `Skeleton`, `Empty`, `Alert`, `Button` | Shared structure for waiting, no results, errors and retry |
| `InspectorSheet` | `Sheet`, `SheetTitle`, `SheetDescription` | Responsive inspector; keyboard focus restoration on close |

Use `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter` and `TabsList`/`TabsTrigger`/`TabsContent` composition. Every progress bar has a textual value and accessible label. Tooltips supplement visible content; they do not contain the only copy of important limitations.

The shadcn MCP confirmed Card, Badge, Tabs, Tooltip, ScrollArea, Progress, and Separator and returned a Tabs/Card composition example during this review. No `components.json` exists yet. Choose the primitive base during scaffolding, then verify actual component APIs and aliases with the MCP/CLI before implementation; do not mix base-library examples.

### Specialized rendering

The network renderer is a separate dependency behind `GraphPanel`; it must support directed edges, cycles, pan/zoom, selection, deterministic initial positions, and at most 250 visible nodes. shadcn supplies its surrounding controls. Choose the renderer during scaffolding after a small local rendering check; this document does not claim one is installed.

Bklit UI is optional for a later daily incoming/outgoing chart. Use its configured registry, semantic chart tokens, axes, grid, tooltip, and reduced-motion behavior. It is not the network graph renderer. Do not install a chart package just to draw the role or priority bars; `Progress` covers those.

## 5. Visual and content system

- Proposed default: light neutral workspace, subdued borders, one primary action color, dense but readable analysis panels. Dark mode is optional after the core workflow passes.
- Use shadcn semantic tokens: `background`, `foreground`, `card`, `muted`, `muted-foreground`, `border`, `primary`, `accent`, `destructive`. Set theme values centrally; avoid component-local raw colors.
- Extend theme tokens for roles and graph markers. Proposed hues: consolidator teal, transit blue, distributor amber, terminal slate, coordinator violet, peripheral gray. These encode role hypotheses, not guilt or severity. Pair them with text labels and a legend.
- Cluster mode uses a separate deterministic categorical palette plus explicit cluster IDs. Role colors and cluster colors must never be shown under the same legend.
- Seed nodes have a labeled outer ring; selected nodes have a distinct focus outline; boundary nodes have a dashed outline and depth label. Keep these markings when switching color modes.
- Spacing uses 4/8/12/16/24 px steps. Body text targets 14 px with 20 px line height; secondary text stays at least 12 px. Use tabular numerals for scores and KZT; monospaced text for gids.
- Use the configured icon library. Icon-only buttons require accessible names. Icons inside shadcn controls follow the selected component base's conventions.
- Respect reduced motion. Avoid animated money particles and continual graph movement.
- Proposed MVP UI language: Russian, consistent with the dataset and judging material. Keep identifiers and API enums unchanged; centralize labels to allow later translation. This document uses English for implementation discussion.

| Data | Presentation rule |
| --- | --- |
| `gid`, `src`, `dst` | Full decimal string; never `Number`, `parseInt`, numeric input, or scientific notation |
| KZT | Group digits and show `KZT` or `₸`; compact graph labels may abbreviate only if exact amount is available in the inspector/table |
| Role score | `0.91` → `91%`; label as heuristic role confidence, never probability of guilt |
| Priority | `0.87` → `87 / 100`; separate from role confidence |
| Unknown value | “Нет данных”; not zero, a blank progress bar, or inferred absence |
| Inapplicable role | “Не применяется” with the backend reason; not a zero-confidence result |
| Observed zero | Show zero explicitly with relevant scope/limitation |
| Dates | Calendar dates only. Temporal evidence may say same day or within two days, never minutes |
| Seed reach | Number of distinct seeds with an observed directed path; not a count of transactions, independent routes, or proven shared money |

Use “Признаки консолидации”, “Гипотеза о роли”, and “Наблюдаемый входящий объём”. Do not use “преступник”, “организатор подтверждён”, or “остаток на счёте”.

## 6. Node Inspector contract

Always-visible heading: full gid, copy button, role hypothesis, seed marker when applicable, depth, and cluster link. Boundary/incomplete-data alerts remain above tabs. Default tab is Summary.

| Tab | Required content |
| --- | --- |
| Summary | Role confidence and priority; numerical evidence; observed incoming/outgoing volumes; sender/recipient counts; incoming/outgoing transaction counts; distinct reachable seed count; next data request |
| Evidence | Six role scores, applicability, selected role; actual backend priority contributions; raw feature values and their normalization cohort when supplied; limitations and method explanations |
| Connections | Separate incoming and outgoing tables: counterparty gid, role when available, monthly KZT, transaction count. Selecting a gid recenters the investigation |

The cluster link loads that cluster's summary in the center panel. `n_seed` in a cluster is physical seed membership; it must not be labeled as reachable seeds.

Do not calculate roles, evidence, ranks, or priority in the browser. Show returned score components with their weights/contributions. If a module was not computed, display that fact even when the scoring pipeline used zero internally. A seed pass-through ratio must not be shown as meaningful without its incomplete-inflow caveat. Do not label `retention_obs` as retained cash or a bank balance.

## 7. Graph and interaction rules

### Graph scope

- Initial selection requests one hop; two hops is explicit. Hop values are limited to 1 or 2.
- Proposed neighborhood meaning: all nodes within the requested number of incident-edge steps, so both incoming and outgoing neighbors are visible; retained edges keep their true `src → dst` direction. Backend must confirm this definition before integration.
- Never filter edges because of depth direction. Layout may suggest discovery depths but cannot imply chronological layers or require acyclicity.
- Arrowheads indicate transfer direction; line width may use a documented logarithmic amount scale. Hover/focus shows exact source, destination, monthly amount, and transaction count when supplied.
- Cap visible nodes at 250. Backend selects the subset deterministically and returns truncation metadata. The selected node must remain present. Missing edges beyond a cap are not evidence of no activity.
- Show an isolated selected node with “Нет наблюдаемых связей”. Search must still find all 19 isolated seeds.
- Global node degree, flow totals, and seed reach shown in the inspector come from the full analyzed export, never from the currently visible/capped graph.
- Before cluster graph support exists, show a cluster summary and top-node links. Do not synthesize a cluster graph from a one-hop response.

### Shared state and actions

Proposed state: `selectedGid`, `hop`, `inspectorTab`, `colorMode`, `priorityRoleFilter`, `centerView` (connections/cluster). Search text is separate from committed selection.

| Action | Expected effect |
| --- | --- |
| Select Top-20 item, graph node, connection, or cluster top gid | One shared selection changes; matching node card and subgraph load; center returns to connections |
| Submit exact gid | Trim whitespace, require decimal digits, preserve the string. Successful lookup selects it; invalid/unknown input gets an inline message |
| Search fails | Preserve the previous valid investigation; do not retitle old data with the failed query |
| Change selected gid | Reset inspector to Summary and graph to one hop; preserve the priority-list filter and color mode |
| Change hop | Refetch graph only; preserve inspector and selected gid |
| Filter Top-20 by role | Filter the returned list only. Label “X of 20”; preserve original rank numbers and selected node even if hidden from the list |
| Select cluster link | Load selected cluster summary; keep inspector and selected gid |
| Retry a failed panel | Retry only that request; other successful panels remain usable |
| Clear search input | Clear input/result message; do not implicitly clear node selection |

Support deep links using a proposed URL query `?gid=<decimal-string>&hop=1`; browser back/forward restores selection. Abort or ignore stale responses so quick A→B selection can never show A's metrics under B's heading. Cache entries must include gid and hop where relevant.

## 8. Data boundary and integration agreement

The approved design lists routes but does not fully define all response envelopes. The following are **frontend needs/proposals**, not assertions about an existing backend. Freeze response examples with the backend owner before binding real UI calls.

| Existing planned route/artifact | UI consumer | Confirm before integration |
| --- | --- | --- |
| `GET /api/top-nodes` | Priority panel | Array/envelope, rank, gid string, role, score, `why`; exactly 20 for this dataset; preserve server order |
| `GET /api/search?gid=` | Exact search | Exact-match semantics and result envelope; unknown lookup behavior; numeric query stays a string |
| `GET /api/nodes/{gid}` | Inspector | Complete view model below; documented 404 for unknown gid |
| `GET /api/nodes/{gid}/subgraph?hop=1` | Graph | Neighborhood meaning, included edges, cap policy, selected-node inclusion, totals and truncation metadata |
| `GET /api/clusters/{cluster_id}` | Cluster summary | Summary fields; whether member IDs/graph are included; no cluster-list route is currently specified |
| `GET /health` | API status | Distinguish process reachable from results ready; do not infer pipeline completion from HTTP 200 alone |
| `results/node_cards.json`, `results/graph.json` | Backend artifacts | Not public browser routes unless deliberately served; no assumed `/api/graph` endpoint |
| Three required CSVs | Pipeline deliverables | Download transport unspecified. Hide download controls until implemented; do not fabricate endpoints |

### Proposed frontend view models

These are adapter-level types. Backend wire names may differ, but the mapping must be explicit and validated at runtime. `null` means not supplied/not computed; it is never silently converted to zero.

```ts
type Gid = string; // decimal text validated at the API boundary
type Role = "consolidator" | "transit" | "distributor"
  | "terminal" | "coordinator" | "peripheral";

type Edge = {
  src: Gid;
  dst: Gid;
  sum_kzt: number; // finite, nonnegative observed monthly KZT
  n_tx: number | null;
};

type RoleDetail = {
  score: number | null; // 0..1 when available
  applicable: boolean;
  reason: string | null;
};

type NodeCard = {
  gid: Gid;
  role: Role;
  role_score: number;
  priority_score: number;
  cluster_id: number;
  depth: number;
  is_seed: boolean;
  evidence: string;
  observed_flows: {
    incoming_kzt: number;
    outgoing_kzt: number;
    in_degree: number;
    out_degree: number;
    in_tx: number;
    out_tx: number;
  };
  seed_reach_count: number | null;
  role_scores: Record<Role, RoleDetail>;
  priority_components: Array<{
    key: string;
    value: number | null;
    weight: number;
    contribution: number;
    computed: boolean;
  }>;
  limitations: Array<{ code: string; message: string }>;
  next_action: string | null;
  edges: Edge[]; // confirm complete incident-edge coverage
};

type Subgraph = {
  nodes: Array<{
    gid: Gid;
    role: Role;
    cluster_id: number;
    depth: number;
    is_seed: boolean;
  }>;
  edges: Edge[];
  coverage: {
    truncated: boolean;
    total_nodes: number | null;
    total_edges: number | null;
    limit: number;
  };
};
```

The approved example uses `limitations: string[]` and fewer graph fields; structured limitation codes, extended graph metadata, and the envelopes above are proposals requiring agreement. An adapter can preserve backend strings as messages without inventing codes. The UI may flag a known boundary from `depth === 4`, but analytical conclusions remain backend-owned.

Dataset period, threshold, node/edge/transaction counts, and analysis readiness need a documented metadata source. For the single-export demo, a clearly scoped build-time dataset descriptor is acceptable; it must not pretend to track reruns. Prefer a backend run/version identifier once available to prevent mixed-run caches.

Rejected payloads (numeric gids, invalid scores, missing role/evidence) produce a data-contract error state. The starter's blank roles must show “Analysis not ready”, not `peripheral`, zero confidence, or a fake Top-20. Mock responses use the same adapter and carry a visible “Демонстрационные данные” indicator; never silently fall back to mocks after an API error.

## 9. State matrix

| Area/state | Display | Recovery |
| --- | --- | --- |
| Initial no selection | Top-20 plus graph/inspector `Empty` prompting selection or gid search | Select a result |
| Initial loading | Sized `Skeleton` rows and panel placeholders | Replace on completion; announce loaded result count |
| Node switch loading | New gid heading and skeleton details; previous graph/data cleared or explicitly marked updating | Latest response wins |
| No ranking output | Analysis-not-ready `Alert`, not a claim that no suspicious clients exist | Retry after pipeline completes |
| Filter has zero matches | `Empty` saying no matches in Top-20 | Clear role filter |
| Unknown/invalid gid | Inline validation/no-result message | Edit query; preserve prior selection |
| Isolated node | Valid inspector and a single-node graph | Search another node or return to priorities |
| Depth-4 node | Visible boundary alert, observed outgoing zero allowed | Show backend next-data recommendation |
| Graph cap reached | Partial-view notice with returned/shown counts | Narrow to one hop; no claim of completeness |
| API unavailable / HTTP 5xx | Panel `Alert` with retry; no silent fixture substitution | Retry without losing valid independent panels |
| HTTP 404 for a deep link | Node-not-found state | Search again or return to priorities |
| Optional module absent | “Не рассчитано” for affected metric; hide unavailable chart | Main investigation still works |
| Malformed response | Data-contract error with useful developer diagnostics | Fix adapter/backend mismatch; never render guessed values |

## 10. Implementation sequence and handoff

| Step | Frontend deliverable | Exit condition |
| --- | --- | --- |
| 1. Agree data boundary | Exact response fixtures, schema validation, documented adapter; resolve graph-depth conflict with backend owner | All MVP screens have fields or explicit unavailable states; no invented endpoints |
| 2. Scaffold | Frontend package, shadcn configuration, theme, lint/build scripts, shell | Shell fits 1440×900; all required primitives imported from installed components |
| 3. Build core interactions | Top-20, exact search, shared selection, Inspector Summary/Evidence/Connections | Clearly labeled fixtures cover normal, isolated, boundary, error and loading cases |
| 4. Add local graph and cluster summary | Directed/cyclic graph support, one/two hops, cap notice, clickable cluster top gids | Every selection source opens the same node; no full-network rendering |
| 5. Integrate backend | Real responses through the same adapter | Actual gid lookup, evidence and flow numbers match backend; fixtures are explicitly disabled |
| 6. Verify and rehearse | Lint/build, Playwright checks, screenshots, three-node demo | Acceptance checks below pass or remaining blockers are explicitly reported |

Backend handoff questions: exact envelopes; search semantics; neighborhood traversal/capping; node-card field completeness; all-role applicability; optional computation flags; result readiness/metadata; cluster graph membership; later download transport. These do not block the documented layout or labeled-fixture implementation.

Frontend owns components, formatting, state, adapters, and browser verification. Backend owns metrics, scoring, rank order, cluster IDs, evidence, seed reachability, and artifact/API generation. Inspect teammate branches read-only if contract comparison is requested; do not modify their branch.

## 11. Acceptance checklist

Apply [frontend-qa](../.codex/skills/frontend-design/frontend-qa/SKILL.md) after significant UI implementation. This document-only change has no runnable frontend to lint, build, or browser-test.

- [ ] `npm run lint` and `npm run build` pass from the frontend package.
- [ ] Start the actual app and verify workflows with Playwright MCP; inspect console errors and failed network requests.
- [ ] At 1440×900, list, graph, and inspector coexist; full gid/evidence/limitations are reachable with no clipped controls.
- [ ] Check narrow layout and 200% zoom; Sheet close returns focus; keyboard users can search, select, switch tabs, and inspect connections.
- [ ] Top-20 retains backend order, original rank and numerical `why`; display role confidence separately from priority.
- [ ] Search an exact gid greater than `2^53`; URL, displayed identifier, fetched identifier and copied identifier match byte-for-byte.
- [ ] Select via priority list, graph, connection and cluster top gid; all paths produce one consistent inspector.
- [ ] Delay A's response, select B, then release A: B remains selected and shows only B's details.
- [ ] Render at least one same-depth or backward-depth edge with its actual arrow; cycles do not break layout.
- [ ] Find an isolated seed; show a valid card and no observed connections rather than a missing-node error.
- [ ] Inspect a depth-4 node: boundary alert visible; zero outflow never becomes proof of terminal behavior.
- [ ] Inspect a seed: incomplete inflows remain explicit where ratios are shown.
- [ ] Compare observed KZT, counterparties, transaction counts and seed reach against the full backend card, not the visible graph.
- [ ] One/two-hop changes preserve the selected node; a capped response is explicitly marked partial.
- [ ] Exercise initial empty, no-match, not-ready, delayed, 404, 5xx, malformed payload, retry, and optional-module-unavailable states.
- [ ] Mock mode remains visibly labeled; API failures never silently switch to mock data.
- [ ] Save a representative desktop screenshot and report tested URL, data source, checks, failures and blockers.

Five-minute demo: open real Top-20, explain a high-priority node from returned evidence, navigate an actual directed connection, search a depth-4 node and explain uncertainty, then find an isolated seed. Choose example gids from computed results; never hardcode their analytical outcomes.

## 12. Reference map

- [Approved product and scoring design](moneygraph-investigator-design.md)
- [Hackathon requirements](project_description.md)
- [Parquet data schema](../starter/READ_2.md)
- [Starter implementation](../starter/starter.py)
- [MoneyGraph frontend skill](../.codex/skills/frontend-design/moneygraph-frontend/SKILL.md)
- [shadcn skill](../.codex/skills/frontend-design/shadcn/SKILL.md)
- [Bklit UI skill](../.codex/skills/frontend-design/bklit-ui/SKILL.md)
- [Frontend QA skill](../.codex/skills/frontend-design/frontend-qa/SKILL.md)

Optional AI implementation must use OpenAI documentation MCP and return links to calculated facts. It must not assign roles, regenerate evidence as fact, or block deterministic investigation flows. Agentation is a development-only option after a runnable UI exists.
