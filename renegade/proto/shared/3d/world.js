// Battle 3D prototypes (shared): world-building helpers for the demo scenes. A prop is Smudge's model when it's loaded
// (proto-3d-asset-contract.md), else a placeholder built from boxes; either way it can take decals (hit), block the kill
// camera (occlude) and collide with debris / ragdolls (a static box from its bounds).
import * as THREE from "three";

export function createWorldKit(ctx) {
  const { scene, mats, phys, assets } = ctx;
  const kit = { hitMeshes: [], occluders: [] };
  const reg = (o, opts) => { o.updateMatrixWorld(true); o.traverse((m) => { if (!m.isMesh || !m.visible) return; m.castShadow = opts.cast !== false && !ctx.low; m.receiveShadow = true;
    if (opts.hit !== false) kit.hitMeshes.push(m); if (opts.occlude) kit.occluders.push(m); }); };
  // a box mesh at (x, y, z) (center), optional rotY; a static physics box unless opts.phys === false
  kit.box = function (w, h, d, color, x, y, z, opts) {
    opts = opts || {}; const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.mat || mats.solid(color)); m.position.set(x, y, z); if (opts.rotY) m.rotation.y = opts.rotY;
    (opts.parent || scene).add(m); reg(m, opts); if (opts.phys !== false && !opts.parent) phys.addStaticBox(x, y, z, w / 2, h / 2, d / 2, opts.rotY || 0); return m;
  };
  // Smudge's model (by file name) or the fallback builder's group; placed on the ground at (x, y, z), turned rotY, scaled s
  kit.prop = function (file, fallback, x, y, z, rotY, s, opts) {
    opts = opts || {}; let o = file && assets.has(file) ? assets.clone(file) : null, glb = !!o;
    if (!o) { o = new THREE.Group(); fallback(o); } else if (opts.glbRot) rotY = (rotY || 0) + opts.glbRot;   // glbRot: the model's long axis differs from the placeholder's
    if (glb && opts.glbOff) { const off = new THREE.Vector3(...opts.glbOff).multiplyScalar(s || 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0); x += off.x; y += off.y; z += off.z; }   // glbOff: model-space offset (e.g. a pole base that isn't at the origin)
    o.position.set(x, y, z); o.rotation.y = rotY || 0; o.scale.setScalar(s || 1); scene.add(o); reg(o, opts);
    if (opts.phys !== false) {   // a turned static box from its unrotated bounds
      const r = rotY || 0; o.rotation.y = 0; o.updateMatrixWorld(true); const b0 = new THREE.Box3().setFromObject(o), s0 = b0.getSize(new THREE.Vector3()), c0 = b0.getCenter(new THREE.Vector3());
      o.rotation.y = r; o.updateMatrixWorld(true); const off = c0.clone().sub(o.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
      phys.addStaticBox(o.position.x + off.x, c0.y, o.position.z + off.z, s0.x / 2, s0.y / 2, s0.z / 2, r); }
    return o;
  };
  kit.mesh = function (geo, color, parent, x, y, z) { const m = new THREE.Mesh(geo, mats.solid(color)); m.position.set(x, y, z); parent.add(m); return m; };
  return kit;
}
