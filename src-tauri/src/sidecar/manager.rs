//! Owns the Python sidecar process lifecycle and exposes typed RPC methods
//! to the Tauri commands.

use serde::Serialize;
use std::process::{Child, Command, Stdio};

use super::rpc::{SidecarClient, SidecarError};

/// The typed result shapes the frontend consumes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarInstrument {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub kind: String,
    pub exchange: String,
    pub currency: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarBar {
    pub instrument_id: String,
    pub trade_date: String,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
    pub adjustment: String,
    pub provider: String,
    pub fetched_at: String,
}

/// State shared across Tauri commands (managed via tauri::State).
pub struct SidecarManager {
    inner: std::sync::Mutex<Option<SidecarClient>>,
    python_path: String,
    script_path: String,
    consecutive_failures: std::sync::atomic::AtomicU32,
}

impl SidecarManager {
    pub fn new(python_path: String, script_path: String) -> Self {
        Self {
            inner: std::sync::Mutex::new(None),
            python_path,
            script_path,
            consecutive_failures: std::sync::atomic::AtomicU32::new(0),
        }
    }

    fn spawn(&self) -> Result<SidecarClient, SidecarError> {
        tracing::info!(
            python = %self.python_path,
            script = %self.script_path,
            "spawning AKShare sidecar"
        );
        let child: Child = Command::new(&self.python_path)
            .arg(&self.script_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|err| {
                SidecarError::ProcessExited(format!("无法启动 Python sidecar: {err}"))
            })?;
        SidecarClient::new(child).map_err(|err| SidecarError::Io(err.to_string()))
    }

    fn ensure_running(&self) -> Result<std::sync::MutexGuard<'_, Option<SidecarClient>>, SidecarError> {
        let mut guard = self
            .inner
            .lock()
            .map_err(|_| SidecarError::Internal("sidecar 状态锁不可用".to_string()))?;
        if guard.is_none() {
            *guard = Some(self.spawn()?);
        }
        Ok(guard)
    }

    /// Run a request through the sidecar, restarting the process once if the
    /// current instance died.
    pub fn request(
        &self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, SidecarError> {
        let mut guard = self.ensure_running()?;
        let client = guard.as_mut().ok_or(SidecarError::NotRunning)?;
        match client.call(method, params.clone()) {
            Ok(value) => {
                self.consecutive_failures.store(0, std::sync::atomic::Ordering::Relaxed);
                Ok(value)
            }
            Err(err) => {
                // One automatic restart for dead/crashed processes, then report.
                let failures = self
                    .consecutive_failures
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
                    + 1;
                if failures >= 3 {
                    tracing::error!("sidecar failed {failures} times in a row");
                    return Err(SidecarError::ProcessExited(
                        "数据源服务不可用，已回退到离线样例".to_string(),
                    ));
                }
                tracing::warn!("sidecar error, restarting: {err}");
                *guard = Some(self.spawn()?);
                let restarted = guard.as_mut().ok_or(SidecarError::NotRunning)?;
                restarted.call(method, params)
            }
        }
    }

    pub fn list_instruments(&self) -> Result<Vec<SidecarInstrument>, SidecarError> {
        let value = self.request("list_instruments", serde_json::json!({}))?;
        serde_json::from_value(value).map_err(|err| SidecarError::Data(err.to_string()))
    }

    pub fn get_daily_bars(
        &self,
        instrument_id: &str,
        limit: u32,
    ) -> Result<Vec<SidecarBar>, SidecarError> {
        let value = self.request(
            "get_daily_bars",
            serde_json::json!({ "instrumentId": instrument_id, "limit": limit }),
        )?;
        serde_json::from_value(value).map_err(|err| SidecarError::Data(err.to_string()))
    }
}
