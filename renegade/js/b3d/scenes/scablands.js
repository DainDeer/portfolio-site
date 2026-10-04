// SP-100 3D battles: the Scablands (zone scablands). Burnt, cracked hardpan under a hazy rust sky, hard warm light: a
// derelict rail line along the north edge with a marker post, a burnt-out truck and pylon stubs, scrap heaps, drums and
// tyres at the edges, craters and scabby rocks, dry shrubs (one instanced draw). Smudge's scab_* props (assets/3d
// manifest zone_props). Decoration only: the sim has no cover.
import * as THREE from "three";
import { createWorldKit } from "../world.js";

export const S = 0.55;
const AX = 20 * S, AZ = 12 * S;
export const FILES = ["scablands_truck_wreck.glb", "scablands_rail_track.glb", "scablands_rail_marker.glb", "scablands_scrap_heap.glb", "scablands_drum.glb", "scablands_tire.glb",
  "scablands_pylon_stub.glb", "scablands_crater.glb", "scablands_rock_scab.glb", "scablands_shrub_dry.glb"];

function h(x, z) {   // hardpan: nearly flat, low ridges outside
  const roll = 0.1 * Math.sin(x * 0.33 + 0.8) * Math.cos(z * 0.29 - 0.4) + 0.05 * Math.sin(x * 1.3 + z * 0.9);
  const ex = Math.max(0, Math.abs(x) - AX - 3) / 14, ez = Math.max(0, Math.abs(z) - AZ - 3) / 10, e = Math.min(1, Math.hypot(ex, ez));
  return roll + e * e * (3 - 2 * e) * (1.2 + 0.6 * Math.sin(x * 0.25 + 1));
}
function normalAt(x, z) { const e = 0.25; return new THREE.Vector3(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); }

