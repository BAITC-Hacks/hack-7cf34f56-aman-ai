from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).parent/"apps/backend"))
from moneygraph.data_validation import load_and_validate
from moneygraph.graph_engine import build_graphs
from moneygraph.features import build_features
from moneygraph.seed_convergence import compute_seed_convergence
from moneygraph.communities import compute_communities
from moneygraph.roles import apply_roles
from moneygraph.priority import apply_priority
from moneygraph.evidence import apply_evidence
from moneygraph.outputs import write_outputs

def main():
 root=Path(__file__).parent; bundle=load_and_validate(root/"data"); directed,undirected=build_graphs(bundle.nodes,bundle.edges)
 features=compute_seed_convergence(directed,build_features(directed)); ids,clusters=compute_communities(directed,undirected)
 features=apply_evidence(apply_priority(apply_roles(features,directed,ids),directed))
 nodes,cluster_out,top=write_outputs(features,clusters,root/"results")
 print(f"MoneyGraph complete: {len(nodes)} nodes, {len(cluster_out)} clusters, {len(top)} top nodes.")
if __name__=="__main__": main()
