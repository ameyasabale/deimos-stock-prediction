import pyodbc
from datetime import datetime
from flask import request, jsonify

# DB 1: AmeyaFX_NSE -> individual stock predictions
# DB 2: AmeyaFX_Volatile -> 100 volatile stocks batch
CONN_STR_NSE = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=AmeyaFX_NSE;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

CONN_STR_VOLATILE = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=.\\SQLEXPRESS;"
    "DATABASE=AmeyaFX_Volatile;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)


def _to_float(value):
    try:
        return float(value) if value is not None and value != "" else None
    except Exception:
        return None


def _forecast_key_from_timeframe(timeframe):
    return {
        "Tomorrow": "tomorrow",
        "Next Week": "next_week",
        "Next Month": "next_month",
        "Next 3 Months": "next_3m",
        "Next Year": "next_year",
    }.get(str(timeframe))


def save_prediction():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "No data provided"}), 400

    if not data.get("symbol"):
        return jsonify({"success": False, "error": "Missing required field: symbol"}), 400

    try:
        conn = pyodbc.connect(CONN_STR_NSE)
        cursor = conn.cursor()

        timeframe_predictions = data.get("timeframePredictions") or []
        forecasts = data.get("priceForecastsByTimeframe") or {}
        rows = []

        if isinstance(timeframe_predictions, list) and timeframe_predictions:
            for tf in timeframe_predictions:
                timeframe_label = tf.get("timeframe")
                forecast_key = _forecast_key_from_timeframe(timeframe_label)
                tf_forecast = forecasts.get(forecast_key, {}) if forecast_key else {}
                rows.append(
                    (
                        data.get("symbol"),
                        data.get("companyName", ""),
                        timeframe_label or "Overall",
                        tf.get("signal", "HOLD"),
                        _to_float(tf.get("accuracy")),
                        _to_float(tf.get("buyProb")),
                        _to_float(tf.get("sellProb")),
                        _to_float(tf.get("holdProb")),
                        _to_float(data.get("currentPrice")),
                        _to_float(tf_forecast.get("price")),
                        _to_float(data.get("rsi")),
                        _to_float(data.get("macd")),
                        data.get("overallSignal", data.get("signal", "HOLD")),
                        data.get("userNote", ""),
                    )
                )
        else:
            if not data.get("signal"):
                conn.close()
                return jsonify({"success": False, "error": "Missing required field: signal"}), 400
            rows.append(
                (
                    data.get("symbol"),
                    data.get("companyName", ""),
                    data.get("timeframe", "Overall"),
                    data.get("signal"),
                    _to_float(data.get("accuracy")),
                    _to_float(data.get("buyProb")),
                    _to_float(data.get("sellProb")),
                    _to_float(data.get("holdProb")),
                    _to_float(data.get("currentPrice")),
                    _to_float(data.get("predictedPrice")),
                    _to_float(data.get("rsi")),
                    _to_float(data.get("macd")),
                    data.get("overallSignal", data.get("signal")),
                    data.get("userNote", ""),
                )
            )

        cursor.executemany(
            """
            INSERT INTO StockPredictions (
                Symbol, CompanyName, Timeframe, Signal,
                Accuracy, BuyProb, SellProb, HoldProb,
                CurrentPrice, PredictedPrice,
                RSI, MACD, OverallSignal, UserNote
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            rows,
        )

        conn.commit()
        conn.close()

        return jsonify(
            {
                "success": True,
                "savedRows": len(rows),
                "message": f"Saved {len(rows)} prediction row(s) for {data.get('symbol')} to MSSQL successfully",
            }
        )
    except pyodbc.Error as e:
        return jsonify({"success": False, "error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def save_volatile_batch():
    data = request.get_json()
    stocks = data.get("stocks", []) if data else []

    if not stocks:
        return jsonify({"success": False, "error": "No stocks provided"}), 400

    saved = 0
    errors = []
    batch_time = datetime.now()

    try:
        conn = pyodbc.connect(CONN_STR_VOLATILE)
        cursor = conn.cursor()

        for s in stocks:
            try:
                cursor.execute(
                    """
                    INSERT INTO VolatilePredictions (
                        Symbol, CompanyName, Signal, Confidence,
                        CurrentPrice, PriceChange, PriceChangePct,
                        RSI, MACD, VolumeRatio, VolatilityScore, BatchRunAt
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    s.get("symbol"),
                    s.get("name", ""),
                    s.get("signal"),
                    s.get("confidence"),
                    s.get("price"),
                    s.get("change"),
                    s.get("changePercent"),
                    s.get("rsi"),
                    s.get("macd"),
                    s.get("volumeRatio"),
                    s.get("volatility", 0),
                    batch_time,
                )
                saved += 1
            except Exception as row_err:
                errors.append(f"{s.get('symbol')}: {str(row_err)}")

        conn.commit()
        conn.close()

        return jsonify(
            {
                "success": True,
                "saved": saved,
                "total": len(stocks),
                "errors": errors,
                "message": f"Saved {saved} of {len(stocks)} predictions to AmeyaFX_Volatile MSSQL",
            }
        )
    except pyodbc.Error as e:
        return jsonify({"success": False, "error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


def get_prediction_history(symbol):
    try:
        conn = pyodbc.connect(CONN_STR_NSE)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT TOP 20
                PredictionID, Symbol, CompanyName, Timeframe, Signal,
                Accuracy, BuyProb, SellProb, CurrentPrice, SavedAt
            FROM StockPredictions
            WHERE Symbol = ?
            ORDER BY SavedAt DESC
            """,
            symbol.upper(),
        )

        rows = cursor.fetchall()
        columns = [col[0] for col in cursor.description]
        result = [dict(zip(columns, row)) for row in rows]

        for r in result:
            if r.get("SavedAt"):
                r["SavedAt"] = str(r["SavedAt"])

        conn.close()
        return jsonify({"success": True, "symbol": symbol, "history": result})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
