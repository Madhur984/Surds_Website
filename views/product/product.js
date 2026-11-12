/* SURDS Thermal product page.
 *
 * One sensor travels down the whole page. It lives in a single fixed WebGL layer and
 * docks into empty [data-slot] boxes laid out next to the copy. Through a run of
 * consecutive story sections it stays level with the reader and slides sideways from
 * slot to slot as the text changes; where non-story sections sit in between, it simply
 * scrolls away with its slot and arrives attached to the next one. It keeps the same
 * three-quarter view throughout and only leans into each slide; it never spins.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildSensor, mats, applyFinish, FINISHES } from '/views/product/sensor-model.js';
import { ThermalDemo } from '/views/product/thermal-demo.js';

var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function smooth(t) { return t * t * (3 - 2 * t); }

var state = { finish: 'ember', qty: 1 };
applyFinish(state.finish);

/* ------------------------------------------------------------ the one scene */

var canvas = $('#product-layer');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
var scene = new THREE.Scene();
var pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;   // keeps the red-orange shell saturated instead of washing to salmon
pmrem.dispose();
var key = new THREE.DirectionalLight(0xfff1e6, 1.5); key.position.set(4, 5, 6); scene.add(key);
var warm = new THREE.DirectionalLight(0xff7a45, 0.8); warm.position.set(-5, 1, 2); scene.add(warm);
var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

var root = new THREE.Group();     // placement + scale (screen-space docking)
var lean = new THREE.Group();     // lean into the slide
var spin = new THREE.Group();     // the fixed three-quarter view
root.add(lean); lean.add(spin); scene.add(root);
var sensor = buildSensor();
spin.add(sensor.root);

var vw = 1, vh = 1, pxToWorld = 1;
function resize() {
  vw = window.innerWidth; vh = window.innerHeight;
  renderer.setSize(vw, vh, false);
  camera.aspect = vw / vh;
  camera.updateProjectionMatrix();
  pxToWorld = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z / vh;
}
window.addEventListener('resize', resize);
resize();

/* ---------------------------------------------------------------- slots */

var slots = $$('[data-slot]').map(function (el) {
  return {
    el: el, id: el.dataset.slot,
    yaw: +(el.dataset.yaw || 0.55), pitch: +(el.dataset.pitch || 0.08),
    fx: { glow: +(el.dataset.glow || 0), fov: +(el.dataset.fov || 0), ir: +(el.dataset.ir || 0) },
    hotspots: !!el.dataset.hotspots
  };
});
var bySlot = {};
slots.forEach(function (s) { bySlot[s.id] = s; });

function measure(s) {
  var r = s.el.getBoundingClientRect();
  s.cx = r.left + r.width / 2;
  s.cy = r.top + r.height / 2;                 // screen y now
  s.docY = s.cy + window.scrollY;              // document y of the slot centre
  // fit the sensor (about 2.8 wide x 2.8 tall in model units at this angle) into the box
  s.size = Math.min(r.width * 0.84 / 2.8, r.height * 0.88 / 2.8);   // px per model unit
}

/* Where the sensor should be for the current scroll position.
   Slots closer than RUN_GAP viewport heights form a run: the sensor rides with each
   slot while its section is being read, then glides down (and across) to the next
   slot as that section arrives. Further apart, it rides along with whichever slot is
   nearer and the other one is off screen. */
var RUN_GAP = 1.8;
var pose = { x: 0, y: 0, size: 0, yaw: 0.57, pitch: 0.1, glow: 0, fov: 0, ir: 0, active: null };
function targetPose() {
  slots.forEach(measure);
  var focus = window.scrollY + vh / 2, a = null, b = null;
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].docY <= focus) a = slots[i];
    else { b = slots[i]; break; }
  }
  function at(s, docY) {
    return { x: s.cx, y: docY - window.scrollY, size: s.size, yaw: s.yaw, pitch: s.pitch,
             glow: s.fx.glow, fov: s.fx.fov, ir: s.fx.ir, active: s };
  }
  if (!a) return at(b, b.docY);
  if (!b) return at(a, a.docY);
  var gap = b.docY - a.docY;
  if (gap > RUN_GAP * vh) return (focus - a.docY < b.docY - focus) ? at(a, a.docY) : at(b, b.docY);
  var t = (focus - a.docY) / gap;
  var m = REDUCED ? (t < 0.5 ? 0 : 1) : smooth(clamp((t - 0.22) / 0.56, 0, 1));
  return {
    x: lerp(a.cx, b.cx, m), y: lerp(a.docY, b.docY, m) - window.scrollY, size: lerp(a.size, b.size, m),
    yaw: lerp(a.yaw, b.yaw, m), pitch: lerp(a.pitch, b.pitch, m),
    glow: lerp(a.fx.glow, b.fx.glow, m), fov: lerp(a.fx.fov, b.fx.fov, m), ir: lerp(a.fx.ir, b.fx.ir, m),
    active: m < 0.5 ? a : b, travel: m
  };
}

