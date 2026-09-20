mod docker;
mod models;
mod moderator;
mod policy;
mod predict;
mod queue;

use axum::{
    Json, Router,
    routing::{get, post},
};
use models::{HealthCheck, JudgeResult, Submission};
use policy::TierPolicy;
use queue::{start, submit};
use tower_http::cors::{Any, CorsLayer};

async fn health_check() -> Json<HealthCheck> {
    println!("[HEALTH CHECK] Returned Status OK");
    return Json(HealthCheck {
        status: String::from("OK"),
    });
}

async fn judge(submission: Submission, policy: &(dyn TierPolicy + Send + Sync)) -> JudgeResult {
    let tier = policy.initial_tier(&submission);
    let tier_started = tier.name().to_string();
    let start = std::time::Instant::now();
    let outcome = match docker::run_submission(&submission, &tier, policy, start).await {
        Ok(o) => o,
        Err(e) => {
            println!("{}", e.to_string());
            return JudgeResult {
                submission_id: submission.id.clone(),
                approach: policy.name().to_string(),
                verdict: "SE".to_string(),
                cpu_time_ms: 0,
                peak_memory_bytes: 0,
                allocated_memory_bytes: 0,
                wall_time_ms: 0,
                tier_started,
                tier_promoted: false,
                promotion_time_ms: 0,
                cases: vec![],
            };
        }
    };
    let wall_ms = start.elapsed().as_millis() as u64;
    let cpu_ms = outcome.results.iter().map(|c| c.cpu_time_ms).sum();
    let mem = outcome
        .results
        .iter()
        .map(|c| c.peak_memory_bytes)
        .max()
        .unwrap_or(0);
    let allocated_mem = if outcome.tier_promoted || tier == policy::Tier::High {
        0
    } else {
        docker::LOW_MEM_HARD_LIMIT
    };
    let verdict = outcome
        .results
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
        allocated_memory_bytes: allocated_mem,
        wall_time_ms: wall_ms,
        tier_started,
        tier_promoted: outcome.tier_promoted,
        promotion_time_ms: outcome.promotion_time_ms,
        cases: outcome.results,
    }
}

#[tokio::main]
async fn main() -> Result<(), std::io::Error> {
    // Ensure native Docker engine is used so host cgroups are directly accessible
    if std::path::Path::new("/var/run/docker.sock").exists() {
        unsafe {
            std::env::set_var("DOCKER_CONTEXT", "default");
        }
    }
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
        .route("/health", get(health_check))
        .layer(cors)
        .with_state(start());
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Judge is online and listening on :3000");
    axum::serve(listener, app).await.unwrap();
    Ok(())
}
