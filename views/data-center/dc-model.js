/* SURDS data center: the procedural five-level model, shared by /data-center and /explore.
   Level 0 plant · 1 power & ops · 2 network & AI · 3 data hall · 4 roof. Units are metres, Y is up.
   buildModel(renderer) returns one THREE.Group per level (walls kept separate so pages can cut them away)
   plus the materials and the animated parts (fans, LEDs, sensor rings). Static geometry is merged per
   material per level; racks, LEDs and tiles are instanced. */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const W = 44, D = 28, H = 8.4, RF = 0.6;   // footprint, storey height, raised floor
const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
let maxAniso = 8;

// ============================================================ helpers
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(7);
function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const std = (color, roughness = 0.7, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
const tmat = (map, roughness = 0.6, metalness = 0.2, extra = {}) => new THREE.MeshStandardMaterial({ map, roughness, metalness, ...extra });
const basic = (o) => new THREE.MeshBasicMaterial(o);

const gCache = new Map();
function boxGeo(w, h, d) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = gCache.get(k); if (!g) { g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0); gCache.set(k, g); }
  return g;
}
function box(p, w, h, d, mat, x, y, z, ry = 0) { const m = new THREE.Mesh(boxGeo(w, h, d), mat); m.position.set(x, y, z); m.rotation.y = ry; p.add(m); return m; }
function cyl(p, r, len, mat, x, y, z, axis = "y", seg = 20, rTop) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop ?? r, r, len, seg), mat);
  if (axis === "y") m.position.set(x, y + len / 2, z);
  else { m.position.set(x, y, z); if (axis === "x") m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2; }
  p.add(m); return m;
}
function sphere(p, r, mat, x, y, z, seg = 14) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), mat); m.position.set(x, y, z); p.add(m); return m; }
function pipe(p, a, b, r, mat, seg = 12) {
  const A = new V3(...a), B = new V3(...b), dir = B.clone().sub(A), len = dir.length(); if (len < 1e-4) return;
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.position.copy(A).addScaledVector(dir, 0.5); m.quaternion.setFromUnitVectors(UP, dir.normalize()); p.add(m); return m;
}
function run(p, pts, r, mat, seg = 12) {
  for (let i = 0; i < pts.length - 1; i++) pipe(p, pts[i], pts[i + 1], r, mat, seg);
  for (let i = 1; i < pts.length - 1; i++) sphere(p, r * 1.04, mat, ...pts[i], seg);
}
function plane(p, w, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat); m.position.set(x, y, z); p.add(m); return m;
}
const o3 = new THREE.Object3D();
function instance(p, geo, mat, list, cast = true) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => { o3.position.set(t[0], t[1], t[2]); o3.rotation.set(0, t[3] || 0, 0); o3.scale.set(t[4] || 1, t[5] || 1, t[6] || 1); o3.updateMatrix(); im.setMatrixAt(i, o3.matrix); });
  im.castShadow = cast; im.receiveShadow = true; p.add(im); return im;
}
const keep = (m) => { if (m) m.userData.noMerge = true; return m; };