/* ---------------------------------------------------------------- frame */

var hotspotLayer = $('#hotspots'), hotspots = {};
$$('[data-hs]', hotspotLayer).forEach(function (el) { hotspots[el.dataset.hs] = el; });
var activePart = 'lens';
var lastT = performance.now(), prevX = null, leanNow = 0, first = true;
var tmpP = new THREE.Vector3(), tmpN = new THREE.Vector3(), toCam = new THREE.Vector3(), q = new THREE.Quaternion();

function frame(t) {
  var dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;
  var tg = targetPose();
  // y and size follow the page exactly (so a docked sensor never drifts off its slot);
  // the view angle and effects ease so slot-to-slot changes stay gentle
  var k = first || REDUCED ? 1 : 1 - Math.pow(0.004, dt);
  pose.x = tg.x; pose.y = tg.y; pose.size = tg.size;
  pose.yaw = lerp(pose.yaw, tg.yaw, k); pose.pitch = lerp(pose.pitch, tg.pitch, k);
  pose.glow = lerp(pose.glow, tg.glow, k); pose.fov = lerp(pose.fov, tg.fov, k); pose.ir = lerp(pose.ir, tg.ir, k);
  pose.active = tg.active;
  first = false;
  // single-column layouts put the copy right under the slot, so let the sensor fade
  // back while it glides past text; side-by-side layouts never cross the copy
  var m = tg.travel == null ? 0 : tg.travel;
  canvas.style.opacity = vw <= 760 ? (0.18 + 0.82 * Math.abs(1 - 2 * m)).toFixed(3) : '1';

  // lean into horizontal travel, settle when it stops
  var vx = prevX == null || dt === 0 ? 0 : (pose.x - prevX) / dt;
  prevX = pose.x;
  var leanTarget = REDUCED ? 0 : clamp(-vx * 0.00035, -0.2, 0.2);
  leanNow = lerp(leanNow, leanTarget, 1 - Math.pow(0.001, dt));

  var s = pose.size * pxToWorld;
  root.position.set((pose.x - vw / 2) * pxToWorld, -(pose.y - vh / 2) * pxToWorld, 0);
  root.scale.setScalar(s);
  lean.rotation.set(0, 0, leanNow);
  var bob = REDUCED ? 0 : Math.sin(t * 0.0012) * 0.03;
  spin.rotation.set(pose.pitch, pose.yaw, 0, 'XYZ');
  spin.position.y = bob;

  var pulse = REDUCED ? 1 : 0.65 + 0.35 * Math.sin(t * 0.006);
  mats.ir.opacity = pose.ir * 0.22 * pulse;
  mats.fov.opacity = pose.fov * 0.1 * (REDUCED ? 1 : 0.8 + 0.2 * Math.sin(t * 0.002));
  mats.optic.emissiveIntensity = pose.glow * 0.55;
  mats.led.emissiveIntensity = 1.6 + (REDUCED ? 0 : 0.8 * Math.sin(t * 0.003));
  sensor.irBeam.visible = mats.ir.opacity > 0.004;
  sensor.fov.visible = mats.fov.opacity > 0.003;

  var onScreen = pose.y > -pose.size * 2 && pose.y < vh + pose.size * 2;
  root.visible = onScreen;
  renderer.render(scene, camera);

  // anatomy hotspots ride on the sensor while it is docked in the anatomy slot
  var showHs = onScreen && pose.active && pose.active.hotspots && Math.abs(pose.y - pose.active.cy) < 2;
  hotspotLayer.classList.toggle('on', !!showHs);
  if (showHs) placeHotspots();

  requestAnimationFrame(frame);
}

