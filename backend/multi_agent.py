"""
Multi-Agent Simulation Engine for AmeyaFX
5 Specialized AI Agents + Orchestrator for stock analysis consensus.

Agents:
  1. Technical Analyst — reads indicator signals
  2. Reddit Sentiment — social media sentiment analysis
  3. Fundamental Analyst — valuation & financial health
  4. ML Forecast — interprets ML model outputs
  5. Risk Manager — volatility, drawdown, risk assessment

The Orchestrator collects all reports and sends to Groq LLM for debate/consensus.
"""
import os
import json
import time
import requests
import numpy as np
import sys
from datetime import datetime

from reddit_sentiment import scrape_reddit_sentiment, get_status as get_reddit_status


def _safe_print(msg):
    """Print that handles Windows cp1252 encoding by replacing unencodable chars."""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))


# ═══════════════════════════════════════════════════════
# AGENT BASE CLASS
# ═══════════════════════════════════════════════════════
class BaseAgent:
    """Base class for all analysis agents."""
    name = 'Base Agent'
    emoji = '🤖'
    role = 'General Analyst'

    def analyze(self, symbol, data):
        """Override in subclass. Returns a structured report dict."""
        raise NotImplementedError

    def _report(self, verdict, confidence, summary, details=None):
        return {
            'agent': self.name,
            'emoji': self.emoji,
            'role': self.role,
            'verdict': verdict,           # BUY / SELL / HOLD
            'confidence': confidence,     # 0-100
            'summary': summary,           # 1-2 sentence summary
            'details': details or {},     # structured details
            'timestamp': datetime.now().isoformat(),
        }


# ═══════════════════════════════════════════════════════
# AGENT 1: TECHNICAL ANALYST
# ═══════════════════════════════════════════════════════
class TechnicalAnalystAgent(BaseAgent):
    name = 'Technical Analyst'
    emoji = '📊'
    role = 'Reads indicator signals and chart patterns'

    def analyze(self, symbol, data):
        indicators = data.get('indicators', {})
        indicator_signals = data.get('indicatorSignals', [])

        rsi = indicators.get('rsi', 50)
        macd = indicators.get('macd', 0)
        macd_signal = indicators.get('macd_signal', 0)
        bb_pct = indicators.get('bb_pct', 0.5)
        stoch_k = indicators.get('stoch_k', 50)
        cci = indicators.get('cci', 0)
        williams_r = indicators.get('williams_r', -50)
        volume_ratio = indicators.get('volume_ratio', 1.0)
        momentum = indicators.get('momentum', 0)
        ma20 = indicators.get('ma20', 0)
        ma50 = indicators.get('ma50', 0)
        ma200 = indicators.get('ma200', 0)
        current_price = data.get('currentPrice', 0)
        atr = indicators.get('atr', 0)

        # Count buy/sell signals
        buy_signals = 0
        sell_signals = 0
        total_signals = 0

        # RSI
        if rsi < 30:
            buy_signals += 1.5  # Strong oversold
        elif rsi < 40:
            buy_signals += 0.5
        elif rsi > 70:
            sell_signals += 1.5  # Strong overbought
        elif rsi > 60:
            sell_signals += 0.5
        total_signals += 1

        # MACD
        if macd > macd_signal:
            buy_signals += 1
        else:
            sell_signals += 1
        total_signals += 1

        # Bollinger
        if bb_pct < 0.2:
            buy_signals += 1
        elif bb_pct > 0.8:
            sell_signals += 1
        total_signals += 1

        # Stochastic
        if stoch_k < 20:
            buy_signals += 1
        elif stoch_k > 80:
            sell_signals += 1
        total_signals += 1

        # CCI
        if cci < -100:
            buy_signals += 0.5
        elif cci > 100:
            sell_signals += 0.5
        total_signals += 1

        # Moving averages
        ma_buy = 0
        ma_sell = 0
        if current_price and ma20:
            if current_price > ma20:
                ma_buy += 1
            else:
                ma_sell += 1
        if current_price and ma50:
            if current_price > ma50:
                ma_buy += 1
            else:
                ma_sell += 1
        if current_price and ma200:
            if current_price > ma200:
                ma_buy += 1.5  # Long-term trend is more significant
            else:
                ma_sell += 1.5
        buy_signals += ma_buy
        sell_signals += ma_sell
        total_signals += 3

        # Volume
        if volume_ratio > 1.5:
            buy_signals += 0.5  # High volume confirms
        elif volume_ratio < 0.5:
            sell_signals += 0.3

        # Momentum
        if momentum > 0:
            buy_signals += 0.5
        elif momentum < 0:
            sell_signals += 0.5

        # Golden/Death cross
        golden_cross = ma50 > 0 and ma200 > 0 and ma50 > ma200
        death_cross = ma50 > 0 and ma200 > 0 and ma50 < ma200

        # Determine verdict
        net = buy_signals - sell_signals
        if net > 2:
            verdict = 'BUY'
        elif net < -2:
            verdict = 'SELL'
        else:
            verdict = 'HOLD'

        confidence = min(95, max(20, 50 + abs(net) * 8))

        # Build summary
        bullish_indicators = []
        bearish_indicators = []
        if rsi < 35:
            bullish_indicators.append(f"RSI oversold ({rsi:.0f})")
        elif rsi > 65:
            bearish_indicators.append(f"RSI overbought ({rsi:.0f})")
        if macd > macd_signal:
            bullish_indicators.append("MACD bullish crossover")
        else:
            bearish_indicators.append("MACD bearish")
        if golden_cross:
            bullish_indicators.append("Golden Cross (MA50>MA200)")
        if death_cross:
            bearish_indicators.append("Death Cross (MA50<MA200)")

        summary_parts = []
        if bullish_indicators:
            summary_parts.append(f"Bullish: {', '.join(bullish_indicators[:3])}")
        if bearish_indicators:
            summary_parts.append(f"Bearish: {', '.join(bearish_indicators[:3])}")
        summary = '. '.join(summary_parts) or 'Mixed signals across indicators.'

        return self._report(verdict, confidence, summary, {
            'rsi': rsi,
            'macd': macd,
            'macd_signal': macd_signal,
            'bb_pct': bb_pct,
            'stoch_k': stoch_k,
            'cci': cci,
            'williams_r': williams_r,
            'volume_ratio': volume_ratio,
            'momentum': momentum,
            'buy_signals': round(buy_signals, 1),
            'sell_signals': round(sell_signals, 1),
            'net_score': round(net, 1),
            'golden_cross': golden_cross,
            'death_cross': death_cross,
            'ma_alignment': 'bullish' if ma_buy > ma_sell else 'bearish' if ma_sell > ma_buy else 'mixed',
            'atr': atr,
        })


