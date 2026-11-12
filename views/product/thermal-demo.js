/* Live thermal room: what the SURDS Thermal sensor sees, and what it decides.
 *
 * A top-down office is simulated as a temperature field (people, desks with laptops,
 * a sunny window, the AC's cold plume, optional hot equipment). The field is drawn
 * through an ironbow palette exactly the way a thermal array would report it, and a
 * small rule set, the same one described on the page, decides when to send IR to the AC.
 *
 * One real second = one simulated minute so cause and effect are visible quickly.
 */

var GW = 96, GH = 60;                 // simulated field resolution
var RAW_W = 32, RAW_H = 20;           // what the "raw sensor pixels" view shows
var T_MIN = 16, T_MAX = 38;           // palette range in °C

function ironbow() {
  var stops = [[0, [8, 6, 30]], [0.18, [40, 12, 110]], [0.36, [120, 20, 150]], [0.52, [205, 40, 90]],
               [0.66, [240, 95, 30]], [0.8, [252, 170, 40]], [0.92, [255, 225, 120]], [1, [255, 252, 230]]];
  var lut = new Uint8ClampedArray(256 * 3);
  for (var i = 0; i < 256; i++) {
    var t = i / 255, k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    var a = stops[k], b = stops[k + 1], f = (t - a[0]) / (b[0] - a[0]);
    for (var c = 0; c < 3; c++) lut[i * 3 + c] = a[1][c] + (b[1][c] - a[1][c]) * f;
  }
  return lut;
}
var LUT = ironbow();

var DESKS = [ { x: 0.22, y: 0.32 }, { x: 0.22, y: 0.62 }, { x: 0.5, y: 0.32 }, { x: 0.5, y: 0.62 }, { x: 0.78, y: 0.32 }, { x: 0.78, y: 0.62 } ];
var AC = { x: 0.5, y: 0.035 };
var SENSOR = { x: 0.5, y: 0.97 };
var RACK = { x: 0.9, y: 0.86 };

function rand(a, b) { return a + Math.random() * (b - a); }

export function ThermalDemo(root) {
  this.root = root;
  this.canvas = root.querySelector('canvas');
  this.ctx = this.canvas.getContext('2d');
  this.field = document.createElement('canvas');
  this.field.width = GW; this.field.height = GH;
  this.fctx = this.field.getContext('2d');
  this.img = this.fctx.createImageData(GW, GH);
  this.T = new Float32Array(GW * GH);

  this.s = {
    room: 27.5, outside: 34, target: 24, people: [], acOn: false, acSet: 24,
    auto: true, detections: true, raw: false, rack: false,
    clock: 9 * 60, emptyFor: 0, irPulse: 0, log: [], lastReason: ''
  };
  this.ui = {};
  var self = this;
  ['people', 'target', 'outside', 'auto', 'detections', 'raw', 'rack', 'occupancy', 'avg', 'hot', 'ac', 'reason', 'log', 'clock', 'peopleVal', 'targetVal']
    .forEach(function (k) { self.ui[k] = root.querySelector('[data-demo="' + k + '"]'); });
  this.bind();
  this.setPeople(3);
  this.resize();
  new ResizeObserver(function () { self.resize(); }).observe(this.canvas);
  this.visible = false;
  new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; }).observe(root);
  this.last = performance.now();
  requestAnimationFrame(function loop(t) { self.frame(t); requestAnimationFrame(loop); });
}

ThermalDemo.prototype.bind = function () {
  var s = this.s, ui = this.ui, self = this;
  ui.people.addEventListener('input', function () { self.setPeople(+ui.people.value); });
  ui.target.addEventListener('input', function () { s.target = +ui.target.value; ui.targetVal.textContent = s.target + '°C'; });
  this.root.querySelectorAll('[data-outside]').forEach(function (b) {
    b.addEventListener('click', function () {
      s.outside = +b.dataset.outside;
      self.root.querySelectorAll('[data-outside]').forEach(function (o) { o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); });
    });
  });
  ui.auto.addEventListener('change', function () { s.auto = ui.auto.checked; if (!s.auto) self.say('Auto control off. The sensor keeps measuring and reporting, but sends no IR.'); });
  ui.detections.addEventListener('change', function () { s.detections = ui.detections.checked; });
  ui.raw.addEventListener('change', function () { s.raw = ui.raw.checked; });
  ui.rack.addEventListener('click', function () {
    s.rack = !s.rack;
    ui.rack.setAttribute('aria-pressed', s.rack ? 'true' : 'false');
    ui.rack.textContent = s.rack ? 'Remove hot equipment' : 'Add hot equipment';
  });
  ui.targetVal.textContent = s.target + '°C';
};

