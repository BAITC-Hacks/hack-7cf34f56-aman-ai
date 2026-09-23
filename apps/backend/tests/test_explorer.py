import sys
from pathlib import Path
import pandas as pd
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from explore import state,find,seeds_for,node_card
ROOT=Path(__file__).resolve().parents[3]
def test_explorer_matches_production_and_handles_unknown(capsys):
 b,g,u,f,ids,c=state(); top=f.sort_values(['priority_score','gid'],ascending=[False,True]).iloc[0]; out=pd.read_csv(ROOT/'results/nodes_roles.csv',dtype={'gid':str}).set_index('gid').loc[top.gid]
 assert top.role==out.role and round(top.role_score,6)==round(out.role_score,6) and round(top.priority_score,6)==round(out.priority_score,6) and top.cluster_id==out.cluster_id
 assert len(seeds_for(g,top,100))==top.seed_reach_count
 with pytest.raises(ValueError): find(f,'999')
 boundary=f[f.depth==4].iloc[0];node_card(b,g,f,ids,c,boundary.gid);assert 'OBSERVATION BOUNDARY' in capsys.readouterr().out


def test_explain_each_selected_role(capsys):
 b,g,u,f,ids,c=state()
 for role in sorted(f.role.unique()):
  gid=f.loc[f.role.eq(role)].sort_values('gid').iloc[0].gid
  node_card(b,g,f,ids,c,gid,explain=True)
  output=capsys.readouterr().out
  assert 'FINAL PRIORITY' in output
  if role=='peripheral':
   assert 'PERIPHERAL SELECTION' in output
   assert 'Maximum eligible score' in output
