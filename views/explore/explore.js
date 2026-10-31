/* SURDS · Explore the data center.
   Photoreal stills (tools/explore_render.py) sit on top of a live three.js copy of the same model
   (views/data-center/dc-model.js), shot from the same cameras (views.json). Choosing a level fades the
   still out, flies the live camera in through the facade, and fades the next still in on arrival. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildModel, W, D, H, FLOORS, FIG } from "/views/data-center/dc-model.js?v=2";
import { LEARN } from "/views/data-center/dc-learn.js?v=1";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const V3 = THREE.Vector3;
const $ = (id) => document.getElementById(id);
const VIEWS = await (await fetch("/views/explore/views.json?v=2")).json();
const IMG = (name) => `/views/explore/img/${name}.webp?v=1`;

// copy for each level (same story as /data-center)
const LEVEL = {
  plant: { name: "Plant", text: "Diesel generators, fuel, chillers and pumps: everything the racks upstairs depend on.", facts: [["Generators", "4 × 2.5 MW"], ["Fuel", "~48 h"], ["Chillers", "3"]] },
  power: { name: "Power and operations", text: "Switchgear, UPS and batteries hold the load until the generators take over. The control room watches all of it.", facts: [["Systems", "A + B"], ["Battery", "~10 min"], ["Staffed", "24/7"]] },
  net:   { name: "Network and AI", text: "Carriers hand over their fibre in the meet-me room. Next door, liquid-cooled GPU racks train AI.", facts: [["Carriers", "4"], ["GPU racks", "40"], ["Per rack", "40–100 kW"]] },
  hall:  { name: "Data hall", text: "Hundreds of racks in sealed aisles, fed cold air from under the floor and power and fibre from above.", facts: [["Racks", "448"], ["Per rack", "5–15 kW"], ["Air in", "18–27 °C"]] },
  roof:  { name: "Roof", text: "Every watt a server uses ends up as heat. The roof throws it into the outside air.", facts: [["Cooling units", "6"], ["Fans", "48"], ["Heat out", "~5 MW"]] },
};
const SPOT_TEXT = {
  "plant-main": "Generators, fuel, chillers and pumps. Point at any machine to see what it does.",
  "plant-gens": "Four diesel generators. If the grid fails, they start and carry the whole building in about ten seconds.",
  "power-main": "The control room watches every level, around the clock. The power rooms sit behind the glass.",
  "power-ups": "Two separate UPS and battery systems, A and B. Either one can carry every rack on its own.",
  "net-main": "Immersion tanks, GPU racks and the network core. This is where the internet enters the building.",
  "net-gpu": "Liquid-cooled GPU racks. Water-cooled doors take the heat straight out of the exhaust air.",
  "hall-main": "Rows of server racks in sealed cold aisles, fed cold air from under the floor.",
  "hall-aisle": "Racks face each other across the sealed aisle, so cold air only reaches the servers' intakes.",
  "roof-main": "Six cooling units in white steel frames push the building's heat into the night air.",
};
const KEYS = VIEWS.levels.map((l) => l.key);

// ============================================================ live scene
const canvas = $("live");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
{ // dusk sky to match the renders
  const c = document.createElement("canvas"); c.width = 4; c.height = 256; const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, "#3c6fb0"); g.addColorStop(0.55, "#8fb1d8"); g.addColorStop(0.78, "#f0c8a0"); g.addColorStop(1, "#5a5650");
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xdfe9f8, 0x5a5348, 1.7));
const key = new THREE.DirectionalLight(0xffc896, 2.2); key.position.set(-35, 9, 90); scene.add(key);   // low golden sun, as in the renders
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6f675c, roughness: 0.6, metalness: 0.0 }));
ground.position.y = -0.53; scene.add(ground);
const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 3000);
let model = null;
function buildLive() {
  model = buildModel(renderer);
  model.floors.forEach(({ g }, i) => { g.position.set(0, i * H, 0); scene.add(g); });
  // match the photoreal stills: champagne-bronze facade, brighter lit rooms
  scene.traverse((o) => { const m = o.material; if (!m || Array.isArray(m)) return;
    if (m.name === "pier") { m.color.set(0x8f8474); m.metalness = 0.55; m.roughness = 0.35; }
    if (m.name === "window") m.emissiveIntensity = 1.6; });
}

// ============================================================ camera state, with object-fit: cover framing
let vw = innerWidth, vh = innerHeight;
const cam = { pos: new V3(), look: new V3(), fov: 40 };
function setCam(s) { cam.pos.copy(s.pos); cam.look.copy(s.look); cam.fov = s.fov; }
function applyCam() {
  const a = vw / vh, base = 16 / 9;
  camera.aspect = a;
  camera.fov = a > base ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * base / a)) : cam.fov;
  camera.position.copy(cam.pos); camera.lookAt(cam.look); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const view = (v) => ({ pos: new V3(...v.pos), look: new V3(...v.look), fov: v.fov });
const TOWER = view(VIEWS.tower);
const spotOf = (k, id) => VIEWS.levels.find((l) => l.key === k).spots.find((s) => s.id === id);
function project(p) {
  const w = p.clone().project(camera);
  return { x: (w.x * 0.5 + 0.5) * vw, y: (-w.y * 0.5 + 0.5) * vh, ok: w.z < 1 && w.z > -1 };
}

// ============================================================ stills
const still = $("still");
const cache = {};
function preload(name) {
  if (!cache[name]) { const im = new Image(); im.src = IMG(name); cache[name] = im.decode().catch(() => {}); }
  return cache[name];
}
const wait = (ms) => new Promise((r) => setTimeout(r, reduce ? 0 : ms));
let liveOn = false;
async function toLive() { liveOn = true; applyCam(); renderer.render(scene, camera); still.classList.add("out"); await wait(560); }
async function toStill(name) {
  await preload(name); still.src = IMG(name);
  try { await still.decode(); } catch (e) { /* shown when ready */ }
  still.classList.remove("out"); await wait(600); liveOn = false;
}

