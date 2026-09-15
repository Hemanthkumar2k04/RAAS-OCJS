//! Direct host-side access to a container's cgroup v2 directory.
//!
//! A Docker container is just a process living inside a cgroup. On a native
//! Linux Docker setup (systemd cgroup driver) each running container has a
//! directory such as `/sys/fs/cgroup/system.slice/docker-<id>.scope/`. The
//! files inside it are plain kernel files: reading them reports live usage,
//! writing them changes limits. Because these files are reachable from the
//! *host* with plain file I/O (no Docker daemon round-trip) we can raise a
//! container's limits sub-millisecond the moment it reports memory pressure.
//!
//! This module is deliberately **pure / injectable**: every operation is bound
//! to a `path` that the caller supplies, so the whole core is unit-testable
//! against a scratch directory of fake cgroup files. Only
//! [`locate_cgroup_dir`] talks to the `docker` CLI, once per submission.
//!
//! cgroup v2 file facts used here (verified on a cgroup v2 host):
//! - `memory.events`   -> space separated `low/high/max/oom/oom_kill/...` counters.
//! - `memory.high`/`memory.max` -> bytes, or the token `max` (= unlimited).
//! - `cpu.max`         -> `"<quota> <period>"` (quota may be `max`).

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Where the cgroup v2 filesystem is mounted on this host.
pub const CGROUP_FS_ROOT: &str = "/sys/fs/cgroup";

/// The token cgroup v2 uses for "no limit".
pub const UNLIMITED: &str = "max";

/// A handle to a cgroup v2 directory, reached directly through the host fs.
#[derive(Clone, Debug)]
pub struct CGroup {
    path: PathBuf,
}

impl CGroup {
    /// Wrap a cgroup directory path. The path may point at a real cgroup or at
    /// a scratch directory in tests - the file names are identical either way.
    pub fn new(path: impl Into<PathBuf>) -> Self {
        CGroup { path: path.into() }
    }

    /// The on-disk directory this handle manages.
    #[allow(dead_code)] // stable API surface (verification / tools)
    pub fn path(&self) -> &Path {
        &self.path
    }

    fn read(&self, name: &str) -> io::Result<String> {
        std::fs::read_to_string(self.path.join(name))
    }

    fn read_size(&self, name: &str) -> io::Result<u64> {
        parse_size(&self.read(name)?)
    }

    /// Read `memory.events`: monotonic counters keyed by event name
    /// (e.g. `high`, `max`, `oom`, `oom_kill`). Unknown lines are skipped.
    pub fn memory_events(&self) -> io::Result<HashMap<String, u64>> {
        let mut map = HashMap::new();
        for line in self.read("memory.events")?.lines() {
            let mut it = line.split_whitespace();
            if let (Some(key), Some(value)) = (it.next(), it.next()) {
                if let Ok(n) = value.parse::<u64>() {
                    map.insert(key.to_string(), n);
                }
            }
        }
        Ok(map)
    }

    /// Current memory usage of the cgroup, in bytes.
    pub fn memory_current(&self) -> io::Result<u64> {
        self.read_size("memory.current")
    }

    /// Highest memory usage since the cgroup was created, in bytes.
    /// NOTE: cgroup v2 allows resetting this by writing to the file, but that
    /// proved non-functional in our environment, so per-case peak is obtained
    /// by sampling [`Self::memory_current`] instead.
    #[allow(dead_code)] // verification probe helper
    pub fn memory_peak(&self) -> io::Result<u64> {
        self.read_size("memory.peak")
    }

    /// The current soft limit (`memory.high`) if set; `None` when unlimited.
    #[allow(dead_code)] // verification / tooling helper
    pub fn memory_high(&self) -> io::Result<Option<u64>> {
        parse_optional_size(&self.read("memory.high")?)
    }

    /// Raise the soft memory limit to a finite byte count.
    pub fn set_memory_high(&self, bytes: u64) -> io::Result<()> {
        std::fs::write(self.path.join("memory.high"), bytes.to_string())
    }

