# RAAS-OCJS System Architecture

**Resource-Aware Adaptive Scheduling for Online Competitive Judge Systems**

---

## 1. Executive Summary

Traditional Online Judges (e.g., DOMjudge, DMOJ, VJudge) enforce uniform, static sandbox allocations for all submissions regardless of algorithmic behavior. A simple $O(1)$ query is assigned identical resources and cgroup ceilings as an intensive $O(N^3)$ dynamic programming problem. On fixed, self-hosted hardware without cloud elasticity, resource over-allocation throttles concurrency, while under-allocation risks premature OOM kills.

**RAAS-OCJS** introduces a two-stage adaptive scheduling architecture:
1. **Predictive Phase**: Static source code parsing via Tree-sitter and 32-feature AST extraction fed into a Rust-embedded XGBoost classifier to select an initial isolation tier prior to container instantiation.
2. **Reactive Phase**: Continuous event-driven Linux cgroup v2 monitoring via kernel `memory.events` (specifically the `high` pressure event) and `memory.current` watermarks, dynamically migrating and scaling container resource ceilings live on-the-fly without aborting execution.

```
                                  +---------------------------------------+
                                  |           Incoming Submission         |
                                  |   (Source, Language, Test Cases)      |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |        Tree-sitter Multi-AST          |
                                  |           (Python/C++/Java/C)         |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |      Rust Feature Extractor (22+10)   |
                                  |   (AST Topology, Loops, Collections)  |
                                  +-------------------+-------------------+
                                                      |
                                                      v
                                  +---------------------------------------+
                                  |     Compiled XGBoost Model (m2cgen)   |
                                  |    Zero Python runtime dependency     |
                                  +-------------------+-------------------+
                                                      |
                       +------------------------------+------------------------------+
                       |                                                             |
                       v                                                             v
        [Predicted Light (Low Tier)]                                  [Predicted Heavy (High Tier)]
     - 1 CPU Core                                                  - Uncapped Host CPU
     - 256 MiB Hard Limit (`memory.max`)                           - Uncapped Memory
     - 128 MiB Soft Watermark (`memory.high`)                                        |
                       |                                                             |
                       v                                                             |
+-----------------------------------------------+                                    |
|   Async Execution & cgroup v2 Event Monitor   |                                    |
|   - 2 ms Poll on `memory.events` & `cpu.stat` |                                    |
+----------------------+------------------------+                                    |
                       |                                                             |
        [Watermark Breached? (cur >= 128 MB)]                                        |
         /                                 \                                         |
       YES                                 NO                                        |
        |                                   |                                        |
        v                                   |                                        |
+-------------------------------+           |                                        |
|   Live Container Promotion    |           |                                        |
| `docker update --memory 0`    |           |                                        |
| Lift to Uncapped Tier         |           |                                        |
+---------------+---------------+           |                                        |
                |                           |                                        |
                +---------------------------+----------------------------------------+
                                            |
                                            v
                                +-----------------------+
                                |  CFS cpu.stat Delta   |
                                |  Grading & Metrics    |
                                +-----------------------+
```

---

## 2. Core Subsystems

### 2.1 Feature Extraction Pipeline (`feature-extraction-pipeline/`)
Built with Rust and Tree-sitter bindings for multi-language AST extraction:
- **Base AST Features (22)**:
  - Loop topology: `nesting_depth`, `max_loop_depth`, `total_loops`.
  - Complexity: `cyclomatic_complexity`.
  - Recursion: `is_recursive`, `recursive_call_count`.
  - Memory markers: `large_alloc_flag`, `total_subscripts`, `total_2d_subscripts`.
  - Library markers: `has_heavy_datastructure` (e.g. `unordered_map`, `priority_queue`, `defaultdict`), `has_fast_io`, `has_modulo_arithmetic`, `has_bitmask_ops`, `has_graph_adjacency`.
  - Code scale: `ast_node_count`, `ast_depth`, `source_loc`, `source_chars`, `max_integer_constant`, `total_functions`, `total_calls`, `total_arithmetic_ops`.
