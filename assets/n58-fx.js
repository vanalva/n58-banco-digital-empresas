/* ═══════════════════════════════════════════════════════════════════════════
   N58 FX ticker — live rate hydration (static build)
   ───────────────────────────────────────────────────────────────────────────
   The bar ships with placeholder values (Bs. 00,00 / 00/00/0000) so the layout
   is correct before any data arrives. This script replaces them with live rates.

   Source is declared on the bar:

     data-n58-fx-src="bcv"          built-in BCV provider (default)
     data-n58-fx-src="https://…"    any endpoint returning JSON — the n8n webhook
     data-n58-fx-src=""             stay on placeholders

   THE BCV PROVIDER is the temporary path until the site moves into Webflow and
   the ticker binds to the Tasas CMS collection that n8n already feeds. It reads
   the two official BCV rates from ve.dolarapi.com, which serves
   `Access-Control-Allow-Origin: *`, so no proxy is needed:

     https://ve.dolarapi.com/v1/dolares/oficial   → { promedio: 787.5196, … }
     https://ve.dolarapi.com/v1/euros/oficial     → { promedio: 919.15350114, … }

   Those are the same figures n58bancodigital.com publishes today (787,51960000
   and 919,15350114 as of 2026-08-26) — same source, same day, no drift.

   CUSTOM ENDPOINT shapes accepted (first match wins, keys case-insensitive):
     { "usd": 787.5196, "eur": 919.1535, "fecha": "2026-08-26" }
     { "USD": "787,5196", "EUR": "919,1535", "date": "26/08/2026" }
     { "rates": { "usd": …, "eur": … }, "updatedAt": "…" }
     [ { "moneda": "USD", "tasa": … }, { "moneda": "EUR", "tasa": … } ]
   Values may be numbers or strings; a comma decimal separator is understood.

   Behaviour on failure: placeholders stay exactly as authored. No layout shift,
   no empty ticker, one console warning so a broken endpoint is findable.

   Why every node, not the first: both marquee implementations CLONE the track —
   the flwr engine on desktop, the CSS compositor swap on mobile — so a rate can
   exist 4-12 times in the DOM. Fields are addressed by data attribute and every
   copy is written, which also makes hydration timing-safe.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var BCV = {
    usd: 'https://ve.dolarapi.com/v1/dolares/oficial',
    eur: 'https://ve.dolarapi.com/v1/euros/oficial'
  };
  var CACHE_KEY = 'n58-fx-cache';
  var CACHE_MS = 30 * 60 * 1000;   // half an hour; BCV publishes once a day
  var TIMEOUT_MS = 6000;

  var bars = document.querySelectorAll('[data-n58-fx]');
  if (!bars.length) return;

  /* ── helpers ───────────────────────────────────────────────────────────── */

  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return undefined;
    var lower = {};
    Object.keys(obj).forEach(function (k) { lower[k.toLowerCase()] = obj[k]; });
    for (var i = 0; i < keys.length; i++) {
      var v = lower[keys[i]];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  function toNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    // "787,51960000" and "787.5196" mean the same thing here.
    var s = v.trim().replace(/\s/g, '');
    if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function money(n) {
    return 'Bs. ' + n.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function day(v) {
    if (!v) return null;
    var d = new Date(v);
    if (isNaN(d.getTime())) return typeof v === 'string' ? v : null;
    var p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function getJSON(url) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl && setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS);
    var opts = { cache: 'no-store', credentials: 'omit' };
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + url);
      return r.json();
    });
  }

  /* ── sources ───────────────────────────────────────────────────────────── */

  // ve.dolarapi: { moneda, fuente, promedio, fechaActualizacion }
  function fromBcv() {
    var soft = function (url) { return getJSON(url).catch(function () { return null; }); };
    return Promise.all([soft(BCV.usd), soft(BCV.eur)]).then(function (res) {
      var usd = res[0], eur = res[1];
      if (!usd && !eur) throw new Error('BCV unreachable');
      return {
        usd: usd ? toNumber(pick(usd, ['promedio', 'venta', 'compra'])) : null,
        eur: eur ? toNumber(pick(eur, ['promedio', 'venta', 'compra'])) : null,
        fecha: day(pick(usd || eur || {}, ['fechaactualizacion', 'fecha']))
      };
    });
  }

  function fromCustom(data) {
    var out = {}, src = data;

    if (Array.isArray(data)) {
      data.forEach(function (row) {
        var code = String(pick(row, ['moneda', 'currency', 'code', 'divisa']) || '').toUpperCase();
        var rate = pick(row, ['tasa', 'rate', 'valor', 'value', 'precio', 'promedio']);
        if (code.indexOf('USD') > -1 || code.indexOf('DOLAR') > -1) out.usd = toNumber(rate);
        if (code.indexOf('EUR') > -1) out.eur = toNumber(rate);
        if (!out.fecha) out.fecha = day(pick(row, ['fecha', 'date', 'updatedat', 'fechaactualizacion']));
      });
      return out;
    }

    var nested = pick(data, ['rates', 'tasas', 'data', 'result']);
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) src = nested;

    out.usd = toNumber(pick(src, ['usd', 'dolar', 'dólar', 'cambio_usd', 'cambiousd', 'promedio']));
    out.eur = toNumber(pick(src, ['eur', 'euro', 'cambio_eur', 'cambioeur']));
    out.fecha = day(pick(src, ['fecha', 'date', 'updatedat', 'updated_at', 'fechaactualizacion'])) ||
                day(pick(data, ['fecha', 'date', 'updatedat', 'updated_at']));
    return out;
  }

  /* ── cache: one fetch per half hour per browser ────────────────────────── */

  function readCache(key) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var c = JSON.parse(raw);
      if (c.key !== key || (Date.now() - c.at) > CACHE_MS) return null;
      return c.value;
    } catch (e) { return null; }
  }

  function writeCache(key, value) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key: key, at: Date.now(), value: value }));
    } catch (e) { /* private mode — refetching is fine */ }
  }

  /* ── paint ─────────────────────────────────────────────────────────────── */

  function write(bar, field, text) {
    if (text === null || text === undefined) return 0;
    var nodes = bar.querySelectorAll('[data-n58-fx-field="' + field + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
    return nodes.length;
  }

  function paint(bar, v) {
    var wrote = 0;
    if (v.usd !== null && v.usd !== undefined) wrote += write(bar, 'usd', money(v.usd));
    if (v.eur !== null && v.eur !== undefined) wrote += write(bar, 'eur', money(v.eur));
    if (v.fecha) wrote += write(bar, 'fecha', v.fecha);
    bar.setAttribute('data-n58-fx-state', wrote ? 'live' : 'placeholder');
    return wrote;
  }

  function hydrate(bar) {
    var src = (bar.getAttribute('data-n58-fx-src') || 'bcv').trim();
    if (!src) return;                       // explicitly disabled

    var cached = readCache(src);
    if (cached) { paint(bar, cached); return; }

    var load = (src === 'bcv')
      ? fromBcv()
      : getJSON(src).then(fromCustom);

    load.then(function (v) {
      if (paint(bar, v)) writeCache(src, v);
    }).catch(function (err) {
      if (window.console && console.warn) console.warn('[n58-fx] rates unavailable:', err.message);
      bar.setAttribute('data-n58-fx-state', 'placeholder');
    });
  }

  function run() {
    for (var i = 0; i < bars.length; i++) hydrate(bars[i]);
  }

  // Late enough that both marquee implementations have finished cloning.
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