export function build(ctx) {
  const { scene, phys, low } = ctx, kit = createWorldKit(ctx);
  scene.background = new THREE.Color(0xb08a66); scene.fog = new THREE.Fog(0xae8a68, 34, 88);
  scene.add(new THREE.HemisphereLight(0xf0d8b8, 0x5a4030, low ? 1.4 : 1.15));
  const sun = new THREE.DirectionalLight(0xffd8a8, 2.0); sun.position.set(-12, 22, 6); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: 1, far: 70 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; }
  const pan = new THREE.Color(0x8a6a4c), ash = new THREE.Color(0x4a3e36), crack = new THREE.Color(0x6a4e3a);
  kit.terrain(90, 60, 1, h, (x, z, y, c) => { const n = Math.abs(Math.sin(x * 2.1 + Math.sin(z * 1.7) * 1.5) * Math.cos(z * 2.3 - x * 0.6));
    c.copy(pan).lerp(crack, n > 0.9 ? 0.8 : 0.15 * n); const burn = 0.5 + 0.5 * Math.sin(x * 0.27 - 1) * Math.cos(z * 0.31 + 0.5); if (burn > 0.75) c.lerp(ash, (burn - 0.75) * 2.4); });
  phys.addHeightfield(h, -24, -16, 48, 32, 1);
  const rng = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(77);
  const box = (w, hh, d, col) => (g) => { kit.mesh(new THREE.BoxGeometry(w, hh, d), col, g, 0, hh / 2, 0); };
  const P = (file, fb, x, z, rot, s, o, dy) => kit.prop(file, fb, x, h(x, z) - (dy == null ? 0.04 : dy), z, rot, s, o);
  // the rail line north (track pieces end to end), its marker post, pylon stubs behind it
  for (let i = 0; i < 12; i++) { const x = -26 + i * 2.98, z = -AZ - 2.6; P("scablands_rail_track.glb", box(3, 0.35, 2.4, 0x5a4a3e), x, z, (rng() - 0.5) * 0.03, 1, { occlude: false }, 0.06); }
  P("scablands_rail_marker.glb", box(0.25, 3, 0.25, 0x8a7a64), -7.5, -AZ - 4.4, 0.3, 1, { occlude: false, hit: false });
  for (const [x, z] of [[-15, -AZ - 6.5], [2, -AZ - 7.2], [17, -AZ - 6.2]]) P("scablands_pylon_stub.glb", box(2, 4.2, 2, 0x6a625a), x, z, rng() * 6.28, 1, { occlude: true, hit: false });
  // the burnt truck east, scrap heaps / drums / tyres on the edges (low ones south and west)
  P("scablands_truck_wreck.glb", box(6.3, 2.5, 2.3, 0x4a3a30), AX + 4.2, 1.2, 1.35, 1, { occlude: true });
  for (const [x, z] of [[AX + 2.6, -5.8], [-AX - 2.8, -6.2], [12, -AZ - 0.8]]) P("scablands_scrap_heap.glb", box(1.8, 0.8, 1.8, 0x5a4a40), x, z, rng() * 6.28, 0.9 + rng() * 0.4, { occlude: true });
  for (const [x, z] of [[AX + 1.6, 5.8], [AX + 2.3, 6.4], [-13.5, AZ + 1.3], [3.5, -AZ - 0.9]]) P("scablands_drum.glb", box(0.6, 0.9, 0.6, 0x6a3a28), x, z, rng() * 6.28, 1, { occlude: false });
  for (const [x, z] of [[-AX - 1.4, 3.2], [8, AZ + 1.6], [-4, AZ + 2.2]]) P("scablands_tire.glb", box(0.8, 0.3, 0.8, 0x1e1a18), x, z, rng() * 6.28, 1, { occlude: false });
  for (const [x, z, r] of [[-8.5, AZ + 1.4, 0.4], [6, AZ + 2.9, 2.1], [-AX - 2, -1.5, 1], [AX + 1.3, -2.8, 2.5], [-1.5, -AZ - 1, 0.2]]) P("scablands_rock_scab.glb", box(1.6, 0.9, 1.2, 0x6a5240), x, z, r, 0.8 + rng() * 0.4, { occlude: true });
  // craters (raised rims: kept off the arena, units would wade through them), dry shrubs: one draw each
  const crat = [], shrub = [];
  for (const [x, z, s] of [[-AX - 1.5, AZ + 0.5, 1.2], [14, AZ + 2.5, 1.1], [AX + 2, -AZ - 0.2, 0.9], [-2, AZ + 3.2, 1]]) crat.push({ x, y: h(x, z) - 0.05, z, rot: rng() * 6.28, s });
  kit.scatter("scablands_crater.glb", new THREE.CircleGeometry(1.4, 12).rotateX(-Math.PI / 2), 0x4a3a2e, crat, { cast: false });
  for (let i = 0; i < (low ? 50 : 110); i++) { let x = (rng() - 0.5) * 48, z = (rng() - 0.5) * 32; if (Math.abs(x) < AX && Math.abs(z) < AZ && rng() < 0.75) { x *= 1.5; z *= 1.5; } shrub.push({ x, y: h(x, z), z, rot: rng() * 6.28, s: 0.7 + rng() * 0.7, k: rng() }); }
  kit.scatter("scablands_shrub_dry.glb", new THREE.ConeGeometry(0.3, 0.5, 5), 0x7a6a44, shrub, { shade: 0.3 });
  return {
    S, map: (sx, sy) => { const x = sx * S - AX, z = sy * S - AZ; return new THREE.Vector3(x, h(x, z), z); },
    toSim: (x, z) => ({ x: (x + AX) / S, y: (z + AZ) / S }),
    ground: (x, z) => ({ y: h(x, z), n: normalAt(x, z) }),
    hitMeshes: kit.hitMeshes, occluders: kit.occluders,
    camTarget: new THREE.Vector3(0, 0.3, 0.4), fitW: 2 * AX + 2.2, fitD: 2 * AZ + 2.5, minDist: 16,
    camBounds: (p) => Math.abs(p.x) < 40 && Math.abs(p.z) < 27, physBounds: { cx: 0, cz: 0, half: 30 }
  };
}
