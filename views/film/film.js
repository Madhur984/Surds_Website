/* SURDS Thermal: the cinematic tutorial.
 *
 * A real-time mall atrium in three.js. The SURDS Thermal sensor is mounted on its
 * left wall, connected over Bluetooth, and then shown at work, chapter by chapter,
 * with captions and (optionally) the browser's speech engine reading them aloud.
 *
 * How it hangs together:
 *   CHAPTERS  each chapter sets the world to a known state (setup) and then plays
 *             its lines in order; a line may move the camera (shot) and trigger an
 *             action (act). Jumping to any chapter is therefore always consistent.
 *   world     crowd size, thermal vision, night, AC, HUD numbers... all plain state
 *             that the frame loop eases toward.
 *   thermal   every mesh carries a temperature (userData.temp, inherited); thermal
 *             vision swaps materials for ironbow colours and renders at a very low
 *             pixel ratio with pixelated upscaling, like the sensor's 32x24 grid.
 * Shoppers are the posed figures from /explore (people.glb + makePerson()).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadPeople, makePerson } from '/views/explore/people.js?v=2';
import { buildSensor, applyFinish } from '/views/film/sensor-model.js';

var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s) { return document.querySelector(s); };
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
var V = function (x, y, z) { return new THREE.Vector3(x, y, z); };

/* ================================================================ renderer */
var canvas = $('#stage');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
var DPR = Math.min(window.devicePixelRatio, 1.75);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

var scene = new THREE.Scene();
var DAY_BG = new THREE.Color('#dfe3e8'), NIGHT_BG = new THREE.Color('#0d1520'), THERMAL_BG = new THREE.Color('#0b0618');
scene.background = DAY_BG.clone();
scene.fog = new THREE.Fog(DAY_BG.clone(), 45, 110);
var pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;

var camera = new THREE.PerspectiveCamera(40, 1, 0.02, 220);
var hemi = new THREE.HemisphereLight(0xfff4e6, 0x9aa3ad, 1.05); scene.add(hemi);
var sun = new THREE.DirectionalLight(0xfff0dc, 1.7);
sun.position.set(14, 26, 12); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 20, bottom: -20, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
scene.add(sun);

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ================================================================ helpers */
function std(color, rough, extra) { return new THREE.MeshStandardMaterial(Object.assign({ color: color, roughness: rough == null ? 0.7 : rough, metalness: 0 }, extra || {})); }
function add(parent, geo, mat, x, y, z, temp) {
  var m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0);
  m.castShadow = true; m.receiveShadow = true;
  if (temp != null) m.userData.temp = temp;
  parent.add(m); return m;
}
function canvasTex(w, h, draw) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function signTex(text, bg, fg) {
  return canvasTex(512, 112, function (g, w, h) {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = '700 58px "Space Grotesk", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3);
  });
}

/* ================================================================ the mall */
var mall = new THREE.Group(); scene.add(mall);
var WALL_X = -16, BACK_Z = -12, SLAB_Y = 5, SLAB_Z = -8.5;

// polished stone floor
var floorTex = canvasTex(1024, 1024, function (g, w) {
  g.fillStyle = '#ece7df'; g.fillRect(0, 0, w, w);
  for (var i = 0; i < 9000; i++) { g.fillStyle = 'rgba(120,100,80,' + (Math.random() * 0.05) + ')'; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); }
  g.strokeStyle = '#d3cabd'; g.lineWidth = 4;
  for (var k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * w / 4, 0); g.lineTo(k * w / 4, w); g.stroke(); g.beginPath(); g.moveTo(0, k * w / 4); g.lineTo(w, k * w / 4); g.stroke(); }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(8, 6);
var floor = add(mall, new THREE.PlaneGeometry(64, 48), std(0xffffff, 0.32, { map: floorTex }), 0, 0, 0, 22);
floor.rotation.x = -Math.PI / 2; floor.castShadow = false;

var wallMat = std(0xf4f1ec, 0.85), trimMat = std(0x2f3a44, 0.6), glassMat = new THREE.MeshPhysicalMaterial({ color: 0xcfe3ee, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.22, metalness: 0.1 });
add(mall, new THREE.BoxGeometry(0.4, 10, 26), wallMat, WALL_X - 0.2, 5, 0, 23);                 // left wall (the sensor's)
add(mall, new THREE.BoxGeometry(33, 10, 0.4), wallMat, 0, 5, BACK_Z - 0.2, 23);                  // back wall
var curtain = add(mall, new THREE.BoxGeometry(0.15, 10, 26), glassMat, 16.1, 5, 0, 21);           // right glass curtain wall
curtain.castShadow = false;
for (var mz = -12; mz <= 12; mz += 4) add(mall, new THREE.BoxGeometry(0.22, 10, 0.18), wallMat, 16.1, 5, mz, 23);
add(mall, new THREE.BoxGeometry(0.3, 0.4, 26), wallMat, 16.1, 9.8, 0, 23);

// left wall dressing: skirting, a timber band, lit ad panels and a mall directory
add(mall, new THREE.BoxGeometry(0.06, 0.14, 26), trimMat, WALL_X + 0.03, 0.07, 0, 23);
add(mall, new THREE.BoxGeometry(0.05, 0.9, 26), std(0xb08560, 0.6), WALL_X + 0.03, 2.9, 0, 23);
[[6.5, 'NEW SEASON', '#FE7743'], [-9.5, 'OPEN LATE', '#273F4F']].forEach(function (a) {
  var lb = add(mall, new THREE.PlaneGeometry(2.4, 1.5), std(0xffffff, 0.4, { map: signTex(a[1], a[2], '#ffffff'), emissive: 0xffffff, emissiveIntensity: 0.25 }), WALL_X + 0.05, 1.5, a[0], 26);
  lb.material.emissiveMap = lb.material.map; lb.rotation.y = Math.PI / 2; lb.castShadow = false;
});
var dir = add(mall, new THREE.PlaneGeometry(1.2, 1.9), std(0xffffff, 0.5, { map: canvasTex(240, 380, function (g, w, h) { g.fillStyle = '#273F4F'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '700 30px Arial'; g.fillText('MALL MAP', 26, 50); g.fillStyle = '#FE7743'; g.fillRect(26, 70, 188, 6); ['Level 0  Café · Books', 'Level 0  Style · Tech', 'Level 1  Sports · Home', 'Level 1  Kids · Games'].forEach(function (t, i) { g.fillStyle = '#dfe6ea'; g.font = '600 17px Arial'; g.fillText(t, 26, 120 + i * 48); }); }) }), WALL_X + 0.05, 1.3, 1.2, 25);
dir.rotation.y = Math.PI / 2; dir.castShadow = false;

// mezzanine slab, fascia, glass railing, columns
add(mall, new THREE.BoxGeometry(32, 0.45, 3.5), wallMat, 0, SLAB_Y, (BACK_Z + SLAB_Z) / 2, 23);
add(mall, new THREE.BoxGeometry(32, 0.5, 0.12), trimMat, 0, SLAB_Y - 0.1, SLAB_Z + 0.02, 23);
var rail = add(mall, new THREE.BoxGeometry(32, 1.1, 0.05), glassMat, 0, SLAB_Y + 0.78, SLAB_Z + 0.1, 22); rail.castShadow = false;
[-12, -4, 4, 12].forEach(function (x) { add(mall, new THREE.CylinderGeometry(0.32, 0.32, SLAB_Y, 24), wallMat, x, SLAB_Y / 2, SLAB_Z + 0.3, 23); });