// ============================================================ textures (procedural, drawn once)
function rect(x, c, X, Y, w, h) { x.fillStyle = c; x.fillRect(X, Y, w, h); }
function drawUnit(x, type, X, Y, w, h, r) {
  const ears = () => { rect(x, "#2c3139", X, Y, 5, h); rect(x, "#2c3139", X + w - 5, Y, 5, h); };
  if (type === "blank") { rect(x, "#14171b", X, Y, w, h); rect(x, "#2a2e35", X + 3, Y + h / 2 - 1.5, 3, 3); rect(x, "#2a2e35", X + w - 6, Y + h / 2 - 1.5, 3, 3); return; }
  if (type === "server1") {
    const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, "#232830"); g.addColorStop(1, "#171a1f"); rect(x, g, X, Y, w, h); ears();
    for (let i = 0; i < 4; i++) { rect(x, "#272c35", X + 8 + i * 16, Y + 2, 14, h - 4); rect(x, "#3d434d", X + 8 + i * 16, Y + 2, 14, 1.5); }
    for (let vx = X + 76; vx < X + w - 30; vx += 4) rect(x, "#0e1013", vx, Y + 3, 2, h - 6);
    rect(x, r() < 0.9 ? "#3ddc84" : "#f5a623", X + w - 22, Y + h / 2 - 1.5, 3, 3); rect(x, "#c9ced6", X + w - 15, Y + 4, 5, h - 8); return;
  }
  if (type === "server2") {
    const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, "#252a32"); g.addColorStop(1, "#16191e"); rect(x, g, X, Y, w, h); ears();
    const bw = (w - 64) / 8;
    for (let row = 0; row < 2; row++) for (let i = 0; i < 8; i++) {
      const bx = X + 10 + i * bw, by = Y + 3 + row * (h - 6) / 2;
      rect(x, "#2b313a", bx, by, bw - 3, (h - 6) / 2 - 2); rect(x, "#454c57", bx, by, bw - 3, 1.5); rect(x, r() < 0.85 ? "#2fbf71" : "#1a1d22", bx + bw - 8, by + 3, 2.5, 2.5);
    }
    for (let vy = Y + 4; vy < Y + h - 4; vy += 4) rect(x, "#0d0f12", X + w - 50, vy, 36, 2);
    return;
  }
  if (type === "jbod") {
    rect(x, "#1b1f25", X, Y, w, h); ears();
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      const bw = (w - 20) / 4, bh = (h - 8) / 3, bx = X + 10 + i * bw, by = Y + 4 + row * bh;
      rect(x, "#2a2f37", bx, by, bw - 4, bh - 3); rect(x, "#4a515c", bx + 4, by + bh - 9, bw - 12, 3); rect(x, "#2fbf71", bx + bw - 12, by + 4, 3, 3);
    }
    return;
  }
  if (type === "switch" || type === "patch") {
    rect(x, type === "patch" ? "#1f2329" : "#1b1f25", X, Y, w, h); ears();
    const n = 24, pw = (w - 60) / n;
    for (let i = 0; i < n; i++) {
      const px = X + 12 + i * pw; rect(x, "#050607", px, Y + 3, pw - 2, h - 6); rect(x, "#3a3f47", px, Y + 3, pw - 2, 1);
      if (r() < 0.7) rect(x, type === "patch" ? (r() < 0.6 ? "#f2c200" : "#2d6fd6") : ["#2d6fd6", "#f2c200", "#e2672a", "#b8bec7"][r() * 4 | 0], px + 1, Y + h / 2 - 2, pw - 4, 4);
    }
    rect(x, "#2fbf71", X + w - 30, Y + 4, 3, 3); rect(x, "#2fbf71", X + w - 24, Y + 4, 3, 3);
    return;
  }
  if (type === "gpu") {
    rect(x, "#20242a", X, Y, w, h); ears();
    x.fillStyle = "#08090b";
    for (let yy = Y + 8; yy < Y + h - 12; yy += 7) for (let xx = X + 12 + ((yy / 7 | 0) % 2) * 3.5; xx < X + w - 12; xx += 7) { x.beginPath(); x.arc(xx, yy, 2.4, 0, 6.3); x.fill(); }
    rect(x, "#d7dbe0", X + 10, Y + h - 9, w - 20, 3); rect(x, "#2fbf71", X + w - 22, Y + h - 16, 4, 4);
    return;
  }
  if (type === "chassis") {
    rect(x, "#1a1e24", X, Y, w, h); ears();
    for (let i = 0; i < 8; i++) {
      const cw = (w - 20) / 8, cx = X + 10 + i * cw; rect(x, i === 3 || i === 4 ? "#2b3039" : "#232830", cx, Y + 4, cw - 3, h - 8);
      for (let k = 0; k < 18; k++) rect(x, "#050607", cx + 4, Y + 14 + k * ((h - 30) / 18), cw - 11, (h - 30) / 18 - 4);
      rect(x, "#2fbf71", cx + 4, Y + 7, 3, 3);
    }
    return;
  }
  if (type === "fan") {
    rect(x, "#181b20", X, Y, w, h); x.strokeStyle = "#2c3139"; x.lineWidth = 2;
    for (let i = 0; i < 4; i++) { const cx = X + w * (i + 0.5) / 4; x.beginPath(); x.arc(cx, Y + h / 2, h * 0.38, 0, 6.3); x.stroke(); x.beginPath(); x.arc(cx, Y + h / 2, h * 0.18, 0, 6.3); x.stroke(); }
  }
}
function rackFrontTex(kind, seed) {
  return canvasTex(256, 1024, (x, w, h) => {
    const r = rng(seed);
    rect(x, "#0a0c0f", 0, 0, w, h); rect(x, "#23272e", 0, 0, w, 26); rect(x, "#23272e", 0, h - 34, w, 34); rect(x, "#23272e", 0, 0, 14, h); rect(x, "#23272e", w - 14, 0, 14, h);
    rect(x, "#3a3f47", 16, 30, 8, h - 68); rect(x, "#3a3f47", w - 24, 30, 8, h - 68);
    for (let y = 34; y < h - 40; y += 8) { rect(x, "#0c0d0f", 18, y, 4, 3); rect(x, "#0c0d0f", w - 22, y, 4, 3); }
    const top = 30, bot = h - 38, U = (bot - top) / 42;
    let u = 0;
    while (u < 42) {
      let size, type; const k = r();
      if (kind === "gpu") { if (u < 2) { size = 1; type = "switch"; } else { size = 6; type = "gpu"; } }
      else if (kind === "net") { if (k < 0.55) { size = 1; type = "switch"; } else if (k < 0.8) { size = 1; type = "patch"; } else { size = 1 + (r() * 2 | 0); type = "blank"; } }
      else if (kind === "storage") { if (k < 0.78) { size = 4; type = "jbod"; } else { size = 2; type = "server2"; } }
      else if (kind === "router") { if (u === 0) { size = 2; type = "fan"; } else if (u < 30) { size = 28; type = "chassis"; } else if (u < 32) { size = 2; type = "fan"; } else { size = 10; type = "blank"; } }
      else { if (k < 0.38) { size = 1; type = "server1"; } else if (k < 0.66) { size = 2; type = "server2"; } else if (k < 0.75) { size = 4; type = "jbod"; } else if (k < 0.85) { size = 1; type = "switch"; } else { size = 1 + (r() * 3 | 0); type = "blank"; } }
      size = Math.min(size, 42 - u);
      drawUnit(x, type, 28, top + u * U, w - 56, size * U - 1.5, r);
      u += size;
    }
  });
}
function rackRearTex(seed) {
  return canvasTex(256, 1024, (x, w, h) => {
    const r = rng(seed);
    rect(x, "#0a0b0d", 0, 0, w, h); rect(x, "#20242a", 0, 0, w, 26); rect(x, "#20242a", 0, h - 34, w, 34);
    for (let y = 40; y < h - 50; y += 46) {
      rect(x, "#14171b", 46, y, w - 92, 40);
      for (let i = 0; i < 3; i++) { x.strokeStyle = "#2a2f36"; x.lineWidth = 2; x.beginPath(); x.arc(70 + i * 26, y + 20, 10, 0, 6.3); x.stroke(); }
      rect(x, "#22262c", w - 110, y + 6, 26, 28); rect(x, "#22262c", w - 80, y + 6, 26, 28);
    }
    for (const px of [30, w - 44]) { rect(x, "#121417", px, 40, 14, h - 90); for (let y = 52; y < h - 60; y += 22) rect(x, r() < 0.5 ? "#e0782a" : "#2a2d31", px + 3, y, 8, 12); }
    const cols = ["#121315", "#121315", "#2d6fd6", "#f2c200", "#e2672a", "#7a8089"];
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = cols[r() * cols.length | 0]; x.lineWidth = 1.5 + r() * 2.5; x.beginPath();
      const sx = r() < 0.5 ? 38 : w - 36, sy = 60 + r() * (h - 140), ex = 70 + r() * (w - 140), ey = 50 + r() * (h - 120);
      x.moveTo(sx, sy); x.bezierCurveTo(sx + (ex - sx) * 0.2, sy + 40, ex - 20, ey - 40, ex, ey); x.stroke();
    }
  });
}
const finTex = (base = "#9aa0a8", line = "#5d636b", rep = [1, 1]) => canvasTex(128, 128, (x, w, h) => { rect(x, base, 0, 0, w, h); for (let i = 0; i < w; i += 4) rect(x, line, i, 0, 1.5, h); rect(x, "#6c727b", 0, 0, w, 3); rect(x, "#6c727b", 0, h - 3, w, 3); }, { repeat: rep });
const louverTex = () => canvasTex(256, 256, (x, w, h) => {
  rect(x, "#d4d7dc", 0, 0, w, h); for (let y = 70; y < h - 12; y += 9) { rect(x, "#a4a9b0", 14, y, w - 28, 4); rect(x, "#eceef1", 14, y + 4, w - 28, 1); }
  rect(x, "#1a2230", 18, 16, 92, 40); x.fillStyle = "#58e0a0"; x.font = "600 22px Inter, sans-serif"; x.fillText("18.4°C", 26, 44);
  rect(x, "#9ba1a9", w - 70, 22, 48, 6); rect(x, "#9ba1a9", w - 70, 34, 36, 6);
});
const panelTex = () => canvasTex(256, 512, (x, w, h) => {
  rect(x, "#c8ccd2", 0, 0, w, h);
  for (let k = 0; k < 3; k++) { const y = 18 + k * 160; x.strokeStyle = "#8e949c"; x.lineWidth = 3; x.strokeRect(14, y, w - 28, 148);
    rect(x, "#9aa0a8", 36, y + 24, 70, 34); rect(x, "#30353c", 44, y + 32, 54, 18); rect(x, "#2d2f33", w - 70, y + 60, 12, 50);
    rect(x, k === 1 ? "#d9382f" : "#2fbf71", 40, y + 90, 12, 12); rect(x, "#f2c200", 60, y + 90, 12, 12); rect(x, "#f4f5f6", 40, y + 118, 90, 12); }
});
const upsTex = () => canvasTex(512, 512, (x, w, h) => {
  rect(x, "#e1e3e6", 0, 0, w, h); rect(x, "#bfc3c9", 0, 0, w, 30);
  const g = x.createLinearGradient(0, 70, 0, 230); g.addColorStop(0, "#0e2238"); g.addColorStop(1, "#08121f"); rect(x, g, 60, 70, 220, 160);
  for (let i = 0; i < 6; i++) rect(x, "#3ddc84", 80 + i * 32, 200 - (40 + (i * 23 % 70)), 20, 40 + (i * 23 % 70));
  x.fillStyle = "#cfe3ff"; x.font = "600 22px Inter, sans-serif"; x.fillText("LOAD 72%", 80, 104);
  rect(x, "#2fbf71", 320, 90, 14, 14); rect(x, "#2fbf71", 320, 116, 14, 14); rect(x, "#f2c200", 320, 142, 14, 14);
  for (let y = 300; y < h - 30; y += 10) rect(x, "#c4c8ce", 40, y, w - 80, 4);
});
const battTex = () => canvasTex(256, 512, (x, w, h) => {
  rect(x, "#c9cdd3", 0, 0, w, h); rect(x, "#a9aeb5", 0, 0, w, 24);
  for (let i = 0; i < 9; i++) { const y = 40 + i * 50; rect(x, "#b4b9c0", 18, y, w - 36, 42); rect(x, "#8a9098", 18, y + 38, w - 36, 4); rect(x, "#2fbf71", w - 40, y + 14, 8, 8); rect(x, "#30353c", 30, y + 12, 80, 14); }
});
const cduTex = () => canvasTex(256, 512, (x, w, h) => {
  rect(x, "#d9dce0", 0, 0, w, h); rect(x, "#14263c", 30, 30, 120, 80);
  x.fillStyle = "#7fd4ff"; x.font = "600 18px Inter, sans-serif"; x.fillText("SUP 32°C", 40, 62); x.fillText("RET 42°C", 40, 90);
  for (const gx of [70, 150]) { x.fillStyle = "#f3f4f6"; x.beginPath(); x.arc(gx, 170, 26, 0, 6.3); x.fill(); x.strokeStyle = "#555"; x.lineWidth = 3; x.stroke(); x.beginPath(); x.moveTo(gx, 170); x.lineTo(gx + 14, 158); x.stroke(); }
  for (let y = 240; y < h - 30; y += 10) rect(x, "#b3b8bf", 30, y, w - 60, 4);
});
const odfTex = () => canvasTex(256, 1024, (x, w, h) => {
  const r = rng(21); rect(x, "#d6d9dd", 0, 0, w, h); rect(x, "#aeb3ba", 0, 0, 12, h); rect(x, "#aeb3ba", w - 12, 0, 12, h);
  for (let y = 30; y < h - 40; y += 38) { rect(x, "#2a2e34", 20, y, w - 40, 26); for (let i = 0; i < 16; i++) rect(x, "#0a0b0c", 26 + i * 13, y + 7, 9, 12); }
  x.lineWidth = 2;
  for (let i = 0; i < 90; i++) { x.strokeStyle = r() < 0.75 ? "#f2c200" : "#2d6fd6"; x.beginPath(); const sx = 30 + r() * (w - 60), sy = 40 + r() * (h - 120); x.moveTo(sx, sy); x.quadraticCurveTo(sx + (r() - 0.5) * 60, sy + 60, w - 18, sy + 80 + r() * 100); x.stroke(); }
});
const meshTex = (rep) => canvasTex(128, 128, (x, w, h) => {
  x.clearRect(0, 0, w, h); x.strokeStyle = "rgba(170,176,184,1)"; x.lineWidth = 2;
  for (let i = -w; i < w * 2; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i, h); x.lineTo(i + h, 0); x.stroke(); }
}, { repeat: rep, srgb: true });
const tileTex = (rep, perf = false) => canvasTex(512, 512, (x, w, h) => {
  const r = rng(perf ? 3 : 5); rect(x, "#8b9097", 0, 0, w, h); const s = w / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const v = 190 + (r() * 14 | 0); rect(x, `rgb(${v},${v + 3},${v + 7})`, i * s + 2, j * s + 2, s - 4, s - 4);
    if (perf) { x.fillStyle = "#5e646c"; for (let a = 0; a < 11; a++) for (let b = 0; b < 11; b++) { x.beginPath(); x.arc(i * s + 12 + a * 10.4, j * s + 12 + b * 10.4, 2.6, 0, 6.3); x.fill(); } }
  }
}, { repeat: rep });
const cladTex = () => canvasTex(256, 256, (x, w, h) => {
  const r = rng(9); for (let i = 0; i < 4; i++) { const v = 44 + (r() * 8 | 0); rect(x, `rgb(${v},${v + 2},${v + 5})`, i * 64, 0, 64, h); rect(x, "#24272b", i * 64, 0, 2, h); }
  rect(x, "#1a1c1f", 0, 10, w, 38); for (let y = 13; y < 46; y += 5) rect(x, "#3a3e44", 0, y, w, 2);
  rect(x, "#ffcf9a", 0, 52, w, 2);
  rect(x, "#24272b", 0, h - 2, w, 2);
}, { repeat: [W / 6, 1] });
const solarTex = () => canvasTex(256, 128, (x, w, h) => { rect(x, "#0c1a33", 0, 0, w, h); x.strokeStyle = "#5c6f8f"; x.lineWidth = 1.2; for (let i = 0; i <= w; i += 21.3) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } for (let j = 0; j <= h; j += 21.3) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); } }, { repeat: [12, 1] });
const grilleTex = () => canvasTex(256, 256, (x, w, h) => { rect(x, "#2a2d31", 0, 0, w, h); for (let i = 8; i < w; i += 8) rect(x, "#121315", i, 8, 3, h - 16); rect(x, "#4a4f57", 0, 0, w, 8); rect(x, "#4a4f57", 0, h - 8, w, 8); });
function screenTex(seed, wide = false) {
  return canvasTex(wide ? 2048 : 512, wide ? 512 : 300, (x, w, h) => {
    const r = rng(seed); rect(x, "#04070c", 0, 0, w, h);
    const panel = (X, Y, pw, ph, title) => { rect(x, "#0b1220", X, Y, pw, ph); x.fillStyle = "#7f8ea3"; x.font = `600 ${wide ? 22 : 16}px Inter, sans-serif`; x.fillText(title, X + 14, Y + (wide ? 34 : 24)); };
    const line = (X, Y, pw, ph, col) => { x.strokeStyle = col; x.lineWidth = wide ? 3 : 2; x.beginPath(); let v = 0.5; for (let i = 0; i <= 40; i++) { v = Math.min(0.92, Math.max(0.12, v + (r() - 0.5) * 0.18)); const px = X + i * pw / 40, py = Y + ph - v * ph; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); };
    if (wide) {
      panel(20, 20, 600, h - 40, "DATA HALL L3 · RACK INLET °C");
      for (let a = 0; a < 8; a++) for (let b = 0; b < 26; b++) { const t = r(); rect(x, t < 0.7 ? "#1f7a5c" : t < 0.92 ? "#3aa776" : "#d9902b", 34 + b * 22, 70 + a * 48, 18, 40); }
      panel(640, 20, 580, h - 40, "IT LOAD · MW"); line(660, 90, 540, 300, "#ff8a2a"); x.fillStyle = "#f1f0ec"; x.font = "600 64px Inter, sans-serif"; x.fillText("4.82", 660, 460);
      panel(1240, 20, 380, h - 40, "PUE"); x.fillStyle = "#f1f0ec"; x.font = "600 120px Inter, sans-serif"; x.fillText("1.31", 1270, 230); line(1260, 290, 340, 140, "#58e0a0");
      panel(1640, 20, 388, h - 40, "ALERTS"); x.font = "600 26px Inter, sans-serif"; x.fillStyle = "#58e0a0"; x.fillText("● All systems normal", 1660, 100);
      x.fillStyle = "#7f8ea3"; x.font = "500 22px Inter, sans-serif"; ["CRAH-07 filter due 6d", "UPS-B battery test 02:00", "GEN-3 run test Sun", "Fuel 96% · 61 h", "Leak ropes: dry"].forEach((t, i) => x.fillText(t, 1660, 160 + i * 52));
    } else {
      panel(10, 10, w - 20, h - 20, ["NETWORK · Gb/s", "COOLING · ΔT", "POWER · kW", "SECURITY"][seed % 4]);
      line(24, 60, w - 48, h - 100, ["#ff8a2a", "#58e0a0", "#7fb2ff", "#f1f0ec"][seed % 4]);
    }
  });
}
function signTex(text) { return canvasTex(256, 64, (x, w, h) => { rect(x, "#111316", 0, 0, w, h); x.fillStyle = "#f2c200"; x.font = "700 28px Inter, sans-serif"; x.textAlign = "center"; x.fillText(text, w / 2, 43); }); }

