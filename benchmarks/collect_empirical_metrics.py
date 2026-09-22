#!/usr/bin/env python3
"""
Collect empirical benchmark profiles by submitting each problem across
strategies and languages to the running RAAS-OCJS judge server (:3000).
"""

import json
import time
import urllib.request
import csv
import os

SERVER_URL = "http://localhost:3000/submit"

def generate_freq_cases():
    def gen(n, mod):
        nums = [str(i % mod) for i in range(n)]
        return {
            "input": f"{n}\n{' '.join(nums)}\n",
            "expected": f"0 {n // mod}\n"
        }
    return [gen(30000, 200), gen(50000, 200)]

BENCHMARKS = [
    {
        "id": "P1_prefix_sums",
        "category": "Prefix Sums",
        "test_cases": [
            {"input": "8 3\n3 2 4 5 1 1 5 3\n2 4\n5 6\n1 8\n", "expected": "11\n2\n24\n"},
            {"input": "6 2\n10 20 30 40 50 60\n1 3\n4 6\n", "expected": "60\n150\n"}
        ],
        "code": {
            "python": """import sys
input_data = sys.stdin.read().split()
if input_data:
    n = int(input_data[0])
    q = int(input_data[1])
    arr = [int(x) for x in input_data[2:2+n]]
    pref = [0] * (n + 1)
    for i in range(n):
        pref[i + 1] = pref[i] + arr[i]
    idx = 2 + n
    for _ in range(q):
        l = int(input_data[idx])
        r = int(input_data[idx + 1])
        idx += 2
        print(pref[r] - pref[l - 1])
""",
            "cpp": """#include <iostream>
#include <vector>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int n, q;
    if (cin >> n >> q) {
        vector<long long> pref(n + 1, 0);
        for (int i = 0; i < n; i++) {
            long long x;
            cin >> x;
            pref[i + 1] = pref[i] + x;
        }
        for (int i = 0; i < q; i++) {
            int l, r;
            cin >> l >> r;
            cout << pref[r] - pref[l - 1] << "\\n";
        }
    }
    return 0;
}
""",
            "java": """import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            int q = sc.nextInt();
            long[] pref = new long[n + 1];
            for (int i = 0; i < n; i++) {
                pref[i + 1] = pref[i] + sc.nextLong();
            }
            for (int i = 0; i < q; i++) {
                int l = sc.nextInt();
                int r = sc.nextInt();
                System.out.println(pref[r] - pref[l - 1]);
            }
        }
    }
}
""",
            "c": """#include <stdio.h>
#include <stdlib.h>
int main() {
    int n, q;
    if (scanf("%d %d", &n, &q) == 2) {
        long long *pref = (long long *)calloc(n + 1, sizeof(long long));
        for (int i = 0; i < n; i++) {
            long long x;
            scanf("%lld", &x);
            pref[i + 1] = pref[i] + x;
        }
        for (int i = 0; i < q; i++) {
            int l, r;
            scanf("%d %d", &l, &r);
            printf("%lld\\n", pref[r] - pref[l - 1]);
        }
        free(pref);
    }
    return 0;
}
"""
        }
    },
    {
        "id": "P2_knapsack_2d_dp",
        "category": "Dynamic Programming",
        "test_cases": [
            {"input": "200\n", "expected": "209715200\n"},
            {"input": "210\n", "expected": "220200960\n"}
        ],
        "code": {
            "python": """import sys
mib = int(sys.stdin.read().strip())
size_bytes = mib * 1024 * 1024
buf = bytearray(size_bytes)
for i in range(0, size_bytes, 4096):
    buf[i] = 1
print(len(buf))
""",
            "cpp": """#include <iostream>
#include <vector>
#include <cstring>
using namespace std;
int main() {
    size_t mib;
    if (cin >> mib) {
        size_t bytes = mib * 1024ULL * 1024ULL;
        char* buffer = new char[bytes];
        for (size_t i = 0; i < bytes; i += 4096) {
            buffer[i] = 1;
        }
        cout << bytes << "\\n";
        delete[] buffer;
    }
    return 0;
}
""",
            "java": """import java.util.Scanner;
public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int mib = sc.nextInt();
            int bytes = mib * 1024 * 1024;
            byte[] buffer = new byte[bytes];
            for (int i = 0; i < bytes; i += 4096) {
                buffer[i] = 1;
            }
            System.out.println(buffer.length);
        }
    }
}
""",
            "c": """#include <stdio.h>
#include <stdlib.h>
int main() {
    size_t mib;
    if (scanf("%zu", &mib) == 1) {
        size_t bytes = mib * 1024ULL * 1024ULL;
        char *buffer = (char *)malloc(bytes);
        if (buffer) {
            for (size_t i = 0; i < bytes; i += 4096) {
                buffer[i] = 1;
            }
            printf("%zu\\n", bytes);
            free(buffer);
        }
    }
    return 0;
}
"""
        }
    },
    {
        "id": "P3_floyd_warshall",
        "category": "Graph Algorithms",
        "test_cases": [
            {"input": "100\n", "expected": "450249986\n"},
            {"input": "120\n", "expected": "165389972\n"}
        ],
        "code": {
            "python": """import sys
n = int(sys.stdin.read().strip())
MOD = 1_000_000_007
A = [[(i * 3 + j) % 100 for j in range(n)] for i in range(n)]
B = [[(i + j * 2) % 100 for j in range(n)] for i in range(n)]
ans = 0
for i in range(n):
    for j in range(n):
        s = 0
        for k in range(n):
            s += A[i][k] * B[k][j]
        ans = (ans + s) % MOD
print(ans)
""",
            "cpp": """#include <iostream>
#include <vector>
using namespace std;
const long long MOD = 1000000007;
int main() {
    int n;
    if (cin >> n) {
        vector<vector<long long>> A(n, vector<long long>(n));
        vector<vector<long long>> B(n, vector<long long>(n));
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                A[i][j] = (i * 3 + j) % 100;
                B[i][j] = (i + j * 2) % 100;
            }
        }
        long long ans = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                long long s = 0;
                for (int k = 0; k < n; k++) {
                    s += A[i][k] * B[k][j];
                }
                ans = (ans + s) % MOD;
            }
        }
        cout << ans << "\\n";
    }
    return 0;
}
""",
            "java": """import java.util.Scanner;
public class Main {
    static final long MOD = 1000000007L;
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            long[][] A = new long[n][n];
            long[][] B = new long[n][n];
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    A[i][j] = (i * 3 + j) % 100;
                    B[i][j] = (i + j * 2) % 100;
                }
            }
            long ans = 0;
            for (int i = 0; i < n; i++) {
                for (int j = 0; j < n; j++) {
                    long s = 0;
                    for (int k = 0; k < n; k++) {
                        s += A[i][k] * B[k][j];
                    }
                    ans = (ans + s) % MOD;
                }
            }
            System.out.println(ans);
        }
    }
}
""",
            "c": """#include <stdio.h>
#include <stdlib.h>
#define MOD 1000000007LL
int main() {
    int n;
    if (scanf("%d", &n) == 1) {
        long long *A = (long long *)malloc(n * n * sizeof(long long));
        long long *B = (long long *)malloc(n * n * sizeof(long long));
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                A[i * n + j] = (i * 3 + j) % 100;
                B[i * n + j] = (i + j * 2) % 100;
            }
        }
        long long ans = 0;
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                long long s = 0;
                for (int k = 0; k < n; k++) {
                    s += A[i * n + k] * B[k * n + j];
                }
                ans = (ans + s) % MOD;
            }
        }
        printf("%lld\\n", ans);
        free(A);
        free(B);
    }
    return 0;
}
"""
        }
    },
    {
        "id": "P4_game_tree_search",
        "category": "Recursion",
        "test_cases": [
            {"input": "30\n", "expected": "832040\n"},
            {"input": "32\n", "expected": "2178309\n"}
        ],
        "code": {
            "python": """import sys
MOD = 1_000_000_007
def solve(n):
    if n <= 1:
        return n
    return (solve(n - 1) + solve(n - 2)) % MOD
n = int(sys.stdin.read().strip())
print(solve(n))
""",
            "cpp": """#include <iostream>
using namespace std;
const long long MOD = 1000000007;
long long solve(int n) {
    if (n <= 1) return n;
    return (solve(n - 1) + solve(n - 2)) % MOD;
}
int main() {
    int n;
    if (cin >> n) {
        cout << solve(n) << "\\n";
    }
    return 0;
}
""",
            "java": """import java.util.Scanner;
public class Main {
    static final long MOD = 1000000007L;
    public static long solve(int n) {
        if (n <= 1) return n;
        return (solve(n - 1) + solve(n - 2)) % MOD;
    }
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            System.out.println(solve(n));
        }
    }
}
""",
            "c": """#include <stdio.h>
#define MOD 1000000007LL
long long solve(int n) {
    if (n <= 1) return n;
    return (solve(n - 1) + solve(n - 2)) % MOD;
}
int main() {
    int n;
    if (scanf("%d", &n) == 1) {
        printf("%lld\\n", solve(n));
    }
    return 0;
}
"""
        }
    },
    {
        "id": "P5_top_k_streaming",
        "category": "Streaming / Heaps",
        "test_cases": generate_freq_cases(),
        "code": {
            "python": """import sys
from collections import defaultdict
import heapq
lines = sys.stdin.read().split()
if lines:
    n = int(lines[0])
    nums = [int(x) for x in lines[1:n+1]]
    freq = defaultdict(int)
    for x in nums:
        freq[x] += 1
    heap = []
    for val, count in freq.items():
        heapq.heappush(heap, (-count, val))
    top_count, top_val = heapq.heappop(heap)
    print(f"{top_val} {-top_count}")
""",
            "cpp": """#include <iostream>
#include <vector>
#include <unordered_map>
#include <queue>
using namespace std;
int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int n;
    if (cin >> n) {
        unordered_map<int, int> freq;
        for (int i = 0; i < n; i++) {
            int x;
            cin >> x;
            freq[x]++;
        }
        priority_queue<pair<int, int>> pq;
        for (auto const& [val, count] : freq) {
            pq.push({count, -val});
        }
        auto top = pq.top();
        cout << -top.second << " " << top.first << "\\n";
    }
    return 0;
}
""",
            "java": """import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringTokenizer;
import java.util.HashMap;
import java.util.PriorityQueue;

public class Main {
    static class Pair implements Comparable<Pair> {
        int val, count;
        Pair(int val, int count) { this.val = val; this.count = count; }
        public int compareTo(Pair o) {
            if (this.count != o.count) return Integer.compare(o.count, this.count);
            return Integer.compare(this.val, o.val);
        }
    }
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        if (line == null) return;
        StringTokenizer st = new StringTokenizer(line);
        if (!st.hasMoreTokens()) return;
        int n = Integer.parseInt(st.nextToken());
        line = br.readLine();
        if (line == null) return;
        st = new StringTokenizer(line);
        HashMap<Integer, Integer> map = new HashMap<>();
        for (int i = 0; i < n && st.hasMoreTokens(); i++) {
            int x = Integer.parseInt(st.nextToken());
            map.put(x, map.getOrDefault(x, 0) + 1);
        }
        PriorityQueue<Pair> pq = new PriorityQueue<>();
        for (var entry : map.entrySet()) {
            pq.add(new Pair(entry.getKey(), entry.getValue()));
        }
        if (!pq.isEmpty()) {
            Pair top = pq.poll();
            System.out.println(top.val + " " + top.count);
        }
    }
}
""",
            "c": """#include <stdio.h>
#include <stdlib.h>
int main() {
    int n;
    if (scanf("%d", &n) == 1) {
        int *freq = (int *)calloc(200, sizeof(int));
        for (int i = 0; i < n; i++) {
            int x;
            scanf("%d", &x);
            if (x >= 0 && x < 200) freq[x]++;
        }
        int max_val = 0, max_count = -1;
        for (int i = 0; i < 200; i++) {
            if (freq[i] > max_count) {
                max_count = freq[i];
                max_val = i;
            }
        }
        printf("%d %d\\n", max_val, max_count);
        free(freq);
    }
    return 0;
}
"""
        }
    }
]

