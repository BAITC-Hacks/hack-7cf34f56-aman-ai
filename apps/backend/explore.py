#!/usr/bin/env python3
"""Interactive developer explorer for the deterministic MoneyGraph pipeline."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
import networkx as nx
sys.path.insert(0, str(Path(__file__).parent))
from moneygraph.data_validation import load_and_validate
from moneygraph.graph_engine import build_graphs, graph_diagnostics
from moneygraph.features import build_features
from moneygraph.seed_convergence import compute_seed_convergence
from moneygraph.communities import compute_communities
from moneygraph.roles import apply_roles, ROLE_ORDER, FLOOR
from moneygraph.priority import apply_priority, WEIGHTS
from moneygraph.evidence import apply_evidence

ROOT=Path(__file__).resolve().parents[2]
def state():
 from moneygraph.pipeline import calculate
 return calculate(ROOT/'data')
def find(f,gid):
 row=f[f.gid==str(gid)]
 if row.empty: raise ValueError(f'Unknown gid: {gid}')
 return row.iloc[0]
def seeds_for(g,row,limit=20):
 seeds=sorted(n for n,a in g.nodes(data=True) if a['is_seed']); mask=int(row.seed_mask); out=[]
 for i,s in enumerate(seeds):
  if mask&(1<<i):
   path=nx.shortest_path(g,s,row.gid);out.append((s,len(path)-1,path))
 return out[:limit]
def breakdown(r):
 role=r.role; formulas={
 'consolidator':[('senders_pct',.30),('inbound_volume_pct',.25),('seed_convergence',.30),('retention_obs',.15)],
 'transit':[('in_degree/out_degree mean',.25),('flow_balance',.30),('timing_consistent_turnover',.25),('continuation',.20)],
 'distributor':[('receivers_pct',.50),('outbound_volume_pct',.25),('out_degree_pct',.25)],
 'terminal':[('inbound_volume_pct',.50),('retention_obs',.30),('no_observed_outgoing',.20)],
 'coordinator':[('pagerank_pct',.30),('betweenness_pct',.30),('bridge_pct',.20),('seed_convergence',.20)]}
 print('ROLE FORMULA')
 if role == 'peripheral':
  print(f'PERIPHERAL SELECTION — confidence floor: {FLOOR}')
  for candidate in ROLE_ORDER:
   if getattr(r,candidate+'_eligible'):
    print(f'  {candidate}: {getattr(r,candidate+"_score"):.6f}')
  print(f'Maximum eligible score: {r.max_eligible_non_peripheral_score:.6f}')
  print(f'All eligible scores are below {FLOOR}; 1 - eligible_max = {r.peripheral_score:.6f}')
 for n,w in formulas.get(role, []):
  v=(r.in_degree_pct+r.out_degree_pct)/2 if n.startswith('in_degree') else (r.consolidator_retention_used if n=='retention_obs' and role=='consolidator' else getattr(r,n))
  print(f'  {n:30} {v:.4f} × {w:.2f} = {v*w:.4f}')
 print(f'  TOTAL {r.role_score:.6f} ({role})')
 print('OTHER ROLE SCORES',', '.join(f'{x}={getattr(r,x+"_score"):.4f} (eligible={getattr(r,x+"_eligible")})' for x in (*ROLE_ORDER,'peripheral')))
 print('PRIORITY FORMULA')
 parts=[('role contribution',r.role_weight*r.role_score,.30),('seed convergence',r.seed_convergence,.25),('centrality',r.centrality,.15),('observed volume',r.observed_volume_pct,.15),('temporal',r.temporal,.10),('resilience',r.resilience_pct,.05)]
 for n,v,w in parts: print(f'  {n:30} {v:.4f} × {w:.2f} = {v*w:.4f}')
 print(f'  FINAL PRIORITY {r.priority_score:.6f}')
def node_card(b,g,f,ids,c,gid,explain=False):
 r=find(f,gid); print('='*54);print('NODE',r.gid);print('='*54);print(f'Depth: {r.depth}  Seed: {r.is_seed}  Cluster: {r.cluster_id}')
 if r.depth==4: print('OBSERVATION BOUNDARY: fourth-hop cutoff; absent outgoing data does not mean funds stopped.')
 print(f'ROLE: {r.role} ({r.role_score:.6f})');print('ALL ROLE SCORES:'); [print(f'  {x}: {getattr(r,x+"_score"):.4f}' if bool(getattr(r,x+"_eligible",True)) else f'  {x}: N/A (theoretical {getattr(r,x+"_score"):.4f}; {getattr(r,x+"_ineligible_reason","ineligible")})') for x in (*ROLE_ORDER,'peripheral')]
 print(f'FLOW: incoming={r.incoming_kzt:.0f} KZT, outgoing={r.outgoing_kzt:.0f} KZT, senders={r.unique_senders}, recipients={r.unique_recipients}, retention={r.retention_obs:.3f}, balance={r.flow_balance:.3f}')
 print(f'STRUCTURE: in={r.in_degree}, out={r.out_degree}, PageRank={r.pagerank:.6f} ({r.pagerank_pct:.3f}), betweenness={r.betweenness:.6f} ({r.betweenness_pct:.3f})')
 print(f'SEEDS: {r.seed_reach_count} distinct seeds, convergence={r.seed_convergence:.3f}')
 print(f'PRIORITY: {r.priority_score:.6f}');print('EVIDENCE:',r.evidence);print('LIMITATIONS:',', '.join(r.limitation_flags) or 'observed graph only')
 for label,edges in [('Incoming',g.in_edges(r.gid,data=True)),('Outgoing',g.out_edges(r.gid,data=True))]:
  print(label+':');[print(f'  {a if label=="Incoming" else z} | {d["sum_kzt"]:.0f} KZT') for a,z,d in sorted(edges)[:10]]
 if explain: breakdown(r)
def overview(b,g,u,f,ids,c):
 d=graph_diagnostics(g);print('DATASET',b.report.node_count,'nodes,',b.report.edge_count,'edges,',b.report.transaction_count,'transactions,',b.report.seed_count,'seeds');print('GRAPH',d.to_dict());print('COMMUNITIES',len(c),'largest',c.n_nodes.max());print('ROLES',f.role.value_counts().sort_index().to_dict());print('PRIORITY',f.priority_score.min(),f.priority_score.median(),f.priority_score.max());print('SEED CONVERGENCE',f.seed_reach_count.min(),f.seed_reach_count.median(),f.seed_reach_count.max())
def demo_nodes(f,g):
 picks={'highest_priority':f.sort_values(['priority_score','gid'],ascending=[False,True]).iloc[0],'strong_consolidator':f[f.role=='consolidator'].sort_values('role_score',ascending=False).iloc[0],'strong_distributor':f[f.role=='distributor'].sort_values('role_score',ascending=False).iloc[0],'strong_coordinator':f[f.role=='coordinator'].sort_values('role_score',ascending=False).iloc[0],'high_seed_convergence':f.sort_values(['seed_reach_count','gid'],ascending=[False,True]).iloc[0],'depth4_boundary':f[f.depth==4].sort_values('priority_score',ascending=False).iloc[0]}
 cyclic=next((c for c in nx.strongly_connected_components(g) if len(c)>1), None)
 if cyclic: picks['cyclic_scc_example']=find(f,sorted(cyclic)[0])
 return {k:{'gid':v.gid,'why':v.evidence} for k,v in picks.items()}
def pipeline(b,g,u,f,ids,c):
 print('STEP 0 INPUT',b.report.to_dict());print('STEP 1 VALIDATION: source schema, endpoints, aggregates, cross-level edges checked.');print('STEP 2 GRAPH: directed for flow; undirected weighted projection only for Louvain.');r=f.sort_values(['priority_score','gid'],ascending=[False,True]).iloc[0];print('STEP 3 FEATURES example');node_card(b,g,f,ids,c,r.gid);print('STEP 4 SEED CONVERGENCE');print(seeds_for(g,r));print('STEP 5 LOUVAIN',c[c.cluster_id==r.cluster_id].to_dict('records'));print('STEP 6–8 ROLE, PRIORITY, EVIDENCE');breakdown(r);print('STEP 9 OUTPUT',ROOT/'results')
def run(args):
 b,g,u,f,ids,c=state();(ROOT/'results'/'demo_nodes.json').write_text(json.dumps(demo_nodes(f,g),ensure_ascii=False,indent=2))
 if args.cmd=='overview':overview(b,g,u,f,ids,c)
 elif args.cmd=='top':
  for i,r in f.sort_values(['priority_score','gid'],ascending=[False,True]).head(args.limit).reset_index(drop=True).iterrows():print(i+1,r.gid,r.role,f'{r.role_score:.3f}',f'{r.priority_score:.3f}',r.seed_reach_count,r.cluster_id,r.evidence)
 elif args.cmd in ('node','explain'):node_card(b,g,f,ids,c,args.gid,args.cmd=='explain')
 elif args.cmd=='seeds':
  r=find(f,args.gid);print('seed_reach_count',r.seed_reach_count);[print(s,'length',l,'path',' → '.join(p)) for s,l,p in seeds_for(g,r,args.limit)]
 elif args.cmd=='paths':
  r=find(f,args.gid);[print('OBSERVED GRAPH PATH:', ' → '.join(p)) for _,_,p in seeds_for(g,r,args.limit)]
 elif args.cmd=='cluster':
  x=c[c.cluster_id==args.cluster]
  if x.empty: raise ValueError('Unknown cluster')
  print(x.to_dict('records'));m=f[f.cluster_id==args.cluster];print('roles',m.role.value_counts().to_dict());print('top',m.sort_values(['priority_score','gid'],ascending=[False,True]).head(5)[['gid','role','priority_score']].to_dict('records'))
 elif args.cmd=='roles': print(f.groupby('role').role_score.agg(['count','mean','median','max']).reindex(['consolidator','transit','distributor','terminal','coordinator','peripheral']).fillna(0))
 elif args.cmd=='pipeline':pipeline(b,g,u,f,ids,c)
def main():
 p=argparse.ArgumentParser(); sub=p.add_subparsers(dest="cmd")
 sub.add_parser("overview"); top=sub.add_parser("top"); top.add_argument("--limit",type=int,default=20)
 for n in ("node","explain"):
  q=sub.add_parser(n); q.add_argument("gid")
 for n in ("seeds","paths"):
  q=sub.add_parser(n); q.add_argument("gid"); q.add_argument("--limit",type=int,default=5)
 cluster=sub.add_parser("cluster"); cluster.add_argument("cluster",type=int)
 sub.add_parser("roles"); sub.add_parser("pipeline"); args=p.parse_args()
 if not args.cmd:
  print("MoneyGraph Investigator — Backend Explorer\n1 pipeline  2 overview  3 top  4 node  5 explain  6 seeds  7 paths  8 cluster  9 roles  0 exit")
  choice=input("Select: ").strip(); mapping={"1":"pipeline","2":"overview","3":"top","4":"node","5":"explain","6":"seeds","7":"paths","8":"cluster","9":"roles"}
  if choice=="0": return
  args.cmd=mapping.get(choice)
  if not args.cmd: print("Unknown selection"); return
  if args.cmd in ("node","explain","seeds","paths"): args.gid=input("GID: ").strip()
  if args.cmd in ("seeds","paths"): args.limit=5
  if args.cmd=="cluster": args.cluster=int(input("Cluster ID: ").strip())
  if args.cmd=="top": args.limit=20
 try: run(args)
 except ValueError as e: print(e); return 2
if __name__=="__main__": sys.exit(main())