ThermalDemo.prototype.setPeople = function (n) {
  var ps = this.s.people;
  while (ps.length < n) {
    var d = DESKS[ps.length % DESKS.length];
    ps.push({ x: rand(0.3, 0.7), y: 0.92, tx: d.x + rand(-0.04, 0.04), ty: d.y + 0.07, wait: 0, desk: d, enter: 1 });
  }
  if (ps.length > n) ps.length = n;
  this.ui.peopleVal.textContent = n;
  this.ui.people.value = n;
};

ThermalDemo.prototype.resize = function () {
  var r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (!r.width) return;
  this.canvas.width = Math.round(r.width * dpr);
  this.canvas.height = Math.round(r.height * dpr);
  this.dpr = dpr;
};

ThermalDemo.prototype.say = function (text) {
  var s = this.s;
  var hh = Math.floor(s.clock / 60) % 24, mm = Math.floor(s.clock % 60);
  s.log.unshift({ t: (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm, text: text });
  s.log.length = Math.min(s.log.length, 5);
  this.ui.log.innerHTML = '';
  var ui = this.ui;
  s.log.forEach(function (e) {
    var li = document.createElement('li');
    var time = document.createElement('time'); time.textContent = e.t;
    var span = document.createElement('span'); span.textContent = e.text;
    li.appendChild(time); li.appendChild(span); ui.log.appendChild(li);
  });
};

ThermalDemo.prototype.sendIR = function (cmd, why) {
  this.s.irPulse = 1;
  this.say('IR → AC: ' + cmd + '. ' + why);
};

/* ---- simulation ---- */
ThermalDemo.prototype.step = function (dt) {
  var s = this.s, simMin = dt;          // dt seconds of real time = dt minutes of sim time
  s.clock += simMin;

  // people: walk to a desk, sit a while, occasionally get up and wander
  s.people.forEach(function (p) {
    var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
    if (d > 0.01) { var v = Math.min(d, 0.12 * dt); p.x += dx / d * v; p.y += dy / d * v; }
    else if ((p.wait -= dt) <= 0) {
      if (Math.random() < 0.35) { p.tx = rand(0.12, 0.88); p.ty = rand(0.2, 0.8); p.wait = rand(1, 3); }
      else { p.tx = p.desk.x + rand(-0.03, 0.03); p.ty = p.desk.y + 0.07; p.wait = rand(5, 12); }
    }
  });

  // room heat balance (°C per sim minute)
  var n = s.people.length;
  var gain = 0.012 * (s.outside - s.room) + 0.022 * n + (s.rack ? 0.03 : 0);
  var cool = s.acOn ? 0.09 * Math.max(0, s.room - (s.acSet - 2)) : 0;
  s.room += (gain - cool) * simMin;

  // the sensor's rules
  var occupied = n > 0;
  s.emptyFor = occupied ? 0 : s.emptyFor + simMin;
  var reason;
  if (!s.auto) reason = 'Measuring only. Auto control is off.';
  else if (occupied && !s.acOn && s.room > s.target + 0.5) {
    s.acOn = true; s.acSet = s.target;
    this.sendIR('COOL ' + s.target + '°C', n + (n === 1 ? ' person' : ' people') + ' present and the room is ' + s.room.toFixed(1) + '°C.');
  } else if (s.acOn && occupied && s.acSet !== s.target) {
    s.acSet = s.target;
    this.sendIR('SET ' + s.target + '°C', 'Comfort target changed.');
  } else if (s.acOn && !occupied && s.emptyFor >= 15) {
    s.acOn = false;
    this.sendIR('OFF', 'Room empty for 15 min. No one to cool.');
  } else if (s.acOn && occupied && s.room < s.target - 1.5) {
    s.acOn = false;
    this.sendIR('OFF', 'Room is below target. Letting it drift back.');
  }
  if (!reason) {
    if (!occupied && s.acOn) reason = 'Room empty for ' + Math.floor(s.emptyFor) + ' min. Will switch the AC off at 15.';
    else if (!occupied) reason = 'No body heat in view. Nothing to do.';
    else if (s.acOn) reason = 'Occupied and cooling toward ' + s.acSet + '°C.';
    else if (s.room > s.target) reason = 'Occupied. Room within 0.5°C of target, holding off.';
    else reason = 'Occupied and comfortable. No action needed.';
  }
  if (s.rack && !this.rackAlerted) { this.rackAlerted = true; this.say('ALERT → SURDS mesh: hot spot over 50°C by the rack. No IR, a person should look.'); }
  if (!s.rack) this.rackAlerted = false;
  s.lastReason = reason;
  s.irPulse = Math.max(0, s.irPulse - dt * 0.8);
};

ThermalDemo.prototype.computeField = function (t) {
  var s = this.s, T = this.T;
  var sun = (s.outside - 28) * 0.35;
  for (var j = 0; j < GH; j++) {
    var y = j / (GH - 1);
    for (var i = 0; i < GW; i++) {
      var x = i / (GW - 1), v = s.room;
      // walls a touch cooler, window strip warmer with the outside
      if (x < 0.04) v += sun + 1.5 * Math.sin(y * 9 + t * 0.0004) * 0.2;
      else if (x < 0.14) v += sun * (0.14 - x) * 6;
      if (y < 0.02 || y > 0.985 || x > 0.985) v -= 1.2;
      // AC plume
      if (s.acOn) {
        var ax = x - AC.x, ay = y - AC.y;
        var plume = Math.exp(-(ax * ax) / 0.02 - (ay * ay) / 0.06);
        v -= 8 * plume * (0.85 + 0.15 * Math.sin(t * 0.004 + y * 20));
      }
      T[j * GW + i] = v;
    }
  }
  function blob(cx, cy, sx, sy, peak) {
    var i0 = Math.max(0, Math.floor((cx - 3 * sx) * GW)), i1 = Math.min(GW - 1, Math.ceil((cx + 3 * sx) * GW));
    var j0 = Math.max(0, Math.floor((cy - 3 * sy) * GH)), j1 = Math.min(GH - 1, Math.ceil((cy + 3 * sy) * GH));
    for (var jj = j0; jj <= j1; jj++) for (var ii = i0; ii <= i1; ii++) {
      var dx = (ii / (GW - 1) - cx) / sx, dy = (jj / (GH - 1) - cy) / sy;
      var w = Math.exp(-0.5 * (dx * dx + dy * dy)), k = jj * GW + ii;
      T[k] += (peak - T[k]) * w;
    }
  }
  DESKS.forEach(function (d) { blob(d.x, d.y, 0.05, 0.035, s.room - 0.8); blob(d.x + 0.02, d.y - 0.005, 0.012, 0.012, 36); });
  if (s.rack) blob(RACK.x, RACK.y, 0.035, 0.05, 55);
  s.people.forEach(function (p) { blob(p.x, p.y, 0.024, 0.036, 33.5); blob(p.x, p.y - 0.012, 0.012, 0.014, 35); });
};

/* ---- rendering ---- */
ThermalDemo.prototype.draw = function (t) {
  var s = this.s, T = this.T, d = this.img.data, ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
  var hot = -99;
  for (var k = 0; k < GW * GH; k++) {
    var v = T[k];
    if (v > hot) hot = v;
    var idx = Math.max(0, Math.min(255, Math.round((v - T_MIN) / (T_MAX - T_MIN) * 255))) * 3;
    d[k * 4] = LUT[idx]; d[k * 4 + 1] = LUT[idx + 1]; d[k * 4 + 2] = LUT[idx + 2]; d[k * 4 + 3] = 255;
  }
  this.fctx.putImageData(this.img, 0, 0);
  ctx.save();
  if (s.raw) {
    // what actually leaves the lens: a coarse grid of temperatures, nothing more
    ctx.imageSmoothingEnabled = false;
    var tmp = this.rawCanvas || (this.rawCanvas = document.createElement('canvas'));
    tmp.width = RAW_W; tmp.height = RAW_H;
    var tc = tmp.getContext('2d'); tc.imageSmoothingEnabled = true;
    tc.drawImage(this.field, 0, 0, RAW_W, RAW_H);
    ctx.drawImage(tmp, 0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.font = Math.round(9 * this.dpr) + 'px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var cw = W / RAW_W, ch = H / RAW_H;
    if (cw > 26 * this.dpr) {
      for (var y = 1; y < RAW_H; y += 2) for (var x = 1; x < RAW_W; x += 2) {
        var tv = T[Math.round(y / RAW_H * GH) * GW + Math.round(x / RAW_W * GW)];
        ctx.fillText(tv.toFixed(0), (x + 0.5) * cw, (y + 0.5) * ch);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    for (var gx = 0; gx <= RAW_W; gx++) { ctx.beginPath(); ctx.moveTo(gx * cw, 0); ctx.lineTo(gx * cw, H); ctx.stroke(); }
    for (var gy = 0; gy <= RAW_H; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * ch); ctx.lineTo(W, gy * ch); ctx.stroke(); }
  } else {
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.field, 0, 0, W, H);
  }

  var px = function (x) { return x * W; }, py = function (y) { return y * H; }, u = this.dpr;
  ctx.font = '600 ' + Math.round(10 * u) + 'px "Instrument Sans", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

  // AC unit and IR beam
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  roundRect(ctx, px(AC.x) - 44 * u, py(AC.y) - 9 * u, 88 * u, 18 * u, 5 * u); ctx.fill();
  ctx.fillStyle = '#2a120b';
  ctx.fillText(s.acOn ? 'AC · COOL ' + s.acSet + '°' : 'AC · OFF', px(AC.x), py(AC.y) + 0.5 * u);
  if (s.irPulse > 0) {
    var grd = ctx.createLinearGradient(px(SENSOR.x), py(SENSOR.y), px(AC.x), py(AC.y));
    grd.addColorStop(0, 'rgba(255,90,50,' + (0.9 * s.irPulse) + ')'); grd.addColorStop(1, 'rgba(255,90,50,0)');
    ctx.strokeStyle = grd; ctx.lineWidth = 3 * u; ctx.setLineDash([6 * u, 8 * u]); ctx.lineDashOffset = -t * 0.05;
    ctx.beginPath(); ctx.moveTo(px(SENSOR.x), py(SENSOR.y) - 10 * u); ctx.lineTo(px(AC.x), py(AC.y) + 10 * u); ctx.stroke();
    ctx.setLineDash([]);
  }

  // sensor on the wall + its field of view
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1 * u;
  ctx.beginPath(); ctx.moveTo(px(SENSOR.x), py(SENSOR.y)); ctx.lineTo(0, py(0.18)); ctx.moveTo(px(SENSOR.x), py(SENSOR.y)); ctx.lineTo(W, py(0.18)); ctx.stroke();
  ctx.fillStyle = '#FE7743'; roundRect(ctx, px(SENSOR.x) - 22 * u, py(SENSOR.y) - 7 * u, 44 * u, 14 * u, 7 * u); ctx.fill();
  ctx.fillStyle = '#2b2d33'; roundRect(ctx, px(SENSOR.x) - 17 * u, py(SENSOR.y) - 4 * u, 34 * u, 8 * u, 4 * u); ctx.fill();

  // detections
  if (s.detections && !s.raw) {
    s.people.forEach(function (p, i) {
      ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5 * u;
      ctx.beginPath(); ctx.arc(px(p.x), py(p.y), 17 * u, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillText('Person ' + (i + 1), px(p.x), py(p.y) - 26 * u);
    });
    if (s.rack) {
      ctx.strokeStyle = '#fff'; ctx.setLineDash([4 * u, 3 * u]);
      ctx.strokeRect(px(RACK.x) - 22 * u, py(RACK.y) - 28 * u, 44 * u, 56 * u); ctx.setLineDash([]);
      ctx.fillStyle = '#fff'; ctx.fillText('Hot spot ' + hot.toFixed(0) + '°C', px(RACK.x) - 24 * u, py(RACK.y) - 38 * u);
    }
  }
  ctx.restore();

  // readouts
  var ui = this.ui;
  ui.occupancy.textContent = s.people.length;
  ui.avg.textContent = s.room.toFixed(1) + '°C';
  ui.hot.textContent = hot.toFixed(1) + '°C';
  ui.ac.textContent = s.acOn ? 'Cooling · ' + s.acSet + '°C' : 'Off';
  ui.ac.dataset.on = s.acOn ? 'true' : 'false';
  ui.reason.textContent = s.lastReason;
  var hh = Math.floor(s.clock / 60) % 24, mm = Math.floor(s.clock % 60);
  ui.clock.textContent = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

ThermalDemo.prototype.frame = function (t) {
  var dt = Math.min((t - this.last) / 1000, 0.1);
  this.last = t;
  if (!this.visible) return;
  this.step(dt);
  this.computeField(t);
  this.draw(t);
};
