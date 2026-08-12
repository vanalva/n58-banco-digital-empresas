/* ─────────────────────────────────────────────────────────────────────────
   Pause off-viewport auto-animations
   ───────────────────────────────────────────────────────────────────────────
   Continuously-running page animations (the Lottie logo, the CSS marquees)
   keep repainting even when scrolled out of view — wasting CPU and stealing
   frames from the AlaN mini-game. This pauses them whenever they leave the
   viewport (or the tab is hidden) and resumes them when they return. Nothing
   visible ever animates while off-screen. Vanilla JS, zero dependencies,
   fully self-contained (safe to load on any page — it no-ops if the targets
   or the Lottie runtime aren't present).
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var hasIO = 'IntersectionObserver' in window;

    /* 1) CSS-animated marquees → toggle animation-play-state by visibility. */
    var cssTargets = document.querySelectorAll(
      '.n58-frame-marquee_track, .flwr_marquee_track, [data-offscreen-pause]'
    );
    if (hasIO && cssTargets.length) {
      var cssIO = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          entries[i].target.style.animationPlayState =
            (entries[i].isIntersecting && !document.hidden) ? '' : 'paused';
        }
      }, { rootMargin: '100px' });
      for (var c = 0; c < cssTargets.length; c++) cssIO.observe(cssTargets[c]);
      document.addEventListener('visibilitychange', function () {
        for (var i = 0; i < cssTargets.length; i++) {
          if (document.hidden) cssTargets[i].style.animationPlayState = 'paused';
        }
      });
    }

    /* 2) Lottie animations → pause/play via the bodymovin API by visibility.
       Lottie may register after this script runs, so retry briefly. */
    function hookLottie() {
      if (!window.lottie || !window.lottie.getRegisteredAnimations) return false;
      var all = window.lottie.getRegisteredAnimations();
      if (!all || !all.length) return false;
      // Only manage LOOPING animations — one-shot clips (e.g. the play-once logo)
      // must never be replayed just because they scrolled back into view.
      var anims = all.filter(function (a) { return a && a.loop; });
      if (!anims.length) return true;

      if (hasIO) {
        var io = new IntersectionObserver(function (entries) {
          for (var i = 0; i < entries.length; i++) {
            var a = entries[i].target.__lottieAnim;
            if (!a) continue;
            if (entries[i].isIntersecting && !document.hidden) a.play();
            else a.pause();
          }
        }, { rootMargin: '80px' });
        anims.forEach(function (a) {
          if (!a.wrapper) return;
          a.wrapper.__lottieAnim = a;
          io.observe(a.wrapper);
        });
      }
      document.addEventListener('visibilitychange', function () {
        anims.forEach(function (a) {
          if (document.hidden) a.pause();
          else if (!a.wrapper || isInView(a.wrapper)) a.play();
        });
      });
      return true;
    }

    function isInView(el) {
      var r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < (window.innerHeight || document.documentElement.clientHeight);
    }

    if (!hookLottie()) {
      var tries = 0;
      var timer = setInterval(function () {
        if (hookLottie() || ++tries > 20) clearInterval(timer);
      }, 300);
    }
  });
})();