- **Engineered Features (10)**:
  - Densities and interaction ratios: `loop_density`, `call_density`, `subscript_density`, `branch_density`, `arithmetic_density`, `subscript_2d_ratio`, `recursion_intensity`, `log_max_constant`, `log_ast_nodes`, `log_source_chars`.

### 2.2 Embedded Inference Engine (`server/src/predict.rs`)
To ensure sub-millisecond evaluation latency and zero Python runtime overhead:
- Offline models are trained on IBM Project CodeNet using Python and scikit-learn/xgboost.
- Models are transpiled into pure Rust code via `m2cgen` (`server/src/generated/`).
- Specialized models exist for Python, C++, Java, and C, with calibrated decision thresholds ($0.200$ to $0.346$).
- The judge evaluates model inference in $< 5\text{ µs}$ on the hot path without spawning subprocesses or loading weights dynamically.

### 2.3 Container Isolation & Kernel cgroup v2 (`server/src/docker.rs`, `server/src/moderator.rs`)
Submissions run inside dedicated rootless/daemon sandboxes utilizing Linux cgroup v2:
- **Directory Resolution**: Locates `/sys/fs/cgroup/system.slice/docker-<CONTAINER_ID>.scope/` directly on the Linux host filesystem.
- **Dual Memory Boundaries**:
  - `memory.max`: Hard OOM limit (256 MiB for Light tier).
  - `memory.high`: Soft watermark set to 128 MiB (`LOW_MEM_HIGH_WATERMARK`). When breached, the kernel throttles memory allocations and increments `memory.events (high)`, allowing the monitor to safely promote the container *before* an OOM killer terminates it.
- **Microsecond Kernel CPU Accounting**:
  - Direct reading of `usage_usec` from `cpu.stat` before and after each test case execution:
    $$\Delta \text{CPU} = \frac{\text{usage\_usec}_{\text{after}} - \text{usage\_usec}_{\text{before}}}{1000} \text{ ms}$$
  - Completely excludes Docker CLI, containerd, and runc process invocation latency, delivering stable, deterministic metrics across runs.

### 2.4 Reactive Monitor & Live Tier Migration (`server/src/moderator.rs`)
- Polling loop runs on a 2 ms tick (`MONITOR_POLL`).
- Reads monotonic `memory.events` delta and `memory.current`.
- On watermark breach (`cur >= 128MB` or `high_crossed`), the moderator executes:
  ```rust
  cg.promote_to_unlimited()?;
  Command::new("docker")
      .args(["update", container, "--memory", "0", "--memory-swap", "-1", "--cpus", "0"])
      .output()
      .await?;
  ```
- The container transitions from **Light (256 MiB)** to **Heavy (Uncapped)** mid-execution in under 15 ms, without dropping open file descriptors, child PIDs, or execution state.
- **Host Privileges & Delegation**: Because writing to `/sys/fs/cgroup/system.slice/docker-<id>.scope/memory.high` touches systemd-managed kernel cgroup controllers, the judge server process must be run with root / sudo permissions (`sudo ./target/debug/server`) or systemd slice delegation. Running without root results in `Permission denied (os error 13)` and suppresses pressure event generation, preventing live promotion.

---

## 3. Data Flow & Communication

1. **Client Submission (`POST /submit`)**:
   - Accepts JSON containing code, language, chosen strategy (`baseline`, `predictive`, `reactive`, `hybrid`), and test cases.
2. **Asynchronous Dispatcher Queue (`server/src/queue.rs`)**:
   - Tokio `mpsc` channel with concurrency bounded by an `Arc<Semaphore>` (max 16 concurrent submissions).
3. **Execution & Metrics Packaging**:
   - Returns structured `JudgeResult` containing:
     - `verdict` (`AC`, `WA`, `RE`, `TLE`, `SE`)
     - `cpu_time_ms` (CFS kernel CPU delta)
     - `wall_time_ms` (total elapsed wall-clock time)
     - `peak_memory_bytes` (maximum RSS sampled)
     - `allocated_memory_bytes` (allocated limit: 256MB or Uncapped)
     - `tier_started` & `tier_promoted`
     - `promotion_time_ms` (exact timestamp when live migration took place)
     - Per-test-case breakdown.
