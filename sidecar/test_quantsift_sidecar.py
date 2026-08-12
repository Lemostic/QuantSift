"""Contract tests for the AKShare sidecar.

These tests run against recorded fixtures and a monkeypatched AKShare so the
suite does not depend on eastmoney/sina availability. Run with:

    python3 -m pytest sidecar -v
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import quantsift_sidecar as sc  # noqa: E402


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_fixture(name: str) -> dict:
    with open(FIXTURES / f"{name}.json", encoding="utf-8") as handle:
        return json.load(handle)


@pytest.fixture()
def fake_ak(monkeypatch):
    """A minimal akshare double returning recorded fixture data.

    The recorded fixtures store *normalized* bars. AKShare real endpoints
    return Chinese/English column frames, so the double converts normalized
    bars back into the column shape the sidecar's row mappers expect.
    """

    def stock_frame():
        bars = load_fixture("bars_CN_600519")["result"]
        return _bars_to_stock_frame(bars)

    def nav_frame():
        bars = load_fixture("bars_CN_012734")["result"]
        return _bars_to_nav_frame(bars)

    class FakeAkshare:
        def stock_zh_a_hist(self, **kwargs):
            return stock_frame()

        def stock_zh_a_daily(self, **kwargs):
            return stock_frame()

        def fund_etf_hist_em(self, **kwargs):
            return stock_frame()

        def fund_open_fund_info_em(self, symbol, indicator):
            return nav_frame()

    monkeypatch.setattr(sc, "_AK", FakeAkshare())
    return FakeAkshare()


def _bars_to_stock_frame(bars):
    import pandas as pd
    return pd.DataFrame(
        [
            {
                "日期": pd.to_datetime(bar["tradeDate"]).date(),
                "开盘": bar["open"],
                "收盘": bar["close"],
                "最高": bar["high"],
                "最低": bar["low"],
                "成交量": bar["volume"],
            }
            for bar in bars
        ]
    )


def _bars_to_sina_frame(bars):
    import pandas as pd
    return pd.DataFrame(
        [
            {
                "date": pd.to_datetime(bar["tradeDate"]).date(),
                "open": bar["open"],
                "close": bar["close"],
                "high": bar["high"],
                "low": bar["low"],
                "volume": bar["volume"],
            }
            for bar in bars
        ]
    )


def _bars_to_nav_frame(bars):
    import pandas as pd
    return pd.DataFrame(
        [
            {
                "净值日期": pd.to_datetime(bar["tradeDate"]).date(),
                "单位净值": bar["close"],
            }
            for bar in bars
        ]
    )


# ---------------------------------------------------------------------------
# Protocol / methods
# ---------------------------------------------------------------------------


def test_list_instruments_contract():
    result = sc.list_instruments()
    assert len(result) == 6
    for entry in result:
        assert set(entry) == {"id", "symbol", "name", "kind", "exchange", "currency"}
        assert entry["currency"] == "CNY"
    kinds = {entry["kind"] for entry in result}
    assert kinds == {"stock", "fund"}


def test_get_daily_bars_unknown_instrument():
    with pytest.raises(KeyError):
        sc.get_daily_bars("CN:999999", 30)


def test_get_daily_bars_stock_normalized(fake_ak):
    bars = sc.get_daily_bars("CN:600519", 30)
    assert len(bars) == 30
    first, last = bars[0], bars[-1]
    assert first["tradeDate"] < last["tradeDate"]
    assert last["instrumentId"] == "CN:600519"
    assert last["provider"] == "akshare"
    assert last["adjustment"] == "forward"
    assert last["close"] > 0
    assert set(last) == {
        "instrumentId",
        "tradeDate",
        "open",
        "high",
        "low",
        "close",
        "volume",
        "adjustment",
        "provider",
        "fetchedAt",
    }


def test_get_daily_bars_otc_fund_normalized(fake_ak):
    bars = sc.get_daily_bars("CN:012734", 30)
    assert len(bars) == 30
    last = bars[-1]
    assert last["instrumentId"] == "CN:012734"
    assert last["adjustment"] == "none"
    assert last["volume"] == 0
    assert last["open"] == last["close"] == last["high"] == last["low"]


def test_etf_uses_sina_when_eastmoney_is_unreachable(monkeypatch):
    bars = load_fixture("bars_CN_600519")["result"]

    class FakeAkshare:
        def fund_etf_hist_em(self, **kwargs):
            raise ConnectionError("RemoteDisconnected")

        def stock_zh_a_daily(self, **kwargs):
            assert kwargs["symbol"] == "sh510300"
            return _bars_to_sina_frame(bars)

    monkeypatch.setattr(sc, "_AK", FakeAkshare())
    result = sc.get_daily_bars("CN:510300", 5)

    assert len(result) == 5
    assert result[-1]["instrumentId"] == "CN:510300"
    assert result[-1]["provider"] == "akshare"


def test_weekend_rows_are_excluded(fake_ak):
    bars = sc.get_daily_bars("CN:600519", 30)
    dates = {bar["tradeDate"] for bar in bars}
    for date_text in dates:
        import datetime
        weekday = datetime.date.fromisoformat(date_text).weekday()
        assert weekday < 5, f"{date_text} is a weekend row"


# ---------------------------------------------------------------------------
# Error classification
# ---------------------------------------------------------------------------


def test_network_error_classification():
    class FakeProxyError(Exception):
        pass

    assert sc._is_network_error(FakeProxyError("Max retries exceeded"))
    assert sc._is_network_error(FakeProxyError("RemoteDisconnected"))
    assert not sc._is_network_error(ValueError("bad data"))


def test_rpc_error_code_transparent():
    error = sc.RpcError("method_not_found", "未知方法: nope")
    assert error.code == "method_not_found"
    assert "nope" in error.message


def test_handle_unknown_method():
    with pytest.raises(sc.RpcError) as exc:
        sc._handle("nope", {})
    assert exc.value.code == "method_not_found"


def test_malformed_json_returns_error_without_crashing(monkeypatch, capsys):
    monkeypatch.setattr(sys, "stdin", iter(["not-json\n"]))

    assert sc.main() == 0
    response = json.loads(capsys.readouterr().out)
    assert response["id"] is None
    assert response["ok"] is False
    assert response["error"]["code"] == "data_error"


def test_handle_known_methods(fake_ak):
    instruments = sc._handle("list_instruments", {})
    assert len(instruments) == 6
    bars = sc._handle("get_daily_bars", {"instrumentId": "CN:012734", "limit": 5})
    assert len(bars) == 5


# ---------------------------------------------------------------------------
# RPC main loop over stdio
# ---------------------------------------------------------------------------


def test_main_loop_echoes_replies(monkeypatch, fake_ak, capsys):
    lines = iter(
        [
            '{"id":1,"method":"list_instruments","params":{}}\n',
            '{"id":2,"method":"get_daily_bars","params":{"instrumentId":"CN:600519","limit":2}}\n',
            '{"id":3,"method":"get_daily_bars","params":{"instrumentId":"CN:999999","limit":2}}\n',
        ]
    )
    monkeypatch.setattr(sc.sys, "stdin", lines)
    assert sc.main() == 0
    captured = capsys.readouterr().out.strip().splitlines()
    assert len(captured) == 3
    first = json.loads(captured[0])
    assert first["id"] == 1 and first["ok"] is True
    assert len(first["result"]) == 6
    second = json.loads(captured[1])
    assert second["ok"] is True and len(second["result"]) == 2
    third = json.loads(captured[2])
    assert third["ok"] is False
    assert third["error"]["code"] == "unknown_instrument"
