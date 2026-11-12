/* SURDS G1 product page.
 *
 * One GLB (models/surds-router.glb: a single vertex-coloured mesh, Z-up) is loaded once
 * and shared by three WebGL stages: the scroll-driven hero, the finish configurator and
 * the closing CTA. Finishes tint a shared material over the vertex colours, so the
 * light body takes the finish and the dark antennas stay dark. The gallery stills are
 * rendered from the same model at load, so there are no photo assets to keep in sync.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

var MODEL_URL = '/models/surds-router.glb';
var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

/* ------------------------------------------------------------------ finishes */

var FINISHES = {
  graphite: { name: 'Graphite',    dot: '#2a2a30', body: '#2a2a30', trim: '#18181c', rough: 0.55, metal: 0.15, coat: 0.25,
              desc: 'Graphite shell, matte black antennas and a soft status light. Disappears into racks and ceilings.' },
  labwhite: { name: 'Lab White',   dot: '#ecebe6', body: '#ecebe6', trim: '#c9c7c0', rough: 0.42, metal: 0.0,  coat: 0.6,
              desc: 'Clean-room white shell with black antennas. Wipes down and reads as part of the ceiling grid.' },
  signal:   { name: 'Signal Pink', dot: '#ff2e7e', body: '#ff2e7e', trim: '#c2124f', rough: 0.36, metal: 0.1,  coat: 0.7,
              desc: 'SURDS signal pink. For pilot sites where you want the gateway to be found, not hidden.' }
};
var state = { finish: 'graphite', qty: 1 };

/* The GLB's vertex colours encode parts: near-white = shell, mid grey = top trim,
   near-black = antennas, saturated = status LEDs. A finish rewrites only shell + trim. */
var material = new THREE.MeshPhysicalMaterial({ vertexColors: true, clearcoatRoughness: 0.35 });
var partOf = null, srcColors = null;   // per-vertex part tag + original colours

function srgbToLinear(c) { return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4); }

function classifyParts(geo) {
  var col = geo.getAttribute('color'), n = col.count;
  partOf = new Uint8Array(n); srcColors = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) {
    var r = col.getX(i), g = col.getY(i), b = col.getZ(i);
    // the file stores sRGB values; three.js treats vertex colours as linear
    srcColors[i * 3] = srgbToLinear(r); srcColors[i * 3 + 1] = srgbToLinear(g); srcColors[i * 3 + 2] = srgbToLinear(b);
    var spread = Math.max(r, g, b) - Math.min(r, g, b);
    partOf[i] = spread > 0.23 ? 3 : r < 0.2 ? 2 : r > 0.94 ? 0 : 1;   // 0 shell, 1 trim, 2 antenna, 3 LED
  }
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
}

function applyFinish(key) {
  var f = FINISHES[key];
  material.roughness = f.rough;
  material.metalness = f.metal;
  material.clearcoat = f.coat;
  if (!geometry) return;
  var body = new THREE.Color(f.body), trim = new THREE.Color(f.trim);
  var col = geometry.getAttribute('color');
  for (var i = 0; i < partOf.length; i++) {
    var p = partOf[i];
    if (p === 0) col.setXYZ(i, body.r, body.g, body.b);
    else if (p === 1) col.setXYZ(i, trim.r, trim.g, trim.b);
    else col.setXYZ(i, srcColors[i * 3], srcColors[i * 3 + 1], srcColors[i * 3 + 2]);
  }
  col.needsUpdate = true;
}

/* --------------------------------------------------------------- model load */

var loaderEl = $('#loader'), loaderFill = $('#loader-fill');
var geometry = null;

function finishLoading() { loaderEl.classList.add('done'); }
setTimeout(finishLoading, 8000);   // never trap the page behind the loader

