// Battle 3D demo 2: "Hollis Outskirts" (Megan / Vixie, Oct 3) [DRAFT]. Troops vs scavengers with guns on a wrecked street:
// overcast grey, cool flat light; wrecked cars, jersey barriers, crates, a shopfront wall + ruined walls for splatter. Cover
// is decoration only (the sim has no obstacles). 3v3 first, then 4v4 (the 3v3 / 4v4 button or ?size=4). Troops: pipe
// rifles + one shotgun; scavengers: a pipe rifle, a "sawn-off" shotgun, a pistol and one machete rusher. Everyone with a
// gun carries a machete backup they swap to when an enemy gets close.
import * as THREE from "three";
import { runDemo } from "../shared/3d/demo.js";
import { createWorldKit } from "../shared/3d/world.js";

const S = 0.55, AX = 20 * S, AZ = 12 * S;
const UP = new THREE.Vector3(0, 1, 0);
const TROOP_TINTS = [0x55604a, 0x4e5a48, 0x5a6450, 0x505848];
const SCAV_LOOKS = { rifle: { tint: 0x6a5440, hat: "bandana", hatColor: 0x7a3a2a }, shotgun: { tint: 0x4a4a52, hat: "hood", hatColor: 0x3a3a40 },
  pistol: { tint: 0x7a6a4a, hat: "bandana", hatColor: 0x3a4a5a }, machete: { tint: 0x5a3a30, hat: "hood", hatColor: 0x2a2a2a } };

// existing item ids (data/items.js): pipe_rifle, remingon_870 (the only shotgun: stands in for the sawn-off), glokk_17
// (pistol), rust_machete. [DRAFT] gear: troops purple ilvl 20 guns + white machetes, scavengers white ilvl 8 (with
// troops on the goats demo's green ilvl 10 kit the scavengers win ~90%: the pistol + shotgun shred them).
const W = (base, rarity, ilvl) => ({ base, rarity: rarity || "white", ilvl: ilvl || 10 });
const TROOPS = { 3: ["rifle", "rifle", "shotgun"], 4: ["rifle", "rifle", "rifle", "shotgun"] };
const SCAVS = { 3: ["rifle", "shotgun", "machete"], 4: ["rifle", "shotgun", "pistol", "machete"] };
const ITEM = { rifle: "pipe_rifle", shotgun: "remingon_870", pistol: "glokk_17" };
const fight = (n) => ({ family: "outlaws",
  allies: TROOPS[n].map((k, i) => ({ name: ["Rust", "Moss", "Grit", "Tally"][i], weapon: W(ITEM[k], "purple", 20), backup: W("rust_machete") })),
  enemies: SCAVS[n].map((k) => (k === "machete" ? { id: "brute" } : { id: "raider", weapon: W(ITEM[k], "white", 8), backup: W("rust_machete") })) });
window.__protoSpec = fight;   // the headless seed sweep reads it

