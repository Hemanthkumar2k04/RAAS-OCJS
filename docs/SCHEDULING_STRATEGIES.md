# Scheduling Strategies in RAAS-OCJS

RAAS-OCJS evaluates four distinct scheduling paradigms against a common containerized execution substrate. This document details each strategy's operational semantics, decision criteria, trade-offs, and empirical behavior.

---

## 1. Strategy Taxonomy

| Strategy | Static Analysis | Initial Tier | Runtime Monitoring | Live Migration | Key Strength | Main Trade-off |
|---|---|---|---|---|---|---|
| **Baseline** | None | Heavy (Uncapped) | None | No | Maximum execution headroom; zero false OOMs | Heavy resource hoarding; limits queue concurrency |
| **Predictive** | Tree-sitter + XGBoost ($< 1\text{ ms}$) | ML Predicted (Light/Heavy) | None | No | Fast, zero runtime polling overhead | Vulnerable to mispredictions without live safety net |
| **Reactive** | None | Light (256 MiB) | cgroup v2 `memory.high` (2 ms poll) | Yes | Self-correcting under memory pressure | 2 ms polling overhead; reaction latency |
| **Hybrid** | Tree-sitter + XGBoost ($< 1\text{ ms}$) | ML Predicted (Light/Heavy) | cgroup v2 `memory.high` (if Light) | Yes | Best of both: optimal start + live safety net | Combines static analysis and monitoring logic |

---

## 2. In-Depth Strategy Analysis

### 2.1 Baseline Strategy
- **Mechanism**: Replicates the current state-of-the-art in most self-hosted online judges. Every submission is treated as potentially resource-exhaustive.
- **Resource Limits**:
  - `memory`: Unlimited (Host Memory)
  - `cpus`: Unlimited (All available host CPU cores)
- **Container Lifecycle**:
  ```
  Submission Intake -> Spawn Uncapped Container -> Execute -> Collect Metrics -> Terminate
  ```
- **Observed Behavior**:
  - For small problems ($O(1)$ prefix sums), Baseline consumes 2–3x more unconstrained cgroup footprint (~21 MB vs ~10 MB) without any performance improvement.
  - On multi-tenant systems, concurrent Baseline submissions compete aggressively for host CPU scheduling and cache lines.

---

### 2.2 Predictive Strategy
- **Mechanism**: Uses pre-execution static analysis.
  1. Tree-sitter parses the source code into an Abstract Syntax Tree.
  2. Feature extractor scans the AST in a single pass to compute 22 structural metrics and 10 engineered density ratios.
  3. Pre-compiled XGBoost inference function (`score(features)`) outputs a probability score $P(\text{Heavy})$.
  4. If $P(\text{Heavy}) \ge \tau_{\text{lang}}$, assign `Tier::High`; otherwise, assign `Tier::Low`.
- **Thresholds**:
  - Python: $\tau = 0.200$
  - Java: $\tau = 0.257$
  - C++: $\tau = 0.346$
  - C: $\tau = 0.346$
- **Resource Limits**:
  - If Light: `memory = 256m`, `cpus = 1.0`
  - If Heavy: `memory = uncapped`, `cpus = uncapped`
- **Container Lifecycle**:
  ```
  Submission Intake -> AST Feature Extraction -> XGBoost Score -> Select Tier -> Spawn Container -> Execute -> Collect Metrics
  ```
- **Observed Behavior**:
  - Correctly categorizes CPU-bound and Light submissions (e.g. Range Prefix Sums, Top-K Streaming) into Light tier, saving ~75% of server memory reservations.
  - Model inference takes $< 10\text{ µs}$ in pure compiled Rust.

---

### 2.3 Reactive Strategy
- **Mechanism**: Ignores static code properties and assumes every submission is Light (`Tier::Low`) by default. Relies on the Linux kernel's cgroup v2 event mechanism to detect actual memory consumption.
- **Watermark Architecture**:
  - Hard limit (`memory.max`): 256 MiB
  - Soft watermark (`memory.high`): 128 MiB
- **Monitoring Loop**:
  - Spawns an asynchronous monitoring task polling every 2 ms.
  - Checks if `memory.current >= 128 MiB` or if the kernel has incremented the monotonic `high` counter in `memory.events`.
  - When the threshold is crossed, the moderator calls `docker update --memory 0 --cpus 0`.
- **Container Lifecycle**:
  ```
  Spawn Light Container (256M) -> Set memory.high=128M -> Start Exec Task || Start Monitor Task ->
     [If cur >= 128M] -> Live promote to Uncapped -> Continue Executing -> Complete
  ```
- **Observed Behavior**:
  - In Problem 2 (0-1 Knapsack 2D DP), the container starts with 256 MB. As the 150 MB table is allocated and touched, the monitor catches the breach at **~538 ms** and smoothly lifts limits without interruption or memory faults.

---

### 2.4 Hybrid Strategy
- **Mechanism**: The synthesis of Predictive and Reactive scheduling.
  1. Evaluates XGBoost prediction before execution.
  2. If predicted **Heavy**, starts directly in `Tier::High` (avoiding soft watermark checks).
  3. If predicted **Light**, starts in `Tier::Low` **with** the reactive monitor armed.
  4. If the model underestimated the submission's memory usage (false negative), the reactive monitor catches the spike at 128 MiB and promotes the container live.
- **Advantage**: Eliminates both the cost of over-allocating Light submissions and the risk of OOM kills on misclassified Heavy submissions.

---

## 3. Comparative Benchmark Summary

| Scenario | Baseline | Predictive | Reactive | Hybrid |
|---|:---:|:---:|:---:|:---:|
| Light Task (Prefix Sums) | Over-allocates (Heavy) | Optimal (Light) | Optimal (Light) | Optimal (Light) |
| Large DP (150 MB Knapsack) | Heavy from start | Depends on AST | Starts Light $\rightarrow$ Promotes live | Starts Light $\rightarrow$ Promotes live |
| CPU Intensive ($O(V^3)$ APSP) | Heavy from start | Identified by AST ($k=3$) | Starts Light (1 CPU) | Identified or Monitored |
| Heavy STL ($N=50\text{k}$ Heaps) | Over-allocates (Heavy) | Identified (STL Flag) | Light (fits in 256 MB) | Optimal (Light, 256 MB) |