function loadModel(attempt) {
new GLTFLoader().load(MODEL_URL, function (gltf) {
  var mesh = null;
  gltf.scene.traverse(function (o) { if (o.isMesh && !mesh) mesh = o; });
  geometry = mesh.geometry.clone();
  geometry.rotateX(-Math.PI / 2);                      // Z-up source -> Y-up
  geometry.rotateY(Math.PI);                           // status LEDs face the camera
  classifyParts(geometry);
  applyFinish(state.finish);
  geometry.computeBoundingBox();
  var bb = geometry.boundingBox, c = new THREE.Vector3();
  bb.getCenter(c);
  geometry.translate(-c.x, -bb.min.y, -c.z);          // centred, sitting on y = 0
  var size = new THREE.Vector3(); bb.getSize(size);
  var s = 2.2 / Math.max(size.x, size.z);
  geometry.scale(s, s, s);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  stages.forEach(function (st) { st.attach(); });
  renderGallery();
  loaderFill.style.width = '100%';
  setTimeout(finishLoading, 250);
}, function (e) {
  if (e.total) loaderFill.style.width = Math.round(e.loaded / e.total * 100) + '%';
}, function (err) {
  if (attempt < 2) { setTimeout(function () { loadModel(attempt + 1); }, 600 * (attempt + 1)); return; }
  console.error('G1 model failed to load', err);
  finishLoading();
});
}
loadModel(0);

/* -------------------------------------------------------------------- stage */

function makeShadowTexture() {
  var c = document.createElement('canvas'); c.width = c.height = 256;
  var g = c.getContext('2d');
  var grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(0.55, 'rgba(0,0,0,0.18)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
var shadowTex = makeShadowTexture();

function lerp(a, b, t) { return a + (b - a) * t; }
function smooth(t) { return t * t * (3 - 2 * t); }

function Stage(el, opts) {
  this.el = el;
  this.opts = opts || {};
  this.canvas = $('canvas', el);
  this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  this.renderer.toneMappingExposure = 1.05;
  this.scene = new THREE.Scene();
  var pmrem = new THREE.PMREMGenerator(this.renderer);
  this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  var key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4); this.scene.add(key);
  var rim = new THREE.DirectionalLight(0xff6aa3, 0.6); rim.position.set(-4, 2, -3); this.scene.add(rim);
  this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  this.camera.position.set(0, 1.5, 6.4);
  this.camera.lookAt(0, 0.45, 0);

  this.root = new THREE.Group();      // screen-space placement (x offset / scale)
  this.spin = new THREE.Group();      // yaw / pitch
  this.root.add(this.spin);
  this.scene.add(this.root);

  var shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002;
  this.root.add(shadow);

  this.rings = [];
  if (this.opts.rings) {
    for (var i = 0; i < 3; i++) {
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96),
        new THREE.MeshBasicMaterial({ color: 0xff2e7e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.004;
      ring.userData.phase = i / 3;
      this.root.add(ring); this.rings.push(ring);
    }
  }

  // pose: current values ease toward target; user offsets come from drag / keys
  this.pose = { yaw: -0.6, pitch: 0.1, x: 0, y: 0, scale: 1 };
  this.target = { yaw: -0.6, pitch: 0.1, x: 0, y: 0, scale: 1 };
  this.base = { yaw: this.opts.yaw != null ? this.opts.yaw : -0.6, pitch: this.opts.pitch != null ? this.opts.pitch : 0.12 };
  this.user = { yaw: 0, pitch: 0 };
  this.visible = false;
  this.clock = new THREE.Clock();

  this.bindInput();
  this.resize();
  var self = this;
  new ResizeObserver(function () { self.resize(); }).observe(el);
  new IntersectionObserver(function (es) { self.visible = es[0].isIntersecting; }, { rootMargin: '100px' }).observe(el);
}

Stage.prototype.attach = function () {
  this.mesh = new THREE.Mesh(geometry, material);
  this.spin.add(this.mesh);
};

Stage.prototype.resize = function () {
  var r = this.el.getBoundingClientRect();
  if (!r.width || !r.height) return;
  this.renderer.setSize(r.width, r.height, false);
  this.camera.aspect = r.width / r.height;
  this.camera.updateProjectionMatrix();
  // half the visible width at the model's depth, used to place the model in screen fractions
  var dist = this.camera.position.distanceTo(new THREE.Vector3(0, 0.45, 0));
  this.halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist * this.camera.aspect;
  this.halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * dist;
};

Stage.prototype.bindInput = function () {
  var self = this, dragging = false, lastX = 0, lastY = 0;
  this.el.addEventListener('pointerdown', function (e) {
    if (e.target.closest('button')) return;
    dragging = true; lastX = e.clientX; lastY = e.clientY;
    self.el.setPointerCapture(e.pointerId);
  });
  this.el.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    self.user.yaw += (e.clientX - lastX) * 0.012;
    self.user.pitch = THREE.MathUtils.clamp(self.user.pitch + (e.clientY - lastY) * 0.004, -0.35, 0.6);
    lastX = e.clientX; lastY = e.clientY;
  });
  ['pointerup', 'pointercancel'].forEach(function (t) { self.el.addEventListener(t, function () { dragging = false; }); });
  this.el.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'ArrowLeft') self.turn(-1);
    else if (k === 'ArrowRight') self.turn(1);
    else if (k === 'ArrowUp') self.user.pitch = Math.min(0.6, self.user.pitch + 0.12);
    else if (k === 'ArrowDown') self.user.pitch = Math.max(-0.35, self.user.pitch - 0.12);
    else if (k === 'Home') self.reset();
    else return;
    e.preventDefault();
  });
};
Stage.prototype.turn = function (dir) { this.user.yaw += dir * Math.PI / 4; };
Stage.prototype.reset = function () { this.user.yaw = 0; this.user.pitch = 0; };

