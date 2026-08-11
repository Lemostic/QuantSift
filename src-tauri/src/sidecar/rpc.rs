//! Line-delimited JSON-RPC client used to talk to the Python sidecar.

use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout};

/// Errors surfaced by the sidecar bridge. Codes map to the Python sidecar's
/// `{ "ok": false, "error": { "code", "message" } }` responses.
#[derive(Debug, Clone, thiserror::Error)]
pub enum SidecarError {
    #[error("sidecar 未启动")]
    NotRunning,
    #[error("sidecar 进程已退出: {0}")]
    ProcessExited(String),
    #[error("sidecar 请求超时")]
    Timeout,
    #[error("sidecar 返回未知方法: {0}")]
    MethodNotFound(String),
    #[error("数据源网络错误: {0}")]
    Network(String),
    #[error("数据错误: {0}")]
    Data(String),
    #[error("sidecar 内部错误: {0}")]
    Internal(String),
    #[error("未知标的: {0}")]
    UnknownInstrument(String),
    #[error("IO 错误: {0}")]
    Io(String),
}

#[derive(Debug, Serialize, Deserialize)]
struct Request<'a> {
    id: u64,
    method: &'a str,
    params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct Response {
    id: u64,
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    result: Option<serde_json::Value>,
    #[serde(default)]
    error: Option<ErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ErrorBody {
    #[serde(default)]
    code: String,
    #[serde(default)]
    message: String,
}

/// Owns the child stdin/stdout handles for one sidecar process.
pub struct SidecarClient {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<ChildStdout>,
    next_id: u64,
}

impl SidecarClient {
    pub fn new(mut child: Child) -> std::io::Result<Self> {
        let stdin = child.stdin.take().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "sidecar stdin 不可用")
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::BrokenPipe, "sidecar stdout 不可用")
        })?;
        Ok(Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
            next_id: 0,
        })
    }

    fn next_id(&mut self) -> u64 {
        self.next_id += 1;
        self.next_id
    }

    /// Send one request and block for its reply.
    pub fn call(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, SidecarError> {
        if self.child.try_wait().map_err(|err| SidecarError::Io(err.to_string()))?.is_some() {
            return Err(SidecarError::ProcessExited(
                "sidecar 进程已终止".to_string(),
            ));
        }

        let id = self.next_id();
        let request = Request { id, method, params };
        let line = serde_json::to_string(&request)
            .map_err(|err| SidecarError::Internal(err.to_string()))?;
        self.stdin
            .write_all(line.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .and_then(|_| self.stdin.flush())
            .map_err(|err| SidecarError::Io(err.to_string()))?;

        let mut buffer = String::new();
        let read = self
            .stdout
            .read_line(&mut buffer)
            .map_err(|err| SidecarError::Io(err.to_string()))?;
        if read == 0 {
            return Err(SidecarError::ProcessExited("sidecar 已关闭 stdout".to_string()));
        }

        let response: Response = serde_json::from_str(&buffer)
            .map_err(|err| SidecarError::Internal(format!("响应解析失败: {err}")))?;
        if response.id != id {
            return Err(SidecarError::Internal(format!(
                "响应 id 不匹配: 期望 {id}, 实际 {}",
                response.id
            )));
        }

        if response.ok {
            response
                .result
                .ok_or_else(|| SidecarError::Internal("ok 响应缺少 result".to_string()))
        } else {
            let error = response.error.unwrap_or(ErrorBody {
                code: "internal_error".to_string(),
                message: "未知错误".to_string(),
            });
            Err(map_error_code(&error.code, &error.message))
        }
    }
}

fn map_error_code(code: &str, message: &str) -> SidecarError {
    match code {
        "method_not_found" => SidecarError::MethodNotFound(message.to_string()),
        "network_error" => SidecarError::Network(message.to_string()),
        "data_error" => SidecarError::Data(message.to_string()),
        "unknown_instrument" => SidecarError::UnknownInstrument(message.to_string()),
        "sidecar_startup_failed" => SidecarError::ProcessExited(message.to_string()),
        _ => SidecarError::Internal(message.to_string()),
    }
}

impl Drop for SidecarClient {
    fn drop(&mut self) {
        // Try a graceful shutdown; the OS reclaims the child if we are killed.
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
