/* alan-stage.js — full-screen "Habla con AlaN" experience (FAQ page).
 *
 * Opens a native <dialog> that stacks three layers:
 *   1. the SAME Spline scene as the page hero, full-bleed and centred
 *   2. the Vanny chat embed on top, transparent, so only its input bar shows
 *   3. a close control
 *
 * The avatar reacts to AlaN's voice. The Vanny embed posts voice telemetry to
 * its parent (`{source:"vanny-widget", type:"voice", event:"volume"|"state"}`)
 * roughly every 90ms during a call; we smooth `output` and drive the scene from
 * it. Text-only turns carry no audio, so there is nothing to react to and the
 * avatar falls back to its idle breathe.
 *
 * ── WHY A HAND-BUILT IFRAME AND NOT vanny-widget.js ───────────────────────────
 * The page already loads vanny-widget.js for the corner FAB. Loading it a second
 * time would clobber window.Vanny and re-dispatch every voice event twice (its
 * message handler re-broadcasts before it checks which frame sent the message).
 * Building the iframe here keeps the two surfaces independent, filters telemetry
 * by e.source so nothing double-fires, and loads nothing until the stage opens.
 * Theme, greeting and copy still come entirely from Widget Studio: only the
 * mount mode is pinned in the URL.
 *
 * ── DRIVING THE 3D SCENE ──────────────────────────────────────────────────────
 * Two channels, both optional, so this works whatever the scene contains:
 *   * CSS — `--alan-level` (0..1) and `data-state` on the stage. Always works.
 *   * Spline runtime — setVariables({ volume, speaking }). Only does something
 *     once the scene defines variables with those names; harmless until then.
 *     Add `volume` (number) and `speaking` (boolean) in Spline and the scene
 *     starts reacting with no change here.
 */