Stage.prototype.tick = function (t) {
  if (!this.visible || !this.mesh) return;
  var dt = Math.min(this.clock.getDelta(), 0.05);
  var k = REDUCED ? 1 : 1 - Math.pow(0.0025, dt);           // frame-rate independent easing
  var tg = this.target;
  if (this.opts.idleSpin && !REDUCED) this.base.yaw += dt * 0.18;
  var p = this.pose;
  p.yaw = lerp(p.yaw, tg.yaw + this.base.yaw + this.user.yaw, k);
  p.pitch = lerp(p.pitch, tg.pitch + this.base.pitch + this.user.pitch, k);
  p.x = lerp(p.x, tg.x, k); p.y = lerp(p.y, tg.y, k);
  p.scale = lerp(p.scale, tg.scale, k);
  this.spin.rotation.set(p.pitch, p.yaw, 0, 'XYZ');
  this.root.position.set(p.x * (this.halfW || 1), p.y * (this.halfH || 1), 0);
  this.root.scale.setScalar(p.scale);
  for (var i = 0; i < this.rings.length; i++) {
    var r = this.rings[i], ph = REDUCED ? r.userData.phase : (t * 0.00022 + r.userData.phase) % 1;
    r.scale.setScalar(0.9 + ph * 1.9);
    r.material.opacity = (1 - ph) * 0.35 * (this.ringStrength || 0);
  }
  this.renderer.render(this.scene, this.camera);
};

/* ---------------------------------------------------------------- stages */

var heroStage = new Stage($('#hero-stage'), { rings: true, yaw: 0, pitch: 0 });
var configStage = new Stage($('#config-stage'), { yaw: -0.55, pitch: 0.18 });
var finalStage = new Stage($('#final-stage'), { yaw: 0.5, pitch: 0.14, idleSpin: true, rings: true });
configStage.target.scale = 1.05;
finalStage.target.scale = 1.05; finalStage.ringStrength = 0.6;
var stages = [heroStage, configStage, finalStage];

$$('.stage-controls').forEach(function (bar) {
  var st = { hero: heroStage, config: configStage, final: finalStage }[bar.dataset.stage];
  $$('[data-turn]', bar).forEach(function (b) { b.addEventListener('click', function () { st.turn(+b.dataset.turn); }); });
  $('[data-reset]', bar).addEventListener('click', function () { st.reset(); });
});

