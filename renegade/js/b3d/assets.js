// SP-100 3D battles: Smudge's models (assets/3d, contract rev 2). The manifest is read once per session; only files it lists
// are requested (no 404 noise) and each model is loaded once and cached for every later battle. Anything missing, broken
// or off-contract stays a placeholder. base = G.Gfx.MODELS_BASE ("assets/3d/").
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const models = new Map(), report = new Map(), geos = new Set(), materials = new Set();
let manifestP = null, manifestBase = null, loader = null;

export function loadManifest(base) {
  if (!manifestP || manifestBase !== base) {
    manifestBase = base;
    manifestP = fetch(window.G.Assets ? window.G.Assets.url(base + "manifest.json") : base + "manifest.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => (j && Array.isArray(j.files) ? j : { files: [], units: {}, gear: {}, plans: {}, weapon_item_to_file: {}, gear_item_to_part: {}, zone_props: {} }));
  }
  return manifestP;
}

// names: file names inside base. Resolves to the shared asset API (has / clone / note / report) once all are settled.
export async function loadModels(base, names, mats) {
  const man = await loadManifest(base), listed = new Set(man.files);
  loader = loader || new GLTFLoader();
  const shaded = new Map();
  await Promise.all([...new Set(names)].map(async (n) => {
    if (models.has(n) || report.has(n)) return;
    if (!listed.has(n)) { report.set(n, { name: n, status: "placeholder", why: "not in manifest" }); return; }
    try {
      const g = await loader.loadAsync(window.G.Assets ? window.G.Assets.url(base + n) : base + n); let tris = 0;
      g.scene.traverse((o) => { if (!o.isMesh) return; o.castShadow = !mats.LOW; o.receiveShadow = true; geos.add(o.geometry);
        const geo = o.geometry; tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        const swap = (m) => { if (!shaded.has(m)) shaded.set(m, mats.fromGltf(m)); return shaded.get(m); };
        o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
        for (const m of [].concat(o.material)) materials.add(m); });
      models.set(n, g.scene); report.set(n, { name: n, status: "loaded", tris: Math.round(tris) });
    } catch (e) { report.set(n, { name: n, status: "placeholder", why: "load failed: " + (e && e.message ? e.message : e) }); console.info("[assets3d] " + n + ": " + e); }
  }));
  return api(man);
}
function api(man) {
  return {
    man,
    has: (n) => !!n && models.has(n),
    clone: (n) => (models.has(n) ? models.get(n).clone(true) : null),   // shares geometry + materials (clone "tint" yourself)
    note: (n, why) => { const r = report.get(n); if (r) { r.status = "placeholder"; r.why = why; } console.info("[assets3d] " + n + ": " + why); },
    report: () => [...report.values()].sort((a, b) => a.name.localeCompare(b.name)),
    shared: (resource) => geos.has(resource) || materials.has(resource)   // cached model resources survive a battle
  };
}
