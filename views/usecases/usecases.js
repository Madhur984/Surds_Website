/* SURDS Thermal use cases: a scroll tour through a real shopping-mall model.
 *
 * Each use-case section flies the camera to the spot where a sensor would hang and
 * switches on that zone: the sensor marker with its field of view, a 32 x 24 heat
 * patch on the floor (what the sensor actually sees), simulated visitors and live
 * numbers. Figures are simulated for illustration.
 *
 * Mall coordinates: the model is scaled to 120 units across and centred, so about
 * 1 unit = 3.4 m and a person is ~0.5 units tall. Ground floor sits near y = 1.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

var Q = new URLSearchParams(location.search);
var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
var INSTANT = Q.has('instant') || REDUCED;
var ALL = Q.has('all');   // debug: show every zone at once
var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };
var rand = function (a, b) { return a + Math.random() * (b - a); };
var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };

/* ---------- renderer, scene, lights ---------- */
var UI = window.UCUI || { progress: function () { }, ready: function () { }, fail: function () { }, sample: function () { } };
var PHONE = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
var canvas = document.getElementById('stage');
var renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  UI.fail('This browser cannot show the 3D mall. Everything else still works.');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, PHONE ? 1.5 : 1.75));
// size to the canvas's CSS box (100lvh), so a phone's collapsing toolbar does not resize the GL buffer
var VW = 0, VH = 0;
function sizeStage() {
  var w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
  if (w === VW && Math.abs(h - VH) < 2) return false;
  VW = w; VH = h;
  renderer.setSize(VW, VH, false);
  return true;
}
sizeStage();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);

var scene = new THREE.Scene();
var DAY_FOG = new THREE.Color('#e6e3dc'), NIGHT_FOG = new THREE.Color('#16242f');
scene.fog = new THREE.Fog(DAY_FOG.clone(), 90, 260);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

var camera = new THREE.PerspectiveCamera(42, VW / VH, 0.05, 900);
var hemi = new THREE.HemisphereLight(0xe8f0f8, 0x8a8170, 0.95);
scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff0dd, 2.3);
sun.position.set(24, 52, 14);
sun.target.position.set(-5, 0, -12);
sun.castShadow = true;
sun.shadow.mapSize.set(PHONE ? 1024 : 2048, PHONE ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 150 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

/* ---------- colour maps ---------- */
var IRON = [[0, 8, 0, 20], [0.18, 40, 0, 100], [0.38, 140, 10, 140], [0.56, 215, 50, 45], [0.74, 250, 135, 0], [0.9, 255, 215, 60], [1, 255, 255, 225]];
var LUT = new Uint8Array(256 * 3);
(function () {
  for (var i = 0; i < 256; i++) {
    var t = i / 255, k = 0;
    while (k < IRON.length - 2 && t > IRON[k + 1][0]) k++;
    var a = IRON[k], b = IRON[k + 1], f = (t - a[0]) / (b[0] - a[0]);
    for (var c = 0; c < 3; c++) LUT[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
  }
})();
var T_LO = 17, T_HI = 40;

/* ---------- people figures ---------- */
var BODY = new THREE.CapsuleGeometry(0.062, 0.25, 3, 8); BODY.translate(0, 0.187, 0);
var HEAD = new THREE.SphereGeometry(0.052, 12, 8); HEAD.translate(0, 0.42, 0);
var CLOTHES = ['#3d5a80', '#9a8c7a', '#7a4b3a', '#5f7a61', '#c9c3b6', '#6b5b8a', '#b0703c', '#2f3e46', '#8d99ae', '#a44a3f'];
var SKIN = ['#e0b49a', '#c68f6d', '#8d5a3b', '#f1c8ad', '#a8714f'];
var bodyMats = CLOTHES.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 }); });
var headMats = SKIN.map(function (c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.7 }); });
var figurePool = [];
function takeFigure() {
  var g = figurePool.pop();
  if (!g) {
    g = new THREE.Group();
    var b = new THREE.Mesh(BODY, bodyMats[(Math.random() * bodyMats.length) | 0]);
    var h = new THREE.Mesh(HEAD, headMats[(Math.random() * headMats.length) | 0]);
    b.castShadow = h.castShadow = true;
    g.add(b, h);
  }
  g.children[0].material = bodyMats[(Math.random() * bodyMats.length) | 0];
  g.scale.set(1, rand(0.92, 1.08), 1);
  g.visible = true;
  scene.add(g);
  return g;
}
function dropFigure(g) { scene.remove(g); figurePool.push(g); }

/* ---------- sensor marker (the red triangular SURDS body on a wall plate) ---------- */
var sensorMat = new THREE.MeshStandardMaterial({ color: '#d2402a', roughness: 0.55 });
var plateMat = new THREE.MeshStandardMaterial({ color: '#efeeea', roughness: 0.6 });
var lensMat = new THREE.MeshStandardMaterial({ color: '#0d1114', roughness: 0.2, metalness: 0.3 });
var ringMat = new THREE.MeshBasicMaterial({ color: '#FE7743', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
function makeSensor() {
  var g = new THREE.Group();
  var body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 3), sensorMat);
  body.rotation.x = Math.PI / 2; body.rotation.y = Math.PI;   // triangle face forward, apex up
  var plate = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.015), plateMat); plate.position.z = -0.032;
  var lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 20), lensMat); lens.position.z = 0.026;
  var ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.115, 40), ringMat); ring.position.z = 0.03;
  g.add(body, plate, lens, ring);
  g.userData.ring = ring;
  return g;
}

/* ---------- zones ---------- */
/* c: centre (x, z); w x d: footprint along / across; rot: degrees about Y;
   hint: expected floor height; grid: heat cells; mounts: sensor positions in zone
   space [u, v, height above floor] with the sub-rectangle each one covers. */
var ZONES = {
  entrance: { c: [-5.3, 2.35], w: 3.2, d: 2.5, rot: 0, hint: 1, grid: [32, 24], mode: 'live', mounts: [[0, -1.32, 1.25]] },
  storefront: { c: [-1.5, 2.2], w: 3.6, d: 2.4, rot: 0, hint: 1, grid: [32, 24], mode: 'live', mounts: [[0, -1.27, 1.2]] },
  seating: { c: [-13.6, -2.35], w: 3.4, d: 2.6, rot: 0, hint: 1, grid: [32, 24], mode: 'live', mounts: [[0, -1.42, 1.3]] },
  queue: { c: [-5.0, -11.6], w: 3.4, d: 2.3, rot: 58, hint: 1, grid: [32, 24], mode: 'live', mounts: [[0, -1.45, 1.3]] },
  routes: { c: [-6.25, -10.65], w: 22.7, d: 4.2, rot: 55.4, hint: 1, grid: [112, 20], mode: 'accum', mounts: [[-8.5, -2.25, 1.4], [-2.85, -2.25, 1.4], [2.85, -2.25, 1.4], [8.5, -2.25, 1.4]] },
  capacity: { c: [-9.6, -14], w: 10, d: 13, rot: 0, hint: 5.8, grid: [30, 39], mode: 'live', mounts: [[-2.5, -3.25, 1.1], [2.5, -3.25, 1.1], [-2.5, 3.25, 1.1], [2.5, 3.25, 1.1]] },
  afterhours: { c: [-8.5, -25.2], w: 6, d: 4.5, rot: 0, hint: 1, grid: [32, 24], mode: 'live', mounts: [[0, 2.35, 1.3]], night: true },
  cooling: { boxes: true },
  leasing: { boxes: true }
};

var mallMeshes = [];
var ray = new THREE.Raycaster();
function floorAt(x, z, hint) {
  ray.set(V3(x, 80, z), V3(0, -1, 0));
  var hits = ray.intersectObjects(mallMeshes, false), best = hint, bd = 1.4;
  for (var i = 0; i < hits.length; i++) {
    var d = Math.abs(hits[i].point.y - hint);
    if (d < bd) { bd = d; best = hits[i].point.y; }
  }
  return best;
}

