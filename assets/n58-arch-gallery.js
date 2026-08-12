(function () {
  if (!window.requestAnimationFrame || !window.getComputedStyle) return;

  var mobileMq = window.matchMedia ? window.matchMedia('(max-width: 991px)') : null;
  function parseLength(value) {
    var raw = (value || '').trim();
    if (!raw) return 0;
    if (raw.slice(-2) === 'px') return parseFloat(raw) || 0;
    if (raw.slice(-3) === 'rem') {
      var rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      return (parseFloat(raw) || 0) * rootSize;
    }
    return parseFloat(raw) || 0;
  }

  function initArch(wrap) {
    if (!wrap.querySelector('.n58-arch-slide')) return;

    var active = false;
    var rafId = 0;

    /* Query the live slide set every frame, NOT once at init. The flwr marquee
       clones each slide AFTER this script runs (to build its seamless loop), and
       clones are cloneNode(true) snapshots that freeze whatever --arch-* values
       the original held at clone time. If we only animate the originals captured
       at init, every clone stays frozen mid-arc and reads as a displaced card
       that doesn't follow the curve. Re-querying picks up clones (and survives
       the marquee re-cloning on resize). */
    function getSlides() {
      return wrap.querySelectorAll('.n58-arch-slide');
    }

    function setRestState() {
      var slides = getSlides();
      for (var i = 0; i < slides.length; i++) {
        slides[i].style.setProperty('--arch-y', '0px');
        slides[i].style.setProperty('--arch-rot', '0deg');
        slides[i].style.setProperty('--arch-scale', '1');
      }
    }

    function frame() {
      rafId = 0;

      if (mobileMq && mobileMq.matches) {
        setRestState();
        return;
      }

      var styles = getComputedStyle(wrap);
      var lift = parseLength(styles.getPropertyValue('--arch-lift')) || 88;
      var radiusF = parseFloat(styles.getPropertyValue('--arch-radius-f')) || 1;
      var scaleMax = parseFloat(styles.getPropertyValue('--arch-scale-max')) || 0.04;
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1;
      var viewportCenter = viewportWidth / 2;
      /* True circle geometry: every card center sits on a ring of radius R
         whose center is below the apex; rotation is the card's angle on the
         ring (tangent), so the row reads as one coherent circular fan. */
      var radius = radiusF * viewportWidth;

      var slides = getSlides();
      for (var i = 0; i < slides.length; i++) {
        var slide = slides[i];
        var rect = slide.getBoundingClientRect();
        if (rect.right < -rect.width || rect.left > viewportWidth + rect.width) continue;

        var slideCenter = rect.left + rect.width / 2;
        var dx = slideCenter - viewportCenter;
        var s = Math.max(-0.95, Math.min(0.95, dx / radius));
        var angle = Math.asin(s);
        var drop = radius * (1 - Math.cos(angle));
        var y = drop - lift;
        var rot = angle * (180 / Math.PI);
        var scale = 1 + Math.max(0, (Math.cos(angle) - 0.9) / 0.1) * scaleMax;

        slide.style.setProperty('--arch-y', y.toFixed(2) + 'px');
        slide.style.setProperty('--arch-rot', rot.toFixed(2) + 'deg');
        slide.style.setProperty('--arch-scale', scale.toFixed(4));
      }

      if (!active) return;
      rafId = window.requestAnimationFrame(frame);
    }

    function stop() {
      active = false;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function start() {
      if (active && rafId) return;
      active = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(frame);
    }

    function refresh() {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (active) start();
      else frame();
    }

    if ('IntersectionObserver' in window) {
      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting) start();
        else stop();
      }, { threshold: 0.1 });
      observer.observe(wrap);
    } else {
      start();
    }

    if (mobileMq) {
      if (mobileMq.addEventListener) mobileMq.addEventListener('change', refresh);
      else if (mobileMq.addListener) mobileMq.addListener(refresh);
    }
    window.addEventListener('resize', refresh, { passive: true });
    frame();
  }

  function run() {
    var wraps = Array.prototype.slice.call(document.querySelectorAll('.n58-arch-marquee'));
    if (!wraps.length) return;
    for (var i = 0; i < wraps.length; i++) initArch(wraps[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