// ============================================================ flights
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bez = (a, b, c, d, t) => { const u = 1 - t; return a.clone().multiplyScalar(u * u * u).add(b.clone().multiplyScalar(3 * u * u * t)).add(c.clone().multiplyScalar(3 * u * t * t)).add(d.clone().multiplyScalar(t * t * t)); };
let hidden = [];
function hideWall(i, n) { for (const w of model.floors[i].walls) if (w.n[0] === n[0] && w.n[1] === n[1]) for (const m of w.meshes) { m.visible = false; hidden.push(m); } }
function showWalls() { for (const m of hidden) m.visible = true; hidden = []; }
function entryFor(level, to) {   // the wall nearest the target spot, among those facing the tower camera
  const walls = [[1, 0, W / 2 - to.pos.x], [-1, 0, to.pos.x + W / 2], [0, 1, D / 2 - to.pos.z], [0, -1, to.pos.z + D / 2]]
    .filter(([nx, nz]) => nx * (TOWER.pos.x) + nz * (TOWER.pos.z) > 0);
  const [nx, nz] = walls.sort((a, b) => a[2] - b[2])[0];
  const out = to.pos.clone(); if (nx) out.x = nx * (W / 2 + 14); else out.z = nz * (D / 2 + 14);
  return { n: [nx, nz], out };
}
function fly(path, ms, onT) {
  return new Promise((done) => {
    if (reduce) { onT(1); applyCam(); renderer.render(scene, camera); return done(); }
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms); onT(ease(t)); applyCam(); renderer.render(scene, camera);
      if (t < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  });
}
async function flyIn(level, to) {
  const i = KEYS.indexOf(level), { n, out } = entryFor(level, to), A = TOWER;
  const c1 = A.pos.clone().lerp(out, 0.45); c1.y = THREE.MathUtils.lerp(A.pos.y, to.pos.y, 0.7);
  const lookMid = new V3(to.pos.x, to.pos.y - 0.3, n[1] ? 0 : to.pos.z);
  let wallGone = false;
  await fly(null, 3400, (t) => {
    cam.pos.copy(bez(A.pos, c1, out, to.pos, t));
    const lt = Math.min(1, t * 1.25);
    cam.look.copy(t < 0.5 ? A.look.clone().lerp(lookMid, lt / 0.625) : lookMid.clone().lerp(to.look, (t - 0.5) / 0.5));
    cam.fov = THREE.MathUtils.lerp(A.fov, to.fov, t);
    if (!wallGone && t > 0.72) { hideWall(i, n); wallGone = true; }
  });
}
async function flyOut(level, from) {
  const i = KEYS.indexOf(level), { n, out } = entryFor(level, from), B = TOWER;
  hideWall(i, n);
  const c2 = B.pos.clone().lerp(out, 0.45); c2.y = THREE.MathUtils.lerp(B.pos.y, from.pos.y, 0.7);
  const lookMid = new V3(from.pos.x, from.pos.y - 0.3, n[1] ? 0 : from.pos.z);
  let back = false;
  await fly(null, 3000, (t) => {
    cam.pos.copy(bez(from.pos, out, c2, B.pos, t));
    cam.look.copy(t < 0.5 ? from.look.clone().lerp(lookMid, t / 0.5) : lookMid.clone().lerp(B.look, (t - 0.5) / 0.5));
    cam.fov = THREE.MathUtils.lerp(from.fov, B.fov, t);
    if (!back && t > 0.35) { showWalls(); back = true; }
  });
}
async function flyAcross(from, to) {
  const mid = from.pos.clone().lerp(to.pos, 0.5); mid.y += 0.6;
  await fly(null, 2000, (t) => {
    cam.pos.copy(bez(from.pos, from.pos.clone().lerp(mid, 0.6), to.pos.clone().lerp(mid, 0.6), to.pos, t));
    cam.look.copy(from.look.clone().lerp(to.look, t)); cam.fov = THREE.MathUtils.lerp(from.fov, to.fov, t);
  });
}

