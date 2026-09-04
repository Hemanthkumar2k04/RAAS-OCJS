mod docker;
mod models;
mod policy;
mod predict;
mod queue;

use axum::{Json, Router, routing::post};
use models::{CaseResult, JudgeResult, Submission, TestCase};
use policy::TierPolicy;
use queue::{start, submit};
use tower_http::cors::{Any, CorsLayer};

async fn judge(submission: Submission, policy: &(dyn TierPolicy + Send + Sync)) -> JudgeResult {
    let tier = policy.initial_tier(&submission);
    let tier_started = tier.name().to_string();
    let start = std::time::Instant::now();
    let cases = match docker::run_submission(&submission, &tier).await {
        Ok(c) => c,
        Err(e) => {
            println!("{}", e.to_string());
            return JudgeResult {
                submission_id: submission.id.clone(),
                approach: policy.name().to_string(),
                verdict: "SE".to_string(),
                cpu_time_ms: 0,
                peak_memory_bytes: 0,
                wall_time_ms: 0,
                tier_started,
                tier_promoted: false,
                promotion_time_ms: 0,
                cases: vec![],
            };
        }
    };
    let wall_ms = start.elapsed().as_millis() as u64;
    let cpu_ms = cases.iter().map(|c| c.cpu_time_ms).sum();
    let mem = cases.iter().map(|c| c.peak_memory_bytes).max().unwrap_or(0);
    let verdict = cases
        .iter()
        .find(|c| c.verdict != "AC")
        .map(|c| c.verdict.as_str())
        .unwrap_or("AC");
    JudgeResult {
        submission_id: submission.id.clone(),
        approach: policy.name().to_string(),
        verdict: verdict.to_string(),
        cpu_time_ms: cpu_ms,
        peak_memory_bytes: mem,
        wall_time_ms: wall_ms,
        tier_started,
        tier_promoted: false,
        promotion_time_ms: 0,
        cases: cases,
    }
}

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    let info = tokio::process::Command::new("docker")
        .arg("info")
        .output()
        .await;
    match info {
        Ok(o) if o.status.success() => {}
        _ => return Err(std::io::Error::other("Docker is not running")),
    }
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods(Any);
    let app = Router::new()
        .route("/submit", post(submit))
        .layer(cors)
        .with_state(start());
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Judge is online and listening on :3000");
    axum::serve(listener, app).await.unwrap();
    Ok(())
}