function buildZone(id, z) {
  z.id = id;
  var th = (z.rot || 0) * Math.PI / 180;
  z.U = V3(Math.cos(th), 0, -Math.sin(th));
  z.V = V3(Math.sin(th), 0, Math.cos(th));
  z.y = floorAt(z.c[0], z.c[1], z.hint);
  z.group = new THREE.Group(); z.group.visible = false; scene.add(z.group);
  z.agents = []; z.t = 0; z.alpha = 0; z.stats = {};
  z.hot = [];   // fixed heat sources [u, v, temp, sigma]

  /* heat patch */
  var gw = z.grid[0], gh = z.grid[1];
  z.cv = document.createElement('canvas'); z.cv.width = gw; z.cv.height = gh;
  z.ctx = z.cv.getContext('2d'); z.img = z.ctx.createImageData(gw, gh);
  z.tex = new THREE.CanvasTexture(z.cv);
  z.tex.magFilter = THREE.NearestFilter; z.tex.minFilter = THREE.NearestFilter; z.tex.generateMipmaps = false;
  z.tex.colorSpace = THREE.SRGBColorSpace;
  z.mat = new THREE.MeshBasicMaterial({ map: z.tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  var pg = new THREE.Group(); pg.position.set(z.c[0], z.y + 0.03, z.c[1]); pg.rotation.y = th;
  var plane = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.d), z.mat);
  plane.rotation.x = -Math.PI / 2; plane.renderOrder = 10;
  pg.add(plane);
  var edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(z.w, z.d)), new THREE.LineBasicMaterial({ color: '#FE7743', transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
  edge.rotation.x = -Math.PI / 2; edge.renderOrder = 11; pg.add(edge); z.edge = edge;
  z.group.add(pg);
  z.base = new Float32Array(gw * gh);
  for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) {
    z.base[j * gw + i] = (z.night ? 17.5 : 22.4) + 0.5 * Math.sin(i * 0.37 + j * 0.21) * Math.cos(j * 0.43 - i * 0.12) + (j / gh) * 0.6 + rand(-0.15, 0.15);
  }
  if (z.mode === 'accum') z.acc = new Float32Array(gw * gh);

  /* sensors, each with a field-of-view pyramid to the area it covers */
  z.sensors = [];
  var n = z.mounts.length;
  var cols = n === 4 && z.id === 'capacity' ? 2 : n, rows = n === 4 && z.id === 'capacity' ? 2 : 1;
  z.mounts.forEach(function (m, k) {
    var s = makeSensor();
    var p = toWorld(z, m[0], m[1]); p.y = z.y + m[2];
    s.position.copy(p);
    // covered sub-rectangle
    var cw = z.w / cols, cd = z.d / rows, ci = k % cols, cj = (k / cols) | 0;
    var u0 = -z.w / 2 + ci * cw, v0 = -z.d / 2 + cj * cd;
    var aim = toWorld(z, u0 + cw / 2, v0 + cd / 2); aim.y = z.y;
    s.lookAt(aim);
    z.group.add(s); z.sensors.push(s);
    var corners = [[u0, v0], [u0 + cw, v0], [u0 + cw, v0 + cd], [u0, v0 + cd]].map(function (q) { var w = toWorld(z, q[0], q[1]); w.y = z.y + 0.03; return w; });
    var lp = [];
    corners.forEach(function (c) { lp.push(p.x, p.y, p.z, c.x, c.y, c.z); });
    var lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    var lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#FE7743', transparent: true, opacity: 0, depthTest: false, toneMapped: false }));
    lines.renderOrder = 12; z.group.add(lines); (z.fovLines = z.fovLines || []).push(lines);
    var fp = [];
    for (var e = 0; e < 4; e++) { var a = corners[e], b = corners[(e + 1) % 4]; fp.push(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z); }
    var fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    var cone = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: '#FE7743', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
    cone.renderOrder = 9; z.group.add(cone); (z.cones = z.cones || []).push(cone);
  });
}
function toWorld(z, u, v, out) {
  out = out || new THREE.Vector3();
  return out.set(z.c[0] + z.U.x * u + z.V.x * v, z.y, z.c[1] + z.U.z * u + z.V.z * v);
}

/* ---------- agents ---------- */
function spawn(z, u, v, opts) {
  var a = Object.assign({ u: u, v: v, path: [], speed: rand(0.42, 0.62), wait: 0, temp: rand(33, 34.2), seated: false, fig: takeFigure(), done: null, t: Math.random() * 10 }, opts || {});
  z.agents.push(a);
  placeFigure(z, a, 0);
  return a;
}
function kill(z, a) { a.dead = true; dropFigure(a.fig); }
var tmpW = new THREE.Vector3();
function placeFigure(z, a, dx, dv) {
  toWorld(z, a.u, a.v, tmpW);
  a.fig.position.copy(tmpW);
  var walking = a.wait <= 0 && a.path.length > 0;
  a.fig.position.y += walking ? Math.abs(Math.sin(a.t * 9)) * 0.012 : 0;
  var sitting = a.seated && a.wait > 0;
  if (sitting) a.fig.scale.y = 0.72; else if (a.fig.scale.y < 0.85) a.fig.scale.y = 1;
  if (dx || dv) a.fig.rotation.y = Math.atan2(z.U.x * dx + z.V.x * dv, z.U.z * dx + z.V.z * dv);
}
function stepAgents(z, dt) {
  for (var i = 0; i < z.agents.length; i++) {
    var a = z.agents[i];
    if (a.dead) continue;
    a.t += dt;
    var du = 0, dv = 0;
    if (a.wait > 0) a.wait -= dt;
    else if (a.path.length) {
      var p = a.path[0], ex = p[0] - a.u, ev = p[1] - a.v, d = Math.hypot(ex, ev), st = a.speed * dt;
      if (d <= st) {
        a.u = p[0]; a.v = p[1]; a.path.shift();
        if (p[2]) a.wait = p[2];
        if (p[3]) p[3](a);
      } else { du = ex / d * st; dv = ev / d * st; a.u += du; a.v += dv; }
      var pv = a.v - dv;
      if (z.onMove) z.onMove(a, pv);
    } else if (a.done) a.done(a);
    else kill(z, a);
    if (!a.dead) placeFigure(z, a, du, dv);
  }
  z.agents = z.agents.filter(function (a) { return !a.dead; });
}

