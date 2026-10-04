// SP-100 3D battles: the Drowned Suburbs (zone b). A flooded cul-de-sac under a low wet sky: the fight is on a silted
// rise of lawn and drowned road, ringed by standing water (a flat, slightly glossy plane); half-sunk cars, a roof
// poking out of the water to the north, a storm outfall east, sunken fences, mailboxes and a rowboat, reeds (one
// instanced draw) and puddles on the rise. Smudge's drowned_* props (assets/3d manifest zone_props). Decoration only.
import * as THREE from "three";
import { createWorldKit } from "../world.js";

export const S = 0.55;
const AX = 20 * S, AZ = 12 * S, WATER = -0.32;
export const FILES = ["drowned_car_sunk.glb", "drowned_fence_sunk.glb", "drowned_mailbox.glb", "drowned_puddle.glb", "drowned_roof.glb", "drowned_rowboat.glb",
  "drowned_outfall.glb", "drowned_reeds.glb"];

function h(x, z) {   // the silt rise the fight is on, sloping under the water outside the arena
  const roll = 0.07 * Math.sin(x * 0.5 + 0.4) * Math.cos(z * 0.43) + 0.04 * Math.sin(x * 1.1 - z * 0.8);
  const ex = Math.max(0, Math.abs(x) - AX - 1.2) / 5, ez = Math.max(0, Math.abs(z) - AZ - 1.2) / 4, e = Math.min(1, Math.hypot(ex, ez));
  return 0.05 + roll - e * e * (3 - 2 * e) * 1.1;
}
function normalAt(x, z) { const e = 0.25; return new THREE.Vector3(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); }

