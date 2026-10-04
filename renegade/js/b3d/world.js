// SP-100 3D battles: world-building helpers for the zone scenes (ported from proto/shared/3d/world.js). A prop is Smudge's model when it's loaded
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
    o.position.set(x, y, z); o.rotation.y = rotY || 0; o.scale.setScalar(s || 1); o.userData.prop = glb ? file : "placeholder:" + (file || "-"); scene.add(o); reg(o, opts);
    if (opts.phys !== false) {   // a turned static box from its unrotated bounds
      const r = rotY || 0; o.rotation.y = 0; o.updateMatrixWorld(true); const b0 = new THREE.Box3().setFromObject(o), s0 = b0.getSize(new THREE.Vector3()), c0 = b0.getCenter(new THREE.Vector3());
      o.rotation.y = r; o.updateMatrixWorld(true); const off = c0.clone().sub(o.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), r);
      phys.addStaticBox(o.position.x + off.x, c0.y, o.position.z + off.z, s0.x / 2, s0.y / 2, s0.z / 2, r); }
    return o;
  };
  // decoration in bulk (ferns, reeds, shrubs, tufts): ONE draw call for all of them. Smudge's model's mesh when loaded,
  // else fallbackGeo in fallbackColor. pts: [{ x, y, z, rot, s, tilt }]. No physics, no decals, never blocks the camera.
  kit.scatter = function (file, fallbackGeo, fallbackColor, pts, opts) {
    opts = opts || {}; let src = null;
    if (file && assets.has(file)) { const root = assets.clone(file); root.updateMatrixWorld(true); const m = root.getObjectByProperty("isMesh", true);
      if (m) src = { geometry: m.geometry.clone().applyMatrix4(m.matrixWorld), material: m.material }; }   // bake the node transform into a private copy
    const im = new THREE.InstancedMesh(src ? src.geometry : fallbackGeo, src ? src.material : mats.solid(fallbackColor), Math.max(1, pts.length));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
    pts.forEach((p, i) => { e.set(p.tilt || 0, p.rot || 0, (p.tilt || 0) * 0.6); q.setFromEuler(e); const sc = p.s || 1;
      m4.compose(new THREE.Vector3(p.x, p.y || 0, p.z), q, new THREE.Vector3(sc, sc, sc)); im.setMatrixAt(i, m4);
      if (opts.shade) im.setColorAt(i, c.setScalar(1 - opts.shade * (p.k != null ? p.k : 0.5))); });
    im.count = pts.length; im.castShadow = !ctx.low && opts.cast !== false; im.receiveShadow = true; im.userData.scatter = file || "fallback"; scene.add(im); return im;
  };
  // a vertex-coloured ground (w x d at the origin, seg m per quad) following h(x, z); color(x, z, y, c) paints c
  kit.terrain = function (w, d, seg, h, color) {
    const geo = new THREE.PlaneGeometry(w, d, Math.round(w / seg), Math.round(d / seg)); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, col = [], c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), y = h(x, z); pos.setY(i, y); color(x, z, y, c); col.push(c.r, c.g, c.b); }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mats.shade({ color: 0xffffff, vertexColors: true })); m.receiveShadow = true; m.userData.terrain = true; scene.add(m);
    kit.hitMeshes.push(m); kit.occluders.push(m); return m;
  };
  kit.mesh = function (geo, color, parent, x, y, z) { const m = new THREE.Mesh(geo, mats.solid(color)); m.position.set(x, y, z); parent.add(m); return m; };
  return kit;
}
