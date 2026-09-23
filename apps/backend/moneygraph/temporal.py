"""Calendar-date consistency, not tracing or matching physical funds."""
from collections import Counter, defaultdict
from datetime import timedelta

import pandas as pd

from .features import pct_depth


def add_temporal_features(features: pd.DataFrame, transactions: pd.DataFrame) -> pd.DataFrame:
    out = features.copy()
    incoming_days = defaultdict(set)
    daily_counts = Counter()
    daily_senders = defaultdict(set)
    outgoing = defaultdict(list)
    for tx in transactions.itertuples(index=False):
        src, dst = str(tx.src), str(tx.dst)
        day = pd.Timestamp(tx.date).date()
        incoming_days[dst].add(day)
        daily_counts[src, day] += 1
        daily_counts[dst, day] += 1
        daily_senders[dst, day].add(src)
        outgoing[src].append((day, float(tx.sum_kzt)))

    burst, sync = defaultdict(int), defaultdict(int)
    for (gid, _), count in daily_counts.items():
        burst[gid] = max(burst[gid], count)
    for (gid, _), senders in daily_senders.items():
        sync[gid] = max(sync[gid], len(senders))
    turnover, qualifying = {}, {}
    for gid in out.gid:
        payments = outgoing[gid]
        total = sum(amount for _, amount in payments)
        amount = sum(amount for day, amount in payments
                     if any(day - timedelta(days=offset) in incoming_days[gid]
                            for offset in range(3)))
        qualifying[gid] = amount
        turnover[gid] = min(1.0, amount / total) if total else 0.0
    out["timing_qualifying_outgoing_kzt"] = out.gid.map(qualifying)
    out["timing_consistent_turnover"] = out.gid.map(turnover)
    out["burst_raw"] = out.gid.map(burst).fillna(0).astype(int)
    out["synchronous_incoming_raw"] = out.gid.map(sync).fillna(0).astype(int)
    out["burst_pct"] = pct_depth(out.burst_raw, out.depth)
    out["synchronous_incoming_pct"] = pct_depth(out.synchronous_incoming_raw, out.depth)
    return out
