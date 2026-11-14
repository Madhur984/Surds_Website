/* SURDS Thermal use cases: everything on the page that is not the 3D mall.
 *
 *  - loader pill (the 3D module reports progress through window.UCUI)
 *  - chapter rail, progress bar and the phone's chapter chip
 *  - "How it works here" toggles on the phone bottom sheets
 *  - the hero's live sensor view (a tiny 32 x 24 heat simulation)
 *  - one small chart per use case, fed live by the 3D simulation when it runs
 *
 * Runs without the 3D view too: charts fall back to their own simulated samples.
 * All figures are simulated for illustration.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  /* ---------- loader ---------- */
  var loader = $('#loader'), ldtext = $('#ldtext'), pct = $('#pct'), bar = $('#bar');
  var UCUI = window.UCUI = window.UCUI || {};
  UCUI.progress = function (loaded, total) {
    var p = total ? loaded / total : 0;
    pct.textContent = total ? Math.round(p * 100) + '% · ' + (loaded / 1048576).toFixed(1) + ' / ' + (total / 1048576).toFixed(1) + ' MB' : (loaded / 1048576).toFixed(1) + ' MB';
    bar.style.width = (p * 100).toFixed(1) + '%';
  };
  UCUI.ready = function () {
    document.body.classList.add('ready');
    loader.classList.add('done');
  };
  UCUI.fail = function (msg) {
    loader.classList.add('fail');
    ldtext.textContent = msg || 'The 3D mall could not load. Everything else still works.';
    pct.textContent = '';
    setTimeout(function () { loader.classList.add('done'); }, 7000);
  };

  /* ---------- phone bottom sheets: details on demand ---------- */
  $$('.more-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var card = b.closest('.card'), open = !card.classList.contains('open');
      card.classList.toggle('open', open);
      b.setAttribute('aria-expanded', String(open));
      b.textContent = open ? 'Show less' : 'How it works here';
      if (!open) card.scrollTop = 0;
    });
  });

  /* ---------- chapters: rail, chip, progress, nav highlight ---------- */
  var sections = $$('[data-shot]');
  var ucs = $$('section.uc');
  var rail = $('#rail'), railLinks = $$('#rail a'), chip = $('#chapter'), prog = $('#prog');
  var navLinks = $$('.nav nav a');
  var NAMES = railLinks.map(function (a) { return a.textContent.replace(/^\d+\s*/, ''); });
  var lastActive = null;
  function onScroll() {
    var mid = innerHeight * 0.5, pick = sections[0];
    sections.forEach(function (s) { if (s.getBoundingClientRect().top <= mid) pick = s; });
    var solid = $('.solid').getBoundingClientRect().top <= mid;
    var idx = solid ? -1 : ucs.indexOf(pick);
    if (pick !== lastActive || solid !== onScroll.solid) {
      lastActive = pick; onScroll.solid = solid;
      railLinks.forEach(function (a, i) { a.classList.toggle('on', i === idx); a.classList.toggle('done', idx >= 0 && i < idx); });
      rail.classList.toggle('show', idx >= 0);
      document.body.classList.toggle('tour', idx >= 0);
      chip.classList.toggle('show', idx >= 0);
      if (idx >= 0) chip.innerHTML = '<i>' + String(idx + 1).padStart(2, '0') + '/' + ucs.length + '</i> ' + NAMES[idx];
      var key = solid ? (document.getElementById('faq').getBoundingClientRect().top <= mid ? '#faq' : '#how') : pick.id === 'privacy' ? '#privacy' : idx >= 0 || pick.id === 'cases' ? '#cases' : '';
      navLinks.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === key); });
    }
    var max = document.documentElement.scrollHeight - innerHeight;
    prog.style.width = (max > 0 ? clamp(scrollY / max, 0, 1) * 100 : 0).toFixed(2) + '%';
  }
  var ticking = false;
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; onScroll(); }); } }, { passive: true });
  addEventListener('resize', onScroll);
  onScroll();

  /* ---------- the hero's live sensor view ---------- */
  var IRON = [[0, 8, 0, 20], [0.18, 40, 0, 100], [0.38, 140, 10, 140], [0.56, 215, 50, 45], [0.74, 250, 135, 0], [0.9, 255, 215, 60], [1, 255, 255, 225]];
  var LUT = new Uint8Array(256 * 3);
  for (var li = 0; li < 256; li++) {
    var t = li / 255, k = 0;
    while (k < IRON.length - 2 && t > IRON[k + 1][0]) k++;
    var a = IRON[k], b = IRON[k + 1], f = (t - a[0]) / (b[0] - a[0]);
    for (var c = 0; c < 3; c++) LUT[li * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
  }
  var hh = $('#heroheat'), hctx = hh.getContext('2d'), himg = hctx.createImageData(32, 24), hvn = $('#hvn');
  var blobs = [], hT = 0, base = new Float32Array(32 * 24);
  for (var j = 0; j < 24; j++) for (var i = 0; i < 32; i++) base[j * 32 + i] = 22.2 + 0.5 * Math.sin(i * 0.37 + j * 0.21) * Math.cos(j * 0.43 - i * 0.12) + j / 24 * 0.7;
  function newBlob() {
    var dir = Math.random() < 0.5 ? 1 : -1, vert = Math.random() < 0.35;
    return vert ? { x: 6 + Math.random() * 20, y: dir > 0 ? -2 : 26, vx: (Math.random() - 0.5) * 1.2, vy: dir * (2.6 + Math.random() * 1.6), T: 33 + Math.random() * 1.4 }
      : { x: dir > 0 ? -2 : 34, y: 5 + Math.random() * 14, vx: dir * (3 + Math.random() * 2), vy: (Math.random() - 0.5) * 1.2, T: 33 + Math.random() * 1.4 };
  }
  for (var n0 = 0; n0 < 3; n0++) { var b0 = newBlob(); b0.x = 6 + Math.random() * 20; b0.y = 4 + Math.random() * 16; blobs.push(b0); }
  var heroVisible = true;
  function heroFrame() {
    var dt = 0.125; hT += dt;
    blobs.forEach(function (b) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.stop > 0) { b.stop -= dt; b.x -= b.vx * dt; b.y -= b.vy * dt; } else if (Math.random() < 0.004) b.stop = 1.5 + Math.random() * 2; });
    blobs = blobs.filter(function (b) { return b.x > -4 && b.x < 36 && b.y > -4 && b.y < 28; });
    if (blobs.length < 2 || (blobs.length < 5 && Math.random() < 0.03)) blobs.push(newBlob());
    var inView = 0, d = himg.data;
    blobs.forEach(function (b) { if (b.x >= 0 && b.x < 32 && b.y >= 0 && b.y < 24) inView++; });
    for (var y = 0; y < 24; y++) for (var x = 0; x < 32; x++) {
      var T = base[y * 32 + x] + Math.sin(hT * 2 + x * 0.9 + y * 1.3) * 0.08;
      for (var q = 0; q < blobs.length; q++) {
        var bb = blobs[q], dx = x + 0.5 - bb.x, dy = (y + 0.5 - bb.y) * 1.1, dd = dx * dx + dy * dy;
        if (dd < 16) { var tt = T + (bb.T - T) * Math.exp(-dd / 2.4); if (tt > T) T = tt; }
      }
      T = Math.max(T, 22 + (x > 27 && y < 4 ? 14 * Math.exp(-((x - 30) * (x - 30) + (y - 1.5) * (y - 1.5)) / 2) : 0));   // a warm light fitting in the corner
      var l = Math.round(clamp((T - 17) / 23, 0, 1) * 255) * 3, o = (y * 32 + x) * 4;
      d[o] = LUT[l]; d[o + 1] = LUT[l + 1]; d[o + 2] = LUT[l + 2]; d[o + 3] = 255;
    }
    hctx.putImageData(himg, 0, 0);
    hvn.textContent = inView;
  }
  heroFrame();
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { heroVisible = es[0].isIntersecting; }).observe(hh);
  if (!REDUCED) setInterval(function () { if (heroVisible && !document.hidden) heroFrame(); }, 125);

  /* ---------- charts ---------- */
  var HOURS = function (a, b) { var r = []; for (var h = a; h <= b; h++) r.push(h); return r; };
  var hourLbl = function (h) { return (h < 10 ? '0' : '') + h + ':00'; };
  var VIZ = {
    entrance: { title: 'Visitors per hour, today', kind: 'bars', x: HOURS(10, 21), y: [62, 95, 140, 198, 236, 180, 152, 170, 0], live: 8, max: 260, xl: hourLbl,
      read: function (i, v) { return hourLbl(this.x[i]) + (i === this.live ? ' so far' : '') + ' · <b>' + fmt(v) + '</b> in'; } },
    storefront: { title: 'Stop rate, last 14 days', kind: 'line', x: HOURS(-13, 0), y: [11, 12, 10, 12, 11, 13, 12, 15, 16, 17, 16, 18, 17, 16], max: 25, unit: '%', mark: { i: 7, label: 'new window' },
      xl: function (d) { return d === 0 ? 'today' : d + 'd'; }, read: function (i, v) { return (this.x[i] === 0 ? 'Today' : -this.x[i] + ' days ago') + ' · <b>' + Math.round(v) + '%</b> stopped'; } },
    seating: { title: 'Seats taken through the day', kind: 'area', x: HOURS(10, 22), y: [2, 3, 6, 12, 15, 14, 9, 6, 7], live: 8, max: 15, refs: [{ v: 15, label: 'all 15 seats' }], xl: hourLbl,
      read: function (i, v) { return hourLbl(this.x[i]) + (i === this.live ? ' now' : '') + ' · <b>' + Math.round(v) + '/15</b> taken'; } },
    queue: { title: 'People in the queue, last 2 min', kind: 'line', stream: true, n: 60, max: 10, refs: [{ v: 7, label: 'open till 2', cls: 'alert' }],
      read: function (i, v) { var s = (this.y.length - 1 - i) * 2; return (s ? s + ' s ago' : 'Now') + ' · <b>' + Math.round(v) + '</b> in line'; } },
    routes: { title: 'Where walkers go, this week', kind: 'hbars', rows: [['Main walkway', 70], ['Terrace detour', 26], ['North corner', 4]], max: 100, unit: '%',
      read: function (i, v) { if (i == null) return '<b>' + Math.round(this.rows[2][1]) + '%</b> reach the north corner'; return this.rows[i][0] + ' · <b>' + Math.round(v) + '%</b>' + (i === 2 ? ' · a dead corner' : ''); } },
    capacity: { title: 'On the deck, last 2 min', kind: 'line', stream: true, n: 60, max: 48, refs: [{ v: 40, label: 'limit', cls: 'alert' }, { v: 32, label: '80%', cls: 'warn' }],
      read: function (i, v) { var s = (this.y.length - 1 - i) * 2; return (s ? s + ' s ago' : 'Now') + ' · <b>' + Math.round(v) + ' / 40</b>'; } },
    cooling: { title: 'AC run-time today, hours', kind: 'hbars', rows: [['West wing', 9.5], ['Front wing', 8], ['East wing', 3], ['Cafe lane', 6.5]], max: 13, refs: [{ v: 12, label: 'old timetable' }], dec: 1,
      read: function (i, v) { return i == null ? '<b>−' + Math.round(100 - 100 * (9.5 + 8 + 3 + 6.5) / 48) + '%</b> vs timetable' : this.rows[i][0] + ' · <b>' + v + ' h</b> of 12'; } },
    afterhours: { title: 'Chiller motor, nightly peak °C', kind: 'line', x: HOURS(-13, 0), y: [47, 47, 48, 48, 49, 50, 50, 51, 53, 54, 56, 57, 59, 62], min: 40, max: 66, refs: [{ v: 60, label: 'service due', cls: 'alert' }],
      xl: function (d) { return d === 0 ? 'tonight' : d + 'd'; }, read: function (i, v) { return (this.x[i] === 0 ? 'Tonight' : -this.x[i] + ' nights ago') + ' · <b>' + v + ' °C</b>'; } },
    leasing: { title: 'East wing visits per week', kind: 'area', x: HOURS(1, 12), y: [1420, 1380, 1450, 1400, 1360, 1440, 1710, 1860, 1950, 2020, 2080, 2130], max: 2500, mark: { i: 6, label: 'anchor opens' },
      xl: function (w) { return 'wk ' + w; }, read: function (i, v) { return 'Week ' + this.x[i] + ' · <b>' + fmt(v) + '</b> visits'; } }
  };
  // streams start with plausible history
  (function () {
    var q = VIZ.queue, c = VIZ.capacity; q.y = []; c.y = [];
    for (var i = 0; i < 60; i++) { q.y.push(Math.max(0, Math.round(4 + 3 * Math.sin(i * 0.12) + (Math.random() - 0.5) * 1.5))); c.y.push(Math.round(20 + 16 * Math.sin(i * 0.09 - 1))); }
  })();

  var live = {}, gotLive = false, entranceBase = null;
  UCUI.sample = function (id, v) { live[id] = v; gotLive = true; };
  function applyLive() {
    if (!gotLive) {   // no 3D running: keep the charts alive on their own
      var t = Date.now() / 1000;
      live.queue = Math.max(0, Math.round(4 + 3.5 * Math.sin(t * 0.08) + (Math.random() - 0.5)));
      live.capacity = Math.round(26 + 16 * Math.sin(t * 0.06));
    }
    if (live.entrance != null) { if (entranceBase == null) entranceBase = live.entrance; VIZ.entrance.y[8] = 120 + (live.entrance - entranceBase); VIZ.entrance.dirty = true; }
    if (live.storefront != null) { VIZ.storefront.y[13] = live.storefront; VIZ.storefront.dirty = true; }
    if (live.seating != null) { VIZ.seating.y[8] = live.seating; VIZ.seating.dirty = true; }
    if (live.routes != null) { var s = live.routes; VIZ.routes.rows[0][1] = s * 0.96; VIZ.routes.rows[1][1] = (100 - s) * 0.96; VIZ.routes.dirty = true; }
  }
  setInterval(function () {
    applyLive();
    ['queue', 'capacity'].forEach(function (id) {
      if (live[id] == null) return;
      var v = VIZ[id]; v.y.push(live[id]); if (v.y.length > v.n) v.y.shift(); v.dirty = true;
    });
  }, 2000);

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) { var t = el('text', Object.assign({ x: x, y: y }, attrs || {}), parent); t.textContent = s; return t; }
  function lastIndex(v) { return v.live != null ? v.live : (v.rows ? null : v.y.length - 1); }
  function valueAt(v, i) { return v.rows ? v.rows[i][1] : v.y[i]; }
  function readout(v, i) {
    if (i == null) i = lastIndex(v);
    if (i == null) return v.read.call(v, null);
    var val = valueAt(v, i);
    return v.read.call(v, i, v.dec ? +val.toFixed(v.dec) : Math.round(val * 10) / 10);
  }

  function render(id) {
    var v = VIZ[id], fig = v.fig;
    if (!fig) return;
    v.dirty = false;
    var W = Math.max(200, Math.round(fig.clientWidth - 26)) || 320;
    var svg = v.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var hi = v.hover;
    v.readEl.innerHTML = readout(v, hi);

    if (v.kind === 'hbars') {
      var rowH = 22, padT = v.refs ? 14 : 2, LW = Math.min(104, W * 0.34), VW = 34, H = padT + v.rows.length * rowH + 2;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('height', H);
      var bw = W - LW - VW, sx = function (x) { return LW + bw * clamp(x / v.max, 0, 1); };
      el('line', { class: 'axis', x1: LW, x2: LW, y1: padT - 2, y2: H }, svg);
      v.rows.forEach(function (r, i) {
        var y = padT + i * rowH, w = Math.max(2, sx(r[1]) - LW), on = hi === i, top = hi == null && i === 0;
        txt(svg, LW - 8, y + rowH / 2 + 3.5, r[0], { 'text-anchor': 'end', class: 'lab' });
        var h = 12, by = y + (rowH - h) / 2, rr = Math.min(4, w / 2);
        el('path', { class: 'bar' + (on || top ? ' hi' : ''), d: 'M' + LW + ' ' + by + 'h' + (w - rr) + 'a' + rr + ' ' + rr + ' 0 0 1 ' + rr + ' ' + rr + 'v' + (h - 2 * rr) + 'a' + rr + ' ' + rr + ' 0 0 1 -' + rr + ' ' + rr + 'h-' + (w - rr) + 'z' }, svg);
        txt(svg, sx(r[1]) + 6, y + rowH / 2 + 4, (v.dec ? (+r[1]).toFixed(v.dec) : Math.round(r[1])) + (v.unit || ''), { class: 'val' });
        el('rect', { class: 'hit', x: 0, y: y, width: W, height: rowH, 'data-i': i }, svg);
      });
      (v.refs || []).forEach(function (rf) {
        var g = el('g', { class: 'ref ' + (rf.cls || '') }, svg), x = sx(rf.v);
        el('line', { x1: x, x2: x, y1: padT - 4, y2: H }, g);
        txt(g, x, padT - 6, rf.label, { 'text-anchor': 'end' });
      });
      return;
    }

    var H2 = 96, padL = 26, padR = 8, padT2 = 12, padB = 16;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H2); svg.setAttribute('height', H2);
    var n = v.stream ? v.n : v.x.length, ys = v.y, ymin = v.min || 0, ymax = v.max;
    var pw = W - padL - padR, ph = H2 - padT2 - padB;
    var X = function (i) { return v.kind === 'bars' ? padL + pw * (i + 0.5) / n : padL + pw * (n === 1 ? 0.5 : i / (n - 1)); };
    var Y = function (y) { return padT2 + ph * (1 - clamp((y - ymin) / (ymax - ymin), 0, 1)); };
    var off = v.stream ? n - ys.length : 0;   // streams fill from the right
    var grid = el('g', { class: 'grid' }, svg);
    [ymin, (ymin + ymax) / 2, ymax].forEach(function (gv, gi) {
      el('line', { x1: padL, x2: W - padR, y1: Y(gv), y2: Y(gv) }, grid);
      txt(svg, padL - 5, Y(gv) + 3, gv >= 1000 ? (gv / 1000).toFixed(gv % 1000 ? 1 : 0) + 'k' : fmt(gv), { 'text-anchor': 'end' });
    });
    el('line', { class: 'axis', x1: padL, x2: W - padR, y1: Y(ymin), y2: Y(ymin) }, svg);
    // x labels: first, last, and the live point
    if (!v.stream) {
      var marks = [0, n - 1]; if (v.live != null && v.live !== n - 1) marks.push(v.live);
      if (n > 6) marks.push(Math.round((n - 1) / 2));
      marks.filter(function (m, k, arr) { return arr.indexOf(m) === k; }).forEach(function (m) {
        var anchor = m === 0 ? 'start' : m === n - 1 ? 'end' : 'middle', x = v.kind === 'bars' ? X(m) : X(m);
        if (v.kind !== 'bars') x = m === 0 ? X(m) - 2 : m === n - 1 ? X(m) + 2 : X(m);
        txt(svg, x, H2 - 3, v.xl(v.x[m]), { 'text-anchor': v.kind === 'bars' ? 'middle' : anchor });
      });
    } else {
      txt(svg, padL, H2 - 3, '−2 min', { 'text-anchor': 'start' });
      txt(svg, W - padR, H2 - 3, 'now', { 'text-anchor': 'end' });
    }
    (v.refs || []).forEach(function (rf) {
      var g = el('g', { class: 'ref ' + (rf.cls || '') }, svg), y = Y(rf.v);
      el('line', { x1: padL, x2: W - padR, y1: y, y2: y }, g);
      txt(g, W - padR, y - 3, rf.label, { 'text-anchor': 'end' });
    });
    if (v.mark) {
      var g2 = el('g', { class: 'ref' }, svg), mx = X(v.mark.i);
      el('line', { x1: mx, x2: mx, y1: padT2 - 2, y2: Y(ymin) }, g2);
      txt(g2, mx + 4, padT2 + 6, v.mark.label, { 'text-anchor': 'start' });
    }
    if (v.kind === 'bars') {
      var slot = pw / n, bw2 = Math.max(3, slot - 3);
      for (var i = 0; i < n; i++) {
        if (i > v.live) continue;
        var yv = ys[i], top = Y(yv), x0 = X(i) - bw2 / 2, h = Y(ymin) - top, r = Math.min(4, bw2 / 2, h);
        var cls = 'bar' + (i === v.live || hi === i ? ' hi' : '');
        el('path', { class: cls, d: 'M' + x0 + ' ' + Y(ymin) + 'v-' + (h - r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' -' + r + 'h' + (bw2 - 2 * r) + 'a' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + r + 'v' + (h - r) + 'z' }, svg);
      }
    } else {
      var last = v.live != null ? v.live : ys.length - 1;
      var pts = [];
      for (var k2 = 0; k2 <= last; k2++) pts.push([X(k2 + off), Y(ys[k2])]);
      var d = pts.map(function (p, k) { return (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join('');
      if (v.kind === 'area') el('path', { class: 'area', d: d + 'L' + pts[pts.length - 1][0].toFixed(1) + ' ' + Y(ymin) + 'L' + pts[0][0].toFixed(1) + ' ' + Y(ymin) + 'Z' }, svg);
      el('path', { class: 'ln', d: d }, svg);
      var mi = hi != null ? hi : last;
      if (hi != null) el('line', { class: 'xh', x1: X(mi + off), x2: X(mi + off), y1: padT2 - 2, y2: Y(ymin) }, svg);
      if (mi <= last) el('circle', { class: 'mk', cx: X(mi + off), cy: Y(ys[mi]), r: 4.5 }, svg);
    }
    // hover hit areas, wider than the marks
    var cnt = v.stream ? ys.length : (v.live != null ? v.live + 1 : n);
    for (var h3 = 0; h3 < cnt; h3++) {
      var cx = X(h3 + off), half = pw / Math.max(1, n - (v.kind === 'bars' ? 0 : 1)) / 2;
      el('rect', { class: 'hit', x: cx - half, y: 0, width: half * 2, height: H2, 'data-i': h3 }, svg);
    }
  }

  $$('.viz').forEach(function (fig) {
    var id = fig.dataset.viz, v = VIZ[id];
    if (!v) return;
    fig.innerHTML = '<div class="viz-head"><span class="viz-title">' + v.title + '</span><span class="viz-read" aria-live="off"></span></div>';
    v.fig = fig; v.readEl = $('.viz-read', fig);
    v.svg = el('svg', { role: 'img', 'aria-label': v.title + ' (simulated)' }, fig);
    var pick = function (e) {
      var t = e.target.closest && e.target.closest('[data-i]');
      var i = t ? +t.getAttribute('data-i') : null;
      if (i !== v.hover) { v.hover = i; render(id); }
    };
    v.svg.addEventListener('pointermove', pick);
    v.svg.addEventListener('pointerdown', pick);
    v.svg.addEventListener('pointerleave', function () { if (v.hover != null) { v.hover = null; render(id); } });
    render(id);
  });
  function nearView(fig) { var r = fig.getBoundingClientRect(); return r.bottom > -innerHeight && r.top < innerHeight * 2; }
  setInterval(function () {
    Object.keys(VIZ).forEach(function (id) { var v = VIZ[id]; if (v.dirty && v.hover == null && v.fig && nearView(v.fig)) render(id); });
  }, 1000);
  var rz;
  addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { Object.keys(VIZ).forEach(render); }, 150); });
})();
