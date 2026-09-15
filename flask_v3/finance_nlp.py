"""
Finance-Domain NLP Sentiment Analyzer for AmeyaFX/Deimos

Two-tier architecture:
  1. FinBERT (if transformers + torch available) — ProsusAI/finbert 3-class model
  2. FinanceVADER (always available) — VADER + 200+ finance-domain lexicon additions

Usage:
    from finance_nlp import analyze_financial_text, get_nlp_status
    result = analyze_financial_text("Stock surged on strong earnings beat")
    # {'score': 0.82, 'label': 'Bullish', 'confidence': 0.91, 'method': 'finance_vader'}
"""
import re

# ── Try FinBERT (heavy, ~400MB model) ───────────────────
# Lazy-loaded on first use to avoid blocking Flask startup.
FINBERT_AVAILABLE = False
_finbert_pipeline = None
_finbert_init_done = False

def _init_finbert():
    """Lazy-initialize FinBERT pipeline on first call (not at import time)."""
    global FINBERT_AVAILABLE, _finbert_pipeline, _finbert_init_done
    if _finbert_init_done:
        return
    _finbert_init_done = True
    try:
        from transformers import pipeline as _hf_pipeline
        import torch  # noqa: F401
        _finbert_pipeline = _hf_pipeline(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            tokenizer="ProsusAI/finbert",
            device=-1,  # CPU
            top_k=None,
            model_kwargs={"local_files_only": True},
        )
        FINBERT_AVAILABLE = True
        print("   FinBERT loaded OK (cached model)")
    except Exception as e:
        FINBERT_AVAILABLE = False
        # Don't print noisy warnings — FinBERT is optional
        print(f"   FinBERT not available (Finance-VADER will be used): {type(e).__name__}")


# ── VADER base ──────────────────────────────────────────
VADER_AVAILABLE = False
_vader = None

try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    _vader = SentimentIntensityAnalyzer()
    VADER_AVAILABLE = True
except ImportError:
    pass


# ═══════════════════════════════════════════════════════
# FINANCE-DOMAIN LEXICON (200+ terms)
# Added to VADER to make it finance-aware
# ═══════════════════════════════════════════════════════

# Strongly bullish terms (score: +2.5 to +3.5)
STRONG_BULLISH = {
    'breakout': 3.0, 'breakouts': 3.0, 'bullish': 3.0,
    'mooning': 3.5, 'moon': 2.5, 'to the moon': 3.5,
    'skyrocket': 3.5, 'skyrocketing': 3.5, 'skyrocketed': 3.0,
    'surge': 3.0, 'surged': 3.0, 'surging': 3.0,
    'rally': 2.8, 'rallied': 2.8, 'rallying': 2.8,
    'soar': 3.0, 'soared': 3.0, 'soaring': 3.0,
    'outperform': 2.5, 'outperformed': 2.5, 'outperforming': 2.5,
    'upgrade': 2.8, 'upgraded': 2.8, 'upgrades': 2.5,
    'beat': 2.5, 'beats': 2.5, 'beaten': 2.0,
    'earnings beat': 3.0, 'earnings surprise': 2.5,
    'blowout': 3.0, 'blowout quarter': 3.5,
    'record high': 3.0, 'all-time high': 3.2, 'ath': 3.0,
    '52-week high': 2.8, '52 week high': 2.8,
    'golden cross': 3.0, 'death cross reversal': 2.5,
    'short squeeze': 3.0, 'short covering': 2.5,
    'accumulation': 2.5, 'accumulating': 2.5,
    'undervalued': 2.5, 'deep value': 2.8,
    'multibagger': 3.5, 'multi-bagger': 3.5,
    'rocket': 3.0, 'rocketing': 3.0,
    'explode': 2.8, 'exploded': 2.8, 'exploding': 2.8,
    'strong buy': 3.5, 'conviction buy': 3.5,
    'bottom fishing': 2.0, 'oversold bounce': 2.5,
    'turnaround': 2.5, 'recovery play': 2.5,
    'upside': 2.0, 'upside potential': 2.5,
    'buy the dip': 2.5, 'btd': 2.0,
    'value pick': 2.5, 'hidden gem': 3.0,
    'positive guidance': 2.8, 'raised guidance': 3.0,
    'dividend increase': 2.5, 'dividend hike': 2.5,
    'buyback': 2.0, 'share buyback': 2.5,
    'block deal': 1.5, 'bulk deal': 1.5,
    'fii buying': 2.5, 'dii buying': 2.0,
    'institutional buying': 2.5,
}