// ============================================================ tower: choose your level
let sel = 3, state = { where: "tower" }, busy = false;
const svg = $("floors"), NS = "http://www.w3.org/2000/svg";
const polys = KEYS.map((k, i) => {
  const p = document.createElementNS(NS, "polygon"); p.dataset.i = i; svg.appendChild(p);
  p.addEventListener("pointerenter", () => select(i, true));
  p.addEventListener("click", () => enter(i));
  return p;
});
function hull(pts) {
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of pts.slice().reverse()) { while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function layoutFloors() {
  setCam(TOWER); applyCam();
  polys.forEach((p, i) => {
    const y0 = i * H - 0.3, y1 = i === 4 ? 4 * H + 5.6 : (i + 1) * H - 0.3, pts = [];
    for (const x of [-W / 2 - 0.4, W / 2 + 0.4]) for (const z of [-D / 2 - 0.4, D / 2 + 0.4]) for (const y of [y0, y1]) { const q = project(new V3(x, y, z)); pts.push([q.x, q.y]); }
    p.setAttribute("points", hull(pts).map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" "));
  });
}
function select(i, fromHover = false) {
  sel = i; const L = LEVEL[KEYS[i]];
  $("lvlNum").textContent = i; $("lvlName").textContent = L.name; $("lvlText").textContent = L.text;
  $("lvlFacts").innerHTML = L.facts.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("");
  $("lvlRange").value = i;
  polys.forEach((p, k) => p.classList.toggle("on", k === i));
  if (fromHover) preload(`${KEYS[i]}-main`);
}
$("lvlRange").addEventListener("input", (e) => select(+e.target.value));
$("enterBtn").addEventListener("click", () => enter(sel));
const cursorNum = $("cursorNum");
svg.addEventListener("pointermove", (e) => {
  const p = e.target.closest?.("polygon"); cursorNum.classList.toggle("show", !!p);
  if (p) { cursorNum.textContent = p.dataset.i; cursorNum.style.transform = `translate(${e.clientX + 18}px,${e.clientY - 34}px)`; }
});
svg.addEventListener("pointerleave", () => cursorNum.classList.remove("show"));
addEventListener("keydown", (e) => {
  if (busy) return;
  if (state.where === "tower") {
    if (e.key === "Enter" && !e.target.closest("a,button")) enter(sel);
    if (e.key === "ArrowUp" || e.key === "ArrowRight") select(Math.min(4, sel + 1));
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") select(Math.max(0, sel - 1));
  } else if (e.key === "Escape") { if (!$("partCard").hidden) closeCard(); else back(); }
});

