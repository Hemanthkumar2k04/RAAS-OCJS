# RAAS-OCJS — Judge Server

Resource-aware judge: takes a submission, decides an isolation tier (Light/Heavy),
runs it in a Docker container, grades it, and reports resource metrics.

Built with **axum** + **tokio**, feature extraction via tree-sitter, and a
compiled-into-Rust **XGBoost** model for the Predictive tier policy.

---

## Prerequisites

- Rust (edition 2024) — `rustc` / `cargo`
- **Docker Desktop** (or any Docker daemon)
  - The runtime images and the judge use `docker` from the CLI.

---

## 1. Build the Docker runtime images

The judge launches one container per submission from a per-language image.
These must exist before grading. Run from the **repo root** (`RAAS-OCJS/`):

```bash
docker build -t python-judge-runtime server/runtimes/python
docker build -t cpp-judge-runtime    server/runtimes/cpp
docker build -t java-judge-runtime   server/runtimes/java
```

> `c` / `c++` / `cpp` submissions all use `cpp-judge-runtime`.

---

## 2. Build the judge

Run from the **`server/`** directory:

```bash
cd server
cargo build
```

This compiles the XGBoost model (already generated in `src/generated/`) into the binary —
there is **no Python dependency at runtime**.

### Rebuild the model after retraining (optional)

Retraining happens entirely in `model-training/` (dataset extraction → Rust
feature extraction → XGBoost training → model artifacts). See
[`../model-training/README.md`](../model-training/README.md) for the full sequence.

To push a freshly trained model into the judge:

```bash
cd ../model-training
./regenerate_models.sh     # compiles artifacts/*.joblib -> src/generated/*.rs
cd ../server
cargo build                # bakes the new weights into the binary
```

> `regenerate_models.sh` needs `m2cgen` + `joblib` in a Python venv at
> `model-training/.venv`. If the venv doesn't exist (e.g. after a clean checkout),
> set it up first:
>
> ```bash
> cd model-training
> python3 -m venv .venv
> ./.venv/bin/python -m ensurepip
> ./.venv/bin/python -m pip install -r requirements.txt
> ```

---

## 3. Run the server (CRITICAL: Requires Root / Sudo for Live Promotion)

> [!IMPORTANT]
> **Why `sudo` is strictly required for Reactive and Hybrid tier promotion:**
> The Reactive monitor detects memory spikes by arming a 128 MiB soft watermark (`memory.high`) directly on the container's host cgroup:
> `/sys/fs/cgroup/system.slice/docker-<id>.scope/memory.high`
> 
> On Linux, writing to cgroup controller files owned by systemd requires root privileges.
> - **If run without `sudo`**: You will see `[moderator] failed to arm memory.high: Permission denied (os error 13)` in the server logs. The kernel will **not** emit pressure events, and **programs will NOT be promoted mid-execution**.
> - **If run with `sudo`**: The watermark arms successfully, and heavy submissions (such as Problem 2: Knapsack 2D DP) will smoothly trigger live promotion from Light (256 MB) to Uncapped.

Run from the `server/` directory:

```bash
cd server
cargo build

# Run with sudo to grant cgroup v2 write permissions for live promotion:
sudo ./target/debug/server

# Alternatively, using cargo with preserved environment:
sudo -E cargo run
```

Expected output:

```
Judge is online and listening on :3000
```

> **Docker Context Check**: Ensure native Linux Docker is active so host cgroups are accessible:
> ```bash
> docker context use default
> ```

---

## 4. Submit code

`POST /submit` with JSON. The `approach` field selects the scheduling strategy.

**Baseline** (always Heavy):

```bash
curl -X POST localhost:3000/submit -H 'content-type: application/json' -d '{
  "id": "s1",
  "language": "python",
  "approach": "baseline",
  "source": "print(1 + 1)",
  "test_cases": [{ "input": "", "expected": "2" }]
}'
```

**Predictive** (XGBoost picks Light/Heavy from AST features):

```bash
curl -X POST localhost:3000/submit -H 'content-type: application/json' -d '{
  "id": "s2",
  "language": "cpp",
  "approach": "predictive",
  "source": "#include <iostream>\nusing namespace std;\nint main(){long long n, s = 0; cin >> n; for (long long i = 1; i <= n; i++) s += i; cout << s << \"\\n\"; return 0;}",
  "test_cases": [{ "input": "10", "expected": "55" }]
}'
```

**Reactive** (starts Light, promotes mid-run on cgroup pressure):

```bash
curl -X POST localhost:3000/submit -H 'content-type: application/json' -d '{
  "id": "s3",
  "language": "python",
  "approach": "reactive",
  "source": "print(2 + 2)",
  "test_cases": [{ "input": "", "expected": "4" }]
}'
```

**Hybrid** (Predictive start, Reactive corrects):

```bash
curl -X POST localhost:3000/submit -H 'content-type: application/json' -d '{
  "id": "s4",
  "language": "java",
  "approach": "hybrid",
  "source": "public class Main{public static void main(String[]a){System.out.println(3);}}",
  "test_cases": [{ "input": "", "expected": "3" }]
}'
```

---

## 5. Response shape

