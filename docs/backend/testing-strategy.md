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
