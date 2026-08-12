/* spline-loader.js — shared across every page with a [data-n58-spline] stage.
 * (Ported from the live site's spline-loader.js, flwr-ified, then upgraded with
 * a preload-ahead strategy — see LOADING STRATEGY below.)
 *
 * For every [data-n58-spline]: desktop-only (>991px). Injects the
 * @splinetool/viewer module + <spline-viewer>, shows the lime loading bar + %
 * counter (real `progress` events, with a simulated ramp until they arrive),
 * then crossfades poster -> scene (.is-loaded). Resizing below 991px tears the
 * viewer down (poster returns); load failures keep the poster. Mobile always
 * keeps the static poster (no 3D).
 *
 * ── LOADING STRATEGY ───────────────────────────────────────────────────────
 * We never load Spline during the initial page load (it would fight the critical
 * content). Instead, two mechanisms make below-the-fold scenes ready BEFORE the
 * user reaches them, so there's no "load-on-arrival" pop:
 *   1. Wide IntersectionObserver margin (WARM_MARGIN) — start loading ~2 screens
 *      before a stage enters the viewport. Safety net for fast scrollers.
 *   2. Idle warm-up after window.load — once the page is fully loaded and the
 *      main thread goes idle, proactively warm every not-yet-loaded desktop
 *      stage (staggered), so a scene at the very bottom is already rendered by
 *      the time you scroll down.
 * Both are gated to desktop and skipped on Save-Data / 2g so we never burn a
 * metered or slow connection on a decorative 3D scene.
 */
(function () {
  'use strict';

  var stages = [].slice.call(document.querySelectorAll('[data-n58-spline]'));
  if (!stages.length) return;
  var VIEWER_SRC = 'https://unpkg.com/@splinetool/viewer@1.10.14/build/spline-viewer.js';
  var WARM_MARGIN = '1500px 0px';   /* ~2 viewports of lead time (was 300px) */

  function wide() { return window.innerWidth > 991; }
  /* Metered / very slow connection → don't proactively warm 3D. */
  function frugal() {
    var c = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  }

  var scriptPromise = null;
  function loadViewerScript() {
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.type = 'module';
      s.src = VIEWER_SRC;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
    return scriptPromise;
  }

  function buildPreloader(stage) {
    var p = document.createElement('div');
    p.className = 'n58-spline_preloader';
    p.innerHTML = '<div class="n58-spline_bar"><div class="n58-spline_fill"></div><div class="n58-spline_pct">0%</div></div>';
    stage.appendChild(p);
    stage.__pre = p;
    stage.__fill = p.querySelector('.n58-spline_fill');
    stage.__pct = p.querySelector('.n58-spline_pct');
  }
  function setProgress(stage, v) {
    if (!stage.__fill) return;
    v = Math.max(0, Math.min(100, v));
    stage.__fill.style.transform = 'scaleX(' + (v / 100) + ')';
    stage.__pct.textContent = Math.round(v) + '%';
  }
  function hidePreloader(stage) {
    var p = stage.__pre;
    if (!p) return;
    stage.__pre = null;
    p.classList.add('is-done');
    setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 550);
  }

  function inject(stage) {
    if (stage.__init) return;
    stage.__init = true;
    buildPreloader(stage);
    /* Simulated ramp (2–10% steps, capped at 85) until real progress lands. */
    var real = false, sim = 0;
    var simTimer = setInterval(function () {
      if (real) return;
      sim = Math.min(85, sim + 2 + Math.random() * 8);
      setProgress(stage, sim);
    }, 200);

    loadViewerScript().then(function () {
      var viewer = document.createElement('spline-viewer');
      viewer.setAttribute('url', stage.getAttribute('data-n58-spline'));
      viewer.setAttribute('loading', 'eager');
      stage.appendChild(viewer);
      var revealed = false;
      function reveal() {
        if (revealed) return;
        revealed = true;
        clearInterval(simTimer);
        setProgress(stage, 100);
        hidePreloader(stage);
        /* Beat between bar-full and the poster→scene crossfade. */
        setTimeout(function () { stage.classList.add('is-loaded'); }, 120);
      }
      viewer.addEventListener('progress', function (e) {
        real = true;
        if (e.detail && typeof e.detail.progress === 'number') setProgress(stage, e.detail.progress * 100);
      });
      viewer.addEventListener('load', reveal);
      setTimeout(reveal, 6000);   /* hard fallback — never leave the bar hanging */
    }).catch(function () {
      clearInterval(simTimer);
      hidePreloader(stage);       /* viewer script failed → poster stays */
      stage.__init = false;
    });
  }

  function teardown(stage) {
    var v = stage.querySelector('spline-viewer');
    if (v) v.remove();
    hidePreloader(stage);
    stage.classList.remove('is-loaded');
    stage.__init = false;
  }

  /* 1) IntersectionObserver — primary trigger, now with a wide margin so loading
        starts ~2 screens before a stage is reached (not on arrival). */
  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting || !wide()) return;
        inject(en.target);
        io.unobserve(en.target);
      });
    }, { rootMargin: WARM_MARGIN, threshold: 0.01 });
    stages.forEach(function (s) { io.observe(s); });
  } else if (wide()) {
    stages.forEach(inject);
  }

  /* 2) Idle warm-up AFTER the page has fully loaded — warm every desktop stage
        that isn't loading yet, staggered, so bottom-of-page scenes are ready
        before the user scrolls to them. Skipped on metered / 2g connections. */
  function warmUp() {
    if (!wide() || frugal()) return;
    var pending = stages.filter(function (s) { return !s.__init; });
    pending.forEach(function (s, i) {
      setTimeout(function () {
        if (!s.__init && wide() && !frugal()) inject(s);
      }, i * 450);   /* stagger so the WebGL scenes don't all init at once */
    });
  }
  function scheduleWarm() {
    if ('requestIdleCallback' in window) requestIdleCallback(warmUp, { timeout: 2500 });
    else setTimeout(warmUp, 1200);
  }
  if (document.readyState === 'complete') scheduleWarm();
  else window.addEventListener('load', scheduleWarm, { once: true });

  /* Resize: tear down below 991px (poster returns); re-observe when back to desktop. */
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      stages.forEach(function (s) {
        if (!wide() && s.__init) teardown(s);
        else if (wide() && !s.__init && io) io.observe(s);
      });
    }, 200);
  }, { passive: true });
})();