function placeHotspots() {
  var body = sensor.body, anchors = sensor.anchors;
  scene.updateMatrixWorld();
  body.getWorldQuaternion(q);
  Object.keys(anchors).forEach(function (name) {
    var el = hotspots[name]; if (!el) return;
    var a = anchors[name];
    tmpP.copy(a.p); body.localToWorld(tmpP);
    tmpN.copy(a.n).applyQuaternion(q);
    toCam.copy(camera.position).sub(tmpP).normalize();
    var facing = tmpN.dot(toCam) > 0.3;
    tmpP.project(camera);
    el.style.transform = 'translate(' + ((tmpP.x * 0.5 + 0.5) * vw).toFixed(1) + 'px,' + ((-tmpP.y * 0.5 + 0.5) * vh).toFixed(1) + 'px)';
    el.classList.toggle('hidden', !facing);
    el.classList.toggle('active', name === activePart);
  });
}
requestAnimationFrame(frame);

/* Ghost words and the orbit ring sit under the sensor, positioned from the layout. */
var under = $('#under-layer'), ring = $('#hero-ring'), ghostHero = $('#ghost-hero'), ghostFinal = $('#ghost-final');
function placeUnder() {
  under.style.height = document.documentElement.scrollHeight + 'px';
  var r = bySlot.hero.el.getBoundingClientRect(), y = r.top + window.scrollY + r.height / 2;
  var d = Math.min(window.innerHeight * 0.64, r.width * 0.74);
  ring.style.left = (r.left + r.width / 2) + 'px'; ring.style.top = y + 'px';
  ring.style.width = ring.style.height = d + 'px';
  ghostHero.style.top = (y - r.height * 0.06) + 'px';
  var f = $('#final');
  ghostFinal.style.top = (f.offsetTop + f.offsetHeight) + 'px';
}
window.addEventListener('resize', placeUnder);
window.addEventListener('load', placeUnder);
new ResizeObserver(placeUnder).observe(document.body);
placeUnder();

// nothing to download for the model, so the loader only covers first paint + fonts
var loader = $('#loader'), fill = $('#loader-fill');
fill.style.width = '60%';
(document.fonts ? document.fonts.ready : Promise.resolve()).then(function () {
  fill.style.width = '100%';
  setTimeout(function () { loader.classList.add('done'); }, 350);
});
setTimeout(function () { loader.classList.add('done'); }, 4000);

/* ------------------------------------------------------------- anatomy */

var PART_FX = { lens: { glow: 1 }, ir: { ir: 0.8 } };
var partBtns = $$('#parts [data-part]');
function focusPart(name) {
  activePart = name;
  var fx = PART_FX[name] || {};
  var slot = bySlot.anatomy;
  slot.fx.glow = fx.glow || 0; slot.fx.ir = fx.ir || 0; slot.fx.fov = 0;
  partBtns.forEach(function (b) { b.classList.toggle('is-active', b.dataset.part === name); });
}
partBtns.forEach(function (b) { b.addEventListener('click', function () { focusPart(b.dataset.part); }); });
focusPart('lens');

/* ------------------------------------------------------ header / nav / bar */

var header = $('#site-header'), buyBar = $('#buy-bar'), hero = $('#top'), finalSection = $('#final'), navLinks = $$('.desktop-nav a');
function onScroll() {
  header.classList.toggle('scrolled', window.scrollY > 40);
  var past = hero.getBoundingClientRect().bottom < vh * 0.4;
  var atEnd = finalSection.getBoundingClientRect().top < vh * 0.85;
  var show = past && !atEnd;
  buyBar.classList.toggle('show', show);
  buyBar.setAttribute('aria-hidden', show ? 'false' : 'true');
}
window.addEventListener('scroll', onScroll, { passive: true });
window.addEventListener('resize', onScroll);
onScroll();

var navObs = new IntersectionObserver(function (es) {
  es.forEach(function (e) {
    if (!e.isIntersecting) return;
    var id = e.target.id;
    if (id === 'sense' || id === 'act' || id === 'trust' || id === 'what' || id === 'how') id = 'see';
    navLinks.forEach(function (a) { a.classList.toggle('is-current', a.dataset.nav === id); });
  });
}, { rootMargin: '-45% 0px -50% 0px' });
['see', 'sense', 'act', 'trust', 'what', 'how', 'demo', 'anatomy', 'uses', 'specs'].forEach(function (id) { navObs.observe(document.getElementById(id)); });

var revealObs = new IntersectionObserver(function (es) {
  es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); revealObs.unobserve(e.target); } });
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

