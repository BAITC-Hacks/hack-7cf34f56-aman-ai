from __future__ import annotations
from pathlib import Path
import pandas as pd
ROLES={"consolidator","transit","distributor","terminal","coordinator","peripheral"}
NODE_COLUMNS=["gid","role","role_score","cluster_id","priority_score","evidence"]
CLUSTER_COLUMNS=["cluster_id","n_nodes","n_seed","sum_kzt_internal","top_gids","hypothesis"]
TOP_COLUMNS=["rank","gid","role","priority_score","why"]
def validate_outputs(nodes,clusters,top):
 if list(nodes.columns)!=NODE_COLUMNS or list(clusters.columns)!=CLUSTER_COLUMNS or list(top.columns)!=TOP_COLUMNS: raise ValueError("CSV columns differ from contract")
 if len(nodes)!=2248 or nodes.gid.duplicated().any() or not set(nodes.role)<=ROLES: raise ValueError("invalid node output")
 if not nodes.role_score.between(0,1).all() or not nodes.priority_score.between(0,1).all() or nodes.cluster_id.isna().any(): raise ValueError("invalid node scores or clusters")
 for evidence in (nodes.evidence, top.why):
  if not evidence.map(lambda value: isinstance(value,str) and bool(value.strip()) and len(value)<=200).all(): raise ValueError("invalid evidence")
 if not nodes.gid.map(lambda gid: isinstance(gid,str) and gid.isascii() and gid.isdecimal()).all():
  raise ValueError("gids must be exact decimal strings")
 if not set(nodes.cluster_id).issubset(set(clusters.cluster_id)):
  raise ValueError("unknown cluster reference")
 ranked=nodes.sort_values(["priority_score","gid"],ascending=[False,True],kind="stable").head(20).reset_index(drop=True)
 expected=ranked[["gid","role","priority_score","evidence"]].rename(columns={"evidence":"why"})
 expected.insert(0,"rank",range(1,len(expected)+1))
 if len(top)!=20 or top["rank"].tolist()!=list(range(1,21)) or not top.reset_index(drop=True).equals(expected): raise ValueError("invalid top ordering")
def write_outputs(features,clusters,output_dir):
 output_dir=Path(output_dir);output_dir.mkdir(parents=True,exist_ok=True)
 if ((features.depth==4)&(features.role=="terminal")).any(): raise ValueError("depth 4 terminal")
 nodes=features.sort_values("gid",kind="stable")[["gid","role","role_score","cluster_id","priority_score","evidence"]].copy()
 for c in ("role_score","priority_score"): nodes[c]=nodes[c].round(6)
 role_mix=features.groupby("cluster_id").role.agg(lambda s:s.value_counts().sort_index().idxmax()).to_dict()
 rows=[]
 for c in clusters.itertuples(index=False):
  members=nodes[nodes.cluster_id==c.cluster_id].sort_values(["priority_score","gid"],ascending=[False,True],kind="stable")
  rows.append([c.cluster_id,c.n_nodes,c.n_seed,c.internal_observed_kzt,"|".join(members.gid.head(3)),f"Наблюдаемое сообщество: {c.n_nodes} узлов, {c.n_seed} seed; преобладающий сигнал — {role_mix[c.cluster_id]}. "])
 cluster_out=pd.DataFrame(rows,columns=CLUSTER_COLUMNS); cluster_out["sum_kzt_internal"]=cluster_out.sum_kzt_internal.round(6)
 ranked=nodes.sort_values(["priority_score","gid"],ascending=[False,True],kind="stable").head(20).copy()
 top=pd.DataFrame({"rank":range(1,21),"gid":ranked.gid,"role":ranked.role,"priority_score":ranked.priority_score.round(6),"why":ranked.evidence})
 validate_outputs(nodes,cluster_out,top)
 nodes.to_csv(output_dir/"nodes_roles.csv",index=False,encoding="utf-8",float_format="%.6f")
 cluster_out.to_csv(output_dir/"clusters.csv",index=False,encoding="utf-8",float_format="%.6f")
 top.to_csv(output_dir/"top_nodes.csv",index=False,encoding="utf-8",float_format="%.6f")
 return nodes,cluster_out,top
