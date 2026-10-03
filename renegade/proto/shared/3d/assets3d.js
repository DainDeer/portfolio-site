// Battle 3D prototypes (shared): Smudge's models (proto-3d-asset-contract.md). Only files listed in
// proto/assets3d/manifest.json are requested (no 404 noise); anything missing, broken or off-contract stays a placeholder.
// ?assets=none forces every placeholder; ?assets=all tries every name without the manifest.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const BUDGET = { unit: 1200, weapon: 250, prop: 300, big: 1500, tuft: 60, casing: 24, gib: 80 };   // tris (contract §5)

export async function loadAssets3d(root, names, mats, mode) {
  const t0 = performance.now(), A = { models: {}, report: [], ms: 0 };
  let listed = [];
  if (mode === "all") listed = names.slice();
  else if (mode !== "none") {
    try { const r = await fetch(root + "manifest.json", { cache: "no-cache" }); if (r.ok) { const j = await r.json(); listed = Array.isArray(j.files) ? j.files : []; } }
    catch (e) { listed = []; }
  }
  const loader = new GLTFLoader(), shaded = new Map();
  await Promise.all(names.map(async (n) => {
    if (!listed.includes(n)) { A.report.push({ name: n, status: "placeholder", why: mode === "none" ? "?assets=none" : "not in manifest" }); return; }
    try {
      const g = await loader.loadAsync(root + n); let tris = 0;
      g.scene.traverse((o) => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
        const geo = o.geometry; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        const swap = (m) => { if (!shaded.has(m)) shaded.set(m, mats.fromGltf(m)); return shaded.get(m); };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material); });
      A.models[n] = g.scene; A.report.push({ name: n, status: "loaded", tris: Math.round(tris) });
    } catch (e) { A.report.push({ name: n, status: "placeholder", why: "load failed: " + (e && e.message ? e.message : e) }); console.info("[assets3d] " + n + ": " + e); }
  }));
  A.report.sort((a, b) => a.name.localeCompare(b.name));
  A.has = (n) => !!A.models[n];
  A.clone = (n) => (A.models[n] ? A.models[n].clone(true) : null);   // shares geometry + materials (clone "tint" yourself)
  A.note = (n, why) => { const r = A.report.find((x) => x.name === n); if (r) { r.status = "placeholder"; r.why = why; } console.info("[assets3d] " + n + ": " + why); };
  A.ms = performance.now() - t0;
  return A;
}
