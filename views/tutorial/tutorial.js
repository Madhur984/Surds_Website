/* Bloom Thermal tutorial: progress, the screen tour and the practice boxes.
 *
 * The practice boxes copy Bloom's controls but never talk to a sensor. Their
 * behaviour follows the live app: AC rules are ORed and logged with their reason,
 * a remote card is learned by holding it (about 0.6 s) and pressed by tapping it,
 * Rotate view turns the thermal view and the people a quarter turn at a time.
 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; } }
  function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage off */ } }

  /* ------------------------------------------------------------ progress */
  var PKEY = 'bloom-tutorial-progress';
  var done = load(PKEY, {});
  var chapters = $$('.chapter').map(function (s) { return s.dataset.ch; });
  $('#total-count').textContent = chapters.length;

  function renderProgress() {
    var n = chapters.filter(function (c) { return done[c]; }).length;
    $('#done-count').textContent = n;
    $('#top-progress').style.width = (n / chapters.length * 100) + '%';
    $$('.toc a').forEach(function (a) { a.classList.toggle('is-done', !!done[a.dataset.ch]); });
    $$('.done-btn').forEach(function (b) {
      var d = !!done[b.dataset.done];
      b.classList.toggle('is-done', d);
      b.textContent = d ? 'Done' : 'Mark as done';
      b.setAttribute('aria-pressed', d ? 'true' : 'false');
    });
  }
  $$('.done-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = b.dataset.done;
      done[c] = !done[c];
      save(PKEY, done);
      renderProgress();
      if (done[c]) {   // move the reader on to the next chapter
        var i = chapters.indexOf(c), next = document.getElementById(chapters[i + 1] || 'finish');
        if (next) setTimeout(function () { next.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' }); }, 250);
      }
    });
  });
  $('#reset-progress').addEventListener('click', function () { done = {}; save(PKEY, done); renderProgress(); });
  renderProgress();

  /* current chapter in the list */
  var tocLinks = $$('.toc a');
  var spy = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (e.isIntersecting) tocLinks.forEach(function (a) { a.classList.toggle('is-current', a.dataset.ch === e.target.dataset.ch); });
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  $$('.chapter').forEach(function (s) { spy.observe(s); });

  /* chapter list as a drawer on small screens */
  var toc = $('#toc'), menuBtn = $('#menu-btn');
  function setMenu(open) { toc.classList.toggle('open', open); menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  menuBtn.addEventListener('click', function () { setMenu(!toc.classList.contains('open')); });
  tocLinks.forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ------------------------------------------------------------ checklist */
  var CKEY = 'bloom-tutorial-checklist', checks = load(CKEY, {});
  var boxes = $$('[data-check]');
  function renderChecks() {
    var n = boxes.filter(function (b) { return b.checked; }).length;
    var note = $('#check-note');
    note.textContent = n === boxes.length ? 'All ready. On to the tour.' : n + ' of ' + boxes.length + ' ready.';
    note.classList.toggle('all', n === boxes.length);
  }
  boxes.forEach(function (b) {
    b.checked = !!checks[b.dataset.check];
    b.addEventListener('change', function () { checks[b.dataset.check] = b.checked; save(CKEY, checks); renderChecks(); });
  });
  renderChecks();

  /* ------------------------------------------------------------ screen tour */
  var PINS = [
    ['Connection status', 'Whether Bloom hears your sensor. It shows the sensor’s name and uptime when live, “offline” when it stopped reporting, and “demo” when no sensor is connected. Chapter 4 explains every state.'],
    ['Analytics', 'Opens the history page: room and people temperatures, occupancy and when the AC ran, from 15 minutes to 7 days. Chapter 11.'],
    ['Device Wi-Fi', 'Sets up the sensor’s Wi-Fi from your phone or laptop over Bluetooth. Chapter 3.'],
    ['Show / Hide thermal view', 'Lays the sensor’s own heat picture over the watched room, or hides it to show people markers instead. Chapter 7.'],
    ['Demo banner', 'Appears whenever the numbers are not from your sensor: “showing demo values” or “waiting for the thermal node”. Trust nothing until it is gone.'],
    ['Room panel', 'People in the room, room temperature, how warm the people read, the hottest spot, the sensor board’s own temperature, and the blob threshold. Chapter 6.'],
    ['Device orientation', 'Tell Bloom how the sensor is mounted: Set as facing down, zero yaw, and Rotate view so movement on screen matches the room. Chapter 5.'],
    ['The watched room', 'The tag shows the room’s name, how many are in and its temperature. The heat picture beneath it is the thermal view.'],
    ['Air conditioning', 'Whether the AC is running and why, manual Turn on / Turn off, and the automatic rules. Chapter 8.'],
    ['Remote', 'Your AC’s remote, learned button by button. Tap a card to press it, hold to learn it. Chapter 9.'],
    ['Event log', 'Bloom’s diary, newest first. Every AC change is written with its reason. Chapter 10.'],
    ['Status strip', 'At a glance: occupancy, room temperature, AC on/off, Wi-Fi signal and thermal frames per second.']
  ];
  var pins = $$('#tour-shot .pin');
  function showPin(i) {
    pins.forEach(function (p, k) { p.classList.toggle('is-active', k === i); p.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
    $('#pin-badge').textContent = i + 1;
    $('#pin-title').textContent = PINS[i][0];
    $('#pin-text').textContent = PINS[i][1];
  }
  pins.forEach(function (p) {
    p.setAttribute('aria-label', 'Part ' + p.textContent + ': ' + PINS[+p.dataset.pin][0]);
    p.addEventListener('click', function () { showPin(+p.dataset.pin); });
  });
  showPin(0);

  /* ------------------------------------------------------------ thermal drawing helpers */
  var STOPS = [[0, [8, 6, 30]], [0.18, [40, 12, 110]], [0.36, [120, 20, 150]], [0.52, [205, 40, 90]],
               [0.66, [240, 95, 30]], [0.8, [252, 170, 40]], [0.92, [255, 225, 120]], [1, [255, 252, 230]]];
  function ironbow(t) {
    t = Math.max(0, Math.min(1, t));
    var k = 0; while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++;
    var a = STOPS[k], b = STOPS[k + 1], f = (t - a[0]) / (b[0] - a[0]);
    return 'rgb(' + [0, 1, 2].map(function (c) { return Math.round(a[1][c] + (b[1][c] - a[1][c]) * f); }).join(',') + ')';
  }
  // field(u, v) -> °C over a 32 x 24 grid, drawn into a canvas
  function drawGrid(cv, field, lo, hi) {
    var g = cv.getContext('2d'), W = cv.width, H = cv.height, cw = W / 32, ch = H / 24;
    for (var y = 0; y < 24; y++) for (var x = 0; x < 32; x++) {
      g.fillStyle = ironbow((field((x + 0.5) / 32, (y + 0.5) / 24) - lo) / (hi - lo));
      g.fillRect(Math.floor(x * cw), Math.floor(y * ch), Math.ceil(cw), Math.ceil(ch));
    }
    return g;
  }
  function blob(u, v, cu, cv, su, sv) { var du = (u - cu) / su, dv = (v - cv) / sv; return Math.exp(-0.5 * (du * du + dv * dv)); }

  /* ------------------------------------------------------------ practice: rotate view */
  var rotCv = $('#rot-canvas'), rotBtn = $('#rot-btn'), rotOut = $('#rot-result');
  var MOUNT = 90, userRot = 0;           // this pretend sensor is mounted a quarter turn off
  function rotate(u, v, deg) {
    var x = u - 0.5, y = v - 0.5;
    for (var r = ((deg % 360) + 360) % 360; r > 0; r -= 90) { var t = x; x = -y; y = t; }
    return [x + 0.5, y + 0.5];
  }
  function drawRot(t) {
    var phase = REDUCED ? 0.55 : (t / 4200) % 1;                   // walk in from the door, repeat
    var room = [0.5, 1.02 - phase * 0.72];                          // true room position, door at the bottom
    var p = rotate(room[0], room[1], MOUNT + userRot);
    var desk = rotate(0.5, 0.22, MOUNT + userRot);
    drawGrid(rotCv, function (u, v) {
      return 24 + 3.5 * blob(u, v, desk[0], desk[1], 0.08, 0.06) + 9 * blob(u, v, p[0], p[1], 0.045, 0.06);
    }, 22, 34);
  }
  rotBtn.addEventListener('click', function () {
    userRot = (userRot + 90) % 360;
    rotBtn.textContent = 'Rotate view ' + userRot + '°';
    var ok = (MOUNT + userRot) % 360 === 0;
    rotOut.textContent = ok ? 'Matches the room. This is the setting to keep.' : 'Not matching yet';
    rotOut.classList.toggle('ok', ok);
  });

  /* ------------------------------------------------------------ practice: blob threshold */
  var BG = 25;
  var OBJECTS = [   // excess over the room, in °C
    { name: 'window', u: 0.04, v: 0.5, su: 0.05, sv: 0.42, ex: 2.5, person: false },
    { name: 'laptop', u: 0.72, v: 0.36, su: 0.03, sv: 0.03, ex: 3.5, person: false },
    { name: 'person', u: 0.4, v: 0.62, su: 0.05, sv: 0.075, ex: 8.0, person: true },
    { name: 'person', u: 0.76, v: 0.58, su: 0.045, sv: 0.07, ex: 7.0, person: true }
  ];
  var blobCv = $('#blob-canvas'), thr = $('#blob-thr');
  function drawBlobs() {
    var t = parseFloat(thr.value);
    $('#blob-thr-out').textContent = t.toFixed(1) + ' °C';
    var g = drawGrid(blobCv, function (u, v) {
      var s = BG + 0.6 * (1 - v);
      OBJECTS.forEach(function (o) { s += o.ex * blob(u, v, o.u, o.v, o.su, o.sv); });
      return s;
    }, 23, 34);
    var counted = OBJECTS.filter(function (o) { return o.ex >= t; });
    var W = blobCv.width, H = blobCv.height;
    counted.forEach(function (o) {
      g.lineWidth = 3;
      g.strokeStyle = o.person ? '#3aa76d' : '#d98a1c';
      g.beginPath(); g.arc(o.u * W, o.v * H, Math.max(o.su * W, 14) + 8, 0, Math.PI * 2); g.stroke();
      g.fillStyle = '#fff'; g.font = '600 13px "Instrument Sans", sans-serif'; g.textAlign = 'center';
      g.fillText(o.person ? 'person' : o.name + '?', Math.min(W - 36, Math.max(36, o.u * W)), Math.max(16, o.v * H - Math.max(o.sv * H, 14) - 14));
    });
    var people = counted.filter(function (o) { return o.person; }).length, wrong = counted.length - people;
    $('#blob-count').textContent = counted.length;
    var v = $('#blob-verdict');
    if (wrong === 0 && people === 2) { v.textContent = 'Right: exactly the two people.'; v.className = 'blob-verdict ok'; }
    else if (wrong > 0) { v.textContent = 'Too low: the ' + counted.filter(function (o) { return !o.person; }).map(function (o) { return o.name; }).join(' and ') + ' count as people.'; v.className = 'blob-verdict bad'; }
    else { v.textContent = 'Too high: ' + (2 - people) + ' real ' + (2 - people === 1 ? 'person is' : 'people are') + ' missed.'; v.className = 'blob-verdict bad'; }
  }
  thr.addEventListener('input', drawBlobs);
  drawBlobs();

  /* ------------------------------------------------------------ thermal view example */
  drawGrid($('#mini-thermal'), function (u, v) {
    return 24.5 + 0.8 * (1 - v) + 3 * blob(u, v, 0.62, 0.4, 0.05, 0.04) + 9 * blob(u, v, 0.48, 0.55, 0.05, 0.08) + 1.5 * blob(u, v, 0.48, 0.42, 0.03, 0.03);
  }, 23, 35);

  /* ------------------------------------------------------------ practice: AC rules */
  var sim = { on: false, clock: 10 * 3600, noRuleSince: null, manualUntil: 0, last: performance.now() };
  var el = {
    orb: $('#sim-orb'), word: $('#sim-word'), why: $('#sim-why'), resume: $('#sim-resume'), log: $('#sim-log'),
    auto: $('#sim-auto'), rOcc: $('#sim-r-occ'), rPerson: $('#sim-r-person'), rRoom: $('#sim-r-room'),
    personHot: $('#sim-person-hot'), tempOn: $('#sim-temp-on'), delay: $('#sim-delay'),
    people: $('#w-people'), room: $('#w-room'), ptemp: $('#w-ptemp')
  };
  function f1(x) { return Number(x).toFixed(1); }
  function clockText(s) { var h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, ss = Math.floor(s % 60); return [h, m, ss].map(function (n) { return (n < 10 ? '0' : '') + n; }).join(':'); }
  function simLog(msg) {
    var li = document.createElement('li');
    li.textContent = clockText(sim.clock) + ' ' + msg;
    el.log.insertBefore(li, el.log.firstChild);
    while (el.log.children.length > 12) el.log.removeChild(el.log.lastChild);
  }
  function holds() {   // reasons, in the same words Bloom uses
    var n = +el.people.value, room = +el.room.value, pt = +el.ptemp.value, out = [];
    if (el.rRoom.checked && room >= +el.tempOn.value) out.push('room ' + f1(room) + ' °C ≥ ' + f1(el.tempOn.value));
    if (el.rPerson.checked && n > 0 && pt >= +el.personHot.value) out.push('people read ' + f1(pt) + ' °C ≥ ' + f1(el.personHot.value));
    if (el.rOcc.checked && n > 0) out.push(n + ' in the room');
    return out;
  }
  function simStep(dt) {
    sim.clock += dt;
    var h = holds(), manual = sim.manualUntil > sim.clock;
    if (el.auto.checked && !manual) {
      if (h.length) {
        sim.noRuleSince = null;
        if (!sim.on) { sim.on = true; simLog('AC ON: ' + h[0]); }
      } else if (sim.on) {
        if (sim.noRuleSince == null) sim.noRuleSince = sim.clock;
        var waited = sim.clock - sim.noRuleSince;
        if (waited >= +el.delay.value) {
          sim.on = false; sim.noRuleSince = null;
          var n = +el.people.value;
          simLog('AC OFF: no rule holds (room ' + f1(el.room.value) + ' °C, people ' + (n ? f1(el.ptemp.value) + ' °C' : '–') + ') for ' + Math.round(waited) + ' s');
        }
      }
    }
    if (!manual && sim.manualUntil && sim.manualUntil <= sim.clock) { sim.manualUntil = 0; simLog('manual override over: rules decide again'); }
    renderSim(h, manual);
  }
  function renderSim(h, manual) {
    el.orb.classList.toggle('on', sim.on); el.orb.textContent = sim.on ? 'ON' : 'OFF';
    el.word.textContent = sim.on ? 'Running' : 'Off';
    var why = !el.auto.checked ? 'automatic is off: only Turn on / Turn off change the AC'
      : h.length ? h.join(' · ') : (sim.on && sim.noRuleSince != null ? 'no rule holds, switching off in ' + Math.max(0, Math.ceil(+el.delay.value - (sim.clock - sim.noRuleSince))) + ' s' : 'no rule holds');
    if (manual) why += ' · manual for ' + Math.round(sim.manualUntil - sim.clock) + ' s';
    el.why.textContent = why;
    el.resume.hidden = !manual;
    $('#sim-clock').textContent = clockText(sim.clock);
    $('#w-people-out').textContent = el.people.value;
    $('#w-room-out').textContent = f1(el.room.value) + ' °C';
    $('#w-ptemp-out').textContent = +el.people.value ? f1(el.ptemp.value) + ' °C' : 'nobody';
  }
  function manual(on) {
    sim.on = on; sim.noRuleSince = null; sim.manualUntil = sim.clock + 300;   // the override lasts a while
    simLog('AC ' + (on ? 'ON' : 'OFF') + ': manual (page)');
    renderSim(holds(), true);
  }
  $('#sim-on').addEventListener('click', function () { manual(true); });
  $('#sim-off').addEventListener('click', function () { manual(false); });
  el.resume.addEventListener('click', function () { sim.manualUntil = 0; simLog('Resume auto: rules decide again'); simStep(0); });
  var acVisible = false;
  new IntersectionObserver(function (es) { acVisible = es[0].isIntersecting; }).observe($('.ac-sim'));
  setInterval(function () { if (acVisible) simStep(1); }, 100);   // 1 room-second every 0.1 s: ten times real speed
  simStep(0);

  /* ------------------------------------------------------------ practice: remote */
  var BUTTONS = [
    { b: 'Power', act: 'toggle AC', mapped: true }, { b: 'Mode', act: 'frame view on/off', mapped: true },
    { b: 'Temp +', act: 'setpoint +1', mapped: true }, { b: 'Temp −', act: 'setpoint -1', mapped: true },
    { b: 'Fan', mapped: false }, { b: 'Swing', mapped: false }, { b: 'Sleep', mapped: false }, { b: 'Timer', mapped: false }
  ];
  var grid = $('#remote-grid'), fake = $('#fake-remote'), rlog = $('#remote-log'), learning = null;
  function rLog(msg) {
    var li = document.createElement('li'); li.textContent = msg;
    rlog.insertBefore(li, rlog.firstChild);
    while (rlog.children.length > 6) rlog.removeChild(rlog.lastChild);
  }
  function flash(card) { card.classList.add('flash'); setTimeout(function () { card.classList.remove('flash'); }, 450); }
  function paint() {
    BUTTONS.forEach(function (x) {
      x.el.classList.toggle('mapped', x.mapped);
      x.el.classList.toggle('learning', learning === x);
      x.el.querySelector('small').textContent = learning === x ? 'press remote…' : (x.act || (x.mapped ? 'mapped' : 'hold to learn'));
    });
    fake.hidden = !learning;
    if (learning) $('#fake-name').textContent = learning.b;
  }
  BUTTONS.forEach(function (x) {
    var card = document.createElement('button');
    card.type = 'button'; card.className = 'rb';
    card.innerHTML = '<span></span><small></small>';
    card.querySelector('span').textContent = x.b;
    card.setAttribute('aria-label', x.b + ': tap to press, hold to learn');
    x.el = card;
    var timer = null;
    function down(e) { if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return; if (e.repeat) return; if (e.type === 'keydown') e.preventDefault();
      timer = setTimeout(function () { timer = null; learning = x; rLog('learning ' + x.b + ': press it on your remote'); paint(); }, 600); }
    function up(e) {
      if (e.type === 'keyup' && e.key !== 'Enter' && e.key !== ' ') return;
      if (!timer) return;
      clearTimeout(timer); timer = null;
      if (x.mapped) { flash(card); rLog('sent ' + x.b + ' to the AC'); }
      else rLog(x.b + ' is not learned yet: hold it to learn');
    }
    card.addEventListener('pointerdown', down);
    card.addEventListener('pointerup', up);
    card.addEventListener('pointerleave', function () { if (timer) { clearTimeout(timer); timer = null; } });
    card.addEventListener('keydown', down);
    card.addEventListener('keyup', up);
    card.addEventListener('contextmenu', function (e) { e.preventDefault(); });   // long-press menu on phones
    grid.appendChild(card);
  });
  $('#fake-press').addEventListener('click', function () {
    if (!learning) return;
    learning.mapped = true; flash(learning.el); rLog('learned ' + learning.b + ': tap it to send');
    learning = null; paint();
  });
  paint();

  /* ------------------------------------------------------------ analytics example chart */
  (function chart() {
    var svg = $('#ex-chart'), NS = 'http://www.w3.org/2000/svg';
    function node(tag, attrs) { var n = document.createElementNS(NS, tag); for (var k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; }
    var L = 40, R = 505, T1 = 14, B1 = 170, T2 = 196, B2 = 270, N = 61;
    var occ = [], room = [], ppl = [], ac = [], r = 25.2;
    for (var i = 0; i < N; i++) {
      var o = i < 8 ? 0 : i < 22 ? 3 : i < 26 ? 1 : i < 44 ? 4 : i < 50 ? 2 : 0;
      var on = (r >= 26 && i > 5) || (o > 0 && i >= 9 && i < 52);
      r += (on ? -0.11 : 0.06) + o * 0.03 + Math.sin(i * 0.7) * 0.02;
      occ.push(o); room.push(r); ppl.push(o ? 33.4 + Math.sin(i * 0.5) * 0.4 + o * 0.08 : null); ac.push(on);
    }
    var x = function (i) { return L + (R - L) * i / (N - 1); };
    var y1 = function (t) { return B1 - (t - 23) / (36 - 23) * (B1 - T1); };
    var y2 = function (n) { return B2 - n / 5 * (B2 - T2); };
    [24, 27, 30, 33, 36].forEach(function (t) {
      node('line', { x1: L, x2: R, y1: y1(t), y2: y1(t), stroke: '#e6e8ec' });
      node('text', { x: L - 8, y: y1(t) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8a93a0' }).textContent = t + '°';
    });
    node('line', { x1: L, x2: R, y1: y1(26), y2: y1(26), stroke: '#3b7ddd', 'stroke-dasharray': '5 4', 'stroke-width': 1.3 });
    node('text', { x: R, y: y1(26) - 5, 'text-anchor': 'end', 'font-size': 10, fill: '#3b7ddd' }).textContent = 'AC line 26°';
    node('path', { d: room.map(function (t, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y1(t).toFixed(1); }).join(' '), fill: 'none', stroke: '#3b7ddd', 'stroke-width': 2.2 });
    var d = '', pen = false;
    ppl.forEach(function (t, i) { if (t == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y1(t).toFixed(1) + ' '; pen = true; });
    node('path', { d: d, fill: 'none', stroke: '#FE7743', 'stroke-width': 2.2 });
    // occupancy area + AC bars
    node('line', { x1: L, x2: R, y1: B2, y2: B2, stroke: '#e6e8ec' });
    node('path', { d: 'M' + x(0) + ' ' + B2 + ' ' + occ.map(function (n, i) { return 'L' + x(i).toFixed(1) + ' ' + y2(n).toFixed(1); }).join(' ') + ' L' + x(N - 1) + ' ' + B2 + ' Z', fill: '#c9ced6', opacity: 0.8 });
    var start = null;
    ac.concat([false]).forEach(function (on, i) {
      if (on && start == null) start = i;
      if (!on && start != null) { node('rect', { x: x(start), y: B2 + 6, width: Math.max(4, x(i - 1) - x(start)), height: 9, rx: 4.5, fill: '#3b7ddd', opacity: 0.5 }); start = null; }
    });
    node('text', { x: L - 8, y: y2(4) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#8a93a0' }).textContent = '4';
    node('text', { x: L - 8, y: B2 + 14, 'text-anchor': 'end', 'font-size': 10, fill: '#8a93a0' }).textContent = 'AC';
    ['9:00', '9:15', '9:30', '9:45', '10:00'].forEach(function (s, k) {
      node('text', { x: x(k * 15), y: 294, 'text-anchor': k === 0 ? 'start' : k === 4 ? 'end' : 'middle', 'font-size': 10, fill: '#8a93a0' }).textContent = s;
    });
  })();

  /* ------------------------------------------------------------ animation loop (only what is on screen) */
  var rotVisible = false;
  new IntersectionObserver(function (es) { rotVisible = es[0].isIntersecting; }).observe(rotCv);
  drawRot(0);
  (function loop(t) { if (rotVisible && !REDUCED) drawRot(t); requestAnimationFrame(loop); })(0);
})();