// ============================================================ inside a level
const tagsEl = $("tags"), backBtn = $("backBtn");
function setBodyState(where) {
  document.body.classList.toggle("at-tower", where === "tower");
  document.body.classList.toggle("in-room", where === "room");
}
function roomUI() {
  const { level, spot } = state, s = spotOf(level, spot), i = KEYS.indexOf(level), L = LEVEL[level];
  $("roomTitle").textContent = s.title; $("roomText").textContent = SPOT_TEXT[`${level}-${spot}`] || L.text;
  const main = spot === "main";
  backBtn.textContent = main ? "← Back to the building" : `← Back to ${VIEWS.levels[i].spots[0].title.replace(/^Level \d, /, "")}`;
  backBtn.setAttribute("href", "#");
  placeTags();
}
function placeTags() {
  tagsEl.innerHTML = "";
  if (state.where !== "room") return;
  const { level, spot } = state, i = KEYS.indexOf(level), s = spotOf(level, spot);
  setCam(view(s)); applyCam();
  const used = [];
  const free = (x, y) => used.every(([a, b]) => Math.abs(a - x) > 150 || Math.abs(b - y) > 34);
  FLOORS[i].parts.forEach((p, n) => {
    const w = new V3(p[2][0], p[2][1] + i * H, p[2][2]);
    if (w.distanceTo(cam.pos) > 34) return;
    const q = project(w);
    if (!q.ok || q.x < 60 || q.x > vw - 60 || q.y < 80 || q.y > vh - 120 || !free(q.x, q.y)) return;
    used.push([q.x, q.y]);
    const b = document.createElement("button"); b.type = "button"; b.className = "tag" + (p[3] ? " surds" : "");
    b.innerHTML = `<i>${p[3] ? "S" : "+"}</i><span>${p[0]}</span>`; b.style.left = q.x + "px"; b.style.top = q.y + "px";
    b.addEventListener("click", () => openCard(i, n, b)); tagsEl.appendChild(b);
  });
  for (const o of VIEWS.levels[i].spots) {                    // jump to the level's other spots
    if (o.id === spot) continue;
    let q = project(new V3(...o.look)); if (!q.ok || q.x < 80 || q.x > vw - 80 || q.y < 90 || q.y > vh - 140) q = { x: vw - 170, y: vh * 0.42 };
    const b = document.createElement("button"); b.type = "button"; b.className = "tag go";
    b.innerHTML = `<span>${o.title.replace(/^Level \d, /, "")}</span><i>→</i>`; b.style.left = q.x + "px"; b.style.top = q.y + "px";
    b.addEventListener("click", () => goSpot(o.id)); tagsEl.appendChild(b);
  }
}
const card = $("partCard");
function openCard(i, n, el) {
  const p = FLOORS[i].parts[n];
  $("pcN").textContent = p[3] ? `Level ${i} · SURDS` : `Level ${i}`; $("pcTitle").textContent = p[0];
  $("pcFig").textContent = FIG[p[0]] || "";
  const L = LEARN[p[0]];
  $("pcText").innerHTML = L ? [["What it is", L.is], ["Why it matters", L.why], ["If it goes wrong", L.wrong], ["What SURDS watches", L.surds]]
    .map(([h, t]) => `<span class="pc-h">${h}</span>${t}`).join("<br>") : p[1];
  card.hidden = false;
  tagsEl.querySelectorAll(".tag").forEach((t) => t.classList.toggle("on", t === el));
}
function closeCard() { card.hidden = true; tagsEl.querySelectorAll(".tag.on").forEach((t) => t.classList.remove("on")); }
card.querySelector(".pc-x").addEventListener("click", closeCard);

async function enter(i) {
  if (busy || state.where !== "tower") return; busy = true;
  const level = KEYS[i], to = view(spotOf(level, "main"));
  preload(`${level}-main`); select(i);
  setBodyState("flying"); document.body.classList.add("flying"); cursorNum.classList.remove("show");
  setCam(TOWER); await toLive(); await flyIn(level, to);
  state = { where: "room", level, spot: "main" }; setCam(to); await toStill(`${level}-main`);
  document.body.classList.remove("flying"); setBodyState("room"); roomUI(); busy = false;
}
async function goSpot(id) {
  if (busy) return; busy = true; closeCard();
  const { level, spot } = state, from = view(spotOf(level, spot)), to = view(spotOf(level, id));
  preload(`${level}-${id}`); document.body.classList.add("flying");
  setCam(from); await toLive(); await flyAcross(from, to);
  state = { where: "room", level, spot: id }; setCam(to); await toStill(`${level}-${id}`);
  document.body.classList.remove("flying"); roomUI(); busy = false;
}
async function back() {
  if (busy || state.where !== "room") return;
  if (state.spot !== "main") return goSpot("main");
  busy = true; closeCard(); tagsEl.innerHTML = "";
  const { level } = state, from = view(spotOf(level, "main"));
  document.body.classList.add("flying"); setBodyState("flying");
  setCam(from); await toLive(); await flyOut(level, from);
  state = { where: "tower" }; setCam(TOWER); await toStill("tower");
  document.body.classList.remove("flying"); setBodyState("tower");
  backBtn.textContent = "← Back to the site"; backBtn.setAttribute("href", "/home"); layoutFloors(); busy = false;
}
backBtn.addEventListener("click", (e) => { if (state.where !== "tower") { e.preventDefault(); back(); } });

// ============================================================ layout + go
function resize() {
  vw = innerWidth; vh = innerHeight; renderer.setSize(vw, vh, false);
  if (state.where === "tower") layoutFloors(); else placeTags();
  if (liveOn) { applyCam(); renderer.render(scene, camera); }
}
addEventListener("resize", resize);
(async () => {
  try { await Promise.race([document.fonts.ready, wait(1500)]); } catch (e) { /* optional */ }
  await preload("tower"); select(3); resize();
  $("loading").classList.add("done");
  setTimeout(() => { buildLive(); KEYS.forEach((k) => preload(`${k}-main`)); }, 60);   // model builds after first paint
})();