    /// Raise the hard memory limit to a finite byte count.
    #[allow(dead_code)] // used when bounded (non-unlimited) tiers are configured
    pub fn set_memory_max(&self, bytes: u64) -> io::Result<()> {
        std::fs::write(self.path.join("memory.max"), bytes.to_string())
    }

    /// Lift the soft memory limit to `max` (no limit).
    pub fn raise_memory_high(&self) -> io::Result<()> {
        std::fs::write(self.path.join("memory.high"), format!("{UNLIMITED}\n"))
    }

    /// Lift the hard memory limit to `max` (no limit).
    pub fn raise_memory_max(&self) -> io::Result<()> {
        std::fs::write(self.path.join("memory.max"), format!("{UNLIMITED}\n"))
    }

    /// Promote a Low-tier container to the same (unlimited) ceiling that a
    /// High-tier start already has: lift both memory limits to `max`.
    ///
    /// CPU is intentionally left untouched - promotion is memory-only for now
    /// (see README: CPU-based promotion is a later follow-up).
    pub fn promote_to_unlimited(&self) -> io::Result<()> {
        self.raise_memory_high()?;
        self.raise_memory_max()
    }

    /// Set the CPU cap. `quota: None` means `max` (uncapped); `period` is in
    /// microseconds. A quota of `200_000` over a `100_000` µs period is 2 CPUs.
    #[allow(dead_code)] // reserved for the CPU-based promotion follow-up
    pub fn set_cpu_max(&self, quota: Option<u64>, period: u64) -> io::Result<()> {
        let q = match quota {
            Some(q) => q.to_string(),
            None => UNLIMITED.to_string(),
        };
        std::fs::write(self.path.join("cpu.max"), format!("{q} {period}\n"))
    }
}

/// Parse a cgroup byte value; the token `max` is an error here (not finite).
pub fn parse_size(s: &str) -> io::Result<u64> {
    let t = s.trim();
    if t.is_empty() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "empty cgroup value",
        ));
    }
    if t == UNLIMITED {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("{t:?} is not a finite byte count"),
        ));
    }
    t.parse::<u64>()
        .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, format!("invalid byte count {t:?}")))
}

/// Parse a cgroup byte value, mapping the `max` token to `None`.
#[allow(dead_code)] // used by `memory_high`
pub fn parse_optional_size(s: &str) -> io::Result<Option<u64>> {
    let t = s.trim();
    if t == UNLIMITED {
        Ok(None)
    } else {
        parse_size(t).map(Some)
    }
}

