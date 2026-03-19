use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum JobType {
    Transcribe,
    Download,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobEvent {
    pub id: String,
    pub job_type: JobType,
    pub status: JobStatus,
    pub episode_id: String,
    pub episode_title: String,
    pub progress: f64,
    pub error: Option<String>,
}

pub struct JobEntry {
    pub id: String,
    pub job_type: JobType,
    pub episode_id: String,
    pub episode_title: String,
    pub cancel_token: CancellationToken,
    #[allow(dead_code)]
    pub handle: JoinHandle<()>,
}

pub struct JobRegistry {
    jobs: HashMap<String, JobEntry>,
}

impl JobRegistry {
    pub fn new() -> Self {
        Self {
            jobs: HashMap::new(),
        }
    }

    pub fn insert(&mut self, entry: JobEntry) {
        self.jobs.insert(entry.id.clone(), entry);
    }

    pub fn remove(&mut self, id: &str) -> Option<JobEntry> {
        self.jobs.remove(id)
    }

    pub fn get(&self, id: &str) -> Option<&JobEntry> {
        self.jobs.get(id)
    }

    pub fn has_active_job_for_episode(&self, episode_id: &str, job_type: &JobType) -> bool {
        self.jobs.values().any(|j| {
            j.episode_id == episode_id && j.job_type == *job_type
        })
    }

    pub fn list_active(&self) -> Vec<JobEvent> {
        self.jobs
            .values()
            .map(|j| JobEvent {
                id: j.id.clone(),
                job_type: j.job_type.clone(),
                status: JobStatus::Running,
                episode_id: j.episode_id.clone(),
                episode_title: j.episode_title.clone(),
                progress: 0.0,
                error: None,
            })
            .collect()
    }
}
