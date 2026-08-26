/* ═══════════════════════════════════════════════════════════════════════════
   N58 navbar — adapts to the surface behind it
   ───────────────────────────────────────────────────────────────────────────
   The bar is fixed, so it floats over whatever happens to be under it. It ships
   dark (cream on ink) and disappears the moment a light section scrolls beneath
   — the Documentos Legales hero being the obvious case.

   This decides what is behind the bar and toggles `.is-light` on the wrapper.
   The CSS side (project.css, "LIGHT-SECTION NAVBAR") re-points the navbar's
   component tokens to ink and lets borders and icons follow currentColor, so a
   single class flips the whole bar.

   Three passes, in order of confidence:

     1. Section geometry — the deepest <section>/<footer> straddling the bar's
        bottom edge. Cheap, and right for the common case.
     2. Mode ancestry — hit-test near the left gutter (clear of centred overlays
        like the FX pill) and walk up to the nearest f-mode-* element.
     3. Background luminance — the first ancestor with a non-transparent
        background wins. This is what covers the gaps BETWEEN sections, where
        the page's own baseline colour is all there is.

   Geometry rather than hit-testing alone, because a hit test at the bar's edge
   lands on the dropdown backdrop whenever a menu is open, and the backdrop
   belongs to no section — which would flip the bar mid-interaction.

   Any element can force the answer with data-n58-navbar="light|dark".
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var nav = document.querySelector('.flwr_navbar_wrap');
  if (!nav) return;

  var SECTIONS = 'section, footer, [data-n58-navbar]';
  var IGNORE = '.flwr_navbar_wrap, .flwr_navbar_dropdown_backdrop, .alan-fab, .n58-fx-bar';

  function deepestSectionAt(y) {
    var nodes = document.querySelectorAll(SECTIONS);
    var hit = null;
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i];
      if (nav.contains(s) || s.contains(nav)) continue;
      var r = s.getBoundingClientRect();
      if (!r.height || r.top > y || r.bottom <= y) continue;
      // Prefer the most nested match: it describes the surface, not the wrapper.
      if (!hit || hit.contains(s)) hit = s;
    }
    return hit;
  }

  function elementAt(x, y) {
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      var e = els[i];
      if (nav.contains(e) || (e.closest && e.closest(IGNORE))) continue;
      return e;
    }
    return null;
  }

  function opaqueBackgroundOf(el) {
    for (var e = el; e && e !== document.documentElement; e = e.parentElement) {
      var bg = getComputedStyle(e).backgroundColor;
      var m = bg && bg.match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      var parts = m[1].split(',').map(parseFloat);
      if (parts.length > 3 && parts[3] < 0.5) continue;   // see-through: keep going
      return parts;
    }
    var root = getComputedStyle(document.documentElement).backgroundColor.match(/rgba?\(([^)]+)\)/);
    return root ? root[1].split(',').map(parseFloat) : null;
  }

  function isDarkColor(rgb) {
    if (!rgb) return true;
    // Rec. 601 luma is plenty for a light/dark decision.
    var luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    return luma < 0.5;
  }

  function modeOf(el) {
    if (!el) return null;
    var flagged = el.closest && el.closest('[data-n58-navbar]');
    if (flagged) return flagged.getAttribute('data-n58-navbar') === 'light' ? 'light' : 'dark';
    var moded = el.closest && el.closest('.f-mode-dark, .f-mode-light');
    if (moded) return moded.classList.contains('f-mode-dark') ? 'dark' : 'light';
    return null;
  }

  function behindIsDark() {
    var r = nav.getBoundingClientRect();
    var y = r.bottom + 2;                 // just inside whatever sits below

    var sec = deepestSectionAt(y);
    var mode = modeOf(sec);
    if (mode) return mode === 'dark';

    // Left gutter: clear of the centred FX pill and other floating chrome.
    var el = elementAt(Math.max(8, r.left + 24), y) || elementAt(r.left + r.width / 2, y);
    mode = modeOf(el);
    if (mode) return mode === 'dark';

    return isDarkColor(opaqueBackgroundOf(el || document.body));
  }

  var raf = 0;
  function update() {
    raf = 0;
    nav.classList.toggle('is-light', !behindIsDark());
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(update);
  }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  addEventListener('load', schedule);          // late media can reflow sections
  update();
})();
