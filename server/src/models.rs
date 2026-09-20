use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct Submission {
    pub id: String,
    pub language: String,
    pub source: String,
    pub test_cases: Vec<TestCase>,
    pub approach: String,
}

#[derive(Serialize)]
pub struct JudgeResult {
    pub submission_id: String,
    pub approach: String,
    pub verdict: String,
    pub cpu_time_ms: u64,
    pub peak_memory_bytes: u64,
    pub allocated_memory_bytes: u64,
    pub wall_time_ms: u64,
    pub tier_started: String,
    pub tier_promoted: bool,
    pub promotion_time_ms: u64,
    pub cases: Vec<CaseResult>,
}

#[derive(Deserialize)]
pub struct TestCase {
    pub input: String,
    pub expected: String,
}

#[derive(Serialize)]
pub struct CaseResult {
    pub verdict: String,
    pub cpu_time_ms: u64,
    pub peak_memory_bytes: u64,
    pub allocated_memory_bytes: u64,
}

#[derive(Serialize)]
pub struct HealthCheck {
    pub status: String,
}
