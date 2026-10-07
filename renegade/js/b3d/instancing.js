// SP-100 m3 step 2: units drawn as InstancedMesh batches of Smudge's shared part meshes (assets/3d/parts_shared/README.md).
// The figures are still built, posed, animated and ragdolled exactly as before (figures.js); a unit on the instanced path
// only moves its own meshes to layer 1 (the camera and the shadow pass draw layer 0; raycasts that enable every layer,
// the kill cam's occlusion test, still hit the real meshes) and each frame its rows write the part nodes' matrixWorld into
// one InstancedMesh per part id. A row is skipped while its node or any ancestor is invisible (hidden placement, the
// fled fade, slung off-hand / shield, hidden hair), exactly as the renderer would skip it.
// Clone path (no rows, own meshes on layer 0): a placeholder figure, anything missing from the parts manifest, gear that
// doesn't fit the unit, and a see-through figure (setOpacity < 1 or ghost: unseen, rival, retreating, the fled fade).
// Ragdolls stay instanced: ragdoll() re-parents the part proxies to the scene and the rows follow them.
import * as THREE from "three";
import { SELF_LIT } from "./figures.js";

// Smudge fdd44a8 (parts_shared/README.md): the smaller KHR_mesh_quantization twin. Positions and COLOR_0 stay float32
// (bit-identical to parts_library.glb), only normals (SHORT), _TINT (UNSIGNED_BYTE) and indices (uint16) are packed;
// the part nodes carry identity transforms, so batch() folding the node's matrixWorld into s.local is a no-op here.
// The tables come from parts_shared/manifest_q.json (the main manifest's parts_shared.manifest).
export const LIB_FILE = "parts_shared/parts_library_q.glb";
const TINT_MIX = 0.45;   // tintMaterials: color.lerp(tint, 0.45) on the "tint" material = _tint faces

