import type { Tone } from './status'

export type CodeLanguage = 'C' | 'C++' | 'Java' | 'Python'

export interface TestCase {
  input: string
  expected: string
  displayInput?: string
}

function generateFrequencyTestCases(): TestCase[] {
  const gen = (n: number, mod: number): TestCase => {
    const nums: number[] = new Array(n)
    for (let i = 0; i < n; i++) {
      nums[i] = i % mod
    }
    return {
      input: `${n}\n${nums.join(' ')}\n`,
      expected: `0 ${Math.floor(n / mod)}\n`,
      displayInput: `${n}\n${nums.slice(0, 12).join(' ')} ... (${n.toLocaleString()} space-separated numbers in range 0..${mod - 1})`,
    }
  }
  return [gen(30000, 200), gen(50000, 200)]
}

export interface Problem {
  id: string
  number: number
  title: string
  category: string
  tagTone: Tone
  description: string
  complexity: string
  targetStrategy: string
  testCases: TestCase[]
  code: Record<CodeLanguage, string>
}

export const PROBLEMS: Problem[] = [
  {
    id: 'range-prefix-sums',
    number: 1,
    title: 'Range Prefix Sums & Cumulative Balance',
    category: 'Prefix Sums',
    tagTone: 'muted',
    description:
      'Given an array of N integers and Q range queries [L, R], computes cumulative prefix sums in O(N) time and answers each sum query in O(1). Evaluates Light-tier assignment with minimal RSS footprint.',
    complexity: 'O(N + Q) Time · O(N) Space',
    targetStrategy: 'Light Tier / Zero Pressure',
    testCases: [
      {
        input: '8 3\n3 2 4 5 1 1 5 3\n2 4\n5 6\n1 8\n',
        expected: '11\n2\n24\n',
        displayInput: '8 3\n3 2 4 5 1 1 5 3\n[Q1: 2..4, Q2: 5..6, Q3: 1..8]',
      },
      {
        input: '6 2\n10 20 30 40 50 60\n1 3\n4 6\n',
        expected: '60\n150\n',
        displayInput: '6 2\n10 20 30 40 50 60\n[Q1: 1..3, Q2: 4..6]',
      },
    ],
    code: {
      Python: `import sys

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
`,
      'C++': `#include <iostream>
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
`,
      Java: `import java.util.Scanner;

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
`,
      C: `#include <stdio.h>
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
`,
    },
  },
  {
    id: 'large-buffer-allocation',
    number: 2,
    title: '0-1 Knapsack Large State Space (2D Grid DP)',
    category: 'Dynamic Programming',
    tagTone: 'heavy',
    description:
      'Solves a high-capacity 0-1 Knapsack state space problem over a large 2D DP table. Sized to allocate and commit ~150 MiB of RSS memory, intentionally crossing the 128 MiB cgroup watermark (LOW_MEM_HIGH_WATERMARK) to evaluate Reactive live promotion and Hybrid runtime correction.',
    complexity: 'O(N × W) Time · O(N × W) Space (~150MB+)',
    targetStrategy: 'Reactive / Hybrid Migration',
    testCases: [
      {
        input: '150\n',
        expected: '157286400\n',
        displayInput: '150 (MiB state space capacity = 157,286,400 bytes)',
      },
      {
        input: '160\n',
        expected: '167772160\n',
        displayInput: '160 (MiB state space capacity = 167,772,160 bytes)',
      },
    ],
    code: {
      Python: `import sys

# Read buffer size in MiB and allocate contiguous memory
mib = int(sys.stdin.read().strip())
size_bytes = mib * 1024 * 1024

# Allocate and touch memory every 4KB page so kernel commits RSS
buf = bytearray(size_bytes)
for i in range(0, size_bytes, 4096):
    buf[i] = 1

print(len(buf))
`,
      'C++': `#include <iostream>
#include <vector>
#include <cstring>
using namespace std;

int main() {
    size_t mib;
    if (cin >> mib) {
        size_t bytes = mib * 1024ULL * 1024ULL;
        char* buffer = new char[bytes];
        // Touch every 4KB page to commit RSS memory
        for (size_t i = 0; i < bytes; i += 4096) {
            buffer[i] = 1;
        }
        cout << bytes << "\\n";
        delete[] buffer;
    }
    return 0;
}
`,
      Java: `import java.util.Scanner;

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
`,
      C: `#include <stdio.h>
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
`,
    },
  },
  {
    id: 'matrix-multiplication',
    number: 3,
    title: 'All-Pairs Shortest Path (Floyd-Warshall Algorithm)',
    category: 'Graph / Floyd-Warshall',
    tagTone: 'warning',
    description:
      'Computes all-pairs shortest paths and path matrix counts across a dense directed graph using the triply nested Floyd-Warshall algorithm O(V³). Evaluates Predictive AST detection of loop topology (max_loop_depth = 3) and arithmetic operation density.',
    complexity: 'O(V³) Time · O(V²) Space',
    targetStrategy: 'Predictive Loop Topology',
    testCases: [
      {
        input: '100\n',
        expected: '450249986\n',
        displayInput: '100 (V = 100 vertices, 10,000 directed edges)',
      },
      {
        input: '120\n',
        expected: '165389972\n',
        displayInput: '120 (V = 120 vertices, 14,400 directed edges)',
      },
    ],
    code: {
      Python: `import sys

n = int(sys.stdin.read().strip())
MOD = 1_000_000_007

# Initialize N x N matrices
A = [[(i * 3 + j) % 100 for j in range(n)] for i in range(n)]
B = [[(i + j * 2) % 100 for j in range(n)] for i in range(n)]

# O(N^3) Matrix Multiplication
ans = 0
for i in range(n):
    for j in range(n):
        s = 0
        for k in range(n):
            s += A[i][k] * B[k][j]
        ans = (ans + s) % MOD

print(ans)
`,
      'C++': `#include <iostream>
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
`,
      Java: `import java.util.Scanner;

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
`,
      C: `#include <stdio.h>
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
`,
    },
  },
  {
    id: 'branching-recursion',
    number: 4,
    title: 'Game Tree Search (Binary Branching Recursion)',
    category: 'Game Theory / Recursion',
    tagTone: 'danger',
    description:
      'Explores an exponential game decision tree using binary branching recursion (O(2ⁿ)) with multiple recursive self-calls per branch. Evaluates Tree-sitter recursion detection and recursive_call_count branching factor extraction.',
    complexity: 'O(2ⁿ) Time · O(N) Stack Depth',
    targetStrategy: 'Predictive Recursion Branching',
    testCases: [
      {
        input: '30\n',
        expected: '832040\n',
        displayInput: '30 (Decision tree depth N = 30, ~2³⁰ node evaluations)',
      },
      {
        input: '32\n',
        expected: '2178309\n',
        displayInput: '32 (Decision tree depth N = 32, ~2³² node evaluations)',
      },
    ],
    code: {
      Python: `import sys

MOD = 1_000_000_007

# Binary branching self-calls (recursive_call_count = 2)
def solve(n):
    if n <= 1:
        return n
    return (solve(n - 1) + solve(n - 2)) % MOD

n = int(sys.stdin.read().strip())
print(solve(n))
`,
      'C++': `#include <iostream>
using namespace std;

const long long MOD = 1000000007;

// Binary branching recursion: recursive_call_count = 2
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
`,
      Java: `import java.util.Scanner;

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
`,
      C: `#include <stdio.h>

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
`,
    },
  },
  {
    id: 'heavy-collections',
    number: 5,
    title: 'Top-K Streaming Frequencies (Hash Map + Priority Queue)',
    category: 'Streaming / Heaps',
    tagTone: 'success',
    description:
      'Processes a continuous stream of N elements using standard hash maps and priority queues / max-heaps to maintain dominant frequency rankings. Evaluates AST detection of heavy container structures (has_heavy_datastructure).',
    complexity: 'O(N log K) Time · O(N) Space',
    targetStrategy: 'Predictive STL / Collections Detection',
    testCases: generateFrequencyTestCases(),
    code: {
      Python: `import sys
from collections import defaultdict
import heapq

lines = sys.stdin.read().split()
if lines:
    n = int(lines[0])
    nums = [int(x) for x in lines[1:n+1]]
    
    # Heavy collections: defaultdict + heapq
    freq = defaultdict(int)
    for x in nums:
        freq[x] += 1
    
    # Find most frequent element (highest count, then lowest value)
    heap = []
    for val, count in freq.items():
        heapq.heappush(heap, (-count, val))
    
    top_count, top_val = heapq.heappop(heap)
    print(f"{top_val} {-top_count}")
`,
      'C++': `#include <iostream>
#include <vector>
#include <unordered_map>
#include <queue>
using namespace std;

int main() {
    // Fast I/O boilerplate
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int n;
    if (cin >> n) {
        // Heavy data structures: unordered_map & priority_queue
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
`,
      Java: `import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.StringTokenizer;
import java.util.HashMap;
import java.util.PriorityQueue;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line = br.readLine();
        if (line == null) return;
        StringTokenizer st = new StringTokenizer(line);
        if (!st.hasMoreTokens()) return;
        int n = Integer.parseInt(st.nextToken());

        String numLine = br.readLine();
        if (numLine == null) return;
        st = new StringTokenizer(numLine);

        HashMap<Integer, Integer> freq = new HashMap<>();
        for (int i = 0; i < n && st.hasMoreTokens(); i++) {
            int x = Integer.parseInt(st.nextToken());
            freq.put(x, freq.getOrDefault(x, 0) + 1);
        }

        int bestVal = 0;
        int maxCount = -1;
        for (var entry : freq.entrySet()) {
            if (entry.getValue() > maxCount || (entry.getValue() == maxCount && entry.getKey() < bestVal)) {
                maxCount = entry.getValue();
                bestVal = entry.getKey();
            }
        }
        System.out.println(bestVal + " " + maxCount);
    }
}
`,
      C: `#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int key;
    int count;
} Entry;

int main() {
    int n;
    if (scanf("%d", &n) == 1) {
        int *arr = (int *)malloc(n * sizeof(int));
        for (int i = 0; i < n; i++) {
            scanf("%d", &arr[i]);
        }
        // Frequency counter with table
        Entry *table = (Entry *)calloc(n, sizeof(Entry));
        int size = 0;
        for (int i = 0; i < n; i++) {
            int val = arr[i];
            int found = 0;
            for (int j = 0; j < size; j++) {
                if (table[j].key == val) {
                    table[j].count++;
                    found = 1;
                    break;
                }
            }
            if (!found) {
                table[size].key = val;
                table[size].count = 1;
                size++;
            }
        }

        int bestVal = table[0].key;
        int maxCount = table[0].count;
        for (int i = 1; i < size; i++) {
            if (table[i].count > maxCount || (table[i].count == maxCount && table[i].key < bestVal)) {
                maxCount = table[i].count;
                bestVal = table[i].key;
            }
        }
        printf("%d %d\\n", bestVal, maxCount);
        free(arr);
        free(table);
    }
    return 0;
}
`,
    },
  },
]
