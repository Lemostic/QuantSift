// QuantSift - local quantitative research assistant.

mod ai;
mod market;

use serde::Serialize;
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

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            market::eastmoney_list_instruments,
            market::eastmoney_get_daily_bars,
            market::eastmoney_search_instruments,
            ai::llm_chat_completion
        ])
        .run(tauri::generate_context!())
        .expect("error while running QuantSift");
}