function loop(t) {
  for (var i = 0; i < stages.length; i++) stages[i].tick(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ------------------------------------------------------- hero scroll story */

// one pose per chapter; x / y are fractions of the half-viewport at the model
var CHAPTERS = [
  { yaw: -0.55, pitch: 0.16, x: 0.42, y: -0.18, scale: 1.0,  rings: 0.0 },   // identity
  { yaw: 0.85,  pitch: 0.05, x: 0.40, y: -0.22, scale: 1.12, rings: 0.0 },   // form: antennas side-on
  { yaw: 0.0,   pitch: 0.62, x: 0.42, y: -0.10, scale: 0.95, rings: 1.0 },   // control: top-down, mesh rings
  { yaw: -1.57, pitch: 0.04, x: 0.40, y: -0.20, scale: 1.18, rings: 0.0 },   // endurance: profile
  { yaw: -3.6,  pitch: 0.2,  x: 0.40, y: -0.16, scale: 1.02, rings: 0.8 }    // signature: three-quarter rear
];
var MOBILE_SHIFT = { x: 0, y: -0.12 };

var hero = $('.immersive-hero');
var copies = $$('.hero-copy');
var progressBtns = $$('#scroll-progress button');
var activeChapter = 0;

function heroProgress() {
  var r = hero.getBoundingClientRect();
  var span = hero.offsetHeight - window.innerHeight;
  return THREE.MathUtils.clamp(-r.top / span, 0, 1);
}

function updateHero() {
  var p = heroProgress();
  var f = p * CHAPTERS.length;                        // 0..5
  var idx = Math.min(CHAPTERS.length - 1, Math.floor(f));
  // blend into the next pose over the last 35% of each chapter
  var local = f - idx, blend = smooth(THREE.MathUtils.clamp((local - 0.65) / 0.35, 0, 1));
  var a = CHAPTERS[idx], b = CHAPTERS[Math.min(idx + 1, CHAPTERS.length - 1)];
  var mobile = window.innerWidth <= 760;
  var tg = heroStage.target;
  tg.yaw = lerp(a.yaw, b.yaw, blend);
  tg.pitch = lerp(a.pitch, b.pitch, blend);
  tg.x = mobile ? MOBILE_SHIFT.x : lerp(a.x, b.x, blend);
  tg.y = mobile ? MOBILE_SHIFT.y : lerp(a.y, b.y, blend);
  tg.scale = lerp(a.scale, b.scale, blend) * (mobile ? 0.92 : 1);
  heroStage.ringStrength = lerp(a.rings, b.rings, blend);

  if (idx !== activeChapter) {
    activeChapter = idx;
    copies.forEach(function (c, i) {
      c.classList.toggle('is-active', i === idx);
      c.setAttribute('aria-hidden', i === idx ? 'false' : 'true');
    });
  }
  progressBtns.forEach(function (btn, i) {
    btn.classList.toggle('is-active', i === idx);
    var fill = THREE.MathUtils.clamp(f - i, 0, 1);
    btn.querySelector('b').style.width = (fill * 100) + '%';
  });
}

progressBtns.forEach(function (btn) {
  btn.addEventListener('click', function () {
    var i = +btn.dataset.goto;
    var span = hero.offsetHeight - window.innerHeight;
    var top = hero.offsetTop + span * ((i + 0.3) / CHAPTERS.length);
    window.scrollTo({ top: top, behavior: REDUCED ? 'auto' : 'smooth' });
  });
});

/* ------------------------------------------------------- header / nav / bar */

var header = $('#site-header');
var buyBar = $('#buy-bar');
var finalSection = $('#final-preorder');
var navLinks = $$('.desktop-nav a');

function onScroll() {
  updateHero();
  header.classList.toggle('scrolled', window.scrollY > 40);
  var pastHero = hero.getBoundingClientRect().bottom < window.innerHeight * 0.6;
  var fr = finalSection.getBoundingClientRect();
  var atFinal = fr.top < window.innerHeight * 0.85;
  var showBar = pastHero && !atFinal;
  buyBar.classList.toggle('show', showBar);
  buyBar.setAttribute('aria-hidden', showBar ? 'false' : 'true');
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

var sectionObs = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) {
    if (!e.isIntersecting) return;
    navLinks.forEach(function (a) { a.classList.toggle('is-current', a.dataset.nav === e.target.id); });
  });
}, { rootMargin: '-45% 0px -50% 0px' });
['promise', 'engineering', 'materials', 'specifications'].forEach(function (id) { sectionObs.observe(document.getElementById(id)); });