# Moderately bullish terms (score: +1.0 to +2.0)
MODERATE_BULLISH = {
    'buy': 1.5, 'buying': 1.5, 'bought': 1.0,
    'long': 1.5, 'going long': 2.0,
    'hold': 0.5, 'holding': 0.5,
    'support': 1.0, 'support level': 1.5,
    'bounce': 1.5, 'bounced': 1.5, 'bouncing': 1.5,
    'green': 1.0, 'in the green': 1.5,
    'profit': 1.5, 'profits': 1.5, 'profitable': 1.5,
    'growth': 1.5, 'growing': 1.5, 'grew': 1.0,
    'strong': 1.0, 'strength': 1.0,
    'momentum': 1.0, 'positive momentum': 2.0,
    'uptick': 1.5, 'uptrend': 2.0,
    'bullish engulfing': 2.0, 'hammer': 1.5, 'morning star': 2.0,
    'macd crossover': 1.5, 'rsi oversold': 1.5,
    'volume spike': 1.0, 'high volume': 1.0,
    'sector rotation': 1.0,
    're-rating': 2.0, 'rerated': 2.0,
    'demerger': 1.5, 'bonus': 1.5,
    'stock split': 1.0,
    'capex': 1.0, 'expansion': 1.5,
    'order win': 2.0, 'order book': 1.5,
    'margin expansion': 2.0, 'margin improvement': 2.0,
    'market share gain': 2.0,
    'cost cutting': 1.5, 'efficiency': 1.0,
    'promoter buying': 2.0, 'insider buying': 2.5,
}

# Strongly bearish terms (score: -2.5 to -3.5)
STRONG_BEARISH = {
    'crash': -3.5, 'crashed': -3.5, 'crashing': -3.5,
    'collapse': -3.5, 'collapsed': -3.5, 'collapsing': -3.0,
    'plunge': -3.0, 'plunged': -3.0, 'plunging': -3.0,
    'tank': -3.0, 'tanked': -3.0, 'tanking': -3.0,
    'dump': -3.0, 'dumped': -3.0, 'dumping': -3.0,
    'bearish': -3.0, 'bear market': -3.0,
    'sell off': -3.0, 'selloff': -3.0, 'selling pressure': -2.5,
    'downgrade': -2.8, 'downgraded': -2.8, 'downgrades': -2.5,
    'miss': -2.5, 'missed': -2.5, 'earnings miss': -3.0,
    'loss': -2.0, 'losses': -2.0, 'net loss': -2.5,
    'scam': -3.5, 'fraud': -3.5, 'ponzi': -3.5,
    'bankruptcy': -3.5, 'bankrupt': -3.5,
    'default': -3.0, 'defaulted': -3.0,
    'death cross': -3.0,
    'distribution': -2.5,
    'overvalued': -2.5, 'bubble': -3.0,
    'trap': -2.5, 'bull trap': -3.0,
    'short': -1.5, 'shorting': -2.0, 'shorted': -2.0,
    'strong sell': -3.5, 'avoid': -2.5,
    'red flag': -2.5, 'red flags': -2.8,
    'negative guidance': -2.8, 'lowered guidance': -3.0,
    'profit warning': -3.0, 'revenue warning': -3.0,
    'debt trap': -3.0, 'overleveraged': -2.5,
    'fii selling': -2.5, 'fpi outflow': -2.5,
    'institutional selling': -2.5,
    'promoter selling': -3.0, 'insider selling': -2.5, 'promoter pledge': -2.5,
    'sebi action': -2.5, 'sebi penalty': -2.5,
    'asm': -2.0, 'gsm': -2.5,  # ASM/GSM surveillance
    'circuit': -1.5, 'lower circuit': -3.0, 'upper freeze': 1.0,
    'margin call': -3.0,
}

