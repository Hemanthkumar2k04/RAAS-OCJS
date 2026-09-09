use crate::models::Submission;

pub type BoxedPolicy = Box<dyn TierPolicy + Send + Sync + 'static>;
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tier {
    Low,
    High,
}
impl Tier {
    pub fn name(&self) -> &'static str {
        match self {
            Tier::Low => "low",
            Tier::High => "high",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct MonitorSignal {
    pub mem_current: u64,
    pub mem_high: u64,
    pub crossed_high: bool,
}

impl MonitorSignal {
    /// Build a signal from live cgroup samples taken by the runner.
    pub fn new(mem_current: u64, mem_high: u64, crossed_high: bool) -> Self {
        Self {
            mem_current,
            mem_high,
            crossed_high,
        }
    }
}

pub trait TierPolicy {
    fn name(&self) -> &str;
    fn initial_tier(&self, sub: &Submission) -> Tier;
    fn should_promote(&self, signal: &MonitorSignal) -> bool;
    /// Whether this strategy ever reacts by migrating a running submission up.
    /// Only reactive-style policies return `true`; the runner uses it to decide
    /// whether to arm the cgroup soft watermark and watch for memory pressure.
    fn can_promote(&self) -> bool {
        false
    }
}

struct BaselinePolicy;
impl TierPolicy for BaselinePolicy {
    fn name(&self) -> &str {
        "baseline"
    }
    fn initial_tier(&self, _sub: &Submission) -> Tier {
        Tier::High
    }
    fn should_promote(&self, _signal: &MonitorSignal) -> bool {
        false
    }
}

struct PredictivePolicy;
impl TierPolicy for PredictivePolicy {
    fn name(&self) -> &str {
        "Predictive"
    }
    fn initial_tier(&self, sub: &Submission) -> Tier {
        super::predict::predict_tier(&sub.source, &sub.language)
    }
    fn should_promote(&self, _signal: &MonitorSignal) -> bool {
        false
    }
}

struct ReactivePolicy;
impl TierPolicy for ReactivePolicy {
    fn name(&self) -> &str {
        "Reactive"
    }
    fn initial_tier(&self, _sub: &Submission) -> Tier {
        Tier::Low
    }
    fn should_promote(&self, signal: &MonitorSignal) -> bool {
        signal.crossed_high
    }
    fn can_promote(&self) -> bool {
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sig(crossed_high: bool) -> MonitorSignal {
        MonitorSignal::new(200 * 1024 * 1024, 128 * 1024 * 1024, crossed_high)
    }

    fn sub(language: &str, source: &str) -> Submission {
        Submission {
            id: "t".to_string(),
            language: language.to_string(),
            source: source.to_string(),
            test_cases: vec![],
            approach: "".to_string(),
        }
    }

    #[test]
    fn reactive_and_hybrid_promote_on_crossed_high() {
        let reactive = policy_for("reactive");
        assert!(reactive.can_promote());
        assert!(reactive.should_promote(&sig(true)));
        assert!(!reactive.should_promote(&sig(false)));

        let hybrid = policy_for("hybrid");
        assert!(hybrid.can_promote());
        assert!(hybrid.should_promote(&sig(true)));
        assert!(!hybrid.should_promote(&sig(false)));
    }

    #[test]
    fn baseline_and_predictive_never_promote() {
        let baseline = policy_for("baseline");
        assert!(!baseline.can_promote());
        assert!(!baseline.should_promote(&sig(true)));

        let predictive = policy_for("predictive");
        assert!(!predictive.can_promote());
        assert!(!predictive.should_promote(&sig(true)));
    }

    #[test]
    fn initial_tiers_match_intent() {
        // Baseline is always heavy; reactive always starts light.
        assert_eq!(policy_for("baseline").initial_tier(&sub("python", "print(1)")), Tier::High);
        assert_eq!(policy_for("reactive").initial_tier(&sub("python", "print(1)")), Tier::Low);
        // Unknown approach falls back to baseline.
        assert_eq!(policy_for("nope").name(), "baseline");
    }

    #[test]
    fn signal_constructor_round_trips() {
        let s = MonitorSignal::new(1, 2, true);
        assert_eq!(s.mem_current, 1);
        assert_eq!(s.mem_high, 2);
        assert!(s.crossed_high);
    }
}

struct HybridPolicy;
impl TierPolicy for HybridPolicy {
    fn name(&self) -> &str {
        "Hybrid"
    }
    fn initial_tier(&self, sub: &Submission) -> Tier {
        super::predict::predict_tier(&sub.source, &sub.language)
    }
    fn should_promote(&self, signal: &MonitorSignal) -> bool {
        signal.crossed_high
    }
    fn can_promote(&self) -> bool {
        true
    }
}

pub fn policy_for(name: &str) -> BoxedPolicy {
    match name {
        "predictive" => Box::new(PredictivePolicy),
        "reactive" => Box::new(ReactivePolicy),
        "hybrid" => Box::new(HybridPolicy),
        _ => Box::new(BaselinePolicy),
    }
}