var revealObs = new IntersectionObserver(function (entries) {
  entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); } });
}, { rootMargin: '0px 0px -8% 0px' });
$$('.reveal').forEach(function (el) { revealObs.observe(el); });

var menuBtn = $('#menu-button'), mobileNav = $('#mobile-nav');
function setMenu(open) {
  mobileNav.hidden = !open;
  menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  menuBtn.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
}
menuBtn.addEventListener('click', function () { setMenu(mobileNav.hidden); });
$$('a', mobileNav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

/* --------------------------------------------------------------- configurator */

var finishDesc = $('#finish-desc'), finishCaption = $('#finish-caption');
var qtyVal = $('#qty-val');

function syncSelection() {
  var f = FINISHES[state.finish];
  finishDesc.textContent = f.desc;
  finishCaption.textContent = f.name;
  $('#bar-finish').textContent = f.name;
  $('#final-summary').textContent = f.name + ' / Qty ' + state.qty;
  ['#bar-dot', '#final-dot'].forEach(function (s) { $(s).style.setProperty('--dot', f.dot); });
  qtyVal.textContent = state.qty;
}

$$('input[name="finish"]').forEach(function (input) {
  input.addEventListener('change', function () {
    state.finish = input.value;
    applyFinish(state.finish);
    configStage.user.yaw += 0.5;      // a small turn so the change reads as a change
    syncSelection();
  });
});
$('#qty-dec').addEventListener('click', function () { state.qty = Math.max(1, state.qty - 1); syncSelection(); });
$('#qty-inc').addEventListener('click', function () { state.qty = Math.min(50, state.qty + 1); syncSelection(); });
syncSelection();

var acc = $$('#spec-accordion .acc-item');
acc.forEach(function (item) {
  var btn = $('button', item);
  btn.addEventListener('click', function () {
    var open = !item.classList.contains('is-open');
    acc.forEach(function (o) { o.classList.remove('is-open'); $('button', o).setAttribute('aria-expanded', 'false'); });
    if (open) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
  });
});

/* ---------------------------------------------------------------- pilot kit */

var KIT_KEY = 'surds-g1-kit';
var kit = [];
try { kit = JSON.parse(localStorage.getItem(KIT_KEY)) || []; } catch (e) { kit = []; }
function saveKit() { try { localStorage.setItem(KIT_KEY, JSON.stringify(kit)); } catch (e) { /* storage off */ } }
function kitCount() { return kit.reduce(function (n, it) { return n + it.qty; }, 0); }

var toastEl = $('#toast'), toastTimer;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
}

function renderKit() {
  var n = kitCount(), list = $('#bag-list'), countEl = $('#bag-count');
  countEl.hidden = n === 0; countEl.textContent = n;
  $('#bag-button').setAttribute('aria-label', 'Open pilot kit, ' + n + ' item' + (n === 1 ? '' : 's'));
  list.innerHTML = '';
  $('#bag-empty').hidden = kit.length > 0;
  kit.forEach(function (it, i) {
    var f = FINISHES[it.finish];
    var li = document.createElement('li');
    li.innerHTML = '<span class="dot"></span><div class="meta"><b>SURDS G1</b><span></span></div><button type="button" class="remove">Remove</button>';
    li.querySelector('.dot').style.setProperty('--dot', f.dot);
    li.querySelector('.meta span').textContent = f.name + ' · Qty ' + it.qty;
    li.querySelector('.remove').addEventListener('click', function () { kit.splice(i, 1); saveKit(); renderKit(); });
    list.appendChild(li);
  });
}

function addToKit() {
  var hit = kit.find(function (it) { return it.finish === state.finish; });
  if (hit) hit.qty += state.qty; else kit.push({ finish: state.finish, qty: state.qty });
  saveKit(); renderKit();
  toast('Added ' + state.qty + ' × SURDS G1 · ' + FINISHES[state.finish].name + ' to your pilot kit');
}
$('#add-to-bag').addEventListener('click', addToKit);
$('#bar-add').addEventListener('click', addToKit);
renderKit();