# Moderately bearish terms (score: -1.0 to -2.0)
MODERATE_BEARISH = {
    'sell': -1.5, 'selling': -1.5, 'sold': -1.0,
    'short': -1.5,
    'decline': -1.5, 'declined': -1.5, 'declining': -1.5,
    'drop': -1.5, 'dropped': -1.5, 'dropping': -1.5,
    'fall': -1.5, 'fell': -1.5, 'falling': -1.5,
    'weak': -1.5, 'weakness': -1.5, 'weakening': -1.5,
    'risk': -1.0, 'risky': -1.5, 'risks': -1.0,
    'concern': -1.0, 'concerns': -1.0, 'concerned': -1.0,
    'uncertainty': -1.5, 'uncertain': -1.5,
    'volatile': -1.0, 'volatility': -0.5,
    'correction': -1.5, 'correcting': -1.5,
    'pullback': -1.0, 'pullbacks': -1.0,
    'resistance': -1.0, 'resistance level': -1.0,
    'overbought': -1.5, 'stretched': -1.0,
    'downtrend': -2.0, 'bearish engulfing': -2.0, 'shooting star': -1.5,
    'evening star': -2.0, 'head and shoulders': -2.0,
    'negative': -1.0, 'disappointing': -2.0, 'disappointed': -1.5,
    'underperform': -2.0, 'underperformed': -2.0,
    'headwinds': -1.5, 'headwind': -1.5,
    'slowdown': -1.5, 'slowing': -1.5,
    'margin compression': -2.0, 'margin pressure': -1.5,
    'debt': -1.0, 'leveraged': -1.0,
    'dilution': -1.5, 'qip': -1.0, 'rights issue': -1.0,
    'exit': -1.5, 'exiting': -1.5,
    'book value erosion': -2.0,
}

# Neutral/context terms (score near 0, but finance-aware)
FINANCE_NEUTRAL = {
    'consolidation': -0.2, 'consolidating': -0.2, 'range-bound': -0.3,
    'sideways': -0.3, 'flat': -0.5,
    'wait and watch': 0.0, 'on radar': 0.3,
    'nifty': 0.0, 'sensex': 0.0, 'nse': 0.0, 'bse': 0.0,
    'market cap': 0.0, 'pe ratio': 0.0, 'eps': 0.0,
    'results': 0.0, 'quarterly': 0.0,
    'ipo': 0.5, 'listing': 0.3,
    'target': 0.3, 'price target': 0.5,
    'stop loss': -0.5, 'sl': -0.3,
    'entry': 0.3, 'entry point': 0.5,
    'breakeven': 0.0,
}

# Combine all lexicons
FINANCE_LEXICON = {}
FINANCE_LEXICON.update(STRONG_BULLISH)
FINANCE_LEXICON.update(MODERATE_BULLISH)
FINANCE_LEXICON.update(STRONG_BEARISH)
FINANCE_LEXICON.update(MODERATE_BEARISH)
FINANCE_LEXICON.update(FINANCE_NEUTRAL)


# ═══════════════════════════════════════════════════════
# FINANCE VADER (Enhanced)
# ═══════════════════════════════════════════════════════