# ═══════════════════════════════════════════════════════
# AGENT 2: REDDIT SENTIMENT
# ═══════════════════════════════════════════════════════
class RedditSentimentAgent(BaseAgent):
    name = 'Reddit Sentiment'
    emoji = '📰'
    role = 'Social media sentiment analysis from Reddit'

    def analyze(self, symbol, data):
        sentiment_data = scrape_reddit_sentiment(symbol)

        score = sentiment_data.get('sentiment_score', 0)
        label = sentiment_data.get('sentiment_label', 'Neutral')
        post_count = sentiment_data.get('post_count', 0)
        bullish = sentiment_data.get('bullish_count', 0)
        bearish = sentiment_data.get('bearish_count', 0)
        neutral = sentiment_data.get('neutral_count', 0)
        top_posts = sentiment_data.get('top_posts', [])

        # Determine verdict
        if score > 0.25:
            verdict = 'BUY'
        elif score < -0.25:
            verdict = 'SELL'
        else:
            verdict = 'HOLD'

        # Confidence based on post count and score strength
        if post_count == 0:
            confidence = 15  # No data = low confidence
        elif post_count < 5:
            confidence = max(25, min(50, abs(score) * 100))
        else:
            confidence = max(30, min(85, 40 + abs(score) * 80 + min(post_count, 20)))

        # Summary
        if post_count == 0:
            summary = f"No Reddit discussions found for {symbol} in the past week."
        else:
            top_subs = list(set(p['subreddit'] for p in top_posts[:5]))
            summary = (
                f"Reddit sentiment is {label.lower()} ({score:+.2f}) across {post_count} posts. "
                f"Bullish: {bullish}, Bearish: {bearish}, Neutral: {neutral}. "
                f"Active in: {', '.join(top_subs[:3])}."
            )

        return self._report(verdict, confidence, summary, {
            'sentiment_score': score,
            'sentiment_label': label,
            'post_count': post_count,
            'bullish_count': bullish,
            'bearish_count': bearish,
            'neutral_count': neutral,
            'top_posts': top_posts[:5],  # Limit for response size
            'demo_mode': False,  # Always real data via public JSON API
            'source': sentiment_data.get('source', 'reddit_public_json'),
            'subreddits_searched': sentiment_data.get('subreddits_searched', []),
        })


