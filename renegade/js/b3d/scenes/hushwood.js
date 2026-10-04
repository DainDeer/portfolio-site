// SP-100 3D battles: the Hushwood (zone a). A clearing in the dark pine forest late in the day: cool green light through
// the trees, a mossy floor, felled logs, stumps and mossy rocks, a sharpened-log palisade on the north edge and the creek
// culvert to the east; ferns scattered (one instanced draw). Smudge's hushwood_* props (assets/3d manifest zone_props).
// Decoration only: the sim has no cover, so nothing here touches an outcome. Tall trees stand north / east, low props
// south / west, so neither camera (landscape: from the south; portrait: from the west) looks through a trunk.
import * as THREE from "three";
import { createWorldKit } from "../world.js";

export const S = 0.55;
const AX = 20 * S, AZ = 12 * S;
export const FILES = ["hushwood_pine.glb", "hushwood_pine_small.glb", "hushwood_dead_tree.glb", "hushwood_stump.glb", "hushwood_log.glb", "hushwood_log_pile.glb",
  "hushwood_fern.glb", "hushwood_rock_mossy.glb", "hushwood_culvert.glb", "hushwood_palisade.glb", "grass_tuft.glb"];

function h(x, z) {   // a flat clearing, the forest floor rising a little into the trees
  const roll = 0.16 * Math.sin(x * 0.41 + 1.3) * Math.cos(z * 0.37) + 0.08 * Math.sin(x * 0.9 - z * 0.6);
  const ex = Math.max(0, Math.abs(x) - AX - 2) / 12, ez = Math.max(0, Math.abs(z) - AZ - 2) / 9, e = Math.min(1, Math.hypot(ex, ez));
  return roll + e * e * (3 - 2 * e) * (1.6 + 0.8 * Math.sin(x * 0.2));
}
function normalAt(x, z) { const e = 0.25; return new THREE.Vector3(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); }

