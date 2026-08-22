//! 手动实时链路检查（#[ignore]，不进入常规测试套件）：
//! 直连东方财富验证 K 线 / 净值 / 搜索三条路径，用于诊断
//! “实时数据源暂不可用”。运行：cargo test --lib live_check -- --ignored --nocapture

use crate::market::client::{fetch_fund_nav_body, fetch_kline_body};
use crate::market::parse::{parse_fund_nav_response, parse_kline_response};
use crate::market::search::search_instruments;

#[tokio::test]
#[ignore]
async fn live_check() {
    let client = crate::market::client::build_client().expect("client");
    let today = crate::market::catalog::shanghai_today();
    println!("today={today}");

    // 1) 股票 K 线（沪市 600519，前复权）
    match fetch_kline_body(&client, 1, "600519", 30, &today).await {
        Ok(body) => match parse_kline_response(&body) {
            Ok(rows) => {
                println!(
                    "kline OK rows={} last={} close={}",
                    rows.len(),
                    rows.last().map(|r| r.trade_date.as_str()).unwrap_or("-"),
                    rows.last().map(|r| r.close).unwrap_or(0.0)
                );
            }
            Err(err) => println!("kline PARSE FAIL: {err}"),
        },
        Err(err) => println!("kline FETCH FAIL: {err}"),
    }

    // 2) ETF K 线（深市 159915）
    match fetch_kline_body(&client, 0, "159915", 30, &today).await {
        Ok(body) => match parse_kline_response(&body) {
            Ok(rows) => println!("etf OK rows={}", rows.len()),
            Err(err) => println!("etf PARSE FAIL: {err}"),
        },
        Err(err) => println!("etf FETCH FAIL: {err}"),
    }

    // 3) 场外基金净值（012734，分页取 30 条）
    match fetch_fund_nav_body(&client, "012734", 1).await {
        Ok(body) => match parse_fund_nav_response(&body) {
            Ok(rows) => println!("fund nav OK rows={}", rows.len()),
            Err(err) => println!("fund PARSE FAIL: {err}"),
        },
        Err(err) => println!("fund FETCH FAIL: {err}"),
    }

    // 4) 搜索
    match search_instruments("茅台".to_string()).await {
        Ok(instruments) => println!("search OK hits={}", instruments.len()),
        Err(err) => println!("search FAIL: {err}"),
    }
}
