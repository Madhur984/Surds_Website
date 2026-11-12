/* SURDS Thermal: procedural model of the wall-mounted thermal sensor.
 *
 * Form: a rounded upward-pointing triangle body (apex on top, wide base) in two shell pieces with a
 * seam between them, a dark glass face set into the front with exactly two openings,
 * the thermal lens in the upper corner and a pinhole below it, a printed wordmark, a
 * dotted grille on the upper-left side, and a wall plate with two screw rings behind.
 * The IR emitters sit behind the dark glass (IR passes through it), so they have no
 * visible openings; the beam effect starts from the glass.
 * Front faces +Z, up is +Y. The face is about 2.2 wide.
 *
 * Materials are module-level and shared by every instance, so changing the finish
 * recolours the sensor everywhere it appears.
 */
import * as THREE from 'three';

export var FINISHES = {
  // shells follow the site palette: #FE7743 orange, #273F4F navy, #EFEEEA chalk
  ember: { name: 'Red + dark glass',    short: 'Red',    dot: '#E5391C', shell: '#e0361a', rough: 0.68, sheen: 0.25 },
  navy:  { name: 'Navy + dark glass',   short: 'Navy',   dot: '#273F4F', shell: '#2c4758', rough: 0.66, sheen: 0.2 },
  chalk: { name: 'Chalk + dark glass',  short: 'Chalk',  dot: '#EFEEEA', shell: '#e6e4de', rough: 0.7,  sheen: 0.2 }
};

export var mats = {
  // soft-touch shell: matte, a fine sandblasted grain (bump) and a faint velvet sheen on the edges
  shell: new THREE.MeshPhysicalMaterial({ color: FINISHES.ember.shell, roughness: 0.68, sheen: 0.25, sheenRoughness: 0.7,
                                          sheenColor: new THREE.Color('#ffb59a'), bumpScale: 0.6 }),
  seam:  new THREE.MeshStandardMaterial({ color: '#3a2a26', roughness: 0.8 }),
  // satin charcoal face (not mirror glass): soft highlight, slightly cool like the reference
  glass: new THREE.MeshPhysicalMaterial({ color: '#25262d', roughness: 0.42, metalness: 0.0, clearcoat: 0.35, clearcoatRoughness: 0.45 }),
  ring:  new THREE.MeshStandardMaterial({ color: '#3c3f47', roughness: 0.3, metalness: 0.85 }),
  optic: new THREE.MeshPhysicalMaterial({ color: '#10121a', roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02,
                                          iridescence: 0.9, iridescenceIOR: 1.45, emissive: new THREE.Color('#ff6a2a'), emissiveIntensity: 0 }),
  dim:   new THREE.MeshPhysicalMaterial({ color: '#1c1e25', roughness: 0.2, clearcoat: 1 }),   // windows barely visible under the glass
  hole:  new THREE.MeshStandardMaterial({ color: '#141418', roughness: 0.9 }),
  led:   new THREE.MeshStandardMaterial({ color: '#2a2a2a', emissive: new THREE.Color('#34ff7a'), emissiveIntensity: 2.2 }),
  logo:  null,   // created lazily (needs a canvas)
  // normal blending: the page is light, so additive light would wash out to a pale wedge
  ir:    new THREE.MeshBasicMaterial({ color: '#FE7743', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  fov:   new THREE.MeshBasicMaterial({ color: '#FE7743', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
};

/* Fine grain for the shell: tiling value noise used as a bump + roughness map. */
(function grain() {
  var N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  var g = c.getContext('2d'), img = g.createImageData(N, N);
  for (var i = 0; i < N * N; i++) {
    var v = 118 + Math.random() * 20;          // tight range: grain, not noise
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);                         // extrude UVs are in model units (~2.2 across)
  tex.anisotropy = 4;
  mats.shell.bumpMap = tex;
  mats.shell.roughnessMap = tex;
})();

export function applyFinish(key) {
  var f = FINISHES[key];
  mats.shell.color.set(f.shell);
  mats.shell.roughness = f.rough;
  mats.shell.sheen = f.sheen;
}

/* ---- shapes ---- */

// Rounded triangle pointing up: wide base at the bottom, apex on top.
var TRI = [new THREE.Vector2(-1.0, -0.78), new THREE.Vector2(1.0, -0.78), new THREE.Vector2(0, 1.08)];
var CORNER_R = 0.27;   // corner radius of the shell outline

// Incenter + inradius: scaling the triangle about the incenter moves every edge inward
// by the same distance, which is what keeps the rim around the face even.
var INCENTER, INRADIUS;
(function () {
  var A = TRI[0], B = TRI[1], C = TRI[2];
  var a = B.distanceTo(C), b = C.distanceTo(A), c = A.distanceTo(B), p = a + b + c;
  INCENTER = new THREE.Vector2((a * A.x + b * B.x + c * C.x) / p, (a * A.y + b * B.y + c * C.y) / p);
  var area = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
  INRADIUS = area / (p / 2);
})();

/* Triangle with circular-arc corners of radius r (tangent to both edges). */
function roundedPolygon(pts, r) {
  var s = new THREE.Shape(), n = pts.length;
  for (var i = 0; i < n; i++) {
    var prev = pts[(i + n - 1) % n], cur = pts[i], next = pts[(i + 1) % n];
    var u = prev.clone().sub(cur).normalize(), v = next.clone().sub(cur).normalize();
    var half = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1)) / 2;
    var t = r / Math.tan(half);                                   // tangent point distance along each edge
    var centre = cur.clone().add(u.clone().add(v).normalize().multiplyScalar(r / Math.sin(half)));
    var a = cur.clone().addScaledVector(u, t), b = cur.clone().addScaledVector(v, t);
    var start = Math.atan2(a.y - centre.y, a.x - centre.x), end = Math.atan2(b.y - centre.y, b.x - centre.x);
    // start exactly where the arc starts and let absarc bridge the straight edges itself:
    // a separately computed edge point differs by float noise, and that near-duplicate
    // vertex kinks the extrude bevel into a visible notch
    if (i === 0) s.moveTo(centre.x + r * Math.cos(start), centre.y + r * Math.sin(start));
    s.absarc(centre.x, centre.y, r, start, end, false);
  }
  s.closePath();
  return s;
}
/* The outline pulled in by d on every side, corners staying concentric. */
function insetOutline(d) {
  var k = (INRADIUS - d) / INRADIUS;
  var pts = TRI.map(function (p) { return p.clone().sub(INCENTER).multiplyScalar(k).add(INCENTER); });
  return roundedPolygon(pts, Math.max(0.02, CORNER_R - d));
}
function roundedRect(w, h, r, cx, cy) {
  var s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function extrude(shape, depth, bevel, segs) {
  var g = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel,
                                             bevelSegments: segs || 6, curveSegments: 32 });
  g.computeVertexNormals();
  return g;
}

/* One optic: metal ring + domed glass element sitting on the face at z. */
function optic(group, x, y, z, r, domeMat) {
  var ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.94, r * 0.11, 12, 48), mats.ring);
  ring.position.set(x, y, z + r * 0.04);
  group.add(ring);
  var dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.84, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), domeMat || mats.optic);
  dome.rotation.x = Math.PI / 2;
  dome.scale.set(1, 0.5, 1);
  dome.position.set(x, y, z);
  group.add(dome);
  return dome;
}