export function createUnitBatches(scene, assets, lib, low) {
  const out = { enabled: false, handles: [], batches: new Map(), forcedOff: false, stats: { rows: 0, instances: 0 } };
  const root = lib && assets.has(LIB_FILE) ? assets.clone(LIB_FILE) : null;
  if (!root) { out.add = () => null; out.sync = () => {}; out.update = () => scene.updateMatrixWorld(); out.set = () => false; out.dispose = () => {}; out.why = lib ? "no " + LIB_FILE : "no parts manifest"; return out; }
  out.enabled = true; root.updateMatrixWorld(true);
  const byFile = (tab) => { const m = new Map(); for (const k in tab || {}) { const e = tab[k]; if (e && e.file) m.set(e.file, Object.assign({ key: k }, e)); } return m; };
  const units = byFile(lib.units), gear = byFile(lib.gear), weapons = byFile(lib.weapons), shields = byFile(lib.shields);
  const tinted = new Map();   // source material -> its squadTint variant (vertex-colour parts)
  const tintMat = (m) => { if (!m || !m.vertexColors || SELF_LIT(m)) return m; if (tinted.has(m)) return tinted.get(m);
    const t = m.clone(); t.name = m.name;
    t.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float _tint;\nattribute vec4 squadTint;")
      .replace("#include <color_vertex>", "#include <color_vertex>\n\tvColor.rgb = mix( vColor.rgb, squadTint.rgb, squadTint.a * _tint );"); };
    t.customProgramCacheKey = () => "squadTint"; tinted.set(m, t); return t; };
  // one batch per part id (and per primitive if a part ever has more than one), made on first use, grown by doubling
  function batch(id) {
    if (out.batches.has(id)) return out.batches.get(id);
    const node = root.getObjectByName(id); let subs = null;
    if (node) { subs = []; node.traverse((o) => { if (o.isMesh) subs.push({ src: o, local: o.matrixWorld.clone() }); }); if (!subs.length) subs = null; }
    const b = subs ? { id, subs, cap: 0, n: 0 } : null; out.batches.set(id, b);
    if (b) for (const s of subs) s.mat = Array.isArray(s.src.material) ? s.src.material.map(tintMat) : tintMat(s.src.material);
    return b;
  }
  function grow(b, need) {
    let cap = Math.max(16, b.cap); while (cap < need) cap *= 2; if (cap === b.cap) return;
    for (const s of b.subs) {
      const g = new THREE.BufferGeometry(), src = s.src.geometry;   // shares the library's vertex buffers; only squadTint is per batch
      for (const k in src.attributes) g.setAttribute(k, src.attributes[k]); if (src.index) g.setIndex(src.index);
      for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      const tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); tint.setUsage(THREE.DynamicDrawUsage); g.setAttribute("squadTint", tint);
      const m = new THREE.InstancedMesh(g, s.mat, cap); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.count = 0;
      m.frustumCulled = false; m.castShadow = !low; m.receiveShadow = true; m.name = "unit:" + b.id; m.userData.unitBatch = b.id; m.matrixAutoUpdate = false;
      if (s.mesh) { m.instanceMatrix.array.set(s.mesh.instanceMatrix.array); tint.array.set(s.tint.array); scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.dispose(); }
      s.mesh = m; s.tint = tint; scene.add(m);
    }
    b.cap = cap;
  }
  // glb node by name: fromGlb's proxy Group carries the part's name too; the real node is the proxy's child of that name
  const glbNode = (fig, n) => { const p = fig.userData.parts && fig.userData.parts[n]; if (p) { const c = p.children.find((x) => x.name === n); if (c) return c; }
    let r = null; fig.traverse((o) => { if (!r && o.name === n && !o.userData.half) r = o; }); return r; };
  // the rows of one figure, or a reason it stays on the clone path
  function plan(fig) {
    const U = fig.userData; if (!U.glb) return "placeholder";
    const ue = units.get(U.file); if (!ue) return "unit not in parts manifest: " + U.file;
    const rows = [];
    for (const r of ue.parts) rows.push({ part: r.part, obj: glbNode(fig, r.node), node: r.node });
    for (const g of U.gear || []) { const ge = gear.get(g.file); if (!ge) return "gear not in parts manifest: " + g.file;
      if (ge.fits_units && !ge.fits_units.includes(ue.key)) return "gear " + g.file + " doesn't fit " + ue.key;
      for (const r of ge.parts) rows.push({ part: r.part, obj: glbNode(fig, r.attach_to_node), node: r.attach_to_node }); }
    for (const w of [U.main, U.backup, U.off, U.shield]) { if (!w) continue;
      const f = w.userData.file, e = f && (w.userData.kind === "shield" ? shields : weapons).get(f); if (!e) return "weapon/shield not in parts manifest: " + (f || "placeholder");
      for (const r of e.parts) rows.push({ part: r.part, obj: w.children[0], node: w.name }); }
    for (const r of rows) { if (!r.obj) return "node not found: " + r.node; if (!batch(r.part)) return "part not in library: " + r.part; }
    return rows;
  }
  const _t = new THREE.Color();
  out.add = function (fig) {
    const p = plan(fig), meshes = []; fig.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const h = { fig, rows: Array.isArray(p) ? p : null, why: Array.isArray(p) ? null : p, meshes, on: false, want: true, tint: [0, 0, 0, 0] };
    if (fig.userData.tint != null) { _t.set(fig.userData.tint); h.tint = [_t.r, _t.g, _t.b, TINT_MIX]; }
    out.handles.push(h); apply(h); return h;
  };
  function apply(h) { const on = !!h.rows && h.want && !out.forcedOff; if (on === h.on) return; h.on = on; for (const m of h.meshes) m.layers.set(on ? 1 : 0); }
  // see-through figures go back to their own (transparent) materials
  out.sync = function (h) { if (!h) return; const U = h.fig.userData; h.want = !(U.opacity != null && (U.opacity < 1 || U.ghost)); apply(h); };
  out.set = function (on) { out.forcedOff = !on; for (const h of out.handles) apply(h); out.update(); return on; };
  const shown = (o) => { for (; o; o = o.parent) { if (!o.visible) return false; if (o === scene) return true; } return false; };
  const _m = new THREE.Matrix4();
  out.update = function () {
    scene.updateMatrixWorld();
    for (const b of out.batches.values()) if (b) b.n = 0;
    let rows = 0;
    for (const h of out.handles) { if (!h.on) continue;
      for (const r of h.rows) { if (!shown(r.obj)) continue; const b = out.batches.get(r.part); if (b.n >= b.cap) grow(b, b.n + 1); const i = b.n++; rows++;
        for (const s of b.subs) { _m.multiplyMatrices(r.obj.matrixWorld, s.local); s.mesh.setMatrixAt(i, _m); s.tint.array.set(h.tint, i * 4); } } }
    let inst = 0;
    for (const b of out.batches.values()) if (b && b.subs[0].mesh) { for (const s of b.subs) { s.mesh.count = b.n; s.mesh.visible = b.n > 0; if (b.n) { s.mesh.instanceMatrix.needsUpdate = true; s.tint.needsUpdate = true; } } inst += b.n; }
    out.stats.rows = rows; out.stats.instances = inst;
  };
  out.state = () => ({ enabled: out.enabled, on: !out.forcedOff, instanced: out.handles.filter((h) => h.on).length, clone: out.handles.filter((h) => !h.on).map((h) => h.why || "see-through"),
    batches: [...out.batches.values()].filter((b) => b && b.cap).length, instances: out.stats.instances });
  out.dispose = function () { for (const b of out.batches.values()) if (b) for (const s of b.subs) if (s.mesh) { scene.remove(s.mesh); s.mesh.geometry.dispose(); s.mesh.dispose(); } out.batches.clear();
    for (const m of tinted.values()) m.dispose(); tinted.clear(); };
  return out;
}