/* ---------- behaviour per zone ---------- */
var B = {};
B.entrance = {
  init: function (z) { z.stats = { inN: 1184, outN: 1032 }; z.next = 0; },
  tick: function (z, dt) {
    z.next -= dt;
    if (z.next <= 0) {
      z.next = rand(0.6, 1.5);
      var r = Math.random();
      if (r < 0.42) spawn(z, rand(-1.4, 1.4), 1.7, { path: [[rand(-0.3, 0.3), -1.1], [rand(-0.25, 0.25), -1.9]] });
      else if (r < 0.78) spawn(z, rand(-0.25, 0.25), -1.9, { path: [[rand(-0.3, 0.3), -1.0], [rand(-1.5, 1.5), 1.75]] });
      else { var s = Math.random() < 0.5 ? -1 : 1, v = rand(0.3, 1.1); spawn(z, -2 * s, v, { path: [[2 * s, v + rand(-0.3, 0.3)]] }); }
    }
  },
  onMove: function (z, a, pv) {
    var L = -0.75;
    if (pv > L && a.v <= L) z.stats.inN++;
    else if (pv < L && a.v >= L) z.stats.outN++;
  },
  live: function (z) {
    return '<span class="dot"><b>' + inView(z) + '</b> in view</span><span>in today <b>' + fmt(z.stats.inN) + '</b></span><span>out <b>' + fmt(z.stats.outN) + '</b></span>';
  }
};
B.storefront = {
  init: function (z) { z.stats = { passed: 2410, stopped: 388, dwellSum: 388 * 38 }; z.next = 0; },
  tick: function (z, dt) {
    z.next -= dt;
    if (z.next > 0) return;
    z.next = rand(0.7, 1.6);
    var s = Math.random() < 0.5 ? -1 : 1, v = rand(-0.1, 1.05), u0 = -2.1 * s, u1 = 2.1 * s;
    z.stats.passed++;
    if (Math.random() < 0.38) {
      var us = rand(-1.3, 1.3), dwell = rand(3, 10);
      spawn(z, u0, v, { path: [[us, -0.82, dwell, function () { z.stats.stopped++; z.stats.dwellSum += dwell * 6; }], [u1, rand(0, 1)]], stopping: true });
    } else spawn(z, u0, v, { path: [[u1, v + rand(-0.25, 0.25)]] });
  },
  live: function (z) {
    var now = z.agents.filter(function (a) { return a.wait > 0; }).length;
    return '<span class="dot"><b>' + now + '</b> stopped now</span><span>passed today <b>' + fmt(z.stats.passed) + '</b></span><span>stop rate <b>' + Math.round(100 * z.stats.stopped / z.stats.passed) + '%</b></span><span>avg dwell <b>' + Math.round(z.stats.dwellSum / z.stats.stopped) + ' s</b></span>';
  }
};
B.seating = {
  init: function (z) {
    var tables = [[-0.7, -0.34], [0.05, -0.34], [0.9, -0.34], [-0.7, 0.43], [0.05, 0.43]];
    z.seats = [];
    tables.forEach(function (t, ti) { for (var k = 0; k < 3; k++) { var ang = k * 2.09 + ti; z.seats.push({ u: t[0] + Math.cos(ang) * 0.25, v: t[1] + Math.sin(ang) * 0.25, table: ti, busy: false }); } });
    z.stats = { stays: 412, staySum: 412 * 27 };
    z.next = 0;
    // start half full
    z.seats.forEach(function (s) { if (Math.random() < 0.45) sit(z, s, true); });
  },
  tick: function (z, dt) {
    z.next -= dt;
    if (z.next > 0) return;
    z.next = rand(2.4, 4.6);
    var free = z.seats.filter(function (s) { return !s.busy; });
    if (free.length) sit(z, free[(Math.random() * free.length) | 0], false);
  },
  live: function (z) {
    var busy = z.seats.filter(function (s) { return s.busy; }).length;
    var tables = new Set(z.seats.filter(function (s) { return s.busy; }).map(function (s) { return s.table; }));
    return '<span class="dot"><b>' + busy + '/' + z.seats.length + '</b> seats taken</span><span>free tables <b>' + (5 - tables.size) + '</b></span><span>avg stay <b>' + Math.round(z.stats.staySum / z.stats.stays) + ' min</b></span>';
  }
};
function sit(z, s, already) {
  s.busy = true;
  var stay = rand(9, 22);
  var leave = [[s.u + rand(-0.4, 0.4), 1.9]];
  var a = already ? spawn(z, s.u, s.v, { seated: true, wait: rand(2, 14), path: leave }) : spawn(z, rand(-1.5, 1.5), 1.9, { path: [[s.u, s.v, stay, function (ag) { ag.seated = true; }]].concat(leave) });
  var origDone = function () { s.busy = false; z.stats.stays++; z.stats.staySum += stay * 1.6; };
  a.path.forEach(function (p, i) { if (i === a.path.length - 1) p[3] = function (ag) { ag.seated = false; origDone(); }; });
  if (already) a.path.unshift([s.u, s.v, 0, function (ag) { ag.seated = false; }]);
}
B.queue = {
  init: function (z) {
    z.line = []; z.serve = 3; z.next = 0; z.stats = { served: 286 };
    z.hot = [[-1.5, -0.98, 64, 0.09]];   // espresso machine on the counter
    for (var i = 0; i < 4; i++) joinQueue(z, true);
  },
  tick: function (z, dt) {
    z.next -= dt; z.serve -= dt;
    var rate = 1.6 + 1.3 * Math.sin(z.t * 0.12);      // arrivals swell and ease
    if (z.next <= 0) { z.next = rand(rate, rate + 1.6); if (z.line.length < 9) joinQueue(z, false); }
    if (z.serve <= 0 && z.line.length) {
      z.serve = 3.2;
      var a = z.line.shift();
      a.path = [[-1.1, -0.15, 1.2], [1.9, 1.0]];
      z.stats.served++;
      z.line.forEach(function (b, i) { b.path = [[slotU(i), -0.45]]; });
    }
  },
  live: function (z) {
    var n = z.line.length, wait = Math.max(0, Math.round(n * 3.2 * 9 / 60));
    var cls = n >= 7 ? 'alert' : n >= 5 ? 'warn' : 'ok';
    return '<span class="dot"><b>' + n + '</b> in queue</span><span class="' + cls + '">wait ~<b>' + wait + ' min</b></span>' + (n >= 7 ? '<span class="alert">open till 2</span>' : '') + '<span>machine <b>64 °C</b> not counted</span>';
  }
};
function slotU(i) { return -1.1 + i * 0.3; }
function joinQueue(z, instant) {
  var i = z.line.length;
  var a = instant ? spawn(z, slotU(i), -0.45) : spawn(z, 1.9, rand(0.4, 1.1), { path: [[slotU(i), -0.45]] });
  a.done = function () { };   // stay in line until served
  z.line.push(a);
}
B.routes = {
  init: function (z) {
    // walkway centre line (world x, z) turned into zone coordinates
    var pts = [[-15.5, 1.0], [-12.7, -1.3], [-7.9, -6.1], [-4.6, -10.4], [-2.2, -15.2], [0.2, -20], [2.2, -24.5]];
    z.lane = pts.map(function (p) { var dx = p[0] - z.c[0], dz = p[1] - z.c[1]; return [dx * z.U.x + dz * z.U.z, dx * z.V.x + dz * z.V.z]; });
    z.next = 0; z.stats = { walkers: 18640, main: 0, side: 0 };
    for (var k = 0; k < 400; k++) { this.tick(z, 0.1); stepAgents(z, 0.1); accumulate(z, 0.1); }
  },
  tick: function (z, dt) {
    z.next -= dt;
    if (z.next > 0) return;
    z.next = rand(0.35, 0.9);
    var off = (Math.random() < 0.7 ? rand(-0.35, 0.35) : rand(0.6, 1.3)) * (Math.random() < 0.5 ? 1 : -1);
    var path = z.lane.map(function (p) { return [p[0], p[1] + off + rand(-0.12, 0.12)]; });
    if (Math.random() < 0.5) path.reverse();
    if (Math.random() < 0.25) {   // a detour to the cafe terrace
      var cut = 2 + ((Math.random() * 3) | 0);
      path = path.slice(0, cut).concat([[path[cut][0], -1.6, rand(2, 5)]]).concat(path.slice(cut));
      z.stats.side++;
    } else z.stats.main++;
    z.stats.walkers++;
    var a = spawn(z, path[0][0], path[0][1], { path: path.slice(1), speed: rand(0.55, 0.8) });
    a.fig.visible = true;
  },
  live: function (z) {
    var share = Math.round(100 * z.stats.main / Math.max(1, z.stats.main + z.stats.side));
    return '<span class="dot"><b>' + inView(z) + '</b> walking now</span><span>tracked this week <b>' + fmt(z.stats.walkers) + '</b></span><span>stay on the main path <b>' + share + '%</b></span>';
  }
};
B.capacity = {
  init: function (z) { z.next = 0; z.limit = 40; z.stats = { peak: 0 }; z.door = [4.2, -5.8]; for (var i = 0; i < 10; i++) this.add(z, true); },
  add: function (z, instant) {
    var tgt = function () { return [rand(-4.4, 4.4), rand(-6, 6), rand(2, 7)]; };
    var a = instant ? spawn(z, rand(-4.4, 4.4), rand(-6, 6)) : spawn(z, z.door[0], z.door[1]);
    a.path = [tgt(), tgt()];
    a.done = function (ag) { ag.path = ag.leaving ? [] : [tgt()]; if (ag.leaving) kill(z, ag); };
  },
  tick: function (z, dt) {
    var phase = (z.t % 48) / 48;   // the deck fills for 30 s, then empties
    var target = phase < 0.62 ? 10 + phase / 0.62 * 36 : 46 - (phase - 0.62) / 0.38 * 36;
    var n = z.agents.filter(function (a) { return !a.leaving; }).length;
    z.next -= dt;
    if (z.next <= 0) {
      z.next = 0.35;
      if (n < target - 1) this.add(z, false);
      else if (n > target + 1) { var a = z.agents.find(function (x) { return !x.leaving; }); if (a) { a.leaving = true; a.path = [[z.door[0], z.door[1]]]; } }
    }
  },
  live: function (z) {
    var n = z.agents.filter(function (a) { return !a.leaving; }).length, pct = n / z.limit;
    var st = pct >= 1 ? '<span class="alert">limit reached · pause entry</span>' : pct >= 0.8 ? '<span class="warn">80% · warn the team</span>' : '<span class="ok">within limit</span>';
    return '<span class="dot"><b>' + n + ' / ' + z.limit + '</b> on the deck</span>' + st;
  }
};
B.afterhours = {
  init: function (z) { z.stats = {}; z.clock = 23 * 60 + 8; this.walk(z); },
  walk: function (z) {
    var a = spawn(z, -3.4, rand(-1, 1), { speed: 0.32, path: [[-1.2, rand(-1.2, 1.2), 2.5], [0.8, rand(-1.4, 1.4), 1.5], [3.4, rand(-1, 1)]] });
    a.done = function (ag) { kill(z, ag); z.gap = 6; };
  },
  tick: function (z, dt) {
    z.clock += dt * 0.5;
    if (z.gap != null) { z.gap -= dt; if (z.gap <= 0) { z.gap = null; this.walk(z); } }
  },
  live: function (z) {
    var n = inView(z), h = ((z.clock / 60) | 0) % 24, m = (z.clock | 0) % 60;
    var clock = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    return '<span>' + clock + ' · closed</span>' + (n ? '<span class="alert"><b>' + n + '</b> person · alert sent</span>' : '<span class="ok">area clear</span>') + '<span class="alert">chiller motor <b>62 °C</b></span>';
  }
};
function inView(z) {
  return z.agents.filter(function (a) { return Math.abs(a.u) <= z.w / 2 && Math.abs(a.v) <= z.d / 2; }).length;
}

