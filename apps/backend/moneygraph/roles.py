from __future__ import annotations
import networkx as nx
import pandas as pd
from .features import pct_depth

ROLE_ORDER = ("coordinator", "consolidator", "transit", "distributor", "terminal")
FLOOR = 0.55

def apply_roles(features: pd.DataFrame, graph: nx.DiGraph, cluster_ids: dict[str,int]) -> pd.DataFrame:
    out=features.copy(); out["cluster_id"]=out["gid"].map(cluster_ids).astype(int)
    bridges=[]
    for gid in out.gid:
        own=cluster_ids[gid]; neighbors=set(graph.predecessors(gid))|set(graph.successors(gid))
        bridges.append(len({cluster_ids[n] for n in neighbors if cluster_ids[n]!=own}))
    out["bridge_count"]=bridges; out["bridge_pct"]=pct_depth(out.bridge_count,out.depth)
    for name in ("timing_consistent_turnover", "burst_pct", "synchronous_incoming_pct"):
        if name not in out:
            out[name] = 0.0
    out["continuation"]=((out.in_degree>0)&(out.out_degree>0)).astype(float)
    out["no_observed_outgoing"]=(out.out_degree==0).astype(float)
    out["consolidator_eligible"]=True; out["distributor_eligible"]=True; out["coordinator_eligible"]=True; out["peripheral_eligible"]=True
    out["transit_eligible"]=out.depth.between(1,3)
    out["terminal_eligible"]=out.depth.between(1,3)&(out.incoming_kzt>0)
    out["transit_ineligible_reason"]=[None if ok else "depth_outside_1_3" for ok in out.transit_eligible]
    out["terminal_ineligible_reason"]=[None if ok else ("observation_boundary" if depth==4 else "depth_outside_1_3" if depth==0 else "requires_observed_incoming") for ok,depth in zip(out.terminal_eligible,out.depth)]
    retention_for_consolidator=out.retention_obs.where(out.depth < 4, 0.0)
    out["consolidator_retention_used"]=retention_for_consolidator
    out["consolidator_score"]=.30*out.senders_pct+.25*out.inbound_volume_pct+.30*out.seed_convergence+.15*retention_for_consolidator
    out["transit_score"]=.25*(out.in_degree_pct+out.out_degree_pct)/2+.30*out.flow_balance+.25*out.timing_consistent_turnover+.20*out.continuation
    out["distributor_score"]=.50*out.receivers_pct+.25*out.outbound_volume_pct+.25*out.out_degree_pct
    out["terminal_score"]=.50*out.inbound_volume_pct+.30*out.retention_obs+.20*out.no_observed_outgoing
    out["coordinator_score"]=.30*out.pagerank_pct+.30*out.betweenness_pct+.20*out.bridge_pct+.20*out.seed_convergence
    eligible_scores=[]; roles=[]; selected=[]
    for row in out.itertuples(index=False):
        scores={r:getattr(row,f"{r}_score") for r in ROLE_ORDER}
        eligible={r: bool(getattr(row,f"{r}_eligible")) for r in ROLE_ORDER}
        best=max(((scores[r],-ROLE_ORDER.index(r),r) for r in ROLE_ORDER if eligible[r]), default=(0.0, 0, "peripheral"))
        max_eligible=best[0]
        peripheral=max(0.,min(1.,1.-max_eligible))
        eligible_scores.append(max_eligible); roles.append("peripheral" if max_eligible<FLOOR else best[2]); selected.append(peripheral if max_eligible<FLOOR else max_eligible)
    out["peripheral_score"]=[max(0.,min(1.,1.-score)) for score in eligible_scores]
    out["role"]=roles; out["role_score"]=pd.Series(selected,index=out.index).clip(0,1); out["max_eligible_non_peripheral_score"]=eligible_scores
    out["limitation_flags"]=[["observation_boundary", "retention_boundary_unreliable"] if d==4 else [] for d in out.depth]
    return out