// shopfronts: lit interiors, glass, signs (ground floor and mezzanine)
var SHOPS = [['CAFÉ', '#3a2a22', '#ffd9b0'], ['BOOKS', '#273F4F', '#ffffff'], ['STYLE', '#111111', '#f2f2f2'], ['TECH', '#1d2a3a', '#7fd3ff'], ['FOOD HALL', '#FE7743', '#ffffff']];
var UPPER = [['SPORTS', '#2c5f4f', '#fff'], ['HOME', '#efeeea', '#273F4F'], ['KIDS', '#ffcf4d', '#273F4F'], ['BEAUTY', '#c03a5a', '#fff'], ['GAMES', '#3b2a6b', '#fff']];
var signMats = [];
function shopRow(list, y0, h, zFront) {
  list.forEach(function (s, i) {
    var x = -12.8 + i * 6.4;
    var inside = add(mall, new THREE.PlaneGeometry(5.6, h - 0.4), std(0xfff3df, 0.9, { emissive: 0xffe2b8, emissiveIntensity: 0.55 }), x, y0 + (h - 0.4) / 2, BACK_Z + 0.02, 27);
    inside.castShadow = false;
    for (var k = 0; k < 3; k++) add(mall, new THREE.BoxGeometry(1.2, 1.4 + k * 0.3, 0.5), std([0xd9c7b0, 0xb9c9d6, 0xe3d1d6][k], 0.8), x - 1.6 + k * 1.6, y0 + 0.7 + k * 0.15, BACK_Z + 0.6, 24);
    var g = add(mall, new THREE.PlaneGeometry(5.6, h - 0.5), glassMat, x, y0 + (h - 0.5) / 2, zFront, 22); g.castShadow = false;
    add(mall, new THREE.BoxGeometry(0.12, h, 0.12), trimMat, x - 2.85, y0 + h / 2, zFront, 23);
    var sm = std(0xffffff, 0.5, { map: signTex(s[0], s[1], s[2]), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.0 });
    sm.emissiveMap = sm.map; sm.emissiveIntensity = 0.35; signMats.push(sm);
    var sign = add(mall, new THREE.PlaneGeometry(4.2, 0.92), sm, x, y0 + h - 0.05, zFront + 0.03, 26); sign.castShadow = false;
  });
}
shopRow(SHOPS, 0, 4.4, BACK_Z + 2.4);
shopRow(UPPER, SLAB_Y + 0.25, 3.6, BACK_Z + 0.9);
var interiorMats = []; mall.traverse(function (o) { if (o.isMesh && o.material.emissiveIntensity === 0.55) interiorMats.push(o.material); });

// café kiosk with its espresso machine (a heat source the sensor must ignore)
var cafe = new THREE.Group(); cafe.position.set(-6, 0, 2.6); mall.add(cafe);
add(cafe, new RoundedBoxGeometry(3.2, 1.1, 1.3, 3, 0.08), std(0x8a5a3c, 0.55), 0, 0.55, 0, 23);
add(cafe, new THREE.BoxGeometry(3.3, 0.06, 1.4), std(0xf4f1ec, 0.3), 0, 1.13, 0, 23);
var espresso = add(cafe, new RoundedBoxGeometry(0.62, 0.48, 0.42, 2, 0.05), std(0xb8bcc2, 0.25, { metalness: 0.8 }), -0.8, 1.4, 0, 74);
add(cafe, new THREE.BoxGeometry(0.06, 2.2, 0.06), trimMat, 1.5, 1.1, 0, 23);
var cafeSign = add(cafe, new THREE.PlaneGeometry(1.6, 0.5), std(0xffffff, 0.5, { map: signTex('espresso bar', '#273F4F', '#FE7743') }), 1.5, 2.4, 0.04, 24);

// sunlit patch under a skylight (another warm thing that is not a person)
var sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 4), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.38, depthWrite: false }));
sunPatch.rotation.x = -Math.PI / 2; sunPatch.position.set(2.6, 0.012, -1.2); sunPatch.userData.temp = 29.5; mall.add(sunPatch);

// escalator to the mezzanine, with its drive motor housing at the foot
var esc = new THREE.Group(); esc.position.set(11.6, 0, 0); mall.add(esc);
var run = Math.hypot(SLAB_Y, 10.2), ang = Math.atan2(SLAB_Y, 10.2);
var truss = add(esc, new THREE.BoxGeometry(1.5, 0.5, run), std(0x9aa3ad, 0.4, { metalness: 0.6 }), 0, SLAB_Y / 2, -3.4, 26);
truss.rotation.x = ang;
var steps = add(esc, new THREE.BoxGeometry(1.1, 0.06, run), std(0x2a2f36, 0.5), 0, SLAB_Y / 2 + 0.28, -3.4, 25); steps.rotation.x = ang;
[-0.72, 0.72].forEach(function (dx) { var s = add(esc, new THREE.BoxGeometry(0.05, 0.9, run), glassMat, dx, SLAB_Y / 2 + 0.75, -3.4, 22); s.rotation.x = ang; s.castShadow = false; });
var motor = add(esc, new RoundedBoxGeometry(1.6, 0.7, 1.2, 2, 0.08), std(0x7d858f, 0.45, { metalness: 0.5 }), 0, 0.35, 2.4, 38);

// benches and planters
[[2, 5.2], [-1.5, 7.4], [7, 6]].forEach(function (p) { add(mall, new RoundedBoxGeometry(2.2, 0.45, 0.7, 2, 0.06), std(0x6f4f3a, 0.6), p[0], 0.45, p[1], 23); });
[[4.5, -5.5], [-11, 6.5], [10, 8.6], [-2, -5.8]].forEach(function (p) {
  add(mall, new THREE.CylinderGeometry(0.55, 0.45, 0.8, 24), std(0xe9e4dc, 0.7), p[0], 0.4, p[1], 23);
  var f = add(mall, new THREE.IcosahedronGeometry(0.85, 1), std(0x4f7a3f, 0.9, { flatShading: true }), p[0], 1.45, p[1], 24);
  f.scale.y = 1.25;
});

// split AC unit hung from the mezzanine fascia, facing the atrium
var acUnit = new THREE.Group(); acUnit.position.set(WALL_X + 0.2, 6.3, -7.2); acUnit.rotation.y = Math.PI / 2; acUnit.scale.setScalar(1.35); mall.add(acUnit);
add(acUnit, new RoundedBoxGeometry(1.9, 0.52, 0.34, 3, 0.1), std(0xf7f7f5, 0.35), 0, 0, 0, 19);
add(acUnit, new THREE.BoxGeometry(1.6, 0.05, 0.02), std(0x9aa1ab, 0.5), 0, 0.12, 0.172, 19);
var flapPivot = new THREE.Group(); flapPivot.position.set(0, -0.2, 0.15); acUnit.add(flapPivot);
add(flapPivot, new THREE.BoxGeometry(1.6, 0.04, 0.16), std(0xe6e7e8, 0.4), 0, 0, 0.06, 19);
var acLed = add(acUnit, new THREE.SphereGeometry(0.018, 10, 6), std(0x222222, 0.4, { emissive: 0x3b7ddd, emissiveIntensity: 0 }), 0.78, 0.04, 0.172, 19);

// Wi-Fi access point on the left wall
var router = new THREE.Group(); router.position.set(WALL_X + 0.1, 6.4, 4.5); mall.add(router);
add(router, new RoundedBoxGeometry(0.12, 0.36, 0.36, 2, 0.04), std(0xffffff, 0.4), 0.06, 0, 0, 30);
var routerLed = add(router, new THREE.SphereGeometry(0.02, 8, 6), std(0x111111, 0.4, { emissive: 0x3aa76d, emissiveIntensity: 1.6 }), 0.13, 0.1, 0, 30);

// the floating Bloom screen used in the last chapter
var screenTexLive = new THREE.TextureLoader().load('/views/tutorial/img/bloom-live.webp');
screenTexLive.colorSpace = THREE.SRGBColorSpace;
var screenTexAnalytics = canvasTex(1440, 900, drawAnalytics);
var screen = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 6), new THREE.MeshBasicMaterial({ map: screenTexLive, toneMapped: false, transparent: true, opacity: 0 }));
screen.position.set(0, 6.6, 1.2); screen.userData.noThermal = true; screen.visible = false; scene.add(screen);