# ═══════════════════════════════════════════════════════
# AGENT 3: FUNDAMENTAL ANALYST
# ═══════════════════════════════════════════════════════
class FundamentalAgent(BaseAgent):
    name = 'Fundamental Analyst'
    emoji = '💰'
    role = 'Evaluates valuation metrics and financial health'

    def analyze(self, symbol, data):
        financials = data.get('financials', {})

        pe = financials.get('pe', None)
        pb = financials.get('pb', None)
        roe = financials.get('roe', None)
        de = financials.get('debtToEquity', None)
        dividend_yield = financials.get('dividendYield', None)
        market_cap = financials.get('marketCap', None)
        eps = financials.get('eps', None)
        revenue = financials.get('revenue', None)
        net_income = financials.get('netIncome', None)
        free_cashflow = financials.get('freeCashflow', None)
        profit_margin = financials.get('profitMargin', None)
        sector = data.get('sector', 'Unknown')

        score = 0  # -5 to +5 range
        signals = []

        # P/E analysis
        if pe is not None and pe > 0:
            if pe < 15:
                score += 1.5
                signals.append(f"Low P/E ({pe:.1f}) — potential value")
            elif pe < 25:
                score += 0.5
                signals.append(f"Moderate P/E ({pe:.1f})")
            elif pe > 50:
                score -= 1.5
                signals.append(f"High P/E ({pe:.1f}) — expensive")
            elif pe > 35:
                score -= 0.5
                signals.append(f"Elevated P/E ({pe:.1f})")

        # ROE analysis
        if roe is not None:
            roe_pct = roe * 100 if abs(roe) < 1 else roe
            if roe_pct > 20:
                score += 1.5
                signals.append(f"Excellent ROE ({roe_pct:.1f}%)")
            elif roe_pct > 12:
                score += 0.5
                signals.append(f"Good ROE ({roe_pct:.1f}%)")
            elif roe_pct < 5:
                score -= 1
                signals.append(f"Weak ROE ({roe_pct:.1f}%)")

        # Debt/Equity
        if de is not None:
            if de < 0.3:
                score += 1
                signals.append(f"Low debt (D/E: {de:.2f})")
            elif de > 1.5:
                score -= 1
                signals.append(f"High debt (D/E: {de:.2f})")

        # Profit margins
        if profit_margin is not None:
            pm_pct = profit_margin * 100 if abs(profit_margin) < 1 else profit_margin
            if pm_pct > 20:
                score += 0.5
                signals.append(f"Strong margins ({pm_pct:.1f}%)")
            elif pm_pct < 5:
                score -= 0.5
                signals.append(f"Thin margins ({pm_pct:.1f}%)")

        # Dividend yield
        if dividend_yield is not None:
            dy_pct = dividend_yield * 100 if dividend_yield < 1 else dividend_yield
            if dy_pct > 3:
                score += 0.5
                signals.append(f"Good dividend ({dy_pct:.1f}%)")

        # Free cash flow
        if free_cashflow is not None:
            if free_cashflow > 0:
                score += 0.5
                signals.append("Positive free cash flow")
            else:
                score -= 0.5
                signals.append("Negative free cash flow ⚠️")

        # Determine verdict
        if score > 1.5:
            verdict = 'BUY'
        elif score < -1.5:
            verdict = 'SELL'
        else:
            verdict = 'HOLD'

        # Confidence based on data availability
        data_points = sum(1 for v in [pe, pb, roe, de, profit_margin, dividend_yield, free_cashflow] if v is not None)
        confidence = max(20, min(85, 30 + data_points * 8 + abs(score) * 5))

        if not signals:
            summary = f"Limited financial data available for {symbol}."
        else:
            summary = '. '.join(signals[:4]) + '.'

        return self._report(verdict, confidence, summary, {
            'pe': pe,
            'pb': pb,
            'roe': roe,
            'debtToEquity': de,
            'dividendYield': dividend_yield,
            'profitMargin': profit_margin,
            'freeCashflow': free_cashflow,
            'marketCap': market_cap,
            'eps': eps,
            'fundamental_score': round(score, 1),
            'data_points_available': data_points,
            'sector': sector,
        })


