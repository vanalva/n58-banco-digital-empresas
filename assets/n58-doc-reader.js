/* ═══════════════════════════════════════════════════════════════════════════
   N58 · Modo lectura — two-pane document reader
   ───────────────────────────────────────────────────────────────────────────
   Turns the Documentos Legales index into a reading surface: every document
   listed down the left, the selected one rendered on the right, and a search
   that both filters the list and walks matches inside the open document.

   Where the content comes from: nothing is duplicated. The document list is
   read off the cards already on the page (title, category, detail URL, PDF),
   and each document's body is fetched from its own page on first open and
   cached for the session — the article lives in exactly one place, the page
   that owns it.

   URL: opening a document writes `#leer/<slug>`, so a reading session is
   linkable and the browser Back button steps out of it.

   Search behaviour, mirroring the reference build:
     · highlights every hit inside the open document, counts them, and the
       arrows walk hit to hit
     · the sidebar keeps EVERY document listed and badges each with its own hit
       count, dimming the ones that do not match — a query never takes away your
       way out of the document you are in
   Highlighting re-injects the cached HTML and re-marks it, so clearing a query
   never leaves the article damaged.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var reader = document.querySelector('[data-n58-reader]');
  var openBtn = document.querySelector('[data-n58-reader-open]');
  if (!reader || !openBtn) return;

  var els = {
    list:     reader.querySelector('[data-n58-reader-list]'),
    body:     reader.querySelector('[data-n58-reader-body]'),
    title:    reader.querySelector('[data-n58-reader-title]'),
    meta:     reader.querySelector('[data-n58-reader-meta]'),
    pdf:      reader.querySelector('[data-n58-reader-pdf]'),
    search:   reader.querySelector('[data-n58-reader-search]'),
    counter:  reader.querySelector('[data-n58-reader-counter]'),
    prev:     reader.querySelector('[data-n58-reader-prev]'),
    next:     reader.querySelector('[data-n58-reader-next]'),
    close:    reader.querySelector('[data-n58-reader-close]'),
    scroller: reader.querySelector('[data-n58-reader-scroll]')
  };

  var MAX_HITS = 400;          // a 45k-pixel contract can match a lot
  var cache = {};              // slug -> article HTML
  var plain = {};              // slug -> article text, for counting hits per document
  var docs = [];
  var current = null;
  var hits = [];
  var hitIndex = 0;
  var lastFocus = null;

  /* ── the document index, read off the cards ───────────────────────────── */

  function slugOf(href) {
    return (href || '').split('/').pop().replace(/\.html$/, '');
  }

  function collect() {
    var cards = document.querySelectorAll('.flwr_card_default_wrap');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var link = card.querySelector('a[href$=".html"]');
      if (!link) continue;
      var pdf = card.querySelector('a[href$=".pdf"]');
      docs.push({
        slug:  slugOf(link.getAttribute('href')),
        url:   link.getAttribute('href'),
        title: (card.querySelector('.flwr_card_default_title') || {}).textContent || '',
        cat:   ((card.querySelector('.flwr_card_default_eyebrow') || {}).textContent || '').trim(),
        desc:  (card.querySelector('.flwr_card_default_description') || {}).textContent || '',
        pdf:   pdf ? pdf.getAttribute('href') : null
      });
    }
  }

  function countIn(slug, needle) {
    var hay = plain[slug];
    if (!hay || needle.length < 2) return null;      // null = not known yet
    var n = 0, i = hay.indexOf(needle);
    while (i > -1) { n++; i = hay.indexOf(needle, i + needle.length); }
    return n;
  }

  // Reading every document once so the sidebar can show hit counts. Only
  // triggered by a query worth the round trip, and only ever once per document.
  function ensureAllText(query) {
    var pending = docs.filter(function (d) { return plain[d.slug] === undefined; });
    if (!pending.length) return;
    Promise.all(pending.map(function (d) {
      return fetchDoc(d).catch(function () { plain[d.slug] = ''; });
    })).then(function () {
      if (els.search.value.trim().toLowerCase() === query) renderList(els.search.value);
    });
  }

  function renderList(query) {
    var q = (query || '').trim().toLowerCase();
    var groups = {};
    var order = [];

    // Every document stays listed. A query never removes your way out of the
    // document you are reading — it dims what does not match and counts what does.
    docs.forEach(function (d) {
      if (!groups[d.cat]) { groups[d.cat] = []; order.push(d.cat); }
      groups[d.cat].push(d);
    });

    els.list.innerHTML = '';

    order.forEach(function (cat) {
      var head = document.createElement('p');
      head.className = 'n58-reader_group';
      head.textContent = cat;
      els.list.appendChild(head);

      groups[cat].forEach(function (d) {
        var meta = (d.title + ' ' + d.cat + ' ' + d.desc).toLowerCase().indexOf(q) > -1;
        var count = q ? countIn(d.slug, q) : null;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'n58-reader_item';
        if (q && !meta && !count) btn.classList.add('is-dim');
        if (current && current.slug === d.slug) btn.setAttribute('aria-current', 'true');
        btn.setAttribute('data-slug', d.slug);

        var label = document.createElement('span');
        label.className = 'n58-reader_item_label';
        label.textContent = d.title;
        btn.appendChild(label);

        if (count) {
          var badge = document.createElement('span');
          badge.className = 'n58-reader_count';
          badge.textContent = count;
          badge.title = count + ' coincidencia' + (count === 1 ? '' : 's');
          btn.appendChild(badge);
        }

        btn.addEventListener('click', function () { openDoc(d.slug); });
        els.list.appendChild(btn);
      });
    });

    if (q.length >= 3) ensureAllText(q);
  }

  /* ── loading a document ───────────────────────────────────────────────── */

  function setBusy(on) {
    reader.setAttribute('data-n58-reader-state', on ? 'loading' : 'ready');
  }

  function fetchDoc(doc) {
    if (cache[doc.slug]) return Promise.resolve(cache[doc.slug]);
    return fetch(doc.url, { credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.text();
      })
      .then(function (html) {
        var parsed = new DOMParser().parseFromString(html, 'text/html');
        var article = parsed.querySelector('.tpl-doc-prose');
        cache[doc.slug] = article ? article.innerHTML
          : '<p>No pudimos cargar este documento. <a href="' + doc.url + '">Ábrelo en su página</a>.</p>';
        plain[doc.slug] = (article ? article.textContent : '').toLowerCase();
        return cache[doc.slug];
      });
  }

  function openDoc(slug) {
    var doc = docs.filter(function (d) { return d.slug === slug; })[0] || docs[0];
    if (!doc) return;
    current = doc;

    els.title.textContent = doc.title;
    els.meta.textContent = doc.cat;
    if (doc.pdf) {
      els.pdf.href = doc.pdf;
      els.pdf.hidden = false;
    } else {
      els.pdf.hidden = true;
    }

    renderList(els.search.value);
    setBusy(true);
    els.body.innerHTML = '';

    fetchDoc(doc).then(function (html) {
      els.body.innerHTML = html;
      setBusy(false);
      els.scroller.scrollTop = 0;
      applySearch();                       // keep the query alive across documents
      history.replaceState(null, '', '#leer/' + doc.slug);
    }).catch(function (err) {
      setBusy(false);
      els.body.innerHTML = '<p class="n58-reader_error">No pudimos cargar el documento (' +
        err.message + '). <a href="' + doc.url + '">Ábrelo en su página</a>.</p>';
    });
  }

  /* ── in-document search ───────────────────────────────────────────────── */

  function clearHighlights() {
    hits = [];
    hitIndex = 0;
    if (current && cache[current.slug] && els.body.querySelector('mark.n58-reader_hit')) {
      els.body.innerHTML = cache[current.slug];
    }
  }

  function highlight(query) {
    var q = query.trim();
    clearHighlights();
    if (q.length < 2) { updateCounter(); return; }

    var needle = q.toLowerCase();
    var walker = document.createTreeWalker(els.body, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.toLowerCase().indexOf(needle) > -1) targets.push(node);
      if (targets.length > MAX_HITS) break;
    }

    targets.forEach(function (textNode) {
      if (hits.length >= MAX_HITS) return;
      var parts = textNode.nodeValue.split(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'));
      var frag = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (part.toLowerCase() === needle && hits.length < MAX_HITS) {
          var mark = document.createElement('mark');
          mark.className = 'n58-reader_hit';
          mark.textContent = part;
          frag.appendChild(mark);
          hits.push(mark);
        } else if (part) {
          frag.appendChild(document.createTextNode(part));
        }
      });
      textNode.parentNode.replaceChild(frag, textNode);
    });

    if (hits.length) goToHit(0);
    updateCounter();
  }

  function updateCounter() {
    var q = els.search.value.trim();
    if (!q) { els.counter.textContent = ''; }
    else if (!hits.length) { els.counter.textContent = 'Sin coincidencias'; }
    else { els.counter.textContent = (hitIndex + 1) + ' / ' + hits.length + (hits.length === MAX_HITS ? '+' : ''); }
    els.prev.disabled = els.next.disabled = hits.length < 2;
  }

  function goToHit(i) {
    if (!hits.length) return;
    hits.forEach(function (m) { m.classList.remove('is-current'); });
    hitIndex = (i + hits.length) % hits.length;
    var mark = hits[hitIndex];
    mark.classList.add('is-current');
    mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    updateCounter();
  }

  var debounce;
  function applySearch() {
    highlight(els.search.value);
    renderList(els.search.value);
  }

  /* ── open / close ─────────────────────────────────────────────────────── */

  function open(slug) {
    lastFocus = document.activeElement;
    reader.hidden = false;
    document.documentElement.classList.add('n58-reader-open');
    openDoc(slug || (docs[0] && docs[0].slug));
    setTimeout(function () { els.search.focus(); }, 60);
  }

  function close() {
    reader.hidden = true;
    document.documentElement.classList.remove('n58-reader-open');
    history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ── wiring ───────────────────────────────────────────────────────────── */

  collect();
  if (!docs.length) return;

  openBtn.addEventListener('click', function () { open(); });
  els.close.addEventListener('click', close);
  els.prev.addEventListener('click', function () { goToHit(hitIndex - 1); });
  els.next.addEventListener('click', function () { goToHit(hitIndex + 1); });

  els.search.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(applySearch, 220);
  });
  els.search.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    goToHit(e.shiftKey ? hitIndex - 1 : hitIndex + 1);
  });

  document.addEventListener('keydown', function (e) {
    if (reader.hidden) return;
    if (e.key === 'Escape') close();
  });

  // Deep link: #leer/<slug> opens straight into that document.
  function fromHash() {
    var m = location.hash.match(/^#leer\/([a-z0-9-]+)$/i);
    if (m) open(m[1]);
  }
  addEventListener('hashchange', function () {
    if (reader.hidden) fromHash();
  });
  fromHash();
})();
