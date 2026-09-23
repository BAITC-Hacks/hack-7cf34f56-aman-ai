from __future__ import annotations
import pandas as pd

def make_evidence(row)->str:
 r=row.role
 if r=="consolidator": text=f"Признаки консолидации: {row.unique_senders} наблюдаемых отправителей, достижим из {row.seed_reach_count} известных seed-узлов, входящий объём {row.incoming_kzt:.0f} KZT."
 elif r=="transit": text=f"Признаки транзита: наблюдаются входящие и исходящие потоки; коэффициент баланса {row.flow_balance:.2f}."
 elif r=="distributor": text=f"Признаки распределения: {row.unique_recipients} наблюдаемых получателей, исходящий объём {row.outgoing_kzt:.0f} KZT."
 elif r=="terminal":
  outgoing=("нет наблюдаемых исходящих переводов" if row.out_degree==0 else f"наблюдаемый исходящий объём {row.outgoing_kzt:.0f} KZT")
  text=f"Признаки конечного получателя: наблюдаемый входящий объём {row.incoming_kzt:.0f} KZT; {outgoing}."
 elif r=="coordinator": text=f"Структурно значимый узел: процентили PageRank {row.pagerank_pct:.2f}, betweenness {row.betweenness_pct:.2f} в своей depth-группе; достижим из {row.seed_reach_count} seed-узлов."
 else: text="Выраженные признаки функциональной роли по наблюдаемым данным не выявлены."
 if "observation_boundary" in row.limitation_flags: text+=" Граница наблюдения depth=4 ограничивает выводы."
 return text[:200]
def apply_evidence(features:pd.DataFrame)->pd.DataFrame:
 out=features.copy();out["evidence"]=[make_evidence(r) for r in out.itertuples(index=False)];return out
def cluster_hypothesis(row, role_mix):
 role=role_mix.get(int(row.cluster_id),"peripheral")
 return f"Наблюдаемое сообщество: {int(row.n_nodes)} узлов, {int(row.n_seed)} seed; преобладающий сигнал — {role}."
