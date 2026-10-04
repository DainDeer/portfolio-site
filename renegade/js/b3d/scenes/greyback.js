// SP-100 3D battles: the Greyback Hills (from the proto battle3d_goats scene, Megan / Vixie Oct 3): outdoors at golden hour,
// a low warm sun, long shadows, rolling grass, rocks, a broken dry-stone wall + a wooden fence for vertical splatter.
// Decoration only: the sim has no cover, so nothing here touches an outcome.
import * as THREE from "three";
import { createWorldKit } from "../world.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const S = 0.55;                    // sim metres -> world metres (the 40 x 24 m sim arena -> 22 x 13.2 m on the hillside)
const AX = 20 * S, AZ = 12 * S;           // arena half-extents; world (0, 0) = the arena centre
export const FILES = ["rock_small.glb", "rock_large.glb", "fence_wood.glb", "wall_drystone.glb", "grass_tuft.glb", "tree_lone.glb"];

function h(x, z) {   // rolling hills: almost flat where the fight is, rising into hills around it
  const roll = 0.28 * Math.sin(x * 0.33 + 0.6) * Math.cos(z * 0.41) + 0.14 * Math.sin(x * 0.8 + z * 0.55) + 0.08 * Math.cos(z * 1.1 - x * 0.3);
  const ex = Math.max(0, Math.abs(x) - AX - 1.5) / 14, ez = Math.max(0, Math.abs(z) - AZ - 1.5) / 10, e = Math.min(1, Math.hypot(ex, ez));
  const rise = e * e * (3 - 2 * e) * (3.2 + 1.6 * Math.sin(x * 0.12 + 1) + 1.2 * Math.cos(z * 0.2));
  return roll + rise;
}
function normalAt(x, z) { const e = 0.25; return new THREE.Vector3(h(x - e, z) - h(x + e, z), 2 * e, h(x, z - e) - h(x, z + e)).normalize(); }
function bladeTuft() {
  const blades = [0, 2.1, 4.2].map((a, i) => { const g = new THREE.ConeGeometry(0.035, 0.3 + i * 0.05, 3); g.translate(0, 0.16 + i * 0.025, 0); g.rotateZ(0.35); g.rotateY(a); return g; });
  return mergeGeometries(blades);
}
export function build(ctx) {
  const { scene, mats, phys, low } = ctx, kit = createWorldKit(ctx);
  scene.background = new THREE.Color(0xd9ab7c); scene.fog = new THREE.Fog(0xd6a878, 38, 95);
  scene.add(new THREE.HemisphereLight(0xf0d4a8, 0x3e4a2a, low ? 1.05 : 0.85));
  const sun = new THREE.DirectionalLight(0xffb468, 2.5); sun.position.set(-26, 8.5, 9); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 70 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; }
  const geo = new THREE.PlaneGeometry(90, 60, 90, 60); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [], c = new THREE.Color(), dryC = new THREE.Color(0x9a9a4e);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = h(x, z); pos.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - x * 0.4), dry = Math.min(1, Math.max(0, y * 0.18 + n * 0.5));
    c.setHex(0x5a7a34).lerp(dryC, dry * 0.55); col.push(c.r, c.g, c.b); }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, mats.shade({ color: 0xffffff, vertexColors: true })); terrain.receiveShadow = true; scene.add(terrain);
  kit.hitMeshes.push(terrain); kit.occluders.push(terrain);
  phys.addHeightfield(h, -24, -16, 48, 32, 1);
  const rng = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(7);
  const stoneCols = [0x8a8474, 0x7a7466, 0x948c7a, 0x6e6a5e];
  function drystone(g) { for (let i = 0; i < 9; i++) { const w = 0.35 + rng() * 0.35, hh = 0.22 + rng() * 0.12, row = Math.floor(i / 3);
      kit.mesh(new THREE.BoxGeometry(w, hh, 0.5 + rng() * 0.15), stoneCols[(rng() * 4) | 0], g, -0.75 + (i % 3) * 0.7 + (rng() - 0.5) * 0.15, hh / 2 + row * 0.27, (rng() - 0.5) * 0.08).rotation.y = (rng() - 0.5) * 0.15; } }
  const wallRun = (x0, z0, dx, dz, n, skip) => { for (let i = 0; i < n; i++) { if (skip.includes(i)) continue; const x = x0 + dx * i * 2, z = z0 + dz * i * 2;
    kit.prop("wall_drystone.glb", drystone, x, h(x, z) - 0.05, z, dz ? Math.PI / 2 : 0, 1, { occlude: true }); } };
  wallRun(-10, -AZ - 1.4, 1, 0, 11, [3, 7]);
  wallRun(AX + 1.6, -AZ + 0.4, 0, 1, 5, [3]);
  for (let i = 0; i < 6; i++) { const x = -6 + i * 1.3 + rng(), z = -AZ - 0.6 + rng() * 0.5;
    kit.box(0.3 + rng() * 0.2, 0.2, 0.3, stoneCols[i % 4], x + (i > 2 ? 8 : 0), h(x, z) + 0.08, z, { rotY: rng() * 3, cast: true }); }
  function fence(g) { for (const px of [-1, 1]) kit.mesh(new THREE.BoxGeometry(0.12, 1.15, 0.12), 0x6a5a44, g, px, 0.57, 0);
    kit.mesh(new THREE.BoxGeometry(2.1, 0.09, 0.05), 0x7a6a50, g, 0, 0.9, 0.06); kit.mesh(new THREE.BoxGeometry(2.1, 0.09, 0.05), 0x7a6a50, g, 0, 0.5, 0.06); }
  for (let i = 0; i < 6; i++) { const x = -AX - 2.2, z = -AZ + 1 + i * 2; kit.prop("fence_wood.glb", fence, x, h(x, z), z, Math.PI / 2, 1, { occlude: false }); }
  function rock(big) { return (g) => { const m = kit.mesh(new THREE.DodecahedronGeometry(big ? 0.7 : 0.3, 0), 0x7a766a, g, 0, big ? 0.35 : 0.15, 0); m.scale.set(1.2, 0.7, 1); }; }
  for (const [x, z, big] of [[-8, 7.4, 1], [-3, 7.6, 0], [4, 7.8, 1], [9.5, 7.2, 0], [13.2, 5.6, 1], [-12.8, -7.2, 0], [1.5, -7.3, 0], [6.5, -7.4, 1], [-5.5, -7.2, 0], [13.6, -3.5, 0], [-13.4, 3.5, 1], [10.5, -8.2, 0]]) {
    const s = 0.8 + rng() * 0.6; kit.prop(big ? "rock_large.glb" : "rock_small.glb", rock(big), x, h(x, z) - 0.05, z, rng() * 6.28, s, { occlude: !!big }); }
  function tree(g) { kit.mesh(new THREE.CylinderGeometry(0.16, 0.26, 3.2, 6), 0x5a4632, g, 0, 1.6, 0);
    for (const [x, y, z, r] of [[0, 3.6, 0, 1.4], [0.8, 3.2, 0.4, 1.0], [-0.7, 3.3, -0.3, 1.1], [0.2, 4.3, -0.2, 0.9]]) kit.mesh(new THREE.IcosahedronGeometry(r, 0), 0x5a6a32, g, x, y, z); }
  kit.prop("tree_lone.glb", tree, 15, h(15, -11), -11, 0.4, 1.1, { occlude: true, hit: false });
  const tuftN = low ? 220 : 480, tuftFile = ctx.assets.has("grass_tuft.glb") ? ctx.assets.clone("grass_tuft.glb").getObjectByProperty("isMesh", true) : null;
  const tuft = new THREE.InstancedMesh(tuftFile ? tuftFile.geometry : bladeTuft(), tuftFile ? tuftFile.material : mats.solid(0xffffff), tuftN);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < tuftN; i++) { const x = (rng() - 0.5) * 50, z = (rng() - 0.5) * 34, s = 0.7 + rng() * 0.9; e.set((rng() - 0.5) * 0.5, rng() * 6.28, (rng() - 0.5) * 0.5); q.setFromEuler(e);
    m4.compose(new THREE.Vector3(x, h(x, z), z), q, new THREE.Vector3(s, s, s)); tuft.setMatrixAt(i, m4); tuft.setColorAt(i, tuftFile ? new THREE.Color().setScalar(0.9 + rng() * 0.1) : new THREE.Color().setHSL(0.2 + rng() * 0.06, 0.38, 0.34 + rng() * 0.12)); }
  tuft.receiveShadow = true; scene.add(tuft);
  return {
    S, terrain,
    map: (sx, sy) => { const x = sx * S - AX, z = sy * S - AZ; return new THREE.Vector3(x, h(x, z), z); },
    toSim: (x, z) => ({ x: (x + AX) / S, y: (z + AZ) / S }),
    ground: (x, z) => ({ y: h(x, z), n: normalAt(x, z) }),
    hitMeshes: kit.hitMeshes, occluders: kit.occluders,
    camTarget: new THREE.Vector3(0, 0.3, 0.4), fitW: 2 * AX + 2.2, fitD: 2 * AZ + 2.5, minDist: 16,
    camBounds: (p) => Math.abs(p.x) < 40 && Math.abs(p.z) < 27, physBounds: { cx: 0, cz: 0, half: 30 }
  };
}