/* ---------- heat rendering ---------- */
function accumulate(z, dt) {
  var gw = z.grid[0], gh = z.grid[1], cw = z.w / gw, ch = z.d / gh, acc = z.acc;
  for (var i = 0; i < acc.length; i++) acc[i] *= Math.pow(0.985, dt * 10);
  z.agents.forEach(function (a) {
    var ci = Math.floor((a.u + z.w / 2) / cw), cj = Math.floor((a.v + z.d / 2) / ch);
    for (var dj = -2; dj <= 2; dj++) for (var di = -2; di <= 2; di++) {
      var x = ci + di, y = cj + dj;
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      acc[y * gw + x] += dt * 0.55 * Math.exp(-(di * di + dj * dj) / 2.2);
    }
  });
}
function paint(z) {
  var gw = z.grid[0], gh = z.grid[1], data = z.img.data, cw = z.w / gw, ch = z.d / gh;
  if (z.mode === 'accum') {
    var acc = z.acc;
    for (var k = 0; k < acc.length; k++) {
      var t = clamp(acc[k] / 1.4, 0, 1), li = (Math.round(60 + t * 195)) * 3;
      data[k * 4] = LUT[li]; data[k * 4 + 1] = LUT[li + 1]; data[k * 4 + 2] = LUT[li + 2];
      data[k * 4 + 3] = Math.round(255 * clamp(t * 2.2, 0, 0.92));
    }
  } else {
    var sig = 0.16, s2 = 2 * sig * sig, src = [];
    z.agents.forEach(function (a) { src.push([a.u, a.v, a.temp, s2]); });
    z.hot.forEach(function (h) { src.push([h[0], h[1], h[2], 2 * h[3] * h[3]]); });
    for (var j = 0; j < gh; j++) {
      var v = -z.d / 2 + (j + 0.5) * ch;
      for (var i = 0; i < gw; i++) {
        var u = -z.w / 2 + (i + 0.5) * cw, b = z.base[j * gw + i], T = b;
        for (var q = 0; q < src.length; q++) {
          var s = src[q], du = u - s[0], dv = v - s[1], dd = du * du + dv * dv;
          if (dd > 0.36) continue;
          var tt = b + (s[2] - b) * Math.exp(-dd / s[3]);
          if (tt > T) T = tt;
        }
        var li2 = Math.round(clamp((T - T_LO) / (T_HI - T_LO), 0, 1) * 255) * 3, o = (j * gw + i) * 4;
        data[o] = LUT[li2]; data[o + 1] = LUT[li2 + 1]; data[o + 2] = LUT[li2 + 2]; data[o + 3] = 255;
      }
    }
  }
  z.ctx.putImageData(z.img, 0, 0);
  z.tex.needsUpdate = true;
}

