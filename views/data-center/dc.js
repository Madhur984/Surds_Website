/* SURDS · Inside a data center.
   A procedural five-level data center in three.js that comes apart as you scroll.
   Level 0 plant · 1 power & ops · 2 network & AI · 3 data hall · 4 roof.
   Static geometry is merged per material per level after building (few draw calls);
   racks, LEDs and tiles are instanced. Units are metres, Y is up, the camera looks in from +X/+Z. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildModel, W, D, H, RF, FLOORS, FIG, FLOWS, FLOOR_OF } from "./dc-model.js?v=2";
import { LEARN, LEVEL_SIMPLE } from "./dc-learn.js?v=1";

const GAP = 17, LIFT = 90;
let STAG = 24;   // exploded: levels cascade along the screen diagonal, STAG m apart sideways        // footprint, storey, explode gap, lift-away, raised floor
const AZ = Math.PI / 4;
const SIDE = [Math.cos(AZ), -Math.sin(AZ)];                       // world direction that reads as screen-right at the default view
const side = (i, e = 1) => STAG * (i - 2) * e;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrowQ = matchMedia("(max-width: 900px)");
const V3 = THREE.Vector3, UP = new V3(0, 1, 0);

// ============================================================ renderer, scene, light
const canvas = document.getElementById("dc3d");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, narrowQ.matches ? 1.5 : 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.38;
const camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);
const hemi = new THREE.HemisphereLight(0xe3e9f5, 0x1a1a1a, 1.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 220 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

const STEP_KEYS = ["intro", "explode", "fpower", "fheat", "fdata", "roof", "hall", "net", "power", "plant", "outro"];


// ============================================================ build
const floors = [];
const overlay = document.getElementById("overlay");
let M, LEDS, SPIN, RINGS;
function build() {
  const model = buildModel(renderer);
  ({ M, LEDS, SPIN, RINGS } = model);
  model.floors.forEach(({ g, walls, F }, i) => {
    scene.add(g);
    const tag = document.createElement("div"); tag.className = "ftag"; tag.innerHTML = `<b>${i}</b>${F.name}`; overlay.appendChild(tag);
    const pins = F.parts.map((p, n) => {
      const el = document.createElement("button"); el.type = "button"; el.className = "pin off" + (p[3] ? " surds" : "");
      el.innerHTML = `<i>${p[3] ? "S" : n + 1}</i><span>${p[0]}</span>`; el.setAttribute("aria-label", p[0]);
      el.addEventListener("click", (e) => { e.stopPropagation(); openCard(i, n); });
      overlay.appendChild(el); return { el, local: new V3(...p[2]) };
    });
    floors.push({ g, walls, tag, pins, F });
  });
  document.querySelectorAll(".step[data-floor]").forEach((sec) => {
    const s = LEVEL_SIMPLE[FLOORS[+sec.dataset.floor].key]; if (!s) return;
    const el = document.createElement("p"); el.className = "simple"; el.innerHTML = `<b>In simple words</b>${s}`;
    sec.querySelector("h2").after(el);
  });
  // section part lists mirror the pins
  document.querySelectorAll(".step[data-floor]").forEach((sec) => {
    const i = +sec.dataset.floor, ol = sec.querySelector(".parts");
    FLOORS[i].parts.forEach((p, n) => {
      const li = document.createElement("li"); if (p[3]) li.className = "surds";
      li.innerHTML = `<button type="button"><b>${p[3] ? "S" : n + 1}</b>${p[0]}</button>`;
      li.querySelector("button").addEventListener("click", () => openCard(i, n));
      ol.appendChild(li);
    });
  });
}

// ============================================================ part card
const card = document.getElementById("partCard");
let cardAt = null;    // {i, n}
function openCard(i, n) {
  const p = FLOORS[i].parts[n];
  document.getElementById("pcN").textContent = p[3] ? `Level ${i} · SURDS` : `Level ${i} · ${n + 1}`;
  document.getElementById("pcTitle").textContent = p[0];
  const L = LEARN[p[0]], esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  document.getElementById("pcText").innerHTML = L
    ? [["What it is", L.is], ["Why it matters", L.why], ["If it goes wrong", L.wrong], ["What SURDS watches", L.surds]]
        .map(([h, t], k) => `<span class="pc-h${k === 3 ? " s" : ""}">${h}</span>${esc(t)}`).join("<br>")
    : esc(p[1]);
  document.getElementById("pcFig").textContent = FIG[p[0]] || "";
  card.hidden = false; cardAt = { i, n };
  floors.forEach((f, fi) => f.pins.forEach((q, qi) => q.el.classList.toggle("on", fi === i && qi === n)));
  document.querySelectorAll(".step[data-floor]").forEach((sec) => sec.querySelectorAll(".parts button").forEach((b, bi) => b.classList.toggle("on", +sec.dataset.floor === i && bi === n)));
  const key = FLOORS[i].key; if (Math.abs(scrollS - STEP_KEYS.indexOf(key)) > 0.4) goTo(key);
}
function closeCard() { card.hidden = true; cardAt = null; document.querySelectorAll(".pin.on,.parts button.on").forEach((e) => e.classList.remove("on")); }
card.querySelector(".pc-x").addEventListener("click", closeCard);
addEventListener("keydown", (e) => { if (e.key === "Escape") closeCard(); });

// ============================================================ scroll → camera choreography
const sections = [...document.querySelectorAll(".step")];
function goTo(key) { const s = sections[STEP_KEYS.indexOf(key)]; if (s) s.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }
document.querySelectorAll(".rail button").forEach((b) => b.addEventListener("click", () => goTo(b.dataset.go)));
const railBtns = [...document.querySelectorAll(".rail button")];

let DIST = { intro: 120, overview: 200, floor: 70, roof: 74 };
function keyState(key) {
  const s = { explode: 1, lift: [0, 0, 0, 0, 0], facade: 0, az: AZ, el: 0.44, dist: DIST.overview, ty: 2 * (H + GAP) + H / 2, tx: 0, tz: 0, night: 0 };
  if (key === "intro") Object.assign(s, { explode: 0, facade: 1, el: 0.464, dist: DIST.intro, ty: 2 * H, tx: 0, tz: 0, night: 1 });
  else if (key === "outro") s.az = AZ + 0.1;
  else if (key === "fdata") Object.assign(s, { ty: 2.5 * (H + GAP), tx: side(2.5) * SIDE[0], tz: side(2.5) * SIDE[1], dist: DIST.overview * 0.6, el: 0.5 });
  else if (key in FLOOR_OF) {
    const i = FLOOR_OF[key]; for (let j = 0; j < 5; j++) if (j !== i) s.lift[j] = j > i ? 1 : -1;   // the others clear out: above lift away, below drop away
    Object.assign(s, { el: i === 4 ? 0.62 : 0.5, dist: i === 4 ? DIST.roof : DIST.floor, ty: i * (H + GAP) + 2.2, tx: side(i) * SIDE[0], tz: side(i) * SIDE[1] });
  }
  return s;
}
const KEYS = STEP_KEYS.map(keyState);
function mix(a, b, t) {
  const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => v + (b[k][i] - v) * t) : a[k] + (b[k] - a[k]) * t; return o;
}
let scrollS = 0;
function readScroll() {
  const v = scrollY + innerHeight / 2, c = sections.map((s) => s.offsetTop + s.offsetHeight / 2);
  if (v <= c[0]) return 0; if (v >= c[c.length - 1]) return c.length - 1;
  for (let i = 0; i < c.length - 1; i++) if (v < c[i + 1]) return i + (v - c[i]) / (c[i + 1] - c[i]);
  return 0;
}
const smooth = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
function targetState() {
  const k = Math.floor(scrollS), f = scrollS - k;
  if (k >= KEYS.length - 1) return KEYS[KEYS.length - 1];
  return mix(KEYS[k], KEYS[k + 1], smooth(0.18, 0.82, f));
}
let cur = null;

// drag to turn
let dragAz = 0, dragEl = 0, drag = null;
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, az: dragAz, el: dragEl }; canvas.classList.add("drag"); canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", (e) => { if (!drag) return; dragAz = drag.az - (e.clientX - drag.x) * 0.006; dragEl = Math.max(-0.25, Math.min(0.5, drag.el + (e.clientY - drag.y) * 0.004)); });
const endDrag = () => { drag = null; canvas.classList.remove("drag"); };
canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);

// ============================================================ layout
let vw = 1, vh = 1, wide = true;
function resize() {
  vw = innerWidth; vh = innerHeight; wide = vw > 900; STAG = wide ? 24 : 7;   // phones: a near-vertical stack that fits the width
  renderer.setSize(vw, vh, false); camera.aspect = vw / vh;
  if (wide) camera.setViewOffset(vw, vh, -vw * 0.1, 0, vw, vh); else camera.setViewOffset(vw, vh, 0, vh * 0.17, vw, vh);
  camera.updateProjectionMatrix();
  const portrait = vw / vh < 1, k = portrait ? 1.9 : (vw / vh < 1.45 ? 1.25 : 1);
  DIST = { intro: 132 * k, overview: 246 * k, floor: 104 * k, roof: 106 * k };
  STEP_KEYS.forEach((key, i) => { KEYS[i] = keyState(key); });
}
addEventListener("resize", resize);

// ============================================================ flow overlay
const NSV = "http://www.w3.org/2000/svg";
const flowSvg = document.createElementNS(NSV, "svg"); flowSvg.id = "flowSvg"; overlay.appendChild(flowSvg);
const FLOWUI = {};
function initFlows() {
  for (const [key, F] of Object.entries(FLOWS)) {
    const g = document.createElementNS(NSV, "g"); flowSvg.appendChild(g);
    const lines = F.lines.map((l) => {
      const col = l.color || F.color, glow = document.createElementNS(NSV, "path"), core = document.createElementNS(NSV, "path");
      glow.setAttribute("class", "g"); core.setAttribute("class", "c" + (l.dash ? " dash" : ""));
      glow.setAttribute("stroke", col); core.setAttribute("stroke", col); g.append(glow, core);
      return { l, glow, core };
    });
    const stages = F.stages.map((st, n) => {
      const el = document.createElement("div"); el.className = "fstage"; el.style.setProperty("--fc", F.color);
      el.innerHTML = `<b>${n + 1}</b><span>${st[4]}</span>`; overlay.appendChild(el); return { st, el };
    });
    FLOWUI[key] = { g, lines, stages, idx: STEP_KEYS.indexOf(key) };
  }
}
const toScreen = (p) => {
  const w = floors[p[0]].g.localToWorld(new V3(p[1], p[2], p[3])).project(camera);
  return [(w.x * 0.5 + 0.5) * vw, (-w.y * 0.5 + 0.5) * vh, w.z < 1];
};
function drawFlows() {
  for (const ui of Object.values(FLOWUI)) {
    const vis = Math.max(0, 1 - Math.abs(scrollS - ui.idx) * 2.2);
    ui.g.style.opacity = vis; ui.g.style.display = vis > 0.01 ? "" : "none";
    for (const s of ui.stages) s.el.style.opacity = vis;
    if (vis <= 0.01) { for (const s of ui.stages) s.el.style.transform = "translate(-999px,-999px)"; continue; }
    for (const ln of ui.lines) {
      const d = ln.l.pts.map((p, i) => { const q = toScreen(p); return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("");
      ln.glow.setAttribute("d", d); ln.core.setAttribute("d", d);
    }
    for (const s of ui.stages) { const q = toScreen(s.st); s.el.style.transform = `translate(${q[0].toFixed(1)}px,${q[1].toFixed(1)}px)`; }
  }
}

// ============================================================ frame loop
let shadowFloor = -2, lastLed = 0, t0 = performance.now(), prev = t0;
const tmpV = new V3();
function setShadowFloor(i) {
  if (i === shadowFloor) return; shadowFloor = i;
  floors.forEach((f, fi) => f.g.traverse((o) => { if (o.isMesh) o.castShadow = fi === i && !!o.userData.caster; }));
}
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now; const t = (now - t0) / 1000;
  scrollS = readScroll();
  const tgt = targetState();
  if (!cur) cur = JSON.parse(JSON.stringify(tgt));
  const a = 1 - Math.exp(-dt * (reduce ? 30 : 5));
  cur = mix(cur, tgt, a);
  // floors
  const intro = 1 - smooth(0, 1, scrollS);
  const az = cur.az + dragAz + (reduce ? 0 : 0.22 * Math.sin(t * 0.13) * intro), el = Math.max(0.05, Math.min(1.2, cur.el + dragEl));
  const cdx = Math.sin(az), cdz = Math.cos(az);
  floors.forEach((f, i) => {
    f.g.position.set(side(i, cur.explode) * SIDE[0], i * H + cur.explode * i * GAP + cur.lift[i] * LIFT, side(i, cur.explode) * SIDE[1]);
    for (const w of f.walls) {                       // cut away whichever walls face the camera
      const facing = w.n[0] * cdx + w.n[1] * cdz > 0.15, o = facing ? cur.facade : 1;
      for (const m of w.mats) { m.opacity = o; m.depthWrite = o > 0.98; }
      for (const m of w.meshes) m.visible = o > 0.01;
    }
  });
  // camera
  const target = tmpV.set(cur.tx, cur.ty, cur.tz);
  camera.position.set(target.x + cur.dist * Math.cos(el) * Math.sin(az), target.y + cur.dist * Math.sin(el), target.z + cur.dist * Math.cos(el) * Math.cos(az));
  camera.lookAt(target);
  sun.position.set(target.x + 28, target.y + 46, target.z + 18); sun.target.position.copy(target);
  const nt = cur.night || 0;
  hemi.intensity = 1.45 - 1.05 * nt; sun.intensity = 2.5 - 1.5 * nt; sun.color.setRGB(1 - 0.25 * nt, 1 - 0.15 * nt, 1); scene.environmentIntensity = 0.38 - 0.28 * nt;
  scene.updateMatrixWorld(); camera.updateMatrixWorld();
  // which level is in focus
  const near = Math.round(scrollS), key = STEP_KEYS[near], fi = key in FLOOR_OF ? FLOOR_OF[key] : -1, focus = fi >= 0 && Math.abs(scrollS - near) < 0.32;
  setShadowFloor(focus ? fi : -1);
  railBtns.forEach((b) => b.classList.toggle("on", b.dataset.go === key || (b.dataset.go === "explode" && (key === "explode" || key === "outro"))));
  drawFlows();
  if (cardAt && Math.abs(scrollS - STEP_KEYS.indexOf(FLOORS[cardAt.i].key)) > 0.6) closeCard();
  // pins + tags
  floors.forEach((f, i) => {
    const show = focus && i === fi;
    f.pins.forEach((p, n) => {
      if (!show) { p.el.classList.add("off"); return; }
      const w = f.g.localToWorld(p.local.clone()).project(camera);
      const x = (w.x * 0.5 + 0.5) * vw, y = (-w.y * 0.5 + 0.5) * vh, ok = w.z < 1 && x > -40 && x < vw + 40 && y > 40 && y < vh;
      p.el.classList.toggle("off", !ok); p.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      if (cardAt && cardAt.i === i && cardAt.n === n && wide) {
        const cw = card.offsetWidth, ch = card.offsetHeight;
        let cx = x + 26, cy = y - ch / 2; if (cx + cw > vw - 16) cx = x - cw - 26;
        card.style.left = Math.max(16, cx) + "px"; card.style.top = Math.min(vh - ch - 16, Math.max(80, cy)) + "px";
      }
    });
    const showTag = !focus && cur.explode > 0.6 && cur.lift[i] < 0.1;
    const w = f.g.localToWorld(new V3(-W / 2, 0.6, D / 2)).project(camera);
    f.tag.style.opacity = showTag ? 1 : 0;
    f.tag.style.transform = `translate(${((w.x * 0.5 + 0.5) * vw - 8).toFixed(1)}px,${((-w.y * 0.5 + 0.5) * vh - 10).toFixed(1)}px) translateX(-100%)`;
  });
  // life: fans, LEDs, sensor pulses
  if (!reduce) {
    for (const s of SPIN) s.rotation.y += dt * 7;
    const pulse = (t % 1.6) / 1.6; for (const r of RINGS) r.scale.setScalar(1 + pulse * 2.2); M.ring.opacity = 0.7 * (1 - pulse);
    if (now - lastLed > 110) {
      lastLed = now; const c = new THREE.Color();
      for (const im of LEDS) { for (let k = 0; k < im.count * 0.08; k++) { const i = (Math.random() * im.count) | 0; const r = Math.random(); im.setColorAt(i, c.set(r < 0.55 ? 0x3ddc84 : r < 0.75 ? 0x0b2a16 : r < 0.92 ? 0x2a6cff : 0xf5a623)); } im.instanceColor.needsUpdate = true; }
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ============================================================ go
(async () => {
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* fonts are optional for the canvases */ }
  build(); resize(); initFlows();
  requestAnimationFrame((n) => { prev = n; frame(n); document.getElementById("loading").classList.add("done"); });
})();