var accItems = $$('#spec-accordion .acc-item');
accItems.forEach(function (item) {
  var btn = $('button', item);
  btn.addEventListener('click', function () {
    var open = !item.classList.contains('is-open');
    accItems.forEach(function (o) { o.classList.remove('is-open'); $('button', o).setAttribute('aria-expanded', 'false'); });
    if (open) { item.classList.add('is-open'); btn.setAttribute('aria-expanded', 'true'); }
  });
});

/* --------------------------------------------------------------- finishes */

var FINISH_COPY = {
  ember: 'Orange shell, dark glass face. Meant to be seen: people know the room is heat-aware.',
  navy: 'Navy shell, dark glass face. Disappears into dark ceilings, server rooms and AV racks.',
  chalk: 'Chalk shell, dark glass face. Blends into white walls, clean rooms and hotel rooms.'
};
function syncFinish() {
  var f = FINISHES[state.finish];
  $('#finish-desc').textContent = FINISH_COPY[state.finish];
  $('#finish-caption').textContent = f.name;
  $('#bar-finish').textContent = f.name;
  $('#final-summary').textContent = f.name + ' / Qty ' + state.qty;
  $$('[data-finish-label]').forEach(function (el) { el.textContent = f.name; });
  ['#bar-dot', '#final-dot'].forEach(function (s) { $(s).style.setProperty('--dot', f.dot); });
  $('#qty-val').textContent = state.qty;
}
$$('input[name="finish"]').forEach(function (input) {
  input.addEventListener('change', function () {
    state.finish = input.value;
    applyFinish(state.finish);
    syncFinish();
  });
});
$('#qty-dec').addEventListener('click', function () { state.qty = Math.max(1, state.qty - 1); syncFinish(); });
$('#qty-inc').addEventListener('click', function () { state.qty = Math.min(50, state.qty + 1); syncFinish(); });
syncFinish();

/* -------------------------------------------------------------- pilot kit */

var KIT_KEY = 'surds-thermal-kit';
var kit = [];
try { kit = JSON.parse(localStorage.getItem(KIT_KEY)) || []; } catch (e) { kit = []; }
kit = kit.filter(function (it) { return FINISHES[it.finish]; });
function saveKit() { try { localStorage.setItem(KIT_KEY, JSON.stringify(kit)); } catch (e) { /* storage off */ } }

var toastEl = $('#toast'), toastTimer;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
}

function renderKit() {
  var n = kit.reduce(function (s, it) { return s + it.qty; }, 0), list = $('#bag-list'), count = $('#bag-count');
  count.hidden = n === 0; count.textContent = n;
  $('#bag-button').setAttribute('aria-label', 'Open pilot kit, ' + n + ' item' + (n === 1 ? '' : 's'));
  list.innerHTML = '';
  $('#bag-empty').hidden = kit.length > 0;
  kit.forEach(function (it, i) {
    var f = FINISHES[it.finish], li = document.createElement('li');
    li.innerHTML = '<span class="dot"></span><div class="meta"><b>SURDS Thermal</b><span></span></div><button type="button" class="remove">Remove</button>';
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
  toast('Added ' + state.qty + ' × SURDS Thermal (' + FINISHES[state.finish].short + ') to your pilot kit');
}
$('#add-to-bag').addEventListener('click', addToKit);
$('#bar-add').addEventListener('click', addToKit);
renderKit();

var drawer = $('#bag-drawer'), scrim = $('#scrim'), modal = $('#request-modal'), lastFocus = null;
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
  return items.map(function (it) { return it.qty + ' × SURDS Thermal (' + FINISHES[it.finish].name + ')'; }).join(', ');
}
function openRequest() {
  if (modal.hidden && !drawer.classList.contains('open')) lastFocus = document.activeElement;
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true');
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
  var body = ['Name: ' + d.get('name'), 'Company: ' + d.get('company'), 'Room type: ' + d.get('facility'),
              'Kit: ' + kitSummary(), '', 'What we want it to do:', d.get('notes') || '-'].join('\n');
  window.location.href = 'mailto:hello@surds.in?subject=' + encodeURIComponent('SURDS Thermal pilot request: ' + d.get('company')) +
    '&body=' + encodeURIComponent(body);
  closeOverlays();
  toast('Email draft opened. Send it to reach the SURDS team.');
});

/* -------------------------------------------------------------- live demo */

new ThermalDemo($('#thermal-demo'));