/* ---------- zone volumes for cooling and leasing ---------- */
var WINGS = [
  { name: 'West wing', c: [-11.6, -13.2], s: [10.6, 4.8, 17.2], y0: 1, tagAt: [-13, 6.6, -16] },
  { name: 'Front wing', c: [-2.8, -2.6], s: [16.6, 3.4, 6.9], y0: 1 },
  { name: 'East wing', c: [3.4, -13.3], s: [5.2, 4.2, 12.9], y0: 1 },
  { name: 'Cafe lane', c: [-5.2, -10.6], s: [3.2, 3.0, 15], y0: 1, rot: 55.4, tagAt: [-1.6, 4.6, -16.5] }
];
var wingGroup = new THREE.Group(); wingGroup.visible = false; scene.add(wingGroup);
WINGS.forEach(function (w) {
  var g = new THREE.BoxGeometry(w.s[0], w.s[1], w.s[2]);
  w.mat = new THREE.MeshBasicMaterial({ color: '#3b7ddd', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  w.lineMat = new THREE.LineBasicMaterial({ color: '#3b7ddd', transparent: true, opacity: 0, toneMapped: false });
  w.mesh = new THREE.Mesh(g, w.mat);
  var e = new THREE.LineSegments(new THREE.EdgesGeometry(g), w.lineMat);
  var grp = new THREE.Group(); grp.add(w.mesh, e);
  grp.position.set(w.c[0], w.y0 + w.s[1] / 2, w.c[1]);
  grp.rotation.y = (w.rot || 0) * Math.PI / 180;
  w.mesh.renderOrder = 8;
  wingGroup.add(grp);
  w.people = 0; w.ac = false; w.offIn = 0; w.why = 'nobody in';
});
var COOL = { t: 0 };
function coolingTick(dt) {
  COOL.t += dt;
  var t = COOL.t;
  var targets = [
    Math.round(38 + 12 * Math.sin(t * 0.25)),
    Math.round(24 + 10 * Math.sin(t * 0.2 + 1)),
    Math.max(0, Math.round(-3 + 9 * Math.sin(t * 0.16 - 1.2))),
    Math.round(16 + 6 * Math.sin(t * 0.3 + 2))
  ];
  WINGS.forEach(function (w, i) {
    w.people += clamp(targets[i] - w.people, -1, 1);
    w.temp = 24.2 + w.people * 0.05;
    if (w.people > 0) { w.ac = true; w.offIn = 6; w.why = w.temp >= 26 ? 'room ' + w.temp.toFixed(1) + ' °C' : 'someone in'; }
    else if (w.ac) { w.offIn -= dt; w.why = 'empty · off in ' + Math.max(0, Math.ceil(w.offIn)) + ' s'; if (w.offIn <= 0) { w.ac = false; w.why = 'nobody in'; } }
  });
}
var LEASE = [9840, 11260, 2130, 7210];

/* ---------- tags (DOM labels pinned to 3D points) ---------- */
var tagHost = document.getElementById('tags'), tags = [];
function addTag(world, show, cls, html) {
  var el = document.createElement('div'); el.className = 'tag ' + (cls || ''); el.innerHTML = html || '';
  tagHost.appendChild(el);
  var t = { el: el, p: world, show: show };
  tags.push(t);
  return t;
}
var proj = new THREE.Vector3();
function placeTags() {
  var W = VW, H = VH;
  tags.forEach(function (t) {
    var on = t.show(), p = typeof t.p === 'function' ? t.p() : t.p;
    if (on) {
      proj.copy(p).project(camera);
      if (proj.z > 1 || proj.z < -1) on = false;
      else {
        // keep labels on screen: clamp the box, and slide the pointer tip to still point at the spot
        var x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H, w = t.el.offsetWidth || 0, m = 8;
        var bx = Math.max(m + w / 2, Math.min(W - m - w / 2, x));
        if (w && Math.abs(bx - x) > 0.5) t.el.style.setProperty('--tip', clamp(50 + (x - bx) / w * 100, 8, 92).toFixed(1) + '%');
        else t.el.style.removeProperty('--tip');
        t.el.style.transform = 'translate(' + bx.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
    }
    if (on !== t.on) { t.on = on; t.el.classList.toggle('on', on); }
  });
}

/* ---------- camera shots and flights ---------- */
var SHOTS = {
  hero: { orbit: { c: V3(-5, 4, -12), r: 56, h: 30, a0: 0.75, w: 0.03 }, fov: 40, shift: 0.24 },
  overview: { pos: V3(-42, 46, 2), look: V3(-4, 0, -11), fov: 42, shift: 0.22 },
  entrance: { pos: V3(-1.8, 4.0, 10.8), look: V3(-5.3, 1.2, 2.2), fov: 44 },
  storefront: { pos: V3(1.4, 3.8, 9.2), look: V3(-1.6, 1.2, 2.0), fov: 44 },
  seating: { pos: V3(-19.5, 4.6, 4.4), look: V3(-13.6, 1.1, -2.4), fov: 44 },
  queue: { pos: V3(-11.4, 5.0, -2.4), look: V3(-4.8, 1.1, -11.8), fov: 46 },
  routes: { pos: V3(-21, 14, 8), look: V3(-6, 1, -10.5), fov: 44 },
  capacity: { pos: V3(-25, 14, -1), look: V3(-9.6, 5.6, -14), fov: 44 },
  cooling: { pos: V3(-30, 40, 16), look: V3(-5, 1, -11), fov: 42 },
  afterhours: { pos: V3(0.5, 9, -40), look: V3(-3.5, 2.4, -24), fov: 46 },
  leasing: { pos: V3(-40, 52, -6), look: V3(-4, 0, -12), fov: 42 },
  privacy: { pos: V3(-3.4, 2.5, 6.6), look: V3(-5.3, 1.3, 1.8), fov: 44, shift: 0 }
};
var cur = { pos: V3(40, 30, 40), look: V3(-5, 2, -12), fov: 40 };
var flight = null, shotName = null, clock = 0, shift = 0, shiftY = 0;
function shotPose(s, t) {
  if (s.orbit) {
    var o = s.orbit, a = o.a0 + (REDUCED ? 0 : t * o.w);
    return { pos: V3(o.c.x + Math.sin(a) * o.r, o.c.y + o.h, o.c.z + Math.cos(a) * o.r), look: o.c.clone(), fov: s.fov };
  }
  return { pos: s.pos.clone(), look: s.look.clone(), fov: s.fov };
}
function flyTo(name) {
  if (name === shotName || !SHOTS[name]) return;
  shotName = name;
  var s = SHOTS[name], to = shotPose(s, clock);
  var d = cur.pos.distanceTo(to.pos);
  if (INSTANT) { flight = null; return; }
  flight = { from: { pos: cur.pos.clone(), look: cur.look.clone(), fov: cur.fov }, t: 0, dur: clamp(d / 16, 1.4, 3.2), lift: Math.min(22, d * 0.22) };
}
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function updateCamera(dt) {
  var s = SHOTS[shotName] || SHOTS.hero, to = shotPose(s, clock);
  var drift = REDUCED ? 0 : 1;
  to.pos.x += Math.sin(clock * 0.21) * 0.12 * drift; to.pos.y += Math.sin(clock * 0.17) * 0.06 * drift;
  if (flight) {
    flight.t += dt / flight.dur;
    var k = ease(Math.min(1, flight.t)), f = flight.from;
    var mid = f.pos.clone().lerp(to.pos, 0.5); mid.y = Math.max(f.pos.y, to.pos.y) + flight.lift;
    var a = f.pos.clone().lerp(mid, k), b = mid.clone().lerp(to.pos, k);
    cur.pos.copy(a.lerp(b, k));
    cur.look.copy(f.look).lerp(to.look, k);
    cur.fov = f.fov + (to.fov - f.fov) * k;
    if (flight.t >= 1) flight = null;
  } else { cur.pos.copy(to.pos); cur.look.copy(to.look); cur.fov = to.fov; }
  camera.position.copy(cur.pos);
  camera.lookAt(cur.look);
  // keep the subject clear of the cards: to the right on wide screens, above the bottom sheet on phones
  var wide = VW > 980, phone = VW <= 760, k = 1 - Math.exp(-dt * 3);
  var wantX = wide ? (s.shift != null ? s.shift : 0.16) : 0;
  var wantY = wide ? 0 : phone ? (s.orbit ? 0.16 : shotName === 'overview' || shotName === 'privacy' ? 0.2 : 0.24) : (s.orbit || shotName === 'overview' ? 0 : 0.14);
  shift += (wantX - shift) * k; shiftY += (wantY - shiftY) * k;
  if (Math.abs(shift) > 0.002 || Math.abs(shiftY) > 0.002) camera.setViewOffset(VW, VH, -shift * VW, shiftY * VH, VW, VH);
  else if (camera.view) camera.clearViewOffset();
  var f = portraitFov(cur.fov);
  if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
}
// a tall phone screen would crop the sides; widen the vertical FOV so the horizontal view stays usable
function portraitFov(fov) {
  var aspect = VW / VH, A0 = 0.82;
  if (aspect >= A0) return fov;
  var t = Math.tan(fov * Math.PI / 360) * A0 / aspect;
  return Math.min(78, Math.atan(t) * 360 / Math.PI);
}

/* ---------- sections drive the shot and the active zone ---------- */
var activeZone = null, night = 0, paused = false;
var sections = Array.prototype.slice.call(document.querySelectorAll('[data-shot]'));
function pickSection() {
  var mid = innerHeight * 0.5, pick = sections[0];
  sections.forEach(function (s) { var r = s.getBoundingClientRect(); if (r.top <= mid) pick = s; });
  if (Q.get('go')) pick = document.getElementById(Q.get('go')) || pick;   // preview a section without scrolling
  flyTo(pick.dataset.shot);
  setZone(pick.dataset.zone || null);
  var solidEl = document.querySelector('.solid'), solid = solidEl.getBoundingClientRect();
  paused = solidEl.offsetParent !== null && solid.top <= 0;
  canvas.style.visibility = paused ? 'hidden' : 'visible';
}
function setZone(id) {
  if (id === activeZone) return;
  activeZone = id;
  document.body.classList.toggle('night', id === 'afterhours');
  var z = ZONES[id];
  if (z && !z.boxes && !z.ready) { z.ready = true; B[id].init(z); paint(z); }
}

/* ---------- surroundings: a gridded ground with a heat pulse, a quiet city, rising warm air ---------- */
var GROUND = {
  uTime: { value: 0 }, uCenter: { value: new THREE.Vector2(-5, -12) }, uPulse: { value: 0.6 },
  uBase: { value: new THREE.Color('#dedad2') }, uLine: { value: new THREE.Color('#c3beb3') }, uHeat: { value: new THREE.Color('#FE7743') }
};
var groundDay = { base: new THREE.Color('#dedad2'), line: new THREE.Color('#c3beb3') };
var groundNight = { base: new THREE.Color('#131e27'), line: new THREE.Color('#25384a') };
var city = null, motes = null;
function buildSurroundings(box) {
  // ground: a huge plane with a hole where the mall model sits (no z-fighting with its own floor)
  var hx0 = box.min.x + 0.6, hx1 = box.max.x - 0.6, hz0 = box.min.z + 0.6, hz1 = box.max.z - 0.6, R = 1200;
  var shape = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R, -R), new THREE.Vector2(R, R), new THREE.Vector2(-R, R)]);
  // Shape lives in XY; rotating -90° about X maps (x, y) to (x, 0, -y)
  shape.holes.push(new THREE.Path([new THREE.Vector2(hx0, -hz0), new THREE.Vector2(hx0, -hz1), new THREE.Vector2(hx1, -hz1), new THREE.Vector2(hx1, -hz0)]));
  var gmat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    fog: true,
    vertexShader: [
      'varying vec3 vW;',
      '#include <fog_pars_vertex>',
      'void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;',
      '#include <fog_vertex>',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform float uTime; uniform vec2 uCenter; uniform float uPulse; uniform vec3 uBase; uniform vec3 uLine; uniform vec3 uHeat;',
      'varying vec3 vW;',
      '#include <fog_pars_fragment>',
      'float grid(vec2 p, float s, float w){ vec2 q = p / s; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y) / w, 1.0); }',
      'void main(){',
      '  vec2 p = vW.xz;',
      '  float minor = grid(p, 3.5, 1.0), major = grid(p, 17.5, 1.6);',
      '  vec3 col = mix(uBase, uLine, minor * 0.45 + major * 0.85);',
      '  float d = length(p - uCenter);',
      '  float ph = fract(uTime * 0.16), r = ph * 150.0;',
      '  float ring = exp(-pow((d - r) / 2.2, 2.0)) * (1.0 - ph) * uPulse;',
      '  float ph2 = fract(uTime * 0.16 + 0.5), r2 = ph2 * 150.0;',
      '  ring += exp(-pow((d - r2) / 2.2, 2.0)) * (1.0 - ph2) * uPulse;',
      '  float glow = exp(-d * d / 900.0) * 0.22 * uPulse;',
      '  col = mix(col, uHeat, clamp(ring * (0.35 + major * 0.65 + minor * 0.3) + glow, 0.0, 0.85));',
      '  gl_FragColor = vec4(col, 1.0);',
      '  #include <colorspace_fragment>',
      '  #include <fog_fragment>',
      '}'
    ].join('\n')
  });
  Object.assign(gmat.uniforms, GROUND);
  var ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), gmat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.renderOrder = -1;
  scene.add(ground);

  // city: instanced blocks on a street grid around the mall, taller with distance
  var cells = [], S = 17.5, M = 9;
  for (var gx = -M; gx <= M; gx++) for (var gz = -M; gz <= M; gz++) {
    var cx = gx * S, cz = gz * S;
    if (cx > box.min.x - 12 && cx < box.max.x + 12 && cz > box.min.z - 12 && cz < box.max.z + 12) continue;
    var dist = Math.hypot(cx, cz);
    if (dist > S * M) continue;
    var per = Math.random() < 0.35 ? 1 : 2;
    for (var b = 0; b < per; b++) cells.push([cx + (per > 1 ? (b ? 3.4 : -3.4) : 0) + rand(-1, 1), cz + rand(-1.5, 1.5), dist, per]);
  }
  var geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  var cmat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, metalness: 0 });
  city = new THREE.InstancedMesh(geo, cmat, cells.length);
  var m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
  var TONES = ['#ece8e0', '#e2ddd3', '#d8d3c9', '#cfd4d6', '#c3cbd0', '#e9e1d6', '#dcd6cc'];
  cells.forEach(function (c, i) {
    var far = clamp((c[2] - 70) / 90, 0, 1);
    var h = rand(3, 9) + far * rand(4, 30) * (Math.random() < 0.25 ? 1.6 : 1);
    var w = c[3] > 1 ? rand(4.5, 6.2) : rand(8, 12.5), d = rand(8, 12.5);
    ps.set(c[0], -0.02, c[1]); sc.set(w, h, d); q.setFromAxisAngle(V3(0, 1, 0), Math.random() < 0.15 ? 0.1 : 0);
    m4.compose(ps, q, sc); city.setMatrixAt(i, m4);
    city.setColorAt(i, col.set(TONES[(Math.random() * TONES.length) | 0]));
  });
  city.instanceMatrix.needsUpdate = true; city.instanceColor.needsUpdate = true;
  city.receiveShadow = false; city.castShadow = false;
  scene.add(city);

  // warm air: soft motes drifting up over the mall
  var N = PHONE ? 140 : 260, pos = new Float32Array(N * 3), spd = new Float32Array(N);
  for (var k = 0; k < N; k++) { pos[k * 3] = rand(box.min.x, box.max.x) * 0.8; pos[k * 3 + 1] = rand(0, 40); pos[k * 3 + 2] = rand(box.min.z, box.max.z) * 0.8; spd[k] = rand(0.6, 1.6); }
  var pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var spr = document.createElement('canvas'); spr.width = spr.height = 64;
  var sx = spr.getContext('2d'), gr = sx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,170,110,1)'); gr.addColorStop(0.35, 'rgba(254,119,67,.6)'); gr.addColorStop(1, 'rgba(254,119,67,0)');
  sx.fillStyle = gr; sx.fillRect(0, 0, 64, 64);
  var pm = new THREE.PointsMaterial({ size: 0.7, map: new THREE.CanvasTexture(spr), transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true, toneMapped: false });
  motes = new THREE.Points(pg, pm); motes.userData.spd = spd; motes.userData.box = box; motes.frustumCulled = false;
  scene.add(motes);
}
function zoneCenter(id) {
  var z = ZONES[id];
  if (z && z.c) return z.c;
  if (id === 'cooling' || id === 'leasing') return [-5, -11];
  return [-5, -12];
}
function surroundingsTick(dt) {
  GROUND.uTime.value += REDUCED ? 0 : dt;
  var c = zoneCenter(activeZone), uc = GROUND.uCenter.value, k = 1 - Math.exp(-dt * 3);
  uc.x += (c[0] - uc.x) * k; uc.y += (c[1] - uc.y) * k;
  var want = activeZone ? 1 : 0.55;
  GROUND.uPulse.value += (want - GROUND.uPulse.value) * k;
  GROUND.uBase.value.copy(groundDay.base).lerp(groundNight.base, night);
  GROUND.uLine.value.copy(groundDay.line).lerp(groundNight.line, night);
  if (city) city.material.color.setScalar(1 - 0.82 * night);
  if (motes && !REDUCED) {
    var p = motes.geometry.attributes.position, a = p.array, s = motes.userData.spd, bx = motes.userData.box;
    for (var i = 0; i < s.length; i++) {
      a[i * 3 + 1] += s[i] * dt;
      a[i * 3] += Math.sin(clock * 0.5 + i) * dt * 0.3;
      if (a[i * 3 + 1] > 42) { a[i * 3 + 1] = rand(0, 3); a[i * 3] = rand(bx.min.x, bx.max.x) * 0.8; a[i * 3 + 2] = rand(bx.min.z, bx.max.z) * 0.8; }
    }
    p.needsUpdate = true;
    motes.material.opacity = 0.4 + 0.45 * night;
  }
}

