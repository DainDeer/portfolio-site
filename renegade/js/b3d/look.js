// SP-100 3D battles: the look (ported from proto/shared/3d/look.js). Chunky = THE look (Megan, Oct 3): half-res render,
// nearest upscale, 4 flat toon light bands. Phones (Vixie): no shadow maps (blob shadows under the units instead).
import * as THREE from "three";

export function createLook(canvas, opts) {
  const LOW = !!opts.low;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: LOW ? "default" : "high-performance", alpha: false });
  renderer.setPixelRatio(0.5);
  renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.classList.add("chunky");
  const bands = new THREE.DataTexture(new Uint8Array([60, 120, 185, 255]), 4, 1, THREE.RedFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter; bands.needsUpdate = true;
  const cache = {};
  const shade = (o) => new THREE.MeshToonMaterial(Object.assign(o, { gradientMap: bands }));
  const mats = {
    LOW, bands, shade,
    shared: (material) => Object.values(cache).includes(material),   // session-owned solid / eye materials
    solid(color, extra) { const k = color + (extra ? JSON.stringify(extra) : ""); return cache[k] || (cache[k] = shade(Object.assign({ color }, extra || {}))); },
    decal(map) { return shade({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, alphaTest: 0.04 }); },
    brass() { return mats.solid(0xc8a040); },
    glow(color) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }); },
    sprite(map) { return new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }); },
    eye() { return mats.solid(0x8a7034, { emissive: 0x2a1800 }); },   // goats: a faint warm glint, nothing more (Megan, Oct 3)
    flat(color, opacity) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }); },
    // a glTF material re-shaded for the look: keeps the base colour (+ vertex colours), drops the PBR maps
    fromGltf(m) {
      // Smudge: the orbital faction mark (orbital_ring*, material orbital_glow, KHR_materials_unlit) stays self-lit: opaque,
      // no additive, no vertex colours. By material name: later tiers reuse it
      if (m.name === "orbital_glow") return new THREE.MeshBasicMaterial({ color: m.color.clone(), name: m.name });   // the name stays: SELF_LIT (figures.js)
      if (m.name === "eye") return mats.eye(); const o = { color: m.color ? m.color.clone() : new THREE.Color(0xffffff), vertexColors: !!m.vertexColors };
      if (m.map) { m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; o.map = m.map; }
      if (m.transparent) { o.transparent = true; o.opacity = m.opacity; } const r = shade(o); r.name = m.name; return r; }
  };
  return { renderer, mats };
}

export function canvasTex(size, draw) {
  const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
// the game's blood decals (assets/fx) + a few canvas textures. A missing png is a blank decal, never a failed load.
export async function loadFxTextures(root) {
  const L = new THREE.TextureLoader(), blank = () => canvasTex(4, () => {});
  const load = (f) => L.loadAsync(window.G.Assets ? window.G.Assets.url(root + "assets/fx/" + f + ".png") : root + "assets/fx/" + f + ".png").then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; }, () => blank());
  const [b1, b2, b3, spray, pool, drag] = await Promise.all(FX_PNGS.map(load));
  const radial = (inner, outer) => (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, s, s); };
  return { blood: [b1, b2, b3], spray, pool, drag,
    glow: canvasTex(32, radial("rgba(255,255,255,1)", "rgba(255,255,255,0)")), puff: canvasTex(16, radial("rgba(255,255,255,0.95)", "rgba(255,255,255,0)")),
    blob: canvasTex(32, radial("rgba(0,0,0,0.55)", "rgba(0,0,0,0)")),
    scorch: canvasTex(32, radial("rgba(20,16,12,0.85)", "rgba(20,16,12,0)")),
    hole: canvasTex(16, (g, s) => { g.fillStyle = "rgba(20,18,14,0.95)"; g.beginPath(); g.arc(s / 2, s / 2, s * 0.22, 0, 7); g.fill(); g.strokeStyle = "rgba(60,54,44,0.6)"; g.lineWidth = 2; g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0, 7); g.stroke(); }) };
}
export const FX_PNGS = ["fx_blood_1", "fx_blood_2", "fx_blood_3", "fx_blood_spray", "fx_blood_pool", "fx_blood_drag"];
