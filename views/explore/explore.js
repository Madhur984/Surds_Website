/* SURDS · Explore the data center (real-time).
   Everything is rendered live in three.js: the site's five-level model (views/data-center/dc-model.js) with real
   equipment from NVIDIA SimReady (OpenUSD, Vertiv + Trane, CC-BY-4.0) converted to GLB by tools/simready_build.sh,
   lit by a Poly Haven sky, with ambient occlusion, bloom and shadows.
   Outside you orbit the building and pick a level; inside you walk it: drag to look, WASD / arrows / scroll to move,
   or let the guided tour pan you past the equipment. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { buildModel, W, D, H, RF, FLOORS, FIG } from "/views/data-center/dc-model.js?v=8";
import { LEARN, LEVEL_SIMPLE } from "/views/data-center/dc-learn.js?v=1";
import { loadPeople, makePerson } from "/views/explore/people.js?v=2";

const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const small = matchMedia("(max-width: 800px)").matches;
const KEYS = ["plant", "power", "net", "hall", "roof"];
const LEVEL = {
  plant: { name: "Plant", title: "Level 0, the plant", facts: [["Generators", "4 × 2.5 MW"], ["Fuel", "~48 h"], ["Chillers", "3"]] },
  power: { name: "Power and operations", title: "Level 1, power and operations", facts: [["Systems", "A + B"], ["Battery", "~10 min"], ["Staffed", "24/7"]] },
  net:   { name: "Network and AI", title: "Level 2, network and AI", facts: [["Carriers", "4"], ["GPU racks", "40"], ["Per rack", "40–100 kW"]] },
  hall:  { name: "Data hall", title: "Level 3, the data hall", facts: [["Racks", "448"], ["Per rack", "5–15 kW"], ["Air in", "18–27 °C"]] },
  roof:  { name: "Roof", title: "Level 4, the roof", facts: [["Cooling units", "6"], ["Fans", "72"], ["Heat out", "~5 MW"]] },
};
// guided tour per level: [x, z, lookX, lookZ, line shown while there] in level-local metres
const TOUR = {
  plant: [[19.5, 11.5, -6, -5, "The plant: generators, chillers, pumps and fuel."], [2, 0.5, 10, -9, "Water chillers make the building's cold water."],
          [-3, -2, -15, -8, "Four diesel generators start within seconds of a power cut."], [-6, 3.5, -14, 5, "Bulk fuel: about 48 hours of running on its own."],
          [-7, 7.5, -17, 11, "Transformers step the grid voltage down."], [9, 9, 19.5, 4, "Thermal storage keeps cooling going if a chiller trips."]],
  power: [[21, 4, 6, -11, "Level 1: power rooms and the control room."], [13, 1.8, 11.5, -13, "The control room watches every level, around the clock."],
          [-4, 5.5, -16, 5, "Behind the glass: switchgear, UPS and batteries."], [-8, 1.2, -15, -8.2, "UPS system A carries the load while generators start."],
          [-8, -5.5, -14, -12.4, "Switchboards pick grid or generator power automatically."], [-8, 6.6, -15, 4.2, "UPS system B: a full second copy, so one can fail."]],
  net:   [[19.5, 11.5, -6, -5, "Level 2: the internet comes in here, and AI runs here."], [12, 3.0, 9, 6.2, "Immersion tanks: servers cooled in liquid."],
          [1.0, 3.0, 1.0, -9, "Round the corner: the AI pod."], [1.0, -7.5, 20, -7.5, "Between the GPU rows. Each rack uses as much power as 30 homes."],
          [1.2, -11.4, 16, -12.4, "Coolant units keep the AI racks' water loop right."], [-11, 0.5, -16, -7, "The meet-me room: carriers hand over their fibre."]],
  hall:  [[19.5, 11.2, 0, -4, "Level 3: the data hall. 448 racks, never switched off."], [0.9, 11.2, 0.9, -12, "The main aisle runs between two blocks of racks."],
          [0.9, -11.4, -10, -12.6, "Air handlers cool the hall air and push it under the floor."], [3, 1.6, 18, 1.6, "Inside a sealed cold aisle: cold air in front of every server."],
          [16, 1.6, 3, 1.6, "Inlet sensors at the top, middle and bottom of the racks."], [0.9, 4.2, 18, 4.2, "The hot aisle behind the racks."]],
  roof:  [[19, 13, 0, -4, "The roof: where all the heat leaves the building."], [18, 0, -19, 0, "Six cooling plants inside white steel frames."],
          [2.5, 0.2, 0, -7, "Liebert condensers push the heat into the outside air."], [-19, 0, 19, 0, "Pipes link the roof to every floor below."]],
};
const floorY = (i) => i * H + (KEYS[i] === "net" || KEYS[i] === "hall" ? RF : 0);
const EYE = 1.65;

// ============================================================ renderer, scene, post
const canvas = $("live");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.25 : 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 4000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, 1, 1);
gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: small ? 8 : 16 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
gtao.blendIntensity = 0.95;
if (!small) composer.addPass(gtao);
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.32, 0.55, 0.92); composer.addPass(bloom);
const smaa = new SMAAPass(1, 1); composer.addPass(smaa);
composer.addPass(new OutputPass());

// light rig: low golden sun outside, soft cool fill everywhere, per-level shadow light inside
const hemi = new THREE.HemisphereLight(0xdfe9f8, 0x4a453e, 0.7); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffc896, 3.2);
sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// environments: the sky outside, a bright neutral studio-like room inside
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
let skyEnv = null, skyBg = null;

// ground and plaza
function paving() {
  const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d");
  x.fillStyle = "#8a847a"; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const v = 128 + Math.floor(Math.random() * 18); x.fillStyle = `rgb(${v + 6},${v},${v - 8})`; x.fillRect(i * 64 + 1, j * 64 + 1, 62, 62); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(700, 700); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2800, 2800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: paving(), roughness: 0.75 }));
ground.position.y = -0.52; ground.receiveShadow = true; scene.add(ground);

// ============================================================ the building
let model = null, levelBoxes = [], highlight = [];
function buildBuilding() {
  model = buildModel(renderer, { real: ["chillers", "switchgear", "ups", "pdu", "cdu", "crah", "roofplant", "people"] });
  model.floors.forEach(({ g }, i) => {
    g.position.set(0, i * H, 0); scene.add(g);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
    // hover target + glow for choosing a level from outside
    const hb = new THREE.Mesh(new THREE.BoxGeometry(W + 0.8, i === 4 ? 5.4 : H, D + 0.8), new THREE.MeshBasicMaterial({ color: 0xffc27a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    hb.position.set(0, i * H + (i === 4 ? 2.7 : H / 2), 0); hb.userData.level = i; scene.add(hb); levelBoxes.push(hb); highlight.push(0);
  });
  scene.traverse((o) => { const m = o.material; if (!m || Array.isArray(m)) return;
    if (m.name === "pier") { m.color.set(0x8f8474); m.metalness = 0.6; m.roughness = 0.32; }
    if (m.name === "window") m.emissiveIntensity = 1.4;
    if (m.name === "white") { m.color.set(0xb9bcc0); m.roughness = 0.5; }
  });
}

// ============================================================ real equipment (NVIDIA SimReady, Vertiv + Trane)
// rot turns the unit so its front faces into the room
const SIMREADY = [
  { a: "chiller_water", lv: 0, rot: 0, at: [[4.5, -9.4], [10.5, -9.4], [16.5, -9.4]] },
  { a: "switchboard", lv: 1, rot: 0, at: Array.from({ length: 13 }, (_, i) => [-20.5 + i * 1.04, -13.15]) },
  { a: "ups_apm2", lv: 1, rot: -Math.PI / 2, at: [-19.6, -17.1, -14.6, -12.1].map((x) => [x, -8.2]).concat([-19.6, -17.1, -14.6, -12.1].map((x) => [x, 4.2])) },
  { a: "rpp", lv: 1, rot: -Math.PI / 2, at: [[-10.6, -3.6], [-9.0, -3.6], [-10.6, 8.4], [-9.0, 8.4]] },
  { a: "cdu", lv: 2, y: RF, rot: -Math.PI / 2, at: [[4.5, -12.85], [8.5, -12.85], [14.5, -12.85], [18.5, -12.85]] },
  { a: "crah", lv: 3, rot: -Math.PI / 2, at: Array.from({ length: 8 }, (_, i) => [-17.5 + i * 5, -12.85]) },
  { a: "condenser", lv: 4, rot: 0, at: [[-W / 3, -D / 4], [0, -D / 4], [W / 3, -D / 4], [-W / 3, D / 4], [0, D / 4], [W / 3, D / 4]] },
  { a: "rack_ocp", lv: 2, y: RF, rot: Math.PI / 2, at: Array.from({ length: 6 }, (_, i) => [-5.6 + i * 0.6, 7.0]) },
];
const gl = new GLTFLoader(); gl.setMeshoptDecoder(MeshoptDecoder);
const loaded = {};
async function loadEquipment(progress) {
  let done = 0;
  await Promise.all(SIMREADY.map(async (s) => {
    try {
      const g = loaded[s.a] || (loaded[s.a] = await gl.loadAsync(`/views/explore/assets/${s.a}.glb?v=1`));
      g.scene.updateMatrixWorld(true);
      const parts = []; g.scene.traverse((o) => { if (o.isMesh) parts.push(o); });
      const place = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), s.rot);
      for (const p of parts) {
        const im = new THREE.InstancedMesh(p.geometry, p.material, s.at.length);
        s.at.forEach(([x, z], k) => { place.compose(new V3(x, (s.y || 0) + s.lv * H, z), q, new V3(1, 1, 1)); im.setMatrixAt(k, place.clone().multiply(p.matrixWorld)); });
        im.castShadow = im.receiveShadow = true; im.userData.level = s.lv;
        scene.add(im);
      }
    } catch (e) { console.warn("equipment", s.a, e); }
    progress(++done / SIMREADY.length);
  }));
}

// ============================================================ people
// posed figures (tools/people_build.py) where the model puts people, plus a few more so every level is staffed
const EXTRA_PEOPLE = [
  { lv: 0, x: 7.5, z: -5.2, pose: "kneel", yaw: Math.PI, vest: true, hat: true },
  { lv: 1, x: 18.5, z: -3.2, pose: "walk", yaw: -Math.PI / 2 },
  { lv: 2, x: -13.4, z: -1.3, pose: "tablet", yaw: Math.PI },
  { lv: 3, x: -0.8, z: -3.6, pose: "tablet", yaw: -Math.PI / 2, vest: true },
  { lv: 4, x: -7.5, z: 0.4, pose: "tablet", yaw: Math.PI / 2, vest: true, hat: true },
];
async function placePeople() {
  await loadPeople(gl, "/views/explore/assets/people.glb?v=4");
  const all = model.PEOPLE.map((p) => ({ ...p, lv: model.floors.findIndex((f) => f.g === p.g) }))
    .concat(EXTRA_PEOPLE.map((p) => ({ ...p, y: KEYS[p.lv] === "net" || KEYS[p.lv] === "hall" ? RF : 0 })));
  all.forEach((p, i) => {
    const pose = p.pose || (p.sitting ? "sit" : "stand");
    const fig = makePerson({ pose, seed: i * 3 + 1, vest: !!p.vest, hat: !!p.hat, sleeves: p.vest ? "long" : undefined });
    fig.position.set(p.x, (p.y || 0) + (pose === "sit" ? 0.04 : 0), p.z);
    fig.rotation.y = p.yaw ?? Math.atan2(-p.x, -p.z);     // default: face into the room
    model.floors[p.lv].g.add(fig);
  });
}

// ============================================================ camera rigs
const orbit = { az: 0.72, el: 0.2, r: 88, tAz: 0.72, tEl: 0.2, tR: 88, target: new V3(4, 14, 0) };
const walk = { pos: new V3(), yaw: 0, pitch: 0, level: 0 };
let mode = "outside", busy = false;
function orbitPose() {
  const ce = Math.cos(orbit.el);
  return { pos: new V3(orbit.target.x + orbit.r * ce * Math.sin(orbit.az), orbit.target.y + orbit.r * Math.sin(orbit.el), orbit.target.z + orbit.r * ce * Math.cos(orbit.az)), look: orbit.target.clone() };
}
function walkLook() { return walk.pos.clone().add(new V3(Math.sin(walk.yaw) * Math.cos(walk.pitch), Math.sin(walk.pitch), -Math.cos(walk.yaw) * Math.cos(walk.pitch))); }
function setWalkLook(look) { const d = look.clone().sub(walk.pos); walk.yaw = Math.atan2(d.x, -d.z); walk.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }
// the roof is walked from a service gantry above the condenser frames, so pipes and frames never cut the view
const eyeOf = (i) => (KEYS[i] === "roof" ? 5.6 : EYE);
const lvlPoint = (i, x, z, up = eyeOf(i)) => new V3(x, floorY(i) + up, z);

// which levels draw: outside all; inside only the level and the one above (its slab is our ceiling)
function showLevels(i) {
  model.floors.forEach(({ g }, k) => { g.visible = i < 0 || k === i || k === i + 1; });
  scene.traverse((o) => { if (o.isInstancedMesh && o.userData.level !== undefined) o.visible = i < 0 || o.userData.level === i || o.userData.level === i + 1; });
  levelBoxes.forEach((b) => (b.visible = i < 0));
  ground.visible = i < 0 || i === 4;
}
function setLook(inside, i) {
  if (inside && KEYS[i] !== "roof") {
    scene.environment = roomEnv; scene.environmentIntensity = 0.55; scene.background = new THREE.Color(0x11141a); scene.backgroundIntensity = 1;
    hemi.intensity = 0.55; sun.intensity = 1.6; sun.color.set(0xfff4e8);
    const c = new V3(0, floorY(i), 0); sun.position.copy(c).add(new V3(8, 7.2, 5)); sun.target.position.copy(c);   // a soft key from the ceiling for contact shadows
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 18, bottom: -18, near: 0.5, far: 30 }); sun.shadow.camera.updateProjectionMatrix();
    renderer.toneMappingExposure = 1.05; bloom.strength = 0.42; gtao.updateGtaoMaterial({ radius: 0.6 });
  } else {
    scene.environment = skyEnv; scene.environmentIntensity = 0.85; scene.background = skyBg; scene.backgroundIntensity = 0.4; scene.backgroundRotation.y = 1.2; scene.environmentRotation.y = 1.2;
    hemi.intensity = 0.35; sun.intensity = 3.2; sun.color.set(0xffc896);
    sun.position.set(-70, 26, 60); sun.target.position.set(0, 12, 0);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -10, near: 1, far: 220 }); sun.shadow.camera.updateProjectionMatrix();
    const roof = inside && KEYS[i] === "roof";
    renderer.toneMappingExposure = roof ? 0.62 : 0.88; bloom.strength = roof ? 0.12 : 0.3; sun.intensity = roof ? 2.2 : 3.2;
    gtao.updateGtaoMaterial({ radius: roof ? 0.8 : 2.2 });
  }
}

// ============================================================ input
let drag = null, keys = {};
canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; canvas.setPointerCapture(e.pointerId); canvas.classList.add("drag"); tourPause(); });
canvas.addEventListener("pointermove", (e) => {
  if (!drag) { if (mode === "outside") hoverAt(e.clientX, e.clientY); return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
  if (mode === "outside") { orbit.tAz -= dx * 0.005; orbit.tEl = THREE.MathUtils.clamp(orbit.tEl + dy * 0.003, 0.02, 0.9); }
  else if (mode === "inside") { walk.yaw += dx * 0.0035; walk.pitch = THREE.MathUtils.clamp(walk.pitch - dy * 0.003, -1.1, 1.1); }
});
canvas.addEventListener("pointerup", (e) => {
  canvas.classList.remove("drag");
  if (drag && drag.moved < 6 && mode === "outside") { const i = levelAt(e.clientX, e.clientY); if (i >= 0) enter(i); }
  drag = null;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault(); tourPause();
  if (mode === "outside") orbit.tR = THREE.MathUtils.clamp(orbit.tR * (1 + e.deltaY * 0.001), 45, 160);
  else if (mode === "inside") stepWalk(-Math.sign(e.deltaY) * 1.2, 0);
}, { passive: false });
addEventListener("keydown", (e) => {
  if (e.target.closest("input,textarea")) return;
  keys[e.key.toLowerCase()] = true;
  if (mode === "inside" && ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) { tourPause(); e.preventDefault(); }
  if (mode === "inside" && e.key === " ") { e.preventDefault(); tour.on ? tourPause() : tourPlay(); }
  if (e.key === "Escape") { if (!$("partCard").hidden) closeCard(); else if (mode === "inside") back(); }
  if (mode === "outside" && !busy) {
    if (e.key === "Enter" && !e.target.closest("a,button")) enter(sel);
    if (e.key === "ArrowUp" || e.key === "ArrowRight") select(Math.min(4, sel + 1));
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") select(Math.max(0, sel - 1));
  }
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
function stepWalk(fwd, side) {
  const f = new V3(Math.sin(walk.yaw), 0, -Math.cos(walk.yaw)), r = new V3(Math.cos(walk.yaw), 0, Math.sin(walk.yaw));
  walk.pos.addScaledVector(f, fwd).addScaledVector(r, side); clampWalk();
}
function clampWalk() {
  const i = walk.level, m = KEYS[i] === "roof" ? 1.2 : 1.0;
  walk.pos.x = THREE.MathUtils.clamp(walk.pos.x, -W / 2 + m, W / 2 - m); walk.pos.z = THREE.MathUtils.clamp(walk.pos.z, -D / 2 + m, D / 2 - m);
  walk.pos.y = floorY(i) + eyeOf(i);
}
// touch: one finger looks, the on-screen pad walks
document.querySelectorAll("[data-pad]").forEach((b) => {
  let t = null; const go = () => { const [f, s] = b.dataset.pad.split(",").map(Number); stepWalk(f * 0.12, s * 0.12); };
  b.addEventListener("pointerdown", (e) => { e.preventDefault(); tourPause(); go(); t = setInterval(go, 16); });
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, () => clearInterval(t)));
});

// ============================================================ choose a level (outside)
let sel = 3;
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function levelAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(levelBoxes, false)[0]; return hit ? hit.object.userData.level : -1;
}
const cursorNum = $("cursorNum");
function hoverAt(x, y) {
  const i = levelAt(x, y);
  cursorNum.classList.toggle("show", i >= 0 && !busy); canvas.style.cursor = i >= 0 ? "pointer" : "";
  if (i >= 0) { cursorNum.textContent = i; cursorNum.style.transform = `translate(${x + 18}px,${y - 34}px)`; if (i !== sel) select(i); }
}
function select(i) {
  sel = i; const L = LEVEL[KEYS[i]];
  $("lvlNum").textContent = i; $("lvlName").textContent = L.name; $("lvlText").textContent = LEVEL_SIMPLE[KEYS[i]];
  $("lvlFacts").innerHTML = L.facts.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join("");
  $("lvlRange").value = i;
}
$("lvlRange").addEventListener("input", (e) => select(+e.target.value));
$("enterBtn").addEventListener("click", () => enter(sel));

// ============================================================ flights
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bez = (a, b, c, d, t) => { const u = 1 - t; return a.clone().multiplyScalar(u * u * u).add(b.clone().multiplyScalar(3 * u * u * t)).add(c.clone().multiplyScalar(3 * u * t * t)).add(d.clone().multiplyScalar(t * t * t)); };
let flight = null;   // {t0, ms, at(t)->{pos,look}, done}
function fly(ms, at) { return new Promise((done) => { flight = { t0: performance.now(), ms: reduce ? 1 : ms, at, done }; }); }
let hiddenWall = [];
function hideFacing(i, from) {   // the facade wall the camera passes through
  const nx = Math.abs(from.x) / W > Math.abs(from.z) / D ? Math.sign(from.x) : 0, nz = nx ? 0 : Math.sign(from.z);
  for (const w of model.floors[i].walls) if (w.n[0] === nx && w.n[1] === nz) for (const m of w.meshes) { m.visible = false; hiddenWall.push(m); }
}
function showWalls() { for (const m of hiddenWall) m.visible = true; hiddenWall = []; }

async function enter(i) {
  if (busy || mode !== "outside") return; busy = true; select(i);
  document.body.classList.add("flying"); document.body.classList.remove("at-tower"); cursorNum.classList.remove("show");
  const start = orbitPose(), stop = TOUR[KEYS[i]][0], to = lvlPoint(i, stop[0], stop[1]), look = lvlPoint(i, stop[2], stop[3], 1.2);
  const out = to.clone().setLength(Math.max(W, D) * 0.95); out.y = to.y;          // just outside the facade, level with the floor
  if (KEYS[i] === "roof") out.y = to.y + 14;
  const c1 = start.pos.clone().lerp(out, 0.55); c1.y = THREE.MathUtils.lerp(start.pos.y, to.y, 0.8);
  let wallGone = false;
  await fly(3600, (t) => {
    if (!wallGone && t > 0.6) { hideFacing(i, out); wallGone = true; }
    return { pos: bez(start.pos, c1, out, to, t), look: start.look.clone().lerp(look, Math.min(1, t * 1.15)) };
  });
  showWalls(); showLevels(i); setLook(true, i);
  mode = "inside"; walk.level = i; walk.pos.copy(to); setWalkLook(look);
  document.body.classList.remove("flying"); document.body.classList.add("in-room");
  roomUI(); tourStart(i); busy = false;
}
async function back() {
  if (busy || mode !== "inside") return; busy = true; tourPause(); closeCard(); clearTags();
  const i = walk.level, from = { pos: walk.pos.clone(), look: walkLook() };
  showLevels(-1); setLook(false, i);
  const out = from.pos.clone().setLength(Math.max(W, D) * 0.95); out.y = from.pos.y; hideFacing(i, out);
  mode = "flying"; document.body.classList.add("flying"); document.body.classList.remove("in-room");
  orbit.tAz = orbit.az = Math.atan2(out.x, out.z); orbit.tEl = orbit.el = 0.14;
  const end = orbitPose(), c2 = end.pos.clone().lerp(out, 0.55); c2.y = THREE.MathUtils.lerp(end.pos.y, out.y, 0.6);
  let wallsBack = false;
  await fly(3000, (t) => {
    if (!wallsBack && t > 0.35) { showWalls(); wallsBack = true; }
    return { pos: bez(from.pos, out, c2, end.pos, t), look: from.look.clone().lerp(end.look, ease(Math.min(1, t * 1.2))) };
  });
  mode = "outside"; document.body.classList.remove("flying"); document.body.classList.add("at-tower");
  $("backBtn").textContent = "← Back to the site"; busy = false;
}
$("backBtn").addEventListener("click", (e) => { if (mode !== "outside") { e.preventDefault(); back(); } });

// ============================================================ guided tour (camera glides and pans between stops)
const tour = { on: false, i: 0, k: 0, t: 0, from: null, to: null, dwell: 0, len: 1 };
function tourStart(i) { tour.i = i; tour.k = 0; tour.from = null; tour.dwell = 2.6; tour.on = !reduce; caption(TOUR[KEYS[i]][0][4]); tourBtn(); }
function tourPlay() { if (mode !== "inside") return; tour.on = true; tour.dwell = 0; tour.from = null; tourBtn(); }
function tourPause() { if (tour.on) { tour.on = false; tourBtn(); } }
function tourBtn() { $("tourBtn").textContent = tour.on ? "❚❚ Pause tour" : "▶ Guided tour"; $("tourBtn").setAttribute("aria-pressed", tour.on); }
$("tourBtn").addEventListener("click", () => (tour.on ? tourPause() : tourPlay()));
function tourStep(dt) {
  const stops = TOUR[KEYS[tour.i]];
  if (!tour.from) {
    if (tour.dwell > 0) { tour.dwell -= dt; walk.yaw += Math.sin(performance.now() / 1600) * 0.0009; return; }   // a slow look-around while stopped
    tour.k = (tour.k + 1) % stops.length; const s = stops[tour.k];
    tour.from = { pos: walk.pos.clone(), look: walkLook() }; tour.to = { pos: lvlPoint(tour.i, s[0], s[1]), look: lvlPoint(tour.i, s[2], s[3], 1.2) };
    tour.t = 0; tour.len = Math.max(2.5, tour.from.pos.distanceTo(tour.to.pos) / 2.4); caption(s[4]);
  }
  tour.t = Math.min(1, tour.t + dt / tour.len); const e = ease(tour.t);
  walk.pos.lerpVectors(tour.from.pos, tour.to.pos, e);
  setWalkLook(tour.from.look.clone().lerp(tour.to.look, Math.min(1, e * 1.3)));
  if (tour.t >= 1) { tour.from = null; tour.dwell = 3.4; }
}
function caption(s) { $("roomText").textContent = s; }

// ============================================================ tags + cards inside
const tagsEl = $("tags"); let tagEls = [];
function clearTags() { tagsEl.innerHTML = ""; tagEls = []; }
function roomUI() {
  const i = walk.level, k = KEYS[i];
  $("roomTitle").textContent = LEVEL[k].title; $("backBtn").textContent = "← Back to the building";
  clearTags();
  FLOORS[i].parts.forEach((p, n) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tag" + (p[3] ? " surds" : "");
    b.innerHTML = `<i>${p[3] ? "S" : "+"}</i><span>${p[0]}</span>`; b.addEventListener("click", () => openCard(i, n, b)); tagsEl.appendChild(b);
    tagEls.push({ el: b, w: new V3(p[2][0], p[2][1] + i * H, p[2][2]) });
  });
}
function placeTags() {
  for (const t of tagEls) {
    const d = t.w.distanceTo(camera.position), p = t.w.clone().project(camera);
    const x = (p.x * 0.5 + 0.5) * innerWidth, y = (-p.y * 0.5 + 0.5) * innerHeight;
    const vis = p.z < 1 && d < 18 && x > 40 && x < innerWidth - 40 && y > 70 && y < innerHeight - 90;
    t.el.style.opacity = vis ? Math.min(1, (18 - d) / 5) : 0; t.el.style.pointerEvents = vis ? "auto" : "none";
    t.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(-50%,-50%)`;
  }
}
const card = $("partCard");
function openCard(i, n, el) {
  const p = FLOORS[i].parts[n], L = LEARN[p[0]];
  $("pcN").textContent = p[3] ? `Level ${i} · SURDS` : `Level ${i}`; $("pcTitle").textContent = p[0]; $("pcFig").textContent = FIG[p[0]] || "";
  $("pcText").innerHTML = L ? [["What it is", L.is], ["Why it matters", L.why], ["If it goes wrong", L.wrong], ["What SURDS watches", L.surds]]
    .map(([h, t]) => `<span class="pc-h">${h}</span>${t}`).join("<br>") : p[1];
  card.hidden = false; tagEls.forEach((t) => t.el.classList.toggle("on", t.el === el)); tourPause();
}
function closeCard() { card.hidden = true; tagEls.forEach((t) => t.el.classList.remove("on")); }
card.querySelector(".pc-x").addEventListener("click", closeCard);

// ============================================================ frame loop
let prev = performance.now(), fpsT = 0, fpsN = 0, dpr = renderer.getPixelRatio();
function adapt(dt) {
  fpsT += dt; fpsN++;
  if (fpsT < 2) return;
  const fps = fpsN / fpsT; fpsT = 0; fpsN = 0;
  const next = fps < 42 ? Math.max(0.7, dpr - 0.2) : fps > 58 ? Math.min(Math.min(devicePixelRatio, 1.5), dpr + 0.1) : dpr;
  if (Math.abs(next - dpr) > 0.01) { dpr = next; renderer.setPixelRatio(dpr); composer.setPixelRatio(dpr); resize(); }
}
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  let pos, look;
  if (flight) {
    const t = Math.min(1, (now - flight.t0) / flight.ms), r = flight.at(ease(t)); pos = r.pos; look = r.look;
    if (t >= 1) { const d = flight.done; flight = null; d(); }
  } else if (mode === "outside") {
    if (!drag && !reduce) orbit.tAz += dt * 0.025;
    const k = 1 - Math.exp(-dt * 4); orbit.az += (orbit.tAz - orbit.az) * k; orbit.el += (orbit.tEl - orbit.el) * k; orbit.r += (orbit.tR - orbit.r) * k;
    ({ pos, look } = orbitPose());
    levelBoxes.forEach((b, i) => { highlight[i] += ((i === sel ? 0.16 : 0) - highlight[i]) * k; b.material.opacity = highlight[i]; });
  } else {
    const sp = (keys.shift ? 6 : 3) * dt;
    const f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0), s = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
    if (keys.arrowleft) walk.yaw -= dt * 1.4;
    if (keys.arrowright) walk.yaw += dt * 1.4;
    if (f || s) stepWalk(f * sp, s * sp);
    if (tour.on) tourStep(dt);
    pos = walk.pos; look = walkLook();
  }
  camera.position.copy(pos); camera.lookAt(look); camera.updateMatrixWorld();
  if (mode === "inside" && !flight) placeTags();
  if (model && !reduce) for (const s of model.SPIN) s.rotation.y += dt * 7;
  composer.render(dt); adapt(dt);
  requestAnimationFrame(frame);
}

// ============================================================ layout + boot
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h; camera.fov = w / h < 1 ? 62 : 42; camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
(async () => {
  const bar = $("loadBar"), set = (f) => { bar.style.transform = `scaleX(${f})`; };
  set(0.05); resize(); select(3);
  const hdr = await new RGBELoader().loadAsync("/views/explore/env/sky.hdr?v=1"); hdr.mapping = THREE.EquirectangularReflectionMapping;
  skyBg = hdr; skyEnv = pmrem.fromEquirectangular(hdr).texture; set(0.2);
  await new Promise((r) => setTimeout(r, 30)); buildBuilding(); set(0.35);
  await loadEquipment((f) => set(0.35 + f * 0.9 * 0.6));
  await placePeople().catch((e) => console.warn("people", e)); set(0.95);
  setLook(false, 0); showLevels(-1);
  if (new URLSearchParams(location.search).has("debug")) window.__x = { walk, setWalkLook, lvlPoint, tourPause, V3, camera, get model() { return model; } };   // for screenshot checks
  requestAnimationFrame((n) => { prev = n; frame(n); $("loading").classList.add("done"); set(1); });
})();