function beam(len, radius, mat) {
  var g = new THREE.ConeGeometry(radius, len, 48, 1, true);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, len / 2);       // tip at the origin, opening toward +z
  var m = new THREE.Mesh(g, mat);
  m.renderOrder = 2;
  return m;
}

function logoMaterial() {
  if (mats.logo) return mats.logo;
  var c = document.createElement('canvas'); c.width = 512; c.height = 160;
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  function draw() {
    var g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = '#f6c9b2';
    g.font = '600 118px "Space Grotesk", "Helvetica Neue", Arial, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('surds', 10, 84);
    tex.needsUpdate = true;
  }
  draw();
  if (document.fonts) document.fonts.ready.then(draw);
  mats.logo = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  return mats.logo;
}

/* ---- the sensor ---- */

export function buildSensor() {
  var root = new THREE.Group();
  var body = new THREE.Group();
  root.add(body);
  var outline = roundedPolygon(TRI, CORNER_R);
  var BEV = 0.1;

  // front shell piece: z from -0.9 to 0
  var front = new THREE.Mesh(extrude(outline, 0.7, BEV), mats.shell);
  front.position.z = -0.8;
  body.add(front);
  // rear shell piece behind a seam groove: z from -1.66 to -0.91
  var rear = new THREE.Mesh(extrude(outline, 0.55, BEV), mats.shell);
  rear.position.z = -1.56;
  body.add(rear);
  // dark core that shows through the seam
  var core = new THREE.Mesh(extrude(insetOutline(0.01), 0.22, 0), mats.seam);
  core.position.z = -1.02;
  body.add(core);

  // dark glass face, a hair proud of the shell's flat front
  var faceShape = insetOutline(0.075);   // even 0.075 rim (+ the shell's bevel) all the way round
  var face = new THREE.Mesh(extrude(faceShape, 0.02, 0.012, 3), mats.glass);
  face.position.z = 0.0;   // shell front is z = 0; the plate stands 0.03 proud of it
  body.add(face);
  var FACE = 0.034;   // front surface of the glass

  // the only two openings on the face: thermal lens centred, pinhole to its lower right
  var lens = optic(body, 0, -0.02, FACE, 0.27);
  var hole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), mats.hole);
  hole.rotation.x = Math.PI / 2; hole.position.set(0.36, -0.3, FACE);
  body.add(hole);

  // printed wordmark, lower left of the face like the reference
  var logo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.156), logoMaterial());
  logo.position.set(-0.36, -0.48, FACE + 0.002);
  body.add(logo);

  // dotted grille on the left side face of the front shell, up toward the apex
  var A = TRI[0], B = TRI[2];
  var edge = B.clone().sub(A).normalize();                      // along the left side, upward
  var nrm2 = new THREE.Vector2(-edge.y, edge.x);                 // outward normal of the left side
  if (nrm2.x > 0) nrm2.negate();
  var normal = new THREE.Vector3(nrm2.x, nrm2.y, 0).normalize();
  var base = A.clone().add(edge.clone().multiplyScalar(1.15)).add(nrm2.clone().multiplyScalar(BEV + 0.002));
  var holeGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12);
  var dots = [];
  for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) dots.push([(i - 1) * 0.085, (j - 1) * 0.085]);
  var grille = new THREE.InstancedMesh(holeGeo, mats.hole, dots.length);
  var qAlign = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  var mtx = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  var along = new THREE.Vector3(edge.x, edge.y, 0);
  dots.forEach(function (d, k) {
    var p = new THREE.Vector3(base.x, base.y, -0.32).addScaledVector(along, d[0]).add(new THREE.Vector3(0, 0, d[1]));
    mtx.compose(p, qAlign, one);
    grille.setMatrixAt(k, mtx);
  });
  body.add(grille);
  var grilleAnchor = new THREE.Vector3(base.x, base.y, -0.32).addScaledVector(normal, 0.01);

  // wall plate behind, reaching below the body, with two screw rings showing under it
  var plate = new THREE.Mesh(extrude(roundedRect(1.35, 1.55, 0.36, -0.1, -0.84), 0.06, 0.05), mats.shell);
  plate.position.z = -1.78;
  root.add(plate);
  var screws = [[-0.42, -1.36], [0.22, -1.36]];
  screws.forEach(function (s) {
    var r = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 10, 36), mats.shell);
    r.position.set(s[0], s[1], -1.66);
    root.add(r);
    var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.02, 28), mats.shell);
    cap.rotation.x = Math.PI / 2; cap.position.set(s[0], s[1], -1.665);
    root.add(cap);
  });

  // centre the solid parts on their bounds before adding the (invisible-by-default) beams
  var box = new THREE.Box3().setFromObject(root);
  var c = box.getCenter(new THREE.Vector3());
  var shift = new THREE.Vector3(-c.x, -c.y, 0);
  root.children.forEach(function (ch) { ch.position.add(shift); });

  var irBeam = beam(4.2, 0.6, mats.ir);
  irBeam.position.set(0.0, -0.4, FACE + 0.02);   // emitters behind the glass, under the lens
  body.add(irBeam);
  var fov = beam(3.6, 1.7, mats.fov);
  fov.position.set(0, -0.02, FACE + 0.02);
  body.add(fov);

  /* Named anchors for callouts, in body-local coordinates: position + outward normal. */
  var Z = new THREE.Vector3(0, 0, 1);
  var anchors = {
    lens:   { p: new THREE.Vector3(0, -0.02, FACE + 0.1),     n: Z },
    light:  { p: new THREE.Vector3(0.36, -0.3, FACE + 0.02),  n: Z },
    ir:     { p: new THREE.Vector3(0.0, -0.4, FACE + 0.01),   n: Z },
    grille: { p: grilleAnchor, n: normal },
    // the plate lives on root, but body and plate were shifted together, so its
    // unshifted coordinates are already body-local
    mount:  { p: new THREE.Vector3(-0.42, -1.36, -1.62), n: Z }
  };
  return { root: root, body: body, lens: lens, irBeam: irBeam, fov: fov, anchors: anchors };
}