# ═══════════════════════════════════════════════════════
# AGENT 4: ML FORECAST
# ═══════════════════════════════════════════════════════
class MLForecastAgent(BaseAgent):
    name = 'ML Forecast'
    emoji = '📈'
    role = 'Interprets ML model predictions and confidence'

    def analyze(self, symbol, data):
        tf_predictions = data.get('timeframePredictions', [])
        price_forecasts = data.get('priceForecastsByTimeframe', {})
        overall_signal = data.get('overallSignal', 'HOLD')
        buy_votes = data.get('buyVotes', 0)
        hold_votes = data.get('holdVotes', 0)
        sell_votes = data.get('sellVotes', 0)

        if not tf_predictions:
            return self._report('HOLD', 20,
                                f"ML predictions not yet loaded for {symbol}. Run ML analysis first.",
                                {'ml_loaded': False})

        # Analyze timeframe predictions
        buy_count = 0
        sell_count = 0
        hold_count = 0
        total_accuracy = 0
        accuracies = []
        timeframe_details = []

        for tf in tf_predictions:
            sig = tf.get('signal', 'HOLD')
            acc = tf.get('accuracy', 0)
            accuracies.append(acc)
            total_accuracy += acc

            if sig == 'BUY':
                buy_count += 1
            elif sig == 'SELL':
                sell_count += 1
            else:
                hold_count += 1

            key = tf.get('key', '')
            pf = price_forecasts.get(key, {})
            timeframe_details.append({
                'timeframe': tf.get('timeframe', 'Unknown'),
                'signal': sig,
                'accuracy': acc,
                'price_target': pf.get('price'),
                'change_pct': pf.get('changePercent'),
            })

        avg_accuracy = total_accuracy / len(tf_predictions) if tf_predictions else 0

        # Check for short vs long term conflicts
        short_signals = [tf['signal'] for tf in tf_predictions[:2]]  # Tomorrow, Week
        long_signals = [tf['signal'] for tf in tf_predictions[2:]]    # Month, 3M, Year
        conflict = (
            any(s == 'BUY' for s in short_signals) and any(s == 'SELL' for s in long_signals)
        ) or (
            any(s == 'SELL' for s in short_signals) and any(s == 'BUY' for s in long_signals)
        )

        # Determine verdict
        if buy_count > sell_count + hold_count:
            verdict = 'BUY'
        elif sell_count > buy_count + hold_count:
            verdict = 'SELL'
        elif buy_count > sell_count:
            verdict = 'BUY'
        elif sell_count > buy_count:
            verdict = 'SELL'
        else:
            verdict = 'HOLD'

        confidence = max(25, min(85, avg_accuracy * 0.8 + abs(buy_count - sell_count) * 8))

        # Summary
        summary_parts = []
        summary_parts.append(
            f"ML ensemble ({len(tf_predictions)} timeframes): "
            f"{buy_count} BUY, {hold_count} HOLD, {sell_count} SELL votes."
        )
        if avg_accuracy > 0:
            summary_parts.append(f"Avg accuracy: {avg_accuracy:.1f}%.")
        if conflict:
            summary_parts.append("⚠️ Short vs long term signal conflict detected.")

        # Price forecast summary
        year_forecast = price_forecasts.get('next_year', {})
        if year_forecast.get('changePercent'):
            summary_parts.append(
                f"Year target: ₹{year_forecast.get('price', '?')} ({year_forecast['changePercent']:+.1f}%)."
            )

        return self._report(verdict, confidence, ' '.join(summary_parts), {
            'ml_loaded': True,
            'buy_votes': buy_count,
            'hold_votes': hold_count,
            'sell_votes': sell_count,
            'avg_accuracy': round(avg_accuracy, 1),
            'timeframe_details': timeframe_details,
            'short_long_conflict': conflict,
            'overall_signal': overall_signal,
        })