function build(ctx) {
  const { scene, mats, phys, low } = ctx, kit = createWorldKit(ctx);
  // overcast: grey sky, cool flat light, faint shadows
  scene.background = new THREE.Color(0x8e959a); scene.fog = new THREE.Fog(0x8e959a, 36, 90);
  scene.add(new THREE.HemisphereLight(0xc8d2dc, 0x4a4a46, 1.7));
  const sun = new THREE.DirectionalLight(0xdde6ee, 0.75); sun.position.set(-6, 20, 8); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
  if (!low) { sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 16, bottom: -16, near: 1, far: 50 }); sun.shadow.bias = -0.0008; }
  // ground: asphalt street (x), cracked sidewalks, a rubble lot to the south
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), mats.solid(0x55554e)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); kit.hitMeshes.push(ground);
  phys.addFloor();
  const flat = (w, d, color, x, z, y) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mats.solid(color)); m.rotation.x = -Math.PI / 2; m.position.set(x, y || 0.01, z); m.receiveShadow = true; scene.add(m); kit.hitMeshes.push(m); return m; };
  flat(70, 9, 0x3c3c38, 0, 0.5);                                           // the road
  for (let i = -8; i <= 8; i++) flat(1.4, 0.15, 0xb8b090, i * 3.2, 0.5, 0.02);   // faded centre dashes
  kit.box(70, 0.16, 2.6, 0x8a8880, 0, 0.08, -5.3, { cast: false });         // north sidewalk + kerb
  kit.box(70, 0.16, 2.2, 0x828078, 0, 0.08, 6.1, { cast: false });          // south sidewalk
  for (const [x, z, w, d] of [[-6, 9.5, 5, 3], [7, 10, 6, 4], [16, 8.6, 4, 2.5]]) flat(w, d, 0x6a6458, x, z, 0.015);   // dirt patches in the lot
  const rng = ((a) => () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; })(11);
  // the shopfront row (north): brick, a door, a boarded window, a faded sign; blood lands on the flat fronts
  const brick = [0x7a5446, 0x6e4c40, 0x84604e, 0x705a4c], signs = [0x5a7a8a, 0x8a6a4a, 0x6a7a5a, 0x7a5a6a];
  function shopfront(i) { return (g) => {
    kit.mesh(new THREE.BoxGeometry(6, 3.5, 0.4), brick[i % 4], g, 0, 1.75, 0);
    kit.mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), 0x2a2622, g, -1.7, 1.05, 0.2);                     // door
    kit.mesh(new THREE.BoxGeometry(2.6, 1.4, 0.06), 0x1e2226, g, 1.0, 1.5, 0.21);                     // window
    for (let k = 0; k < 4; k++) kit.mesh(new THREE.BoxGeometry(2.8, 0.18, 0.05), 0x7a6a50, g, 1.0, 1.0 + k * 0.33, 0.25).rotation.z = (rng() - 0.5) * 0.12;   // boards
    kit.mesh(new THREE.BoxGeometry(5.2, 0.55, 0.12), signs[i % 4], g, 0, 2.95, 0.24);                // sign
    kit.mesh(new THREE.BoxGeometry(6.2, 0.2, 0.6), 0x5a5650, g, 0, 3.55, 0.05); }; }
  for (let i = 0; i < 5; i++) kit.prop("wall_shopfront.glb", shopfront(i), -12 + i * 6, 0, -AZ - 0.9, 0, 1, { occlude: true });
  // ruined walls east (behind the scavengers) and west (behind the troops)
  function ruin(hgt) { return (g) => { const c = brick[(rng() * 4) | 0]; for (let k = 0; k < 4; k++) { const hh = hgt * (0.55 + rng() * 0.45); kit.mesh(new THREE.BoxGeometry(0.62, hh, 0.45), c, g, -0.93 + k * 0.62, hh / 2, 0); } }; }
  for (let i = 0; i < 6; i++) { if (i === 3) continue; const z = -AZ + 1 + i * 2.1; kit.prop("wall_chunk.glb", ruin(2.4), AX + 1.8, 0, z, Math.PI / 2, 1, { occlude: true }); }
  for (let i = 0; i < 6; i++) { if (i === 2) continue; const z = -AZ + 1 + i * 2.1; kit.prop("wall_chunk.glb", ruin(1.8), -AX - 1.8, 0, z, Math.PI / 2, 1, { occlude: true }); }
  // wrecked cars, jersey barriers, crates, rubble: decoration only (the sim has no cover)
  function car(color) { return (g) => { kit.mesh(new THREE.BoxGeometry(3.8, 0.75, 1.7), color, g, 0, 0.62, 0); kit.mesh(new THREE.BoxGeometry(2.0, 0.6, 1.5), 0x2a2826, g, -0.2, 1.28, 0);
    for (const [x, z] of [[-1.2, -0.8], [1.2, -0.8], [-1.2, 0.8], [1.2, 0.8]]) kit.mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 8), 0x1a1a18, g, x, 0.3, z).rotation.x = Math.PI / 2; }; }
  kit.prop("car_wreck.glb", car(0x6a4a3a), -2.5, 0, -4.1, 0.12, 1, { occlude: true, glbRot: Math.PI / 2 });
  kit.prop("car_wreck.glb", car(0x4a5a64), 6.5, 0, 4.6, -0.35, 1, { occlude: true, glbRot: Math.PI / 2 });
  kit.prop("car_wreck.glb", car(0x5a5a50), 16, 0, -1.5, 1.3, 1, { occlude: true, glbRot: Math.PI / 2 });
  function barrier(g) { kit.mesh(new THREE.BoxGeometry(2, 0.3, 0.6), 0xa8a49a, g, 0, 0.15, 0); kit.mesh(new THREE.BoxGeometry(2, 0.55, 0.28), 0xa8a49a, g, 0, 0.55, 0); }
  for (const [x, z, r] of [[-7.5, 3.6, 0.1], [-5.5, 3.8, -0.15], [3, -3.9, 0.05], [9.5, -3.6, 0.3], [-13, -1, 1.5]]) kit.prop("barrier.glb", barrier, x, 0, z, r, 1, { occlude: true });
  function crate(g) { kit.mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), 0x7a6444, g, 0, 0.4, 0); }
  for (const [x, z, r] of [[-9.5, -4.4, 0.3], [-8.7, -4.6, 0.9], [11.5, 5.4, 0.2], [1, 5.7, 0.6]]) kit.prop("crate.glb", crate, x, 0, z, r, 1, { occlude: true });
  function rubble(g) { for (let k = 0; k < 5; k++) kit.mesh(new THREE.BoxGeometry(0.3 + rng() * 0.4, 0.15 + rng() * 0.2, 0.3 + rng() * 0.3), brick[k % 4], g, (rng() - 0.5) * 1.2, 0.1, (rng() - 0.5) * 0.8).rotation.y = rng() * 3; }
  for (const [x, z] of [[AX + 0.6, -0.4], [-AX - 0.6, -2.6], [4, -5.9], [-3, 7.5]]) kit.prop(null, rubble, x, 0, z, 0, 1, { phys: false, occlude: false });
  // a leaning streetlight
  function lamp(g) { const p = kit.mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.5, 6), 0x4a4c4e, g, 0, 2.25, 0); p.rotation.z = 0.12; kit.mesh(new THREE.BoxGeometry(0.9, 0.12, 0.25), 0x4a4c4e, g, 0.6, 4.4, 0); }
  kit.prop("streetlight.glb", lamp, -10.5, 0, -5.2, 0, 1, { occlude: false, hit: false, glbOff: [0, 0, 0.57] });   // Smudge's pole base sits at z -0.57 (the arm overhangs +z, over the road)
  return {
    map: (sx, sy) => new THREE.Vector3(sx * S - AX, 0, sy * S - AZ),
    ground: () => ({ y: 0, n: UP }),
    hitMeshes: kit.hitMeshes, occluders: kit.occluders,
    camTarget: new THREE.Vector3(0, 0.3, 0.6), fitW: 2 * AX + 3, fitD: 2 * AZ + 2.5, minDist: 16,
    camBounds: (p) => Math.abs(p.x) < 40 && Math.abs(p.z) < 27 && p.z > -AZ - 0.4, bounds: { x0: -30, x1: 30, z0: -20, z1: 20 }
  };
}

