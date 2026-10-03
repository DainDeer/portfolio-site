// Battle 3D prototypes (shared): the look. Chunky = THE look (Megan, Oct 3): half-res render, nearest upscale, 4 flat toon
// light bands (no dithering). ?look=smooth (testing only; the toggle shows with ?debug): device-res flat Lambert.
import * as THREE from "three";

export function createLook(canvas, opts) {
  const LOOK = opts.look, LOW = opts.low;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: LOOK === "smooth" && !LOW, powerPreference: "high-performance" });
  renderer.setPixelRatio(LOOK === "chunky" ? 0.5 : Math.min(window.devicePixelRatio || 1, LOW ? 1 : 1.5));   // caps: 1.5 desktop / 1 phone
  renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFShadowMap;
  canvas.classList.toggle("chunky", LOOK === "chunky");
  const bands = new THREE.DataTexture(new Uint8Array([60, 120, 185, 255]), 4, 1, THREE.RedFormat);
  bands.minFilter = bands.magFilter = THREE.NearestFilter; bands.needsUpdate = true;
  const cache = {};
  const shade = (o) => (LOOK === "chunky" ? new THREE.MeshToonMaterial(Object.assign(o, { gradientMap: bands })) : new THREE.MeshLambertMaterial(Object.assign(o, o.map ? {} : { flatShading: true })));
  const mats = {
    LOOK, LOW, bands, shade,
    solid(color, extra) { const k = color + (extra ? JSON.stringify(extra) : ""); return cache[k] || (cache[k] = shade(Object.assign({ color }, extra || {}))); },
    decal(map) { return shade({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, alphaTest: 0.04 }); },
    brass() { return mats.solid(0xc8a040); },
    glow(color) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }); },
    sprite(map) { return new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }); },
    eye() { return mats.solid(0x8a7034, { emissive: 0x2a1800 }); },   // goats: a faint warm glint, nothing more (Megan, Oct 3)
    hidden() { return new THREE.MeshBasicMaterial({ visible: false }); },
    // a glTF material re-shaded for the look: keeps the base colour (+ texture, nearest), drops the PBR maps
    fromGltf(m) { if (m.name === "eye") return mats.eye(); const o = { color: m.color ? m.color.clone() : new THREE.Color(0xffffff), vertexColors: !!m.vertexColors };
      if (m.map) { m.map.magFilter = m.map.minFilter = THREE.NearestFilter; m.map.generateMipmaps = false; o.map = m.map; }
      if (m.transparent) { o.transparent = true; o.opacity = m.opacity; } const r = shade(o); r.name = m.name; return r; }
  };
  return { renderer, mats };
}

export function canvasTex(size, draw) {
  const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
// the game's blood decals (assets/fx) + a few canvas textures
export async function loadFxTextures(root) {
  const L = new THREE.TextureLoader(), load = (f) => L.loadAsync(root + "assets/fx/" + f + ".png").then((t) => { t.colorSpace = THREE.SRGBColorSpace; t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; return t; });
  const [b1, b2, b3, spray, pool, drag] = await Promise.all(["fx_blood_1", "fx_blood_2", "fx_blood_3", "fx_blood_spray", "fx_blood_pool", "fx_blood_drag"].map(load));
  const radial = (inner, outer) => (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, inner); gr.addColorStop(1, outer); g.fillStyle = gr; g.fillRect(0, 0, s, s); };
  return { blood: [b1, b2, b3], spray, pool, drag,
    glow: canvasTex(32, radial("rgba(255,255,255,1)", "rgba(255,255,255,0)")), puff: canvasTex(16, radial("rgba(255,255,255,0.95)", "rgba(255,255,255,0)")),
    hole: canvasTex(16, (g, s) => { g.fillStyle = "rgba(20,18,14,0.95)"; g.beginPath(); g.arc(s / 2, s / 2, s * 0.22, 0, 7); g.fill(); g.strokeStyle = "rgba(60,54,44,0.6)"; g.lineWidth = 2; g.beginPath(); g.arc(s / 2, s / 2, s * 0.36, 0, 7); g.stroke(); }) };
}

// a tiny local sound player on the game's sfx files (no G.Sfx, nothing stored)
export function createSfx(root) {
  const els = {}, last = {}; const S = { on: true };
  S.play = function (key, vol, minGapMs) {
    if (!S.on || !key) return; const now = performance.now(); if (now - (last[key] || 0) < (minGapMs || 30)) return; last[key] = now;
    try { let a = els[key]; if (!a) a = els[key] = new Audio(root + "assets/sfx/" + key + ".mp3");
      const el = a.paused ? a : a.cloneNode(); el.volume = vol == null ? 0.5 : vol; el.currentTime = 0; const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* no audio */ }
  };
  return S;
}
