IF DB_ID('AmeyaFX_NSE') IS NULL
BEGIN
    CREATE DATABASE AmeyaFX_NSE;
END
GO

IF DB_ID('AmeyaFX_Volatile') IS NULL
BEGIN
    CREATE DATABASE AmeyaFX_Volatile;
END
GO

USE AmeyaFX_NSE;
GO

IF OBJECT_ID('dbo.StockPredictions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.StockPredictions (
        PredictionID BIGINT IDENTITY(1,1) PRIMARY KEY,
        Symbol NVARCHAR(20) NOT NULL,
        CompanyName NVARCHAR(255) NULL,
        Timeframe NVARCHAR(50) NULL,
        Signal NVARCHAR(20) NOT NULL,
        Accuracy DECIMAL(6,2) NULL,
        BuyProb DECIMAL(6,2) NULL,
        SellProb DECIMAL(6,2) NULL,
        HoldProb DECIMAL(6,2) NULL,
        CurrentPrice DECIMAL(18,4) NULL,
        PredictedPrice DECIMAL(18,4) NULL,
        RSI DECIMAL(10,4) NULL,
        MACD DECIMAL(10,4) NULL,
        OverallSignal NVARCHAR(20) NULL,
        UserNote NVARCHAR(1000) NULL,
        SavedAt DATETIME2 NOT NULL CONSTRAINT DF_StockPredictions_SavedAt DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_StockPredictions_Symbol_SavedAt')
BEGIN
    CREATE INDEX IX_StockPredictions_Symbol_SavedAt
        ON dbo.StockPredictions(Symbol, SavedAt DESC);
END
GO

IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        UserID BIGINT IDENTITY(1,1) PRIMARY KEY,
        FullName NVARCHAR(255) NOT NULL,
        Email NVARCHAR(320) NOT NULL,
        PasswordHash NVARCHAR(500) NOT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME()
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Users_Email')
BEGIN
    CREATE UNIQUE INDEX UQ_Users_Email ON dbo.Users(Email);
END
GO

-- ============================================================================
-- Hourly intraday predictions
-- Design: 6 rows per Symbol per SessionDate (one per trading-session hour).
-- Populated by POST /api/hourly/run-batch hourly during session (external cron
-- or internal scheduler).
-- ============================================================================
IF OBJECT_ID('dbo.HourlyPredictions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HourlyPredictions (
        HourlyID BIGINT IDENTITY(1,1) PRIMARY KEY,
        Symbol NVARCHAR(20) NOT NULL,
        SessionDate DATE NOT NULL,
        HourSlot INT NOT NULL,                           -- 1..6 (9:15, 10:15, ..., 14:15 IST)
        RecordedAt DATETIME2 NOT NULL CONSTRAINT DF_Hourly_RecordedAt DEFAULT SYSUTCDATETIME(),
        CurrentPrice DECIMAL(18,4) NULL,
        SignalTomorrow NVARCHAR(20) NULL,                -- reconciled signal
        BuyProb DECIMAL(6,2) NULL,
        SellProb DECIMAL(6,2) NULL,
        HoldProb DECIMAL(6,2) NULL,
        PredictedNextDayPrice DECIMAL(18,4) NULL,
        PredictedNextDayChangePct DECIMAL(8,4) NULL,
        RSI DECIMAL(10,4) NULL,
        MACD DECIMAL(10,4) NULL
    );
    CREATE UNIQUE INDEX UQ_Hourly_Symbol_Date_Slot
        ON dbo.HourlyPredictions(Symbol, SessionDate, HourSlot);
    CREATE INDEX IX_Hourly_Symbol_RecordedAt
        ON dbo.HourlyPredictions(Symbol, RecordedAt DESC);
END
GO

-- ============================================================================
-- End-of-day average-based predictions
-- Design: 1 row per Symbol per SessionDate. Captures the day's OHLC, computes
-- the day's average price (OHLC mean + typical-price + open-low avg), and uses
-- that as context for a next-day prediction. Populated by
-- POST /api/dailyavg/run-batch once after market close (external cron or
-- internal scheduler).
-- ActualNextDayClose / AbsoluteError / SignedError are backfilled the day
-- after by a maintenance call so prediction quality can be tracked.
-- ============================================================================
IF OBJECT_ID('dbo.DailyAvgPredictions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.DailyAvgPredictions (
        DailyAvgID BIGINT IDENTITY(1,1) PRIMARY KEY,
        Symbol NVARCHAR(20) NOT NULL,
        SessionDate DATE NOT NULL,
        OpenPrice DECIMAL(18,4) NULL,
        HighPrice DECIMAL(18,4) NULL,
        LowPrice DECIMAL(18,4) NULL,
        ClosePrice DECIMAL(18,4) NULL,
        OHLCAvgPrice DECIMAL(18,4) NULL,                 -- (O+H+L+C)/4
        TypicalPrice DECIMAL(18,4) NULL,                 -- (H+L+C)/3
        OpenLowAvgPrice DECIMAL(18,4) NULL,              -- (O+L)/2 — as spec'd
        PredictedNextDayPrice DECIMAL(18,4) NULL,
        PredictedNextDayChangePct DECIMAL(8,4) NULL,
        PredictedNextDaySignal NVARCHAR(20) NULL,
        ActualNextDayClose DECIMAL(18,4) NULL,
        AbsoluteError DECIMAL(18,4) NULL,
        SignedError DECIMAL(18,4) NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_DailyAvg_CreatedAt DEFAULT SYSUTCDATETIME()
    );
    CREATE UNIQUE INDEX UQ_DailyAvg_Symbol_Date
        ON dbo.DailyAvgPredictions(Symbol, SessionDate);
    CREATE INDEX IX_DailyAvg_Symbol_SessionDate
        ON dbo.DailyAvgPredictions(Symbol, SessionDate DESC);
END
GO


USE AmeyaFX_Volatile;
GO

IF OBJECT_ID('dbo.VolatilePredictions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.VolatilePredictions (
        VolatilePredictionID BIGINT IDENTITY(1,1) PRIMARY KEY,
        Symbol NVARCHAR(20) NOT NULL,
        CompanyName NVARCHAR(255) NULL,
        Signal NVARCHAR(20) NULL,
        Confidence DECIMAL(6,2) NULL,
        CurrentPrice DECIMAL(18,4) NULL,
        PriceChange DECIMAL(18,4) NULL,
        PriceChangePct DECIMAL(8,4) NULL,
        RSI DECIMAL(10,4) NULL,
        MACD DECIMAL(10,4) NULL,
        VolumeRatio DECIMAL(10,4) NULL,
        VolatilityScore DECIMAL(10,4) NULL,
        BatchRunAt DATETIME2 NOT NULL
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VolatilePredictions_BatchRunAt')
BEGIN
    CREATE INDEX IX_VolatilePredictions_BatchRunAt
        ON dbo.VolatilePredictions(BatchRunAt DESC);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_VolatilePredictions_Symbol_BatchRunAt')
BEGIN
    CREATE INDEX IX_VolatilePredictions_Symbol_BatchRunAt
        ON dbo.VolatilePredictions(Symbol, BatchRunAt DESC);
END
GO

-- Verification
USE AmeyaFX_NSE;
SELECT TOP 5 * FROM dbo.StockPredictions ORDER BY SavedAt DESC;
GO

USE AmeyaFX_Volatile;
SELECT TOP 5 * FROM dbo.VolatilePredictions ORDER BY BatchRunAt DESC;
GO