runDemo({
  sizes: [3, 4], defaultSeeds: { 3: 82, 4: 7 },   // sweep Oct 3: 3v3 troops win 74% (seed 82: 25 s, one loss, 2 swaps, a gore kill); 4v4 61% (seed 7: 18 s, 3 gore kills, 4 swaps)
  fight,
  look: (side, i, sp) => {
    if (side === 0) { const k = TROOPS[sp.allies.length][i]; return { glb: "grunt.glb", tint: TROOP_TINTS[i % 4], trousers: 0x3e403a, skin: 0xc8a07a, hat: "helmet", pack: true, main: k, backup: "machete" }; }
    const k = SCAVS[sp.enemies.length][i], L = SCAV_LOOKS[k];
    return { glb: "scavenger.glb", tint: L.tint, trousers: 0x3a3630, skin: 0xb8906a, hat: L.hat, hatColor: L.hatColor, pack: false, main: k === "machete" ? "machete" : k, backup: k === "machete" ? null : "machete" };
  },
  labels: { win: "Troops win", lose: "Scavengers win" },
  assets: ["grunt.glb", "scavenger.glb", "rifle.glb", "shotgun.glb", "pistol.glb", "machete.glb", "weapon_hatchet.glb", "car_wreck.glb", "barrier.glb", "crate.glb", "wall_chunk.glb", "wall_shopfront.glb", "streetlight.glb", "shell_casing.glb", "gib_01.glb", "gib_02.glb", "gib_03.glb", "gib_04.glb", "gib_05.glb"],
  physBounds: { cx: 0, cz: 0, half: 30 },
  build
});
