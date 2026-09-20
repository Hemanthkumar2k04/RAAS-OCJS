# RAAS-OCJS

**Resource-Aware Adaptive Scheduling for Online Competitive Judge Systems**

A next-generation competitive programming judge combining **predictive AST-based classification** with **reactive, event-driven Linux cgroup v2 monitoring** to enable dynamic, mid-execution isolation-tier migration on fixed, self-hosted hardware.

> **Final-Year Project**  
> Department of Computer Science and Engineering, Easwari Engineering College.  
> Guided by **Mrs. Indumathy P**, Assistant Professor / CSE.

---

## Table of Contents

- [01. Problem Statement](#01-problem-statement)
- [02. Scheduling Strategies](#02-scheduling-strategies)
- [03. System Architecture](#03-system-architecture)
- [04. Real-World Competition Benchmark Suite](#04-real-world-competition-benchmark-suite)
- [05. Key Innovations & Measurements](#05-key-innovations--measurements)
- [06. Experimental Results](#06-experimental-results)
- [07. Tech Stack](#07-tech-stack)
- [08. Documentation Index](#08-documentation-index)
- [09. Quick Start](#09-quick-start)
- [10. Team](#10-team)

---

## 01. Problem Statement

Standard Online Judges (DOMjudge, DMOJ, VJudge) apply uniform isolation limits to every submission. Evaluating a trivial $O(1)$ query reserves identical CPU and memory headroom as an intensive $O(N^3)$ graph or dynamic programming algorithm. On self-hosted, non-elastic servers, this practice leads to:
1. **Severe Resource Hoarding**: Light jobs tie up server memory reservations, capping submission throughput.
2. **OOM Vuln or Overkill**: Setting limits low causes false Memory-Limit-Exceeded (MLE) verdicts on legitimate heavy programs; setting limits high creates multi-tenant CPU starvation.

**RAAS-OCJS** introduces adaptive multi-tier scheduling that optimizes the sandbox isolation substrate beneath judging without compromising grading criteria.

---

## 02. Scheduling Strategies

RAAS-OCJS provides four switchable scheduling engines:

| Strategy | When Evaluated | Mechanism | Isolation Profile |
|---|---|---|---|
| **Baseline** | Intake | Current standard practice | Always assigns Heavy tier (Uncapped Host Memory & CPU) |
| **Predictive** | Pre-Execution | Tree-sitter AST $\rightarrow$ 32 features $\rightarrow$ Compiled XGBoost | Assigns Light (256 MiB, 1 CPU) or Heavy tier before launching container |
| **Reactive** | Mid-Execution | Linux cgroup v2 event-driven monitoring | Starts in Light tier (256 MiB); dynamically promotes to Uncapped if 128 MiB watermark is crossed |
| **Hybrid** | Both | Predictive start + Reactive live safety net | Starts in ML-predicted tier; actively promotes if memory spikes exceed prediction |

---

## 03. System Architecture

```
[ Incoming Submission ]
        |
        v
[ Tree-sitter AST Parser ] (C++, Python, Java, C)
        |
        v
[ Feature Extraction ] (22 Base AST + 10 Engineered Ratios)
        |
        v
[ Rust-Compiled XGBoost Inference ] (Zero Python runtime dependency)
        |
        +-----------------------------------+-----------------------------------+
        |                                                                       |
        v                                                                       v
[ Light Tier (256 MiB / 1 CPU) ]                             [ Heavy Tier (Uncapped) ]
  - memory.max  = 256 MiB                                      - memory = Unlimited
  - memory.high = 128 MiB (Soft Watermark)                     - cpus   = Unlimited
        |                                                                       |
        v                                                                       |
[ cgroup v2 Reactive Monitor (2ms tick) ]                                       |
        |                                                                       |
 [ cur >= 128 MB? ]                                                             |
   /             \                                                              |
 YES              NO                                                            |
  |                |                                                            |
  v                |                                                            |
[ Live Promotion ] |                                                            |
 `docker update`   |                                                            |
  -> Uncapped      |                                                            |
        |          |                                                            |
        +----------+------------------------------------------------------------+
                   |
                   v
   [ Microsecond CFS cpu.stat Accounting ]
   [ Interactive Comparison UI ]
```

---

## 04. Real-World Competition Benchmark Suite

The system includes five high-stakes competition problems modeled after **Codeforces**, **ICPC**, **LeetCode Hard**, and **AtCoder DP Contest**:

1. **Range Prefix Sums & Cumulative Balance** (`Prefix Sums`, Light)
   - $O(N + Q)$ Time · $O(N)$ Space. Evaluates Light-tier performance with zero cgroup watermark events.
2. **0-1 Knapsack Large State Space (2D Grid DP)** (`Dynamic Programming`, Memory-Heavy)
   - $O(N \times W)$ Time · $O(N \times W)$ Space (~150 MiB RSS). Intentionally breaches the 128 MiB watermark to verify **live reactive container promotion**.
3. **All-Pairs Shortest Path (Floyd-Warshall Algorithm)** (`Graph`, CPU-Bound)
   - $O(V^3)$ Time · $O(V^2)$ Space ($V=100, 120$). Evaluates Predictive AST detection of triply nested loops (`max_loop_depth = 3`).
4. **Game Tree Search (Binary Branching Recursion)** (`Game Theory`, Recursive)
   - $O(2^N)$ Time · $O(N)$ Stack Depth ($N=30, 32$). Evaluates Tree-sitter detection of branching recursion (`is_recursive`, `recursive_call_count = 2`).
5. **Top-K Streaming Frequencies (Hash Map + Priority Queue)** (`Streaming / Heaps`, Collections)
   - $O(N \log K)$ Time · $O(N)$ Space ($N=30\text{k}, 50\text{k}$). Evaluates heavy STL container detection and demonstrates stable CFS CPU accounting.

---

## 05. Key Innovations & Measurements

1. **Microsecond CFS Kernel CPU Timing (`cpu.stat`)**:
   - Rather than measuring host wall-time around `docker exec` (which adds 150–200 ms of container startup noise), the judge reads `/sys/fs/cgroup/.../cpu.stat` deltas directly from the Linux kernel scheduler.
   - Reduces execution measurement variance from $\pm 200\%$ down to $\le \pm 4\%$.
2. **Soft Watermark Live Migration (`memory.high`)**:
   - Uses `memory.high = 128 MiB` to detect pressure *before* reaching the 256 MiB hard limit (`memory.max`), preventing kernel OOM-killer panics.
   - Executes live container expansion (`docker update --memory 0 --cpus 0`) in $< 15\text{ ms}$ without dropping running processes.
3. **Unified Allocated vs. Used Memory Tracking**:
   - Explicitly records both the **Peak Memory Used** (actual RSS footprint) and **Memory Allocated** (assigned tier ceiling), enabling direct quantification of infrastructure savings.

---

## 06. Experimental Results

*Measured on Linux Kernel 6.x with cgroup v2 (Python 3.12 / GCC 13):*

| Problem | Strategy | Verdict | Initial Tier | Tier Promoted? | CPU Time (`cpu.stat`) | Peak Memory (Used) | Allocated Memory (Limit) |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **P1: Prefix Sums** | Baseline | **AC** | Heavy | No | 77 ms | 14.1 MB | Uncapped (Host) |
| | **Predictive / Reactive** | **AC** | Light | No | **48–52 ms** | **8.2 MB** | **256 MiB** |
| **P2: Knapsack 2D DP** | Baseline | **AC** | Heavy | No | 210 ms | 151.2 MB | Uncapped (Host) |
| | **Reactive / Hybrid** | **AC** | Light | **Yes (538 ms)** | **215 ms** | **151.2 MB** | **256 MB $\rightarrow$ Uncapped** |
| **P3: Floyd-Warshall** | Baseline | **AC** | Heavy | No | 580 ms | 9.9 MB | Uncapped (Host) |
| | **Predictive** | **AC** | Light | No | **573 ms** | **9.8 MB** | **256 MiB** |
| **P5: Top-K Streaming** | Baseline | **AC** | Heavy | No | 163 ms | 21.1 MB | Uncapped (Host) |
| | **Predictive / Hybrid** | **AC** | Light | No | **135–144 ms** | **10.9 MB** | **256 MiB** |

---

## 07. Tech Stack

- **Judge Server**: Rust (Tokio, Axum, cgroups v2, Linux namespaces).
- **AST Parsing**: Tree-sitter Rust bindings (C, C++, Java, Python).
- **ML Inference**: XGBoost transpiled to pure Rust via `m2cgen` (zero Python dependency at runtime).
- **Frontend Visualizer**: React 18, TypeScript, Vite, Tailwind CSS, Recharts.
- **Dataset**: IBM Project CodeNet (13.9M submissions).

---

## 08. Documentation Index

Detailed architectural and technical documentation is available in the [`docs/`](docs/) directory:

- [**System Architecture** (`docs/ARCHITECTURE.md`)](docs/ARCHITECTURE.md): Deep dive into the AST pipeline, cgroup controllers, and dual watermark design.
- [**Scheduling Strategies** (`docs/SCHEDULING_STRATEGIES.md`)](docs/SCHEDULING_STRATEGIES.md): Formal breakdown of Baseline, Predictive, Reactive, and Hybrid policies.
- [**Benchmark Suite** (`docs/BENCHMARK_SUITE.md`)](docs/BENCHMARK_SUITE.md): Mathematical formulations, complexity, and test cases for all 5 competition problems.
- [**Experimental Results** (`docs/EXPERIMENTAL_RESULTS.md`)](docs/EXPERIMENTAL_RESULTS.md): Empirical data, stability measurements, and memory savings analysis.
- [**Setup & Developer Guide** (`docs/SETUP_GUIDE.md`)](docs/SETUP_GUIDE.md): Complete setup instructions for running the judge server and frontend.

---

## 09. Quick Start

### 1. Build Sandbox Images
```bash
docker build -t python-judge-runtime server/runtimes/python
docker build -t cpp-judge-runtime    server/runtimes/cpp
docker build -t java-judge-runtime   server/runtimes/java
```

### 2. Run Judge Server
```bash
cd server
cargo build
sudo ./target/debug/server
```

### 3. Start Frontend UI
```bash
cd frontend
npm install
npm run dev
```
Navigate to `http://localhost:5173` to launch the multi-strategy visualizer.

---

## 10. Team

| Name | Role | Responsibilities |
|---|---|---|
| **Hemanthkumar K** | Systems & Infrastructure Lead | Server, Linux cgroup v2 Isolation Manager, CFS Timing, Backend API |
| **Bharath Aashish R** | Frontend & UI/UX Lead | React Visualizer, Recharts Strategy Graphs, Benchmark Code Editor |
| **Dhanush M** | Machine Learning Lead | Dataset Preprocessing, XGBoost Model Training, m2cgen Transpilation |
| **Iniyaa P** | Static Analysis Lead | Tree-sitter Integration, AST Feature Extraction Logic |