```json
{
  "submission_id": "s1",
  "approach": "Predictive",
  "verdict": "AC",
  "cpu_time_ms": 92,
  "peak_memory_bytes": 11425792,
  "allocated_memory_bytes": 268435456,
  "wall_time_ms": 623,
  "tier_started": "low",
  "tier_promoted": false,
  "promotion_time_ms": 0,
  "cases": [
    {
      "verdict": "AC",
      "cpu_time_ms": 92,
      "peak_memory_bytes": 11425792,
      "allocated_memory_bytes": 268435456
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `verdict` | `AC` (ok), `WA` (wrong answer), `TLE`, `MLE`, `RE`, `CE`, `SE` (server exec error) |
| `tier_started` | `low` (Light) / `high` (Heavy) — the tier the submission began in |
| `tier_promoted` | `true` if the reactive path lifted the container's limits mid-run |
| `promotion_time_ms` | wall-clock ms from submission start until the promotion write |
| `peak_memory_bytes` | max physical RSS `memory.current` sampled during execution |
| `allocated_memory_bytes` | configured cgroup memory limit (256 MiB for Light tier, 0 for Uncapped) |
| `cpu_time_ms` | sum of per-case CPU time measured via cgroup v2 CFS `cpu.stat` delta |
| `wall_time_ms` | total elapsed wall-clock time from request receipt to completion |

> `peak_memory_bytes` / `allocated_memory_bytes` / `cpu_time_ms` are measured directly from the host cgroup controllers (`cpu.stat`, `memory.current`, `memory.events`), providing microsecond precision free of Docker process startup jitter.

---

## 6. Reactive monitoring

The judge keeps **one Docker container per submission** (`--network=none`, own
rootfs/namespaces) for isolation — exactly how a real OJ behaves — but reaches
into that container's **cgroup v2 directory directly from the host** with plain
file I/O (sub-millisecond, no Docker daemon round-trip, `docker update` is never
used). The mechanism, per submission:

```
docker run --cpus=1 --memory=256m --network=none <runtime-image>   # Low tier start
locate cgroup dir ONCE  /proc/<pid>/cgroup -> /sys/fs/cgroup/system.slice/docker-<id>.scope
write memory.high 134217728      # arm the 128 MiB soft watermark (Docker does NOT set it)
for each test case (docker exec):
  poll memory.events + memory.current every ~2 ms
  if the 'high' counter grew since the last poll  -> policy.should_promote()?
  yes -> write memory.high=max, memory.max=max   # unlimited == Baseline/Predictive 'High'
         record tier_promoted=true, promotion_time_ms
  track max memory.current sampled  -> CaseResult.peak_memory_bytes
docker rm -f
```

- **Reactive** starts Low and promotes on pressure; **Hybrid** starts at the
  Predictive tier and corrects live. `Baseline`/`Predictive` never promote (their
  policies return `should_promote() == false`).
- **Promotion ceiling:** Reactive/Hybrid are lifted to `max` (unlimited), the same
  ceiling a `Tier::High` start already gives Baseline/Predictive, so a promoted
  correct program is never capped below the baseline.
- **Memory-only scope:** the trigger and the promotion touch memory only. CPU is
  left at 1 vCPU. A purely CPU-bound program that never crosses the memory
  watermark will **not** be promoted — CPU-based promotion (`cpu.stat` /
  `cpu.max`) is a later follow-up. State this explicitly when making paper claims.

### Tuning knobs & honest caveats

- `LOW_MEM_HIGH_WATERMARK` (currently 128 MiB) in `src/docker.rs` — the soft line
  below Docker's 256 MiB `memory.max`. Lower → reacts earlier; must stay under the
  hard limit so pressure events fire before any OOM-kill.
- `MONITOR_POLL` (currently 2 ms) in `src/docker.rs`. `memory.events` counters are
  monotonic, so a crossed spike is never lost between polls; this interval bounds
  reaction latency.
- **Permissions:** the judge must be able to read/write `/sys/fs/cgroup` on the
  host (root, or a user with the delegated scope) — i.e. **native Linux Docker**,
  not Docker running inside a VM. If the cgroup dir can't be reached the judge logs
  a warning and degrades gracefully (no promotion, `peak_memory_bytes` stays 0).
- **Per-case peak is a sampled approximation:** cgroup `memory.peak` was not
  resettable in our test environment, so each case's peak is the max
  `memory.current` seen by the ~2 ms poll rather than a kernel-tracked high-water
  mark. Fast sub-poll spikes can be slightly under-counted.

---

## Layout

```
server/
├── Cargo.toml
├── runtimes/            # Docker images (python / cpp / java judge runtime)
└── src/
    ├── main.rs          # axum router + judge fn
    ├── models.rs        # Submission / TestCase / CaseResult / JudgeResult
    ├── queue.rs         # mpsc queue + dispatcher (semaphore-capped tokio.spawn)
    ├── policy.rs        # TierPolicy trait + 4 strategies (MonitorSignal, can_promote)
    ├── predict.rs       # features -> XGBoost -> Tier (predictive policy)
    ├── moderator.rs     # host-side cgroup v2 core: CGroup reads/writes + locate
    ├── docker.rs        # per-submission Docker lifecycle + reactive monitor loop
    └── generated/       # XGBoost compiled to Rust by m2cgen (do not edit)
```
