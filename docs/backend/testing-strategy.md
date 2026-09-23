# Testing strategy

Use small synthetic fixtures plus integration validation on supplied Parquets.

- **Data:** schemas, missing/negative amounts, endpoint universe, depth 0..4,
  aggregate edge uniqueness, date parsing, duplicate transaction retention.
- **Graph:** directed orientation, weights, no self-loops, components.
- **Seed convergence:** `S1→A→X`, `S2→B→X` yields `seed_reach_count(X)==2`;
  `S1→A→X` and `S1→B→X` still yields 1; a directed cycle terminates through the
  visited set and marks each reachable node once; cross-level edges remain
  reachable; a disconnected seed marks only itself; sorted traversal is stable.
- **Features/percentiles:** average-rank depth-relative minimum, maximum, ties,
  constant group, single-node group, unavailable/invalid fallback =0; retention
  and flow balance ranges.
- **Priority:** preliminary priority sets `resilience_pct=0`, chooses stable top50,
  outside candidates retain zero resilience, then final priority is bounded.
- **Louvain:** fixed seed/relabeling yields identical cluster IDs on rerun.
- **Roles:** every formula bounded; eligibility, .55 floor, depth-4 never terminal
  solely due zero outgoing.
- **Priority:** bounded components/score, deterministic ties, resilience only top50.
- **Evidence:** factual, nonempty, <=200 chars, includes boundary limitation.
- **Outputs:** exact headers/row counts, valid enum, decimal gids, UTF-8, JSON
  string gids, deterministic byte-for-byte rerun.
- **API:** 200/400/404, gid-string handling, hop and node caps.
- **Integration:** `python main.py` from raw Parquets creates all three CSVs under
  five minutes without frontend, API, LLM, internet, or database.

Depth-4 retention is retained as observed data but excluded from consolidator inference; it is unreliable because the observation boundary truncates outgoing visibility. Consumer views must show role eligibility separately from theoretical score.

## Completion regressions
- Peripheral complement uses eligible roles at depths 0/4 and the same .55 floor.
- Explorer explains every selected real role, including Peripheral and Transit.
- Temporal offsets 0/1/2 qualify, 3 does not; multiple incoming days cannot count
  an outgoing amount twice; unique same-day senders and incident counts are tested.
- Global Top-20 membership is checked against all node outputs.
- Real-data temporal/priority reconstruction, eligibility and candidate-only resilience.
- Product JSON score applicability, string gids, graph endpoints and priority sums.
- Read-only API known/missing/malformed inputs, both hops, cap, cluster/search and
  missing artifacts; optional AI unavailable state.
- Seven bounded tools, cycle safety, unreachable paths and mocked SDK Responses
  roundtrip, invalid tool calls and budgets.
