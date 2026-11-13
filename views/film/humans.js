/* Realistic, animated people for the SURDS Thermal film.
 *
 * Rigged characters from the three.js example library (served by jsDelivr):
 *   woman  Michelle.glb  textured Mixamo character; borrows Xbot's walk and idle clips
 *                        (same Mixamo rig, so the rotations transfer one to one)
 *   man    Soldier.glb   its own walk and idle; visor removed and the suit tinted per
 *                        person so the men read as shoppers in jackets
 *   guard  Soldier.glb   untinted, plays the mall's security guard
 * (A Ready Player Me avatar was tried: its bones have different rest orientations, so
 * Mixamo rotations copied onto it leave the arms out. Not used.)
 * Position tracks are dropped so clips play in place and never fight the film's own
 * path-following; rotations carry the motion.
 */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

var BASE = '/views/film/people/';   // copies of the three.js example models (Mixamo rigs), served locally
var HEIGHT = { woman: 1.68, man: 1.8, guard: 1.82 };
var kinds = null;

function rotationsOnly(clip, strip) {
  var c = clip.clone();
  c.tracks = c.tracks.filter(function (t) { return !/\.position$/.test(t.name) && !/\.scale$/.test(t.name); });
  if (strip) c.tracks.forEach(function (t) { t.name = t.name.replace(/^mixamorig/, ''); });
  return c;
}
function heightOf(obj) {
  obj.updateMatrixWorld(true);
  var box = new THREE.Box3().setFromObject(obj);
  return Math.max(0.01, box.max.y - box.min.y);
}

export async function loadHumans(loader) {
  var files = await Promise.all(['Xbot', 'Michelle', 'Soldier'].map(function (n) { return loader.loadAsync(BASE + n + '.glb'); }));
  var xbot = files[0], michelle = files[1], soldier = files[2];
  var clip = function (g, name) { return g.animations.find(function (a) { return a.name.toLowerCase() === name; }); };
  kinds = {
    woman: { src: michelle.scene, walk: rotationsOnly(clip(xbot, 'walk')), idle: rotationsOnly(clip(xbot, 'idle')) },
    man: { src: soldier.scene, walk: rotationsOnly(clip(soldier, 'walk')), idle: rotationsOnly(clip(soldier, 'idle')) },
    guard: { src: soldier.scene, walk: rotationsOnly(clip(soldier, 'walk')), idle: rotationsOnly(clip(soldier, 'idle')) }
  };
  Object.keys(kinds).forEach(function (k) { kinds[k].scale = HEIGHT[k] / heightOf(kinds[k].src); });
  return kinds;
}

/* Body temperatures for thermal vision: skin warmest, clothing a little cooler. */
function tempFor(kind, mesh) {
  var n = ((mesh.material && mesh.material.name) || mesh.name || '').toLowerCase();
  if (kind === 'man' || kind === 'guard') return /visor/.test(n) ? 29.5 : 32.4;
  return 33.4;   // Michelle: one texture for skin and clothes
}

var SUITS = [0x8fa6c8, 0xb9b2a6, 0x9c7a62, 0x7f8f7a, 0xc8c8c8, 0x8a7fa8, 0xb08d6a];   // multiplied over the suit texture

/* opts: kind (woman|man|guard), seed, state ('walk' | 'idle') */
export function makeHuman(opts) {
  var k = kinds[opts.kind];
  var obj = cloneSkinned(k.src);
  obj.scale.setScalar(k.scale);
  var seed = opts.seed || 1;
  obj.traverse(function (m) {
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = false;
    m.frustumCulled = false;                       // skinned bounds lag behind the pose
    m.material = m.material.clone();
    if (opts.kind === 'man') {                    // shoppers: no sci-fi visor, a different jacket each
      if (/visor/i.test(m.name) || /visor/i.test(m.material.name)) m.visible = false;
      else m.material.color.setHex(SUITS[seed % SUITS.length]).multiplyScalar(1.5);
    }
    m.userData.temp = tempFor(opts.kind, m);
  });
  var mixer = new THREE.AnimationMixer(obj);
  var walk = mixer.clipAction(k.walk), idle = mixer.clipAction(k.idle);
  walk.play(); idle.play();
  walk.time = (seed * 0.137) % k.walk.duration; idle.time = (seed * 0.211) % k.idle.duration;
  var h = { obj: obj, mixer: mixer, walk: walk, idle: idle, kind: opts.kind };
  setGait(h, opts.state || 'walk', true);
  return h;
}

export function setGait(h, state, instant) {
  var w = state === 'walk' ? 1 : 0;
  if (instant) { h.walk.setEffectiveWeight(w); h.idle.setEffectiveWeight(1 - w); h.gait = w; return; }
  h.gaitTarget = w;
}

export function updateHuman(h, dt, speed) {
  if (h.gaitTarget != null) {
    h.gait += (h.gaitTarget - h.gait) * (1 - Math.pow(0.002, dt));
    h.walk.setEffectiveWeight(h.gait); h.idle.setEffectiveWeight(1 - h.gait);
  }
  h.walk.timeScale = speed ? speed / 1.15 : 1;      // match the stride to the ground speed
  h.mixer.update(dt);
}