// ============================================================ materials
let M;
function makeMaterials() {
  M = {
    slab: std(0x8c9097, 0.9), deck: std(0x45494f, 0.85), epoxy: std(0x3d444b, 0.45), epoxyLight: std(0xa9adb3, 0.5), lobby: std(0x2d2a28, 0.6),
    wallLight: std(0xcfd2d7, 0.85), wallDark: std(0x585d64, 0.9), concrete: std(0x9a9da2, 0.9),
    rackSide: std(0x15181c, 0.45, 0.6), rackTop: std(0x101215, 0.6, 0.5),
    metal: std(0x8e949c, 0.35, 0.8), metalDark: std(0x3a3f46, 0.45, 0.7), white: std(0xe6e8eb, 0.45, 0.25), grey: std(0xc5c9cf, 0.55, 0.2),
    yellow: std(0xf2c200, 0.5), black: std(0x16181b, 0.6), red: std(0xc8262b, 0.45, 0.2), redDim: std(0x8a2a2d, 0.6, 0.2), blue: std(0x2f6fd6, 0.4, 0.2), orange: std(0xe2672a, 0.4, 0.2), green: std(0x2f9a72, 0.4, 0.2),
    copper: std(0xb8733a, 0.35, 0.85), wood: std(0x8b6a43, 0.8), desk: std(0xd9dadd, 0.5),
    genYellow: std(0xe7b416, 0.45, 0.3), genGrey: std(0x4a5058, 0.45, 0.6), chiller: std(0x56718d, 0.45, 0.4), pump: std(0x2d5f9a, 0.4, 0.4),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe3ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
    wrap: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }),
    fluid: new THREE.MeshStandardMaterial({ color: 0x1fb3c9, emissive: 0x0d6f80, emissiveIntensity: 0.9, roughness: 0.08 }),
    light: basic({ color: 0xf4f7ff }), lamp: basic({ color: 0xffe2b0 }),
    sensor: basic({ color: 0xff8a2a }), ring: basic({ color: 0xff8a2a, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    shirt: std(0x2b5fd9, 0.8), vest: std(0xd6ff3f, 0.7), skin: std(0xc99a7a, 0.7), trouser: std(0x22252a, 0.8),
    fanBlade: std(0x2a2d31, 0.5, 0.5),
  };
  M.rearStd = tmat(rackRearTex(11), 0.6, 0.3);
  M.front = { mix0: tmat(rackFrontTex("mix", 1)), mix1: tmat(rackFrontTex("mix", 2)), mix2: tmat(rackFrontTex("mix", 3)), mix3: tmat(rackFrontTex("mix", 4)),
              net: tmat(rackFrontTex("net", 5)), storage: tmat(rackFrontTex("storage", 6)), gpu: tmat(rackFrontTex("gpu", 7)), router: tmat(rackFrontTex("router", 8)) };
  M.coil = tmat(finTex("#8fa7b8", "#4c6a80"), 0.4, 0.6);
  M.louver = tmat(louverTex(), 0.6, 0.1); M.panel = tmat(panelTex(), 0.55, 0.15); M.ups = tmat(upsTex(), 0.5, 0.1); M.batt = tmat(battTex(), 0.55, 0.15);
  M.cdu = tmat(cduTex(), 0.5, 0.1); M.odf = tmat(odfTex(), 0.6, 0.1); M.grille = tmat(grilleTex(), 0.6, 0.4);
  M.fins = tmat(finTex("#a3a9b1", "#6b727b", [6, 1]), 0.45, 0.6);
  M.mesh = new THREE.MeshStandardMaterial({ map: meshTex([4, 3]), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6, color: 0xb9bec6 });
  M.solar = tmat(solarTex(), 0.25, 0.5);
  M.video = basic({ map: screenTex(1, true) });
  M.screens = [0, 1, 2, 3].map((i) => basic({ map: screenTex(40 + i) }));
  M.tile = tmat(tileTex([W / 2.4, D / 2.4]), 0.6, 0.05);
  M.perf = tmat(tileTex([16.8 / 2.4, 1.2 / 2.4], true), 0.6, 0.05);
  M.signs = ["CARRIER A", "CARRIER B", "CARRIER C", "CARRIER D"].map((t) => basic({ map: signTex(t) }));
  M.cladBase = tmat(cladTex(), 0.5, 0.5);
  M.pierRoof = std(0x8a8f96, 0.55, 0.3); M.roofTop = std(0xb8bbbf, 0.8, 0.1);
  WINTEX = { long: [windowTex(W, 101), windowTex(W, 202)], short: [windowTex(D, 303), windowTex(D, 404)] };
  // name every material after its key, so exports (GLB -> Blender) can be re-lit by name
  const nameAll = (o, k) => { if (o && o.isMaterial) o.name = k; else if (o && typeof o === "object") for (const [kk, v] of Object.entries(o)) nameAll(v, `${k}_${kk}`); };
  for (const [k, v] of Object.entries(M)) nameAll(v, k);
}

// ============================================================ facade: the site's data-center skin, modelled
// Bays of 2.6 m between 0.6 m grey piers, a 0.6 m ledge under every window band, two bands per storey.
// Behind the piers sits a glazing plane whose canvas paints each pane as a room: ceiling glow, blinds,
// desks and monitors when lit; tinted, sky-reflecting glass when dark.
const BAY = 1.5, PIER = 0.32, LEDGE = 0.42, NB = 3, ROWH = H / NB;
function drawRoom(x, X, Y, w, h, r, cool) {
  const c = cool ? ["#e6efff", "#a9bdd6", "#3c4a5c"] : ["#ffe2b8", "#d39a5e", "#5c3b21"];
  const g = x.createLinearGradient(0, Y, 0, Y + h); g.addColorStop(0, c[0]); g.addColorStop(0.45, c[1]); g.addColorStop(1, c[2]);
  rect(x, g, X, Y, w, h);
  rect(x, "rgba(255,255,255,0.85)", X + w * 0.12, Y + h * 0.07, w * 0.76, 2);                       // ceiling light strip
  for (let k = 0; k < 2; k++) if (r() < 0.6) rect(x, "rgba(40,28,18,0.35)", X + r() * w * 0.7, Y + h * 0.25, w * (0.12 + r() * 0.15), h * 0.4);  // shelves, doors
  const dy = Y + h * (0.66 + r() * 0.06);
  rect(x, cool ? "rgba(20,26,36,0.85)" : "rgba(38,25,14,0.85)", X, dy, w, h * 0.12);                 // desk band
  for (let k = 0; k < 3; k++) if (r() < 0.75) { const mx = X + w * (0.08 + k * 0.3 + r() * 0.08); rect(x, "#141820", mx, dy - h * 0.11, w * 0.13, h * 0.1); rect(x, cool ? "#9fd4ff" : "#7fb7ff", mx + 1, dy - h * 0.1, w * 0.13 - 2, h * 0.08); }
  for (let k = 0; k < 2; k++) if (r() < 0.55) { const cx = X + w * (0.15 + r() * 0.7); x.fillStyle = "rgba(15,12,10,0.8)"; x.beginPath(); x.roundRect(cx, dy - h * 0.16, w * 0.08, h * 0.26, 3); x.fill(); }
  rect(x, cool ? "rgba(10,14,22,0.6)" : "rgba(30,18,10,0.6)", X, Y + h * 0.82, w, h * 0.18);       // floor
  if (r() < 0.42) {                                                                                  // blinds drawn to a random height
    const bh = h * (0.2 + r() * 0.65);
    rect(x, cool ? "rgba(220,230,245,0.55)" : "rgba(245,220,185,0.55)", X, Y, w, bh);
    for (let yy = Y; yy < Y + bh; yy += 4) rect(x, "rgba(0,0,0,0.18)", X, yy, w, 1.5);
  }
  const v = x.createLinearGradient(X, 0, X + w, 0); v.addColorStop(0, "rgba(0,0,0,0.45)"); v.addColorStop(0.2, "rgba(0,0,0,0)"); v.addColorStop(0.8, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.45)");
  rect(x, v, X, Y, w, h);
}
function drawGlass(x, X, Y, w, h, r) {
  const g = x.createLinearGradient(X, Y, X + w * 0.6, Y + h); g.addColorStop(0, "#1b2635"); g.addColorStop(1, "#06090d"); rect(x, g, X, Y, w, h);
  x.fillStyle = "rgba(160,190,230,0.10)"; x.beginPath(); x.moveTo(X + w * 0.15, Y); x.lineTo(X + w * 0.45, Y); x.lineTo(X + w * 0.1, Y + h); x.lineTo(X - w * 0.2, Y + h); x.fill();
  if (r() < 0.08) rect(x, "rgba(110,170,255,0.55)", X + w * (0.2 + r() * 0.5), Y + h * 0.62, w * 0.12, h * 0.08);
}
function windowTex(len, seed) {
  const bays = Math.round(len / BAY);
  return canvasTex(2048, 512, (x, w, h) => {
    const r = rng(seed), bw = w / bays, rh = h / NB;
    rect(x, "#0b0d10", 0, 0, w, h);
    for (let row = 0; row < NB; row++) for (let b = 0; b < bays; b++) {
      const X = b * bw + bw * (PIER / BAY) / 2, wc = bw * (1 - PIER / BAY), Y = row * rh + 2, hc = rh * (1 - LEDGE / ROWH) - 4;
      if (r() < 0.25) drawRoom(x, X, Y, wc, hc, r, r() < 0.2); else drawGlass(x, X, Y, wc, hc, r);
      rect(x, "#2a2e35", X, Y + hc * 0.22, wc, 1.5);                                                // transom
    }
  });
}
let WINTEX = null;
function facadeWall(g, nx, nz, i, wallMat) {
  const L = nx ? D : W, bays = Math.round(L / BAY), bw = L / bays;
  const out = (d) => nx ? [nx * (W / 2 - d), nz] : [0, nz * (D / 2 - d)];
  const winMat = new THREE.MeshStandardMaterial({ map: WINTEX[nx ? "short" : "long"][(i + (nx || nz) + 2) % 2], roughness: 0.16, metalness: 0.25,
    emissive: 0xffffff, emissiveIntensity: 0.95, transparent: true });
  winMat.emissiveMap = winMat.map; winMat.name = "window";
  const pierMat = std(0x9095a0, 0.5, 0.3, { transparent: true }), liner = wallMat.clone(); liner.transparent = true;
  pierMat.name = "pier"; liner.name = "liner";
  const meshes = [];
  // glazing plane, set back behind the piers
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(L, H), winMat);
  if (nx) glass.position.set(nx * (W / 2 - 0.3), H / 2, 0); else glass.position.set(0, H / 2, nz * (D / 2 - 0.3));
  glass.rotation.y = nx ? (nx > 0 ? Math.PI / 2 : -Math.PI / 2) : (nz > 0 ? 0 : Math.PI); g.add(glass); meshes.push(glass);
  // piers (full storey), ledges (one under each band), mullions (centre of each bay)
  const piers = [], mull = [];
  for (let k = 0; k <= bays; k++) { const t = -L / 2 + k * bw; piers.push(nx ? [nx * (W / 2 - 0.175), 0, t] : [t, 0, nz * (D / 2 - 0.175)]); }
  for (let row = 0; row < NB; row++) for (let k = 0; k < bays; k++) { const t = -L / 2 + (k + 0.5) * bw, y = row * ROWH + LEDGE + (ROWH - LEDGE) * 0.22; mull.push(nx ? [nx * (W / 2 - 0.27), y, t] : [t, y, nz * (D / 2 - 0.27)]); }
  meshes.push(instance(g, nx ? boxGeo(0.35, H, PIER) : boxGeo(PIER, H, 0.35), pierMat, piers));
  meshes.push(instance(g, nx ? boxGeo(0.05, 0.05, bw - PIER) : boxGeo(bw - PIER, 0.05, 0.05), pierMat, mull));
  for (let row = 0; row < NB; row++) meshes.push(box(g, nx ? 0.4 : L + 0.4, LEDGE, nx ? L + 0.4 : 0.4, pierMat, nx * (W / 2 - 0.2), row * ROWH, nz * (D / 2 - 0.2)));
  // interior liner
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(L, H), liner);
  if (nx) pl.position.set(nx * (W / 2 - 0.42), H / 2, 0); else pl.position.set(0, H / 2, nz * (D / 2 - 0.42));
  pl.rotation.y = nx ? (nx > 0 ? -Math.PI / 2 : Math.PI / 2) : (nz > 0 ? Math.PI : 0); g.add(pl); meshes.push(pl);
  for (const m of meshes) { keep(m); m.userData.wall = true; }
  return { n: [nx, nz], mats: [winMat, pierMat, liner], meshes };
}