var drawer = $('#bag-drawer'), scrim = $('#scrim'), modal = $('#request-modal');
var lastFocus = null;
function openDrawer() {
  lastFocus = document.activeElement;
  scrim.hidden = false; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false');
  $('[data-close]', drawer).focus();
}
function closeOverlays() {
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
  modal.hidden = true; scrim.hidden = true;
  if (lastFocus) lastFocus.focus();
}
function kitSummary() {
  var items = kit.length ? kit : [{ finish: state.finish, qty: state.qty }];
  return items.map(function (it) { return it.qty + ' × SURDS G1 (' + FINISHES[it.finish].name + ')'; }).join(', ');
}
function openRequest() {
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
  if (!lastFocus || !modal.hidden) lastFocus = document.activeElement;
  scrim.hidden = false; modal.hidden = false;
  $('#request-kit').textContent = 'Kit: ' + kitSummary();
  $('input', modal).focus();
}
$('#bag-button').addEventListener('click', openDrawer);
$$('[data-open-request]').forEach(function (b) { b.addEventListener('click', openRequest); });
$$('[data-close]').forEach(function (b) { b.addEventListener('click', closeOverlays); });
scrim.addEventListener('click', closeOverlays);
modal.addEventListener('click', function (e) { if (e.target === modal) closeOverlays(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeOverlays(); });

$('#request-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var d = new FormData(e.target);
  var body = [
    'Name: ' + d.get('name'),
    'Company: ' + d.get('company'),
    'Facility: ' + d.get('facility'),
    'Kit: ' + kitSummary(),
    '',
    'What failure costs us:',
    d.get('notes') || '-'
  ].join('\n');
  window.location.href = 'mailto:hello@surds.in?subject=' + encodeURIComponent('SURDS G1 pilot request: ' + d.get('company')) +
    '&body=' + encodeURIComponent(body);
  closeOverlays();
  toast('Email draft opened. Send it to reach the SURDS team.');
});

$('#newsletter-form').addEventListener('submit', function (e) {
  e.preventDefault();
  var email = $('#newsletter-email').value;
  window.location.href = 'mailto:hello@surds.in?subject=' + encodeURIComponent('SURDS pilot briefing') +
    '&body=' + encodeURIComponent('Please add ' + email + ' to the SURDS pilot briefing.');
  toast('Email draft opened. Send it to join the briefing.');
});

/* ------------------------------------------------------------ gallery stills */

function renderGallery() {
  var W = 800, H = 1000;
  var r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(W, H, false);
  r.toneMapping = THREE.ACESFilmicToneMapping;
  var scene = new THREE.Scene();
  var pmrem = new THREE.PMREMGenerator(r);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  var key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); scene.add(key);
  var rim = new THREE.DirectionalLight(0xff6aa3, 0.9); rim.position.set(-4, 2, -3); scene.add(rim);
  var mesh = new THREE.Mesh(geometry, material); scene.add(mesh);
  var cam = new THREE.PerspectiveCamera(28, W / H, 0.1, 50);
  var shots = [
    { pos: [1.5, 2.1, 2.7], look: [0, 0.75, -0.3], yaw: 0.5 },     // antenna array close-up
    { pos: [0, 0.35, 5.4], look: [0, 0.3, 0], yaw: -1.57 },        // profile
    { pos: [2.4, 4.6, 2.4], look: [0, 0.2, 0], yaw: -0.785 }       // diagonal from above
  ];
  $$('img[data-shot]').forEach(function (img) {
    var s = shots[+img.dataset.shot];
    mesh.rotation.set(0, s.yaw, 0);
    cam.position.set(s.pos[0], s.pos[1], s.pos[2]);
    cam.lookAt(s.look[0], s.look[1], s.look[2]);
    r.render(scene, cam);
    img.src = r.domElement.toDataURL('image/png');
    img.classList.add('ready');
  });
  r.dispose();
}
