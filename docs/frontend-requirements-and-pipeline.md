# MoneyGraph: analyst workflow and pipeline handoff

Updated 2026-09-23. Sources: [official project brief](project_description.md), [dataset schema](../starter/READ_2.md), [UI contract](moneygraph-ui-design-contract.md), and the current source tree. This document refines the first implementation; it does not declare the analytical pipeline complete.

## Product decision

The interface answers **“Which client should I examine first, and why?”** in three steps:

1. **Select a client.** A ranked list preserves the pipeline's order and reason. Search accepts a complete decimal gid without converting it to a JavaScript number.
2. **Follow observed transfers.** The selected client is centered, with direct senders on the left and recipients on the right. Up to three largest counterparties per side make the default diagram readable. Arrows retain the actual direction, including returns and cycles. Second-hop nodes occupy outer columns; columns are a presentation layout, not inferred dataset depth or proof that the same funds moved through a chain.
3. **Check the evidence.** The inspector separates role confidence from investigation priority, gives observed amounts and transaction counts, explains limitations, opens the community summary, and provides a next action. AI is a separate tab in the same panel.

The diagram explicitly reports hidden clients. The **Transfers** tab retains all edges in the loaded neighborhood, sorted by amount, with complete IDs and exact amounts/counts. If the backend caps the neighborhood, both the table and its CSV remain partial and display a warning. Nothing missing from the diagram is treated as absent from the network.

## Required capabilities and their owners

| Requirement from §7 of the brief | Frontend responsibility | Pipeline responsibility / current status |
| --- | --- | --- |
| One reproducible run, three CSVs, under five minutes | Explain when results are unavailable; consume completed results | Load the three parquet files, build the directed graph, compute metrics/roles/communities, export all three CSVs. Starter still contains TODO role/rank/cluster logic. Not completed by this UI change. |
| Role, role score and nonempty evidence for all 2,248 clients | Exact lookup and a readable card; reject malformed data, including numeric JSON IDs | Assign one of six required roles to every node, including isolated seeds; produce complete evidence. The frontend currently uses 26 labeled synthetic clients. |
| Formal, explainable role criteria | Display the pipeline's evidence, six role scores, applicability and priority contributions without fabricating metrics | Implement and document thresholds, calculation rules and reasons. AI must not assign roles. |
| Community detection and summaries | Color by cluster; open size, seed count, internal flow, hypothesis and key client links | Compute `cluster_id` for every client and complete `clusters.csv`. Real community integration is pending. |
| At least 20 ranked clients, reasons, directed network and gid search | Ranked list, role filter, exact gid lookup, one/two-hop views, labeled directions, inspector navigation | Deliver valid `top_nodes.csv` and graph/card data for every client. The demo has 20 synthetic ranked entries. |

The current browser can download the loaded priority list and neighborhood transfers. These convenience exports **do not replace** the mandatory pipeline exports `nodes_roles.csv`, `clusters.csv`, and `top_nodes.csv`.

## Input and output boundaries

The pipeline receives `nodes.parquet`, `edges.parquet`, and `transactions.parquet`; it owns all calculations. The browser does not infer roles, reorder priorities, invent seed reachability, or run a replacement scoring algorithm. It only ranks neighbors by observed edge amount to choose a readable diagram subset.

Required CSV schemas stay unchanged:

- `nodes_roles.csv`: `gid,role,role_score,cluster_id,priority_score,evidence`.
- `clusters.csv`: `cluster_id,n_nodes,n_seed,sum_kzt_internal,top_gids,hypothesis`.
- `top_nodes.csv`: `rank,gid,role,priority_score,why`.

The analytical HTTP routes in [the frontend adapter](../apps/frontend/src/lib/api.ts) remain **proposals**, not a verified backend implementation:

| Route | Required response |
| --- | --- |
| `GET /api/top-nodes` | Array of rank, string gid, role, score and reason |
| `GET /api/search?gid=...` | Exact `{gid: string}`; 404 for unknown ID |
| `GET /api/nodes/{gid}` | Runtime-validated NodeCard: identity, role/evidence, observed flows, scores, limitations, next action, incident directed edges |
| `GET /api/nodes/{gid}/subgraph?hop=1|2` | Nodes, directed edges, explicit coverage/truncation; maximum 250 nodes, selected node retained |
| `GET /api/clusters/{cluster_id}` | Size, seed count, observed internal amount, key gids, hypothesis |

All IDs cross JSON boundaries as decimal strings. Scores are 0–1; only presentation converts them to percentages. Unknown metrics remain `null`, never zero. An API failure must not trigger a switch to demo data. A shared pipeline run/version identifier remains an integration requirement before mixed-run caching is supported.

## Interpretation requirements

The interface preserves the depth-4 boundary warning, incomplete incoming seed flows, the 5,000 KZT cutoff and intra-bank July 2026 scope. Observed inflow minus outflow is not an account balance. A community is not established criminal membership. Role confidence is not a probability of guilt. A zero outgoing degree at the observation boundary does not establish a terminal recipient.

Cycles and non-adjacent-depth edges are allowed. The readable layout preserves their directions rather than silently changing them to match its columns.

## AI assistant

The user opens **AI assistant** or **Explain with AI**. Explain pre-fills a question; it does not automatically transmit data. Sending a question uses the selected string gid, question, recent conversation and review preference. The server retrieves facts itself from the same selected data mode.

Implemented local endpoints:

- `GET /api/agent/status`: credential configuration availability and data mode; this is not proof of provider authentication.
- `POST /api/agent/chat`: bounded question/history, optional selected gid, `demo|api` mode and optional NVIDIA review. Returns answer, retrieved-client references, tool outcomes, source mode and review status.

OpenAI uses the Responses API with the read-only tools `get_node`, `get_top_nodes` and `get_cluster`. Tool arguments and analytical responses are validated. Requests are capped at four model rounds/eight tool calls, use a timeout and cancellation, and disable provider response storage. The server refuses data-mode mismatch and never trusts a browser-supplied card as evidence. Only retrieved clients become navigable references.

NVIDIA optionally critiques the answer against the same retrieved evidence. Its review is shown separately as **a second opinion**, not proof that the answer is correct. Failed review is explicitly marked unavailable; it does not erase a successful OpenAI answer.

There is no implemented path-finding, shared-downstream, temporal-analysis or resilience tool. The assistant is instructed to identify these gaps. Those optional features require deterministic pipeline tools before they can be offered as reliable AI actions.

Provider keys live in the root `.env`, never `VITE_*` or browser bundles. `npm run dev` and `npm run preview` mount the local agent bridge. A standalone loopback service is available for integration via `npm run agent`; a deployed static frontend needs a same-origin reverse proxy to it. This local prototype is not an authenticated multi-user deployment.

## Validation and live integration status

UI and agent orchestration tests use synthetic records and mocked provider responses. Real provider probes on 2026-09-23 found OpenAI HTTP 401 `invalid_api_key` and NVIDIA HTTP 401 using a model present in its current catalog. Replace the corresponding keys in the local root `.env` and restart the dev server to complete live validation. Existing credentials were not changed or displayed.

References used for implementation: [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling), [GPT-4.1 mini capabilities](https://developers.openai.com/api/docs/models/gpt-4.1-mini), [NVIDIA Nemotron API](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-omni-30b-a3b-reasoning-infer). Model IDs are server configuration, so they can be changed when provider availability changes.
