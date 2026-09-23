"""Deterministic analytical diagnostics; runtime is reported separately."""
import hashlib
import json


def summary(series):
    return {name: float(getattr(series, name)()) for name in ("min", "median", "max")}


def diagnostics(features, cluster_ids):
    f = features.copy()
    f["observed_ratio"] = f.outgoing_kzt.div(f.incoming_kzt.where(f.incoming_kzt > 0))
    columns = ["gid", "depth", "incoming_kzt", "outgoing_kzt", "observed_ratio",
               "timing_consistent_turnover", "transit_score", "role", "role_score"]
    candidates = f[f.observed_ratio.between(.8, 1.2)].sort_values("gid")
    return {
        "role_distribution": f.role.value_counts().sort_index().to_dict(),
        "priority_distribution": summary(f.priority_score),
        "temporal_distributions": {name: summary(f[name]) for name in
                                  ("timing_consistent_turnover", "burst_pct",
                                   "synchronous_incoming_pct", "temporal")},
        "pass_through_count": len(candidates),
        "pass_through_candidates": candidates[columns].to_dict("records"),
        "top_transit_scores": f.sort_values(["transit_score", "gid"], ascending=[False, True])
            .head(20)[columns].to_dict("records"),
        "depth_role_counts": f.groupby(["depth", "role"]).size().rename("count").reset_index().to_dict("records"),
        "cluster_role_counts": f.groupby(["cluster_id", "role"]).size().rename("count").reset_index().to_dict("records"),
        "community_count": len(set(cluster_ids.values())),
        "multi_seed_count": int((f.groupby("cluster_id").is_seed.sum() > 1).sum()),
        "cluster_assignment_sha256": hashlib.sha256(
            json.dumps(cluster_ids, sort_keys=True, separators=(",", ":")).encode()).hexdigest(),
        "calibration_warning": None if f.role.eq("transit").any() else "No selected Transit; weights unchanged.",
    }
