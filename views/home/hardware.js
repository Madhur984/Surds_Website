/* SURDS hardware, modelled procedurally in three.js from the real prototypes:
   the white shield-shaped gateway (dot grille, SURDS mark, 4 status LEDs,
   green pair button, dual antennas) and the black multi-probe node with four
   cable-glanded stainless probes. Scroll (or the tabs) walks three steps:
   gateway -> probe node -> both, with data pulsing from node to gateway. */
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const canvas = document.getElementById("hwCanvas");
const wrap = document.getElementById("hwWrap");
const labelsEl = document.getElementById("hwLabels");
const tabs = [...document.querySelectorAll(".hw-tabs button")];
const panels = [...document.querySelectorAll(".hw-panel")];
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMob = () => innerWidth <= 900;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 6, 4); key.castShadow = true;
key.shadow.mapSize.set(1024, 1024); key.shadow.radius = 6;
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.16 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -1.05; ground.receiveShadow = true;
scene.add(ground);

const turntable = new THREE.Group(); scene.add(turntable);
const hoverables = [];
const tag = (mesh, title, sub) => { mesh.userData.label = { title, sub }; hoverables.push(mesh); return mesh; };

/* ---------------- materials ---------------- */
const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xf4f4f2, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.6 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.75 });
const holeMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.9 });
const brass = new THREE.MeshStandardMaterial({ color: 0xc9a44c, metalness: 1, roughness: 0.3 });
const steel = new THREE.MeshStandardMaterial({ color: 0xdadde2, metalness: 1, roughness: 0.18 });
const blackBox = new THREE.MeshPhysicalMaterial({ color: 0x1a1b1f, roughness: 0.45, clearcoat: 0.4 });

/* ---------------- gateway ---------------- */
const gateway = new THREE.Group(); turntable.add(gateway);
function shieldShape(w, h) {
  // wide flat top with rounded shoulders, sides tapering to a rounded chin (matches the printed case)
  const s = new THREE.Shape(), hw = w / 2, top = h / 2, bot = -h / 2, r = 0.22;
  s.moveTo(-hw + r, top);
  s.lineTo(hw - r, top);
  s.quadraticCurveTo(hw, top, hw, top - r);
  s.bezierCurveTo(hw, top - h * 0.45, hw * 0.92, bot + 0.25, hw * 0.55, bot + 0.05);
  s.quadraticCurveTo(0, bot - 0.06, -hw * 0.55, bot + 0.05);
  s.bezierCurveTo(-hw * 0.92, bot + 0.25, -hw, top - h * 0.45, -hw, top - r);
  s.quadraticCurveTo(-hw, top, -hw + r, top);
  return s;
}
const GW = { w: 2.1, h: 1.65, d: 0.62 };
const shellGeo = new THREE.ExtrudeGeometry(shieldShape(GW.w, GW.h), { depth: GW.d, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.09, bevelSegments: 8, curveSegments: 40 });
shellGeo.translate(0, 0, -GW.d / 2);
const shell = tag(new THREE.Mesh(shellGeo, shellMat), "The hub", "Makes decisions inside your building");
shell.castShadow = true; gateway.add(shell);
const FRONT = GW.d / 2 + 0.1 + 0.002;

// dot grille, as on the real case
const dotGeo = new THREE.CircleGeometry(0.018, 10);
const cols = 26, rows = 10;
const grille = new THREE.InstancedMesh(dotGeo, holeMat, cols * rows);
const m4 = new THREE.Matrix4(); let n = 0;
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  m4.makeTranslation(-0.72 + c * (1.44 / (cols - 1)) + (r % 2 ? 0.012 : 0), 0.62 - r * 0.06, FRONT);
  grille.setMatrixAt(n++, m4);
}
tag(grille, "Air vents", "Let the built-in climate sensor breathe");
gateway.add(grille);

