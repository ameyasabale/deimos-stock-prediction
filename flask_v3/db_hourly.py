"""
Hourly + end-of-day DB helpers for the two new tables:

  dbo.HourlyPredictions     — 6 rows/stock/day during the trading session.
  dbo.DailyAvgPredictions   — 1 row/stock/day after session close, seeded by
                              the day's OHLC average (O+L / OHLC / typical).

Low-level save helpers are reused by the /run-batch endpoints in app.py; the
Flask view functions here back the manual save/get endpoints.
"""

from datetime import datetime, date
import pyodbc
from flask import request, jsonify


CONN_STR_NSE = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=AmeyaFX_NSE;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)


def _to_float(v):
    try:
        return float(v) if v is not None and v != "" else None
    except Exception:
        return None


def _parse_date(v):
    if v is None or v == "":
        return date.today()
    if isinstance(v, date):
        return v
    try:
        return datetime.fromisoformat(str(v)).date()
    except Exception:
        try:
            return datetime.strptime(str(v), "%Y-%m-%d").date()
        except Exception:
            return date.today()


# ---------------------------------------------------------------------------
# Low-level insert helpers (called by /run-batch endpoints in app.py)
# ---------------------------------------------------------------------------
def save_hourly_row(cursor, *, symbol, session_date, hour_slot, current_price,
                    signal_tomorrow, buy_prob, sell_prob, hold_prob,
                    predicted_price, predicted_change_pct, rsi, macd):
    """
    Upsert a single HourlyPredictions row. Unique key is (Symbol, SessionDate,
    HourSlot) so re-running a batch for the same slot overwrites rather than
    duplicating.
    """
    cursor.execute(
        """
        MERGE dbo.HourlyPredictions AS tgt
        USING (SELECT ? AS Symbol, ? AS SessionDate, ? AS HourSlot) AS src
          ON tgt.Symbol = src.Symbol AND tgt.SessionDate = src.SessionDate AND tgt.HourSlot = src.HourSlot
        WHEN MATCHED THEN UPDATE SET
            RecordedAt = SYSUTCDATETIME(),
            CurrentPrice = ?, SignalTomorrow = ?,
            BuyProb = ?, SellProb = ?, HoldProb = ?,
            PredictedNextDayPrice = ?, PredictedNextDayChangePct = ?,
            RSI = ?, MACD = ?
        WHEN NOT MATCHED THEN INSERT
            (Symbol, SessionDate, HourSlot, CurrentPrice, SignalTomorrow,
             BuyProb, SellProb, HoldProb, PredictedNextDayPrice,
             PredictedNextDayChangePct, RSI, MACD)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """,
        symbol, session_date, hour_slot,
        _to_float(current_price), signal_tomorrow,
        _to_float(buy_prob), _to_float(sell_prob), _to_float(hold_prob),
        _to_float(predicted_price), _to_float(predicted_change_pct),
        _to_float(rsi), _to_float(macd),
        symbol, session_date, hour_slot,
        _to_float(current_price), signal_tomorrow,
        _to_float(buy_prob), _to_float(sell_prob), _to_float(hold_prob),
        _to_float(predicted_price), _to_float(predicted_change_pct),
        _to_float(rsi), _to_float(macd),
    )


def save_daily_avg_row(cursor, *, symbol, session_date, open_price, high_price,
                       low_price, close_price, ohlc_avg, typical_price,
                       open_low_avg, predicted_price, predicted_change_pct,
                       predicted_signal):
    """Upsert a single DailyAvgPredictions row. Unique key is (Symbol, SessionDate)."""
    cursor.execute(
        """
        MERGE dbo.DailyAvgPredictions AS tgt
        USING (SELECT ? AS Symbol, ? AS SessionDate) AS src
          ON tgt.Symbol = src.Symbol AND tgt.SessionDate = src.SessionDate
        WHEN MATCHED THEN UPDATE SET
            OpenPrice = ?, HighPrice = ?, LowPrice = ?, ClosePrice = ?,
            OHLCAvgPrice = ?, TypicalPrice = ?, OpenLowAvgPrice = ?,
            PredictedNextDayPrice = ?, PredictedNextDayChangePct = ?,
            PredictedNextDaySignal = ?
        WHEN NOT MATCHED THEN INSERT
            (Symbol, SessionDate, OpenPrice, HighPrice, LowPrice, ClosePrice,
             OHLCAvgPrice, TypicalPrice, OpenLowAvgPrice,
             PredictedNextDayPrice, PredictedNextDayChangePct, PredictedNextDaySignal)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """,
        symbol, session_date,
        _to_float(open_price), _to_float(high_price), _to_float(low_price), _to_float(close_price),
        _to_float(ohlc_avg), _to_float(typical_price), _to_float(open_low_avg),
        _to_float(predicted_price), _to_float(predicted_change_pct), predicted_signal,
        symbol, session_date,
        _to_float(open_price), _to_float(high_price), _to_float(low_price), _to_float(close_price),
        _to_float(ohlc_avg), _to_float(typical_price), _to_float(open_low_avg),
        _to_float(predicted_price), _to_float(predicted_change_pct), predicted_signal,
    )


