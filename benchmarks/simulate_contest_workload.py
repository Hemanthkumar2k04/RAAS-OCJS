#!/usr/bin/env python3
"""
Multi-Tenant Discrete-Event Contest Workload Simulator for RAAS-OCJS.
Simulates N = 10,000 competitive programming submissions under bursty arrival
traffic comparing Baseline, Predictive, Reactive, and Hybrid scheduling.
Outputs detailed metrics on memory allocated, used, wasted %, and queue delays.
"""

import json
import random
import os
import csv
import math
import statistics
import heapq

# Random seed for reproducibility
random.seed(42)

def mean(arr):
    return statistics.mean(arr) if arr else 0.0

def percentile(arr, p):
    if not arr: return 0.0
    arr_sorted = sorted(arr)
    k = (len(arr_sorted) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return arr_sorted[int(k)]
    return arr_sorted[f] * (c - k) + arr_sorted[c] * (k - f)

# Server Capacity & Configuration
TOTAL_SUBMISSIONS = 10000
CONTEST_DURATION_SEC = 7200  # 2 hours
MAX_CONCURRENT_SLOTS = 16    # Matches server/src/queue.rs Semaphore
HOST_RAM_MB = 16384          # 16 GB Physical Host Memory
HOST_CPUS = 8                # 8 CPU Cores

# Baseline reservation model:
# In standard judge deployments (DOMjudge/DMOJ), either an unconstrained host ceiling
# or a standard static reservation (e.g. 2048 MiB) is allocated per container.
BASELINE_STATIC_ALLOC_MB = 2048.0   # Standard competitive judge slot allocation
LIGHT_TIER_ALLOC_MB = 256.0         # RAAS-OCJS Light Tier (256 MiB)
PROMOTED_TIER_ALLOC_MB = 2048.0     # Promoted to Uncapped / High Headroom slot

# Problem distribution (60% Light, 25% CPU-heavy, 15% Memory-heavy)
PROBLEM_DISTRIBUTION = [
    ("P1_prefix_sums", 0.35, "Prefix Sums (Light)"),
    ("P5_top_k_streaming", 0.25, "Top-K Streaming (Light STL)"),
    ("P3_floyd_warshall", 0.15, "Floyd-Warshall (CPU O(V^3))"),
    ("P4_game_tree_search", 0.10, "Game Tree Search (Branching O(2^N))"),
    ("P2_knapsack_2d_dp", 0.15, "0-1 Knapsack 2D DP (Memory-Heavy)")
]

# Language distribution (Realistic contest mix)
LANGUAGE_DISTRIBUTION = [
    ("cpp", 0.50),
    ("python", 0.30),
    ("java", 0.15),
    ("c", 0.05)
]

# Default empirical profiles (populated from actual measurements)
DEFAULT_EMPIRICAL = {
    ("P1_prefix_sums", "python"): {"used_mb": 8.2, "cpu_ms": 48, "wall_ms": 320, "p_heavy": False},
    ("P1_prefix_sums", "cpp"):    {"used_mb": 6.8, "cpu_ms": 25, "wall_ms": 260, "p_heavy": False},
    ("P1_prefix_sums", "java"):   {"used_mb": 38.5, "cpu_ms": 82, "wall_ms": 410, "p_heavy": False},
    ("P1_prefix_sums", "c"):      {"used_mb": 6.1, "cpu_ms": 22, "wall_ms": 250, "p_heavy": False},

    ("P2_knapsack_2d_dp", "python"): {"used_mb": 216.2, "cpu_ms": 220, "wall_ms": 780, "p_heavy": True, "promoted": True, "prom_ms": 538},
    ("P2_knapsack_2d_dp", "cpp"):    {"used_mb": 212.6, "cpu_ms": 160, "wall_ms": 680, "p_heavy": True, "promoted": True, "prom_ms": 490},
    ("P2_knapsack_2d_dp", "java"):   {"used_mb": 234.0, "cpu_ms": 310, "wall_ms": 850, "p_heavy": True, "promoted": True, "prom_ms": 580},
    ("P2_knapsack_2d_dp", "c"):      {"used_mb": 212.5, "cpu_ms": 158, "wall_ms": 670, "p_heavy": True, "promoted": True, "prom_ms": 485},

    ("P3_floyd_warshall", "python"): {"used_mb": 10.3, "cpu_ms": 344, "wall_ms": 590, "p_heavy": False},
    ("P3_floyd_warshall", "cpp"):    {"used_mb": 6.9, "cpu_ms": 48, "wall_ms": 290, "p_heavy": False},
    ("P3_floyd_warshall", "java"):   {"used_mb": 22.8, "cpu_ms": 170, "wall_ms": 490, "p_heavy": False},
    ("P3_floyd_warshall", "c"):      {"used_mb": 6.2, "cpu_ms": 42, "wall_ms": 280, "p_heavy": False},

    ("P4_game_tree_search", "python"): {"used_mb": 9.1, "cpu_ms": 180, "wall_ms": 420, "p_heavy": False},
    ("P4_game_tree_search", "cpp"):    {"used_mb": 6.5, "cpu_ms": 35, "wall_ms": 270, "p_heavy": False},
    ("P4_game_tree_search", "java"):   {"used_mb": 21.5, "cpu_ms": 110, "wall_ms": 430, "p_heavy": False},
    ("P4_game_tree_search", "c"):      {"used_mb": 5.9, "cpu_ms": 32, "wall_ms": 260, "p_heavy": False},

    ("P5_top_k_streaming", "python"): {"used_mb": 10.9, "cpu_ms": 140, "wall_ms": 410, "p_heavy": False},
    ("P5_top_k_streaming", "cpp"):    {"used_mb": 6.6, "cpu_ms": 55, "wall_ms": 290, "p_heavy": False},
    ("P5_top_k_streaming", "java"):   {"used_mb": 71.3, "cpu_ms": 340, "wall_ms": 610, "p_heavy": False},
    ("P5_top_k_streaming", "c"):      {"used_mb": 34.8, "cpu_ms": 65, "wall_ms": 300, "p_heavy": False},
}

def load_empirical_profiles():
    metrics_file = "benchmarks/empirical_benchmark_metrics.json"
    profiles = dict(DEFAULT_EMPIRICAL)
    if os.path.exists(metrics_file):
        try:
            with open(metrics_file) as f:
                data = json.load(f)
            for row in data:
                key = (row["problem_id"], row["language"])
                if key in profiles:
                    profiles[key]["used_mb"] = row["peak_memory_mb"]
                    profiles[key]["cpu_ms"] = row["cpu_time_ms"]
                    profiles[key]["wall_ms"] = row["wall_time_ms"]
            print(f"[SIM] Loaded {len(data)} empirical measurements from {metrics_file}")
        except Exception as e:
            print(f"[SIM] Warning loading {metrics_file}: {e}. Using calibrated defaults.")
    return profiles

def generate_arrival_times(n, duration):
    """
    Generates non-homogeneous Poisson arrival timestamps simulating a 2-hour contest:
    - 0-15 min: Opening rush (warmup submissions)
    - 15-105 min: Steady exploration
    - 105-120 min: Scoreboard freeze rush
    """
    t = 0.0
    arrivals = []
    # Target weights across phases
    # Phase 1: 20% of submissions in 12.5% of time
    # Phase 2: 50% of submissions in 75% of time
    # Phase 3: 30% of submissions in 12.5% of time
    for _ in range(n):
        u = random.random()
        if u < 0.20:
            # Phase 1
            arr = random.uniform(0, 900)
        elif u < 0.70:
            # Phase 2
            arr = random.uniform(900, 6300)
        else:
            # Phase 3
            arr = random.uniform(6300, 7200)
        arrivals.append(arr)
    arrivals.sort()
    return arrivals

def simulate_strategy(strategy, submissions, profiles):
    """
    Simulates queue dispatching and resource allocation for a given strategy.
    Tracks instantaneous slot allocations, wait times, and memory wastage.
    """
    # Event priority queue: (timestamp, event_type, data)
    # event_type: 0 for release of slot, 1 for arrival
    events = []
    for s in submissions:
        events.append((s["arrival_time"], "arrival", s))
    heapq.heapify(events)

    available_slots = MAX_CONCURRENT_SLOTS
    waiting_queue = []

    active_jobs = [] # list of (finish_time, allocated_mb, used_mb)
    completed_records = []

    current_time = 0.0
    total_allocated_mb_integral = 0.0
    total_used_mb_integral = 0.0
    last_time = 0.0

    current_alloc_mb = 0.0
    current_used_mb = 0.0

    while events:
        evt_time, evt_type, data = heapq.heappop(events)
        dt = evt_time - last_time
        if dt > 0:
            total_allocated_mb_integral += current_alloc_mb * dt
            total_used_mb_integral += current_used_mb * dt
            last_time = evt_time
        current_time = evt_time

        if evt_type == "departure":
            available_slots += 1
            current_alloc_mb -= data["allocated_mb"]
            current_used_mb -= data["used_mb"]

            # If jobs waiting in queue, dispatch the next job immediately
            if waiting_queue:
                next_sub = waiting_queue.pop(0)
                wait_time_ms = (current_time - next_sub["arrival_time"]) * 1000.0
                dispatch_job(next_sub, current_time, wait_time_ms, strategy, profiles,
                             events, completed_records)
                available_slots -= 1
                # current_alloc_mb and current_used_mb updated inside dispatch_job

        elif evt_type == "arrival":
            if available_slots > 0:
                available_slots -= 1
                wait_time_ms = 0.0
                dispatch_job(data, current_time, wait_time_ms, strategy, profiles,
                             events, completed_records)
            else:
                waiting_queue.append(data)

    return completed_records, total_allocated_mb_integral, total_used_mb_integral

def dispatch_job(sub, start_time, wait_time_ms, strategy, profiles, events, completed_records):
    pid = sub["problem_id"]
    lang = sub["language"]
    prof = profiles.get((pid, lang), DEFAULT_EMPIRICAL.get((pid, lang)))

    base_used = prof["used_mb"]
    # Introduce small statistical jitter (±3%)
    jitter = random.uniform(0.97, 1.03)
    actual_used_mb = base_used * jitter

    base_wall_ms = prof["wall_ms"] * jitter
    cpu_ms = prof["cpu_ms"] * jitter

    tier_started = "low"
    tier_promoted = False
    prom_time_ms = 0.0

    if strategy == "baseline":
        allocated_mb = BASELINE_STATIC_ALLOC_MB
        tier_started = "high"
        tier_promoted = False
        execution_wall_ms = base_wall_ms
    elif strategy == "predictive":
        # XGBoost ML decision
        is_heavy = prof.get("p_heavy", False)
        # 1% classification noise model
        if random.random() < 0.01:
            is_heavy = not is_heavy
        if is_heavy:
            allocated_mb = PROMOTED_TIER_ALLOC_MB
            tier_started = "high"
        else:
            allocated_mb = LIGHT_TIER_ALLOC_MB
            tier_started = "low"
        execution_wall_ms = base_wall_ms
    elif strategy == "reactive":
        # Always start Light (256 MB) with 70% watermark (179.2 MB)
        tier_started = "low"
        WATERMARK_70_MB = 179.2
        if actual_used_mb >= WATERMARK_70_MB:
            tier_promoted = True
            prom_time_ms = prof.get("prom_ms", 500)
            allocated_mb = PROMOTED_TIER_ALLOC_MB
            # 15ms live promotion overhead
            execution_wall_ms = base_wall_ms + 15.0
        else:
            allocated_mb = LIGHT_TIER_ALLOC_MB
            tier_promoted = False
            execution_wall_ms = base_wall_ms
    elif strategy == "hybrid":
        # ML initial tier + reactive safety net
        is_heavy = prof.get("p_heavy", False)
        if is_heavy:
            allocated_mb = PROMOTED_TIER_ALLOC_MB
            tier_started = "high"
            execution_wall_ms = base_wall_ms
        else:
            # Starts in Light with armed 70% watermark
            tier_started = "low"
            WATERMARK_70_MB = 179.2
            if actual_used_mb >= WATERMARK_70_MB:
                tier_promoted = True
                prom_time_ms = prof.get("prom_ms", 500)
                allocated_mb = PROMOTED_TIER_ALLOC_MB
                execution_wall_ms = base_wall_ms + 15.0
            else:
                allocated_mb = LIGHT_TIER_ALLOC_MB
                tier_promoted = False
                execution_wall_ms = base_wall_ms

    finish_time = start_time + (execution_wall_ms / 1000.0)

    wasted_mb = max(0.0, allocated_mb - actual_used_mb)
    wasted_pct = (wasted_mb / allocated_mb) * 100.0

    record = {
        "submission_id": sub["sub_id"],
        "strategy": strategy,
        "problem_id": pid,
        "language": lang,
        "arrival_time_s": round(sub["arrival_time"], 2),
        "wait_time_ms": round(wait_time_ms, 2),
        "execution_ms": round(execution_wall_ms, 2),
        "turnaround_ms": round(wait_time_ms + execution_wall_ms, 2),
        "allocated_mb": round(allocated_mb, 2),
        "used_mb": round(actual_used_mb, 2),
        "wasted_mb": round(wasted_mb, 2),
        "wasted_pct": round(wasted_pct, 2),
        "tier_started": tier_started,
        "tier_promoted": tier_promoted,
        "promotion_time_ms": round(prom_time_ms, 1)
    }
    completed_records.append(record)

    # Schedule departure event
    dep_data = {
        "allocated_mb": allocated_mb,
        "used_mb": actual_used_mb
    }
    heapq.heappush(events, (finish_time, "departure", dep_data))

def main():
    print(f"=== RAAS-OCJS LARGE-SCALE WORKLOAD SIMULATION (N={TOTAL_SUBMISSIONS}) ===")
    profiles = load_empirical_profiles()

    # Generate synthetic submissions
    arrival_times = generate_arrival_times(TOTAL_SUBMISSIONS, CONTEST_DURATION_SEC)
    prob_choices = [p[0] for p in PROBLEM_DISTRIBUTION]
    prob_weights = [p[1] for p in PROBLEM_DISTRIBUTION]

    lang_choices = [l[0] for l in LANGUAGE_DISTRIBUTION]
    lang_weights = [l[1] for l in LANGUAGE_DISTRIBUTION]

    submissions = []
    for i in range(TOTAL_SUBMISSIONS):
        p_id = random.choices(prob_choices, weights=prob_weights)[0]
        l_id = random.choices(lang_choices, weights=lang_weights)[0]
        submissions.append({
            "sub_id": f"sub_{i+1:05d}",
            "arrival_time": arrival_times[i],
            "problem_id": p_id,
            "language": l_id
        })

    strategies = ["baseline", "predictive", "reactive", "hybrid"]
    summary_results = []
    all_completed = {}

    for strat in strategies:
        print(f"Simulating strategy: {strat.upper():12s} ... ", end="", flush=True)
        completed, alloc_integral, used_integral = simulate_strategy(strat, submissions, profiles)
        all_completed[strat] = completed

        wait_times = [r["wait_time_ms"] for r in completed]
        turnarounds = [r["turnaround_ms"] for r in completed]
        allocated = [r["allocated_mb"] for r in completed]
        used = [r["used_mb"] for r in completed]
        wasted = [r["wasted_mb"] for r in completed]
        promoted_count = sum(1 for r in completed if r["tier_promoted"])

        total_alloc_gb = sum(allocated) / 1024.0
        total_used_gb = sum(used) / 1024.0
        total_wasted_gb = sum(wasted) / 1024.0
        overall_wasted_pct = (total_wasted_gb / total_alloc_gb) * 100.0

        summary = {
            "Strategy": strat.capitalize(),
            "Total_Submissions": TOTAL_SUBMISSIONS,
            "Total_Allocated_GB": round(total_alloc_gb, 2),
            "Total_Used_GB": round(total_used_gb, 2),
            "Total_Wasted_GB": round(total_wasted_gb, 2),
            "Wasted_Percentage": round(overall_wasted_pct, 2),
            "Memory_Saved_vs_Baseline_GB": round((sum(all_completed["baseline"][i]["allocated_mb"] for i in range(TOTAL_SUBMISSIONS)) - sum(allocated)) / 1024.0, 2) if strat != "baseline" else 0.0,
            "Memory_Savings_Pct": round(((sum(all_completed["baseline"][i]["allocated_mb"] for i in range(TOTAL_SUBMISSIONS)) - sum(allocated)) / sum(all_completed["baseline"][i]["allocated_mb"] for i in range(TOTAL_SUBMISSIONS))) * 100.0, 2) if strat != "baseline" else 0.0,
            "Avg_Queue_Wait_ms": round(float(mean(wait_times)), 2),
            "P95_Queue_Wait_ms": round(float(percentile(wait_times, 95)), 2),
            "P99_Queue_Wait_ms": round(float(percentile(wait_times, 99)), 2),
            "Avg_Turnaround_ms": round(float(mean(turnarounds)), 2),
            "Live_Promotions": promoted_count,
            "Promotion_Rate_Pct": round((promoted_count / TOTAL_SUBMISSIONS) * 100.0, 2),
            "Throughput_Subs_Per_Min": round((TOTAL_SUBMISSIONS / (CONTEST_DURATION_SEC / 60.0)), 2)
        }
        summary_results.append(summary)
        print(f"DONE | Allocated: {total_alloc_gb:8.1f} GB | Wasted: {overall_wasted_pct:5.1f}% | Avg Wait: {summary['Avg_Queue_Wait_ms']:6.2f} ms | Promotions: {promoted_count}")

    # Write summary CSV
    os.makedirs("benchmarks", exist_ok=True)
    summary_csv = "benchmarks/strategy_comparison_summary.csv"
    with open(summary_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(summary_results[0].keys()))
        writer.writeheader()
        writer.writerows(summary_results)
    print(f"\n[OUTPUT] Strategy comparison summary saved to: {summary_csv}")

    # Write per-problem breakdown for Reactive and Hybrid
    prob_summary = []
    for prob_id, weight, desc in PROBLEM_DISTRIBUTION:
        for strat in strategies:
            records = [r for r in all_completed[strat] if r["problem_id"] == prob_id]
            if not records:
                continue
            alloc = sum(r["allocated_mb"] for r in records)
            used = sum(r["used_mb"] for r in records)
            wasted = sum(r["wasted_mb"] for r in records)
            prom = sum(1 for r in records if r["tier_promoted"])
            prob_summary.append({
                "Problem": prob_id,
                "Description": desc,
                "Strategy": strat.capitalize(),
                "Submissions": len(records),
                "Avg_Allocated_MB": round(float(mean([r["allocated_mb"] for r in records])), 1),
                "Avg_Used_MB": round(float(mean([r["used_mb"] for r in records])), 1),
                "Avg_Wasted_MB": round(float(mean([r["wasted_mb"] for r in records])), 1),
                "Wasted_Percentage": round((wasted / alloc) * 100.0, 2),
                "Promotions": prom,
                "Promotion_Pct": round((prom / len(records)) * 100.0, 1)
            })

    prob_csv = "benchmarks/per_problem_breakdown.csv"
    with open(prob_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(prob_summary[0].keys()))
        writer.writeheader()
        writer.writerows(prob_summary)
    print(f"[OUTPUT] Per-problem breakdown saved to: {prob_csv}")

    # Write per-language breakdown
    lang_summary = []
    for lang, weight in LANGUAGE_DISTRIBUTION:
        for strat in strategies:
            records = [r for r in all_completed[strat] if r["language"] == lang]
            if not records:
                continue
            alloc = sum(r["allocated_mb"] for r in records)
            used = sum(r["used_mb"] for r in records)
            wasted = sum(r["wasted_mb"] for r in records)
            lang_summary.append({
                "Language": lang.upper(),
                "Strategy": strat.capitalize(),
                "Submissions": len(records),
                "Avg_Allocated_MB": round(float(mean([r["allocated_mb"] for r in records])), 1),
                "Avg_Used_MB": round(float(mean([r["used_mb"] for r in records])), 1),
                "Avg_Wasted_MB": round(float(mean([r["wasted_mb"] for r in records])), 1),
                "Wasted_Percentage": round((wasted / alloc) * 100.0, 2),
                "Avg_Execution_ms": round(float(mean([r["execution_ms"] for r in records])), 1)
            })

    lang_csv = "benchmarks/per_language_breakdown.csv"
    with open(lang_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(lang_summary[0].keys()))
        writer.writeheader()
        writer.writerows(lang_summary)
    print(f"[OUTPUT] Per-language breakdown saved to: {lang_csv}")

    # Sample detailed records file (first 1000 rows across strategies)
    sample_csv = "benchmarks/simulation_results_sample.csv"
    with open(sample_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(all_completed["reactive"][0].keys()))
        writer.writeheader()
        for strat in strategies:
            writer.writerows(all_completed[strat][:250])
    print(f"[OUTPUT] Sample of 1,000 detailed execution records saved to: {sample_csv}")

    # Burst Overload Scenario (Freeze Rush Stress Test)
    simulate_burst_stress(profiles)

def simulate_burst_stress(profiles):
    """
    Simulates a high-intensity 500-submission burst arriving within 30 seconds
    under fixed host RAM budget (16 GB).
    Baseline must limit concurrency to 8 slots to prevent host OOM.
    RAAS-OCJS Light Tier enables 32-48 concurrent slots within the same RAM.
    """
    print("\n=== HIGH-INTENSITY CONTEST FREEZE BURST SIMULATION (N=500, 30s) ===")
    burst_subs = 500
    burst_duration = 30.0

    prob_choices = [p[0] for p in PROBLEM_DISTRIBUTION]
    prob_weights = [p[1] for p in PROBLEM_DISTRIBUTION]
    lang_choices = [l[0] for l in LANGUAGE_DISTRIBUTION]
    lang_weights = [l[1] for l in LANGUAGE_DISTRIBUTION]

    subs = []
    for i in range(burst_subs):
        subs.append({
            "sub_id": f"burst_{i+1:04d}",
            "arrival_time": random.uniform(0.0, burst_duration),
            "problem_id": random.choices(prob_choices, weights=prob_weights)[0],
            "language": random.choices(lang_choices, weights=lang_weights)[0]
        })
    subs.sort(key=lambda s: s["arrival_time"])

    # Baseline safe slot limit = 8 (8 * 2048 MB = 16 GB host limit)
    # Adaptive safe slot limit = 32 (32 * 256 MB = 8 GB + headroom for 200MB spikes = ~12 GB)
    scenarios = [
        ("Baseline (Safe 8 Slots)", "baseline", 8),
        ("Baseline (Overcommitted 16 Slots)", "baseline", 16),
        ("Predictive (Adaptive 32 Slots)", "predictive", 32),
        ("Reactive (Adaptive 32 Slots)", "reactive", 32),
        ("Hybrid (Adaptive 32 Slots)", "hybrid", 32)
    ]

    burst_results = []
    for label, strat, slots in scenarios:
        # Custom run with specific slots
        global MAX_CONCURRENT_SLOTS
        orig_slots = MAX_CONCURRENT_SLOTS
        MAX_CONCURRENT_SLOTS = slots

        completed, _, _ = simulate_strategy(strat, subs, profiles)
        MAX_CONCURRENT_SLOTS = orig_slots

        waits = [r["wait_time_ms"] for r in completed]
        turns = [r["turnaround_ms"] for r in completed]
        peak_conc_alloc_mb = slots * (2048.0 if strat == "baseline" else 256.0)

        row = {
            "Scenario": label,
            "Strategy": strat.capitalize(),
            "Concurrent_Slots": slots,
            "Peak_Allocated_RAM_MB": peak_conc_alloc_mb,
            "Host_RAM_Utilization_Pct": round((peak_conc_alloc_mb / HOST_RAM_MB) * 100.0, 1),
            "Avg_Queue_Wait_ms": round(float(mean(waits)), 1),
            "P95_Queue_Wait_ms": round(float(percentile(waits, 95)), 1),
            "P99_Queue_Wait_ms": round(float(percentile(waits, 99)), 1),
            "Avg_Turnaround_ms": round(float(mean(turns)), 1),
            "P95_Turnaround_ms": round(float(percentile(turns, 95)), 1),
            "Burst_Drain_Time_s": round(max(r["arrival_time_s"] + r["turnaround_ms"]/1000.0 for r in completed), 1)
        }
        burst_results.append(row)
        print(f"{label:35s} | Slots: {slots:2d} | Avg Wait: {row['Avg_Queue_Wait_ms']:7.1f} ms | P95 Turnaround: {row['P95_Turnaround_ms']:7.1f} ms | Drain: {row['Burst_Drain_Time_s']:5.1f}s")

    burst_csv = "benchmarks/burst_stress_analysis.csv"
    with open(burst_csv, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(burst_results[0].keys()))
        writer.writeheader()
        writer.writerows(burst_results)
    print(f"[OUTPUT] Burst stress analysis saved to: {burst_csv}")

if __name__ == "__main__":
    main()

