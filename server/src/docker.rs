use crate::models::{CaseResult, Submission, TestCase};
use crate::moderator::{CGroup, locate_cgroup_dir};
use crate::policy::{MonitorSignal, Tier, TierPolicy};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::{self, AsyncWriteExt};
use tokio::process::Command;

/// Soft memory watermark (bytes) written to `memory.high` for a Low-tier start.
///
/// Docker's `--memory=256m` sets `memory.max` (the hard OOM boundary) but does
/// *not* set `memory.high`. The kernel only counts `high` pressure events when
/// `memory.high` is configured, so the judge writes this watermark itself. It
/// sits well below the hard limit, giving the reactive monitor a chance to
/// promote a heavy submission *before* it can be OOM-killed.
const LOW_MEM_HIGH_WATERMARK: u64 = 128 * 1024 * 1024; // 128 MiB (tunable)

/// How often the monitor re-reads the cgroup files while a test case runs.
/// Reading a cgroup file is sub-millisecond; `memory.events` counters are
/// monotonic, so reaction latency is bounded by this poll even if a spike is
/// shorter than the interval.
const MONITOR_POLL: Duration = Duration::from_millis(2);

fn image_for(language: &str) -> &'static str {
    match language {
        "python" => "python-judge-runtime",
        "java" => "java-judge-runtime",
        "c" | "cpp" | "c++" => "cpp-judge-runtime",
        _ => "python-judge-runtime",
    }
}

fn source_filename(language: &str) -> &'static str {
    match language {
        "python" => "main.py",
        "cpp" | "c++" => "main.cpp",
        "c" => "main.c",
        "java" => "Main.java",
        _ => "main.py",
    }
}

fn write_source(submission: &Submission) -> std::io::Result<std::path::PathBuf> {
    let dir = std::env::temp_dir().join(format!("oj_{}", submission.id));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir(&dir)?;
    std::fs::write(
        dir.join(source_filename(&submission.language)),
        &submission.source,
    )?;
    Ok(dir)
}

fn get_tier_limits(tier: &Tier) -> Vec<String> {
    match tier {
        // Low starts bounded (1 CPU / 256 MiB). `Tier::High` is unlimited today,
        // which is also the ceiling Reactive/Hybrid promote to (see moderator.rs).
        Tier::Low => vec!["--cpus=1".to_string(), "--memory=256m".to_string()],
        _ => vec![],
    }
}

/// What a full submission run produced, beyond the per-case verdicts.
pub struct RunOutcome {
    pub results: Vec<CaseResult>,
    pub tier_promoted: bool,
    pub promotion_time_ms: u64,
}

/// Execute one test case inside the running container and stream its input.
/// Takes owned arguments so it can run on a `'static` spawned task while the
/// caller concurrently watches the container's cgroup.
async fn exec_case(args: Vec<String>, input: String) -> io::Result<std::process::Output> {
    let mut child = Command::new("docker")
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("docker exec failed");
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input.as_bytes()).await?;
        drop(stdin); // close -> program sees EOF
    }
    child.wait_with_output().await
}

/// Run one test case while a monitor polls the container's cgroup.
///
/// The `docker exec` runs in a spawned task; meanwhile, on a ~2 ms tick we:
///   1. track the `memory.events` `high` counter delta, and if the policy is
///      watching and says promote, lift the container's memory limits to
///      `max` once (recording the promotion wall-clock time);
///   2. sample `memory.current` to approximate this case's peak (cgroup
///      `memory.peak` is not resettable in our environment, so we cannot
///      reset-and-read it per case).
#[allow(clippy::too_many_arguments)]
async fn run_case_monitored(
    container: &str,
    run_cmd: &[String],
    test: &TestCase,
    cg: Option<&CGroup>,
    watch: bool,
    policy: &(dyn TierPolicy + Send + Sync),
    started: Instant,
    promoted: &mut bool,
    promotion_time_ms: &mut u64,
) -> io::Result<CaseResult> {
    let case_start = Instant::now();

    // Owned copies so the exec task can be spawned with 'static data.
    let mut args = vec!["exec".to_string(), "-i".to_string(), container.to_string()];
    args.extend(run_cmd.iter().cloned());
    let input = test.input.clone();
    let mut exec_task = tokio::spawn(exec_case(args, input));

    // Baseline per case: the first sample only records the counter, later
    // samples compare against it so leftover events from a previous case can
    // never trigger a spurious promotion.
    let mut last_high: Option<u64> = None;
    let mut case_peak: u64 = 0;
    let mut poll = tokio::time::interval(MONITOR_POLL); // first tick fires immediately

    let output = loop {
        tokio::select! {
            _ = poll.tick() => {
                if let Some(cg) = cg {
                    // Reactive trigger: did the kernel cross the soft watermark?
                    if watch && !*promoted {
                        if let Ok(events) = cg.memory_events() {
                            let high = events.get("high").copied().unwrap_or(0);
                            let crossed = last_high.map_or(false, |prev| high > prev);
                            last_high = Some(high);
                            if crossed {
                                let mem_current = cg.memory_current().unwrap_or(0);
                                let signal =
                                    MonitorSignal::new(mem_current, LOW_MEM_HIGH_WATERMARK, true);
                                if policy.should_promote(&signal) {
                                    let _ = cg.promote_to_unlimited();
                                    *promoted = true;
                                    *promotion_time_ms = started.elapsed().as_millis() as u64;
                                }
                            }
                        }
                    }
                    // Per-case peak estimate (cheap read every tick).
                    if let Ok(cur) = cg.memory_current() {
                        if cur > case_peak {
                            case_peak = cur;
                        }
                    }
                }
            }
            res = &mut exec_task => {
                break res??;
            }
        }
    };

    let wall_ms = case_start.elapsed().as_millis() as u64;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let expected = test.expected.trim().to_string();
    let verdict = if !output.status.success() {
        "RE"
    } else if stdout == expected {
        "AC"
    } else {
        "WA"
    };
    Ok(CaseResult {
        verdict: verdict.to_string(),
        cpu_time_ms: wall_ms,
        peak_memory_bytes: case_peak,
    })
}