# ---------------------------------------------------------------------------
# Flask view functions (manual save / read endpoints)
# ---------------------------------------------------------------------------
def save_hourly_endpoint():
    data = request.get_json() or {}
    if not data.get("symbol"):
        return jsonify({"success": False, "error": "Missing field: symbol"}), 400
    try:
        conn = pyodbc.connect(CONN_STR_NSE)
        cur  = conn.cursor()
        save_hourly_row(
            cur,
            symbol               = data["symbol"],
            session_date         = _parse_date(data.get("sessionDate")),
            hour_slot            = int(data.get("hourSlot", 1)),
            current_price        = data.get("currentPrice"),
            signal_tomorrow      = data.get("signalTomorrow"),
            buy_prob             = data.get("buyProb"),
            sell_prob            = data.get("sellProb"),
            hold_prob            = data.get("holdProb"),
            predicted_price      = data.get("predictedNextDayPrice"),
            predicted_change_pct = data.get("predictedNextDayChangePct"),
            rsi                  = data.get("rsi"),
            macd                 = data.get("macd"),
        )
        conn.commit(); conn.close()
        return jsonify({"success": True, "message": f"Hourly prediction for {data['symbol']} saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def get_hourly_endpoint(symbol):
    try:
        conn = pyodbc.connect(CONN_STR_NSE); cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 100 HourlyID, Symbol, SessionDate, HourSlot, RecordedAt,
                CurrentPrice, SignalTomorrow, BuyProb, SellProb, HoldProb,
                PredictedNextDayPrice, PredictedNextDayChangePct, RSI, MACD
            FROM dbo.HourlyPredictions
            WHERE Symbol = ?
            ORDER BY SessionDate DESC, HourSlot DESC
            """,
            symbol.upper(),
        )
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            if r.get("SessionDate"): r["SessionDate"] = str(r["SessionDate"])
            if r.get("RecordedAt"):  r["RecordedAt"]  = str(r["RecordedAt"])
        conn.close()
        return jsonify({"success": True, "symbol": symbol, "rows": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def save_daily_avg_endpoint():
    data = request.get_json() or {}
    if not data.get("symbol"):
        return jsonify({"success": False, "error": "Missing field: symbol"}), 400
    try:
        conn = pyodbc.connect(CONN_STR_NSE); cur = conn.cursor()
        save_daily_avg_row(
            cur,
            symbol               = data["symbol"],
            session_date         = _parse_date(data.get("sessionDate")),
            open_price           = data.get("openPrice"),
            high_price           = data.get("highPrice"),
            low_price            = data.get("lowPrice"),
            close_price          = data.get("closePrice"),
            ohlc_avg             = data.get("ohlcAvgPrice"),
            typical_price        = data.get("typicalPrice"),
            open_low_avg         = data.get("openLowAvgPrice"),
            predicted_price      = data.get("predictedNextDayPrice"),
            predicted_change_pct = data.get("predictedNextDayChangePct"),
            predicted_signal     = data.get("predictedNextDaySignal"),
        )
        conn.commit(); conn.close()
        return jsonify({"success": True, "message": f"Daily-avg prediction for {data['symbol']} saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def get_daily_avg_endpoint(symbol):
    try:
        conn = pyodbc.connect(CONN_STR_NSE); cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 100 DailyAvgID, Symbol, SessionDate,
                OpenPrice, HighPrice, LowPrice, ClosePrice,
                OHLCAvgPrice, TypicalPrice, OpenLowAvgPrice,
                PredictedNextDayPrice, PredictedNextDayChangePct, PredictedNextDaySignal,
                ActualNextDayClose, AbsoluteError, SignedError, CreatedAt
            FROM dbo.DailyAvgPredictions
            WHERE Symbol = ?
            ORDER BY SessionDate DESC
            """,
            symbol.upper(),
        )
        cols = [c[0] for c in cur.description]
        rows = [dict(zip(cols, r)) for r in cur.fetchall()]
        for r in rows:
            if r.get("SessionDate"): r["SessionDate"] = str(r["SessionDate"])
            if r.get("CreatedAt"):   r["CreatedAt"]   = str(r["CreatedAt"])
        conn.close()
        return jsonify({"success": True, "symbol": symbol, "rows": rows})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def backfill_daily_avg_actuals():
    """
    Fills ActualNextDayClose / AbsoluteError / SignedError on rows where the
    next trading day has elapsed. Intended to be called once per day after
    close. Uses yfinance (imported lazily to avoid a hard dep at module load).
    """
    try:
        import yfinance as yf
        import pandas as pd
    except Exception as e:
        return jsonify({"success": False, "error": f"yfinance import failed: {e}"}), 500

    try:
        conn = pyodbc.connect(CONN_STR_NSE); cur = conn.cursor()
        cur.execute(
            """
            SELECT DailyAvgID, Symbol, SessionDate, PredictedNextDayPrice
            FROM dbo.DailyAvgPredictions
            WHERE ActualNextDayClose IS NULL
              AND SessionDate < CAST(GETDATE() AS DATE)
            """
        )
        pending = cur.fetchall()
        filled  = 0
        errors  = []
        for row in pending:
            daily_id, symbol, session_date, pred_price = row
            try:
                t = yf.Ticker(f"{symbol}.NS")
                # Query a few days after session_date to catch the next trading day
                start = pd.Timestamp(session_date) + pd.Timedelta(days=1)
                end   = start + pd.Timedelta(days=6)
                hist  = t.history(start=start.date().isoformat(), end=end.date().isoformat())
                if hist is None or hist.empty:
                    continue
                actual_close = float(hist['Close'].iloc[0])
                signed       = actual_close - float(pred_price or 0)
                abs_err      = abs(signed)
                cur.execute(
                    """
                    UPDATE dbo.DailyAvgPredictions
                    SET ActualNextDayClose = ?, AbsoluteError = ?, SignedError = ?
                    WHERE DailyAvgID = ?
                    """,
                    actual_close, abs_err, signed, daily_id,
                )
                filled += 1
            except Exception as row_err:
                errors.append(f"{symbol}/{session_date}: {row_err}")
        conn.commit(); conn.close()
        return jsonify({"success": True, "filled": filled, "pending": len(pending), "errors": errors})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
