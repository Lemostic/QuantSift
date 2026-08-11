#!/usr/bin/env python3
"""QuantSift AKShare sidecar.

A line-delimited JSON-RPC server over stdio. It is spawned by the Tauri
backend and is the only code in the project that talks to AKShare / vendor
HTTP endpoints directly (AGENTS.md data boundary).

Protocol
--------
Each request is one JSON object on one line of stdin:

    {"id": 1, "method": "list_instruments", "params": {}}
    {"id": 2, "method": "get_daily_bars",
     "params": {"instrumentId": "CN:600519", "limit": 30}}

Each response is one JSON object on one line of stdout:

    {"id": 1, "ok": true, "result": [...]}
    {"id": 2, "ok": false, "error": {"code": "network_error", "message": "..."}}

When there is nothing more to read on stdin the process exits with code 0.

The sidecar also supports a recording mode used to capture contract-test
fixtures without a live network:

    echo '{"id":1,"method":"list_instruments","params":{}}' | \\
      QUANTSIFT_RECORD_DIR=sidecar/fixtures python3 sidecar/quantsift_sidecar.py
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import sys
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Instrument catalog
# ---------------------------------------------------------------------------
# Known instruments the app can research. Live bar data is fetched per
# instrument in get_daily_bars; listInstruments stays cheap and deterministic.
# `secid_kind` is how AKShare selects its API family (stock vs ETF vs OTC fund).
CATALOG: list[dict[str, Any]] = [
    {
        "id": "CN:510300",
        "symbol": "510300",
        "name": "沪深300ETF",
        "kind": "fund",
        "exchange": "SSE",
        "currency": "CNY",
        "ak_type": "etf",
    },
    {
        "id": "CN:600519",
        "symbol": "600519",
        "name": "贵州茅台",
        "kind": "stock",
        "exchange": "SSE",
        "currency": "CNY",
        "ak_type": "stock",
    },
    {
        "id": "CN:000001",
        "symbol": "000001",
        "name": "平安银行",
        "kind": "stock",
        "exchange": "SZSE",
        "currency": "CNY",
        "ak_type": "stock",
    },
    {
        "id": "CN:159915",
        "symbol": "159915",
        "name": "创业板ETF",
        "kind": "fund",
        "exchange": "SZSE",
        "currency": "CNY",
        "ak_type": "etf",
    },
    {
        "id": "CN:600036",
        "symbol": "600036",
        "name": "招商银行",
        "kind": "stock",
        "exchange": "SSE",
        "currency": "CNY",
        "ak_type": "stock",
    },
    {
        "id": "CN:012734",
        "symbol": "012734",
        "name": "易方达人工智能ETF联接C",
        "kind": "fund",
        "exchange": "OTC",
        "currency": "CNY",
        "ak_type": "otc_fund",
    },
]


def _catalog_entry(instrument_id: str) -> dict[str, Any]:
    for entry in CATALOG:
        if entry["id"] == instrument_id:
            return entry
    raise KeyError(f"unknown instrument: {instrument_id}")


def list_instruments() -> list[dict[str, Any]]:
    """Return the normalized catalog without AKShare-specific fields."""
    return [
        {
            "id": e["id"],
            "symbol": e["symbol"],
            "name": e["name"],
            "kind": e["kind"],
            "exchange": e["exchange"],
            "currency": e["currency"],
        }
        for e in CATALOG
    ]


# ---------------------------------------------------------------------------
# AKShare data fetch + normalization
# ---------------------------------------------------------------------------
# Imported lazily so `--record` and unit tests that stub it do not require a
# working install, and so a broken akshare import surfaces as a typed error
# instead of crashing the process.
_AK: Any | None = None


def _akshare() -> Any:
    global _AK
    if _AK is None:
        import akshare  # noqa: PLC0415
        _AK = akshare
    return _AK


def _now_iso() -> str:
    """Current wall clock in Asia/Shanghai, ISO 8601 with offset."""
    now = _dt.datetime.now(_dt.timezone(_dt.timedelta(hours=8)))
    return now.isoformat(timespec="seconds")


def _fetch_stock(entry: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    """A-share stock daily bars via stock_zh_a_hist (前复权).

    Tries the eastmoney-backed endpoint first and falls back to the Sina
    endpoint, which is independently reachable in some networks.
    """
    ak = _akshare()
    symbol = entry["symbol"]
    try:
        df = ak.stock_zh_a_hist(
            symbol=symbol,
            period="daily",
            start_date="19900101",
            end_date=_dt.date.today().strftime("%Y%m%d"),
            adjust="qfq",
        )
        if df is None or df.empty:
            raise ValueError(f"{symbol} 无行情数据")
        return [_stock_row_to_bar(entry, row) for row in df.tail(limit).to_dict("records")]
    except Exception as first_error:  # noqa: BLE001
        if not _is_network_error(first_error):
            raise
        # Fall back to the Sina source (sh/sz prefix required).
        prefix = "sh" if entry["exchange"] == "SSE" else "sz"
        try:
            df2 = ak.stock_zh_a_daily(
                symbol=f"{prefix}{symbol}",
                start_date="19900101",
                end_date=_dt.date.today().strftime("%Y%m%d"),
                adjust="qfq",
            )
            if df2 is None or df2.empty:
                raise ValueError(f"{symbol} 无行情数据")
            return [
                _sina_row_to_bar(entry, row)
                for row in df2.tail(limit).to_dict("records")
            ]
        except Exception as exc:  # noqa: BLE001
            raise ValueError(f"股票行情获取失败: {exc}") from exc


def _sina_row_to_bar(entry: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Map a Sina (English-column) OHLC row to a normalized DailyBar."""
    try:
        trade_date = _normalize_date(row["date"])
        open_ = _num(row["open"])
        close = _num(row["close"])
        high = _num(row["high"])
        low = _num(row["low"])
        volume = _num(row["volume"])
    except KeyError as exc:
        raise ValueError(f"行情列缺失: {exc}") from exc

    return {
        "instrumentId": entry["id"],
        "tradeDate": trade_date,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "adjustment": "forward",
        "provider": "akshare",
        "fetchedAt": _now_iso(),
    }


