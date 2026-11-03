/* People for /explore: posed figures from tools/people_build.py (one GLB, ten figures: m_/f_ × stand, walk, tablet,
   sit, kneel). Every figure shares its geometry; makePerson() dresses a clone with its own skin tone, hair, shirt,
   sleeves, trousers and, for engineers, a hi-vis vest and hard hat. Static poses, so they cost almost nothing to draw. */
import * as THREE from "three";

const SKIN = [0x8d5a3b, 0xc68b62, 0xe0b08a, 0xf0c9a6, 0x5e3a26, 0xa8724f, 0xd49c78];
const HAIR = [0x141110, 0x1f1712, 0x2e2018, 0x3d2c20, 0x0d0d0d, 0x5a4636, 0x8a8580];
const SHIRT = [0x1e2c4a, 0xe9e9e6, 0x93b4d6, 0x3b3f45, 0x15171b, 0x2f4d40, 0x6e2230, 0xd8d2c4];
const TROUSERS = [0x1b1f2a, 0x2a2c30, 0x34496a, 0x6b604f, 0x151515, 0x3c3f44];

const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (r, a) => a[Math.floor(r() * a.length)];
const mat = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });

let FIGS = null;
export async function loadPeople(loader, url) {
  const g = await loader.loadAsync(url);
  FIGS = {};
  for (const c of g.scene.children) { c.position.set(0, 0, 0); FIGS[c.name] = c; }
  return FIGS;
}

/* opts: pose (stand|walk|tablet|sit|kneel), body (m|f), seed, vest, hat, sleeves ("long"|"short"), shirt, trousers */
export function makePerson(opts = {}) {
  const r = rng((opts.seed ?? 7) * 7919 + 13);
  const body = opts.body || (r() < 0.45 ? "f" : "m"), pose = opts.pose || "stand";
  const src = FIGS[`${body}_${pose}`]; if (!src) throw new Error(`no figure ${body}_${pose}`);
  const skin = mat(pick(r, SKIN), 0.62);
  const shirtC = opts.shirt ?? pick(r, SHIRT);
  const shirt = mat(shirtC, 0.88), trousers = mat(opts.trousers ?? pick(r, TROUSERS), 0.82);
  const M = {
    skin, hair: mat(pick(r, HAIR), 0.72), shirt, trousers,
    sleeve: (opts.sleeves || (r() < 0.6 ? "long" : "short")) === "long" ? shirt : skin,
    vest: opts.vest ? mat(0xc9e21b, 0.7, { emissive: 0x3a4200, emissiveIntensity: 0.35 }) : shirt,
    stripe: opts.vest ? mat(0xd4d8dc, 0.32, { metalness: 0.55 }) : shirt,
    belt: mat(0x111111, 0.5), shoes: mat(0x161616, 0.42),
    hat: mat(opts.hatColor ?? 0xf2f1ec, 0.38), device: mat(0x17181b, 0.4), screen: mat(0x0b1424, 0.25, { emissive: 0x3d78c8, emissiveIntensity: 0.9 }),
  };
  const o = src.clone(true);
  o.traverse((m) => {
    if (m.isMesh) {
      m.material = M[m.material.name] || m.material; m.castShadow = true; m.receiveShadow = true;
    }
    if (m.name === "hat" || m.name.startsWith("hat")) m.visible = !!opts.hat;
  });
  o.userData.person = { body, pose };
  return o;
}
