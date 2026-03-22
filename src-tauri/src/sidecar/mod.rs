use tokio::process::Child;

/// Manages a spaCy sidecar process for NLP analysis.
pub struct SpacySidecar {
    child: Child,
}

impl SpacySidecar {
    /// Spawn a spaCy sidecar process.
    pub fn spawn(python_path: &str, script_path: &str) -> Result<Self, String> {
        let child = tokio::process::Command::new(python_path)
            .arg(script_path)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to start spaCy sidecar: {e}"))?;

        Ok(Self { child })
    }

    /// Check if the process is still running.
    pub fn is_running(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(None))
    }

    /// Kill the sidecar process.
    pub async fn kill(&mut self) -> Result<(), String> {
        self.child
            .kill()
            .await
            .map_err(|e| format!("Failed to kill spaCy sidecar: {e}"))
    }
}