def _fetch_etf(entry: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    """Exchange-traded fund daily bars via fund_etf_hist_em (前复权)."""
    ak = _akshare()
    df = ak.fund_etf_hist_em(
        symbol=entry["symbol"],
        period="daily",
        start_date="19900101",
        end_date=_dt.date.today().strftime("%Y%m%d"),
        adjust="qfq",
    )
    if df is None or df.empty:
        raise ValueError(f"{entry['symbol']} 无行情数据")
    return [_stock_row_to_bar(entry, row) for row in df.tail(limit).to_dict("records")]


def _fetch_otc_fund(entry: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    """Open-end fund NAV history via fund_open_fund_info_em.

    OTC funds publish NAV, not OHLC. We build a single-price bar where
    open=high=low=close=nav and volume=0.
    """
    ak = _akshare()
    df = ak.fund_open_fund_info_em(symbol=entry["symbol"], indicator="单位净值走势")
    if df is None or df.empty:
        raise ValueError(f"{entry['symbol']} 无净值数据")
    return [_nav_row_to_bar(entry, row) for row in df.tail(limit).to_dict("records")]


def _stock_row_to_bar(entry: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Map a Chinese-columned AKShare OHLC row to a normalized DailyBar."""
    try:
        trade_date = _normalize_date(row["日期"])
        open_ = _num(row["开盘"])
        close = _num(row["收盘"])
        high = _num(row["最高"])
        low = _num(row["最低"])
        volume = _num(row["成交量"])
    except KeyError as exc:
        raise ValueError(f"行情列缺失: {exc}") from exc

    return {
        "instrumentId": entry["id"],
        "tradeDate": trade_date,
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "adjustment": "forward",
        "provider": "akshare",
        "fetchedAt": _now_iso(),
    }


def _nav_row_to_bar(entry: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    """Map a fund NAV row to a single-price DailyBar."""
    try:
        trade_date = _normalize_date(row["净值日期"])
        nav = _num(row["单位净值"])
    except KeyError as exc:
        raise ValueError(f"净值列缺失: {exc}") from exc

    return {
        "instrumentId": entry["id"],
        "tradeDate": trade_date,
        "open": nav,
        "high": nav,
        "low": nav,
        "close": nav,
        "volume": 0,
        "adjustment": "none",
        "provider": "akshare",
        "fetchedAt": _now_iso(),
    }


def _normalize_date(value: Any) -> str:
    """Accept datetime.date/datetime/pandas.Timestamp or 'YYYY-MM-DD' string."""
    if isinstance(value, str):
        return value[:10]
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    raise ValueError(f"无法解析日期: {value!r}")


def _num(value: Any) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).replace(",", "").strip()
    try:
        return float(text)
    except ValueError:
        return 0.0


def get_daily_bars(instrument_id: str, limit: int = 30) -> list[dict[str, Any]]:
    """Return normalized daily bars for an instrument, oldest first."""
    entry = _catalog_entry(instrument_id)
    ak_type = entry.get("ak_type", "stock")
    if ak_type == "stock":
        bars = _fetch_stock(entry, limit)
    elif ak_type == "etf":
        bars = _fetch_etf(entry, limit)
    elif ak_type == "otc_fund":
        bars = _fetch_otc_fund(entry, limit)
    else:  # pragma: no cover - catalog is static
        raise ValueError(f"未知标的类型: {ak_type}")

    bars.sort(key=lambda bar: bar["tradeDate"])
    # Drop weekend rows defensively (AKShare already returns trade days only).
    return [bar for bar in bars if _weekday_of(bar["tradeDate"])]


def _weekday_of(date_text: str) -> bool:
    try:
        day = _dt.date.fromisoformat(date_text).weekday()
        return day < 5
    except ValueError:
        return True  # unknown format: keep row rather than drop data


# ---------------------------------------------------------------------------
# JSON-RPC loop
# ---------------------------------------------------------------------------

Method = Callable[[dict[str, Any]], Any]

METHODS: dict[str, Method] = {
    "list_instruments": lambda _params: list_instruments(),
    "get_daily_bars": lambda params: get_daily_bars(
        params.get("instrumentId", ""),
        int(params.get("limit", 30)),
    ),
}


class RpcError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _handle(method_name: str, params: dict[str, Any]) -> Any:
    handler = METHODS.get(method_name)
    if handler is None:
        raise RpcError("method_not_found", f"未知方法: {method_name}")
    return handler(params)


def _reply(record: dict[str, Any]) -> str:
    return json.dumps(record, ensure_ascii=False)


def _record_fixture(method_name: str, params: dict[str, Any], result: Any) -> None:
    """Write a recorded response to QUANTSIFT_RECORD_DIR for contract tests."""
    record_dir = os.environ.get("QUANTSIFT_RECORD_DIR")
    if not record_dir:
        return
    os.makedirs(record_dir, exist_ok=True)
    if method_name == "list_instruments":
        name = "instruments"
    else:
        instrument_id = params.get("instrumentId", "unknown")
        name = f"bars_{instrument_id.replace(':', '_')}"
    path = os.path.join(record_dir, f"{name}.json")
    with open(path, "w", encoding="utf-8") as handle:
        json.dump({"method": method_name, "params": params, "result": result}, handle, ensure_ascii=False, indent=2)


def main() -> int:
    """Serve requests from stdin until EOF."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            request_id = request.get("id")
            method = request.get("method", "")
            params = request.get("params") or {}
            result = _handle(method, params)
            _record_fixture(method, params, result)
            sys.stdout.write(_reply({"id": request_id, "ok": True, "result": result}) + "\n")
        except RpcError as exc:
            sys.stdout.write(
                _reply({"id": request.get("id"), "ok": False, "error": {"code": exc.code, "message": exc.message}})
                + "\n"
            )
        except KeyError as exc:
            sys.stdout.write(
                _reply({"id": request.get("id"), "ok": False, "error": {"code": "unknown_instrument", "message": str(exc)}})
                + "\n"
            )
        except ValueError as exc:
            sys.stdout.write(
                _reply({"id": request.get("id"), "ok": False, "error": {"code": "data_error", "message": str(exc)}})
                + "\n"
            )
        except Exception as exc:  # noqa: BLE001 - last-resort guard for stdio protocol
            code = "internal_error"
            # Vendor network problems are expected at runtime (eastmoney is
            # intermittently unreachable). Surface them as a typed error so the
            # app can fall back to cached fixtures and show a freshness notice.
            message = f"{type(exc).__name__}: {exc}"
            if _is_network_error(exc):
                code = "network_error"
            sys.stdout.write(
                _reply({"id": request.get("id"), "ok": False, "error": {"code": code, "message": message}})
                + "\n"
            )
        finally:
            sys.stdout.flush()
    return 0


def _is_network_error(exc: Exception) -> bool:
    """Classify provider reachability failures as network errors."""
    type_name = type(exc).__name__
    if "ProxyError" in type_name or "ConnectionError" in type_name:
        return True
    if "Connection" in type_name or "Timeout" in type_name:
        return True
    message = str(exc)
    return any(
        token in message
        for token in ("Max retries exceeded", "RemoteDisconnected", "Name or service not known", "Timed out")
    )


if __name__ == "__main__":
    sys.exit(main())