class FinanceVADER:
    """
    VADER sentiment analyzer enhanced with 200+ finance-domain terms.
    Falls back to base VADER if the lexicon update fails.
    """

    def __init__(self):
        if not VADER_AVAILABLE or not _vader:
            self.analyzer = None
            return

        # Clone the VADER analyzer and inject finance terms
        self.analyzer = SentimentIntensityAnalyzer()
        try:
            self.analyzer.lexicon.update(FINANCE_LEXICON)
        except Exception:
            pass  # If lexicon update fails, still works with base VADER

    def analyze(self, text):
        """
        Analyze text sentiment with finance-aware scoring.
        Returns dict: {score, label, confidence, method, details}
        """
        if not self.analyzer or not text:
            return {
                'score': 0.0,
                'label': 'Neutral',
                'confidence': 0.0,
                'method': 'none',
                'details': {},
            }

        # Run VADER with finance lexicon
        scores = self.analyzer.polarity_scores(text)
        compound = scores['compound']

        # Additional finance-context boost
        # Check for multi-word finance phrases that VADER misses
        text_lower = text.lower()
        phrase_boost = 0.0

        # Multi-word phrase detection (VADER only does single words)
        MULTI_WORD_PHRASES = {
            'strong buy': 0.15, 'conviction buy': 0.18,
            'strong sell': -0.15, 'avoid at all costs': -0.20,
            'to the moon': 0.20, 'buy the dip': 0.12,
            'lower circuit': -0.20, 'upper circuit': 0.20,
            'earnings beat': 0.15, 'earnings miss': -0.15,
            'golden cross': 0.15, 'death cross': -0.15,
            'short squeeze': 0.15, 'bull trap': -0.15,
            'margin expansion': 0.10, 'margin compression': -0.10,
            'all time high': 0.12, 'record high': 0.12,
            'promoter buying': 0.12, 'promoter selling': -0.15,
            'fii buying': 0.10, 'fii selling': -0.10,
            'raised guidance': 0.15, 'lowered guidance': -0.15,
            'profit warning': -0.18, 'revenue warning': -0.15,
            'block deal': 0.05, 'bulk deal': 0.05,
            'price target': 0.05, 'target price': 0.05,
            'stop loss hit': -0.10, 'sl hit': -0.08,
            'multi bagger': 0.20, 'hidden gem': 0.15,
            'sebi action': -0.12, 'sebi penalty': -0.15,
            'insider buying': 0.15, 'insider selling': -0.12,
        }

        for phrase, boost in MULTI_WORD_PHRASES.items():
            if phrase in text_lower:
                phrase_boost += boost

        # Clamp phrase boost
        phrase_boost = max(-0.3, min(0.3, phrase_boost))

        # Blend compound with phrase boost
        final_score = compound * 0.75 + phrase_boost * 0.25
        if abs(phrase_boost) > 0.05:
            # If strong phrase signals, weight them more
            final_score = compound * 0.6 + phrase_boost * 0.4

        # Clamp to [-1, 1]
        final_score = max(-1.0, min(1.0, final_score))

        # Determine label
        if final_score > 0.15:
            label = 'Bullish'
        elif final_score < -0.15:
            label = 'Bearish'
        else:
            label = 'Neutral'

        # Confidence based on score strength and text length
        word_count = len(text.split())
        length_factor = min(1.0, word_count / 20)  # More text = more confident
        confidence = min(0.99, abs(final_score) * 0.8 + length_factor * 0.2)

        return {
            'score': round(final_score, 4),
            'label': label,
            'confidence': round(confidence, 4),
            'method': 'finance_vader',
            'details': {
                'vader_compound': round(compound, 4),
                'vader_pos': round(scores['pos'], 4),
                'vader_neg': round(scores['neg'], 4),
                'vader_neu': round(scores['neu'], 4),
                'phrase_boost': round(phrase_boost, 4),
                'word_count': word_count,
            },
        }


# ═══════════════════════════════════════════════════════
# FINBERT ANALYZER (if available)
# ═══════════════════════════════════════════════════════

