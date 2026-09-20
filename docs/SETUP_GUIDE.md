# System Setup & Developer Guide

This guide provides step-by-step instructions for building, configuring, and running the entire RAAS-OCJS system locally.

---

## 1. Prerequisites & System Requirements

- **Operating System**: Linux with **cgroups v2** enabled (Ubuntu 22.04+, Debian 12+, Arch Linux, Fedora).
- **Rust Toolchain**: `rustc` and `cargo` (1.75+ or edition 2024).
- **Node.js**: Node 18+ and `npm`.
- **Docker Engine**: Native Linux Docker daemon (`/var/run/docker.sock`).
- **Python (Optional for model training only)**: Python 3.10+ with `virtualenv`.

---

## 2. Docker Runtime Images

The judge runs each submission inside a language-specific Docker sandbox. Build the runtime images from the repository root:

```bash
# From repository root (RAAS-OCJS/)
docker build -t python-judge-runtime server/runtimes/python
docker build -t cpp-judge-runtime    server/runtimes/cpp
docker build -t java-judge-runtime   server/runtimes/java
```

> **Note**: `C` and `C++` submissions both execute within `cpp-judge-runtime`.

---

## 3. Building & Running the Judge Server

### 3.1 Build the Server
The predictive XGBoost models are pre-compiled into Rust code (`server/src/generated/`), meaning **no Python environment is required to build or run the judge server**:

```bash
cd server
cargo build
```

### 3.2 Run the Server with cgroup Permissions
The reactive monitor writes soft watermarks to `/sys/fs/cgroup/system.slice/docker-.../memory.high` and reads `cpu.stat`. On standard Linux installations, root privileges are required to configure container cgroups:

```bash
sudo ./target/debug/server
# Or:
sudo cargo run
```

Expected output:
```
Judge is online and listening on :3000
```

### 3.3 Verifying Docker Context
If you have Docker Desktop installed alongside native Docker, ensure the native daemon is used so the host `/sys/fs/cgroup` tree is accessible:
```bash
docker context use default
```
*(The server automatically enforces `DOCKER_CONTEXT=default` at startup when `/var/run/docker.sock` is detected).*

---

## 4. Running the Interactive Frontend

The frontend is built with **React**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Recharts**:

```bash
cd frontend
npm install
npm run dev
```

Open your browser at:
```
http://localhost:5173
```

- **Problem Switcher**: Choose from the 5 competition problems in the left sidebar.
- **Language Switcher**: Toggle between Python, C++, Java, and C.
- **Run Strategies**: Select a single strategy or click **"Run all four strategies"** to benchmark Baseline, Predictive, Reactive, and Hybrid side-by-side.

---

## 5. Model Training & Regeneration Workflow (Optional)

If you modify the training dataset or hyperparameters in `model-training/`:

```bash
cd model-training
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run feature extraction on dataset and train XGBoost models
python3 train_advanced_xgboost.py

# Transpile models into Rust code for the judge
./regenerate_models.sh

# Recompile judge server with updated weights
cd ../server
cargo build
```

---

## 6. Troubleshooting

### Permission denied (os error 13) on `memory.high`
**Cause**: The judge server process does not have write permissions to the cgroup controller file.  
**Fix**: Run the server with `sudo ./target/debug/server` or configure systemd cgroup delegation for your user slice.

### "Address already in use" (port 3000)
**Cause**: Another judge process or service is running on port 3000.  
**Fix**: Find and terminate the process:
```bash
sudo lsof -i :3000
sudo kill -9 <PID>
```
