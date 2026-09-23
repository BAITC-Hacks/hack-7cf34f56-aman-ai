from pathlib import Path
import pandas as pd
import networkx as nx
from moneygraph.roles import apply_roles
from moneygraph.priority import apply_priority
from moneygraph.evidence import apply_evidence
from moneygraph.outputs import NODE_COLUMNS,CLUSTER_COLUMNS,TOP_COLUMNS
ROOT=Path(__file__).resolve().parents[3]
def row(gid,depth=1,**v):
 base=dict(gid=gid,depth=depth,is_seed=False,in_degree=0,out_degree=0,unique_senders=0,unique_recipients=0,incoming_kzt=0.,outgoing_kzt=0.,senders_pct=0.,inbound_volume_pct=0.,seed_convergence=0.,retention_obs=0.,in_degree_pct=0.,out_degree_pct=0.,flow_balance=0.,receivers_pct=0.,outbound_volume_pct=0.,pagerank_pct=0.,betweenness_pct=0.,observed_volume_pct=0.,pagerank=0.,betweenness=0.)
 base.update(v);return base
def test_role_scores_boundary_and_tie():
 g=nx.DiGraph(); [g.add_node(str(i),is_seed=False,depth=1) for i in range(8)]
 g.add_edge('0','1');g.add_edge('1','2');g.add_edge('2','0')
 f=pd.DataFrame([row('0',senders_pct=1,inbound_volume_pct=1,seed_convergence=1,retention_obs=1),row('1',in_degree_pct=1,out_degree_pct=1,flow_balance=1,in_degree=1,out_degree=1),row('2',receivers_pct=1,outbound_volume_pct=1,out_degree_pct=1),row('3',inbound_volume_pct=1,retention_obs=1,incoming_kzt=1),row('4',pagerank_pct=1,betweenness_pct=1,seed_convergence=1),row('5'),row('6',depth=4,inbound_volume_pct=1,retention_obs=1,incoming_kzt=1),row('7',senders_pct=1,inbound_volume_pct=1,seed_convergence=2/3,receivers_pct=1,outbound_volume_pct=1,out_degree_pct=0)])
 out=apply_roles(f,g,{str(i):i+1 for i in range(8)}).set_index('gid')
 assert out.loc['0','role']=='consolidator' and out.loc['1','role']=='transit' and out.loc['2','role']=='distributor'
 assert out.loc['3','role']=='terminal' and out.loc['4','role']=='coordinator' and out.loc['7','role']=='consolidator'
 assert out.loc['0','consolidator_score']==1 and out.loc['1','transit_score']==.75 and out.loc['2','distributor_score']==1
 assert out.loc['3','terminal_score']==1 and out.loc['5','role']=='peripheral'
 assert out.loc['6','terminal_eligible']==False and out.loc['6','role']!='terminal'
 assert out.filter(regex='_score$').to_numpy().min()>=0 and out.filter(regex='_score$').to_numpy().max()<=1
def test_priority_resilience_and_evidence():
 g=nx.DiGraph();g.add_node('S',is_seed=True);g.add_node('A',is_seed=False);g.add_node('B',is_seed=False);g.add_edges_from([('S','A'),('A','B')])
 f=pd.DataFrame([row('S',role='peripheral',role_score=.8,max_eligible_non_peripheral_score=.2,seed_convergence=0,observed_volume_pct=0,pagerank_pct=0,betweenness_pct=0),row('A',role='coordinator',role_score=1,max_eligible_non_peripheral_score=1,seed_convergence=1,observed_volume_pct=1,pagerank_pct=1,betweenness_pct=1),row('B',role='peripheral',role_score=.8,max_eligible_non_peripheral_score=.2,seed_convergence=.1,observed_volume_pct=.1,pagerank_pct=.1,betweenness_pct=.1)])
 out=apply_priority(f,g);assert (out.priority_score.between(0,1)).all();assert (out.resilience_pct>=0).all();assert out.sort_values(['preliminary_priority','gid'],ascending=[False,True]).iloc[0].gid=='A'
 out['limitation_flags']=[[],[],['observation_boundary']];out['unique_senders']=[0,2,0];out['seed_reach_count']=[1,1,1];out['incoming_kzt']=[0,10,1];out['outgoing_kzt']=[1,1,0];out['unique_recipients']=[1,1,0];out['flow_balance']=[0,1,0]
 evidence=apply_evidence(out);assert evidence.evidence.str.len().between(1,200).all();assert not evidence.evidence.str.contains('criminal|guilty',case=False).any()
def test_real_mandatory_csv_contracts():
 n=pd.read_csv(ROOT/'results/nodes_roles.csv',dtype={'gid':str});c=pd.read_csv(ROOT/'results/clusters.csv',dtype={'top_gids':str});t=pd.read_csv(ROOT/'results/top_nodes.csv',dtype={'gid':str})
 assert n.columns.tolist()==NODE_COLUMNS and c.columns.tolist()==CLUSTER_COLUMNS and t.columns.tolist()==TOP_COLUMNS
 assert len(n)==2248 and n.gid.nunique()==2248 and len(t)==20 and t['rank'].tolist()==list(range(1,21))
 raw=pd.read_parquet(ROOT/'data/nodes.parquet'); raw.gid=raw.gid.astype(str); merged=raw.merge(n[['gid','role']],on='gid'); assert not ((merged.depth==4)&(merged.role=='terminal')).any()
def test_depth4_retention_is_excluded_and_eligibility_is_explicit():
 g=nx.DiGraph();g.add_node('4',is_seed=False,depth=4);g.add_node('1',is_seed=False,depth=1)
 cols=[row('4',depth=4,senders_pct=1,inbound_volume_pct=1,seed_convergence=1,retention_obs=1,incoming_kzt=10),row('1',depth=1,senders_pct=1,inbound_volume_pct=1,seed_convergence=1,retention_obs=1,incoming_kzt=10)]
 out=apply_roles(pd.DataFrame(cols),g,{'4':1,'1':2}).set_index('gid')
 assert round(out.loc['4','consolidator_score'],6)==.85 and round(out.loc['1','consolidator_score'],6)==1
 assert not out.loc['4','terminal_eligible'] and out.loc['4','terminal_ineligible_reason']=='observation_boundary'
 assert 'retention_boundary_unreliable' in out.loc['4','limitation_flags']
def test_evidence_uses_seed_reachability_wording():
 from moneygraph.evidence import apply_evidence
 f=pd.DataFrame([dict(row('x',role='consolidator',role_score=.8,seed_reach_count=2,unique_senders=1,incoming_kzt=1),limitation_flags=[])])
 assert 'seed-веток' not in apply_evidence(f).evidence.iloc[0]