/// Discover the host cgroup directory of a running Docker container.
///
/// Preferred route: read `/proc/<container-init-pid>/cgroup` (the same line the
/// judge's spec relies on). The returned path is the *actual* mount path, so it
/// works regardless of systemd vs cgroupfs layout. Falls back to deriving the
/// systemd scope name (`/sys/fs/cgroup/system.slice/docker-<id>.scope`) from
/// `docker inspect` when the first route fails.
///
/// Call this once per submission, never in the hot loop.
pub fn locate_cgroup_dir(container: &str) -> io::Result<PathBuf> {
    // 1) Container init PID -> /proc/<pid>/cgroup -> mount-relative path.
    let out = Command::new("docker")
        .args(["inspect", "--format", "{{.State.Pid}}", container])
        .output()?;
    if out.status.success() {
        let pid = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !pid.is_empty() {
            if let Ok(data) = std::fs::read_to_string(format!("/proc/{pid}/cgroup")) {
                for line in data.lines() {
                    // cgroup v2 line: "0::/system.slice/docker-<id>.scope"
                    let Some((_, rel)) = line.split_once("::") else { continue };
                    let rel = rel.trim();
                    if !rel.starts_with('/') {
                        continue;
                    }
                    let dir = PathBuf::from(CGROUP_FS_ROOT).join(rel.trim_start_matches('/'));
                    if dir.join("memory.events").is_file() {
                        return Ok(dir);
                    }
                }
            }
        }
    }

    // 2) Fallback: derive cgroup path from full container id across common layouts.
    let out = Command::new("docker")
        .args(["inspect", "--format", "{{.Id}}", container])
        .output()?;
    if out.status.success() {
        let id = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !id.is_empty() {
            let root = PathBuf::from(CGROUP_FS_ROOT);
            let candidates = [
                root.join("system.slice").join(format!("docker-{id}.scope")),
                root.join(format!("docker-{id}.scope")),
                root.join("docker").join(&id),
                root.join(&id),
            ];
            for dir in candidates {
                if dir.join("memory.current").is_file() || dir.join("memory.events").is_file() {
                    return Ok(dir);
                }
            }
        }
    }

    Err(io::Error::new(
        io::ErrorKind::NotFound,
        format!("could not locate a cgroup dir for container {container}"),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A scratch directory standing in for a real cgroup dir.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "raas_cgroup_test_{}_{}",
            std::process::id(),
            name
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("create scratch cgroup dir");
        dir
    }

    #[test]
    fn parses_memory_events() {
        let dir = scratch("events");
        std::fs::write(dir.join("memory.events"), "low 0\nhigh 3\nmax 1\noom 0\noom_kill 1\n").unwrap();
        let cg = CGroup::new(&dir);
        let events = cg.memory_events().unwrap();
        assert_eq!(events.get("high"), Some(&3));
        assert_eq!(events.get("oom_kill"), Some(&1));
        assert_eq!(events.get("low"), Some(&0));
        assert_eq!(events.len(), 5);
    }

    #[test]
    fn parses_sizes_and_max_token() {
        assert_eq!(parse_size("12345\n").unwrap(), 12345);
        assert!(parse_size("max").is_err());
        assert_eq!(parse_optional_size("max").unwrap(), None);
        assert_eq!(parse_optional_size("512\n").unwrap(), Some(512));

        let dir = scratch("sizes");
        std::fs::write(dir.join("memory.high"), "max\n").unwrap();
        std::fs::write(dir.join("memory.current"), "268435456\n").unwrap();
        std::fs::write(dir.join("memory.peak"), "123456789\n").unwrap();
        let cg = CGroup::new(&dir);
        assert_eq!(cg.memory_high().unwrap(), None);
        assert_eq!(cg.memory_current().unwrap(), 268435456);
        assert_eq!(cg.memory_peak().unwrap(), 123456789);
    }

    #[test]
    fn setters_write_expected_values() {
        let dir = scratch("setters");
        for f in ["memory.high", "memory.max", "cpu.max"] {
            std::fs::write(dir.join(f), "max\n").unwrap();
        }
        let cg = CGroup::new(&dir);

        cg.set_memory_high(134_217_728).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("memory.high")).unwrap().trim(), "134217728");

        cg.set_memory_max(268_435_456).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("memory.max")).unwrap().trim(), "268435456");

        cg.promote_to_unlimited().unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("memory.high")).unwrap().trim(), "max");
        assert_eq!(std::fs::read_to_string(dir.join("memory.max")).unwrap().trim(), "max");

        cg.set_cpu_max(Some(200_000), 100_000).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("cpu.max")).unwrap().trim(), "200000 100000");

        cg.set_cpu_max(None, 100_000).unwrap();
        assert_eq!(std::fs::read_to_string(dir.join("cpu.max")).unwrap().trim(), "max 100000");
    }

    #[test]
    fn raises_limits_individually() {
        let dir = scratch("raise");
        std::fs::write(dir.join("memory.high"), "134217728\n").unwrap();
        std::fs::write(dir.join("memory.max"), "134217728\n").unwrap();
        let cg = CGroup::new(&dir);
        cg.raise_memory_high().unwrap();
        assert_eq!(cg.memory_high().unwrap(), None);
        cg.raise_memory_max().unwrap();
        assert_eq!(
            std::fs::read_to_string(dir.join("memory.max")).unwrap().trim(),
            "max"
        );
    }

    #[test]
    fn missing_file_errors_cleanly() {
        let dir = scratch("missing");
        let cg = CGroup::new(&dir);
        assert!(cg.memory_current().is_err());
        assert!(cg.memory_events().is_err());
    }
}