# ═══════════════════════════════════════════════════════
# AGENT 5: RISK MANAGER
# ═══════════════════════════════════════════════════════
class RiskManagerAgent(BaseAgent):
    name = 'Risk Manager'
    emoji = '⚠️'
    role = 'Assesses volatility, risk, and position sizing'

    def analyze(self, symbol, data):
        indicators = data.get('indicators', {})
        financials = data.get('financials', {})
        current_price = data.get('currentPrice', 0)

        atr = indicators.get('atr', 0)
        volume_ratio = indicators.get('volume_ratio', 1.0)
        bb_pct = indicators.get('bb_pct', 0.5)
        rsi = indicators.get('rsi', 50)
        daily_vol_pct = data.get('dailyVolPct', 0)

        # Risk factors
        risk_score = 0  # 0 (low risk) to 10 (extreme risk)
        risk_factors = []

        # Volatility
        if atr and current_price:
            atr_pct = (atr / current_price) * 100
            if atr_pct > 4:
                risk_score += 3
                risk_factors.append(f"High volatility (ATR {atr_pct:.1f}% of price)")
            elif atr_pct > 2:
                risk_score += 1.5
                risk_factors.append(f"Moderate volatility (ATR {atr_pct:.1f}%)")
            else:
                risk_factors.append(f"Low volatility (ATR {atr_pct:.1f}%)")

        # Volume anomaly
        if volume_ratio > 3:
            risk_score += 1.5
            risk_factors.append(f"Unusual volume ({volume_ratio:.1f}x avg) — potential event risk")
        elif volume_ratio < 0.3:
            risk_score += 1
            risk_factors.append(f"Very low volume ({volume_ratio:.1f}x avg) — liquidity risk")

        # Extreme RSI
        if rsi > 80 or rsi < 20:
            risk_score += 1.5
            risk_factors.append(f"Extreme RSI ({rsi:.0f}) — mean reversion risk")

        # Bollinger Band extreme
        if bb_pct > 1.0 or bb_pct < 0.0:
            risk_score += 1
            risk_factors.append("Price outside Bollinger Bands — extended move")

        # Debt risk
        de = financials.get('debtToEquity')
        if de is not None and de > 2:
            risk_score += 1.5
            risk_factors.append(f"High leverage (D/E: {de:.1f})")

        # Daily change risk
        if daily_vol_pct is not None and abs(daily_vol_pct) > 5:
            risk_score += 1
            risk_factors.append(f"Large daily move ({daily_vol_pct:+.1f}%)")

        # Determine risk level
        if risk_score > 6:
            risk_level = 'HIGH'
        elif risk_score > 3:
            risk_level = 'MEDIUM'
        else:
            risk_level = 'LOW'

        # Position sizing recommendation (% of portfolio)
        if risk_level == 'HIGH':
            position_size = '1-2%'
            verdict = 'HOLD'  # Risk manager says hold/reduce when risk is high
        elif risk_level == 'MEDIUM':
            position_size = '3-5%'
            verdict = 'HOLD'
        else:
            position_size = '5-10%'
            verdict = 'BUY'  # Low risk = safe to take positions

        # Suggested stop loss
        stop_loss = None
        if current_price and atr:
            stop_loss = round(current_price - 2 * atr, 2)

        confidence = max(40, min(90, 70 + (5 - abs(risk_score - 5)) * 4))

        summary = f"Risk level: {risk_level} (score {risk_score:.1f}/10). "
        summary += f"Suggested position size: {position_size}. "
        if risk_factors:
            summary += f"Key risks: {', '.join(risk_factors[:3])}."

        return self._report(verdict, confidence, summary, {
            'risk_score': round(risk_score, 1),
            'risk_level': risk_level,
            'position_size': position_size,
            'stop_loss': stop_loss,
            'risk_factors': risk_factors,
            'atr': atr,
            'volume_ratio': volume_ratio,
            'daily_vol_pct': daily_vol_pct,
        })


# ═══════════════════════════════════════════════════════
# ORCHESTRATOR — Collects all reports → Groq LLM consensus
# ═══════════════════════════════════════════════════════
ALL_AGENTS = [
    TechnicalAnalystAgent(),
    RedditSentimentAgent(),
    FundamentalAgent(),
    MLForecastAgent(),
    RiskManagerAgent(),
]