function drawAnalytics(g, w, h) {
  g.fillStyle = '#eef0f5'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#23272e'; g.font = '700 44px Arial'; g.fillText('Bloom', 70, 90);
  g.fillStyle = '#6b7280'; g.font = '600 20px Arial'; g.fillText('ANALYTICS · MALL ATRIUM · 24 h', 70, 124);
  ['Room now 24.6 °C', 'People now 14', 'In the room 11 h', 'AC on 7.5 h'].forEach(function (t, i) {
    g.fillStyle = '#ffffff'; g.fillRect(70 + i * 330, 160, 300, 110);
    g.fillStyle = '#23272e'; g.font = '700 30px Arial'; g.fillText(t.split(' ').slice(-2).join(' '), 92 + i * 330, 245);
    g.fillStyle = '#6b7280'; g.font = '600 18px Arial'; g.fillText(t.split(' ').slice(0, -2).join(' '), 92 + i * 330, 196);
  });
  function panel(y, hh) { g.fillStyle = '#ffffff'; g.fillRect(70, y, w - 140, hh); }
  panel(300, 330); panel(650, 200);
  g.fillStyle = '#23272e'; g.font = '700 24px Arial'; g.fillText('Room and people temperature', 96, 340); g.fillText('People in the room, and when the AC ran', 96, 690);
  var X = function (i) { return 110 + i * (w - 260) / 95; };
  g.setLineDash([10, 8]); g.strokeStyle = '#3b7ddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(110, 470); g.lineTo(w - 150, 470); g.stroke(); g.setLineDash([]);
  g.lineWidth = 4; g.strokeStyle = '#3b7ddd'; g.beginPath();
  for (var i = 0; i < 96; i++) { var day = i > 36 && i < 84, v = 520 - (day ? 70 + Math.sin(i / 4) * 18 : 20) ; i ? g.lineTo(X(i), v) : g.moveTo(X(i), v); } g.stroke();
  g.strokeStyle = '#FE7743'; g.beginPath(); var pen = false;
  for (i = 0; i < 96; i++) { if (i < 34 || i > 86) { pen = false; continue; } var v2 = 400 - Math.sin(i / 3) * 12; pen ? g.lineTo(X(i), v2) : g.moveTo(X(i), v2); pen = true; } g.stroke();
  g.fillStyle = 'rgba(160,168,180,.55)'; g.beginPath(); g.moveTo(X(0), 820);
  for (i = 0; i < 96; i++) { var n = i < 34 || i > 86 ? 0 : 40 + 50 * Math.abs(Math.sin(i / 7)); g.lineTo(X(i), 820 - n); } g.lineTo(X(95), 820); g.fill();
  g.fillStyle = 'rgba(59,125,221,.6)'; g.fillRect(X(40), 828, X(82) - X(40), 14);
}

/* ================================================================ the sensor, on the left wall */
applyFinish('ember');
var SENSOR_POS = V(WALL_X, 4.4, -2);
var SCALE = 0.07;
var sensor = buildSensor();
var rig = new THREE.Group(); rig.rotation.y = Math.PI / 2; rig.scale.setScalar(SCALE); scene.add(rig);
rig.add(sensor.root);
sensor.irBeam.visible = sensor.fov.visible = false;
sensor.root.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.userData.temp = 30; } });
rig.position.copy(SENSOR_POS);
rig.updateMatrixWorld(true);
var rb = new THREE.Box3().setFromObject(rig);
rig.position.x += WALL_X + 0.004 - rb.min.x;                    // plate flush on the wall
var plateParts = sensor.root.children.filter(function (c) { return c !== sensor.body; });
var plateHome = plateParts.map(function (p) { return p.position.clone(); });
var bodyHome = sensor.body.position.clone();
var SENSOR_EYE = new THREE.Vector3(); rig.updateMatrixWorld(true);
sensor.body.localToWorld(SENSOR_EYE.set(0, 0, 0.4));

/* ================================================================ effects */
// pulses travelling along a gentle arc (Bluetooth, Wi-Fi, infrared)
var pulses = [];
function pulseLine(from, to, color, opts) {
  opts = opts || {};
  var n = opts.n || 10, mid = from.clone().lerp(to, 0.5).add(V(0, opts.arc == null ? 0.35 : opts.arc, 0));
  var curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
  var mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(opts.size || 0.035, 10, 8), new THREE.MeshBasicMaterial({ color: color, transparent: true, toneMapped: false }), n);
  mesh.userData.noThermal = true; mesh.frustumCulled = false;
  scene.add(mesh);
  var p = { mesh: mesh, curve: curve, n: n, t0: performance.now(), dur: opts.dur || 2600, speed: opts.speed || 0.6 };
  pulses.push(p); return p;
}
var tmpM = new THREE.Matrix4(), tmpV = new THREE.Vector3();
function updatePulses(now) {
  for (var i = pulses.length - 1; i >= 0; i--) {
    var p = pulses[i], age = now - p.t0, life = age / p.dur;
    if (life >= 1) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); pulses.splice(i, 1); continue; }
    for (var k = 0; k < p.n; k++) {
      var u = ((age / 1000) * p.speed + k / p.n) % 1;
      p.curve.getPoint(u, tmpV);
      var s = Math.sin(u * Math.PI) * (life < 0.85 ? 1 : (1 - life) / 0.15);
      tmpM.makeScale(s, s, s).setPosition(tmpV);
      p.mesh.setMatrixAt(k, tmpM);
    }
    p.mesh.instanceMatrix.needsUpdate = true;
  }
}

// cold air from the AC
var AIR_N = 260, airGeo = new THREE.BufferGeometry(), airPos = new Float32Array(AIR_N * 3), airLife = new Float32Array(AIR_N);
airGeo.setAttribute('position', new THREE.BufferAttribute(airPos, 3));
var air = new THREE.Points(airGeo, new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.07, transparent: true, opacity: 0, depthWrite: false }));
air.userData.noThermal = true; air.frustumCulled = false; scene.add(air);
var acOrigin = new THREE.Vector3(), acFwd = new THREE.Vector3(), acSide = new THREE.Vector3();
acUnit.updateMatrixWorld(true); acUnit.localToWorld(acOrigin.set(0, -0.25, 0.25));
acFwd.set(0, 0, 1).transformDirection(acUnit.matrixWorld); acSide.set(1, 0, 0).transformDirection(acUnit.matrixWorld);
for (var ai = 0; ai < AIR_N; ai++) airLife[ai] = Math.random();
function updateAir(dt, on) {
  air.material.opacity = lerp(air.material.opacity, on ? 0.55 : 0, 1 - Math.pow(0.02, dt));
  if (air.material.opacity < 0.01) return;
  for (var i = 0; i < AIR_N; i++) {
    airLife[i] += dt * 0.35;
    if (airLife[i] > 1) airLife[i] -= 1;
    var l = airLife[i], seed = i * 12.9898;
    var side = Math.sin(seed) * 1.05 + Math.sin(seed * 3 + l * 6) * 0.15 * l, fwd = l * 3.6 + Math.cos(seed * 2) * 0.3 * l;
    airPos[i * 3] = acOrigin.x + acSide.x * side + acFwd.x * fwd;
    airPos[i * 3 + 1] = acOrigin.y - l * 3.0;
    airPos[i * 3 + 2] = acOrigin.z + acSide.z * side + acFwd.z * fwd;
  }
  airGeo.attributes.position.needsUpdate = true;
}

