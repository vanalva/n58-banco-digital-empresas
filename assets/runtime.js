/* ============================================================================
   flwr runtime — vanilla JS controllers for behaviors that CSS can't express.
   Self-initializes on DOMContentLoaded. All behaviors are gated by data
   attributes — no element with the attribute = no work done. Safe to load
   on any page.

   Conventions:
     [data-flwr-trigger~="scroll"]              opens a <dialog> at scroll depth
     [data-flwr-scroll-threshold="<px>"]        per-instance trigger depth
     [data-flwr-scroll-once="true|false"]       fire only once (default true)
     [data-flwr-target="next"]                  cycles its closest card-stack
     [data-flwr-target="prev"]                  reverses its closest card-stack

   Public API on window.flwr:
     flwr.cardStack.next(stackEl)
     flwr.cardStack.prev(stackEl)
     flwr.scrollDialog.refresh()                 re-scan DOM for new dialogs

   No external dependencies. ~2KB unminified.
   ============================================================================ */

(function () {
  'use strict';

  /* -- card stack ------------------------------------------------------- */

  function getStackList(wrap) {
    return wrap && wrap.querySelector('.flwr_card_stack_list');
  }

  /* Apply --_card-stack---index inline based on each slide's position.
     Last DOM child gets index 0 (top of stack), then 1, 2, 3 deeper.
     Index >= max-depth fades to opacity 0 (handled by CSS fallback too). */
  function indexStack(wrap) {
    var list = getStackList(wrap);
    if (!list) return;
    var slides = list.children;
    var n = slides.length;
    for (var i = 0; i < n; i++) {
      slides[i].style.setProperty('--_card-stack---index', String(n - 1 - i));
    }
  }

  /* Read the wind-up duration from the wrap's computed style so the JS timer
     stays in sync with --_component---card-stack--wind-up-duration. Falls back
     to 240ms if the var is unset (matches the token default). */
  function getWindUpMs(wrap) {
    var raw = getComputedStyle(wrap)
      .getPropertyValue('--_component---card-stack--wind-up-duration')
      .trim();
    if (!raw) return 240;
    if (raw.slice(-2) === 'ms') return parseFloat(raw) || 240;
    if (raw.slice(-1) === 's')  return (parseFloat(raw) || 0.24) * 1000;
    return parseFloat(raw) || 240;
  }

  function nextCard(wrap) {
    var list = getStackList(wrap);
    if (!list) return;
    var top = list.lastElementChild;
    if (!top || top.classList.contains('is-moving-back')) return;
    /* Step 1 — wind up: top card translates OPPOSITE the peek direction
       briefly, like a hand drawing a card out before tucking it under. */
    top.classList.add('is-moving-back');
    /* Step 2 — re-parent to the front of the DOM list (= deepest in stack)
       after wind-up completes. Natural transition between indices slides
       every card to its new layer position. */
    setTimeout(function () {
      top.classList.remove('is-moving-back');
      list.insertBefore(top, list.firstElementChild);
      indexStack(wrap);
    }, getWindUpMs(wrap));
  }

  function prevCard(wrap) {
    var list = getStackList(wrap);
    if (!list) return;
    var first = list.firstElementChild;
    if (!first) return;
    /* Move first DOM child to last (= bring deepest card to top). Natural
       transition slides it forward from peek position to front. */
    list.appendChild(first);
    indexStack(wrap);
  }

  /* Bring any deeper card to the top of the stack. Animation handled by the
     natural CSS transition between layer indices — clicked card slides
     forward from its peek position to translate(0, 0). Cards in front of it
     shift back one layer. */
  function moveToTop(wrap, slide) {
    var list = getStackList(wrap);
    if (!list || !slide || slide.parentElement !== list) return;
    if (slide === list.lastElementChild) return; /* already on top */
    list.appendChild(slide);
    indexStack(wrap);
  }

  function initCardStacks(root) {
    var scope = root || document;
    /* Index every stack on the page so depth is correct from first paint */
    var wraps = scope.querySelectorAll('.flwr_card_stack_wrap');
    for (var i = 0; i < wraps.length; i++) indexStack(wraps[i]);

    /* Single delegated click handler. Any slide is clickable:
         - top slide  → cycle back (wind-up + tuck under)
         - any deeper → slide forward to the top
       Buttons with data-flwr-target="next"/"prev" still work as explicit nav. */
    scope.addEventListener('click', function (e) {
      var slide = e.target.closest && e.target.closest('.flwr_card_stack_slide');
      if (slide) {
        var wrap = slide.closest('.flwr_card_stack_wrap');
        if (wrap) {
          var list = slide.parentElement;
          if (slide === list.lastElementChild) {
            nextCard(wrap);
          } else {
            moveToTop(wrap, slide);
          }
          return;
        }
      }
      var nextBtn = e.target.closest && e.target.closest('[data-flwr-target="next"]');
      if (nextBtn) {
        var wrapN = nextBtn.closest('.flwr_card_stack_wrap');
        if (wrapN) nextCard(wrapN);
        return;
      }
      var prevBtn = e.target.closest && e.target.closest('[data-flwr-target="prev"]');
      if (prevBtn) {
        var wrapP = prevBtn.closest('.flwr_card_stack_wrap');
        if (wrapP) prevCard(wrapP);
      }
    });
  }

  /* -- scroll-triggered dialogs ----------------------------------------- */

  var scrollDialogs = [];
  var scrollFired = new WeakSet();

  function scanScrollDialogs() {
    scrollDialogs = Array.prototype.slice.call(
      document.querySelectorAll('dialog[data-flwr-trigger~="scroll"]')
    );
  }

  function checkScrollDialogs() {
    if (!scrollDialogs.length) return;
    var y = window.scrollY || window.pageYOffset || 0;
    for (var i = 0; i < scrollDialogs.length; i++) {
      var d = scrollDialogs[i];
      var fireOnce = d.dataset.flwrScrollOnce !== 'false';
      if (fireOnce && scrollFired.has(d)) continue;
      var threshold = parseInt(d.dataset.flwrScrollThreshold || '200', 10);
      if (y >= threshold && typeof d.showModal === 'function' && !d.open) {
        try { d.showModal(); } catch (err) { /* already open or invalid state */ }
        if (fireOnce) scrollFired.add(d);
      }
    }
  }

  function initScrollDialogs() {
    scanScrollDialogs();
    if (!scrollDialogs.length) return;
    window.addEventListener('scroll', checkScrollDialogs, { passive: true });
    /* Run once at load in case page is already scrolled past threshold */
    checkScrollDialogs();
  }

  /* -- marquee ---------------------------------------------------------- */
  /* Adapted from Alttura. Custom GPU-friendly infinite scroller with optional
     text-fill scaling, hover-pause, hover-ease, drag-to-scrub, prefers-
     reduced-motion respect. Runs only on [data-flwr="marquee"]. */

  function attr(el, name, fallback) {
    var v = el.getAttribute(name);
    return v === null ? fallback : v;
  }
  function attrBool(el, name, fallback) {
    var v = el.getAttribute(name);
    if (v === null) return fallback;
    return v === 'true';
  }

  function initMarquee(wrap) {
    if (wrap.__flwrMarqueeInit) return;
    wrap.__flwrMarqueeInit = true;
    var track = wrap.querySelector('.flwr_marquee_track');
    if (!track) return;

    var dirRTL          = attrBool(wrap, 'data-flwr-marquee-direction', false);
    var speedMs         = parseInt(attr(wrap, 'data-flwr-marquee-speed', '20000'), 10) || 20000;
    var hoverPause      = attrBool(wrap, 'data-flwr-marquee-hover-pause', true);
    var hoverEase       = attrBool(wrap, 'data-flwr-marquee-hover-ease', true);
    var respectPRM      = attrBool(wrap, 'data-flwr-marquee-respect-prm', true);
    var draggable       = attrBool(wrap, 'data-flwr-marquee-draggable', false);
    var scaleText       = attrBool(wrap, 'data-flwr-marquee-scale-text', false);
    var textMultiplier  = parseFloat(attr(wrap, 'data-flwr-marquee-text-width-multiplier', '2')) || 2;

    var prm = window.matchMedia('(prefers-reduced-motion: reduce)');
    var reduceMotion = respectPRM && prm.matches;

    /* Smart text-fill — duplicate single item to fill multiplier × parent
       width, then scale font-size so each item matches the target width. */
    function setupTextFill() {
      if (!scaleText) return;
      var originals = [].filter.call(track.children, function (n) {
        return !n.classList.contains('marquee-clone');
      });

      function waitForWidth(cb, attempts) {
        attempts = attempts || 0;
        var w = wrap.offsetWidth;
        if (w > 0) { cb(w); return; }
        if (attempts > 100) return;
        requestAnimationFrame(function () { waitForWidth(cb, attempts + 1); });
      }

      if (originals.length === 1) {
        waitForWidth(function () {
          for (var i = 0; i < Math.ceil(textMultiplier) + 2; i++) {
            var clone = originals[0].cloneNode(true);
            clone.setAttribute('data-auto-duplicate', 'true');
            track.appendChild(clone);
          }
        });
      }
      [].forEach.call(track.children, function (item) {
        if (item.classList.contains('marquee-clone')) return;
        item.classList.add('flwr_marquee_item', 'is-text-fill');
      });

      function adjustFont() {
        var parentW = wrap.offsetWidth;
        if (parentW === 0) {
          requestAnimationFrame(function () { requestAnimationFrame(adjustFont); });
          return;
        }
        [].forEach.call(track.children, function (item) {
          if (item.classList.contains('marquee-clone')) return;
          var target = parentW * textMultiplier;
          var textEl = item.querySelector('p,h1,h2,h3,h4,h5,h6,span,div') || item;
          var measure = textEl.cloneNode(true);
          measure.style.cssText = 'position:absolute;visibility:hidden;width:auto;display:inline-block;white-space:nowrap;';
          document.body.appendChild(measure);
          var curW = measure.offsetWidth;
          var curFs = parseFloat(getComputedStyle(measure).fontSize);
          document.body.removeChild(measure);
          if (curW > 0) {
            var newFs = (target / curW) * curFs;
            textEl.style.fontSize = newFs + 'px';
          }
        });
      }

      waitForWidth(adjustFont);
      setTimeout(adjustFont, 100);
      setTimeout(adjustFont, 300);
      if (document.fonts) document.fonts.ready.then(adjustFont);
      var rt;
      window.addEventListener('resize', function () {
        clearTimeout(rt);
        rt = setTimeout(adjustFont, 150);
      });
    }
    setupTextFill();

    /* Animation engine — measure track, clone for seamless wrap, RAF loop */
    var packDistance = 0;
    var offset = 0;
    var targetVx = 0;
    var currentVx = 0;
    var playing = true;
    var dragging = false;
    var lastPx = 0;
    var rafId = 0;
    var lastT = 0;

    function measureAndClone() {
      [].forEach.call(track.querySelectorAll('.marquee-clone'), function (n) { n.remove(); });
      var items = [].filter.call(track.children, function (n) { return !n.classList.contains('marquee-clone'); });
      if (!items.length) return 0;
      var first = items[0];
      var last = items[items.length - 1];
      /* Measure with rects, not offsetLeft/offsetWidth: those are undefined on
         SVGElement, so an inline <svg> item (e.g. an inlined separator icon)
         poisoned dist with NaN — NaN passed the <=0 guard, produced NaN clone
         counts (zero clones) and NaN speed, freezing the marquee. Both rects
         share the track's transform, so the difference is translation-safe. */
      var fr = first.getBoundingClientRect();
      var lr = last.getBoundingClientRect();
      /* The wrap period is item[0]→its-clone, which spans the full item set PLUS
         the one column-gap that flex inserts between the last original item and
         the first clone. lr.right-fr.left omits that trailing gap, so without it
         the loop resets one gap short every cycle — the whole track (and anything
         riding on it, e.g. the arch-gallery transform) hitches sideways by one
         gap. Add the gap back so the seam is truly continuous. */
      var trackCS = getComputedStyle(track);
      var gap = parseFloat(trackCS.columnGap || trackCS.gap) || 0;
      var dist = Math.round(lr.right - fr.left + gap);
      if (!(dist > 0)) return 0;
      /* Clone enough full sets to cover the viewport plus one wrap span, so the
         seam is never visible even when one item set is narrower than the
         marquee (e.g. a short ticker). */
      var copies = Math.max(2, Math.ceil(wrap.offsetWidth / dist) + 1);
      var k, i;
      for (k = 0; k < copies; k++) {
        items.forEach(function (n) {
          var c = n.cloneNode(true);
          c.classList.add('marquee-clone');
          track.appendChild(c);
        });
      }
      if (dirRTL) {
        for (k = 0; k < copies; k++) {
          for (i = items.length - 1; i >= 0; i--) {
            var c2 = items[i].cloneNode(true);
            c2.classList.add('marquee-clone');
            track.insertBefore(c2, track.firstChild);
          }
        }
      }
      offset = dirRTL ? -dist + 0.001 : -0.001;
      track.style.transform = 'translate3d(' + offset + 'px,0,0)';
      return dist;
    }
    function setSpeed() {
      var cycle = reduceMotion ? Math.max(1, speedMs) * 3 : Math.max(1, speedMs);
      var v = packDistance / cycle;
      targetVx = dirRTL ? v : -v;
      if (!hoverEase) currentVx = targetVx;
    }
    function wrapOff(span) {
      if (dirRTL) {
        while (offset >= 0)    offset -= span;
        while (offset < -span) offset += span;
      } else {
        while (offset <= -span) offset += span;
        while (offset > 0)      offset -= span;
      }
    }
    function tick(now) {
      if (!lastT) lastT = now;
      var dt = Math.min(now - lastT, 100);
      lastT = now;
      if (hoverEase) currentVx += (targetVx - currentVx) * 0.15;
      var vx = hoverEase ? currentVx : targetVx;
      if ((playing && !dragging) || hoverEase) {
        offset += vx * dt;
        if (packDistance > 0) wrapOff(packDistance);
        track.style.transform = 'translate3d(' + Math.round(offset) + 'px,0,0)';
      }
      rafId = requestAnimationFrame(tick);
    }
    function start() { cancelAnimationFrame(rafId); lastT = 0; rafId = requestAnimationFrame(tick); }
    function pause() { playing = false; targetVx = 0; if (!hoverEase) currentVx = 0; }
    function resume() { playing = true; setSpeed(); }

    if (hoverPause) {
      wrap.addEventListener('mouseenter', function () { if (!dragging) pause(); });
      wrap.addEventListener('mouseleave', function () { if (!dragging) resume(); });
    }
    if (draggable) {
      /* Let the browser own vertical panning (page scroll); JS only handles a
         clearly-horizontal drag. Previously pointerdown set touch-action:none and
         captured the pointer immediately, so a vertical scroll swipe that started
         over the marquee was hijacked and scrubbed sideways — the marquee glitched
         instead of the page scrolling. touch-action:pan-y tells the browser to
         keep handling vertical scroll and only hand JS the horizontal gestures. */
      wrap.style.touchAction = 'pan-y';
      var moved = 0;
      wrap.addEventListener('click', function (e) {
        if (moved > 3) { e.stopPropagation(); e.preventDefault(); }
      }, true);
      wrap.addEventListener('pointerdown', function (e) {
        var startX = e.clientX || 0, startY = e.clientY || 0;
        lastPx = startX; moved = 0;
        var engaged = false;
        function mv(ev) {
          var x = ev.clientX || 0, y = ev.clientY || 0;
          if (!engaged) {
            var dX = Math.abs(x - startX), dY = Math.abs(y - startY);
            if (dX < 6 && dY < 6) return;         // wait for an intentional gesture
            if (dY > dX) { cleanup(); return; }   // vertical intent → let the page scroll
            // horizontal intent → take over scrubbing
            engaged = true; dragging = true;
            wrap.classList.add('is-dragging');
            pause();
            try { wrap.setPointerCapture && wrap.setPointerCapture(e.pointerId); } catch (_) {}
          }
          var dx = x - lastPx; lastPx = x;
          moved += Math.abs(dx);
          offset += dx;
          if (packDistance > 0) wrapOff(packDistance);
          track.style.transform = 'translate3d(' + offset + 'px,0,0)';
        }
        function up() {
          if (engaged) {
            dragging = false;
            wrap.classList.remove('is-dragging');
            resume();
          }
          cleanup();
        }
        function cleanup() {
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
        }
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }

    var rt;
    function rebuild() { packDistance = measureAndClone(); setSpeed(); }
    function debounced() { clearTimeout(rt); rt = setTimeout(rebuild, 120); }
    window.addEventListener('resize', debounced, { passive: true });

    function waitAssets() {
      var imgs = track.querySelectorAll('img');
      var pending = imgs.length;
      return new Promise(function (res) {
        if (!pending) return res();
        [].forEach.call(imgs, function (im) {
          if (im.complete) { if (--pending === 0) res(); }
          else {
            im.addEventListener('load',  function () { if (--pending === 0) res(); }, { once: true });
            im.addEventListener('error', function () { if (--pending === 0) res(); }, { once: true });
          }
        });
      });
    }
    waitAssets().then(function () {
      function check() {
        if (wrap.offsetWidth > 0 && wrap.offsetHeight > 0) {
          rebuild();
          start();
        } else requestAnimationFrame(check);
      }
      check();
    });
  }

  function initMarquees(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="marquee"]');
    [].forEach.call(wraps, function (w, i) {
      setTimeout(function () { initMarquee(w); }, i * 150);
    });
  }

  /* -- swiper wrapper --------------------------------------------------- */
  /* Hydrates [data-flwr="swiper"] elements onto Swiper.js if present.
     Reads config from data-flwr-swiper-* attributes. Adapted from Alttura. */

  function initSwipers(scope) {
    if (typeof window.Swiper === 'undefined') return;
    var wraps = (scope || document).querySelectorAll('[data-flwr="swiper"]');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrSwiperInit) return;
      wrap.__flwrSwiperInit = true;
      var el = wrap.querySelector('.flwr_swiper_wrap');
      var listEl = wrap.querySelector('.flwr_swiper_track');
      if (!el || !listEl) return;
      el.classList.add('swiper');
      listEl.classList.add('swiper-wrapper');
      [].forEach.call(listEl.children, function (c) {
        c.classList.add('swiper-slide', 'flwr_swiper_slide');
      });

      var followFinger     = attrBool(wrap, 'data-flwr-swiper-follow-finger', true);
      var freeMode         = attrBool(wrap, 'data-flwr-swiper-free-mode', false);
      var mousewheel       = attrBool(wrap, 'data-flwr-swiper-mousewheel', false);
      var slideToClicked   = attrBool(wrap, 'data-flwr-swiper-slide-to-clicked', false);
      var loop             = attrBool(wrap, 'data-flwr-swiper-loop', false);
      var autoplay         = attrBool(wrap, 'data-flwr-swiper-autoplay', false);
      var speed            = parseInt(attr(wrap, 'data-flwr-swiper-speed', '600'), 10) || 600;
      var autoplayDelay    = parseInt(attr(wrap, 'data-flwr-swiper-autoplay-delay', '4000'), 10) || 4000;
      /* The framework expresses card spacing as flex gap. Swiper 8 does not
         include that CSS gap in its snap-grid math, so the rendered cards and
         drag/navigation positions drift apart. Hand the measured gap to Swiper
         as spaceBetween and remove the duplicate visual gap from the track. */
      var trackStyles      = window.getComputedStyle(listEl);
      var swiperGap        = parseFloat(trackStyles.columnGap || trackStyles.gap) || 0;
      listEl.style.columnGap = '0px';
      listEl.style.rowGap = '0px';

      var nextBtn = wrap.querySelector('[data-flwr-target="next"] button, [data-flwr-target="next"]');
      var prevBtn = wrap.querySelector('[data-flwr-target="prev"] button, [data-flwr-target="prev"]');
      var paginationEl = wrap.querySelector('[data-flwr-target="pagination"]');
      if (paginationEl) paginationEl.classList.add('flwr_swiper_pagination');
      if (nextBtn) nextBtn.classList.add('flwr_swiper_arrow', 'is-next');
      if (prevBtn) prevBtn.classList.add('flwr_swiper_arrow', 'is-prev');

      var config = {
        slidesPerView: 'auto',
        grabCursor: true,
        followFinger: followFinger,
        freeMode: freeMode,
        slideToClickedSlide: slideToClicked,
        speed: speed,
        loop: loop,
        loopAdditionalSlides: 10,
        spaceBetween: swiperGap,
        watchOverflow: true,
        slideActiveClass: 'is-active',
        slideDuplicateActiveClass: 'is-active',
        keyboard: { enabled: true, onlyInViewport: true }
      };
      if (mousewheel) config.mousewheel = { forceToAxis: true };
      if (nextBtn || prevBtn) config.navigation = { nextEl: nextBtn, prevEl: prevBtn };
      if (paginationEl) {
        config.pagination = {
          el: paginationEl,
          bulletClass: 'flwr_swiper_bullet',
          bulletActiveClass: 'is-active',
          bulletElement: 'button',
          clickable: true
        };
      }
      if (autoplay) {
        config.autoplay = {
          delay: autoplayDelay,
          disableOnInteraction: false,
          pauseOnMouseEnter: true
        };
      }
      try { new window.Swiper(el, config); } catch (err) {
        console.warn('[flwr] swiper init failed', err);
      }
    });
  }

  /* -- map (Leaflet) ---------------------------------------------------- */
  /* Hydrates [data-flwr="map"] onto Leaflet if window.L is present. */

  var TILE_URLS = {
    light:   'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    dark:    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  };

  function initMap(wrap) {
    if (wrap.__flwrMapInit) return;
    wrap.__flwrMapInit = true;
    var canvas = wrap.querySelector('.flwr_map_canvas');
    if (!canvas) return;
    if (canvas.offsetHeight === 0) { setTimeout(function () { wrap.__flwrMapInit = false; initMap(wrap); }, 200); return; }

    var theme = attr(wrap, 'data-flwr-map-theme', 'dark');
    var tileUrl = TILE_URLS[theme] || TILE_URLS.dark;
    var locItems = wrap.querySelectorAll('.flwr_map_location');
    var locations = [];
    [].forEach.call(locItems, function (it) {
      var lat = parseFloat(it.getAttribute('data-flwr-map-lat'));
      var lng = parseFloat(it.getAttribute('data-flwr-map-lng'));
      if (isNaN(lat) || isNaN(lng)) return;
      locations.push({
        lat: lat, lng: lng,
        name:    it.getAttribute('data-flwr-map-name') || '',
        address: it.getAttribute('data-flwr-map-address') || '',
        url:     it.getAttribute('data-flwr-map-url') || ''
      });
    });
    if (!locations.length) return;

    var actionBtn = wrap.querySelector('.flwr_map_action');
    if (actionBtn) actionBtn.style.display = 'none';
    var L = window.L;
    var centerLat = locations.reduce(function (s, l) { return s + l.lat; }, 0) / locations.length;
    var centerLng = locations.reduce(function (s, l) { return s + l.lng; }, 0) / locations.length;
    var map = L.map(canvas, {
      center: [centerLat, centerLng],
      zoom: 12,
      zoomControl: true,
      scrollWheelZoom: false
    });
    /* ctrl+wheel to zoom (avoids hijacking page scroll) */
    canvas.addEventListener('wheel', function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) map.zoomIn(); else map.zoomOut();
      }
    }, { passive: false });
    L.tileLayer(tileUrl, { attribution: '&copy; OpenStreetMap', subdomains: 'abcd', maxZoom: 20 }).addTo(map);

    var icon = L.divIcon({ className: 'flwr_map_marker', iconSize: [20, 20], iconAnchor: [10, 10] });
    var activeMarker = null;
    function reset() {
      if (activeMarker && activeMarker._icon) activeMarker._icon.classList.remove('is-active');
      activeMarker = null;
      if (actionBtn) actionBtn.style.display = 'none';
      if (locations.length > 1) {
        map.fitBounds(L.latLngBounds(locations.map(function (l) { return [l.lat, l.lng]; })), { padding: [50, 50] });
      }
    }
    function select(marker, loc) {
      if (activeMarker && activeMarker !== marker && activeMarker._icon) activeMarker._icon.classList.remove('is-active');
      activeMarker = marker;
      if (marker._icon) marker._icon.classList.add('is-active');
      if (actionBtn && loc.url) {
        actionBtn.setAttribute('href', loc.url);
        actionBtn.style.display = 'inline-block';
      }
      map.setView([loc.lat, loc.lng], 16, { animate: true, duration: 0.6 });
    }
    locations.forEach(function (loc) {
      var m = L.marker([loc.lat, loc.lng], { icon: icon }).addTo(map);
      m.bindPopup(
        '<div class="flwr_map_popup_title">' + loc.name + '</div>' +
        '<div class="flwr_map_popup_address">' + loc.address + '</div>',
        { closeButton: true, maxWidth: 280, offset: [0, -10] }
      );
      m.on('click', function () { select(m, loc); m.openPopup(); });
      m.on('mouseover', function () { if (activeMarker !== m) m.openPopup(); });
      m.on('mouseout',  function () { if (activeMarker !== m) m.closePopup(); });
    });
    map.on('popupclose', function (e) { if (activeMarker && e.popup._source === activeMarker) reset(); });
    map.on('click', function (e) {
      if (e.originalEvent.target.classList.contains('leaflet-container') ||
          e.originalEvent.target.classList.contains('leaflet-tile')) reset();
    });
    if (locations.length > 1) {
      map.fitBounds(L.latLngBounds(locations.map(function (l) { return [l.lat, l.lng]; })), { padding: [50, 50] });
    } else {
      map.setView([locations[0].lat, locations[0].lng], 14);
    }
    setTimeout(function () { map.invalidateSize(); }, 250);
  }

  function initMaps(scope) {
    if (typeof window.L === 'undefined') return;
    var wraps = (scope || document).querySelectorAll('[data-flwr="map"]');
    [].forEach.call(wraps, initMap);
  }

  /* -- scrubber --------------------------------------------------------- */
  /* Hover X position → image-sequence frame, with cross-fade between
     adjacent frames. Touch supported. Adapted from Alttura's tod-scrubber. */

  function initScrubber(root) {
    if (root.__flwrScrubInit) return;
    root.__flwrScrubInit = true;
    var layers = [].slice.call(root.querySelectorAll('.flwr_scrubber_layer'));
    if (!layers.length) return;
    layers.forEach(function (l, i) { l.style.opacity = i === 0 ? '1' : '0'; });

    function setFrame(progress) {
      var idx = progress * (layers.length - 1);
      var lo = Math.floor(idx);
      var hi = Math.min(layers.length - 1, Math.ceil(idx));
      var t = idx - lo;
      layers.forEach(function (el, i) {
        if (i === lo) el.style.opacity = (1 - t).toString();
        else if (i === hi) el.style.opacity = t.toString();
        else el.style.opacity = '0';
      });
    }
    function move(e) {
      var rect = root.getBoundingClientRect();
      var clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX) || 0;
      var p = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setFrame(p);
    }
    root.addEventListener('mousemove', move);
    root.addEventListener('mouseenter', move);
    root.addEventListener('touchstart', move, { passive: true });
    root.addEventListener('touchmove', move, { passive: true });
    root.addEventListener('mouseleave', function () { setFrame(0); });
    setFrame(0);
  }

  function initScrubbers(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="scrubber"]');
    [].forEach.call(wraps, initScrubber);
  }

  /* -- tabs (incl. vertical + title-swap) ------------------------------ */
  /* Pure-vanilla tab controller. Reads aria-selected / aria-controls, clicks
     update [aria-selected] + .is-active on triggers and panels. Optional
     title-swap mode animates a heading element via --_tabs-swap---progress. */

  function initTabs(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="tabs"]');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrTabsInit) return;
      wrap.__flwrTabsInit = true;
      var triggers = wrap.querySelectorAll('.flwr_tabs_trigger');
      var panels   = wrap.querySelectorAll('.flwr_tabs_panel');
      var swapTitle = wrap.querySelector('.flwr_tabs_swap_title');
      var swapInner = swapTitle && swapTitle.querySelector('.flwr_tabs_swap_title_inner');

      function activate(idx, opts) {
        opts = opts || {};
        [].forEach.call(triggers, function (t, i) {
          var on = i === idx;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          t.classList.toggle('is-active', on);
        });
        [].forEach.call(panels, function (p, i) {
          var on = i === idx;
          p.classList.toggle('is-active', on);
          p.hidden = !on;
        });
        if (swapTitle && swapInner && triggers[idx] && !opts.skipSwap) {
          /* Animate: slide current title out, swap content, slide new in */
          swapTitle.classList.add('is-entering');
          requestAnimationFrame(function () {
            swapInner.textContent = triggers[idx].dataset.flwrTabsTitle ||
              triggers[idx].textContent.trim();
            requestAnimationFrame(function () {
              swapTitle.classList.remove('is-entering');
            });
          });
        }
      }

      [].forEach.call(triggers, function (t, i) {
        t.addEventListener('click', function () { activate(i); });
        t.addEventListener('keydown', function (e) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); triggers[(i + 1) % triggers.length].focus(); }
          if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  { e.preventDefault(); triggers[(i - 1 + triggers.length) % triggers.length].focus(); }
        });
      });

      /* Find initial active trigger or default to 0 */
      var initial = 0;
      [].forEach.call(triggers, function (t, i) {
        if (t.getAttribute('aria-selected') === 'true' || t.classList.contains('is-active')) initial = i;
      });
      activate(initial, { skipSwap: true });
      if (swapTitle && swapInner && triggers[initial]) {
        swapInner.textContent = triggers[initial].dataset.flwrTabsTitle ||
          triggers[initial].textContent.trim();
      }

      /* Expose .activate(idx) for programmatic control */
      wrap.__flwrActivate = activate;
    });
  }

  /* -- document search (TreeWalker highlight) -------------------------- */
  /* Marks all text matches inside [data-flwr-search-target] as
     <mark class="flwr_search_highlight">. Prev/Next cycle through matches.
     Optional per-tab match counters via [data-flwr-search-tab-counter]. */

  function initSearch(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="search"]');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrSearchInit) return;
      wrap.__flwrSearchInit = true;
      var input    = wrap.querySelector('.flwr_search_input');
      var clearBtn = wrap.querySelector('.flwr_search_clear_btn');
      var prevBtn  = wrap.querySelector('.flwr_search_nav_btn[data-flwr-target="prev"]');
      var nextBtn  = wrap.querySelector('.flwr_search_nav_btn[data-flwr-target="next"]');
      var counter  = wrap.querySelector('.flwr_search_match_counter');
      var nav      = wrap.querySelector('.flwr_search_navigation');
      var targetSel = wrap.getAttribute('data-flwr-search-target');
      var target   = targetSel ? document.querySelector(targetSel) : document.body;
      if (!input || !target) return;

      var currentIdx = -1;
      var marks = [];

      function clearMarks() {
        [].forEach.call(target.querySelectorAll('.flwr_search_highlight'), function (m) {
          var p = m.parentNode;
          while (m.firstChild) p.insertBefore(m.firstChild, m);
          p.removeChild(m);
          p.normalize();
        });
        marks = [];
        currentIdx = -1;
      }

      function highlightAll(term) {
        clearMarks();
        if (!term) return;
        var lower = term.toLowerCase();
        var walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
          acceptNode: function (node) {
            if (!node.nodeValue || node.nodeValue.trim() === '') return NodeFilter.FILTER_REJECT;
            var p = node.parentNode;
            if (!p || p.closest && p.closest('.flwr_search_bar, script, style, .flwr_search_highlight')) return NodeFilter.FILTER_REJECT;
            return node.nodeValue.toLowerCase().indexOf(lower) >= 0
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_REJECT;
          }
        });
        var nodes = [];
        var n; while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(function (node) {
          var text = node.nodeValue;
          var lt = text.toLowerCase();
          var i = 0, last = 0;
          var frag = document.createDocumentFragment();
          while ((i = lt.indexOf(lower, last)) !== -1) {
            if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
            var mark = document.createElement('mark');
            mark.className = 'flwr_search_highlight';
            mark.textContent = text.slice(i, i + lower.length);
            frag.appendChild(mark);
            marks.push(mark);
            last = i + lower.length;
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          node.parentNode.replaceChild(frag, node);
        });
      }

      function updateCounter() {
        if (counter) {
          counter.textContent = marks.length === 0
            ? '0'
            : (currentIdx + 1) + ' / ' + marks.length;
        }
        if (nav) nav.classList.toggle('is-active', input.value.length > 0);
      }
      function setCurrent(i) {
        if (!marks.length) { currentIdx = -1; updateCounter(); return; }
        marks.forEach(function (m) { m.classList.remove('is-current'); });
        currentIdx = ((i % marks.length) + marks.length) % marks.length;
        var cur = marks[currentIdx];
        cur.classList.add('is-current');
        cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
        updateCounter();
      }
      function search() {
        var q = input.value.trim();
        highlightAll(q);
        if (marks.length) setCurrent(0); else updateCounter();
      }

      input.addEventListener('input', search);
      if (clearBtn) clearBtn.addEventListener('click', function () { input.value = ''; search(); input.focus(); });
      if (prevBtn) prevBtn.addEventListener('click', function () { setCurrent(currentIdx - 1); });
      if (nextBtn) nextBtn.addEventListener('click', function () { setCurrent(currentIdx + 1); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          setCurrent(currentIdx + (e.shiftKey ? -1 : 1));
        }
      });
      updateCounter();
    });
  }

  /* -- swiper thumbnails (extends existing initSwipers) ---------------- */
  /* Re-uses Swiper.thumbs API. If [data-flwr-swiper-thumbs="true"] is set
     on the wrap, the runtime hydrates a SECOND Swiper for the thumbs
     track and wires .thumbs.swiper between main and thumbs. */

  function initSwiperThumbs(scope) {
    if (typeof window.Swiper === 'undefined') return;
    var wraps = (scope || document).querySelectorAll('[data-flwr="swiper"][data-flwr-swiper-thumbs="true"]');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrSwiperThumbsInit) return;
      wrap.__flwrSwiperThumbsInit = true;
      var thumbsWrap = wrap.querySelector('[data-flwr-target="thumbs"]');
      if (!thumbsWrap) return;
      thumbsWrap.classList.add('swiper');
      var thumbsTrack = thumbsWrap.querySelector('.flwr_swiper_thumbs_track');
      if (thumbsTrack) thumbsTrack.classList.add('swiper-wrapper');
      [].forEach.call(thumbsWrap.querySelectorAll('.flwr_swiper_thumb'), function (t) {
        t.classList.add('swiper-slide');
      });
      var thumbsSw = new window.Swiper(thumbsWrap, {
        slidesPerView: 'auto',
        spaceBetween: 8,
        watchSlidesProgress: true,
        slideToClickedSlide: true
      });
      /* Store on wrap so the main initSwipers can pick it up — but we
         actually need to inject thumbs config BEFORE main Swiper init.
         Easier: re-init the main with thumbs config now. */
      var mainEl = wrap.querySelector('.flwr_swiper_wrap.swiper');
      if (mainEl && mainEl.swiper) {
        /* Swiper instance already created — use thumbs.swiper setter via params */
        try {
          mainEl.swiper.thumbs = mainEl.swiper.thumbs || {};
          mainEl.swiper.thumbs.swiper = thumbsSw;
          mainEl.swiper.thumbs.init && mainEl.swiper.thumbs.init();
          mainEl.swiper.thumbs.update && mainEl.swiper.thumbs.update(true);
        } catch (_) {}
      }
    });
  }

  /* -- full-screen menu ------------------------------------------------- */
  /* Wraps native <dialog> with showModal()/close() + scroll lock. */

  function initFullscreenMenu(scope) {
    var menus = (scope || document).querySelectorAll('[data-flwr="fullscreen-menu"]');
    [].forEach.call(menus, function (menu) {
      if (menu.__flwrFsMenuInit) return;
      menu.__flwrFsMenuInit = true;
      /* Buttons elsewhere on the page can open this menu via
         [data-flwr-target="fullscreen-menu-trigger"][data-flwr-menu-id="<id>"] */
      var id = menu.id;
      if (id) {
        var triggers = document.querySelectorAll('[data-flwr-target="fullscreen-menu-trigger"][data-flwr-menu-id="' + id + '"]');
        [].forEach.call(triggers, function (t) {
          t.addEventListener('click', function () {
            try { menu.showModal(); document.body.style.overflow = 'hidden'; } catch (_) {}
          });
        });
      }
      /* Close buttons inside */
      [].forEach.call(menu.querySelectorAll('[data-flwr-target="close"]'), function (c) {
        c.addEventListener('click', function () { menu.close(); document.body.style.overflow = ''; });
      });
      /* Click on backdrop / media slot closes too */
      menu.addEventListener('click', function (e) {
        if (e.target === menu) { menu.close(); document.body.style.overflow = ''; }
      });
      menu.addEventListener('close', function () { document.body.style.overflow = ''; });
    });
  }

  /* -- toggle switches (position + bulb variants) ---------------------- */
  /* Click any .flwr_toggle_wrap.is-position or .is-bulb to flip its state.
     Optional [data-flwr-toggle-href] for navigation after toggle. */

  function initToggles(scope) {
    var wraps = (scope || document).querySelectorAll('.flwr_toggle_wrap.is-position, .flwr_toggle_wrap.is-bulb');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrToggleInit) return;
      wrap.__flwrToggleInit = true;
      wrap.addEventListener('click', function () {
        if (wrap.classList.contains('is-position')) {
          var pos = wrap.getAttribute('data-position') || 'left';
          var newPos = pos === 'left' ? 'right' : 'left';
          wrap.setAttribute('data-position', newPos);
        } else {
          var s = wrap.getAttribute('data-flwr-state') || '';
          var on = s.indexOf('checked') >= 0;
          wrap.setAttribute('data-flwr-state', on ? '' : 'checked');
        }
        var href = wrap.getAttribute('data-flwr-toggle-href');
        if (href) setTimeout(function () { window.location.href = href; }, 300);
      });
    });
  }

  /* -- card overlay (click trigger) ------------------------------------ */
  /* For .flwr_card_overlay_wrap.is-trigger-click — clicking the corner
     toggles [data-flwr-state="open"] on the wrap. Hover trigger is CSS-only. */

  function initCardOverlays(scope) {
    var corners = (scope || document).querySelectorAll('.flwr_card_overlay_wrap.is-trigger-click .flwr_card_overlay_corner');
    [].forEach.call(corners, function (corner) {
      if (corner.__flwrCardOvInit) return;
      corner.__flwrCardOvInit = true;
      corner.addEventListener('click', function (e) {
        e.stopPropagation();
        var wrap = corner.closest('.flwr_card_overlay_wrap');
        if (!wrap) return;
        var s = wrap.getAttribute('data-flwr-state') || '';
        wrap.setAttribute('data-flwr-state', s.indexOf('open') >= 0 ? '' : 'open');
      });
    });
    /* Click outside closes any open card-overlay click-triggered cards */
    document.addEventListener('click', function (e) {
      var openCards = document.querySelectorAll('.flwr_card_overlay_wrap.is-trigger-click[data-flwr-state~="open"]');
      [].forEach.call(openCards, function (c) {
        if (!c.contains(e.target)) c.setAttribute('data-flwr-state', '');
      });
    });
  }

  /* -- navbar (dropdowns, mobile menu, scroll detect) ------------------ */

  function initNavbars(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="navbar"]');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrNavbarInit) return;
      wrap.__flwrNavbarInit = true;

      /* Dropdowns. Click toggles by default (keyboard + touch friendly). When the
         navbar has data-flwr-navbar-trigger="hover", they also open on hover with
         a short close-delay that bridges the trigger->menu gap, plus focus a11y. */
      var hoverMode = wrap.getAttribute('data-flwr-navbar-trigger') === 'hover';
      var dropdowns = wrap.querySelectorAll('.flwr_navbar_dropdown');
      var ddCloseTimer;
      function ddSet(dd, open) {
        dd.setAttribute('data-flwr-state', open ? 'open' : '');
        var t = dd.querySelector('.flwr_navbar_dropdown_trigger');
        if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      function ddCloseAll(except) {
        [].forEach.call(dropdowns, function (dd) { if (dd !== except) ddSet(dd, false); });
      }
      function ddOpen(dd) { clearTimeout(ddCloseTimer); ddCloseAll(dd); ddSet(dd, true); }
      [].forEach.call(dropdowns, function (dd) {
        var trigger = dd.querySelector('.flwr_navbar_dropdown_trigger');
        if (!trigger) return;
        trigger.addEventListener('click', function (e) {
          e.stopPropagation();
          var open = (dd.getAttribute('data-flwr-state') || '').indexOf('open') < 0;
          if (open) ddOpen(dd); else ddSet(dd, false);
        });
        if (hoverMode) {
          var menu = dd.querySelector('.flwr_navbar_dropdown_menu');
          var enter = function () { ddOpen(dd); };
          var leave = function () { ddCloseTimer = setTimeout(function () { ddSet(dd, false); }, 180); };
          dd.addEventListener('mouseenter', enter);
          dd.addEventListener('mouseleave', leave);
          if (menu) { menu.addEventListener('mouseenter', enter); menu.addEventListener('mouseleave', leave); }
          dd.addEventListener('focusin', enter);
          dd.addEventListener('focusout', function (e) { if (!dd.contains(e.relatedTarget)) ddSet(dd, false); });
        }
      });
      document.addEventListener('click', function (e) {
        if (!wrap.contains(e.target)) ddCloseAll(null);
      });

      /* Mobile hamburger */
      var ham = wrap.querySelector('.flwr_navbar_hamburger');
      if (ham) {
        ham.addEventListener('click', function () {
          var s = wrap.getAttribute('data-flwr-state') || '';
          var open = s.indexOf('menu-open') < 0;
          wrap.setAttribute('data-flwr-state', open ? 'menu-open' : '');
          ham.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }

      /* Close mobile menu on link click */
      [].forEach.call(wrap.querySelectorAll('.flwr_navbar_mobile_link'), function (a) {
        a.addEventListener('click', function () { wrap.setAttribute('data-flwr-state', ''); });
      });

      /* Banner close */
      [].forEach.call(wrap.querySelectorAll('.flwr_navbar_banner_close'), function (b) {
        b.addEventListener('click', function () {
          var banner = b.closest('.flwr_navbar_banner');
          if (banner) banner.style.display = 'none';
        });
      });

      /* Scroll detection — adds .is-scrolled past 16px. When the navbar opts into
         data-flwr-navbar-scroll="auto-hide", it also toggles .is-hidden: hide while
         scrolling down (past 16px), show while scrolling up, always show at the top. */
      var navAutoHide = wrap.getAttribute('data-flwr-navbar-scroll') === 'auto-hide';
      var navLastY = window.scrollY || 0;
      function onScroll() {
        var y = window.scrollY || 0;
        wrap.classList.toggle('is-scrolled', y > 16);
        if (navAutoHide) {
          if (y <= 16) wrap.classList.remove('is-hidden');
          else if (y > navLastY + 4) wrap.classList.add('is-hidden');
          else if (y < navLastY - 4) wrap.classList.remove('is-hidden');
        }
        navLastY = y;
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    });
  }

  /* -- collapse (height-auto accordion) -------------------------------- */
  /* Toggle .is-open on a [data-flwr="collapse"] when its trigger is
     clicked. Trigger is either:
       - a [data-flwr-target="trigger"] inside the same logical group, OR
       - any element with [data-flwr-collapse-target="<id>"] pointing at
         a [data-flwr-collapse-id="<id>"] wrap (decoupled trigger pattern). */
  function initCollapse(scope) {
    var root = scope || document;
    root.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('[data-flwr-target="trigger"], [data-flwr-collapse-target]');
      if (!t) return;
      var explicitId = t.getAttribute('data-flwr-collapse-target');
      var wrap = explicitId
        ? document.querySelector('[data-flwr-collapse-id="' + explicitId + '"]')
        : t.closest('[data-flwr="collapse"]');
      if (!wrap) return;
      wrap.classList.toggle('is-open');
      t.setAttribute('aria-expanded', wrap.classList.contains('is-open') ? 'true' : 'false');
    });
  }

  /* -- hide-if-empty ---------------------------------------------------- */
  /* Tags any [data-flwr="hide-when-empty"] wrap with .is-empty when it has
     no visible (non-w-condition-invisible) children. Pure runtime
     replacement for the :has() / :not(:has(...)) pattern that needs embed. */
  function checkEmpty(el) {
    var hasVisible = false;
    [].some.call(el.children, function (c) {
      if (c.classList && c.classList.contains('w-condition-invisible')) return false;
      if (c.classList && c.classList.contains('u-cover-absolute')) return false;
      hasVisible = true;
      return true;
    });
    el.classList.toggle('is-empty', !hasVisible);
  }
  function initHideIfEmpty(scope) {
    var els = (scope || document).querySelectorAll('[data-flwr="hide-when-empty"], .f-hide-when-empty');
    [].forEach.call(els, function (el) {
      if (el.__flwrEmptyInit) return;
      el.__flwrEmptyInit = true;
      checkEmpty(el);
      var mo = new MutationObserver(function () { checkEmpty(el); });
      mo.observe(el, { childList: true, subtree: true });
    });
  }

  /* -- disabled wrap ---------------------------------------------------- */
  /* Replaces [data-button]:has(button:disabled). Tags wraps with .is-disabled
     when any descendant has [disabled]. */
  function checkDisabled(el) {
    var disabled = !!el.querySelector(':disabled, [aria-disabled="true"]');
    el.classList.toggle('is-disabled', disabled);
  }
  function initDisabledWraps(scope) {
    var els = (scope || document).querySelectorAll('[data-flwr="disabled-wrap"]');
    [].forEach.call(els, function (el) {
      if (el.__flwrDisInit) return;
      el.__flwrDisInit = true;
      checkDisabled(el);
      var mo = new MutationObserver(function () { checkDisabled(el); });
      mo.observe(el, { attributes: true, childList: true, subtree: true, attributeFilter: ['disabled', 'aria-disabled'] });
    });
  }

  /* -- play/pause toggle ------------------------------------------------ */
  /* [data-flwr="player-toggle"] with [aria-pressed] gets .is-playing
     synced. Pair icons with .flwr_player_play / .flwr_player_pause and
     hide via :is or class selector — both are styleLess-compatible. */
  function initPlayerToggles(scope) {
    var btns = (scope || document).querySelectorAll('[data-flwr="player-toggle"]');
    [].forEach.call(btns, function (b) {
      if (b.__flwrPlayInit) return;
      b.__flwrPlayInit = true;
      function sync() {
        b.classList.toggle('is-playing', b.getAttribute('aria-pressed') === 'true');
      }
      sync();
      b.addEventListener('click', function () {
        var on = b.getAttribute('aria-pressed') === 'true';
        b.setAttribute('aria-pressed', on ? 'false' : 'true');
        sync();
      });
    });
  }

  /* -- empty-select dim ------------------------------------------------- */
  /* Replaces select:has(option[value=""]:checked). Tags select with
     .is-empty-select when its current value is empty. */
  function initEmptySelects(scope) {
    var sels = (scope || document).querySelectorAll('select[data-flwr="empty-dim"], select.f-select-dim');
    [].forEach.call(sels, function (sel) {
      if (sel.__flwrEmptySel) return;
      sel.__flwrEmptySel = true;
      function sync() { sel.classList.toggle('is-empty-select', !sel.value); }
      sync();
      sel.addEventListener('change', sync);
    });
  }

  /* -- list filter ------------------------------------------------------- */
  /* Attribute-driven CMS-list filter engine. Gate: [data-flwr="list"].
   *
   * Wrapper attrs:
   *   data-flwr="list"
   *   data-flwr-list-fieldmatch="and|or"       (default "and")  — multi-value field combine
   *   data-flwr-list-conditionsmatch="and|or"  (default "and")  — cross-field combine
   *   data-flwr-list-accent="strip|preserve"   (default "strip")— accent-insensitive search
   *   data-flwr-list-fuzzy="0"                 (default 0, off) — Levenshtein threshold 0–100
   *   data-flwr-list-debounce="150"            (default 150 ms) — text input debounce
   *
   * Items: [data-flwr-list-item] descendants, else direct children.
   * Field resolution per item (getFieldValue(item, field)):
   *   1. item.dataset[camelize(field)]  — comma-separated string for multi-value
   *   2. item.querySelector('[data-flwr-list-field="field"]').textContent
   *
   * Filter inputs (link to list via data-flwr-list-list="#id" or nearest ancestor):
   *   <input type="search|text" data-flwr-list-field="f1,f2">
   *   <input type="radio"       data-flwr-list-field="cat"   data-flwr-list-value="v">
   *   <input type="checkbox"    data-flwr-list-field="tags"  data-flwr-list-value="v">
   *   <select                   data-flwr-list-field="field">
   *
   * UI hooks inside the list wrapper:
   *   [data-flwr-target="results-count"]  — live "12 / 53"
   *   [data-flwr-target="items-count"]    — total count
   *   [data-flwr-target="empty"]          — shown when 0 visible
   *   [data-flwr-target="tags"]           — chip render container
   *   <template data-flwr-target="tag-template"> — chip template
   *   [data-flwr-target="clear"]          — reset all filters (inside wrap OR with data-flwr-list-list)
   *
   * Public: wrap.__flwrList = { state, apply, clear, getMatches }
   * Event:  "flwr:list:filtered" on wrap   detail: { visible, total, state }
   */

  function listNormalize(s) {
    return String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  }
  function listCamelize(s) {
    return String(s || '').replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  }
  function listGetFieldValue(item, fieldName) {
    var camel = listCamelize(fieldName);
    if (item.dataset && item.dataset[camel] != null && item.dataset[camel] !== '') {
      return item.dataset[camel];
    }
    var el = item.querySelector('[data-flwr-list-field="' + fieldName + '"]');
    return el ? el.textContent.trim() : '';
  }
  function listFuzzyScore(needle, word) {
    /* Levenshtein distance normalized to 0–100 similarity. ~25 lines. */
    if (!needle || !word) return needle === word ? 100 : 0;
    var n = needle.length, m = word.length;
    var row = [];
    for (var j = 0; j <= m; j++) row[j] = j;
    for (var i = 1; i <= n; i++) {
      var prev = i;
      for (var k = 1; k <= m; k++) {
        var cost = needle[i - 1] === word[k - 1] ? 0 : 1;
        var next = Math.min(row[k] + 1, prev + 1, row[k - 1] + cost);
        row[k - 1] = prev; prev = next;
      }
      row[m] = prev;
    }
    return Math.round((1 - row[m] / Math.max(n, m)) * 100);
  }
  function listResolveWrap(input) {
    var sel = input.getAttribute('data-flwr-list-list');
    if (sel) {
      var found = document.querySelector(sel);
      if (found && found.getAttribute('data-flwr') === 'list') return found;
      console.warn('[flwr list] target not found:', sel); return null;
    }
    var anc = input.closest && input.closest('[data-flwr="list"]');
    if (anc) return anc;
    var all = document.querySelectorAll('[data-flwr="list"]');
    if (all.length === 1) return all[0];
    console.warn('[flwr list] cannot resolve list for', input); return null;
  }

  function initList(scope) {
    var wraps = (scope || document).querySelectorAll('[data-flwr="list"]');
    [].forEach.call(wraps, function (wrap) {
      if (wrap.__flwrListInit) return;
      wrap.__flwrListInit = true;

      var fieldMatch  = attr(wrap, 'data-flwr-list-fieldmatch',     'and');
      var condMatch   = attr(wrap, 'data-flwr-list-conditionsmatch','and');
      var stripAccent = attr(wrap, 'data-flwr-list-accent', 'strip') !== 'preserve';
      var fuzzyThr    = parseInt(attr(wrap, 'data-flwr-list-fuzzy',    '0'),   10) || 0;
      var debounceMs  = parseInt(attr(wrap, 'data-flwr-list-debounce', '150'), 10);
      if (isNaN(debounceMs)) debounceMs = 150;

      /* State keys: '__text__<fieldAttr>' for text inputs; '<fieldAttr>' for radio/checkbox/select */
      var state = {};

      function norm(s) { return stripAccent ? listNormalize(s) : String(s || '').toLowerCase(); }

      function getItems() {
        var items = wrap.querySelectorAll('[data-flwr-list-item]');
        if (items.length) return [].slice.call(items);
        /* Fallback: direct children, excluding structural UI elements */
        return [].slice.call(wrap.children).filter(function (c) {
          return c.tagName !== 'TEMPLATE' && !c.hasAttribute('data-flwr-target');
        });
      }

      function matchToken(token, haystack) {
        if (haystack.indexOf(token) >= 0) return true;
        if (fuzzyThr <= 0) return false;
        var words = haystack.split(/\s+/);
        for (var i = 0; i < words.length; i++) {
          if (listFuzzyScore(token, words[i]) >= fuzzyThr) return true;
        }
        return false;
      }

      function itemMatchesCond(item, key, cond) {
        if (cond.type === 'text') {
          var hay = norm(cond.searchFields.map(function (f) {
            return listGetFieldValue(item, f);
          }).join(' '));
          for (var t = 0; t < cond.values.length; t++) {
            if (!matchToken(norm(cond.values[t]), hay)) return false;
          }
          return true;
        }
        /* radio / select / checkbox — key IS the fieldName */
        var rawVal = listGetFieldValue(item, key);
        var vals = rawVal.split(',').map(function (v) { return norm(v.trim()); }).filter(Boolean);
        if (cond.type === 'radio' || cond.type === 'select') {
          return vals.indexOf(norm(cond.values[0])) >= 0;
        }
        if (cond.type === 'checkbox') {
          if (fieldMatch === 'or') {
            for (var ci = 0; ci < cond.values.length; ci++) {
              if (vals.indexOf(norm(cond.values[ci])) >= 0) return true;
            }
            return false;
          }
          for (var ca = 0; ca < cond.values.length; ca++) {
            if (vals.indexOf(norm(cond.values[ca])) < 0) return false;
          }
          return true;
        }
        return true;
      }

      function itemMatchesAll(item) {
        var keys = Object.keys(state);
        var active = keys.filter(function (k) { return state[k].values.length > 0; });
        if (!active.length) return true;
        if (condMatch === 'or') {
          for (var i = 0; i < active.length; i++) {
            if (itemMatchesCond(item, active[i], state[active[i]])) return true;
          }
          return false;
        }
        /* and (default) */
        for (var j = 0; j < active.length; j++) {
          if (!itemMatchesCond(item, active[j], state[active[j]])) return false;
        }
        return true;
      }

      /* When data-flwr-list-hidden-class is set on the wrap, non-matching items
         get that class toggled instead of display:none. Lets CSS handle the
         visual treatment (e.g. dimming via opacity) while preserving grid
         positions — critical for periodic-table or explicit-grid layouts. */
      var hiddenClass = wrap.getAttribute('data-flwr-list-hidden-class') || '';

      /* Resolve a data-flwr-target element: look inside wrap first, then
         look for an external element with a matching data-flwr-list-list attr. */
      function resolveTarget(role) {
        var inner = wrap.querySelector('[data-flwr-target="' + role + '"]');
        if (inner) return inner;
        if (wrap.id) {
          return document.querySelector('[data-flwr-target="' + role + '"][data-flwr-list-list="#' + wrap.id + '"]');
        }
        return null;
      }

      function apply() {
        var items = getItems();
        var total = items.length;
        var visible = 0;
        for (var i = 0; i < items.length; i++) {
          var m = itemMatchesAll(items[i]);
          if (hiddenClass) {
            items[i].classList.toggle(hiddenClass, !m);
          } else {
            items[i].style.display = m ? '' : 'none';
          }
          if (m) visible++;
        }
        var cntEl = resolveTarget('results-count');
        if (cntEl) cntEl.textContent = visible + ' / ' + total;
        var totEl = resolveTarget('items-count');
        if (totEl) totEl.textContent = String(total);
        var emptyEl = resolveTarget('empty');
        if (emptyEl) {
          if (visible === 0) { emptyEl.removeAttribute('hidden'); emptyEl.style.display = ''; }
          else               { emptyEl.setAttribute('hidden', ''); emptyEl.style.display = 'none'; }
        }
        renderChips();
        var ev;
        try {
          ev = new CustomEvent('flwr:list:filtered', {
            bubbles: true,
            detail: { visible: visible, total: total, state: state }
          });
        } catch (_) {
          ev = document.createEvent('CustomEvent');
          ev.initCustomEvent('flwr:list:filtered', true, false, { visible: visible, total: total, state: state });
        }
        wrap.dispatchEvent(ev);

        /* Auto-scroll to first visible item when none are in the current
           viewport — opt-in via data-flwr-list-scroll-to-first on the wrap.
           Only fires when a filter IS active (visible < total) and the first
           matching item is not already visible on screen. */
        if (wrap.getAttribute('data-flwr-list-scroll-to-first') === 'true' && visible > 0 && visible < total) {
          setTimeout(function() {
            var firstActive = null;
            var its = getItems();
            for (var si = 0; si < its.length; si++) {
              var hidden = hiddenClass
                ? its[si].classList.contains(hiddenClass)
                : its[si].style.display === 'none';
              if (!hidden) { firstActive = its[si]; break; }
            }
            if (!firstActive) return;
            var r = firstActive.getBoundingClientRect();
            /* Item is below viewport or above it — scroll so it sits just below
               the nav with a small breathing gap */
            if (r.top > window.innerHeight || r.bottom < 0) {
              var navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav--height') || '64', 10) || 64;
              var target = window.scrollY + r.top - navH - 24;
              window.scrollTo({ top: target, behavior: 'smooth' });
            }
          }, 50);
        }
      }

      function capField(s) {
        s = String(s || '').replace(/^__text__/, '');
        return s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ');
      }

      function renderChips() {
        var tagsEl = resolveTarget('tags');
        if (!tagsEl) return;
        var tmpl = resolveTarget('tag-template') || wrap.querySelector('template[data-flwr-target="tag-template"]');
        tagsEl.innerHTML = '';
        var keys = Object.keys(state);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i], cond = state[k];
          if (!cond.values.length) continue;
          var isText = k.indexOf('__text__') === 0;
          if (isText) {
            appendChip(tagsEl, tmpl, 'Búsqueda', cond.values.join(' '), k, null);
          } else {
            for (var j = 0; j < cond.values.length; j++) {
              appendChip(tagsEl, tmpl, capField(k), cond.values[j], k, cond.values[j]);
            }
          }
        }
      }

      function appendChip(container, tmpl, labelPfx, labelVal, key, value) {
        var chip;
        if (tmpl && tmpl.content) {
          chip = document.importNode(tmpl.content, true).firstElementChild;
        } else {
          chip = document.createElement('span');
          chip.className = 'flwr_chip';
          var ls = document.createElement('span');
          ls.setAttribute('data-flwr-target', 'tag-label');
          var rb = document.createElement('button');
          rb.className = 'flwr_chip_close'; rb.setAttribute('data-flwr-target', 'tag-remove');
          rb.setAttribute('aria-label', 'Remove filter'); rb.textContent = '×';
          chip.appendChild(ls); chip.appendChild(rb);
        }
        var labelEl = chip.querySelector('[data-flwr-target="tag-label"]');
        if (labelEl) labelEl.textContent = labelPfx + ': ' + labelVal;
        var rmBtn = chip.querySelector('[data-flwr-target="tag-remove"]');
        if (rmBtn) {
          rmBtn.addEventListener('click', (function (k, v) {
            return function () { removeChip(k, v); };
          })(key, value));
        }
        container.appendChild(chip);
      }

      function removeChip(key, value) {
        var cond = state[key];
        if (!cond) return;
        var isText = key.indexOf('__text__') === 0;
        var condType = cond.type;
        if (isText || !value) {
          delete state[key];
          syncInputsClear(isText ? key.slice(8) : key, 'text', null);
        } else {
          var idx = cond.values.indexOf(value);
          if (idx >= 0) cond.values.splice(idx, 1);
          if (!cond.values.length) delete state[key];
          syncInputsClear(key, condType, value);
        }
        apply();
      }

      function syncInputsClear(fieldAttr, type, value) {
        var inputs = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(inputs, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var fa = inp.getAttribute('data-flwr-list-field') || '';
          var t  = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (type === 'text' && (t === 'search' || t === 'text') && fa === fieldAttr) {
            inp.value = '';
          } else if (type !== 'text' && fa === fieldAttr) {
            var v = inp.getAttribute('data-flwr-list-value') || inp.value;
            if (t === 'radio' || t === 'checkbox') {
              if (!value || v === value) inp.checked = false;
            } else if (inp.tagName === 'SELECT') {
              if (!value) inp.value = '';
            }
          }
        });
      }

      function clearState() {
        var ks = Object.keys(state);
        for (var i = 0; i < ks.length; i++) delete state[ks[i]];
      }

      function clearAll() {
        clearState();
        var inputs = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(inputs, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var t = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (t === 'search' || t === 'text') inp.value = '';
          else if (t === 'radio' || t === 'checkbox') inp.checked = false;
          else if (inp.tagName === 'SELECT') inp.value = '';
        });
        apply();
      }

      function readState() {
        clearState();
        var inputs = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(inputs, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          var fa = inp.getAttribute('data-flwr-list-field') || '';
          var t  = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (t === 'search' || t === 'text') {
            var q = inp.value.trim();
            var k = '__text__' + fa;
            if (q) state[k] = {
              type: 'text',
              searchFields: fa.split(',').map(function (f) { return f.trim(); }),
              values: q.split(/\s+/).filter(Boolean)
            };
          } else if (t === 'radio') {
            if (!inp.checked) return;
            var rv = inp.getAttribute('data-flwr-list-value') || inp.value;
            if (rv) state[fa] = { type: 'radio', values: [rv] };
          } else if (t === 'checkbox') {
            if (!inp.checked) return;
            var cv = inp.getAttribute('data-flwr-list-value') || inp.value;
            if (!cv) return;
            if (!state[fa]) state[fa] = { type: 'checkbox', values: [] };
            if (state[fa].values.indexOf(cv) < 0) state[fa].values.push(cv);
          } else if (inp.tagName === 'SELECT') {
            if (inp.value) state[fa] = { type: 'select', values: [inp.value] };
          }
        });
        apply();
      }

      var textTimer = 0;
      function onTextInput() { clearTimeout(textTimer); textTimer = setTimeout(readState, debounceMs); }

      function wireInputs() {
        var all = document.querySelectorAll('[data-flwr-list-field]');
        [].forEach.call(all, function (inp) {
          if (listResolveWrap(inp) !== wrap) return;
          if (inp.__flwrListWired) return;
          inp.__flwrListWired = true;
          var t = inp.type || (inp.tagName === 'SELECT' ? 'select' : 'text');
          if (t === 'search' || t === 'text') inp.addEventListener('input', onTextInput);
          else inp.addEventListener('change', readState);
        });
        /* Clear buttons: inside the wrap or pointing to it via data-flwr-list-list */
        var clearBtns = document.querySelectorAll('[data-flwr-target="clear"]');
        [].forEach.call(clearBtns, function (btn) {
          if (btn.__flwrListClearWired) return;
          var w = (btn.closest && btn.closest('[data-flwr="list"]')) ||
                  (function () {
                    var s = btn.getAttribute('data-flwr-list-list');
                    return s ? document.querySelector(s) : null;
                  })();
          if (w !== wrap) return;
          btn.__flwrListClearWired = true;
          btn.addEventListener('click', clearAll);
        });
      }

      wireInputs();

      wrap.__flwrList = {
        state: state,
        apply: apply,
        clear: clearAll,
        getMatches: function () {
          return getItems().filter(function (item) { return itemMatchesAll(item); });
        }
      };

      apply();
    });
  }

  /* -- vertical text wrapper ------------------------------------------- */
  /* For [data-flwr="vertical-text"] children that use rotate(±90deg) —
     measures their post-rotation bounding box and reserves layout space
     so they don't break the parent flex/grid layout. Pattern from Alttura. */
  function initVerticalText(scope) {
    var blocks = (scope || document).querySelectorAll('[data-flwr="vertical-text"]');
    [].forEach.call(blocks, function (block) {
      if (block.__flwrVTInit) return;
      block.__flwrVTInit = true;
      function reserve() {
        var rect = block.getBoundingClientRect();
        var parent = block.parentElement;
        if (!parent) return;
        if (!parent.classList.contains('flwr-vt-wrapper')) {
          var w = document.createElement('div');
          w.className = 'flwr-vt-wrapper';
          w.style.cssText = 'display:inline-block;width:0;';
          parent.insertBefore(w, block);
          w.appendChild(block);
          parent = w;
        }
        parent.style.height = rect.height + 'px';
        parent.style.width = '0';
      }
      reserve();
      window.addEventListener('resize', reserve, { passive: true });
    });
  }

  /* -- public API ------------------------------------------------------- */

  window.flwr = window.flwr || {};
  window.flwr.cardStack = {
    next: nextCard,
    prev: prevCard,
    moveToTop: moveToTop,
    reindex: indexStack
  };
  window.flwr.scrollDialog = {
    refresh: function () {
      scanScrollDialogs();
      checkScrollDialogs();
    },
    reset: function (dialog) {
      if (dialog) scrollFired.delete(dialog);
      else scrollFired = new WeakSet();
    }
  };
  window.flwr.marquee        = { init: initMarquees };
  window.flwr.swiper         = { init: initSwipers, initThumbs: initSwiperThumbs };
  window.flwr.map            = { init: initMaps };
  window.flwr.scrubber       = { init: initScrubbers };
  window.flwr.tabs           = { init: initTabs };
  window.flwr.search         = { init: initSearch };
  window.flwr.fullscreenMenu = { init: initFullscreenMenu };
  window.flwr.toggle         = { init: initToggles };
  window.flwr.cardOverlay    = { init: initCardOverlays };
  window.flwr.navbar         = { init: initNavbars };
  window.flwr.collapse       = { init: initCollapse };
  window.flwr.hideIfEmpty    = { init: initHideIfEmpty };
  window.flwr.disabledWrap   = { init: initDisabledWraps };
  window.flwr.playerToggle   = { init: initPlayerToggles };
  window.flwr.emptySelect    = { init: initEmptySelects };
  window.flwr.verticalText   = { init: initVerticalText };
  window.flwr.list           = { init: initList };

  /* -- bootstrap -------------------------------------------------------- */

  function init() {
    initCardStacks(document);
    initScrollDialogs();
    initMarquees(document);
    initSwipers(document);
    initSwiperThumbs(document);
    initMaps(document);
    initScrubbers(document);
    initTabs(document);
    initSearch(document);
    initFullscreenMenu(document);
    initToggles(document);
    initCardOverlays(document);
    initNavbars(document);
    initCollapse(document);
    initHideIfEmpty(document);
    initDisabledWraps(document);
    initPlayerToggles(document);
    initEmptySelects(document);
    initVerticalText(document);
    initList(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  /* Re-init for libs that load after our script (Swiper, Leaflet via CDN) */
  window.addEventListener('load', function () {
    initSwipers(document);
    initSwiperThumbs(document);
    initMaps(document);
  });
})();