export function build(ctx) {
  const { scene, phys, low } = ctx, kit = createWorldKit(ctx);
  scene.background = new THREE.Color(0x2c3a30); scene.fog = new THREE.Fog(0x2e3c32, 30, 80);
  scene.add(new THREE.HemisphereLight(0xb8d0b0, 0x24301e, low ? 1.25 : 1.0));
  const sun = new THREE.DirectionalLight(0xf2d8a0, 1.7); sun.position.set(-14, 16, 10); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: 1, far: 70 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; }
  const moss = new THREE.Color(0x3e5a2c), earth = new THREE.Color(0x4a3e2a), needles = new THREE.Color(0x5a4a30);
  kit.terrain(90, 60, 1, h, (x, z, y, c) => { const n = 0.5 + 0.5 * Math.sin(x * 1.3 + z * 0.7) * Math.cos(z * 1.1 - x * 0.5);
    c.copy(moss).lerp(earth, Math.min(1, n * 0.6)); if (Math.abs(x) > AX + 1 || Math.abs(z) > AZ + 1) c.lerp(needles, 0.35); });
  phys.addHeightfield(h, -24, -16, 48, 32, 1);
  const rng = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(23);
  const P = (file, fb, x, z, rot, s, o) => kit.prop(file, fb, x, h(x, z) - 0.04, z, rot, s, o);
  // placeholders if a model is missing: plain boxes / cones in the zone's colours
  const cone = (r, hh, col) => (g) => { kit.mesh(new THREE.CylinderGeometry(0.12, 0.18, hh * 0.3, 6), 0x4a3826, g, 0, hh * 0.15, 0); kit.mesh(new THREE.ConeGeometry(r, hh * 0.8, 7), col, g, 0, hh * 0.6, 0); };
  const box = (w, hh, d, col) => (g) => { kit.mesh(new THREE.BoxGeometry(w, hh, d), col, g, 0, hh / 2, 0); };
  // the tree line: big pines north and east, small pines + snags around; a gap to the south-west for the camera
  for (let i = 0; i < 9; i++) { const x = -18 + i * 4.4 + (rng() - 0.5) * 1.5, z = -AZ - 4.2 - rng() * 2.5; P("hushwood_pine.glb", cone(1.5, 6.5, 0x2a4a2a), x, z, rng() * 6.28, 0.9 + rng() * 0.35, { occlude: true, hit: false }); }
  for (let i = 0; i < 5; i++) { const x = AX + 4 + rng() * 2.5, z = -AZ + i * 3.4; P("hushwood_pine.glb", cone(1.5, 6.5, 0x2a4a2a), x, z, rng() * 6.28, 0.85 + rng() * 0.3, { occlude: true, hit: false }); }
  for (const [x, z] of [[-15.5, -9.5], [-6, -10.2], [5, -9.6], [14.5, -9.8], [AX + 2.6, 4.5], [AX + 3, -3]]) P("hushwood_pine_small.glb", cone(1, 3.6, 0x34522e), x, z, rng() * 6.28, 0.9 + rng() * 0.3, { occlude: true, hit: false });
  for (const [x, z, r] of [[-AX - 3.2, -7.5, 0.6], [AX + 2.2, 7.8, 2.1]]) P("hushwood_dead_tree.glb", cone(0.6, 4, 0x6a5a48), x, z, r, 1, { occlude: true, hit: false });
  // the palisade along the north edge (a gap where it fell), the culvert headwall east
  for (let i = 0; i < 9; i++) { if (i === 5) continue; const x = -9 + i * 2.15, z = -AZ - 1.5; P("hushwood_palisade.glb", box(2.15, 2.4, 0.4, 0x6a5038), x, z, (rng() - 0.5) * 0.06, 1, { occlude: true }); }
  P("hushwood_culvert.glb", box(3.6, 1.8, 1.8, 0x6a6a5e), AX + 2.4, 0.5, -Math.PI / 2, 1, { occlude: true });
  // logs, a log pile, stumps and mossy rocks on the edges (low: these are the near / camera side ones)
  for (const [x, z, r] of [[-7, AZ + 1.6, 0.15], [4.5, AZ + 1.9, -0.25], [-AX - 1.8, 2.5, 1.45]]) P("hushwood_log.glb", box(3.2, 0.8, 0.7, 0x5a4630), x, z, r, 1, { occlude: true });
  P("hushwood_log_pile.glb", box(2.7, 1.1, 1.3, 0x5a4630), -12.5, -AZ - 0.6, 0.1, 1, { occlude: true });
  for (const [x, z] of [[-AX - 1.2, -3.8], [11.8, AZ + 1.2], [-2, AZ + 2.4], [AX + 0.9, -5.6], [-4.5, -AZ - 0.4]]) P("hushwood_stump.glb", box(1.2, 0.6, 1.2, 0x7a6448), x, z, rng() * 6.28, 0.8 + rng() * 0.3, { occlude: false });
  for (const [x, z] of [[-10.5, AZ + 1.1], [8.5, AZ + 2.6], [-AX - 2.4, -1], [AX + 1.4, 3.4], [1.5, -AZ - 0.7]]) P("hushwood_rock_mossy.glb", box(1.6, 0.85, 1.1, 0x5a6248), x, z, rng() * 6.28, 0.8 + rng() * 0.4, { occlude: true });
  // ferns + a little grass: one draw each
  const fern = [], tuft = [];
  for (let i = 0; i < (low ? 70 : 140); i++) { let x = (rng() - 0.5) * 46, z = (rng() - 0.5) * 32; if (Math.abs(x) < AX - 1 && Math.abs(z) < AZ - 1 && rng() < 0.8) { x *= 1.6; z *= 1.6; } fern.push({ x, y: h(x, z), z, rot: rng() * 6.28, s: 0.7 + rng() * 0.6, k: rng() }); }
  for (let i = 0; i < (low ? 120 : 260); i++) { const x = (rng() - 0.5) * 48, z = (rng() - 0.5) * 32; tuft.push({ x, y: h(x, z), z, rot: rng() * 6.28, s: 0.7 + rng() * 0.7, k: rng() }); }
  kit.scatter("hushwood_fern.glb", new THREE.ConeGeometry(0.4, 0.4, 5), 0x3e6a30, fern, { shade: 0.25 });
  kit.scatter("grass_tuft.glb", new THREE.ConeGeometry(0.08, 0.3, 3), 0x4a6a30, tuft, { shade: 0.2, cast: false });
  return {
    S, map: (sx, sy) => { const x = sx * S - AX, z = sy * S - AZ; return new THREE.Vector3(x, h(x, z), z); },
    toSim: (x, z) => ({ x: (x + AX) / S, y: (z + AZ) / S }),
    ground: (x, z) => ({ y: h(x, z), n: normalAt(x, z) }),
    hitMeshes: kit.hitMeshes, occluders: kit.occluders,
    camTarget: new THREE.Vector3(0, 0.3, 0.4), fitW: 2 * AX + 2.2, fitD: 2 * AZ + 2.5, minDist: 16,
    camBounds: (p) => Math.abs(p.x) < 40 && Math.abs(p.z) < 27, physBounds: { cx: 0, cz: 0, half: 30 }
  };
}