class FinBERTAnalyzer:
    """
    Wraps ProsusAI/finbert for 3-class financial text classification.
    Only available if transformers + torch are installed.
    """

    def __init__(self):
        self.pipeline = _finbert_pipeline

    def analyze(self, text):
        if not self.pipeline or not text:
            return {
                'score': 0.0,
                'label': 'Neutral',
                'confidence': 0.0,
                'method': 'finbert_unavailable',
                'details': {},
            }

        try:
            # Truncate to 512 tokens (FinBERT max)
            text_truncated = text[:1500]  # Rough char limit
            results = self.pipeline(text_truncated)

            # results is list of list of dicts: [[{label, score}, ...]]
            if isinstance(results, list) and len(results) > 0:
                if isinstance(results[0], list):
                    results = results[0]

            # Extract scores
            score_map = {}
            for r in results:
                score_map[r['label'].lower()] = r['score']

            pos = score_map.get('positive', 0)
            neg = score_map.get('negative', 0)
            neu = score_map.get('neutral', 0)

            # Compute compound-like score: positive - negative, weighted by confidence
            compound = pos - neg
            confidence = max(pos, neg, neu)

            if compound > 0.1:
                label = 'Bullish'
            elif compound < -0.1:
                label = 'Bearish'
            else:
                label = 'Neutral'

            return {
                'score': round(compound, 4),
                'label': label,
                'confidence': round(confidence, 4),
                'method': 'finbert',
                'details': {
                    'positive': round(pos, 4),
                    'negative': round(neg, 4),
                    'neutral': round(neu, 4),
                },
            }

        except Exception as e:
            return {
                'score': 0.0,
                'label': 'Neutral',
                'confidence': 0.0,
                'method': 'finbert_error',
                'details': {'error': str(e)},
            }


# ═══════════════════════════════════════════════════════
# UNIFIED API
# ═══════════════════════════════════════════════════════

# Initialize analyzers
_finance_vader = FinanceVADER()
_finbert = FinBERTAnalyzer() if FINBERT_AVAILABLE else None


def analyze_financial_text(text):
    """
    Analyze financial text sentiment using the best available method.
    
    Priority: FinBERT (if available) → FinanceVADER → raw score 0.0
    
    Returns:
        dict with keys: score (-1 to +1), label, confidence, method, details
    """
    if not text or not text.strip():
        return {
            'score': 0.0,
            'label': 'Neutral',
            'confidence': 0.0,
            'method': 'empty',
            'details': {},
        }

    # Try FinBERT first
    if FINBERT_AVAILABLE and _finbert:
        result = _finbert.analyze(text)
        if result['method'] == 'finbert':
            return result

    # Fall back to FinanceVADER
    if VADER_AVAILABLE:
        return _finance_vader.analyze(text)

    # Absolute fallback — keyword counting
    return _keyword_fallback(text)


def analyze_batch(texts):
    """Analyze a list of texts. Returns list of result dicts."""
    return [analyze_financial_text(t) for t in texts]


def _keyword_fallback(text):
    """Absolute last-resort keyword counting when no NLP library is available."""
    text_lower = text.lower()
    bull_score = 0
    bear_score = 0

    for term, score in FINANCE_LEXICON.items():
        if term in text_lower:
            if score > 0:
                bull_score += score
            else:
                bear_score += abs(score)

    total = bull_score + bear_score
    if total == 0:
        return {'score': 0.0, 'label': 'Neutral', 'confidence': 0.0,
                'method': 'keyword_fallback', 'details': {}}

    net = (bull_score - bear_score) / max(total, 1)
    net = max(-1.0, min(1.0, net))

    return {
        'score': round(net, 4),
        'label': 'Bullish' if net > 0.15 else 'Bearish' if net < -0.15 else 'Neutral',
        'confidence': round(min(0.7, total / 20), 4),
        'method': 'keyword_fallback',
        'details': {'bull_score': round(bull_score, 2), 'bear_score': round(bear_score, 2)},
    }


def get_nlp_status():
    """Return status of the NLP sentiment module."""
    return {
        'finbert_available': FINBERT_AVAILABLE,
        'vader_available': VADER_AVAILABLE,
        'active_method': 'finbert' if FINBERT_AVAILABLE else 'finance_vader' if VADER_AVAILABLE else 'keyword_fallback',
        'lexicon_size': len(FINANCE_LEXICON),
        'finance_terms_added': len(STRONG_BULLISH) + len(MODERATE_BULLISH) + len(STRONG_BEARISH) + len(MODERATE_BEARISH) + len(FINANCE_NEUTRAL),
    }
