# RAAS-OCJS Frontend Visualizer

An interactive real-time benchmarking dashboard for evaluating Resource-Aware Adaptive Scheduling strategies on an Online Competitive Judge System.

Built with **React 18**, **TypeScript**, **Vite**, **Tailwind CSS**, and **Recharts**.

---

## Features

- **Problem Switcher**: Switch between five authentic, high-stakes competition problems (Prefix Sums, 0-1 Knapsack 2D DP, Floyd-Warshall All-Pairs Shortest Path, Game Tree Search, Top-K Streaming Frequencies).
- **Multi-Language Support**: View and run solutions in **C++**, **Python**, **Java**, and **C**.
- **Strategy Comparison**: Select an individual strategy (**Baseline**, **Predictive**, **Reactive**, **Hybrid**) or execute **"Run all four strategies"** with a single click.
- **Unified Memory Analysis**: Side-by-side grouped bar charts and comparison tables rendering **Memory Used** (actual physical RSS) vs. **Memory Allocated** (tier ceiling), highlighting infrastructure savings and live tier promotion transitions.
- **Responsive Test Case Previews**: Automatic formatting and bounded scroll previews for high-scale benchmark inputs ($N=30,000$ to $50,000$ and 150 MiB state spaces).
- **Health Indicator**: Real-time poll checking backend status on `http://localhost:3000/health`.

---

## Development & Build

### Prerequisites
- Node.js 18+ and `npm`

### Start Development Server
```bash
npm install
npm run dev
```
Access the application at `http://localhost:5173`.

### Production Build
```bash
npm run build
```
Builds optimized production assets into `dist/`.

---

## Directory Structure

```
frontend/src/
├── App.tsx                     # Main dashboard page and submission workflow
├── chartTokens.ts              # Semantic theme tokens for Recharts visualizers
├── problems.ts                 # Real-world competition problems, code, & generators
├── status.ts                   # Verdict & tier badge tone definitions
├── theme.tsx                   # Dark / Light theme provider context
├── components/
│   ├── CodeEditor.tsx          # Read/write code editor component
│   ├── StatusChip.tsx          # Verdict (AC, WA, RE, TLE) and Tier badges
│   ├── StrategyBarChart.tsx    # Comparative grouped bar chart (CPU, Wall, Memory)
│   ├── TestCaseChart.tsx       # Per-case performance visualizer
│   ├── ThemeProvider.tsx       # Root theme wrapper
│   ├── ThemeToggle.tsx         # Dark/Light mode toggle button
│   └── ui/                     # Reusable card, panel, and stat metric primitives
```