/// Run every test case of a submission in its container, watching and, when the
/// policy is reactive/hybrid, promoting the container live on memory pressure.
pub async fn run_submission(
    submission: &Submission,
    tier: &Tier,
    policy: &(dyn TierPolicy + Send + Sync),
    started: Instant,
) -> io::Result<RunOutcome> {
    let host_dir = write_source(submission)?;
    let result = submission_inner(submission, tier, policy, started, &host_dir).await;
    // host_dir is a temp dir; always clean it up, success or not.
    let _ = std::fs::remove_dir_all(&host_dir);
    result
}

async fn submission_inner(
    submission: &Submission,
    tier: &Tier,
    policy: &(dyn TierPolicy + Send + Sync),
    started: Instant,
    host_dir: &std::path::Path,
) -> io::Result<RunOutcome> {
    let (container, run_cmd) =
        start_and_compile(&submission.language, &submission.id, host_dir, tier).await?;

    // Locate the container's cgroup directory once for the whole submission.
    let can_promote = policy.can_promote();
    let cg = match locate_cgroup_dir(&container) {
        Ok(dir) => {
            let cg = CGroup::new(dir);
            // Arm the soft watermark so a Low-tier start can emit pressure
            // events (only meaningful when this policy can promote).
            if can_promote && *tier == Tier::Low {
                if let Err(e) = cg.set_memory_high(LOW_MEM_HIGH_WATERMARK) {
                    eprintln!(
                        "[moderator] failed to arm memory.high for {container}: {e}"
                    );
                }
            }
            Some(cg)
        }
        Err(e) => {
            eprintln!(
                "[moderator] cgroup not reachable for {container} ({e}); \
                 live promotion + peak metrics disabled for this submission"
            );
            None
        }
    };

    // Only arm/watch promotion when a Low start + a reactive-style policy + a
    // reachable cgroup all hold; otherwise the exec runs exactly as before.
    let watch = can_promote && *tier == Tier::Low && cg.is_some();

    let mut results = Vec::new();
    let mut promoted = false;
    let mut promotion_time_ms = 0u64;

    for test in &submission.test_cases {
        let case = run_case_monitored(
            &container,
            &run_cmd,
            test,
            cg.as_ref(),
            watch,
            policy,
            started,
            &mut promoted,
            &mut promotion_time_ms,
        )
        .await;
        match case {
            Ok(c) => results.push(c),
            Err(e) => {
                let _ = Command::new("docker")
                    .args(["rm", "-f", &container])
                    .output()
                    .await;
                return Err(e);
            }
        }
    }

    let _ = Command::new("docker")
        .args(["rm", "-f", &container])
        .output()
        .await;
    Ok(RunOutcome {
        results,
        tier_promoted: promoted,
        promotion_time_ms,
    })
}

async fn start_and_compile(
    language: &str,
    submission_id: &String,
    host_dir: &std::path::Path,
    tier: &Tier,
) -> std::io::Result<(String, Vec<String>)> {
    let image = image_for(language);
    let cname = format!("oj_{}", submission_id);

    let _ = Command::new("docker")
        .args(["rm", "-f", &cname])
        .output()
        .await;

    let run_cmd = match language {
        "python" => vec!["python3".to_string(), "/app/main.py".to_string()],
        "java" => vec![
            "java".to_string(),
            "-cp".to_string(),
            "/app".to_string(),
            "Main".to_string(),
        ],
        "c" | "cpp" | "c++" => vec!["/app/run".to_string()],
        _ => vec![],
    };
    let tier_limits = get_tier_limits(tier);
    let mut start_args = vec![
        "run".to_string(),
        "-d".to_string(),
        "--name".to_string(),
        cname.to_string(),
        "--network=none".to_string(),
    ];
    start_args.extend(tier_limits);
    start_args.extend([
        image.to_string(),
        "sh".to_string(),
        "-c".to_string(),
        "sleep infinity".to_string(),
    ]);
    let start = Command::new("docker").args(start_args).output().await;
    if !start?.status.success() {
        return Err(std::io::Error::other("Error in starting containers"));
    }
    let source_file = source_filename(language);
    let cp = Command::new("docker")
        .args([
            "cp",
            &format!("{}/{}", host_dir.display(), source_file),
            &format!("{}:/app/{}", cname, source_file),
        ])
        .output()
        .await?;
    if !cp.status.success() {
        let _ = Command::new("docker")
            .args(["rm", "-f", &cname])
            .output()
            .await?;
        return Err(std::io::Error::other(
            String::from_utf8_lossy(&cp.stderr).to_string(),
        ));
    }

    let compile_cmd: &[&str] = match language {
        "java" => &["sh", "-c", "javac /app/Main.java -d /app"],
        "c" => &["sh", "-c", "gcc -o /app/run /app/main.c"],
        "cpp" | "c++" => &["sh", "-c", "g++ -o /app/run /app/main.cpp"],
        _ => &[],
    };
    if !compile_cmd.is_empty() {
        let comp = Command::new("docker")
            .args(["exec", &cname])
            .args(compile_cmd)
            .output()
            .await?;
        if !comp.status.success() {
            let _ = Command::new("docker")
                .args(["rm", "-f", &cname])
                .output()
                .await?;
            return Err(std::io::Error::other(
                String::from_utf8_lossy(&comp.stderr).to_string(),
            ));
        }
    }

    Ok((cname.clone(), run_cmd))
}