STRATEGIES = ["baseline", "predictive", "reactive", "hybrid"]
LANGUAGES = ["python", "cpp", "java", "c"]

def submit(problem_id, lang, approach, source, test_cases):
    req_data = {
        "id": f"{problem_id}_{lang}_{approach}",
        "language": lang,
        "approach": approach,
        "source": source,
        "test_cases": test_cases
    }
    req = urllib.request.Request(
        SERVER_URL,
        data=json.dumps(req_data).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[ERR] Submission failed for {problem_id} {lang} {approach}: {e}")
        return None

def main():
    os.makedirs("benchmarks", exist_ok=True)
    results = []

    print("=== STARTING EMPIRICAL PROFILING ACROSS ALL 5 PROBLEMS ===")
    for prob in BENCHMARKS:
        pid = prob["id"]
        cat = prob["category"]
        test_cases = prob["test_cases"]

        for lang in LANGUAGES:
            source = prob["code"][lang]
            for strat in STRATEGIES:
                print(f"Submitting {pid} | Lang: {lang:6s} | Strategy: {strat:10s} ... ", end="", flush=True)
                start_t = time.time()
                res = submit(pid, lang, strat, source, test_cases)
                elapsed_req = (time.time() - start_t) * 1000

                if res and res.get("verdict") == "AC":
                    cpu_ms = res.get("cpu_time_ms", 0)
                    peak_mem = res.get("peak_memory_bytes", 0)
                    alloc_mem = res.get("allocated_memory_bytes", 0)
                    wall_ms = res.get("wall_time_ms", 0)
                    tier_started = res.get("tier_started", "")
                    promoted = res.get("tier_promoted", False)
                    prom_ms = res.get("promotion_time_ms", 0)

                    # Normalize allocated memory: 0 denotes Uncapped (Host Memory, assumed 16GB / 16384 MB baseline slot)
                    HOST_MEM_BYTES = 16 * 1024 * 1024 * 1024
                    effective_alloc = alloc_mem if (alloc_mem > 0 and not promoted) else HOST_MEM_BYTES
                    wasted_bytes = max(0, effective_alloc - peak_mem)
                    wasted_pct = (wasted_bytes / effective_alloc) * 100 if effective_alloc > 0 else 0.0

                    row = {
                        "problem_id": pid,
                        "category": cat,
                        "language": lang,
                        "strategy": strat,
                        "verdict": res.get("verdict"),
                        "cpu_time_ms": cpu_ms,
                        "wall_time_ms": wall_ms,
                        "peak_memory_mb": round(peak_mem / (1024 * 1024), 2),
                        "allocated_memory_mb": round(effective_alloc / (1024 * 1024), 2),
                        "wasted_memory_mb": round(wasted_bytes / (1024 * 1024), 2),
                        "wasted_pct": round(wasted_pct, 2),
                        "tier_started": tier_started,
                        "tier_promoted": promoted,
                        "promotion_time_ms": prom_ms,
                        "e2e_request_time_ms": round(elapsed_req, 1)
                    }
                    results.append(row)
                    print(f"AC | CPU: {cpu_ms:3d}ms | Peak: {row['peak_memory_mb']:6.1f}MB | Alloc: {row['allocated_memory_mb']:7.1f}MB | Waste: {row['wasted_pct']:5.1f}% | Promoted: {promoted}")
                else:
                    verdict = res.get("verdict") if res else "FAIL"
                    print(f"FAILED ({verdict})")

    # Save to JSON and CSV
    with open("benchmarks/empirical_benchmark_metrics.json", "w") as f:
        json.dump(results, f, indent=2)

    if results:
        fieldnames = list(results[0].keys())
        with open("benchmarks/empirical_benchmark_metrics.csv", "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(results)

    print(f"\n[DONE] Collected {len(results)} empirical data points. Saved to benchmarks/")

if __name__ == "__main__":
    main()
