//! EastMoney HTTP client. This is the only code in the project that talks
//! to a financial vendor endpoint directly; everything above it consumes
//! normalized bars through the Tauri command surface.

use reqwest::Client;

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const KLINE_URL: &str = "https://push2his.eastmoney.com/api/qt/stock/kline/get";
const KLINE_TOKEN: &str = "fa5fd1943c7b386f172d6893dbfba10b";
const NAV_URL: &str = "https://api.fund.eastmoney.com/f10/lsjz";

pub fn build_client() -> Result<Client, String> {
    Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|err| format!("网络客户端初始化失败: {err}"))
}

/// Fetches the raw kline JSON body for a security.
/// `market` is the EastMoney market prefix (1 = SSE, 0 = SZSE).
pub async fn fetch_kline_body(
    client: &Client,
    market: u8,
    symbol: &str,
    limit: u32,
    today: &str,
) -> Result<String, String> {
    let begin = crate::market::catalog::kline_begin_date(limit, today);
    let url = format!(
        "{KLINE_URL}?secid={market}.{symbol}&ut={KLINE_TOKEN}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&beg={begin}&end=20500101"
    );
    get_text(client, &url).await
}

/// Fetches one page of the raw fund NAV JSON body for an open-end fund.
/// The EastMoney endpoint caps every page at 20 rows regardless of the
/// requested page size; callers paginate through `page_index`.
pub async fn fetch_fund_nav_body(
    client: &Client,
    fund_code: &str,
    page_index: u32,
) -> Result<String, String> {
    let url = format!("{NAV_URL}?fundCode={fund_code}&pageIndex={page_index}&pageSize=20");
    get_text(client, &url).await
}

async fn get_text(client: &Client, url: &str) -> Result<String, String> {
    let response = client
        .get(url)
        .header("Referer", "http://fundf10.eastmoney.com/")
        .send()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("网络请求失败: {err}"))?;
    if !status.is_success() {
        return Err(format!("网络请求失败: HTTP {status}"));
    }
    Ok(body)
}