/* ---------- loading the mall ---------- */
var loaded = false, built = false;
var loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('/views/usecases/mall.glb', function (g) {
  var m = g.scene;
  var box = new THREE.Box3().setFromObject(m), size = box.getSize(V3());
  m.scale.setScalar(120 / Math.max(size.x, size.z));
  box.setFromObject(m);
  var ctr = box.getCenter(V3());
  m.position.sub(V3(ctr.x, box.min.y, ctr.z));
  m.updateMatrixWorld(true);
  m.traverse(function (o) {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    mallMeshes.push(o);
    var mt = o.material;
    if (mt && mt.transparent) o.castShadow = false;
  });
  scene.add(m);
  buildSurroundings(new THREE.Box3().setFromObject(m));
  Object.keys(ZONES).forEach(function (id) { if (!ZONES[id].boxes) buildZone(id, ZONES[id]); });
  buildTags();
  built = true; loaded = true;
  UI.ready();
  if (Q.get('go')) {   // preview mode: show that section's card at the top of the page
    var sec = document.getElementById(Q.get('go'));
    document.querySelectorAll('main > section, .solid').forEach(function (s) { if (s !== sec) s.style.display = 'none'; });
    if (sec) { sec.style.paddingTop = '0'; sec.style.minHeight = '100vh'; }
    pickSection();
    for (var i = 0; i < 120; i++) { clock += 0.05; simulate(0.05); }   // settle the scene before the preview is captured
    paintT = 1; simulate(0.01); liveTick();
  }
  pickSection();
}, function (e) {
  UI.progress(e.loaded, e.total || 16798784);
}, function (err) {
  console.error('mall failed to load', err);
  UI.fail('The 3D mall could not load. Everything else still works.');
});