// ============================================================ shared builders
function shell(g, i, wallMat) {
  box(g, W, 0.5, D, M.slab, 0, -0.5, 0);
  if (i >= 4) return [];
  for (let k = 0; k < 5; k++) { box(g, 0.55, H, 0.55, M.concrete, -W / 2 + 0.75, 0, -D / 2 + 2 + k * 6.2); box(g, 0.55, H, 0.55, M.concrete, -W / 2 + 2 + k * 10, 0, -D / 2 + 0.75); }
  return [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([nx, nz]) => facadeWall(g, nx, nz, i, wallMat));
}
function risers(g, y0, y1) {               // chilled water (blue/orange), condenser (green) and generator exhaust run through every level
  pipe(g, [20.6, y0, -12.4], [20.6, y1, -12.4], 0.3, M.blue); pipe(g, [21.15, y0, -12.4], [21.15, y1, -12.4], 0.3, M.orange);
  pipe(g, [19.8, y0, -11.9], [19.8, y1, -11.9], 0.25, M.green);
  for (const x of [-19.1, -14.6, -10.1, -5.6]) pipe(g, [x, y0, -13.45], [x, y1, -13.45], 0.22, M.metalDark);
}
function raisedFloor(g) {
  box(g, W - 0.3, 0.06, D - 0.3, M.grey, 0.15, RF - 0.06, 0.15);
  plane(g, W - 0.3, D - 0.3, M.tile, 0.15, RF + 0.002, 0.15);
  const posts = [];
  for (let x = -W / 2 + 0.6; x < W / 2; x += 0.6) posts.push([x, 0, D / 2 - 0.3]);
  for (let z = -D / 2 + 0.6; z < D / 2; z += 0.6) posts.push([W / 2 - 0.3, 0, z]);
  instance(g, boxGeo(0.05, RF - 0.06, 0.05), M.metal, posts, false);
}
const LEDS = [];      // {im, n}
function racks(g, list, ledsPer = 6) {
  const groups = new Map();
  for (const r of list) { const k = `${r.kind}|${r.w}|${r.h}|${r.d}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  const ledPos = [];
  for (const [k, rs] of groups) {
    const { kind, w, h, d } = rs[0];
    const mats = [M.rackSide, M.rackSide, M.rackTop, M.rackTop, M.front[kind], M.rearStd];
    instance(g, boxGeo(w, h, d), mats, rs.map((r) => [r.x, r.y, r.z, r.f > 0 ? 0 : Math.PI]));
    for (const r of rs) for (let i = 0; i < ledsPer; i++) {
      const lx = (w / 2 - 0.09) - R() * 0.05, ly = r.y + 0.12 + R() * (h - 0.25), lz = d / 2 + 0.004;
      ledPos.push(r.f > 0 ? [r.x + lx, ly, r.z + lz, 0] : [r.x - lx, ly, r.z - lz, Math.PI]);
    }
  }
  const im = instance(g, new THREE.PlaneGeometry(0.02, 0.02), basic({ color: 0xffffff, toneMapped: false }), ledPos, false);
  if (im) { const c = new THREE.Color(); for (let i = 0; i < ledPos.length; i++) im.setColorAt(i, c.set(R() < 0.8 ? 0x3ddc84 : 0x2a6cff)); im.instanceColor.needsUpdate = true; keep(im); LEDS.push(im); }
}
const SPIN = [], RINGS = [];
function fan(g, r, x, y, z, bladeMat = M.fanBlade) {
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 8, 32).rotateX(Math.PI / 2), M.metalDark); ring.position.set(x, y, z); g.add(ring);
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.35, 32, 1, true), M.metalDark); shroud.position.set(x, y - 0.17, z); g.add(shroud);
  const blades = new THREE.Group(); blades.position.set(x, y - 0.05, z);
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(boxGeo(r * 0.92, 0.03, 0.22), bladeMat); b.geometry = b.geometry.clone().translate(r * 0.46, 0, 0); b.rotation.set(0.25, i * Math.PI * 2 / 5, 0); blades.add(b); }
  blades.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 12), M.metalDark));
  keep(blades); blades.traverse(keep); g.add(blades); SPIN.push(blades);
}
function sensor(g, x, y, z, ny = 1) {           // SURDS node: orange puck + pulse ring
  const p = cyl(g, 0.07, 0.04, M.sensor, x, y, z); keep(p);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 24), M.ring);
  ring.position.set(x, y + 0.03, z); ring.rotation.x = -Math.PI / 2 * ny; keep(ring); g.add(ring); RINGS.push(ring);
}
function leakRope(g, pts) { run(g, pts.map((p) => [p[0], p[1] + 0.03, p[2]]), 0.025, M.sensor, 6); }
function person(g, x, z, y = 0, sitting = false, vest = false) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, sitting ? 0.35 : 0.75, 4, 10), vest ? M.vest : M.shirt);
  body.position.set(x, y + (sitting ? 0.8 : 1.15), z); g.add(body);
  if (!sitting) { const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 8), M.trouser); legs.position.set(x, y + 0.45, z); g.add(legs); }
  sphere(g, 0.15, M.skin, x, y + (sitting ? 1.28 : 1.82), z, 12);
}
function chair(g, x, z, y = 0) { cyl(g, 0.04, 0.42, M.black, x, y, z, "y", 8); box(g, 0.5, 0.08, 0.5, M.black, x, y + 0.42, z); box(g, 0.5, 0.6, 0.06, M.black, x, y + 0.5, z + 0.24); }

// ============================================================ level 0 · plant
function buildPlant(g) {
  plane(g, W - 0.6, D - 0.6, M.epoxy, 0.15, 0.003, 0.15);
  for (const z of [-4.3, 2.0]) box(g, W - 2, 0.006, 0.12, M.yellow, 0.5, 0.004, z);
  box(g, 0.12, 0.006, 16, M.yellow, 1.8, 0.004, 4);
  // diesel generators: belly tank, radiator facing the aisle, engine, alternator, exhaust to the stack
  for (const x of [-19.5, -15, -10.5, -6]) {
    const z = -8;
    box(g, 2.6, 0.7, 6.4, M.genGrey, x, 0, z);
    const rad = box(g, 2.4, 2.4, 0.5, [M.genGrey, M.genGrey, M.genGrey, M.genGrey, M.grille, M.genGrey], x, 0.7, z + 2.9); keep(rad);
    box(g, 1.5, 1.3, 2.6, M.genYellow, x, 0.7, z + 0.9);
    box(g, 0.3, 0.15, 2.3, M.metalDark, x - 0.38, 2.0, z + 0.9); box(g, 0.3, 0.15, 2.3, M.metalDark, x + 0.38, 2.0, z + 0.9);
    cyl(g, 0.25, 0.5, M.metal, x + 0.95, 1.55, z + 1.6, "z");
    cyl(g, 0.75, 1.8, M.genGrey, x, 1.55, z - 1.3, "z", 24);
    box(g, 0.8, 1.2, 0.3, M.metalDark, x - 0.9, 0.7, z - 2.9);
    run(g, [[x + 0.4, 2.0, z + 0.4], [x + 0.4, 5.2, z + 0.4]], 0.16, M.metal);
    cyl(g, 0.45, 2.4, M.metal, x + 0.4, 5.6, z - 0.4, "z", 18);
    run(g, [[x + 0.4, 5.6, z - 1.6], [x + 0.4, 5.6, -13.45], [x + 0.4, H, -13.45]], 0.2, M.metalDark);
    box(g, 0.5, 0.35, 0.35, M.black, x + 0.9, 0.7, z - 2.6);
  }
  // fuel: bulk tank in a bund, lines to the generators
  cyl(g, 1.3, 8, M.white, -14, 1.7, 5, "x", 28); for (const dx of [-2.8, 2.8]) box(g, 0.4, 0.5, 2.0, M.concrete, -14 + dx, 0, 5);
  for (const [w, d, x, z] of [[10, 0.25, -14, 2.7], [10, 0.25, -14, 7.3], [0.25, 4.6, -19, 5], [0.25, 4.6, -9, 5]]) box(g, w, 0.5, d, M.concrete, x, 0, z);
  cyl(g, 0.15, 0.6, M.metal, -14, 3.0, 5); run(g, [[-14, 0.15, 2.5], [-14, 0.15, -4.5], [-19.5, 0.15, -4.5]], 0.06, M.metalDark, 8); pipe(g, [-14, 0.15, -4.5], [-6, 0.15, -4.5], 0.06, M.metalDark, 8);
  // transformers behind a mesh fence
  for (const x of [-19, -14]) {
    const z = 10.5; box(g, 2.4, 2.2, 1.6, M.genGrey, x, 0, z);
    for (let k = 0; k < 10; k++) { box(g, 0.05, 1.8, 0.45, M.metal, x - 1.0 + k * 0.22, 0.2, z + 1.02); box(g, 0.05, 1.8, 0.45, M.metal, x - 1.0 + k * 0.22, 0.2, z - 1.02); }
    for (let k = -1; k <= 1; k++) cyl(g, 0.08, 0.55, M.white, x + k * 0.55, 2.2, z);
    cyl(g, 0.26, 1.3, M.genGrey, x, 2.75, z - 0.55, "x", 16);
  }
  for (const [w, d, x, z] of [[10, 0.04, -16.5, 8.4], [10, 0.04, -16.5, 12.8], [0.04, 4.4, -21.5, 10.6], [0.04, 4.4, -11.5, 10.6]]) { const f = box(g, w, 2.2, d, M.mesh, x, 0, z); keep(f); }
  // chillers: evaporator + condenser shells, compressor, panel, water boxes
  for (const x of [4.5, 10.5, 16.5]) {
    const z = -9;
    for (const dx of [-1.6, 1.6]) box(g, 0.4, 0.45, 2.2, M.genGrey, x + dx, 0, z);
    cyl(g, 0.55, 5, M.chiller, x, 0.95, z - 0.7, "x", 24); cyl(g, 0.55, 5, M.chiller, x, 0.95, z + 0.7, "x", 24);
    cyl(g, 0.48, 1.8, std(0x3f566e, 0.4, 0.5), x - 0.3, 2.05, z, "x", 20); box(g, 0.8, 0.8, 0.8, M.genGrey, x + 1.1, 1.65, z - 0.4);
    box(g, 0.3, 1.6, 1.1, M.white, x + 2.65, 0.45, z);
    cyl(g, 0.6, 0.2, M.blue, x - 2.6, 0.95, z - 0.7, "x", 20); cyl(g, 0.6, 0.2, M.green, x - 2.6, 0.95, z + 0.7, "x", 20);
    run(g, [[x - 2.85, 0.95, z - 0.7], [x - 2.85, 3.6, z - 0.7], [x - 2.85, 3.6, -12.4]], 0.18, M.blue);
    run(g, [[x - 2.4, 1.45, z - 0.7], [x - 2.4, 4.4, z - 0.7], [x - 2.4, 4.4, -12.4]], 0.18, M.orange);
    run(g, [[x - 2.85, 0.95, z + 0.7], [x - 3.2, 0.95, z + 0.7], [x - 3.2, 5.2, z + 0.7], [x - 3.2, 5.2, -11.9]], 0.16, M.green);
  }
  pipe(g, [0.8, 3.6, -12.4], [20.6, 3.6, -12.4], 0.3, M.blue); pipe(g, [0.8, 4.4, -12.4], [21.15, 4.4, -12.4], 0.3, M.orange); pipe(g, [0.8, 5.2, -11.9], [19.8, 5.2, -11.9], 0.25, M.green);
  for (let x = 2; x < 20; x += 3) box(g, 0.15, 1.0, 0.15, M.metalDark, x, 2.8, -12.9);
  risers(g, 3.6, H);
  // pumps
  for (let i = 0; i < 6; i++) {
    const x = 3.5 + i * 3, z = -3.6;
    box(g, 0.9, 0.12, 1.5, M.concrete, x, 0, z); cyl(g, 0.28, 0.8, M.pump, x, 0.45, z + 0.3, "z", 16); cyl(g, 0.32, 0.35, M.pump, x, 0.45, z - 0.4, "x", 18);
    run(g, [[x, 0.45, z - 0.6], [x, 3.0, z - 0.6], [x, 3.0, -12.1]], 0.12, i % 2 ? M.orange : M.blue);
  }
  // thermal storage tank
  cyl(g, 1.9, 5.6, M.white, 19.5, 0, 4, "y", 36); for (const y of [1.4, 2.8, 4.2]) cyl(g, 1.93, 0.12, M.metal, 19.5, y, 4, "y", 36);
  for (let y = 0.3; y < 5.6; y += 0.4) box(g, 0.5, 0.04, 0.04, M.metalDark, 21.3, y, 4);
  // staging: racks waiting in shrink-wrap, crates, pallet jack
  for (let i = 0; i < 3; i++) { box(g, 1.0, 0.14, 1.3, M.wood, 5 + i * 1.2, 0, 6); box(g, 0.6, 2.2, 1.2, M.rackSide, 5 + i * 1.2, 0.14, 6); keep(box(g, 0.66, 2.3, 1.26, M.wrap, 5 + i * 1.2, 0.12, 6)); }
  for (const [x, z, s] of [[10, 5, 1.1], [11.4, 5, 0.9], [10.6, 6.6, 1.0], [12.6, 8.4, 1.2]]) { box(g, 1.2, 0.14, 1.0, M.wood, x, 0, z); box(g, s, s * 0.8, s * 0.8, std(0xb08a5a, 0.85), x, 0.14, z); }
  box(g, 0.6, 0.12, 1.4, M.red, 8.2, 0, 9); cyl(g, 0.03, 1.1, M.black, 8.2, 0.1, 9.6);
  // people + SURDS: header temperatures, leak rope under the pipework, fuel level, generator hall
  person(g, -12.6, -3.6, 0, false, true);
  sensor(g, 12, 3.92, -12.4); sensor(g, 12, 4.72, -12.4); sensor(g, -14, 3.62, 5); sensor(g, -16.6, 2.6, -13.5, 0);
  leakRope(g, [[2, 0.003, -11.4], [20.4, 0.003, -11.4]]);
}

// ============================================================ level 1 · power & operations
function buildPower(g) {
  plane(g, 24.6, D - 0.6, M.epoxyLight, -9.7, 0.003, 0.15);
  plane(g, 20, 10, M.lobby, 12, 0.004, 9);
  plane(g, 20, 17.7, std(0x23262b, 0.7), 12, 0.003, -4.85);
  for (const z of [-5.4, 0.4]) box(g, 9, 0.006, 0.1, M.yellow, -17.2, 0.004, z);
  instance(g, boxGeo(0.95, 2.3, 0.9), [M.grey, M.grey, M.grey, M.grey, M.panel, M.grey], Array.from({ length: 14 }, (_, i) => [-20.5 + i, 0, -12.4]));
  instance(g, boxGeo(2.4, 2.0, 1.0), [M.white, M.white, M.white, M.white, M.ups, M.white], [-19.2, -16.6, -14, -11.4].map((x) => [x, 0, -8.2]));
  const bl = []; for (const z of [-4.6, -2.6, -0.6]) for (let i = 0; i < 8; i++) bl.push([-20.4 + i * 0.85, 0, z]);
  instance(g, boxGeo(0.8, 2.0, 0.8), [M.grey, M.grey, M.grey, M.grey, M.batt, M.grey], bl);
  instance(g, boxGeo(0.8, 2.0, 0.8), [M.grey, M.grey, M.grey, M.grey, M.panel, M.grey], [0, 1, 2, 3].map((i) => [-11.2 + i * 0.85, 0, -3.6]));
  // B side: a second, fully separate UPS and battery string so either can carry the load (2N)
  instance(g, boxGeo(2.4, 2.0, 1.0), [M.white, M.white, M.white, M.white, M.ups, M.white], [-19.2, -16.6, -14, -11.4].map((x) => [x, 0, 4.2]));
  const bl2 = []; for (const z of [7.4, 9.4, 11.4]) for (let i = 0; i < 8; i++) bl2.push([-20.4 + i * 0.85, 0, z]);
  instance(g, boxGeo(0.8, 2.0, 0.8), [M.grey, M.grey, M.grey, M.grey, M.batt, M.grey], bl2);
  instance(g, boxGeo(0.8, 2.0, 0.8), [M.grey, M.grey, M.grey, M.grey, M.panel, M.grey], [0, 1, 2, 3].map((i) => [-11.2 + i * 0.85, 0, 8.4]));
  for (const [z, t] of [[1.6, "A"], [13.1, "B"]]) { const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), basic({ map: signTex(`UPS ${t}`) })); sg.position.set(-15.4, 2.6, z); keep(sg); g.add(sg); }
  keep(box(g, 19.8, 3.2, 0.06, M.glass, -11.6, 0, 2.6));
  for (let x = -21.4; x < -1.6; x += 2.2) box(g, 0.08, 3.2, 0.08, M.metalDark, x, 0, 2.6);
  for (const z of [6.0, 13.0]) box(g, 9, 0.006, 0.1, M.yellow, -17.2, 0.004, z);
  for (const x of [-5.5, -5, -4.5]) box(g, 0.3, H, 0.2, M.copper, x, 0, -13.3);
  pipe(g, [-21, 4.6, -10.5], [-4, 4.6, -10.5], 0.08, M.black); pipe(g, [-21, 4.6, -10.0], [-4, 4.6, -10.0], 0.08, M.black);
  for (let x = -20; x < -4; x += 0.5) box(g, 0.04, 0.03, 0.5, M.black, x, 4.6, -10.25);
  box(g, 17, 0.25, 0.3, M.copper, -12.5, 4.0, -13.3);
  // glass partition between plant room and the control room
  keep(box(g, 0.06, H - 0.4, 16.7, M.glass, -1.5, 0, -5.35)); for (let z = -13.6; z < 3.2; z += 2.4) box(g, 0.1, H - 0.4, 0.1, M.metalDark, -1.5, 0, z);
  // network operations centre: video wall, two tiers of desks with monitors
  box(g, 15.4, 3.9, 0.12, M.black, 11.5, 0.95, -13.42);
  { const wall = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.6), M.video); wall.position.set(11.5, 2.9, -13.35); keep(wall); g.add(wall); }
  for (const [z, y] of [[-7, 0], [-3.6, 0.3]]) {
    if (y) box(g, 15, 0.3, 2.6, M.black, 11.2, 0, -3.3);
    for (let i = 0; i < 5; i++) {
      const x = 5.5 + i * 2.7; box(g, 2.4, 0.06, 0.9, M.desk, x, y + 0.72, z); box(g, 0.06, 0.72, 0.8, M.metalDark, x - 1.1, y, z); box(g, 0.06, 0.72, 0.8, M.metalDark, x + 1.1, y, z);
      for (let k = -1; k <= 1; k++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), M.screens[(i + k + 3) % 4]); s.position.set(x + k * 0.68, y + 1.15, z - 0.3); s.rotation.y = k * -0.18; keep(s); g.add(s); box(g, 0.66, 0.4, 0.03, M.black, x + k * 0.68, y + 0.95, z - 0.33, k * -0.18); }
      chair(g, x, z + 1.0, y); if (i % 2 === 0) person(g, x, z + 0.95, y, true);
    }
  }
  // security: mantrap, turnstiles, reception
  keep(box(g, 2, 2.4, 2, M.glass, 6, 0, 9)); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(g, 0.08, 2.4, 0.08, M.metal, 6 + dx, 0, 9 + dz); box(g, 2.1, 0.12, 2.1, M.metal, 6, 2.4, 9);
  for (let i = 0; i < 4; i++) { box(g, 0.22, 1.0, 1.2, M.metal, 9.5 + i * 1.2, 0, 9); keep(box(g, 0.9, 0.7, 0.03, M.glass, 10.1 + i * 1.2, 0.35, 9)); }
  box(g, 4, 1.1, 1, M.desk, 17, 0, 10); for (const k of [-1, 1]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), M.screens[3]); s.position.set(17 + k * 0.8, 1.45, 9.85); keep(s); g.add(s); }
  person(g, 17, 11, 0, false, false);
  sensor(g, -17.85, 2.04, -2.6); sensor(g, -14.45, 2.04, -4.6); sensor(g, -11.4, 2.04, -8.2); sensor(g, 11.5, 4.95, -13.25);
  risers(g, 0, H);
}

// ============================================================ level 2 · network core & AI pod
function buildNetwork(g) {
  raisedFloor(g);
  // meet-me room: carrier cages with three racks each
  const list = [];
  [[-18.5, -9.5], [-13.5, -9.5], [-18.5, -4.5], [-13.5, -4.5]].forEach(([cx, cz], n) => {
    for (const [w, d, x, z] of [[4.2, 0.03, cx, cz - 1.9], [4.2, 0.03, cx, cz + 1.9], [0.03, 3.8, cx - 2.1, cz], [0.03, 3.8, cx + 2.1, cz]]) keep(box(g, w, 2.6, d, M.mesh, x, RF, z));
    for (const [dx, dz] of [[-2.1, -1.9], [2.1, -1.9], [-2.1, 1.9], [2.1, 1.9]]) box(g, 0.07, 2.65, 0.07, M.metalDark, cx + dx, RF, cz + dz);
    box(g, 4.25, 0.06, 0.06, M.metalDark, cx, RF + 2.6, cz + 1.9); box(g, 4.25, 0.06, 0.06, M.metalDark, cx, RF + 2.6, cz - 1.9);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), M.signs[n]); sg.position.set(cx, RF + 2.85, cz + 1.92); keep(sg); g.add(sg);
    for (let i = 0; i < 3; i++) list.push({ kind: "net", w: 0.6, h: 2.2, d: 1.2, x: cx - 0.6 + i * 0.6, y: RF, z: cz - 0.6, f: 1 });
  });
  instance(g, boxGeo(0.8, 2.4, 0.5), [M.grey, M.grey, M.grey, M.grey, M.odf, M.grey], Array.from({ length: 8 }, (_, i) => [-20.5 + i * 0.9, RF, 1.5]));
  for (let i = 0; i < 4; i++) list.push({ kind: "router", w: 0.6, h: 2.2, d: 1.2, x: -9.4 + i * 0.6, y: RF, z: -9.5, f: 1 });
  for (let i = 0; i < 6; i++) list.push({ kind: "storage", w: 0.6, h: 2.2, d: 1.2, x: -9.4 + i * 0.6, y: RF, z: -4.5, f: 1 });
  // fibre raceway: yellow trunk, branches into the cages and over the ODF row
  const fy = RF + 3.0;
  box(g, 41, 0.12, 0.35, M.yellow, 0, fy, -1.2); for (const x of [-18.5, -13.5]) box(g, 0.35, 0.12, 8.6, M.yellow, x, fy, -5.7);
  box(g, 7.6, 0.12, 0.35, M.yellow, -17.5, fy - 0.1, 1.5); box(g, 0.35, 0.12, 2.7, M.yellow, -17, fy - 0.05, 0.15);
  for (let x = -20.5; x < -13.5; x += 0.9) pipe(g, [x, fy - 0.1, 1.5], [x, RF + 2.4, 1.6], 0.025, M.yellow, 6);
  // AI pod: GPU racks with rear-door heat exchangers, overhead liquid manifolds, CDUs
  const doors = [];
  for (const [z, f] of [[-9.6, 1], [-5.4, -1]]) for (const x0 of [2.8, 12.4]) for (let i = 0; i < 10; i++) {
    const x = x0 + i * 0.8; list.push({ kind: "gpu", w: 0.8, h: 2.4, d: 1.4, x, y: RF, z, f });
    doors.push([x, RF, z - f * 0.825, f > 0 ? 0 : Math.PI]);
  }
  instance(g, boxGeo(0.8, 2.4, 0.25), [M.rackSide, M.rackSide, M.rackTop, M.rackTop, M.rackSide, M.coil], doors);
  for (const [z, dz] of [[-10.7, -10.425], [-4.3, -4.575]]) {
    pipe(g, [2.2, RF + 3.2, z], [20.4, RF + 3.2, z], 0.12, M.blue); pipe(g, [2.2, RF + 3.45, z], [20.4, RF + 3.45, z], 0.12, M.orange);
    for (const d of doors.filter((q) => Math.abs(q[2] - dz) < 0.01)) { pipe(g, [d[0] - 0.15, RF + 2.4, dz], [d[0] - 0.15, RF + 3.2, z], 0.035, M.blue, 6); pipe(g, [d[0] + 0.15, RF + 2.4, dz], [d[0] + 0.15, RF + 3.45, z], 0.035, M.orange, 6); }
  }
  instance(g, boxGeo(1.2, 2.2, 1.0), [M.white, M.white, M.white, M.white, M.cdu, M.white], [4.5, 8.5, 14.5, 18.5].map((x) => [x, RF, -12.6]));
  for (const x of [4.5, 8.5, 14.5, 18.5]) { run(g, [[x - 0.25, RF + 2.2, -12.6], [x - 0.25, RF + 3.2, -12.6], [x - 0.25, RF + 3.2, -10.7]], 0.1, M.blue); run(g, [[x + 0.25, RF + 2.2, -12.6], [x + 0.25, RF + 3.45, -12.6], [x + 0.25, RF + 3.45, -10.7]], 0.1, M.orange); }
  // immersion tanks: open tubs of dielectric fluid with server blades standing in it
  for (const x of [5.5, 11, 16.5]) {
    const z = 5.5, h = 1.25;
    box(g, 3.2, 0.08, 1.4, M.metalDark, x, RF, z);
    for (const [w, d, dx, dz] of [[3.2, 0.06, 0, -0.67], [3.2, 0.06, 0, 0.67], [0.06, 1.4, -1.57, 0], [0.06, 1.4, 1.57, 0]]) box(g, w, h, d, M.metalDark, x + dx, RF, z + dz);
    keep(box(g, 3.08, h - 0.18, 1.28, M.fluid, x, RF + 0.06, z));
    for (let i = 0; i < 14; i++) box(g, 0.04, 0.42, 1.0, M.rackSide, x - 1.3 + i * 0.2, RF + h - 0.2, z);
    const lid = box(g, 3.2, 0.05, 1.4, M.glass, x, RF + h, z - 0.7); lid.geometry = boxGeo(3.2, 0.05, 1.4).clone().translate(0, 0, 0.7); lid.rotation.x = -1.15; keep(lid);
    box(g, 0.6, 1.4, 1.2, M.white, x + 1.95, RF, z);
  }
  for (let i = 0; i < 29; i++) list.push({ kind: ["mix0", "mix1", "mix2", "mix3"][i % 4], w: 0.6, h: 2.2, d: 1.2, x: 2.6 + i * 0.6, y: RF, z: 1.0, f: 1 });
  plane(g, 17.4, 1.2, M.perf, 11.0, RF + 0.004, 2.2);
  box(g, 17.4, 0.18, 0.14, M.metal, 11.0, RF + 3.2, 1.0);
  // tape library: long glass-fronted cabinets with the robot rail inside
  for (let i = 0; i < 6; i++) {
    const x = -19.6 + i * 1.6;
    box(g, 1.5, 2.2, 1.4, [M.rackSide, M.rackSide, M.rackTop, M.rackTop, M.rackSide, M.rackSide], x, RF, 10.5);
    for (let k = 0; k < 9; k++) box(g, 1.3, 0.04, 0.5, M.metalDark, x, RF + 0.3 + k * 0.2, 10.75);
    for (let k = 0; k < 9; k++) for (let c = 0; c < 6; c++) box(g, 0.16, 0.12, 0.3, k % 3 === c % 3 ? M.blue : M.black, x - 0.55 + c * 0.22, RF + 0.34 + k * 0.2, 10.8);
    keep(box(g, 1.46, 2.1, 0.03, M.glass, x, RF + 0.05, 11.22));
  }
  box(g, 9.6, 0.08, 0.08, M.yellow, -15.6, RF + 2.0, 11.0);
  // spare-parts cage and a build bench
  for (const [w, d, x, z] of [[5, 0.03, -8.5, 8.4], [5, 0.03, -8.5, 12.6], [0.03, 4.2, -11, 10.5], [0.03, 4.2, -6, 10.5]]) keep(box(g, w, 2.4, d, M.mesh, x, RF, z));
  for (let k = 0; k < 3; k++) { box(g, 4.4, 0.04, 0.6, M.metal, -8.5, RF + 0.4 + k * 0.7, 11.9); for (let c = 0; c < 8; c++) box(g, 0.4, 0.3, 0.4, std(0x6a7480, 0.6), -10.3 + c * 0.52, RF + 0.44 + k * 0.7, 11.9); }
  box(g, 3.2, 0.9, 1.0, M.desk, 1.2, RF, 10.5); box(g, 0.48, 0.12, 0.7, M.rackSide, 0.6, RF + 0.9, 10.5); box(g, 0.48, 0.18, 0.7, M.rackSide, 1.6, RF + 0.9, 10.5);
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.34), M.screens[2]); s.position.set(2.3, RF + 1.25, 10.2); keep(s); g.add(s); }
  person(g, 1.2, 11.4, RF, false, false);
  racks(g, list, 5);
  person(g, 11.2, -7.5, RF, false, false);
  leakRope(g, [[3, RF, -11.95], [20, RF, -11.95]]); sensor(g, 10.5, RF + 3.34, -10.82, 0); sensor(g, -13.5, RF + 1.3, -2.58, 0);
  risers(g, 0, H);
}

// ============================================================ level 3 · data hall
function buildHall(g) {
  raisedFloor(g);
  instance(g, boxGeo(2.6, 2.9, 1.0), [M.grey, M.grey, M.grey, M.grey, M.louver, M.grey], Array.from({ length: 8 }, (_, i) => [-17.5 + i * 5, 0, -12.6]));
  const list = [], ZC = [-8.8, -3.6, 1.6, 6.8], X0 = [-18.4, 1.6];
  const kinds = ["mix0", "mix1", "mix2", "mix3"];
  for (const zc of ZC) for (const x0 of X0) {
    for (const [z, f] of [[zc - 1.2, 1], [zc + 1.2, -1]]) for (let i = 0; i < 28; i++) {
      const kind = i % 14 === 0 ? "net" : (i % 9 === 4 ? "storage" : kinds[(R() * 4) | 0]);
      list.push({ kind, w: 0.6, h: 2.2, d: 1.2, x: x0 + 0.3 + i * 0.6, y: RF, z, f });
    }
    // cold-aisle containment: roof, rails, end doors; perforated tiles in the aisle
    keep(plane(g, 16.8, 1.2, M.glass, x0 + 8.4, RF + 2.21, zc));
    for (const dz of [-0.6, 0.6]) box(g, 16.8, 0.05, 0.05, M.white, x0 + 8.4, RF + 2.2, zc + dz);
    for (const ex of [x0, x0 + 16.8]) { keep(box(g, 0.04, 2.2, 1.2, M.glass, ex, RF, zc)); box(g, 0.06, 0.06, 1.2, M.white, ex, RF + 2.15, zc); for (const dz of [-0.58, 0.58]) box(g, 0.06, 2.2, 0.06, M.white, ex, RF, zc + dz); }
    plane(g, 16.8, 1.2, M.perf, x0 + 8.4, RF + 0.004, zc);
    // overhead: busway with tap-offs, yellow fibre tray, black copper ladder, aisle lights
    for (const [z, f] of [[zc - 1.2, 1], [zc + 1.2, -1]]) {
      box(g, 16.8, 0.18, 0.14, M.metal, x0 + 8.4, RF + 3.2, z);
      for (let i = 0; i < 28; i += 2) { const x = x0 + 0.6 + i * 0.6; box(g, 0.3, 0.25, 0.2, M.grey, x, RF + 2.95, z); pipe(g, [x, RF + 2.95, z], [x, RF + 2.2, z], 0.02, M.black, 6); }
      box(g, 16.8, 0.1, 0.3, M.yellow, x0 + 8.4, RF + 2.7, z - f * 0.35);
      for (let i = 2; i < 28; i += 4) pipe(g, [x0 + 0.3 + i * 0.6, RF + 2.7, z - f * 0.35], [x0 + 0.3 + i * 0.6, RF + 2.2, z - f * 0.42], 0.03, M.yellow, 6);
    }
    box(g, 16.8, 0.05, 0.45, M.black, x0 + 8.4, RF + 3.7, zc + 2.6);
    for (let k = 0; k < 7; k++) box(g, 2.0, 0.05, 0.12, M.light, x0 + 1.2 + k * 2.4, 5.6, zc);
  }
  racks(g, list, 6);
  // structure, fire detection and suppression, cameras
  for (const z of [-6.2, -1, 4.2, 9.4]) box(g, 0.6, H - RF, 0.6, M.concrete, 0, RF, z);
  for (let z = -12; z <= 12; z += 4) { pipe(g, [-21.6, 6.4, z], [21.6, 6.4, z], 0.028, M.redDim, 6); for (let x = -20; x <= 20; x += 3) cyl(g, 0.02, 0.15, M.redDim, x, 6.25, z, "y", 6); }
  run(g, [[-21.6, 6.0, -10], [-21.6, 6.0, 12], [20, 6.0, 12]], 0.03, M.red, 6); for (let z = -6; z <= 12; z += 8) pipe(g, [-21.6, 6.0, z], [20, 6.0, z], 0.03, M.red, 6);
  box(g, 0.2, 0.6, 0.5, M.white, -21.35, 1.6, -10);
  for (let k = 0; k < 10; k++) { cyl(g, 0.18, 1.5, M.red, -20.5, RF, 3 + k * 0.45, "y", 14); cyl(g, 0.06, 0.15, M.metal, -20.5, RF + 1.5, 3 + k * 0.45, "y", 8); }
  pipe(g, [-20.5, RF + 1.75, 3], [-20.5, RF + 1.75, 7.1], 0.04, M.metal, 8);
  for (const [x, z] of [[-21, -13], [21, -13], [-21, 13], [21, 13]]) sphere(g, 0.15, M.black, x, 6.6, z, 10);
  // people + crash cart
  person(g, -10, -3.6, RF); person(g, 8, 11.5, RF, false, true); box(g, 0.6, 0.9, 0.45, M.metalDark, 9.2, RF, 11.5);
  { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), M.screens[0]); s.position.set(9.2, RF + 1.15, 11.73); keep(s); g.add(s); }
  // SURDS: rack inlet top/middle/bottom, containment pressure, leak rope in front of the CRAHs
  for (const y of [0.5, 1.2, 1.9]) sensor(g, 5.5, RF + y, 1.03, 0);
  for (const y of [0.5, 1.2, 1.9]) sensor(g, -12.1, RF + y, -9.37, 0);
  sensor(g, 1.62, RF + 1.6, 1.6, 0);
  leakRope(g, [[-20, RF, -11.8], [20, RF, -11.8]]);
  risers(g, 0, H);
}

// ============================================================ level 4 · roof
function frameBox(g, mat, x, z, y0, w, d, h, t, mid = 0) {
  const xs = [x - w / 2, x + w / 2], zs = [z - d / 2, z + d / 2];
  for (const y of [y0, y0 + h, ...Array.from({ length: mid }, (_, k) => y0 + h * (k + 1) / (mid + 1))]) {
    box(g, w + t, t, t, mat, x, y - t / 2, zs[0]); box(g, w + t, t, t, mat, x, y - t / 2, zs[1]);
    box(g, t, t, d, mat, xs[0], y - t / 2, z); box(g, t, t, d, mat, xs[1], y - t / 2, z);
  }
  for (const px of xs) for (const pz of zs) box(g, t, h, t, mat, px, y0, pz);
}
function buildRoof(g) {
  plane(g, W - 0.6, D - 0.6, M.deck, 0, 0.003, 0);
  for (const [w, d, x, z] of [[W, 0.4, 0, -D / 2 + 0.2], [W, 0.4, 0, D / 2 - 0.2], [0.4, D, -W / 2 + 0.2, 0], [0.4, D, W / 2 - 0.2, 0]]) box(g, w, 1.0, d, M.pierRoof, x, 0, z);
  // six framed cooling units in a 3 x 2 grid, exactly as on the city model: plant box, white steel frame, four fan decks
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    const ux = -W / 3 + i * W / 3, uz = -D / 4 + j * D / 2;
    box(g, W / 4.2, 2.4, D / 3.2, [M.metal, M.metal, M.roofTop, M.metal, M.metal, M.metal], ux, 0, uz);
    for (let k = 0; k < 8; k++) box(g, W / 4.2 - 0.4, 0.06, 0.04, M.metalDark, ux, 0.4 + k * 0.25, uz + D / 6.4 + 0.02);
    frameBox(g, M.white, ux, uz, 0, W / 3.6, D / 2.7, 3.4, 0.18, 1);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const fx = ux - W / 14 + a * W / 7, fz = uz - D / 10 + b * D / 5;
      box(g, 2.6, 0.7, 2.0, M.metalDark, fx, 2.4, fz);
      fan(g, 0.62, fx - 0.65, 3.12, fz); fan(g, 0.62, fx + 0.65, 3.12, fz);
    }
  }
  // chilled-water and condenser risers come up the back corner and feed every unit
  pipe(g, [20.6, 0, -12.4], [20.6, 1.0, -12.4], 0.3, M.blue); pipe(g, [21.15, 0, -12.4], [21.15, 1.5, -12.4], 0.3, M.orange);
  pipe(g, [20.6, 1.0, -12.4], [-W / 3, 1.0, -12.4], 0.22, M.blue); pipe(g, [21.15, 1.5, -12.4], [-W / 3, 1.5, -12.4], 0.22, M.orange);
  pipe(g, [19.8, 0, -11.9], [19.8, 2.0, -11.9], 0.2, M.green);
  for (let i = 0; i < 3; i++) {
    const ux = -W / 3 + i * W / 3;
    pipe(g, [ux - 0.3, 1.0, -12.4], [ux - 0.3, 1.0, -11.4], 0.14, M.blue); pipe(g, [ux + 0.3, 1.5, -12.4], [ux + 0.3, 1.5, -11.4], 0.14, M.orange);
    pipe(g, [ux - 0.3, 1.0, -2.6], [ux - 0.3, 1.0, 2.6], 0.14, M.blue); pipe(g, [ux + 0.3, 1.5, -2.6], [ux + 0.3, 1.5, 2.6], 0.14, M.orange);
  }
  // generator exhaust stacks with rain caps along the back edge
  for (const x of [-19.1, -14.6, -10.1, -5.6]) { cyl(g, 0.22, 4.4, M.metalDark, x, 0, -13.45, "y", 16); cyl(g, 0.4, 0.3, M.metal, x, 4.5, -13.45, "y", 16, 0.05); }
  box(g, 1.2, 0.6, 1.2, M.grey, 7.35, 0, 0);
  for (const [x, z] of [[-21.8, -13.8], [21.8, -13.8], [-21.8, 13.8], [21.8, 13.8], [0, -13.8], [0, 13.8], [-21.8, 0], [21.8, 0]]) cyl(g, 0.03, 1.3, M.metal, x, 1.0, z, "y", 6);
  // SURDS weather node on a short pole in the front corner
  cyl(g, 0.05, 1.8, M.metal, 20.3, 0, 12.5, "y", 8); box(g, 0.35, 0.3, 0.3, M.white, 20.3, 1.8, 12.5); sensor(g, 20.3, 2.12, 12.5);
  sensor(g, 4, 1.24, -12.4);
  keep(sphere(g, 0.55, basic({ color: 0xff8a2a }), W / 3 - 3, 3.9, -D / 4 + 1.5, 16));
}

// ============================================================ content: levels, parts and pins
const FLOORS = [
  { key: "plant", name: "Plant", build: buildPlant, wall: () => M.wallDark, parts: [
    ["Diesel generators", "Start within seconds of a grid failure and carry the whole site for as long as the fuel lasts. Each one is test-run every month.", [-15, 3.2, -8]],
    ["Fuel storage", "Belly tanks under each generator plus a bulk tank in a spill bund: typically 24 to 72 hours of runtime before a refuel.", [-14, 3.1, 5]],
    ["Chillers", "Make the chilled water for the whole building when the outside air is too warm to do it alone.", [10.5, 2.6, -9]],
    ["Pumps and headers", "Pumps push chilled water through the blue supply and orange return headers, up the risers to every floor.", [12.5, 4.7, -12.4]],
    ["Transformers", "Step the utility's medium-voltage feed down before it reaches the switchgear upstairs.", [-16.5, 2.9, 10.5]],
    ["Thermal storage", "A tank of chilled water that keeps cooling running for minutes if the chillers trip.", [19.5, 5.7, 4]],
    ["Staging", "New racks arrive shrink-wrapped, get unpacked and burn-in tested here before they go up to the halls.", [6.2, 2.5, 6]],
    ["SURDS sensors", "Chilled-water supply and return temperature on the headers, a leak rope along the pipework, fuel level and generator-hall temperature.", [12, 3.95, -12.4], true],
  ] },
  { key: "power", name: "Power & ops", build: buildPower, wall: () => M.wallLight, parts: [
    ["Switchgear", "Takes the transformers' feed and switches to the generators automatically when the grid fails.", [-17.5, 2.35, -12.4]],
    ["UPS modules (A and B)", "Uninterruptible power supplies. They clean the power and carry the load instantly while the generators start. Two separate systems, A and B, so either can fail without dropping a rack.", [-15.3, 2.05, 4.2]],
    ["Battery cabinets", "Lithium-ion strings behind each UPS: minutes of runtime, enough to bridge to the generators.", [-18.5, 2.05, 11.4]],
    ["Busway and PDUs", "Copper bus rises through the building; power distribution units split it into circuits for each row.", [-9.9, 2.05, -3.6]],
    ["Control room", "Staffed around the clock. The video wall shows temperature, power, network and alarms for every room.", [11.5, 4.8, -13.3]],
    ["Security", "Mantrap and badge turnstiles: nobody reaches the halls without passing two checks.", [6, 2.5, 9]],
    ["SURDS sensors", "Battery-cabinet and UPS temperatures, and a people count in the control room.", [-17.85, 2.12, -2.6], true],
  ] },
  { key: "net", name: "Network & AI", build: buildNetwork, wall: () => M.wallLight, parts: [
    ["Meet-me room", "Locked carrier cages where internet providers hand over their fibre. One cross-connect links a customer to any carrier in the building.", [-16, RF + 2.75, -7]],
    ["Fibre frames", "Thousands of patch ports. Every link in the building ends as a labelled jumper here.", [-17.5, RF + 2.45, 1.75]],
    ["Core routers", "The building's backbone: they move traffic between halls and out to the carriers.", [-8.5, RF + 2.25, -9.5]],
    ["GPU racks", "AI training racks draw 40 to 100 kW each, far more than air alone can cool.", [6.4, RF + 2.45, -9.6]],
    ["Rear-door heat exchangers", "Water-cooled coils in the rack doors take heat straight out of the exhaust air.", [16, RF + 2.45, -4.45]],
    ["Coolant distribution units", "Pumps and heat exchangers that keep the liquid loop clean, at the right pressure and temperature.", [8.5, RF + 2.25, -12.6]],
    ["Immersion tanks", "Servers stand in a non-conductive fluid that carries the heat away, with no fans at all.", [11, RF + 1.5, 5.5]],
    ["Storage arrays", "Racks of drives that hold the data the servers work on.", [-7.9, RF + 2.25, -4.5]],
    ["Tape library", "Cartridges and a robot arm behind glass: cheap, offline long-term backups that ransomware cannot reach.", [-15.6, RF + 2.3, 10.5]],
    ["SURDS sensors", "Coolant temperature on the manifolds, a leak rope under the CDUs and door sensors on the cages.", [13, RF + 0.08, -11.95], true],
  ] },
  { key: "hall", name: "Data hall", build: buildHall, wall: () => M.wallLight, parts: [
    ["Server racks", "Standard 42U cabinets, 60 cm wide, holding servers, storage and switches. A rack here draws 5 to 15 kW.", [-14, RF + 2.25, -4.8]],
    ["Cold-aisle containment", "Racks face each other across a sealed aisle with a roof and doors, so cold air reaches only server intakes.", [12, RF + 2.25, -3.6]],
    ["Raised floor", "A 60 cm void under lift-out tiles. Cold air is pushed in under pressure and rises through perforated tiles in the cold aisles.", [20.5, RF, 12.8]],
    ["CRAH units", "Computer-room air handlers blow hall air over chilled-water coils and send it under the floor.", [-7.5, 2.95, -12.6]],
    ["Overhead busway", "Power rails above each row. Every rack plugs in through its own breaker box, from two separate feeds.", [-4, RF + 3.3, 8.0]],
    ["Fibre and cable trays", "Yellow trays carry fibre, black ladders carry copper. Overhead keeps the floor void clear for air.", [14, RF + 2.8, -10.35]],
    ["Fire detection", "Air-sampling pipes catch smoke long before flames. Clean-agent gas floods the room without harming servers.", [-20.5, RF + 1.6, 5]],
    ["SURDS sensors", "Inlet temperature and humidity at the top, middle and bottom of racks, pressure across the containment and a leak rope by the CRAHs.", [5.5, RF + 1.95, 1.05], true],
  ] },
  { key: "roof", name: "Roof", build: buildRoof, wall: () => M.wallDark, parts: [
    ["Rooftop cooling plant", "Six cooling units, each in a white steel frame. Warm water from the halls runs through finned coils and the fans push its heat into the outside air.", [0, 3.7, -7]],
    ["Fan decks", "Four fan decks per unit. They speed up as the halls get busier and slow down on cool nights.", [14.7, 3.5, 7]],
    ["Risers and headers", "Insulated pipes link the roof to every floor: blue carries cold water down, orange brings warm water back.", [20.6, 1.6, -12.4]],
    ["Exhaust stacks", "Exhaust from the backup generators, carried up and released above the roofline.", [-12.35, 4.9, -13.45]],
    ["SURDS weather node", "Outdoor temperature and humidity, so the plant knows when free cooling is possible.", [20.3, 2.3, 12.5], true],
  ] },
];

// ============================================================ follow the flow: paths through the levels, in level-local coordinates
// point = [level, x, y, z]; a line is a list of points; dashed lines are secondary routes
const FLOWS = {
  fpower: { color: "#ffc23d", lines: [
    { pts: [[0, -16.5, 2.6, 10.5], [0, -16.5, 2.6, -4.5], [1, -14, 2.4, -12.4], [1, -15.3, 2.1, -8.2], [1, -18.5, 2.1, -0.6], [1, -15.3, 2.1, 4.2], [1, -9.9, 2.1, -3.6], [1, -5, 6.5, -13.2], [3, -5, RF + 3.2, -12], [3, -4, RF + 3.2, 8], [3, 12, RF + 3.2, 8], [3, 12, RF + 2.2, 8]] },
    { pts: [[0, -15, 3, -8], [1, -14, 2.4, -12.4]], dash: true },
  ], stages: [[0, -16.5, 2.6, 10.5, "Grid in"], [0, -15, 3, -8, "Generators"], [1, -14, 2.4, -12.4, "Switchgear"], [1, -15.3, 2.1, 4.2, "UPS + batteries"], [3, -4, RF + 3.2, 8, "Busway"], [3, 12, RF + 2.2, 8, "Racks"]] },
  fheat: { color: "#ff6a3d", lines: [
    { pts: [[3, 5.5, RF + 1.2, 1], [3, 5.5, RF + 1.2, -11], [3, -7.5, 1.6, -12.6], [3, 21.15, 3, -12.4], [4, 21.15, 1.5, -12.4], [4, 0, 3, -7]] },
    { pts: [[4, 0, 2.4, -7], [4, 20.6, 1.0, -12.4], [3, 20.6, 3.6, -12.4], [3, -7.5, 2.4, -12.6]], color: "#4aa3ff" },
    { pts: [[0, 10.5, 1.6, -9], [0, 20.6, 3.6, -12.4], [3, 20.6, 2.8, -12.4]], color: "#4aa3ff", dash: true },
  ], stages: [[3, 5.5, RF + 1.2, 1, "Servers"], [3, -7.5, 1.6, -12.6, "CRAH units"], [3, 21.15, 3, -12.4, "Warm water"], [4, 0, 3, -7, "Roof plant"], [0, 10.5, 1.6, -9, "Chillers"]] },
  fdata: { color: "#3fd0ff", lines: [
    { pts: [[2, -13.5, RF + 1.2, -9.5], [2, -13.5, RF + 3, -5.7], [2, -17, RF + 3, -1.2], [2, -17, RF + 2.4, 1.5], [2, -17, RF + 3, -1.2], [2, -8.5, RF + 3, -1.2], [2, -8.5, RF + 1.5, -9.5]] },
    { pts: [[2, -8.5, RF + 3, -1.2], [2, 6.4, RF + 3, -1.2], [2, 6.4, RF + 1.5, -9.6]] },
    { pts: [[2, 6.4, RF + 3, -1.2], [2, 14, RF + 3, -1.2], [3, 14, RF + 2.7, -10.35], [3, -12, RF + 2.2, -10]] },
  ], stages: [[2, -13.5, RF + 1.2, -9.5, "Carriers"], [2, -17, RF + 2.4, 1.5, "Patch frames"], [2, -8.5, RF + 1.5, -9.5, "Core routers"], [2, 6.4, RF + 1.5, -9.6, "AI racks"], [3, -12, RF + 2.2, -10, "Server rows"]] },
};
const FIG = {
  "Diesel generators": "4 × 2.5 MW", "Fuel storage": "~48 h runtime", "Chillers": "3 × 1.8 MW", "Pumps and headers": "6 pumps, one spare",
  "Transformers": "2 × 4 MVA", "Thermal storage": "~8 min of cooling", "Staging": "48 h burn-in",
  "Switchgear": "switches in < 10 s", "UPS modules (A and B)": "2N: A + B", "Battery cabinets": "~10 min runtime", "Busway and PDUs": "2 feeds per rack",
  "Control room": "staffed 24/7", "Security": "2 checks to enter",
  "Meet-me room": "4 carriers", "Fibre frames": "thousands of ports", "Core routers": "400 Gb/s links", "GPU racks": "40 racks, 40–100 kW each",
  "Rear-door heat exchangers": "up to 50 kW per door", "Coolant distribution units": "4 units", "Immersion tanks": "no fans at all", "Storage arrays": "petabytes",
  "Tape library": "offline copies",
  "Server racks": "448 racks, 5–15 kW each", "Cold-aisle containment": "8 sealed aisles", "Raised floor": "60 cm air void", "CRAH units": "8 units",
  "Overhead busway": "A + B feeds", "Fibre and cable trays": "fibre + copper", "Fire detection": "smoke in seconds",
  "Rooftop cooling plant": "6 units", "Fan decks": "24 decks, 48 fans", "Risers and headers": "cold down, warm up", "Exhaust stacks": "4 stacks",
};
const FLOOR_OF = { plant: 0, power: 1, net: 2, hall: 3, roof: 4 };

// ============================================================ merge static geometry per material, per level
function consolidate(g) {
  g.updateMatrixWorld(true);
  const buckets = new Map(), victims = [];
  g.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noMerge || Array.isArray(o.material)) return;
    let skip = false; for (let p = o.parent; p && p !== g; p = p.parent) if (p.userData.noMerge) skip = true;
    if (skip) return;
    const geo = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.index) { const n = geo.attributes.position.count; geo.setIndex([...Array(n).keys()]); }
    if (!buckets.has(o.material)) buckets.set(o.material, []);
    buckets.get(o.material).push(geo); victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of buckets) {
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = !mat.transparent; m.receiveShadow = true; g.add(m);
  }
}

// ============================================================ build
export function buildModel(renderer) {
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  makeMaterials();
  const floors = FLOORS.map((F, i) => {
    const g = new THREE.Group(); g.name = F.key;
    const walls = shell(g, i, F.wall());
    F.build(g);
    consolidate(g);
    g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.userData.caster = !(o.material.transparent) && !o.isInstancedMesh ? true : o.isInstancedMesh && o.castShadow; o.castShadow = false; } });
    return { g, walls, F };
  });
  return { floors, M, LEDS, SPIN, RINGS };
}
export { FLOORS, FIG, FLOWS, FLOOR_OF };