// SURDS wordmark
function textTexture(text, color, w = 512, h = 128, weight = 800) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `${weight} ${h * 0.62}px Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
  x.letterSpacing = "12px";
  x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
const logoMat = new THREE.MeshStandardMaterial({ map: textTexture("SURDS", "#b9b9b6"), transparent: true, roughness: 0.6 });
const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), logoMat);
logo.position.set(0, -0.05, FRONT + 0.001); gateway.add(logo);
document.fonts && document.fonts.ready.then(() => { logoMat.map = textTexture("SURDS", "#b9b9b6"); logoMat.needsUpdate = true; });

// status LEDs: power, mesh, uplink, alert
const LED_COLORS = [0x22c55e, 0x3b82f6, 0x22c55e, 0xf59e0b];
const leds = LED_COLORS.map((col, i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
  m.position.set(-0.24 + i * 0.16, -0.46, FRONT - 0.005);
  gateway.add(m); return m;
});
const ledHit = tag(new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.14), new THREE.MeshBasicMaterial({ visible: false })), "Status lights", "Power · sensors · internet · alert");
ledHit.position.set(0, -0.46, FRONT + 0.01); gateway.add(ledHit);

// antennas on the top edge
function antenna(x) {
  const g = new THREE.Group();
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 6), brass); g.add(nut);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.075, 0.2, 20), rubber); hinge.position.y = 0.14; g.add(hinge);
  const whip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.058, 1.55, 24), rubber); whip.position.y = 1.0; g.add(whip);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.031, 16, 10), rubber); tip.position.y = 1.78; g.add(tip);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; tag(o, "Two antennas", "Reach sensors across the building"); } });
  g.position.set(x, GW.h / 2 + 0.1, -0.1);
  g.rotation.z = x < 0 ? 0.14 : -0.1;
  g.rotation.x = -0.12;
  return g;
}
gateway.add(antenna(-0.58), antenna(0.62));
const button = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.07, 20), new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.4 })), "Pair button", "Press to add a new sensor");
button.position.set(0.18, GW.h / 2 + 0.12, 0.05); gateway.add(button);
// rear port bumps (power + SD) for silhouette when rotated
const port = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.12), rubber); port.position.set(-0.2, GW.h / 2 + 0.07, -0.15); gateway.add(port);
tag(port, "Memory card + clock", "Saves data when the internet is down");

/* ---------------- probe node ---------------- */
const node = new THREE.Group(); turntable.add(node);
function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
const boxGeo = new THREE.ExtrudeGeometry(roundedRect(1.25, 1.1, 0.12), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 5 });
boxGeo.rotateX(-Math.PI / 2); boxGeo.translate(0, -0.15, 0);
const box = tag(new THREE.Mesh(boxGeo, blackBox), "The sensor box", "Runs on batteries, four probes");
box.castShadow = true; node.add(box);
const nodeLed = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 2 }));
nodeLed.position.set(0.45, 0.21, 0.4); node.add(nodeLed);
const nodeLogo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshStandardMaterial({ map: textTexture("SURDS", "#6b6f78"), transparent: true }));
nodeLogo.rotation.x = -Math.PI / 2; nodeLogo.position.set(-0.15, 0.206, 0.1); node.add(nodeLogo);

const probes = [];
const cableMat = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.6 });
for (let i = 0; i < 4; i++) {
  const gx = -0.42 + i * 0.28;
  const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.12, 16), rubber);
  gland.rotation.x = Math.PI / 2; gland.position.set(gx, 0, 0.62); node.add(gland);
  // leads droop from the glands to the floor, then lie flat with the probe at the end
  const end = new THREE.Vector3(-1.05 + i * 0.66, -0.165, 1.75 + (i % 2) * 0.35);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(gx, 0, 0.68), new THREE.Vector3(gx, -0.04, 0.92),
    new THREE.Vector3((gx + end.x) / 2, -0.17, 1.22), new THREE.Vector3(end.x, -0.17, end.z - 0.3), end
  ]);
  const cable = tag(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.026, 10), cableMat), "Sealed cables", "Run them into any fridge or duct");
  cable.castShadow = true; node.add(cable);
  const tan = curve.getTangent(1);
  const probe = tag(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.55, 20), steel), "Steel probe", "Accurate to 0.1 °C, food safe");
  probe.position.copy(end).addScaledVector(tan, 0.27);
  probe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
  probe.castShadow = true; node.add(probe); probes.push(probe);
}
node.position.set(2.9, -0.85, 0.6);
node.rotation.y = -0.5;

/* data pulses: node -> gateway */
const pulses = [];
const pulseMat = new THREE.MeshBasicMaterial({ color: 0x2f6bff, transparent: true });
const arc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(2.9, -0.5, 0.6), new THREE.Vector3(1.6, 1.8, 0.4), new THREE.Vector3(0.1, 1.3, 0));
for (let i = 0; i < 6; i++) {
  const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), pulseMat.clone());
  p.userData.t = i / 6; turntable.add(p); pulses.push(p);
}
const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.getPoints(60)),
  new THREE.LineDashedMaterial({ color: 0x2f6bff, dashSize: 0.08, gapSize: 0.07, transparent: true, opacity: 0.6 }));
arcLine.computeLineDistances(); turntable.add(arcLine);

/* ---------------- steps & camera ---------------- */
// the camera frames live world positions (the turntable spins the whole rig), from a fixed offset
const gwFocus = () => gateway.localToWorld(new THREE.Vector3(0, 0.8, 0));
const nodeFocus = () => node.localToWorld(new THREE.Vector3(-0.1, -0.1, 1.0));
const STEPS = [
  { focus: gwFocus, off: new THREE.Vector3(0.8, 1.0, 9.4), node: 0, link: 0 },
  { focus: nodeFocus, off: new THREE.Vector3(1.0, 3.6, 5.6), node: 1, link: 0 },
  { focus: () => gwFocus().lerp(nodeFocus(), 0.5).add(new THREE.Vector3(0, 0.35, 0)), off: new THREE.Vector3(0.4, 2.4, 10.8), node: 1, link: 1 },
];
let step = 0, nodeVis = 0, linkVis = 0;
const camLook = new THREE.Vector3(0, 0.55, 0), camPos = camLook.clone().add(STEPS[0].off);
function setStep(i) {
  if (i === step) return; step = i;
  tabs.forEach((t, j) => t.classList.toggle("on", j === i));
  panels.forEach((p, j) => p.classList.toggle("on", j === i));
  autoIdx = 0; autoAt = 0;
}
function stepFromScroll() {
  if (isMob()) return;
  const r = wrap.getBoundingClientRect(), tot = wrap.offsetHeight - innerHeight;
  const p = Math.min(Math.max(-r.top / tot, 0), 1);
  setStep(p < 0.34 ? 0 : p < 0.67 ? 1 : 2);
}
addEventListener("scroll", stepFromScroll, { passive: true });
tabs.forEach((t, i) => t.addEventListener("click", () => {
  if (isMob()) { setStep(i); return; }
  const tot = wrap.offsetHeight - innerHeight;
  scrollTo({ top: wrap.offsetTop + ((i + 0.5) / 3) * tot, behavior: reduced ? "auto" : "smooth" });
}));

/* drag to spin the turntable */
let spin = -0.35, spinV = 0, dragging = false, lastX = 0;
canvas.addEventListener("pointerdown", e => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener("pointermove", e => {
  if (dragging) { const dx = e.clientX - lastX; lastX = e.clientX; spinV = dx * 0.006; spin += spinV; }
  const r = canvas.getBoundingClientRect();
  mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); mouseIn = true;
});
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointerleave", () => { mouseIn = false; });

/* hover labels (plus an auto-cycle so the scene is never unlabeled) */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(); let mouseIn = false;
const label = document.createElement("div"); label.className = "hw-label"; label.innerHTML = "<div></div>"; labelsEl.appendChild(label);
// [object whose local frame the point is in, local point, label source]
const AUTO = [
  [[gateway, new THREE.Vector3(0.3, 0.72, 0.42), grille], [gateway, new THREE.Vector3(-0.08, -0.46, 0.42), ledHit],
   [gateway, new THREE.Vector3(-0.8, 2.55, -0.3), gateway.children.find(c => c.isGroup).children[2]], [gateway, new THREE.Vector3(-0.2, 0.98, -0.15), port]],
  [[node, new THREE.Vector3(0, 0.22, 0), box], [probes[1], new THREE.Vector3(0, 0.2, 0), probes[1]], [node, new THREE.Vector3(0.05, 0, 0.9), node.children.find(c => c.userData.label && c.userData.label.title.startsWith("Sealed"))]],
  [[gateway, new THREE.Vector3(0, 0.95, 0.2), shell], [node, new THREE.Vector3(0, 0.25, 0), box]],
];
let autoIdx = 0, autoAt = 0;
const wp = new THREE.Vector3();
function showLabel(obj, point) {
  const l = obj.userData.label; if (!l) return;
  label.firstChild.innerHTML = `${l.title}<small>${l.sub}</small>`;
  wp.copy(point).project(camera);
  if (Math.abs(wp.x) > 0.92 || wp.y > 0.9 || wp.y < -0.95) { label.classList.remove("on"); return; }
  const r = canvas.getBoundingClientRect(), pr = canvas.parentElement.getBoundingClientRect();
  label.style.left = (r.left - pr.left + (wp.x + 1) / 2 * r.width) + "px";
  label.style.top = (r.top - pr.top + (1 - wp.y) / 2 * r.height) + "px";
  label.classList.add("on");
}

/* ---------------- loop ---------------- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener("resize", resize); resize();
let visible = true;
new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);
const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  if (!visible) return;
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime;
  const S = STEPS[step], k = 1 - Math.pow(0.02, dt);
  const mob = isMob();
  const f = S.focus();
  camLook.lerp(f, k); camPos.lerp(f.clone().addScaledVector(S.off, mob ? 1.2 : 1), k);
  camera.position.copy(camPos); camera.lookAt(camLook);
  nodeVis += (S.node - nodeVis) * k; linkVis += (S.link - linkVis) * k;
  node.scale.setScalar(Math.max(0.001, nodeVis));
  node.position.y = -0.85 - (1 - nodeVis) * 0.6;
  if (!dragging) { spinV *= 0.94; spin += spinV + (reduced ? 0 : Math.sin(t * 0.4) * 0.0008); spin += (-0.35 - spin) * 0.01 * (Math.abs(spinV) < 0.001 ? 1 : 0); }
  turntable.rotation.y = spin;
  gateway.position.y = Math.sin(t * 1.2) * 0.03;

  // LEDs: power steady, mesh flickers with traffic, uplink breathes, alert blinks now and then
  leds[1].material.emissiveIntensity = 1 + (Math.sin(t * 9) > 0.3 ? 2.5 : 0.3);
  leds[2].material.emissiveIntensity = 1.2 + Math.sin(t * 2) * 0.9;
  leds[3].material.emissiveIntensity = (t % 4) < 0.25 ? 3 : 0.15;
  nodeLed.material.emissiveIntensity = (t % 1.6) < 0.12 ? 3 : 0.4;

  pulses.forEach(p => {
    p.userData.t = (p.userData.t + dt * 0.35) % 1;
    arc.getPoint(p.userData.t, p.position);
    p.material.opacity = linkVis * Math.sin(p.userData.t * Math.PI);
    p.visible = linkVis > 0.02;
  });
  arcLine.material.opacity = 0.6 * linkVis; arcLine.visible = linkVis > 0.02;

  // label: hovered part wins, otherwise cycle the step's highlights
  let shown = false;
  if (mouseIn && !dragging) {
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(hoverables, false).find(h => h.object.visible && (h.object.parent !== node || nodeVis > 0.5));
    if (hit) { showLabel(hit.object, hit.point); shown = true; canvas.style.cursor = "pointer"; }
    else canvas.style.cursor = "";
  }
  if (!shown) {
    autoAt += dt;
    if (autoAt > 2.6) { autoAt = 0; autoIdx++; }
    const list = AUTO[step], [frame, local, src] = list[autoIdx % list.length];
    frame.updateWorldMatrix(true, false);
    showLabel(src, frame.localToWorld(local.clone()));
  }
  renderer.render(scene, camera);
}
stepFromScroll();
loop();