function buildTags() {
  var lift = function (z, u, v, h) { var p = toWorld(z, u, v); p.y += h; return p; };
  var Z = ZONES, is = function (id) { return function () { return activeZone === id; }; };
  // overview pins, one per use case
  var pins = [[Z.entrance, 0, 0, 1], [Z.storefront, 0, 0, 1], [Z.seating, 0, 0, 1.2], [Z.queue, 0, 0, 1.2], [Z.routes, 6, 0, 1.4], [Z.capacity, 0, 0, 1], null, [Z.afterhours, 0, 0, 1.2], null];
  pins.forEach(function (p, i) {
    var pos = p ? lift(p[0], p[1], p[2], p[3]) : i === 6 ? V3(3.4, 6.5, -13.3) : V3(-2.8, 5.6, -2.6);
    addTag(pos, function () { return shotName === 'overview'; }, 'pin', String(i + 1));
  });
  // entrance: the counting line
  Z.entrance.lineTag = addTag(lift(Z.entrance, 0, -0.75, 0.75), function () { return activeZone === 'entrance' && shotName !== 'privacy'; }, '', '');
  Z.storefront.tagA = addTag(lift(Z.storefront, 0, -0.9, 0.85), is('storefront'), '', '');
  Z.seating.tagA = addTag(lift(Z.seating, 0, 0, 0.95), is('seating'), '', '');
  Z.queue.tagA = addTag(lift(Z.queue, -0.4, -0.45, 0.8), is('queue'), '', '');
  Z.queue.tagB = addTag(lift(Z.queue, -1.5, -0.98, 0.55), is('queue'), 'hot', 'espresso machine <b>64 °C</b>');
  Z.routes.tagA = addTag(lift(Z.routes, 0, 0, 0.9), is('routes'), '', '');
  Z.capacity.tagA = addTag(lift(Z.capacity, 0, 0, 1.2), is('capacity'), '', '');
  Z.afterhours.tagA = addTag(function () {
    var z = Z.afterhours, a = z.agents[0];
    return a ? lift(z, a.u, a.v, 0.75) : lift(z, 0, 0, 0.6);
  }, is('afterhours'), 'hot', '');
  var chiller = V3(-4.3, floorAt(-4.3, -21.7, 6.2) + 0.5, -21.7);
  Z.afterhours.chiller = chiller;
  addTag(chiller.clone().add(V3(0, 0.5, 0)), is('afterhours'), 'hot', 'chiller motor <b>62 °C</b> · rising');
  WINGS.forEach(function (w) {
    w.tag = addTag(w.tagAt ? V3(w.tagAt[0], w.tagAt[1], w.tagAt[2]) : V3(w.c[0], w.y0 + w.s[1] + 0.4, w.c[1]), function () { return activeZone === 'cooling' || activeZone === 'leasing'; }, '', '');
  });
  // hot spot marker on the roof
  var hs = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), new THREE.MeshBasicMaterial({ color: '#ff4a1c', transparent: true, opacity: 0.9, toneMapped: false, depthTest: false }));
  hs.position.copy(chiller); hs.renderOrder = 12;
  Z.afterhours.group.add(hs); Z.afterhours.hotMesh = hs;
}

/* ---------- live text, 4 times a second ---------- */
var liveEls = {};
document.querySelectorAll('[data-live]').forEach(function (el) { (liveEls[el.dataset.live] = liveEls[el.dataset.live] || []).push(el); });
function setLive(id, html) { (liveEls[id] || []).forEach(function (el) { if (el.innerHTML !== html) el.innerHTML = html; }); }
function liveTick() {
  if (!built) return;
  Object.keys(B).forEach(function (id) { var z = ZONES[id]; if (z.ready) setLive(id, B[id].live(z)); });
  var Z = ZONES;
  // feed the card charts
  if (Z.entrance.ready) UI.sample('entrance', Z.entrance.stats.inN);
  if (Z.storefront.ready) UI.sample('storefront', 100 * Z.storefront.stats.stopped / Z.storefront.stats.passed);
  if (Z.seating.ready) UI.sample('seating', Z.seating.seats.filter(function (s) { return s.busy; }).length);
  if (Z.queue.ready) UI.sample('queue', Z.queue.line.length);
  if (Z.routes.ready) UI.sample('routes', 100 * Z.routes.stats.main / Math.max(1, Z.routes.stats.main + Z.routes.stats.side));
  if (Z.capacity.ready) UI.sample('capacity', Z.capacity.agents.filter(function (a) { return !a.leaving; }).length);
  if (Z.entrance.ready) {
    Z.entrance.lineTag.el.innerHTML = 'counting line · in <b>' + fmt(Z.entrance.stats.inN) + '</b> · out <b>' + fmt(Z.entrance.stats.outN) + '</b>';
    setLive('pv', '768 temperatures, ' + inView(Z.entrance) + ' warm patches');
    pvCtx.drawImage(Z.entrance.cv, 0, 0);
  }
  if (Z.storefront.ready) Z.storefront.tagA.el.innerHTML = 'window zone · <b>' + Z.storefront.agents.filter(function (a) { return a.wait > 0; }).length + '</b> stopped';
  if (Z.seating.ready) Z.seating.tagA.el.innerHTML = 'seats taken <b>' + Z.seating.seats.filter(function (s) { return s.busy; }).length + '/' + Z.seating.seats.length + '</b>';
  if (Z.queue.ready) Z.queue.tagA.el.innerHTML = 'queue <b>' + Z.queue.line.length + '</b> · ~' + Math.round(Z.queue.line.length * 3.2 * 9 / 60) + ' min';
  if (Z.routes.ready) Z.routes.tagA.el.innerHTML = '4 sensors · main path <b>' + Math.round(100 * Z.routes.stats.main / Math.max(1, Z.routes.stats.main + Z.routes.stats.side)) + '%</b>';
  if (Z.capacity.ready) { var n = Z.capacity.agents.filter(function (a) { return !a.leaving; }).length; Z.capacity.tagA.el.innerHTML = 'on the deck <b>' + n + ' / 40</b>'; Z.capacity.tagA.el.classList.toggle('hot', n >= 32); }
  if (Z.afterhours.ready) Z.afterhours.tagA.el.innerHTML = inView(Z.afterhours) ? '1 person · closed hours · <b>alert</b>' : 'area clear';
  if (activeZone === 'cooling') {
    WINGS.forEach(function (w) { w.tag.el.className = 'tag on ' + (w.ac ? 'cool' : 'idle'); w.tag.el.innerHTML = w.name + ' · <b>' + w.people + '</b> · AC ' + (w.ac ? 'on' : 'off') + '<br><small>' + w.why + '</small>'; });
    var on = WINGS.filter(function (w) { return w.ac; }).length;
    setLive('cooling', '<span class="dot"><b>' + on + ' / ' + WINGS.length + '</b> zones cooling</span>' + WINGS.map(function (w) { return '<span class="' + (w.ac ? '' : 'ok') + '">' + w.name.toLowerCase() + ' <b>' + w.people + '</b></span>'; }).join(''));
  }
  if (activeZone === 'leasing') {
    var max = Math.max.apply(null, LEASE);
    WINGS.forEach(function (w, i) { w.tag.el.className = 'tag on'; w.tag.el.innerHTML = w.name + ' · <b>' + fmt(LEASE[i]) + '</b> visits / wk'; });
    setLive('leasing', '<span class="dot">busiest <b>Front wing</b></span><span>quietest <b>East wing</b> · ' + Math.round(100 * LEASE[2] / max) + '% of the busiest</span>');
  }
}
setInterval(liveTick, 250);