def run_all_agents(symbol, data):
    """Run all 5 agents and return their individual reports."""
    reports = []
    for agent in ALL_AGENTS:
        try:
            t0 = time.time()
            report = agent.analyze(symbol, data)
            report['elapsed_ms'] = int((time.time() - t0) * 1000)
            reports.append(report)
            _safe_print(f"   {agent.emoji} {agent.name}: {report['verdict']} ({report['confidence']}%) - {report['elapsed_ms']}ms")
        except Exception as e:
            _safe_print(f"   [X] {agent.name} failed: {e}")
            reports.append({
                'agent': agent.name,
                'emoji': agent.emoji,
                'role': agent.role,
                'verdict': 'HOLD',
                'confidence': 10,
                'summary': f'Agent error: {str(e)}',
                'details': {'error': str(e)},
                'elapsed_ms': 0,
            })
    return reports


def _build_consensus_prompt(symbol, data, reports):
    """Build the LLM prompt for consensus debate."""
    current_price = data.get('currentPrice', 'N/A')
    name = data.get('name', symbol)
    sector = data.get('sector', 'Unknown')

    # Format each agent's report
    agent_sections = []
    for r in reports:
        agent_sections.append(
            f"### {r['emoji']} {r['agent']} ({r['role']})\n"
            f"**Verdict:** {r['verdict']} | **Confidence:** {r['confidence']}%\n"
            f"**Analysis:** {r['summary']}\n"
        )
    agents_text = '\n'.join(agent_sections)

    # Tally votes
    buy = sum(1 for r in reports if r['verdict'] == 'BUY')
    sell = sum(1 for r in reports if r['verdict'] == 'SELL')
    hold = sum(1 for r in reports if r['verdict'] == 'HOLD')

    # Weighted confidence
    total_conf = sum(r['confidence'] for r in reports)
    buy_conf = sum(r['confidence'] for r in reports if r['verdict'] == 'BUY')
    sell_conf = sum(r['confidence'] for r in reports if r['verdict'] == 'SELL')

    prompt = f"""You are the Chief Investment Officer at a top Indian trading firm. You are leading a panel of 5 specialist agents who have analyzed {symbol} ({name}).

=== STOCK CONTEXT ===
Symbol: {symbol} | Company: {name} | Sector: {sector}
Current Price: ₹{current_price}

=== AGENT REPORTS ===
{agents_text}

=== VOTE TALLY ===
BUY: {buy} votes (weighted confidence: {buy_conf})
HOLD: {hold} votes
SELL: {sell} votes (weighted confidence: {sell_conf})
Total confidence: {total_conf}

=== YOUR TASK ===
As CIO, synthesize these 5 perspectives into a final trading decision. Write exactly these sections:

**🏛️ Consensus Verdict**
State the final decision (STRONG BUY / BUY / HOLD / SELL / STRONG SELL) with overall confidence %.
One sentence explaining the rationale.

**⚔️ Debate Summary**
2-3 sentences summarizing where the agents agree and disagree. Note any significant conflicts.

**📊 Key Arguments**
- Top 2 bullish arguments (from agents that said BUY)
- Top 2 bearish arguments (from agents that said SELL)
- Key risk flags

**🎯 Action Plan**
- Entry point / timing suggestion
- Position size recommendation
- Stop loss level (if available from Risk Manager)
- Key catalysts to watch

**⚠️ Disclaimer**
"This is AI-generated multi-agent analysis for educational purposes only. Not SEBI-registered financial advice. Always consult a qualified financial advisor."

Keep the response concise and data-grounded. Do NOT invent numbers. Cite which agent raised each point.
"""
    return prompt


def generate_consensus(symbol, data, reports):
    """Send all agent reports to Groq LLM for consensus verdict."""
    groq_api_key = os.environ.get('GROQ_API_KEY', '')
    if not groq_api_key:
        # Fallback: simple vote-based consensus without LLM
        return _simple_consensus(symbol, reports)

    prompt = _build_consensus_prompt(symbol, data, reports)

    try:
        resp = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={
                'Authorization': f'Bearer {groq_api_key}',
                'Content-Type': 'application/json',
            },
            json={
                'model': 'openai/gpt-oss-120b',
                'messages': [{'role': 'user', 'content': prompt}],
                'max_tokens': 1200,
                'temperature': 0.4,
            },
            timeout=30,
        )

        if resp.status_code != 200:
            print(f"   WARN: Groq API error {resp.status_code}, falling back to simple consensus")
            return _simple_consensus(symbol, reports)

        data_resp = resp.json()
        report_text = data_resp['choices'][0]['message']['content']
        usage = data_resp.get('usage', {})

        return {
            'consensus_report': report_text,
            'model': 'openai/gpt-oss-120b',
            'tokens': usage.get('total_tokens', 0),
            'llm_powered': True,
        }

    except Exception as e:
        print(f"   WARN: Groq consensus failed ({e}), using simple consensus")
        return _simple_consensus(symbol, reports)


