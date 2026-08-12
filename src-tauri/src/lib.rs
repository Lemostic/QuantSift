// QuantSift - local quantitative research assistant.

mod sidecar;

use serde::Serialize;
use sidecar::{manager::SidecarBar, manager::SidecarInstrument, SidecarManager};
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    tauri_version: &'static str,
    modules: Vec<InstrumentSummary>,
}

#[derive(Debug, Serialize, Clone)]
struct InstrumentSummary {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    enabled: bool,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "QuantSift",
        version: env!("CARGO_PKG_VERSION"),
        tauri_version: tauri::VERSION,
        modules: vec![
            InstrumentSummary {
                id: "CN:510300",
                name: "沪深300ETF",
                category: "fund",
                enabled: true,
            },
            InstrumentSummary {
                id: "CN:600519",
                name: "贵州茅台",
                category: "stock",
                enabled: true,
            },
            InstrumentSummary {
                id: "CN:000001",
                name: "平安银行",
                category: "stock",
                enabled: true,
            },
            InstrumentSummary {
                id: "CN:159915",
                name: "创业板ETF",
                category: "fund",
                enabled: true,
            },
            InstrumentSummary {
                id: "CN:600036",
                name: "招商银行",
                category: "stock",
                enabled: true,
            },
            InstrumentSummary {
                id: "portfolio",
                name: "持仓研究",
                category: "research",
                enabled: true,
            },
        ],
    }
}

#[tauri::command]
fn sidecar_list_instruments(
    state: tauri::State<'_, SidecarManager>,
) -> Result<Vec<SidecarInstrument>, String> {
    state.list_instruments().map_err(|err| err.to_string())
}

#[tauri::command]
fn sidecar_get_daily_bars(
    state: tauri::State<'_, SidecarManager>,
    instrument_id: String,
    limit: u32,
) -> Result<Vec<SidecarBar>, String> {
    state
        .get_daily_bars(&instrument_id, limit)
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("quantsift_lib=info,tauri=info,warn")),
        )
        .with_target(false)
        .compact()
        .init();

    tracing::info!("starting QuantSift v{}", env!("CARGO_PKG_VERSION"));

    let sidecar_manager = build_sidecar_manager();

    tauri::Builder::default()
        .manage(sidecar_manager)
        .invoke_handler(tauri::generate_handler![
            app_info,
            sidecar_list_instruments,
            sidecar_get_daily_bars
        ])
        .run(tauri::generate_context!())
        .expect("error while running QuantSift");
}

fn build_sidecar_manager() -> SidecarManager {
    if let Ok(executable) = std::env::var("QUANTSIFT_SIDECAR_EXECUTABLE") {
        return SidecarManager::bundled(executable);
    }

    if cfg!(debug_assertions) || !cfg!(windows) {
        let python = std::env::var("QUANTSIFT_PYTHON").unwrap_or_else(|_| {
            if cfg!(windows) {
                "python".to_string()
            } else {
                "python3".to_string()
            }
        });
        let script = std::env::var("QUANTSIFT_SIDECAR").unwrap_or_else(|_| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("sidecar")
                .join("quantsift_sidecar.py")
                .to_string_lossy()
                .into_owned()
        });
        return SidecarManager::new(python, script);
    }

    let executable_name = if cfg!(windows) {
        "quantsift-sidecar.exe"
    } else {
        "quantsift-sidecar"
    };
    let executable = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|parent| parent.join(executable_name)))
        .unwrap_or_else(|| PathBuf::from(executable_name));
    SidecarManager::bundled(executable.to_string_lossy().into_owned())
}
