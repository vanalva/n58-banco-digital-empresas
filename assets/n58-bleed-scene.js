/* n58-bleed-scene.js — JS fallback for the sticky mask-grow scene.
 *
 * Capable browsers run the scene with native CSS scroll-driven animation
 * (animation-timeline: view()) — this script does nothing for them. Browsers
 * WITHOUT that support (notably older iOS Safari) can't scrub CSS on scroll,
 * so here we add `.n58-bleed-js` to each pin and feed per-phase scroll-progress
 * variables (`--n58-p-size`, `--n58-p-wipe`, `--n58-p-rise`, …). The paired CSS
 * (project.css § JS-DRIVEN PIN) rebuilds the FULL desktop choreography from those
 * variables with plain calc() — card grow, badge wipe, word rise, teaser exit,
 * and staggered copy — so the whole scene plays on any phone.
 *
 * rAF-throttled, passive listeners — mirrors the other scroll handlers on the page.
 */
(function () {
  'use strict';

  // The native CSS scroll-driven scene (project.css) runs ONLY on fine-pointer
  // devices that support animation-timeline. Drive with JS everywhere else — every
  // touch device (so it works on phones regardless of Safari's flaky/absent
  // support), plus any browser lacking native scroll timelines.
  var supportsNative = !!(window.CSS && CSS.supports && CSS.supports('animation-timeline: view()'));
  var coarse = !!(window.matchMedia && (matchMedia('(pointer: coarse)').matches || matchMedia('(hover: none)').matches));
  if (supportsNative && !coarse) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var pins = [].slice.call(document.querySelectorAll('.n58-bleed-pin'));
  if (!pins.length) return;
  pins.forEach(function (pin) { pin.classList.add('n58-bleed-js'); });

  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  // Remap the pin progress p into a phase's [a,b] window → 0..1.
  function seg(p, a, b) { return clamp01((p - a) / (b - a)); }
  // easeOutCubic — matches the desktop title-rise cubic-bezier(.16,1,.3,1) feel.
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // Phase windows in pin-progress space (mirror the native animation-range values,
  // remapped into the pinned "contain" 0..1 range). See project.css § JS-DRIVEN PIN.
  function set(pin, p) {
    var s = pin.style;
    s.setProperty('--n58-p-size',    seg(p, 0.10, 0.55).toFixed(4));            // card grow
    s.setProperty('--n58-p-img',     seg(p, 0.00, 0.65).toFixed(4));            // photo settle
    s.setProperty('--n58-p-wipe',    seg(p, 0.00, 0.12).toFixed(4));            // badge shape reveal
    s.setProperty('--n58-p-rise',    easeOut(seg(p, 0.06, 0.24)).toFixed(4));   // word climbs out
    s.setProperty('--n58-p-release', seg(p, 0.18, 0.26).toFixed(4));            // slot clip release
    s.setProperty('--n58-p-out',     seg(p, 0.30, 0.42).toFixed(4));            // teaser exits
    s.setProperty('--n58-p-copy1',   seg(p, 0.42, 0.70).toFixed(4));            // heading rises
    s.setProperty('--n58-p-copy2',   seg(p, 0.50, 0.78).toFixed(4));            // copy rises
    s.setProperty('--n58-p-copy3',   seg(p, 0.58, 0.86).toFixed(4));            // CTA rises
  }

  var raf = 0;
  function update() {
    raf = 0;
    var vh = window.innerHeight;
    for (var i = 0; i < pins.length; i++) {
      var pin = pins[i];
      var r = pin.getBoundingClientRect();
      var total = r.height - vh;                 // length of the pinned range
      var p = total > 0 ? clamp01(-r.top / total) : 0;
      set(pin, p);
    }
  }
  function onScroll() { if (!raf) raf = requestAnimationFrame(update); }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update);
  else update();
})();