def _simple_consensus(symbol, reports):
    """Simple vote-based consensus when LLM is unavailable."""
    buy_votes = sum(1 for r in reports if r['verdict'] == 'BUY')
    sell_votes = sum(1 for r in reports if r['verdict'] == 'SELL')
    hold_votes = sum(1 for r in reports if r['verdict'] == 'HOLD')

    # Weighted by confidence
    buy_weight = sum(r['confidence'] for r in reports if r['verdict'] == 'BUY')
    sell_weight = sum(r['confidence'] for r in reports if r['verdict'] == 'SELL')
    hold_weight = sum(r['confidence'] for r in reports if r['verdict'] == 'HOLD')

    if buy_weight > sell_weight and buy_weight > hold_weight:
        verdict = 'BUY'
    elif sell_weight > buy_weight and sell_weight > hold_weight:
        verdict = 'SELL'
    else:
        verdict = 'HOLD'

    total = buy_votes + sell_votes + hold_votes
    confidence = max(buy_weight, sell_weight, hold_weight) / (sum(r['confidence'] for r in reports) + 1e-10) * 100

    report_text = (
        f"**🏛️ Consensus Verdict: {verdict}** (confidence: {confidence:.0f}%)\n\n"
        f"Based on {total} agent votes: {buy_votes} BUY, {hold_votes} HOLD, {sell_votes} SELL.\n\n"
        f"**Agent Summaries:**\n"
    )
    for r in reports:
        report_text += f"- {r['emoji']} **{r['agent']}**: {r['verdict']} ({r['confidence']}%) — {r['summary']}\n"

    report_text += (
        f"\n**⚠️ Disclaimer:** This is AI-generated analysis for educational purposes only. "
        f"Not SEBI-registered financial advice."
    )

    return {
        'consensus_report': report_text,
        'model': 'simple-vote',
        'tokens': 0,
        'llm_powered': False,
    }


def run_multi_agent_analysis(symbol, data):
    """
    Main entry point: Run all agents → Generate consensus.

    Args:
        symbol: NSE stock symbol
        data: dict with keys: indicators, financials, currentPrice, name, sector,
              timeframePredictions, priceForecastsByTimeframe, overallSignal, etc.

    Returns dict with:
        - reports: list of individual agent reports
        - consensus: consensus verdict + report
        - meta: timing, agent count, etc.
    """
    _safe_print(f"\n{'='*55}")
    _safe_print(f"Multi-Agent Analysis: {symbol}")
    _safe_print(f"{'='*55}")

    t0 = time.time()

    # Run all agents
    reports = run_all_agents(symbol, data)

    # Generate consensus
    consensus = generate_consensus(symbol, data, reports)

    elapsed = time.time() - t0

    # Extract final verdict from consensus
    final_verdict = 'HOLD'
    if consensus.get('consensus_report'):
        text = consensus['consensus_report'].upper()
        if 'STRONG BUY' in text:
            final_verdict = 'STRONG BUY'
        elif 'STRONG SELL' in text:
            final_verdict = 'STRONG SELL'
        elif 'VERDICT: BUY' in text or 'VERDICT:** BUY' in text:
            final_verdict = 'BUY'
        elif 'VERDICT: SELL' in text or 'VERDICT:** SELL' in text:
            final_verdict = 'SELL'
        else:
            # Fall back to vote tally
            buy = sum(1 for r in reports if r['verdict'] == 'BUY')
            sell = sum(1 for r in reports if r['verdict'] == 'SELL')
            if buy > sell:
                final_verdict = 'BUY'
            elif sell > buy:
                final_verdict = 'SELL'

    _safe_print(f"\nMulti-Agent Analysis complete: {final_verdict} ({elapsed:.1f}s)")

    return {
        'success': True,
        'symbol': symbol,
        'reports': reports,
        'consensus': consensus,
        'final_verdict': final_verdict,
        'meta': {
            'agent_count': len(reports),
            'elapsed_seconds': round(elapsed, 1),
            'timestamp': datetime.now().isoformat(),
            'reddit_status': get_reddit_status(),
        },
    }