// footfall heatmap on the floor
var HM = document.createElement('canvas'); HM.width = 512; HM.height = 384;
var hmg = HM.getContext('2d'), hmTex = new THREE.CanvasTexture(HM);
var heatmap = new THREE.Mesh(new THREE.PlaneGeometry(32, 24), new THREE.MeshBasicMaterial({ map: hmTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
heatmap.rotation.x = -Math.PI / 2; heatmap.position.set(0, 0.03, 0); heatmap.userData.noThermal = true; heatmap.visible = false; scene.add(heatmap);
var hmAcc = new Float32Array(64 * 48);
function stampHeat(x, z, w) {
  var cx = Math.round((x + 16) / 32 * 63), cz = Math.round((z + 12) / 24 * 47);
  for (var dz = -2; dz <= 2; dz++) for (var dx = -2; dx <= 2; dx++) {
    var X = cx + dx, Z = cz + dz; if (X < 0 || Z < 0 || X > 63 || Z > 47) continue;
    hmAcc[Z * 64 + X] += w * Math.exp(-(dx * dx + dz * dz) / 2.2);
  }
}
function paintHeatmap() {
  var max = 0; for (var i = 0; i < hmAcc.length; i++) max = Math.max(max, hmAcc[i]);
  hmg.clearRect(0, 0, 512, 384);
  for (var z = 0; z < 48; z++) for (var x = 0; x < 64; x++) {
    var v = Math.pow(hmAcc[z * 64 + x] / (max || 1), 0.6); if (v < 0.04) continue;
    hmg.fillStyle = ironbowCss(0.25 + v * 0.75, 0.25 + v * 0.6);
    hmg.fillRect(x * 8, z * 8, 8, 8);
  }
  hmTex.needsUpdate = true;
}

// orientation gizmo: three arrows from the sensor
var gizmo = new THREE.Group(); gizmo.userData.noThermal = true; scene.add(gizmo); gizmo.visible = false;
[[V(1, 0, 0), 0xff5a4f], [V(0, 1, 0), 0x3aa76d], [V(0, 0, 1), 0x3b7ddd]].forEach(function (a) {
  var arrow = new THREE.ArrowHelper(a[0], V(0, 0, 0), 0.2, a[1], 0.05, 0.03);
  arrow.traverse(function (o) { if (o.material) { o.material.depthTest = false; o.material.toneMapped = false; } o.renderOrder = 5; });
  gizmo.add(arrow);
});
gizmo.position.copy(SENSOR_EYE).add(V(0.12, 0, 0));

// "Rotate view" panel: a tiny screen beside the sensor whose arrow turns in quarter steps
var rotPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshBasicMaterial({ map: canvasTex(256, 196, function (g, w, h) {
  g.fillStyle = '#0b0618'; g.fillRect(0, 0, w, h);
  var gr = g.createRadialGradient(w / 2, h * 0.62, 4, w / 2, h * 0.62, 42); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(0.5, '#f26a1b'); gr.addColorStop(1, 'rgba(60,10,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, h * 0.86); g.lineTo(w / 2, h * 0.25); g.stroke();
  g.beginPath(); g.moveTo(w / 2 - 18, h * 0.38); g.lineTo(w / 2, h * 0.22); g.lineTo(w / 2 + 18, h * 0.38); g.stroke();
  g.fillStyle = '#fff'; g.font = '700 18px Arial'; g.textAlign = 'center'; g.fillText('door', w / 2, h - 6);
}), toneMapped: false }));
rotPanel.userData.noThermal = true; rotPanel.visible = false;
rotPanel.position.copy(SENSOR_EYE).add(V(0.12, 0.42, -0.62)); rotPanel.rotation.y = Math.PI / 2 - 0.35; scene.add(rotPanel);

// ghost sensors for the "zones" chapter
var ghostSensors = [];
[[V(15.95, 4.4, 4), -Math.PI / 2], [V(1, 4.0, SLAB_Z + 0.1), 0]].forEach(function (g) {
  var s = buildSensor(); s.irBeam.visible = s.fov.visible = false;
  var r = new THREE.Group(); r.add(s.root); r.scale.setScalar(SCALE * 1.6); r.position.copy(g[0]); r.rotation.y = g[1];
  r.visible = false; scene.add(r); ghostSensors.push(r);
});
var zones = [
  { name: 'Zone A', x0: -16, x1: -4, color: 0xFE7743 }, { name: 'Zone B', x0: -4, x1: 6, color: 0x3b7ddd }, { name: 'Zone C', x0: 6, x1: 16, color: 0x9aa1ab }
].map(function (z) {
  var m = new THREE.Mesh(new THREE.PlaneGeometry(z.x1 - z.x0 - 0.3, 20), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set((z.x0 + z.x1) / 2, 0.04, 1.5); m.userData.noThermal = true; m.visible = false; scene.add(m);
  z.mesh = m; return z;
});

/* ================================================================ thermal vision */
var IRON = [[0, [8, 6, 30]], [0.18, [40, 12, 110]], [0.36, [120, 20, 150]], [0.52, [205, 40, 90]], [0.66, [240, 95, 30]], [0.8, [252, 170, 40]], [0.92, [255, 225, 120]], [1, [255, 252, 230]]];
function ironbowRGB(t) {
  t = clamp(t, 0, 1); var k = 0; while (k < IRON.length - 2 && t > IRON[k + 1][0]) k++;
  var a = IRON[k], b = IRON[k + 1], f = (t - a[0]) / (b[0] - a[0]);
  return [0, 1, 2].map(function (c) { return Math.round(a[1][c] + (b[1][c] - a[1][c]) * f); });
}
function ironbowCss(t, alpha) { var c = ironbowRGB(t); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')'; }
var T_LO = 16, T_HI = 40, thermalCache = {};
function thermalMat(temp) {
  var key = Math.round(temp * 2) / 2;
  if (!thermalCache[key]) {
    var c = ironbowRGB((key - T_LO) / (T_HI - T_LO));
    thermalCache[key] = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace) });
  }
  return thermalCache[key];
}
var SKIN_HEX = [0x8d5a3b, 0xc68b62, 0xe0b08a, 0xf0c9a6, 0x5e3a26, 0xa8724f, 0xd49c78];
function tempOf(o) {
  for (var p = o; p; p = p.parent) {
    if (p.userData.temp != null) return p.userData.temp;
    if (p.userData.isPerson) return o.material && o.material.color && SKIN_HEX.indexOf(o.material.color.getHex()) >= 0 ? 34.5 : 31.5;
  }
  return 22.5;
}
var world = { thermal: false };
function setThermal(on) {
  if (world.thermal === on) return;
  world.thermal = on;
  $('#scanline').classList.remove('go'); void $('#scanline').offsetWidth; $('#scanline').classList.add('go');
  scene.traverse(function (o) {
    if (!o.isMesh && !o.isInstancedMesh) return;
    if (skipThermal(o)) return;
    if (on) { if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = thermalMat(tempOf(o) + (o.userData.jitter || 0)); }
    else if (o.userData.mat0) o.material = o.userData.mat0;
  });
  renderer.setPixelRatio(on ? Math.max(0.07, 220 / window.innerWidth) : DPR);
  canvas.classList.toggle('thermal', on);
  renderer.toneMapping = on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  resize();
}
function skipThermal(o) { for (var p = o; p; p = p.parent) if (p.userData.noThermal) return true; return false; }
function refreshThermalTemps() {   // after a temperature changes while thermal vision is on
  if (!world.thermal) return;
  scene.traverse(function (o) { if ((o.isMesh || o.isInstancedMesh) && o.userData.mat0 && !skipThermal(o)) o.material = thermalMat(tempOf(o) + (o.userData.jitter || 0)); });
}

/* ================================================================ people */
var walkers = [], specials = {};
var WAYPOINTS = [[-12, 6], [-8, -5], [-2, -6], [3, -4], [8, -5], [6, 3], [1, 8], [-4, 9], [-10, 1], [9, 9], [-13, -6], [2, 0], [-3, 5], [11, -6]];
function rnd(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function setupPeople() {
  for (var i = 0; i < 26; i++) {
    var p = makePerson({ pose: 'walk', seed: i + 3 });
    p.userData.isPerson = true;
    p.traverse(function (o) { if (o.isMesh) o.userData.jitter = (rnd(i) - 0.5) * 1.2; });
    var path = []; for (var k = 0; k < 4; k++) path.push(WAYPOINTS[Math.floor(rnd(i * 7 + k) * WAYPOINTS.length)]);
    var w = { obj: p, path: path, path0: path.slice(), leg: 0, t: rnd(i * 3), speed: 1.05 + rnd(i * 5) * 0.4, on: false, vis: 0 };
    var a = path[0]; p.position.set(a[0], 0, a[1]);
    p.visible = false; scene.add(p); walkers.push(w);
  }
  function place(name, opts, pos, rotY) {
    var p = makePerson(opts); p.userData.isPerson = true; p.position.copy(pos); p.rotation.y = rotY;
    p.visible = false; scene.add(p); specials[name] = p; return p;
  }
  place('tech', { pose: 'tablet', body: 'm', seed: 41, vest: true, hat: true }, V(-14.6, 0, -1.1), -Math.PI / 2 - 0.35);
  place('remote', { pose: 'stand', body: 'f', seed: 12 }, V(-13.3, 0, 0.2), -Math.PI / 2 - 0.5);
  specials.queue = [];
  for (var q = 0; q < 6; q++) specials.queue.push(place('q' + q, { pose: 'stand', seed: 70 + q }, V(-6 + 0.2 * Math.sin(q), 0, 4.0 + q * 0.75), Math.PI));
  place('night', { pose: 'walk', body: 'm', seed: 99 }, V(9, 0, 6), -2.2);
}
function setCrowd(n) { walkers.forEach(function (w, i) { w.on = i < n; }); }
function updateWalkers(dt) {
  walkers.forEach(function (w) {
    w.vis = lerp(w.vis, w.on ? 1 : 0, 1 - Math.pow(0.02, dt));
    w.obj.visible = w.vis > 0.02;
    w.obj.scale.setScalar(0.6 + 0.4 * w.vis);
    if (!w.obj.visible) return;
    var a = w.path[w.leg], b = w.path[(w.leg + 1) % w.path.length];
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    w.t += dt * w.speed / len;
    if (w.t >= 1) { w.t -= 1; w.leg = (w.leg + 1) % w.path.length; return; }
    var x = lerp(a[0], b[0], w.t), z = lerp(a[1], b[1], w.t);
    w.obj.position.set(x, Math.abs(Math.sin(w.t * len * 3.4)) * 0.025, z);
    var target = Math.atan2(b[0] - a[0], b[1] - a[1]);
    w.obj.rotation.y = lerpAngle(w.obj.rotation.y, target, 1 - Math.pow(0.001, dt));
    if (heatmap.visible) stampHeat(x, z, dt);
  });
}
function lerpAngle(a, b, t) { var d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * t; }
function visibleCount() { return walkers.filter(function (w) { return w.on; }).length + (specials.queue && specials.queue[0].visible ? 6 : 0) + (specials.night && specials.night.visible ? 1 : 0); }

/* ================================================================ HUD (a miniature Bloom) */
var hud = {
  el: $('#hud'), people: $('#h-people'), room: $('#h-room'), pread: $('#h-pread'), hot: $('#h-hot'),
  orb: $('#h-orb'), word: $('#h-acword'), why: $('#h-acwhy'), log: $('#h-log')
};
var sim = { room: 24.2, roomTarget: 24.2, hot: 31, hotTarget: 31, ac: false, why: 'no rule holds', clock: 14 * 3600 + 5 * 60 };
function clockTxt() { var s = sim.clock, h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return (h % 12 || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm'); }
function logLine(msg) {
  var li = document.createElement('li'); li.textContent = clockTxt() + ' ' + msg;
  hud.log.insertBefore(li, hud.log.firstChild);
  while (hud.log.children.length > 5) hud.log.removeChild(hud.log.lastChild);
}
function setAC(on, why) {
  sim.ac = on; sim.why = why || (on ? 'running' : 'no rule holds');
  acLed.material.emissiveIntensity = on ? 2.4 : 0;
  acUnit.children[0].userData.temp = on ? 15 : 19;
  refreshThermalTemps();
}
function updateHud(dt) {
  sim.clock += dt * 12;
  sim.room = lerp(sim.room, sim.roomTarget, 1 - Math.pow(0.25, dt));
  sim.hot = lerp(sim.hot, sim.hotTarget, 1 - Math.pow(0.1, dt));
  var n = visibleCount();
  hud.people.textContent = n;
  hud.room.textContent = sim.room.toFixed(1) + ' °C';
  hud.pread.textContent = n ? (33.2 + Math.sin(sim.clock / 300) * 0.3).toFixed(1) + ' °C' : 'nobody';
  hud.hot.textContent = sim.hot.toFixed(1) + ' °C';
  hud.orb.classList.toggle('on', sim.ac); hud.orb.textContent = sim.ac ? 'ON' : 'OFF';
  hud.word.textContent = sim.ac ? 'Running' : 'Off';
  hud.why.textContent = sim.why;
}

/* ================================================================ projected marks */
var marksEl = $('#marks'), markPool = [], markMode = 'none';
function mark(i) {
  if (!markPool[i]) { var d = document.createElement('div'); d.className = 'mark'; d.innerHTML = '<i></i><span></span>'; marksEl.appendChild(d); markPool[i] = d; }
  return markPool[i];
}
var tmpP = new THREE.Vector3();
function screenOf(v) { tmpP.copy(v).project(camera); return { x: (tmpP.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpP.y * 0.5 + 0.5) * window.innerHeight, ok: tmpP.z < 1 && Math.abs(tmpP.x) < 1.05 && Math.abs(tmpP.y) < 1.05 }; }
var fixedMarks = [];    // [{pos, label, cls, size}]
function updateMarks() {
  var used = 0;
  function put(pos, label, cls, size) {
    var s = screenOf(pos); if (!s.ok) return;
    var m = mark(used++);
    m.className = 'mark ' + (cls || ''); m.style.display = '';
    m.style.transform = 'translate(' + s.x.toFixed(0) + 'px,' + s.y.toFixed(0) + 'px) translate(-50%,-50%)';
    m.style.setProperty('--s', (size || 34) + 'px');
    m.lastChild.textContent = label;
  }
  if (markMode === 'people') {
    var k = 0;
    walkers.forEach(function (w) { if (w.on && w.vis > 0.6) put(w.obj.position.clone().add(V(0, 1.25, 0)), 'person ' + (++k), '', Math.max(22, 520 / camera.position.distanceTo(w.obj.position))); });
  }
  fixedMarks.forEach(function (f) { put(typeof f.pos === 'function' ? f.pos() : f.pos, typeof f.label === 'function' ? f.label() : f.label, f.cls, f.size); });
  for (var i = used; i < markPool.length; i++) markPool[i].style.display = 'none';
}

/* ================================================================ camera director */
var cam = { from: null, to: null, t: 1, dur: 2.6, pos: V(30, 22, 34), look: V(0, 0, 0), fov: 40 };
camera.position.copy(cam.pos); camera.lookAt(cam.look);
var POV = function () { return { pos: SENSOR_EYE.clone().add(V(0.2, -0.04, 0)), look: V(2.5, 0.2, 0.4), fov: 72, pov: true }; };
function shot(s, dur) {
  if (typeof s === 'function') s = s();
  cam.from = { pos: camera.position.clone(), look: cam.look.clone(), fov: camera.fov };
  cam.to = { pos: s.pos.clone(), look: s.look.clone(), fov: s.fov || 40, pov: !!s.pov };
  cam.t = 0; cam.dur = REDUCED ? 0.01 : (dur || 2.8);
}
function updateCamera(dt, now) {
  if (!cam.to) return;
  cam.t = Math.min(1, cam.t + dt / cam.dur);
  var e = ease(cam.t), f = cam.from, t = cam.to;
  var drift = REDUCED || t.pov ? V(0, 0, 0) : V(Math.sin(now / 5200) * 0.35, Math.sin(now / 6100) * 0.18, Math.cos(now / 5700) * 0.35).multiplyScalar(e * Math.min(1, t.pos.distanceTo(t.look) / 12));
  camera.position.lerpVectors(f.pos, t.pos, e).add(drift);
  cam.look.lerpVectors(f.look, t.look, e);
  camera.fov = lerp(f.fov, t.fov, e); camera.updateProjectionMatrix();
  camera.lookAt(cam.look);
}
var S = function (px, py, pz, lx, ly, lz, fov) { return { pos: V(px, py, pz), look: V(lx, ly, lz), fov: fov || 40 }; };
var SHOTS = {
  aerial: S(19, 15, 25, -2, 1, -3, 42), toWall: S(2, 7, 12, -14, 3.6, -2, 40),
  wallWide: S(-7.5, 5.4, 5.5, -14.8, 4.8, -4.2, 48), wallClose: S(-14.55, 4.55, -0.85, -15.9, 4.36, -2, 34),
  heatSources: S(-1, 6.2, 11, -5, 0.8, 1, 44),
  wifiOver: S(-10.6, 2.7, 2.6, -15.2, 2.6, -1.7, 56), wifiRouter: S(-10.5, 5.3, 6, -15.5, 5.2, 1.2, 46),
  orient: S(-13.6, 4.75, -0.3, -15.65, 4.6, -2.35, 40),
  acWide: S(-3.5, 5.8, 8.5, -14.2, 4.6, -4.6, 48), acClose: S(-11.2, 5.4, -2.6, -15.6, 6.0, -6.6, 44),
  remote: S(-10.2, 2.6, 3.6, -14.6, 2.5, -1.0, 56),
  esc: S(3.5, 6.5, 10, 11.6, 1.2, 0.5, 44),
  top: S(0.01, 34, 4, 0, 0, -0.5, 44), queue: S(-0.6, 3.4, 9.6, -6, 1.1, 3.4, 42),
  zones: S(0, 27, 23, 0, 0, -1, 46), night: S(13, 10, 17, -2, 1, -2, 44),
  screen: S(0, 6.6, 10.5, 0, 6.6, 1.2, 46), end: S(22, 17, 28, -1, 2, -3, 42)
};

/* ================================================================ the script */
function resetWorld() {
  setThermal(false); setNight(false);
  walkers.forEach(function (w) { w.path = w.path0.slice(); w.leg = w.leg % w.path.length; });
  setCrowd(14); markMode = 'none'; fixedMarks = [];
  setMount(2); setAC(false, 'no rule holds');
  hud.el.hidden = false;
  sim.roomTarget = 24.4; sim.hotTarget = 33.6;
  gizmo.visible = rotPanel.visible = false;
  heatmap.visible = false; heatmap.material.opacity = 0;
  zones.forEach(function (z) { z.mesh.visible = false; z.mesh.material.opacity = 0; });
  ghostSensors.forEach(function (g) { g.visible = false; });
  screen.visible = false; screen.material.opacity = 0;
  Object.keys(specials).forEach(function (k) { if (specials[k].isObject3D) specials[k].visible = false; });
  specials.queue.forEach(function (q) { q.visible = false; });
  motor.userData.temp = 38;
  sensor.body.position.copy(bodyHome);
}
function setNight(on) {
  world.night = on;
  hemi.intensity = on ? 0.12 : 1.05; sun.intensity = on ? 0 : 1.7;
  scene.environmentIntensity = on ? 0.08 : 0.55;
  signMats.forEach(function (m) { m.emissiveIntensity = on ? 0.6 : 0.35; });
  interiorMats.forEach(function (m) { m.emissiveIntensity = on ? 0.05 : 0.55; });
  sunPatch.visible = !on;                       // no sun after hours
  espresso.userData.temp = on ? 24 : 74;        // and the coffee machine is off
  refreshThermalTemps();
}
// 0: bare wall, 1: plate on, 2: sensor clicked on
var mountAnim = null;
function setMount(stage) {
  plateParts.forEach(function (p, i) { p.visible = stage >= 1; p.position.copy(plateHome[i]); });
  sensor.body.visible = stage >= 2; sensor.body.position.copy(bodyHome);
  mountAnim = null;
}
function animateMount(what) { mountAnim = { what: what, t: 0 }; if (what === 'plate') plateParts.forEach(function (p) { p.visible = true; }); else sensor.body.visible = true; }
function updateMount(dt) {
  if (!mountAnim) return;
  mountAnim.t = Math.min(1, mountAnim.t + dt / (REDUCED ? 0.01 : 2.2));
  var t = mountAnim.t;
  if (mountAnim.what === 'plate') {
    var e = ease(Math.min(1, t * 1.6));
    plateParts.forEach(function (p, i) {
      p.position.copy(plateHome[i]).add(V(0, 0, (1 - e) * 9));
      if (p.geometry && p.geometry.type === 'CylinderGeometry') p.rotation.y = (1 - t) * 18;   // screw caps turn in
    });
  } else {
    var k = t < 0.8 ? ease(t / 0.8) : 1 + Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.03;      // slide, then a small click
    sensor.body.position.copy(bodyHome).add(V(0, 0, (1 - k) * 12));
  }
  if (t >= 1) mountAnim = null;
}

var EYE = function () { return SENSOR_EYE.clone(); };
var SENSOR_TAG = function () { return { pos: SENSOR_EYE.clone().add(V(0.05, 0.3, 0)), label: 'SURDS Thermal', cls: 'zone' }; };
var CHAPTERS = [
  { id: 'intro', title: 'The mall', setup: function () { setMount(0); hud.el.hidden = true; setCrowd(18); }, lines: [
    { shot: 'aerial', say: 'This is a shopping mall on a busy afternoon. Thousands of visitors, dozens of air-conditioners, and nobody really knows who is where, or how warm it is where they are.' },
    { shot: 'toWall', say: 'This is SURDS Thermal: a small sensor that reads a space by its heat. Let’s put one on that wall, and watch it work.' }
  ] },
  { id: 'mount', title: 'Mount', setup: function () { setMount(0); hud.el.hidden = true; setCrowd(12); }, lines: [
    { shot: 'wallWide', act: function () { fixedMarks = [{ pos: V(WALL_X + 0.2, 4.4, -2), label: 'sensor goes here', cls: 'no', size: 30 }, { pos: acUnit.position.clone().add(V(0, 0.5, 0)), label: 'the AC: keep it in sight', cls: 'zone' }]; },
      say: 'Step one: choose the spot. High on a wall, looking down across the floor people use, with a clear line of sight to the air-conditioner it will control.' },
    { shot: 'wallClose', act: function () { fixedMarks = []; animateMount('plate'); }, say: 'Screw the wall plate on, with two screws.' },
    { act: function () { animateMount('body'); }, say: 'Then click the sensor onto the plate. Its angled face already tips it down into the room.' },
    { shot: 'heatSources', act: function () { fixedMarks = [{ pos: espresso.getWorldPosition(V()).add(V(0, 0.4, 0)), label: 'espresso machine', cls: 'no' }, { pos: sunPatch.position.clone(), label: 'sunlit floor', cls: 'no', size: 60 }]; },
      say: 'Keep heat sources out of its view where you can. Coffee machines, heaters and sunny glass all glow, just like people do.' }
  ] },
  { id: 'wifi', title: 'Wi-Fi', setup: function () { hud.el.hidden = true; specials.tech.visible = true; fixedMarks = [SENSOR_TAG()]; }, lines: [
    { shot: 'wifiOver', say: 'Step two: Wi-Fi. Open Bloom in Chrome, at thermal dot gpunet dot in, and stand near the sensor.' },
    { act: function () { btPulses(); }, say: 'Press Device Wi-Fi, then Connect to device, and pick the sensor from Chrome’s Bluetooth list.' },
    { act: function () { btPulses(); }, say: 'Scan for networks, choose yours, type the password, and press Save and connect. Company networks with a username and password work too.' },
    { shot: 'wifiRouter', act: function () { wifiPulses(); setTimeout(function () { if (current === 2) { hud.el.hidden = false; logLine('sensor connected: live values'); } }, 1600); },
      say: 'The password goes straight to the sensor over Bluetooth. Bloom’s server never sees it. The sensor restarts, joins the network, and goes live.' }
  ] },
  { id: 'orient', title: 'Orientation', setup: function () { gizmo.visible = true; }, lines: [
    { shot: 'orient', act: function () { gizmoSpin = 1; }, say: 'Step three: tell Bloom how the sensor hangs. In Device orientation, press Set as facing down, then zero yaw.' },
    { act: function () { rotPanel.visible = true; rotSteps = 0; }, say: 'If people walk the wrong way on screen, press Rotate view. Each press turns the picture a quarter turn, until movement on screen matches the room.' }
  ] },
  { id: 'heat', title: 'Seeing heat', setup: function () { setCrowd(14); }, lines: [
    { shot: POV, say: 'Now, look through its eyes.' },
    { act: function () { setThermal(true); }, say: 'It doesn’t see light. It sees heat: a grid of thirty-two by twenty-four temperatures, about twice every second.' },
    { say: 'Floors and walls read cool. The air-conditioner reads cold. People glow, at around thirty-three degrees.' },
    { say: 'And that is all it ever sees. Warm shapes. No faces, no screens, nothing that identifies anyone.' }
  ] },
  { id: 'count', title: 'Counting', setup: function () { setThermal(true); setCrowd(12); }, lines: [
    { shot: POV, act: function () { markMode = 'people'; }, say: function () { return 'Bloom turns each warm patch into a person, and counts them. Right now, ' + visibleCount() + ' people in the zone.'; } },
    { act: function () { fixedMarks = [{ pos: sunPatch.position.clone(), label: 'sunlit floor: not a person', cls: 'no', size: 70 }, { pos: espresso.getWorldPosition(V()).add(V(0, 0.2, 0)), label: 'espresso machine: not a person', cls: 'no' }]; },
      say: 'The blob threshold sets how much warmer than its surroundings a patch must be. The sunlit floor and the espresso machine stay under it, so they are not counted.' },
    { say: 'It also reads how warm the people are: the average of each person’s hottest point. That is how it notices a crowd getting uncomfortable.' }
  ] },
  { id: 'ac', title: 'The AC', setup: function () { setCrowd(8); sim.roomTarget = 24.6; sim.room = 24.6; fixedMarks = [SENSOR_TAG(), { pos: acUnit.position.clone().add(V(0, 0.75, 0)), label: 'AC', cls: 'zone' }]; }, lines: [
    { shot: 'acWide', say: 'Step four: let it run the air-conditioning. In Bloom’s Air conditioning panel, switch on Automatic and choose your rules.' },
    { say: 'On when someone is in. On when people read above a temperature. On when the room passes a limit. If any rule you switched on holds, the AC runs.' },
    { act: function () { setCrowd(24); sim.roomTarget = 26.4; }, say: 'Here, the rule is: on when the room reaches twenty-six degrees. As the afternoon crowd builds, the room warms up.' },
    { shot: 'acClose', act: function () { fireIR(acUnit.position.clone()); setTimeout(function () { if (current === 6) { setAC(true, 'room 26.4 °C ≥ 26.0'); logLine('AC ON: room 26.4 °C ≥ 26.0'); sim.roomTarget = 25.2; } }, 900); },
      say: 'Twenty-six point four. Bloom fires the air-conditioner’s own infrared code, exactly as if someone had pressed its remote.' },
    { shot: 'acWide', act: function () { setCrowd(4); sim.roomTarget = 24.4; setTimeout(function () { if (current === 6) { setAC(false, 'no rule holds'); logLine('AC OFF: no rule holds (room 24.6 °C, people 33.1 °C) for 120 s'); } }, 5200); },
      say: 'When the crowd thins out, no rule holds any more. Bloom waits for the off delay, two minutes here, so a brief dip doesn’t make it flicker. Then it switches off, and writes down why.' }
  ] },
  { id: 'remote', title: 'The remote', setup: function () { setCrowd(8); specials.remote.visible = true; setAC(true, '1 in the room'); fixedMarks = [SENSOR_TAG()]; }, lines: [
    { shot: 'remote', say: 'How does it know the AC’s codes? You teach it, once.' },
    { act: function () { remotePulse(); setTimeout(function () { if (current === 7) logLine('learned: Power'); }, 1400); },
      say: 'Hold a button in Bloom’s Remote panel until it reads press remote. Point the real remote at the sensor, press the same button, and it is learned.' },
    { act: function () { remotePulse(); setTimeout(function () { if (current === 7) { setAC(false, 'remote: power'); logLine('AC OFF: remote: power'); } }, 1400); },
      say: 'It listens, too. If someone switches the AC off with its remote, Bloom hears it, and stays in step.' }
  ] },
  { id: 'hot', title: 'Hot spots', setup: function () { setCrowd(10); setThermal(true); sim.hotTarget = 34.1; }, lines: [
    { shot: 'esc', say: 'Because it measures every surface, it watches equipment as well. The hottest point in view is always on the dashboard.' },
    { act: function () { motor.userData.temp = 62; refreshThermalTemps(); sim.hotTarget = 62; logLine('hottest point 62.0 °C'); fixedMarks = [{ pos: motor.getWorldPosition(V()).add(V(0, 0.6, 0)), label: 'hottest point 62 °C', cls: 'hot', size: 54 }]; },
      say: 'When the escalator motor starts running at sixty-two degrees, it stands out, long before anything fails.' }
  ] },
  { id: 'uses', title: 'Use cases', setup: function () { setCrowd(20); }, lines: [
    { shot: 'top', act: function () { heatmap.visible = true; prewarmHeatmap(); },
      say: 'For the mall team, the same positions add up to footfall: where shoppers walk, where they stop, and how long they stay in front of each store. Anonymously.' },
    { shot: 'queue', act: function () { heatmap.visible = false; setCrowd(10); specials.queue.forEach(function (q) { q.visible = true; }); fixedMarks = [{ pos: V(-6, 2.3, 6), label: 'queue: 6 waiting', cls: 'zone' }]; },
      say: 'Queues: when six warm shapes line up at the espresso bar, that’s the cue to open a second till.' },
    { shot: 'zones', act: function () {
        specials.queue.forEach(function (q) { q.visible = false; }); setCrowd(16);
        ghostSensors.forEach(function (g) { g.visible = true; }); zones.forEach(function (z) { z.mesh.visible = true; });
        fixedMarks = [{ pos: V(-10, 0.5, 1), label: 'Zone A · busy · AC on', cls: 'zone' }, { pos: V(1, 0.5, 1), label: 'Zone B · busy · AC on', cls: 'zone' }, { pos: V(11, 0.5, 1), label: 'Zone C · empty · AC off', cls: 'zone' }];
        walkers.forEach(function (w) { w.path = w.path.map(function (p) { return [Math.min(p[0], 4), p[1]]; }); });
      }, say: 'Zones: one sensor per zone. Busy areas stay cool while empty wings stop cooling, and that is where the energy savings come from.' },
    { shot: 'night', act: function () { zones.forEach(function (z) { z.mesh.visible = false; }); ghostSensors.forEach(function (g) { g.visible = false; }); fixedMarks = []; setCrowd(0); setNight(true); setThermal(true); specials.night.visible = true; nightWalk = 0;
        fixedMarks = [{ pos: function () { return specials.night.position.clone().add(V(0, 1.3, 0)); }, label: '1 warm shape · after hours', cls: '', size: 40 }]; },
      say: 'After hours, the mall should be empty. A single warm shape in a closed wing stands out instantly, without a single camera.' },
    { shot: POV, act: function () { specials.night.visible = false; setNight(false); setCrowd(12); fixedMarks = []; markMode = 'people'; },
      say: 'And through all of it, nobody is identified. It is heat, processed on the device. There are no faces in the data, so there are none to leak.' }
  ] },
  { id: 'bloom', title: 'Bloom', setup: function () { setCrowd(14); hud.el.hidden = true; screen.visible = true; screen.material.map = screenTexLive; screen.material.needsUpdate = true; }, lines: [
    { shot: 'screen', say: 'Everything the sensor does shows up in Bloom, at thermal dot gpunet dot in. The live view has the room, the air-conditioning and its rules, the remote, and a log of every decision with its reason.' },
    { act: function () { screen.material.map = screenTexAnalytics; screen.material.needsUpdate = true; },
      say: 'Analytics keeps the history, from fifteen minutes to seven days. Put the people next to the hours the AC ran, and tune your rules wherever they don’t line up.' },
    { shot: 'end', act: function () { screen.visible = false; }, say: 'That’s SURDS Thermal. For every button and setting, the step-by-step guide has the details.' }
  ] }
];

// effect triggers used by the script
function btPulses() { var from = specials.tech.position.clone().add(V(0.25, 1.25, 0.15)); pulseLine(from, EYE(), 0x4aa3ff, { n: 9, arc: 0.25, dur: 3400, speed: 0.55, size: 0.03 }); }
function wifiPulses() { var from = router.position.clone().add(V(0.15, 0, 0)); pulseLine(from, EYE(), 0x3aa76d, { n: 12, arc: 0.6, dur: 3600, speed: 0.5, size: 0.045 }); }
function fireIR(to) { pulseLine(EYE(), to, 0xff4b2b, { n: 14, arc: 0.4, dur: 2400, speed: 0.9, size: 0.06 }); }
function remotePulse() { var from = specials.remote.position.clone().add(V(0.32, 1.12, 0.1)); pulseLine(from, EYE(), 0xff4b2b, { n: 8, arc: 0.15, dur: 2200, speed: 0.8, size: 0.03 }); }
function prewarmHeatmap() {
  hmAcc.fill(0);
  for (var s = 0; s < 900; s++) updateWalkers(0.25);
  // dwell in front of the shops and the espresso bar
  for (var i = 0; i < 400; i++) { stampHeat(-12.8 + (i % 5) * 6.4 + (rnd(i) - 0.5) * 3, -8.6 + rnd(i * 3) * 1.5, 0.35); stampHeat(-6 + (rnd(i * 5) - 0.5) * 2, 4.5 + rnd(i * 7) * 3, 0.3); }
  paintHeatmap();
}
var gizmoSpin = 0, rotSteps = 0, rotTimer = 0, nightWalk = 0;

/* ================================================================ player */
var current = -1, lineIdx = -1, playing = false, voiceOn = true, ccOn = true, lineTimer = null, lineToken = 0;
var chapterNav = $('#chapters');
CHAPTERS.forEach(function (c, i) {
  var b = document.createElement('button'); b.type = 'button'; b.textContent = c.title;
  b.addEventListener('click', function () { startChapter(i); setPlaying(true); });
  chapterNav.appendChild(b);
});
function navState() {
  Array.prototype.forEach.call(chapterNav.children, function (b, i) { b.classList.toggle('is-current', i === current); b.classList.toggle('is-past', i < current); });
  var total = CHAPTERS.reduce(function (n, c) { return n + c.lines.length; }, 0), doneLines = 0;
  for (var i = 0; i < current; i++) doneLines += CHAPTERS[i].lines.length;
  $('#progress').style.width = ((doneLines + Math.max(0, lineIdx)) / total * 100) + '%';
}
function titleCard(i) {
  var tc = $('#title-card');
  $('#tc-num').textContent = (i < 9 ? '0' : '') + (i + 1) + ' / ' + CHAPTERS.length;
  $('#tc-title').textContent = CHAPTERS[i].title;
  tc.classList.add('show'); setTimeout(function () { tc.classList.remove('show'); }, 1900);
}
function startChapter(i) {
  stopSpeech();
  $('#end').hidden = true;
  current = i; lineIdx = -1;
  resetWorld();
  if (i > 0) hud.el.hidden = false;
  CHAPTERS[i].setup();
  titleCard(i);
  navState();
  setTimeout(function () { if (current === i && lineIdx === -1) nextLine(); }, REDUCED ? 50 : 1200);
}
function nextLine() {
  var ch = CHAPTERS[current];
  lineIdx++;
  if (lineIdx >= ch.lines.length) {
    if (current + 1 < CHAPTERS.length) startChapter(current + 1);
    else finish();
    return;
  }
  var ln = ch.lines[lineIdx];
  if (ln.shot) shot(typeof ln.shot === 'string' ? SHOTS[ln.shot] : ln.shot, lineIdx === 0 ? 3.2 : 2.6);
  if (ln.act) ln.act();
  var text = typeof ln.say === 'function' ? ln.say() : ln.say;
  $('#caption-text').textContent = text;
  navState();
  speakThen(text, nextLine);
}
function finish() { stopSpeech(); setPlaying(false); $('#end').hidden = false; $('#caption-text').textContent = ''; current = CHAPTERS.length - 1; navState(); }

/* narration: speak, then move on; or wait a reading time when the voice is off */
var voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  var vs = speechSynthesis.getVoices();
  voice = vs.find(function (v) { return /en(-|_)(GB|US|IN)/i.test(v.lang) && /Google|Natural|Neural/i.test(v.name); }) ||
          vs.find(function (v) { return /^en/i.test(v.lang); }) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function readTime(text) { return Math.max(3200, text.split(/\s+/).length * 330 + 1400); }
function speakThen(text, done) {
  var token = ++lineToken;
  function go() { if (token === lineToken && playing) done(); }
  clearTimeout(lineTimer);
  if (!playing) return;
  if (voiceOn && 'speechSynthesis' in window) {
    var u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.rate = 1.0; u.pitch = 1.0;
    var fired = false;
    u.onend = function () { if (fired) return; fired = true; lineTimer = setTimeout(go, 450); };
    u.onerror = function () { if (fired) return; fired = true; lineTimer = setTimeout(go, readTime(text)); };
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    lineTimer = setTimeout(function () { if (!fired) { fired = true; go(); } }, readTime(text) + 6000);   // safety net
  } else {
    lineTimer = setTimeout(go, readTime(text));
  }
}
function stopSpeech() { lineToken++; clearTimeout(lineTimer); if ('speechSynthesis' in window) speechSynthesis.cancel(); }
function setPlaying(p) {
  playing = p;
  $('#btn-play').classList.toggle('paused', !p);
  $('#btn-play').setAttribute('aria-label', p ? 'Pause' : 'Play');
}
$('#btn-play').addEventListener('click', function () {
  if (playing) { setPlaying(false); stopSpeech(); }
  else { setPlaying(true); var ln = CHAPTERS[current].lines[lineIdx]; if (ln) speakThen(typeof ln.say === 'function' ? ln.say() : ln.say, nextLine); else nextLine(); }
});
$('#btn-next').addEventListener('click', function () { if (current + 1 < CHAPTERS.length) { startChapter(current + 1); setPlaying(true); } });
$('#btn-prev').addEventListener('click', function () { startChapter(Math.max(0, current - (lineIdx > 0 ? 0 : 1))); setPlaying(true); });
$('#btn-voice').addEventListener('click', function (e) {
  voiceOn = !voiceOn; e.currentTarget.classList.toggle('on', voiceOn); e.currentTarget.setAttribute('aria-pressed', voiceOn);
  if (!voiceOn) { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
  var ln = CHAPTERS[current] && CHAPTERS[current].lines[lineIdx];
  if (ln && playing) speakThen(typeof ln.say === 'function' ? ln.say() : ln.say, nextLine);
});
$('#btn-cc').addEventListener('click', function (e) { ccOn = !ccOn; e.currentTarget.classList.toggle('on', ccOn); e.currentTarget.setAttribute('aria-pressed', ccOn); $('#caption').classList.toggle('off', !ccOn); });
document.addEventListener('keydown', function (e) {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.key === ' ') { e.preventDefault(); $('#btn-play').click(); }
  else if (e.key === 'ArrowRight') $('#btn-next').click();
  else if (e.key === 'ArrowLeft') $('#btn-prev').click();
});
$('#replay').addEventListener('click', function () { startChapter(0); setPlaying(true); });

/* ================================================================ loop */
var last = performance.now(), frameNo = 0;
function frame(now) {
  var dt = Math.min(0.05, (now - last) / 1000); last = now;
  updateWalkers(dt);
  updateMount(dt);
  updateCamera(dt, now);
  updatePulses(now);
  updateAir(dt, sim.ac && !world.thermal);
  flapPivot.rotation.x = lerp(flapPivot.rotation.x, sim.ac ? 0.9 : 0, 1 - Math.pow(0.05, dt));
  updateHud(dt);
  if (heatmap.visible) { heatmap.material.opacity = lerp(heatmap.material.opacity, 0.85, 1 - Math.pow(0.05, dt)); if (++frameNo % 10 === 0) paintHeatmap(); }
  zones.forEach(function (z) { if (z.mesh.visible) z.mesh.material.opacity = lerp(z.mesh.material.opacity, z.name === 'Zone C' ? 0.12 : 0.22, 1 - Math.pow(0.05, dt)); });
  if (screen.visible) screen.material.opacity = lerp(screen.material.opacity, 1, 1 - Math.pow(0.02, dt));
  if (gizmo.visible && gizmoSpin > 0) { gizmoSpin = Math.max(0, gizmoSpin - dt * 0.45); gizmo.rotation.set(Math.sin(now / 300) * 0.5 * gizmoSpin, gizmoSpin * 2.2, Math.cos(now / 340) * 0.4 * gizmoSpin); }
  if (rotPanel.visible) { rotTimer += dt; if (rotTimer > 1.4 && rotSteps < 3) { rotTimer = 0; rotSteps++; } rotPanel.rotation.z = lerp(rotPanel.rotation.z, rotSteps * Math.PI / 2, 1 - Math.pow(0.01, dt)); }
  if (specials.night && specials.night.visible) { nightWalk += dt * 0.9; specials.night.position.set(9 - nightWalk, 0, 6 - nightWalk * 0.6); }
  if (world.thermal) scene.background.lerp(THERMAL_BG, 0.2); else scene.background.lerp(world.night ? NIGHT_BG : DAY_BG, 0.08);
  scene.fog.color.copy(scene.background);
  renderer.render(scene, camera);
  updateMarks();
  requestAnimationFrame(frame);
}

/* ================================================================ boot */
var playBtn = $('#play-btn'), playLabel = $('#play-label');
var gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
var mgr = THREE.DefaultLoadingManager;
mgr.onProgress = function (url, loaded, total) { playLabel.textContent = 'Loading the mall… ' + Math.round(loaded / Math.max(1, total) * 100) + '%'; };
loadPeople(gl, '/views/explore/assets/people.glb?v=4').then(function () {
  setupPeople();
  resetWorld(); setMount(0); hud.el.hidden = true; setCrowd(18);
  shot(SHOTS.aerial, 0.01);
  requestAnimationFrame(frame);
  playBtn.disabled = false; playLabel.textContent = 'Play the tour';
}).catch(function (err) {
  console.error(err);
  playLabel.textContent = 'Could not load the people models. Reload to try again.';
});
playBtn.addEventListener('click', function () {
  $('#start').hidden = true;
  setPlaying(true);
  startChapter(0);
});
