// Battle 3D prototypes (shared): decals (blood, bullet holes, pools), casings, gib chunks, tracers, muzzle flashes and blood puffs.
// Everything is pooled with a hard cap (oldest recycled), so replays can't leak: 64 decals, 48 casings, 24 chunks.
import * as THREE from "three";
import { GROUP } from "./physics.js";

export const CAPS = { decals: 64, casings: 48, chunks: 24, tracers: 8, sprites: 24 };
const UP = new THREE.Vector3(0, 1, 0);

// ground(x, z) -> { y, n }: the surface under a point (terrain height + normal) for trail drops; flat floor by default
// assets: Smudge's shell_casing.glb / gib_01..05.glb (proto-3d-asset-contract.md) replace the box placeholders when loaded
export function createFx(scene, phys, mats, tex, rng, ground, assets) {
  ground = ground || (() => ({ y: 0, n: UP }));
  const firstMesh = (f) => { const o = assets && assets.has(f) ? assets.clone(f) : null; let m = null; if (o) o.traverse((x) => { if (!m && x.isMesh) m = x; }); return m; };
  const casingModel = firstMesh("shell_casing.glb"), gibModels = ["gib_01.glb", "gib_02.glb", "gib_03.glb", "gib_04.glb", "gib_05.glb"].map(firstMesh).filter(Boolean);
  const fx = { counts: { decals: 0, casings: 0, chunks: 0, stamped: 0, ejected: 0, chunksSpawned: 0 } };
  // ---- decals: quads laid on a surface (polygonOffset, no DecalGeometry needed on boxes) --------------------------------
  const decals = [];
  const decalGeo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < CAPS.decals; i++) { const m = new THREE.Mesh(decalGeo, mats.decal(tex.blood[0])); m.visible = false; m.renderOrder = 2; m.receiveShadow = true; scene.add(m); decals.push({ mesh: m, grow: null }); }
  let dHead = 0;
  // point + normal (world). size in m. map: a texture. grow: seconds to grow to full size (pools)
  fx.stamp = function (point, normal, size, map, grow) {
    const d = decals[dHead]; dHead = (dHead + 1) % CAPS.decals; const m = d.mesh;
    if (m.material.map !== map) { m.material.map = map; m.material.needsUpdate = true; }
    m.position.copy(point).addScaledVector(normal, 0.004 + rng() * 0.004);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal); m.rotateZ(rng() * Math.PI * 2);
    d.size = size; d.grow = grow ? { t: 0, dur: grow } : null; m.scale.setScalar(grow ? size * 0.15 : size); m.visible = true;
    fx.counts.stamped++; fx.counts.decals = Math.min(CAPS.decals, fx.counts.decals + 1);
    return m;
  };
  // ---- casings: one InstancedMesh, a physics body each, recycled oldest-first ------------------------------------------
  // Smudge's casing is real size (9 x 35 mm): drawn 2.8x so it reads at half res, with a physics box that fits it
  const CS = casingModel ? 2.8 : 1, cHalf = { x: 0.0175, y: 0.0175, z: 0.045 };
  if (casingModel) { const bb = new THREE.Box3().setFromBufferAttribute(casingModel.geometry.attributes.position), sz = bb.getSize(new THREE.Vector3());
    cHalf.x = Math.max(0.004, sz.x * CS / 2); cHalf.y = Math.max(0.004, sz.y * CS / 2); cHalf.z = Math.max(0.01, sz.z * CS / 2); }
  const casingMesh = new THREE.InstancedMesh(casingModel ? casingModel.geometry : new THREE.BoxGeometry(0.035, 0.035, 0.09), casingModel ? casingModel.material : mats.brass(), CAPS.casings);
  casingMesh.castShadow = false; casingMesh.count = 0; casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(casingMesh);
  const casings = []; let cHead = 0; const _m = new THREE.Matrix4(), _one = new THREE.Vector3(CS, CS, CS);
  fx.eject = function (pos, right, sfx) {
    let c = casings[cHead]; if (c) phys.removeBody(c.body);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, rng() * 3));
    const body = phys.addBox(cHalf.x, cHalf.y, cHalf.z, 0.02, pos, q, { brass: true, damping: 0.02, angDamping: 0.05, sleepSpeed: 0.05 });
    body.velocity.set(right.x * (1.6 + rng()) , 1.8 + rng() * 1.2, right.z * (1.6 + rng()));
    body.angularVelocity.set((rng() - 0.5) * 30, (rng() - 0.5) * 30, (rng() - 0.5) * 30);
    casings[cHead] = c = { body, bounced: 0 }; cHead = (cHead + 1) % CAPS.casings;
    casingMesh.count = Math.max(casingMesh.count, casings.filter(Boolean).length); fx.counts.casings = casingMesh.count; fx.counts.ejected++;
    body.addEventListener("collide", () => { if (c.bounced++ < 2 && sfx) sfx(); });
  };
  // ---- gib chunks -----------------------------------------------------------------------------------------------------
  const chunkGeo = new THREE.BoxGeometry(1, 1, 1), chunks = []; let kHead = 0;
  for (let i = 0; i < CAPS.chunks; i++) { const gm = gibModels.length ? gibModels[i % gibModels.length] : null;
    const m = new THREE.Mesh(gm ? gm.geometry : chunkGeo, gm ? gm.material : mats.solid(0x7a1a14)); m.visible = false; m.castShadow = true; scene.add(m); chunks.push({ mesh: m, body: null, trail: 0, model: !!gm }); }
  fx.chunks = function (pos, dir, n) {
    for (let i = 0; i < n; i++) {
      const c = chunks[kHead]; kHead = (kHead + 1) % CAPS.chunks; if (c.body) phys.removeBody(c.body);
      const s = 0.07 + rng() * 0.08; if (c.model) c.mesh.scale.setScalar(1); else c.mesh.scale.set(s * 2, s * 1.6, s * 2); c.mesh.visible = true;
      const p = new THREE.Vector3(pos.x + (rng() - 0.5) * 0.3, pos.y + rng() * 0.4, pos.z + (rng() - 0.5) * 0.3);
      c.body = phys.addBox(s, s * 0.8, s, 0.3, p, null, { damping: 0.1, angDamping: 0.2 });
      c.body.velocity.set(dir.x * (2 + rng() * 2) + (rng() - 0.5) * 2.5, 2.5 + rng() * 2.5, dir.z * (2 + rng() * 2) + (rng() - 0.5) * 2.5);
      c.body.angularVelocity.set((rng() - 0.5) * 12, (rng() - 0.5) * 12, (rng() - 0.5) * 12); c.trail = 1.2;
      fx.counts.chunksSpawned++;
    }
    fx.counts.chunks = chunks.filter((c) => c.body).length;
  };
  // ---- tracers, flashes, puffs, sparks (pooled, short-lived) ------------------------------------------------------------
  const tracers = []; for (let i = 0; i < CAPS.tracers; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.025, 0.025), mats.glow(0xffe08a)); m.visible = false; scene.add(m); tracers.push({ mesh: m, t: 0 }); }
  let tHead = 0;
  fx.tracer = function (a, b) { const t = tracers[tHead]; tHead = (tHead + 1) % CAPS.tracers; const m = t.mesh, d = b.clone().sub(a), L = d.length();
    m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(L, 1, 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.normalize()); m.visible = true; t.t = 0.07; };
  const sprites = []; for (let i = 0; i < CAPS.sprites; i++) { const s = new THREE.Sprite(mats.sprite(tex.glow)); s.visible = false; scene.add(s); sprites.push({ s, t: 0, life: 0, v: new THREE.Vector3(), grow: 0 }); }
  let sHead = 0;
  function sprite(pos, color, size, life, vel, grow, map) { const p = sprites[sHead]; sHead = (sHead + 1) % CAPS.sprites;
    p.s.material.color.setHex(color); if (p.s.material.map !== map) { p.s.material.map = map; p.s.material.needsUpdate = true; }
    p.s.position.copy(pos); p.s.scale.setScalar(size); p.s.visible = true; p.s.material.opacity = 1; p.t = 0; p.life = life; p.size = size; p.grow = grow || 0; p.v.copy(vel || new THREE.Vector3()); }
  fx.flash = (pos) => sprite(pos, 0xffd27a, 0.55, 0.06, null, 0, tex.glow);
  fx.spark = (pos) => sprite(pos, 0xfff0a0, 0.25, 0.09, null, 0, tex.glow);
  fx.puff = function (pos, dir, big) { const n = big ? 6 : 3; for (let i = 0; i < n; i++) sprite(pos, 0x9a1a12, (big ? 0.32 : 0.22) * (0.7 + rng() * 0.6), 0.28 + rng() * 0.15,
    new THREE.Vector3(dir.x * (1 + rng() * 2) + (rng() - 0.5), 0.5 + rng(), dir.z * (1 + rng() * 2) + (rng() - 0.5)), 0.6, tex.puff); };
  fx.dust = (pos) => { for (let i = 0; i < 2; i++) sprite(pos, 0xb0a890, 0.18, 0.35, new THREE.Vector3((rng() - 0.5) * 0.6, 0.6, (rng() - 0.5) * 0.6), 1.2, tex.puff); };

  // ---- per-frame --------------------------------------------------------------------------------------------------------
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  fx.update = function (dt, simDt) {
    for (let i = 0; i < casings.length; i++) { const c = casings[i]; if (!c) continue; const b = c.body;
      _p.set(b.position.x, b.position.y, b.position.z); _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w); _m.compose(_p, _q, _one); casingMesh.setMatrixAt(i, _m); }
    casingMesh.instanceMatrix.needsUpdate = true;
    for (const c of chunks) if (c.body) { phys.sync(c.body, c.mesh);
      if (c.trail > 0 && simDt > 0) { c.trail -= simDt; const g = ground(c.body.position.x, c.body.position.z);
        if (rng() < simDt * 9 && c.body.position.y < g.y + 0.6) fx.stamp(new THREE.Vector3(c.body.position.x, g.y + 0.002, c.body.position.z), g.n, 0.12 + rng() * 0.1, tex.blood[(rng() * 3) | 0]); } }
    for (const t of tracers) if (t.mesh.visible) { t.t -= dt; if (t.t <= 0) t.mesh.visible = false; }
    for (const p of sprites) if (p.s.visible) { p.t += dt; const a = p.t / p.life; if (a >= 1) { p.s.visible = false; continue; }
      p.s.position.addScaledVector(p.v, dt); p.v.y -= 2.5 * dt; p.s.material.opacity = 1 - a; p.s.scale.setScalar(p.size * (1 + p.grow * a)); }
    for (const d of decals) if (d.grow) { d.grow.t += simDt; const a = Math.min(1, d.grow.t / d.grow.dur); d.mesh.scale.setScalar(d.size * (0.15 + 0.85 * (1 - (1 - a) * (1 - a)))); if (a >= 1) d.grow = null; }
  };
  fx.clear = function () {
    for (const d of decals) { d.mesh.visible = false; d.grow = null; } dHead = 0;
    for (let i = 0; i < casings.length; i++) if (casings[i]) phys.removeBody(casings[i].body); casings.length = 0; cHead = 0; casingMesh.count = 0;
    for (const c of chunks) { if (c.body) phys.removeBody(c.body); c.body = null; c.mesh.visible = false; } kHead = 0;
    for (const t of tracers) t.mesh.visible = false; for (const p of sprites) p.s.visible = false;
    Object.assign(fx.counts, { decals: 0, casings: 0, chunks: 0, stamped: 0, ejected: 0, chunksSpawned: 0 });
  };
  fx.live = () => ({ decals: decals.filter((d) => d.mesh.visible).length, casings: casingMesh.count, chunks: chunks.filter((c) => c.body).length,
    sprites: sprites.filter((p) => p.s.visible).length, objects: scene.children.length });
  return fx;
}