(function () {
  'use strict';

  var stage = document.getElementById('alan-stage');
  if (!stage) return;

  var EMBED_BASE = 'https://vanny.chat';
  var TENANT = 'n58';
  var WIDGET = 'stage';
  var VIEWER_SRC = 'https://unpkg.com/@splinetool/viewer@1.10.14/build/spline-viewer.js';
  /* Single source of truth for the scene: read the hero's stage so swapping the
     hero scene swaps this one too. The constant is only a fallback. */
  var hero = document.querySelector('[data-n58-spline]');
  var SCENE =
    stage.getAttribute('data-alan-scene') ||
    (hero && hero.getAttribute('data-n58-spline')) ||
    'https://prod.spline.design/I0a6m81S7CcZp13W/scene.splinecode';

  var sceneEl = stage.querySelector('.alan-stage_scene');
  var chatEl = stage.querySelector('.alan-stage_chat');
  var openers = document.querySelectorAll('[data-alan-open]');
  var closers = stage.querySelectorAll('[data-alan-close]');
  var fab = document.querySelector('.alan-fab');

  var frame = null;      /* the Vanny embed iframe (built on first open) */
  var viewer = null;     /* <spline-viewer> (built on first open, desktop only) */
  var loadingEl = stage.querySelector('.alan-stage_loading');
  /* Curtain gate. Showing the poster and the chat behind a loading bar made the
     stage look frozen rather than loading, so nothing is revealed until BOTH the
     scene and the chat embed are ready. Phones skip the wait entirely: there is
     no 3D there, the poster IS the avatar. */
  var sceneDone = false, chatDone = false, curtainTimer = 0;
  var raf = 0;
  var level = 0;         /* smoothed 0..1 drive value */
  var raw = 0;           /* newest loudest-of-both reading, pre-gain */
  var peak = 0;          /* decaying reference level for the auto-gain */
  var MIN_PEAK = 0.12;   /* floor, so silence cannot amplify into a twitch */
  var msgCount = 0;      /* volume messages seen, for __alanStage() */
  var state = 'idle';

  /* Desktop-only 3D, same threshold the shared spline-loader uses. Phones keep
     the poster: a WebGL scene plus a live call is too much for a mid-range
     device, and the site already made this call for the hero. */
  function wide() { return window.innerWidth > 991; }
  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ── the chat embed ──────────────────────────────────────────────────────── */

  function buildFrame() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.className = 'alan-stage_frame';
    frame.title = 'Chat con AlaN';
    frame.setAttribute('allow', 'clipboard-write; microphone');
    /* mode=inline is pinned here on purpose: the instance already stores it, but
       a mis-save in the Studio should not turn this page into a floating bubble. */
    frame.src = EMBED_BASE + '/embed/' + TENANT + '?w=' + WIDGET + '&mode=inline';
    frame.addEventListener('load', function () { chatDone = true; maybeReveal(); });
    chatEl.appendChild(frame);
  }

  /* ── the curtain ─────────────────────────────────────────────────────────── */

  function setPhase(phase) {
    stage.setAttribute('data-phase', phase);
  }

  function maybeReveal() {
    if (!sceneDone || !chatDone) return;
    setPhase('ready');
    hidePreloader();
  }

  /* Last resort: never trap someone behind the curtain. Whatever is ready gets
     shown, whatever is not falls back (poster for the scene, empty chat that
     fills itself in a moment). */
  function forceReveal() {
    sceneDone = chatDone = true;
    maybeReveal();
  }

  function postToFrame(type, data) {
    if (!frame || !frame.contentWindow) return;
    var msg = data || {};
    msg.type = type;
    frame.contentWindow.postMessage(msg, EMBED_BASE);
  }

  /* Voice telemetry. Filtered by e.source so the corner widget's own frame can
     never drive this avatar. */
  window.addEventListener('message', function (e) {
    if (!frame || e.source !== frame.contentWindow) return;
    var d = e.data;
    if (!d || d.source !== 'vanny-widget' || d.type !== 'voice') return;
    if (d.event === 'volume') {
      /* Take whichever side is louder rather than branching on `state`.
         `state` only flips to "speaking" when the SDK emits a mode string the
         embed recognises, and when it does not the avatar ends up following the
         visitor's silent microphone while AlaN is the one talking, which looks
         exactly like it is broken. Loudest-wins needs no state at all: AlaN
         drives it while she speaks, the visitor drives it while they do. */
      msgCount++;
      raw = Math.max(num(d.output), num(d.input) * 0.55);
      /* Auto-gain. The absolute scale of these numbers is not guaranteed (a
         quiet TTS mix can peak around 0.2), so track a decaying peak and
         normalise against it. Without this the avatar technically moves but by
         two percent, which reads as not moving. */
      if (raw > peak) peak = raw;
    } else if (d.event === 'state') {
      setState(d.state);
    }
  });

  function num(v) {
    return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  }

  /* `force` writes the attribute even when the value has not changed, so the
     first open publishes a state instead of leaving data-state absent. */
  function setState(next, force) {
    if (!next || (next === state && !force)) return;
    state = next;
    stage.setAttribute('data-state', state);
    if (state === 'idle' || state === 'ended' || state === 'error') raw = 0;
  }

  /* ── the 3D scene ────────────────────────────────────────────────────────── */

  var viewerScript = null;
  function loadViewer() {
    if (viewerScript) return viewerScript;
    viewerScript = new Promise(function (resolve, reject) {
      /* The shared spline-loader may already have injected the module for the
         hero; a second <script> for the same URL is a cache hit and the custom
         element only registers once. */
      var s = document.createElement('script');
      s.type = 'module';
      s.src = VIEWER_SRC;
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
    return viewerScript;
  }

  /* Loading bar + % counter, same markup and classes the shared spline-loader
     builds for the hero, so the stage uses the site's existing look instead of
     inventing a second one. The scene is several megabytes and the wait is very
     visible on a cold cache. */
  var pre = null, preFill = null, prePct = null, simTimer = 0, realProgress = false;

  function buildPreloader() {
    if (pre) return;
    pre = document.createElement('div');
    pre.className = 'n58-spline_preloader';
    pre.innerHTML = '<div class="n58-spline_bar"><div class="n58-spline_fill"></div><div class="n58-spline_pct">0%</div></div>';
    /* Its own layer, not inside .alan-stage_scene: the scene is lifted off centre
       and hidden behind the curtain, and the bar needs to be neither. */
    loadingEl.appendChild(pre);
    preFill = pre.querySelector('.n58-spline_fill');
    prePct = pre.querySelector('.n58-spline_pct');
    /* Simulated ramp until real progress events arrive, capped so it never
       claims to be finished before the scene actually is. */
    var sim = 0;
    realProgress = false;
    simTimer = setInterval(function () {
      if (realProgress) return;
      sim = Math.min(85, sim + 2 + Math.random() * 8);
      setProgress(sim);
    }, 200);
  }

  function setProgress(v) {
    if (!preFill) return;
    v = Math.max(0, Math.min(100, v));
    preFill.style.transform = 'scaleX(' + (v / 100) + ')';
    prePct.textContent = Math.round(v) + '%';
  }

  function hidePreloader() {
    if (simTimer) { clearInterval(simTimer); simTimer = 0; }
    if (curtainTimer) { window.clearTimeout(curtainTimer); curtainTimer = 0; }
    var node = pre;
    pre = preFill = prePct = null;
    if (!node) return;
    node.classList.add('is-done');
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 550);
  }

  function buildScene() {
    if (viewer || !wide()) return;
    buildPreloader();
    loadViewer().then(function () {
      if (viewer) return;
      viewer = document.createElement('spline-viewer');
      viewer.setAttribute('url', SCENE);
      viewer.setAttribute('loading', 'eager');
      viewer.addEventListener('progress', function (e) {
        realProgress = true;
        if (e.detail && typeof e.detail.progress === 'number') setProgress(e.detail.progress * 100);
      });
      viewer.addEventListener('load', reveal);
      /* Never leave the bar hanging if the scene stalls. */
      setTimeout(reveal, 12000);
      sceneEl.appendChild(viewer);
    }).catch(function () {
      viewer = null;   /* poster stays, chat is unaffected */
      sceneDone = true;
      maybeReveal();
    });
  }

  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    setProgress(100);
    sceneEl.classList.add('is-loaded');
    sceneDone = true;
    /* Let the bar read 100% for a beat before the curtain lifts. */
    setTimeout(maybeReveal, 180);
  }

  /* ── the drive loop ──────────────────────────────────────────────────────── */

  function tick() {
    raf = requestAnimationFrame(tick);
    var damp = reduced() ? 0.35 : 1;
    /* Bleed the peak down so the gain re-tunes when the mix gets quieter, and
       so one loud cough does not flatten the rest of the call. */
    peak = Math.max(MIN_PEAK, peak * 0.995);
    var norm = Math.min(1, raw / peak);
    /* Idle breathe so the avatar is never completely dead, including on the
       text-only path where no volume ever arrives. */
    var idle = (state === 'speaking' || state === 'listening') ? 0.04 : 0.06;
    var want = Math.max(idle, norm);
    /* Rise fast, fall slow: matches how speech actually reads. */
    level += (want - level) * (want > level ? 0.42 : 0.12);
    /* Decay the reading itself, so a dropped message stream relaxes to idle
       instead of freezing the avatar at whatever it last heard. */
    raw *= 0.88;
    var v = level * damp;
    stage.style.setProperty('--alan-level', v.toFixed(3));
    if (viewer && viewer.setVariables) {
      try {
        viewer.setVariables({ volume: v, speaking: state === 'speaking' });
      } catch (err) { /* scene has no such variables — the CSS drive still runs */ }
    }
  }

  function startLoop() { if (!raf) raf = requestAnimationFrame(tick); }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ── open / close ────────────────────────────────────────────────────────── */

  function open() {
    if (stage.open) return;
    /* Dismiss the corner widget so the two chats are never both on screen. */
    if (window.Vanny && typeof window.Vanny.close === 'function') {
      try { window.Vanny.close(); } catch (err) {}
    }
    if (fab) fab.classList.add('is-hidden');
    document.documentElement.classList.add('alan-stage-open');
    /* What is already done before we start? Phones never wait on a scene (no 3D
       there), a scene that has already revealed once stays revealed, and the
       chat iframe is built once and kept. Without this a REOPEN would sit behind
       the curtain until the backstop fired, because neither the viewer nor the
       iframe emits a second load event. */
    sceneDone = !wide() || (!!viewer && revealed);
    chatDone = !!frame;
    if (sceneDone && chatDone) {
      setPhase('ready');
    } else {
      setPhase('loading');
      buildPreloader();
      /* Backstop for a dead network: show whatever exists rather than nothing. */
      curtainTimer = window.setTimeout(forceReveal, 15000);
    }
    buildFrame();
    buildScene();
    if (typeof stage.showModal === 'function') stage.showModal();
    else stage.setAttribute('open', '');
    setState('idle', true);
    startLoop();
  }

  function close() {
    if (!stage.open) return;
    /* Hang up before unmounting, so the mic light goes out even if the visitor
       closed mid-call. The embed ignores this when no call is running. */
    postToFrame('vanny:voice:end');
    if (typeof stage.close === 'function') stage.close();
    else stage.removeAttribute('open');
  }

  /* Runs for the X button, Escape, and any programmatic close. */
  stage.addEventListener('close', function () {
    if (curtainTimer) { window.clearTimeout(curtainTimer); curtainTimer = 0; }
    document.documentElement.classList.remove('alan-stage-open');
    if (fab) fab.classList.remove('is-hidden');
    stopLoop();
    level = 0;
    raw = 0;
    peak = 0;
    setState('idle', true);
    stage.style.setProperty('--alan-level', '0');
  });

  /* ── warm on intent ───────────────────────────────────────────────────────
     The stage's cost is not download: on a warm cache the runtime and the scene
     both come from disk in under half a second, and opening still takes many
     seconds. That time is CPU and GPU work, parsing 2.2MB of viewer runtime,
     building the scene graph and compiling shaders for a SECOND WebGL context
     while the hero's is already running.
     None of that has to happen after the click. Hovering or focusing the trigger
     starts it, so by the time someone actually presses the button the scene is
     usually built and the curtain never appears. Skipped on metered and slow
     connections, and on phones, which never build a scene at all. */
  function frugal() {
    var c = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || '')));
  }
  var warmed = false;
  function warm() {
    if (warmed || !wide() || frugal()) return;
    warmed = true;
    buildScene();
  }
  [].forEach.call(openers, function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); open(); });
    el.addEventListener('pointerenter', warm);
    el.addEventListener('focus', warm);
    el.addEventListener('touchstart', warm, { passive: true });
  });
  [].forEach.call(closers, function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); close(); });
  });

  /* Click the dimmed backdrop to leave. A modal <dialog> reports clicks on its
     ::backdrop as clicks on the dialog itself, so compare against its box. */
  stage.addEventListener('click', function (e) {
    if (e.target !== stage) return;
    var r = stage.getBoundingClientRect();
    var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) close();
  });

  /* Live read-out for diagnosing a call without re-instrumenting the page.
     During a call, run `__alanStage()` in the console: `raw` should move while
     AlaN talks, `level` is what actually drives the CSS, and `msgs` proves the
     telemetry is arriving at all. If msgs stays 0 the embed is not posting; if
     raw stays 0 the SDK is reporting silence on both channels. */
  window.__alanStage = function () {
    return { raw: +raw.toFixed(3), peak: +peak.toFixed(3), level: +level.toFixed(3), state: state, msgs: msgCount, open: stage.open };
  };

  /* Crossing the mobile threshold while open: build the scene on the way up,
     drop it on the way down so a rotated phone is not left running WebGL. */
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () {
      if (!stage.open) return;
      if (wide() && !viewer) buildScene();
      else if (!wide() && viewer) {
        viewer.remove();
        viewer = null;
        revealed = false;
        hidePreloader();
        sceneEl.classList.remove('is-loaded');
      }
    }, 200);
  }, { passive: true });
})();
