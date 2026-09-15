"""
FINAL FIX: Replace lines 1844-1932 in app.py.

KEY FIX:
  100% BUY classifier with negative momentum was giving NEGATIVE price.
  Because: neg_momentum * (1 + clf_boost) = MORE negative.
  
  New formula: mu_tf = w_clf * clf_driven + (1-w_clf) * momentum
  This ALWAYS gives positive price when clf says BUY strongly.
"""

NEW_BLOCK = '''\
        # ── Step 2: Classifier net-direction per timeframe ──────────────
        key_order   = ['tomorrow', 'next_week', 'next_month', 'next_3m', 'next_year']
        clf_net_dir = {}
        for i, tf_p in enumerate(tf_predictions):
            if i < len(key_order):
                clf_net_dir[key_order[i]] = (tf_p['buyProb'] - tf_p['sellProb']) / 100.0

        # ── Step 3: Per-timeframe price targets ──────────────────────────
        # mu_tf = w_clf * clf_driven + (1-w_clf) * momentum
        #   w_clf: 30% tomorrow -> 80% 1yr  (clf wins at long horizons)
        #   clf_driven = clf_dir * K * annual_vol
        #   This guarantees: 100% BUY -> positive 1yr forecast always.
        K_CLF       = 0.75
        W_CLF_SHORT = 0.30
        W_CLF_LONG  = 0.80

        price_forecasts = {}
        daily_forecast  = []
        mu_for_chart    = mu_base

        for days_tf, tf_key in mega_timeframes:
            t       = days_tf / 252.0
            clf_dir = clf_net_dir.get(tf_key, 0.0)

            # Classifier-driven annual return (positive when BUY, negative when SELL)
            clf_driven = clf_dir * K_CLF * annual_vol

            # Horizon-blended drift (clf dominates at long horizons)
            w_clf  = min(W_CLF_SHORT + (W_CLF_LONG - W_CLF_SHORT) * t, W_CLF_LONG)
            mu_tf  = w_clf * clf_driven + (1.0 - w_clf) * mu_base

            # Short-horizon mega-model alpha tweak (tomorrow only)
            if tf_key in mega_bundles and days_tf <= 5:
                raw_mega   = predict_mega(mega_bundles[tf_key], df_mega)
                mega_norm  = float(np.tanh(raw_mega / (annual_vol * 0.05 + 1e-8)))
                mega_alpha = mega_norm * annual_vol * 0.10
                mu_tf      = 0.80 * mu_tf + 0.20 * (mu_tf + mega_alpha)

            mu_tf_final  = float(np.clip(mu_tf, -0.90, 1.20))
            pred_log_ret = mu_tf_final * t
            sigma_h      = daily_vol * np.sqrt(days_tf)

            pred_price = float(cur * np.exp(pred_log_ret))
            chg        = pred_price - cur
            chgp       = chg / cur * 100 if cur > 0 else 0.0

            bull95 = float(cur * np.exp(pred_log_ret + 1.645 * sigma_h))
            bear5  = float(cur * np.exp(pred_log_ret - 1.645 * sigma_h))
            bull75 = float(cur * np.exp(pred_log_ret + 0.674 * sigma_h))
            bear25 = float(cur * np.exp(pred_log_ret - 0.674 * sigma_h))

            price_forecasts[tf_key] = {
                'price':         round(pred_price, 2),
                'change':        round(chg, 2),
                'changePercent': round(chgp, 2),
                'bullTarget':    round(bull75, 2),
                'bearTarget':    round(bear25, 2),
                'bull95':        round(bull95, 2),
                'bear5':         round(bear5, 2),
                'horizonVol':    round(sigma_h * 100, 2),
                'annualDrift':   round(mu_tf_final * 100, 1),
                'signal':        'BUY' if chgp > 0.3 else 'SELL' if chgp < -0.3 else 'HOLD',
            }
            if tf_key == 'next_year':
                mu_for_chart = mu_tf_final

            print(f"   {tf_key:12s}: clf={clf_dir:+.2f}  w_clf={w_clf:.2f}  "
                  f"mu={mu_tf_final*100:+.1f}%/yr  pred={chgp:+.2f}%  "
                  f"price={pred_price:.2f}")

        # ── Step 4: Attach mega accuracy ─────────────────────────────────
        for i, tf_p in enumerate(tf_predictions):
            if i < len(key_order):
                key = key_order[i]
                if key in mega_dir_accs:
                    tf_p['megaDirAcc']       = round(mega_dir_accs[key], 1)
                if key in price_forecasts:
                    tf_p['megaForecastPrice']  = price_forecasts[key]['price']
                    tf_p['megaForecastChgPct'] = price_forecasts[key]['changePercent']

        # ── Step 5: 30-day daily chart via direct GBM ───────────────────
        mu_daily = mu_for_chart / 252.0
        for i in range(30):
            di    = i + 1
            lret  = mu_daily * di
            sig_i = daily_vol * np.sqrt(di)
            daily_forecast.append({
                'day':   f'Day {di}',
                'date':  (datetime.now() + timedelta(days=di)).strftime('%d %b'),
                'price': round(float(cur * np.exp(lret)), 2),
                'bull':  round(float(cur * np.exp(lret + 0.674 * sig_i)), 2),
                'bear':  round(float(cur * np.exp(lret - 0.674 * sig_i)), 2),
            })

'''

START = 1843   # 0-indexed, line 1844 (inclusive)
END   = 1932   # 0-indexed, line 1933 (exclusive — keep "sigs = get_ind_signals")

with open('app.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Replacing lines {START+1}-{END} ({END-START} lines) with new engine...")
new_lines = lines[:START] + [NEW_BLOCK] + lines[END:]

with open('app.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Done. New total lines: {len(new_lines)}")

# Verify syntax
import py_compile, sys
try:
    py_compile.compile('app.py', doraise=True)
    print("SYNTAX OK")
except py_compile.PyCompileError as e:
    print(f"SYNTAX ERROR: {e}")
    sys.exit(1)
