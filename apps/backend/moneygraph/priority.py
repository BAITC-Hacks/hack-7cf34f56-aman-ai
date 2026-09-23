from __future__ import annotations
import networkx as nx
import pandas as pd
from .features import pct_depth
WEIGHTS={"coordinator":1.,"consolidator":1.,"transit":.85,"distributor":.8,"terminal":.45,"peripheral":.15}
def _reach_pairs(g):
 seeds=sorted(n for n,a in g.nodes(data=True) if a.get("is_seed")); total=0
 for seed in seeds:
  seen={seed}; q=[seed]
  for n in q:
   for t in sorted(g.successors(n)):
    if t not in seen: seen.add(t);q.append(t)
  total+=sum(not g.nodes[n].get("is_seed",False) for n in seen)
 return total
def apply_priority(features:pd.DataFrame, graph:nx.DiGraph)->pd.DataFrame:
 out=features.copy(); out["centrality"]=(out.pagerank_pct+out.betweenness_pct)/2; out["temporal"]=pd.DataFrame({name: out.get(name, pd.Series(0., index=out.index)) for name in ("timing_consistent_turnover", "burst_pct", "synchronous_incoming_pct")}).max(axis=1)
 out["role_weight"]=out.role.map(WEIGHTS); out["resilience_pct"]=0.
 out["preliminary_priority"]=(.30*out.role_weight*out.role_score+.25*out.seed_convergence+.15*out.centrality+.15*out.observed_volume_pct+.10*out.temporal).clip(0,1)
 candidates=out.sort_values(["preliminary_priority","gid"],ascending=[False,True],kind="stable").head(50).gid.tolist()
 l0=max((len(c) for c in nx.weakly_connected_components(graph)),default=0); r0=_reach_pairs(graph); raws={}
 for gid in candidates:
  g=graph.copy(); g.remove_node(gid); l1=max((len(c) for c in nx.weakly_connected_components(g)),default=0); r1=_reach_pairs(g)
  raws[gid]=.5*((l0-l1)/l0 if l0 else 0)+.5*((r0-r1)/r0 if r0 else 0)
 raw=pd.Series([raws.get(g,0.) for g in out.gid],index=out.index); candidate_idx=out.index[out.gid.isin(candidates)]
 out.loc[candidate_idx,"resilience_pct"]=pct_depth(raw.loc[candidate_idx],pd.Series(0,index=candidate_idx)).values
 out["resilience_raw"]=raw; out["priority_score"]=(out.preliminary_priority+.05*out.resilience_pct).clip(0,1)
 return out