export function build(ctx) {
  const { scene, mats, phys, low } = ctx, kit = createWorldKit(ctx);
  scene.background = new THREE.Color(0x6a767a); scene.fog = new THREE.Fog(0x6a767a, 30, 82);
  scene.add(new THREE.HemisphereLight(0xc0ccd0, 0x3a4440, low ? 1.6 : 1.35));
  const sun = new THREE.DirectionalLight(0xd8e2e4, 0.95); sun.position.set(-8, 18, 9); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: 1, far: 60 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; }
  const lawn = new THREE.Color(0x5a6440), silt = new THREE.Color(0x6a604a), road = new THREE.Color(0x4a4a46);
  kit.terrain(90, 60, 1, h, (x, z, y, c) => { const n = 0.5 + 0.5 * Math.sin(x * 0.9 + z * 1.2) * Math.cos(z * 0.7 - x * 0.4);
    c.copy(lawn).lerp(silt, 0.35 + n * 0.4); if (Math.abs(z - 0.5) < 3.2 && Math.abs(x) < 30) c.lerp(road, 0.55); if (y < WATER + 0.12) c.lerp(silt, 0.7).multiplyScalar(0.7); });
  phys.addHeightfield(h, -24, -16, 48, 32, 1);
  // the flood: one flat plane, a little glossy so the overcast sky shows in it
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), mats.shade({ color: 0x3e5258, transparent: true, opacity: 0.86, depthWrite: false }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER; water.receiveShadow = true; water.renderOrder = 1; scene.add(water);
  const rng = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(41);
  const box = (w, hh, d, col) => (g) => { kit.mesh(new THREE.BoxGeometry(w, hh, d), col, g, 0, hh / 2, 0); };
  const P = (file, fb, x, y, z, rot, s, o) => kit.prop(file, fb, x, y, z, rot, s, o);
  // north: a roof in the water, sunk cars along the drowned street; east: the storm outfall
  P("drowned_roof.glb", box(4.2, 2, 3.2, 0x5a4a44), -3, WATER - 0.4, -AZ - 6.2, 0.18, 1.25, { occlude: true, hit: false });
  P("drowned_roof.glb", box(4.2, 2, 3.2, 0x5a4a44), 10.5, WATER - 0.6, -AZ - 7.5, -0.3, 1.1, { occlude: true, hit: false });
  for (const [x, z, r] of [[-12.5, -AZ - 3.2, 1.35], [4.5, -AZ - 2.8, 1.75], [AX + 3.2, 5.5, 0.15]]) P("drowned_car_sunk.glb", box(2.7, 1, 4.7, 0x5a5a56), x, h(x, z) - 0.15, z, r, 1, { occlude: true });
  P("drowned_outfall.glb", box(3.5, 2, 1.8, 0x6a6a64), AX + 4, h(AX + 4, -2.5) - 0.3, -2.5, -Math.PI / 2, 1, { occlude: true });
  // fences half under, mailboxes on the rise edge, the rowboat pulled up south-west (low: the camera side)
  for (let i = 0; i < 7; i++) { const x = -10 + i * 2.1, z = -AZ - 1.3; P("drowned_fence_sunk.glb", box(2.1, 0.9, 0.26, 0x8a7a64), x, h(x, z) - 0.12, z, (rng() - 0.5) * 0.15, 1, { occlude: false }); }
  for (let i = 0; i < 3; i++) { const x = -AX - 1.6, z = 1 + i * 2.1; P("drowned_fence_sunk.glb", box(2.1, 0.9, 0.26, 0x8a7a64), x, h(x, z) - 0.12, z, Math.PI / 2 + (rng() - 0.5) * 0.2, 1, { occlude: false }); }
  for (const [x, z, r] of [[-6.5, AZ + 1.4, 0.2], [5.5, AZ + 1.6, -0.15], [AX + 1.2, -6, 1.7]]) P("drowned_mailbox.glb", box(0.3, 1.2, 0.3, 0x5a6a7a), x, h(x, z) - 0.05, z, r, 1, { occlude: false });
  P("drowned_rowboat.glb", box(1.2, 0.7, 3, 0x6a5a44), -AX - 2.2, h(-AX - 2.2, -4) - 0.1, -4, 0.5, 1, { occlude: false });
  // puddles on the rise (flat, no physics), reeds round the waterline: one draw each
  const pud = [], reeds = [];
  for (const [x, z] of [[-9, -AZ + 0.3], [6.5, AZ - 0.2], [AX - 0.6, -4.8]]) pud.push({ x, y: h(x, z) + 0.01, z, rot: rng() * 6.28, s: 0.8 + rng() * 0.3 });   // at the rise's edges: mid-field they read as holes
  kit.scatter("drowned_puddle.glb", new THREE.CircleGeometry(0.6, 10).rotateX(-Math.PI / 2), 0x3a4a4e, pud, { cast: false });
  for (let i = 0; i < (low ? 90 : 180); i++) { const a = rng() * 6.28, rx = AX + 1.6 + rng() * 3.5, rz = AZ + 1.4 + rng() * 3; const x = Math.cos(a) * rx, z = Math.sin(a) * rz;
    reeds.push({ x, y: Math.max(WATER - 0.1, h(x, z)), z, rot: rng() * 6.28, s: 0.7 + rng() * 0.7, k: rng(), tilt: (rng() - 0.5) * 0.25 }); }
  kit.scatter("drowned_reeds.glb", new THREE.ConeGeometry(0.12, 1, 4), 0x6a7440, reeds, { shade: 0.25 });
  return {
    S, map: (sx, sy) => { const x = sx * S - AX, z = sy * S - AZ; return new THREE.Vector3(x, h(x, z), z); },
    toSim: (x, z) => ({ x: (x + AX) / S, y: (z + AZ) / S }),
    ground: (x, z) => ({ y: h(x, z), n: normalAt(x, z) }),
    hitMeshes: kit.hitMeshes, occluders: kit.occluders,
    camTarget: new THREE.Vector3(0, 0.3, 0.4), fitW: 2 * AX + 2.2, fitD: 2 * AZ + 2.5, minDist: 16,
    camBounds: (p) => Math.abs(p.x) < 40 && Math.abs(p.z) < 27, physBounds: { cx: 0, cz: 0, half: 30 }
  };
}