/* ---------- privacy tile: the sensor's point of view, rendered into the "camera" frame ---------- */
var pvCam = new THREE.PerspectiveCamera(62, 4 / 3, 0.05, 200);
var pvWin = document.querySelector('.pv-window'), pvGrid = document.getElementById('pvgrid'), pvCtx = pvGrid.getContext('2d');

/* ---------- simulation step (zones, night, wing volumes) ---------- */
function simulate(dt) {
  paintT += dt;
  var doPaint = paintT > 0.25; if (doPaint) paintT = 0;
  // night for the after-hours scene
  night += ((activeZone === 'afterhours' ? 1 : 0) - night) * (1 - Math.exp(-dt * 2.5));
  hemi.intensity = 0.95 - 0.86 * night; sun.intensity = 2.3 * (1 - night);
  renderer.toneMappingExposure = 0.95 - 0.3 * night;
  scene.environmentIntensity = 0.55 * (1 - night * 0.8);
  scene.fog.color.copy(DAY_FOG).lerp(NIGHT_FOG, night);

  // zones: simulate the active one, fade the others out
  Object.keys(ZONES).forEach(function (id) {
    var z = ZONES[id];
    if (z.boxes) return;
    var on = id === activeZone || ALL;
    if (ALL && !z.ready) { z.ready = true; B[id].init(z); }
    z.alpha += ((on ? 1 : 0) - z.alpha) * (1 - Math.exp(-dt * 4));
    z.group.visible = z.alpha > 0.01;
    z.agents.forEach(function (a) { a.fig.visible = z.alpha > 0.05; });
    if (!z.ready || !on) return;
    if (ALL && id !== activeZone) { z.t += dt; B[id].tick(z, dt); stepAgents(z, dt); if (z.mode === 'accum') accumulate(z, dt); if (doPaint || z.mode === 'accum') paint(z); return; }
    z.t += dt;
    B[id].tick(z, dt);
    z.onMove = B[id].onMove ? B[id].onMove.bind(null, z) : null;
    stepAgents(z, dt);
    if (z.mode === 'accum') accumulate(z, dt);
    if (doPaint || z.mode === 'accum') paint(z);
  });
  Object.keys(ZONES).forEach(function (id) {
    var z = ZONES[id];
    if (z.boxes || !z.group.visible) return;
    var a = z.alpha;
    z.mat.opacity = 0.86 * a; z.edge.material.opacity = 0.9 * a;
    z.fovLines.forEach(function (l) { l.material.opacity = 0.75 * a; });
    z.cones.forEach(function (c) { c.material.opacity = 0.07 * a; });
    z.sensors.forEach(function (s, i) { var r = s.userData.ring, k = ((clock * 0.8 + i * 0.3) % 1); r.scale.setScalar(1 + k * 2.2); r.material.opacity = (1 - k) * 0.8 * a; });
    if (z.hotMesh) { var p = 0.5 + 0.5 * Math.sin(clock * 5); z.hotMesh.scale.setScalar(0.8 + p * 0.5); z.hotMesh.material.opacity = (0.55 + p * 0.4) * a; }
  });

  // wing volumes
  var boxMode = activeZone === 'cooling' ? 1 : activeZone === 'leasing' ? 2 : 0;
  if (boxMode === 1) coolingTick(dt);
  wingGroup.visible = boxMode > 0 || WINGS[0].mat.opacity > 0.01;
  var maxL = Math.max.apply(null, LEASE);
  WINGS.forEach(function (w, i) {
    var target = 0, col = '#3b7ddd';
    if (boxMode === 1) { target = w.ac ? 0.28 : 0.1; col = w.ac ? '#3b7ddd' : '#8a949c'; }
    if (boxMode === 2) { var r = LEASE[i] / maxL; target = 0.12 + r * 0.35; col = r > 0.75 ? '#FE7743' : r > 0.5 ? '#f3a46c' : '#d9c7b4'; }
    w.mat.opacity += (target - w.mat.opacity) * (1 - Math.exp(-dt * 4));
    w.lineMat.opacity = Math.min(0.9, w.mat.opacity * 3);
    w.mat.color.lerp(new THREE.Color(col), 1 - Math.exp(-dt * 5)); w.lineMat.color.copy(w.mat.color);
  });

  return doPaint;
}

/* ---------- main loop ---------- */
var last = performance.now(), paintT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!loaded || paused) return;
  clock += dt;

  var doPaint = simulate(dt);
  surroundingsTick(dt);
  updateCamera(dt);
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, VW, VH);
  renderer.render(scene, camera);

  // privacy: what a camera at the entrance would see, drawn into the left tile
  var pr = pvWin.getBoundingClientRect();
  if (activeZone === 'entrance' && shotName === 'privacy' && pr.bottom > 0 && pr.top < innerHeight && pr.width > 10) {
    var z = ZONES.entrance, s = z.sensors[0];
    pvCam.position.copy(s.position).add(z.V.clone().multiplyScalar(0.12));
    pvCam.lookAt(toWorld(z, 0, 0.35));
    pvCam.aspect = pr.width / pr.height; pvCam.updateProjectionMatrix();
    var y = VH - pr.bottom;
    renderer.setScissorTest(true);
    renderer.setScissor(pr.left, y, pr.width, pr.height);
    renderer.setViewport(pr.left, y, pr.width, pr.height);
    z.group.visible = false;
    renderer.render(scene, pvCam);
    z.group.visible = true;
    renderer.setScissorTest(false);
  }
  placeTags();
}
requestAnimationFrame(frame);

addEventListener('scroll', function () { if (built) pickSection(); }, { passive: true });
addEventListener('resize', function () {
  if (!sizeStage()) return;
  camera.aspect = VW / VH; camera.updateProjectionMatrix();
});

// smooth in-page jumps for the use-case index
document.querySelectorAll('a[href^="#"]').forEach(function (a) {
  a.addEventListener('click', function (e) {
    var t = document.querySelector(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    t.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', a.getAttribute('href'));
  });
});
