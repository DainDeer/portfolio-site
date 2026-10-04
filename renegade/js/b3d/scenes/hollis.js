// SP-100 3D battles: Hollis Outskirts (zone hollis). The edge of town under an overcast sky: a cracked two-lane road, a
// row of boarded shopfronts to the north, ruined walls east and west, wrecks, jersey barriers and crates pushed to the
// kerbs, a leaning streetlight. Ported from the approved urban demo (proto/battle3d_urban); there is no Hollis-specific
// prop set yet, so it uses the generic urban models (car_wreck, barrier, crate, wall_chunk, wall_shopfront, streetlight).
// Decoration only: the sim has no cover. The arena is kept clear (the demo had wrecks mid-road; here they sit on the kerbs).
import * as THREE from "three";
import { createWorldKit } from "../world.js";

export const S = 0.55;
const AX = 20 * S, AZ = 12 * S, UP = new THREE.Vector3(0, 1, 0);
export const FILES = ["car_wreck.glb", "barrier.glb", "crate.glb", "wall_chunk.glb", "wall_shopfront.glb", "streetlight.glb"];

export function build(ctx) {
  const { scene, mats, phys, low } = ctx, kit = createWorldKit(ctx);
  scene.background = new THREE.Color(0x8e959a); scene.fog = new THREE.Fog(0x8e959a, 36, 90);
  scene.add(new THREE.HemisphereLight(0xc8d2dc, 0x4a4a46, low ? 1.9 : 1.7));
  const sun = new THREE.DirectionalLight(0xdde6ee, 0.75); sun.position.set(-6, 20, 8); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 50 }); sun.shadow.bias = -0.0008; }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), mats.solid(0x55554e)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); kit.hitMeshes.push(ground);
  phys.addFloor();
  const flat = (w, d, color, x, z, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.solid(color)); m.rotation.x = -Math.PI / 2; m.position.set(x, y || 0.01, z); m.receiveShadow = true; scene.add(m); kit.hitMeshes.push(m); return m; };
  flat(70, 9, 0x3c3c38, 0, 0.5);                                                  // the road
  // centre dashes: one merged mesh
  { const g = []; for (let i = -8; i <= 8; i++) { const p = new THREE.PlaneGeometry(1.4, 0.15); p.rotateX(-Math.PI / 2); p.translate(i * 3.2, 0.02, 0.5); g.push(p); }
    const m = new THREE.Mesh(mergeFlat(g), mats.solid(0xb8b090)); m.receiveShadow = true; scene.add(m); }
  kit.box(70, 0.16, 2.6, 0x8a8880, 0, 0.08, -5.3, { cast: false });              // north sidewalk + kerb
  kit.box(70, 0.16, 2.2, 0x828078, 0, 0.08, 6.1, { cast: false });               // south sidewalk
  for (const [x, z, w, d] of [[-6, 9.5, 5, 3], [7, 10, 6, 4], [16, 8.6, 4, 2.5]]) flat(w, d, 0x6a6458, x, z, 0.015);   // dirt patches in the lot
  const rng = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(11);
  const brick = [0x7a5446, 0x6e4c40, 0x84604e, 0x705a4c], signs = [0x5a7a8a, 0x8a6a4a, 0x6a7a5a, 0x7a5a6a];
  function shopfront(i) { return (g) => {
    kit.mesh(new THREE.BoxGeometry(6, 3.5, 0.4), brick[i % 4], g, 0, 1.75, 0);
    kit.mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), 0x2a2622, g, -1.7, 1.05, 0.2);
    kit.mesh(new THREE.BoxGeometry(2.6, 1.4, 0.06), 0x1e2226, g, 1.0, 1.5, 0.21);
    for (let k = 0; k < 4; k++) kit.mesh(new THREE.BoxGeometry(2.8, 0.18, 0.05), 0x7a6a50, g, 1.0, 1.0 + k * 0.33, 0.25).rotation.z = (rng() - 0.5) * 0.12;
    kit.mesh(new THREE.BoxGeometry(5.2, 0.55, 0.12), signs[i % 4], g, 0, 2.95, 0.24);
    kit.mesh(new THREE.BoxGeometry(6.2, 0.2, 0.6), 0x5a5650, g, 0, 3.55, 0.05); }; }
  for (let i = 0; i < 5; i++) kit.prop("wall_shopfront.glb", shopfront(i), -12 + i * 6, 0, -AZ - 0.9, 0, 1, { occlude: true });
  function ruin(hgt) { return (g) => { const c = brick[(rng() * 4) | 0]; for (let k = 0; k < 4; k++) { const hh = hgt * (0.55 + rng() * 0.45); kit.mesh(new THREE.BoxGeometry(0.62, hh, 0.45), c, g, -0.93 + k * 0.62, hh / 2, 0); } }; }
  for (let i = 0; i < 6; i++) { if (i === 3) continue; const z = -AZ + 1 + i * 2.1; kit.prop("wall_chunk.glb", ruin(2.4), AX + 1.8, 0, z, Math.PI / 2, 1, { occlude: true }); }
  for (let i = 0; i < 6; i++) { if (i === 2 || i === 4) continue; const z = -AZ + 1 + i * 2.1; kit.prop("wall_chunk.glb", ruin(1.8), -AX - 2.4, 0, z, Math.PI / 2, 0.85, { occlude: true }); }
  function car(color) { return (g) => { kit.mesh(new THREE.BoxGeometry(3.8, 0.75, 1.7), color, g, 0, 0.62, 0); kit.mesh(new THREE.BoxGeometry(2.0, 0.6, 1.5), 0x2a2826, g, -0.2, 1.28, 0);
    for (const [x, z] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) kit.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8), 0x1a1a18, g, x, 0.3, z).rotation.x = Math.PI / 2; }; }
  kit.prop("car_wreck.glb", car(0x6a4a3a), -4.5, 0, -AZ - 0.2 + 1.9, 0.08, 1, { occlude: true, glbRot: Math.PI / 2 });       // nosed into the north kerb
  kit.prop("car_wreck.glb", car(0x4a5a64), 7.5, 0, AZ + 1.4, -0.3, 1, { occlude: true, glbRot: Math.PI / 2 });              // in the south lot
  kit.prop("car_wreck.glb", car(0x5a5a50), AX + 3.6, 0, 4.2, 1.3, 1, { occlude: true, glbRot: Math.PI / 2 });               // past the east walls
  function barrier(g) { kit.mesh(new THREE.BoxGeometry(2, 0.3, 0.6), 0xa8a49a, g, 0, 0.15, 0); kit.mesh(new THREE.BoxGeometry(2, 0.55, 0.28), 0xa8a49a, g, 0, 0.55, 0); }
  for (const [x, z, r] of [[-9.5, AZ + 0.6, 0.1], [-7.4, AZ + 0.8, -0.15], [3, -AZ + 0.9, 0.05], [12.5, -AZ + 1.1, 0.3], [-AX - 1, 4.4, 1.5]]) kit.prop("barrier.glb", barrier, x, 0, z, r, 1, { occlude: true });
  function crate(g) { kit.mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), 0x7a6444, g, 0, 0.4, 0); }
  for (const [x, z, r] of [[-9.5, -AZ + 0.6, 0.3], [-8.7, -AZ + 0.4, 0.9], [13.5, AZ + 1.2, 0.2], [1, AZ + 1.5, 0.6]]) kit.prop("crate.glb", crate, x, 0, z, r, 1, { occlude: true });
  function rubble(g) { for (let k = 0; k < 5; k++) kit.mesh(new THREE.BoxGeometry(0.3 + rng() * 0.4, 0.15 + rng() * 0.2, 0.3 + rng() * 0.3), brick[k % 4], g, (rng() - 0.5) * 1.2, 0.1, (rng() - 0.5) * 0.8).rotation.y = rng() * 3; }
  for (const [x, z] of [[AX + 0.6, -0.4], [-AX - 0.8, -2.6], [4, -AZ + 0.6], [-3, AZ + 1]]) kit.prop(null, rubble, x, 0, z, 0, 1, { phys: false, occlude: false });
  function lamp(g) { const p = kit.mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 6), 0x4a4c4e, g, 0, 2.25, 0); p.rotation.z = 0.12; kit.mesh(new THREE.BoxGeometry(0.9, 0.12, 0.25), 0x4a4c4e, g, 0.6, 4.4, 0); }
  kit.prop("streetlight.glb", lamp, -10.5, 0, -5.2, 0, 1, { occlude: false, hit: false, glbOff: [0, 0, 0.57] });
  return {
    S, map: (sx, sy) => new THREE.Vector3(sx * S - AX, 0, sy * S - AZ),
    toSim: (x, z) => ({ x: (x + AX) / S, y: (z + AZ) / S }),
    ground: () => ({ y: 0, n: UP }),
    hitMeshes: kit.hitMeshes, occluders: kit.occluders,
    camTarget: new THREE.Vector3(0, 0.3, 0.6), fitW: 2 * AX + 3, fitD: 2 * AZ + 2.5, minDist: 16,
    camBounds: (p) => Math.abs(p.x) < 40 && Math.abs(p.z) < 27 && p.z > -AZ - 0.4, physBounds: { cx: 0, cz: 0, half: 30 }
  };
}

// plain position / normal / uv concat of non-indexed-compatible plane geometries (no BufferGeometryUtils import needed)
function mergeFlat(list) {
  const pos = [], nor = [], uv = [], idx = []; let base = 0;
  for (const g of list) { const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx.push(ix[i] + base); base += p.count; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); out.setIndex(idx); return out;
}
