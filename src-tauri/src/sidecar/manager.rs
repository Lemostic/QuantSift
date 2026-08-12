//! Owns the Python sidecar process lifecycle and exposes typed RPC methods
//! to the Tauri commands.

use serde::{Deserialize, Serialize};
use std::process::{Child, Command, Stdio};

use super::rpc::{SidecarClient, SidecarError};

/// The typed result shapes the frontend consumes.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidecarInstrument {
    pub id: String,
    pub symbol: String,
    pub name: String,
    pub kind: String,
    pub exchange: String,
    pub currency: String,
}

#[derive(Debug, Deserialize, Serialize)]
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

#[cfg(test)]
mod tests {
    use super::{SidecarBar, SidecarInstrument};

    #[test]
    fn deserializes_sidecar_response_models() {
        let instruments: Vec<SidecarInstrument> = serde_json::from_value(serde_json::json!([{
            "id": "CN:510300",
            "symbol": "510300",
            "name": "CSI 300 ETF",
            "kind": "fund",
            "exchange": "SSE",
            "currency": "CNY"
        }]))
        .expect("instrument response should deserialize");
        assert_eq!(instruments[0].id, "CN:510300");

        let bars: Vec<SidecarBar> = serde_json::from_value(serde_json::json!([{
            "instrumentId": "CN:510300",
            "tradeDate": "2026-08-12",
            "open": 4.0,
            "high": 4.2,
            "low": 3.9,
            "close": 4.1,
            "volume": 1000.0,
            "adjustment": "qfq",
            "provider": "fixture",
            "fetchedAt": "2026-08-12T10:00:00Z"
        }]))
        .expect("bar response should deserialize");
        assert_eq!(bars[0].instrument_id, "CN:510300");
        assert_eq!(bars[0].trade_date, "2026-08-12");
    }
}

/// State shared across Tauri commands (managed via tauri::State).
pub struct SidecarManager {
    inner: std::sync::Mutex<Option<SidecarClient>>,
    executable: String,
    arguments: Vec<String>,
    consecutive_failures: std::sync::atomic::AtomicU32,
}

impl SidecarManager {
    pub fn new(python_path: String, script_path: String) -> Self {
        Self {
            inner: std::sync::Mutex::new(None),
            executable: python_path,
            arguments: vec![script_path],
            consecutive_failures: std::sync::atomic::AtomicU32::new(0),
        }
    }

    pub fn bundled(executable: String) -> Self {
        Self {
            inner: std::sync::Mutex::new(None),
            executable,
            arguments: Vec::new(),
            consecutive_failures: std::sync::atomic::AtomicU32::new(0),
        }
    }

    fn spawn(&self) -> Result<SidecarClient, SidecarError> {
        tracing::info!(
            executable = %self.executable,
            "spawning AKShare sidecar"
        );
        let mut command = Command::new(&self.executable);
        command
            .args(&self.arguments)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let child: Child = command
            .spawn()
            .map_err(|err| SidecarError::ProcessExited(format!("无法启动市场数据服务: {err}")))?;
        SidecarClient::new(child).map_err(|err| SidecarError::Io(err.to_string()))
    }

    fn ensure_running(
        &self,
    ) -> Result<std::sync::MutexGuard<'_, Option<SidecarClient>>, SidecarError> {
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
                self.consecutive_failures
                    .store(0, std::sync::atomic::Ordering::Relaxed);
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
