// SP-129 v2 / SP-131: the Renegade 3D map-select view. A drop-in ES module (three.js r185, already vendored by the game).
// Low-poly forest from assets/3d (instanced), diegetic modifier features (one prop recipe per modifier TYPE), tier
// beacons, shader fog cards over unexplored ground. Performance path: the static scene (ground, trees, props) is baked
// ONCE into a low-res render target; each frame draws only the fog cards + beacons + the selection ring on top of it.
//
//   const view = await createMapView(container, { assetRoot: "assets/3d/", width, height, portrait, onSelect, onHover });
//   view.setWorld({ w: 1000, h: 600 });   // the game's map space for every x/y/r below (live location canvas: 1000 x 600)
//   view.setMaps(maps, edges);   // [{ id, x, y, r?, landmark?: "gate"|"camp"|"snag"|"pond"|"mill"|"truck"|... }], [[idA, idB], ...]
//   view.setTerrain({ creeks: [[[x, y], ...]], ponds: [{ x, y, rx, ry }] });   // optional extras
//   view.setFog(explored);       // [{ x, y, r, thin?: true }]  (thin = scouted edge: name known, modifiers hidden)
//   view.setModifiers(mods);     // [{ id, mapId, type, tier?, cat?, x?, y?, yaw?, off?, hidden? }]  (any extra fields pass through)
//   view.setPalette({ key: 0xrrggbb, ... });  view.colorOf(mod) -> the beacon colour (use it for DOM pins too)
//   await view.update();         // (re)builds + re-bakes; call after any setX (cheap: one full render)
//   view.select(id | null); view.project(id) -> { x, y } css px; view.pick(x, y) -> { kind, id } | null
//   view.resize(w, h); view.snapshot() -> dataURL (static fallback); view.stats(); view.dispose();
// Data stays data: the CATEGORY is whatever the modifier says (never read here); the TYPE picks a recipe through
// FEATURE_FOR -> FEATURES; colorKey(mod) (default mod.tier) picks a colour from the palette table. Edit tables, not code.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// SP-131 (game copy of Smudge's SP-129 v2 module, /workspace/sp129_mockups/v2/src/map3d.js). The game feeds it from
// js/forestmap.js with data/forestmap.js (palette, feature table, landmarks); these defaults are only the fallback.
// (1) Beacon colours: ONE palette table, keyed by whatever colorKey(mod) returns (default: mod.tier).
//     Megan (Oct 7): the six-colour rarity ladder white -> green -> blue -> yellow -> purple -> orange. Swap with view.setPalette().
export const TIER_COLORS = { white: 0xe8e8e8, green: 0x5fd35f, blue: 0x4a8cff, yellow: 0xffd84a, purple: 0xb060ff, orange: 0xff8a30, unknown: 0x8c8c86, off: 0x4e5054 };
// (2) Category is NEVER read here: it is the game's data (SP-039 Boon/Hazard/Twist/Silly or mapsv2 enemy/place/loot/people/orbital/silly),
//     passed through untouched to onSelect/onHover and the game's own card. Props are chosen by modifier TYPE (id) via FEATURE_FOR.
// ---- modifier type id -> feature recipe key. ONE lookup table; unknown ids fall back to the cairn. Add live ids here.
export const FEATURE_FOR = {
  rats: "rats", beast_nest: "rats",                                  // SP-039 example / mapsv2 id
  power_out: "power_out", dark: "power_out",
  cache: "cache", weapon_cache: "cache", armory_locker: "cache",
  skull_camp: "skull_camp", tough_enemies: "skull_camp", elite_leader: "skull_camp",
  ducks: "ducks", duck_parade: "ducks",
  unknown: "unknown",
};
// ---- feature recipes: parts = [file, dx, dy (map px, rotated by mod.yaw), yaw, scale, lift?]; ring = [file, count, scale, radius px]
export const FEATURES = {
  rats:       { parts: [["mod_rat_nest", 0, 0, 0, 4.2]], ring: [["mod_rat", 7, 2.6, 15]] },             // ring: [file, n, scale, radius]
  power_out:  { parts: [["mod_dead_generator", 0, 0, 0.4, 3.8], ["mod_lantern_dark", -9, -3, 0, 3.4], ["mod_lantern_dark", 8, -6, 1.2, 3.4]] },
  cache:      { parts: [["mod_cache_crate", 0, 0, 0.5, 3.8]] },
  skull_camp: { parts: [["mod_skull_camp", 0, 0, 0.6, 3.4]] },
  ducks:      { parts: [["mod_duck", -8, 4, 0.9, 7], ["mod_duck", -4, 2, 0.9, 7], ["mod_duck", 0, 0, 0.9, 7], ["mod_duck", 4, -2, 0.9, 7], ["mod_duck", 8, -4, 0.9, 8.5], ["mod_party_hat", 8, -4, 0.9, 8.5, 0.24]] },   // 6th field = lift (metres, pre-scale): hat sits on the lead duck
  unknown:    { parts: [["mod_cairn", 0, 0, 0, 3.6]] },
};
// ---- map landmark recipes (assets/3d kit files)
const LANDMARKS = {
  gate:  [["hushwood_palisade", -10, -9, Math.PI / 2, 1], ["hushwood_palisade", -10, -4.5, Math.PI / 2, 1], ["hushwood_palisade", -10, 4.5, Math.PI / 2, 1], ["hushwood_palisade", -10, 9, Math.PI / 2, 1], ["hushwood_log_pile", 6, -8, 0.3, 1], ["hushwood_stump", 8, 7, 1, 1]],
  camp:  [["crate", 8, 4, 0.4, 1.4], ["crate", 10, 1, 1.1, 1.2], ["fence_wood", -9, 9, 0.2, 1.3], ["hushwood_log", -4, -7, 1.4, 1], ["hushwood_log", 2, 8, 0.1, 1], ["#tent", -6, -2, 0, 0x1c7470], ["#tent", 3, -9, 0, 0x862c1c]],
  snag:  [["hushwood_dead_tree", 0, -2, 0.7, 3.2], ["hushwood_stump", -9, 6, 0.2, 1.2], ["hushwood_stump", 8, 7, 2.1, 1.2], ["hushwood_stump", 10, -6, 4, 1.2]],
  pond:  [["#pond", 0, 0, 0, 1], ["hushwood_rock_mossy", -30, 4, 0.3, 1.6], ["hushwood_rock_mossy", 26, -10, 2, 1.6], ["hushwood_rock_mossy", 18, 16, 4, 1.6]],
  mill:  [["hushwood_log_pile", -8, 4, 0.2, 1.4], ["hushwood_log_pile", 6, 8, 1.6, 1.4], ["hushwood_log_pile", 10, -4, 0.4, 1.4], ["hushwood_palisade", -4, -10, 0, 1.6]],
  truck: [["car_wreck", 0, 0, 0.6, 1.6], ["hushwood_log_pile", 8, 6, 1.2, 1.2]],
};
const GLOWS = { gate: 0xf0a040, camp: 0xf0a040 };   // campfires (flicker in the per-frame pass)
const TREE_FILES = ["hushwood_pine", "hushwood_pine_small", "hushwood_dead_tree"];

export async function createMapView(container, o = {}) {
  const opt = Object.assign({ assetRoot: "assets/3d/", width: container.clientWidth, height: container.clientHeight, dpr: 0.5, bake: true, portrait: false, seed: 129, treeSpacing: 7, fogCards: 8, onSelect: null, onHover: null,
    colorKey: (m) => m.tier,                                              // which field picks the beacon colour (e.g. m => m.cat, or a danger band)
    featureOf: (m) => FEATURES[FEATURE_FOR[m.type]] || FEATURES.unknown,   // which recipe a modifier gets
  }, o);
  let palette = Object.assign({}, TIER_COLORS);
  const T0 = performance.now();
  const canvas = document.createElement("canvas"); canvas.style.cssText = "position:absolute;left:0;top:0;image-rendering:pixelated"; container.appendChild(canvas);
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" }); }
  catch (e) { canvas.remove(); return null; }   // caller shows the static fallback image
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.setPixelRatio(opt.dpr); renderer.info.autoReset = false;   // stats count a whole frame (both passes)
  let K = 1, W = 450, H = 376, M = 0.5, maps = [], edges = [], terrain = {}, explored = [], mods = [], selected = null;
  const bands = new THREE.DataTexture(new Uint8Array([60, 120, 185, 255]), 4, 1, THREE.RedFormat); bands.minFilter = bands.magFilter = THREE.NearestFilter; bands.needsUpdate = true;
  const toon = (p) => new THREE.MeshToonMaterial(Object.assign({ gradientMap: bands }, p));
  const loader = new GLTFLoader(), lib = {};
  async function load(f) {
    if (lib[f]) return lib[f];
    return (lib[f] = loader.loadAsync(opt.assetRoot + f + ".glb").then((g) => { g.scene.updateMatrixWorld(true); const list = []; const box = new THREE.Box3().setFromObject(g.scene);
      g.scene.traverse((m) => { if (m.isMesh) { const geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); list.push({ geo, color: m.material.color ? m.material.color.clone() : new THREE.Color(1, 1, 1), vc: !!geo.attributes.color }); } });
      return { list, box }; }));
  }
  const rnd = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const wx = (x) => (x - W / 2) * M, wz = (y) => (y - H / 2) * M;
  const hgt = (x, z) => 0.6 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06) + 0.3 * Math.sin(x * 0.15 - z * 0.11);
  const scene = new THREE.Scene(), live = new THREE.Scene();   // scene = static (baked), live = per frame
  let cam = new THREE.PerspectiveCamera(30, 1, 5, 1200), rt = null, liveBits = [], built = false, stat = {};

  // ---------- ground + tree mask, drawn at runtime from the map data (no texture download)
  function groundCanvas() {
    const c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    const kind = document.createElement("canvas"); kind.width = W; kind.height = H; const k = kind.getContext("2d");   // white = open (no trees)
    g.fillStyle = "#15171c"; g.fillRect(0, 0, W, H); k.fillStyle = "#000"; k.fillRect(0, 0, W, H);
    const byId = Object.fromEntries(maps.map((m) => [m.id, m]));
    const edgePaths = (ctx, w, col) => {   // same seed each call, so the floor paths and the tree mask match exactly
      const RR = rnd(opt.seed + 3); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
      for (const [a, b] of edges) { const A = byId[a], B = byId[b]; if (!A || !B) continue; ctx.beginPath();
        const n = 16, dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, ph = RR() * 6.28, amp = 4 + RR() * 5;
        for (let i = 0; i <= n; i++) { const t = i / n, o = Math.sin(t * Math.PI) * amp * Math.sin(t * 5 + ph); const x = A.x + dx * t + nx * o, y = A.y + dy * t + ny * o; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke(); } };
    edgePaths(g, 5, "#5a4a34"); edgePaths(k, 9, "#fff");
    for (const cr of terrain.creeks || []) for (const [ctx, w, col] of [[g, 4, "#2b2f37"], [k, 6, "#fff"]]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); cr.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    const blob = (ctx, x, y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, rr = r * (0.88 + 0.12 * Math.sin(a * 3 + x) * Math.cos(a * 2 + y)); i ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + rr, y); } ctx.fill(); };
    for (const m of maps) { if (m.landmark === "pond") continue; blob(g, m.x, m.y, m.r || 21, "#3e3224"); blob(g, m.x, m.y, (m.r || 21) - 3, "#4a3c2a"); blob(k, m.x, m.y, (m.r || 21) + 3, "#fff"); }
    for (const p of terrain.ponds || []) { g.fillStyle = "#4a3c2a"; g.beginPath(); g.ellipse(p.x, p.y, p.rx * 1.35, p.ry * 1.35, 0, 0, 7); g.fill(); g.fillStyle = "#1f2229"; g.beginPath(); g.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, 7); g.fill(); k.fillStyle = "#fff"; k.beginPath(); k.ellipse(p.x, p.y, p.rx * 1.45, p.ry * 1.45, 0, 0, 7); k.fill(); }
    for (const f of mods) { if (f.hidden) continue; const p = modPos(f); blob(g, p.x, p.y + 2, 11, "#33291c"); blob(g, p.x, p.y + 2, 8, "#3e3224"); blob(k, p.x, p.y + 4, 15, "#fff"); blob(k, p.x, p.y + 12, 11, "#fff"); }   // a glade per feature, opened toward the camera so trees never hide it
    // grain: palette-ish speckle so the floor isn't flat
    const id = g.getImageData(0, 0, W, H), d = id.data, RS = rnd(opt.seed + 9);
    for (let i = 0; i < d.length; i += 4) { const r = RS(); if (r < 0.18) { const f = r < 0.09 ? 1.35 : 0.75; d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; } if (d[i] < 30 && r > 0.82) { d[i] = 35; d[i + 1] = 42; d[i + 2] = 28; } }
    g.putImageData(id, 0, 0);
    return { g: c, k: k.getImageData(0, 0, W, H).data };
  }
  const modPos = (f) => { const m = maps.find((q) => q.id === f.mapId) || { x: 0, y: 0 }; return { x: f.x != null ? f.x : m.x + 30, y: f.y != null ? f.y : m.y }; };
  function fogMaskCanvas() {   // white = fog, black = explored, grey = thin (scouted). The card shader adds the noisy edge.
    const c = document.createElement("canvas"); c.width = W >> 1; c.height = H >> 1; const g = c.getContext("2d"); g.scale(0.5, 0.5);
    g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    for (const e of explored.filter((q) => q.thin)) { const gr = g.createRadialGradient(e.x, e.y, e.r * 0.6, e.x, e.y, e.r * 1.25); gr.addColorStop(0, "#6b6b6b"); gr.addColorStop(1, "#fff"); g.fillStyle = gr; g.fillRect(e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4); }
    g.globalCompositeOperation = "darken";
    for (const e of explored.filter((q) => !q.thin)) { const gr = g.createRadialGradient(e.x, e.y, e.r * 0.75, e.x, e.y, e.r * 1.3); gr.addColorStop(0, "#000"); gr.addColorStop(1, "#fff"); g.fillStyle = gr; g.fillRect(e.x - e.r * 2, e.y - e.r * 2, e.r * 4, e.r * 4); }
    return c;
  }
  // ---------- fog card shader (same as v1, mask is now a runtime canvas)
  function fogMat(L, maskTex) {
    return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uMask: { value: maskTex }, uTime: { value: 0 }, uL: { value: L }, uSize: { value: new THREE.Vector2(W * M, H * M) }, uLow: { value: new THREE.Color(0x1f2229) }, uHigh: { value: new THREE.Color(0x646a78) }, uLit: { value: new THREE.Color(0x9ca2b0) } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform sampler2D uMask; uniform float uTime, uL; uniform vec2 uSize; uniform vec3 uLow, uHigh, uLit; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+1.),f.x), f.y); }
        float fbm(vec2 p){ return .55*n(p) + .3*n(p*2.03+7.1) + .15*n(p*4.01+3.3); }
        const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
        void main(){
          vec2 uv = vW.xz / uSize + .5; float edge = fbm(vW.xz * .06 + 3.1) - .5;
          float m = (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) ? 1. : clamp(texture(uMask, uv).r + edge * .45, 0., 1.);
          vec2 drift = vec2(uTime * (.6 + uL * .9), uTime * .25);
          float c = fbm(vW.xz * (.045 - uL * .012) + drift * .05 + uL * 5.3);
          float thr = .38 + uL * .42;
          float d = smoothstep(thr, thr + .18, m) * smoothstep(.18 + uL * .38, .62 + uL * .2, c + m * .22);
          if (uL < .01) d = max(smoothstep(.5, .75, m), step(.3, m) * .45);
          float a = d * mix(.97, .5, uL);
          int k = int(mod(gl_FragCoord.x, 4.)) + int(mod(gl_FragCoord.y, 4.)) * 4;
          a = floor(a * 3. + (BAYER[k] + .5) / 16.) / 3.;
          if (a <= 0.) discard;
          vec3 col = mix(uLow, uHigh, uL * .8 + c * .35); col = mix(col, uLit, smoothstep(.62, .8, c) * uL);
          gl_FragColor = vec4(col, a); }` });
  }
  const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 32; const g = c.getContext("2d"); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.35, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const pillarMat = (col) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uC: { value: new THREE.Color(col) }, uT: { value: 0 } },
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uC; uniform float uT; varying vec2 vU; void main(){ float a = pow(1. - vU.y, 1.6) * (.9 + .25 * sin(uT * 2.4)); gl_FragColor = vec4(uC * a, a); }` });

  async function build() {
    // clear
    for (const s of [scene, live]) while (s.children.length) s.remove(s.children[0]);
    liveBits = [];
    scene.background = new THREE.Color(0x0c0d10);
    scene.add(new THREE.HemisphereLight(0xc0ccd8, 0x2a3020, 1.7)); const sun = new THREE.DirectionalLight(0xf2dcb0, 2.3); sun.position.set(-80, 120, 60); scene.add(sun);
    const gc = groundCanvas(); const gtex = new THREE.CanvasTexture(gc.g); gtex.colorSpace = THREE.SRGBColorSpace; gtex.magFilter = gtex.minFilter = THREE.NearestFilter; gtex.generateMipmaps = false;
    const gg = new THREE.PlaneGeometry(W * M, H * M, 90, 60); gg.rotateX(-Math.PI / 2); { const p = gg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, hgt(p.getX(i), p.getZ(i))); gg.computeVertexNormals(); }
    scene.add(new THREE.Mesh(gg, toon({ map: gtex })));
    { const og = new THREE.PlaneGeometry(W * M + 400, H * M + 400); og.rotateX(-Math.PI / 2); const outer = new THREE.Mesh(og, new THREE.MeshBasicMaterial({ color: 0x15171c })); outer.position.y = -0.8; scene.add(outer); }
    const sk = new THREE.Mesh(new THREE.BoxGeometry(W * M + .2, 6, H * M + .2), toon({ color: 0x2e2418 })); sk.position.y = -3.05; scene.add(sk);
    // fog mask (CPU copy culls trees, GPU copy feeds the cards)
    const fm = fogMaskCanvas(), fmd = fm.getContext("2d").getImageData(0, 0, fm.width, fm.height).data, fogAt = (x, y) => fmd[((Math.min(fm.height - 1, Math.max(0, y >> 1))) * fm.width + Math.min(fm.width - 1, Math.max(0, x >> 1))) * 4] / 255;
    const maskTex = new THREE.CanvasTexture(fm); maskTex.flipY = false; maskTex.minFilter = maskTex.magFilter = THREE.LinearFilter;
    // placements -> instanced batches (one InstancedMesh per primitive per file)
    const placed = {}, put = (f, x, y, yaw, s, opts) => { const key = f + (opts && opts.dim ? "|dim" : ""); (placed[key] = placed[key] || []).push({ x, y, yaw, s, lift: (opts && opts.lift) || 0 }); };
    const R = rnd(opt.seed); let culled = 0, trees = 0;
    await Promise.all(TREE_FILES.map(load)); const tall = {}; for (const f of TREE_FILES) tall[f] = (await load(f)).box.max.y || 6;
    const sp = opt.treeSpacing;
    for (let gy = -1; gy < H / sp + 1; gy++) for (let gx = -1; gx < W / sp + 1; gx++) {
      const x = gx * sp + R() * sp, y = gy * sp + R() * sp, r = R(), r2 = R();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const open = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && gc.k[((yy | 0) * W + (xx | 0)) * 4] > 100;
      if (open(x, y) || open(x + 2, y) || open(x - 2, y) || open(x, y + 2) || open(x, y - 3) || r2 < 0.06) continue;
      if (fogAt(x, y - 4) > 0.97) { culled++; continue; }   // hidden by the fog blanket: never drawn
      const f = r < 0.012 ? "hushwood_dead_tree" : r < 0.2 ? "hushwood_pine_small" : "hushwood_pine";
      const th = f === "hushwood_pine_small" ? 7 + r2 * 3 : 9 + r2 * 5; put(f, x, y, r * 6.283, th * 0.95 / tall[f] * (f === "hushwood_pine_small" ? 1.25 : 1)); trees++;
    }
    const tents = [], waters = [], glows = [];
    for (const m of maps) for (const [f, dx, dy, yaw, s] of LANDMARKS[m.landmark] || []) {
      if (f === "#tent") tents.push([m.x + dx, m.y + dy, s]); else if (f === "#pond") waters.push(m); else put(f, m.x + dx, m.y + dy, yaw, s);
      if (GLOWS[m.landmark] && f === (LANDMARKS[m.landmark][0][0])) glows.push([m.x + 1, m.y + 2, GLOWS[m.landmark], 6]);
    }
    // features: the modifier TYPE picks the recipe; an OFF modifier's props are drawn dimmed (and get no beacon)
    for (const f of mods) {
      if (f.hidden) continue; const rec = opt.featureOf(f), p = modPos(f), yawF = f.yaw || 0;
      for (const [file, dx, dy, yaw, s, lift] of rec.parts) { const c = Math.cos(yawF), sn = Math.sin(yawF); put(file, p.x + dx * c - dy * sn, p.y + dx * sn + dy * c, yaw + yawF, s, { dim: f.off, lift: (lift || 0) * s }); }
      for (const [file, n, s, rad] of rec.ring || []) for (let i = 0; i < n; i++) { const a = i / n * 6.283 + 0.4; put(file, p.x + Math.cos(a) * rad * (0.7 + 0.4 * ((i * 37) % 10) / 10), p.y + Math.sin(a) * rad * 0.8, a + 1.2, s, { dim: f.off }); }
    }
    let instances = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const key in placed) {
      const [f, dim] = key.split("|"), L = await load(f), arr = placed[key]; instances += arr.length;
      const isProp = f.startsWith("mod_");
      for (const p of L.list) {
        const mat = toon({ color: p.color.clone().multiplyScalar(dim ? 0.38 : 1), vertexColors: p.vc, side: isProp ? THREE.DoubleSide : THREE.FrontSide });
        const im = new THREE.InstancedMesh(p.geo, mat, arr.length);
        const tint = TREE_FILES.includes(f), tc = new THREE.Color(), RT = rnd(opt.seed + 77);
        arr.forEach((o2, i) => { const X = wx(o2.x), Z = wz(o2.y); e.set(0, o2.yaw, 0); q.setFromEuler(e); v.set(X, hgt(X, Z) - 0.05 + o2.lift, Z); sc.setScalar(o2.s); m4.compose(v, q, sc); im.setMatrixAt(i, m4);
          if (tint) { const r = RT(); tc.setRGB(0.72 + r * 0.5, 0.78 + r * 0.42, 0.72 + RT() * 0.3); im.setColorAt(i, tc); } });   // per-tree tint: individual crowns read at full-screen size
        im.frustumCulled = false; scene.add(im);
      }
    }
    const tentGeo = new THREE.ConeGeometry(2.4, 3.2, 4, 1); tentGeo.rotateY(Math.PI / 4); tentGeo.translate(0, 1.6, 0);
    for (const [x, y, col] of tents) { const t = new THREE.Mesh(tentGeo, toon({ color: col })); t.position.set(wx(x), hgt(wx(x), wz(y)), wz(y)); scene.add(t); }
    for (const p of terrain.ponds || []) { const g = new THREE.CircleGeometry(1, 20); g.rotateX(-Math.PI / 2); const wm = new THREE.Mesh(g, toon({ color: 0x1f2a30 })); wm.scale.set(p.rx * M, 1, p.ry * M); wm.position.set(wx(p.x), 0.25, wz(p.y)); scene.add(wm);
      const g2 = new THREE.RingGeometry(0.86, 1, 20); g2.rotateX(-Math.PI / 2); const rim = new THREE.Mesh(g2, toon({ color: 0x1c7470 })); rim.scale.copy(wm.scale); rim.position.copy(wm.position).setY(0.3); scene.add(rim); }
    // ---- live (per frame) layer: fog cards, beacons, campfire glows, the selection ring
    const cards = [];
    for (let i = 0; i < opt.fogCards; i++) { const L = i / Math.max(1, opt.fogCards - 1); const g = new THREE.PlaneGeometry(W * M + 400, H * M + 400); g.rotateX(-Math.PI / 2);   // oversized: beyond the zone is all fog, so no edge ever shows
      const c = new THREE.Mesh(g, fogMat(L, maskTex)); c.position.y = 1.8 + L * 13; c.renderOrder = 10 + i; live.add(c); cards.push(c); }
    const sprite = (col, s, add = true) => { const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, transparent: true, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, depthTest: false })); sp2.scale.setScalar(s); sp2.renderOrder = 30; return sp2; };
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.8, 18, 6, 1, true); pillarGeo.translate(0, 9, 0);
    const ringGeo = new THREE.RingGeometry(4.2, 4.9, 28); ringGeo.rotateX(-Math.PI / 2);
    for (const f of mods) {
      if (f.hidden) continue; const p = modPos(f), X = wx(p.x), Z = wz(p.y), Y = hgt(X, Z); const k = opt.colorKey(f), col = f.off ? palette.off : (palette[k] != null ? palette[k] : palette.unknown);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: f.off ? 0.5 : 0.85, depthTest: false, depthWrite: false })); ring.position.set(X, Y + 0.3, Z); ring.renderOrder = 20; scene.add(ring);   // static: baked with the forest
      if (!f.off) { const pm = pillarMat(col); const pl = new THREE.Mesh(pillarGeo, pm); pl.position.set(X, Y, Z); pl.renderOrder = 21; live.add(pl); liveBits.push({ kind: "pillar", m: pm, ph: (p.x * 0.37) % 6 });
        const gs = sprite(col, 3.5); gs.position.set(X, Y + 9, Z); live.add(gs); liveBits.push({ kind: "glow", s: gs, base: 4.5, ph: (p.y * 0.21) % 6 }); }
    }
    for (const [x, y, col, s] of glows) { const gs = sprite(col, s); gs.position.set(wx(x), hgt(wx(x), wz(y)) + 1.2, wz(y)); live.add(gs); liveBits.push({ kind: "fire", s: gs, base: s, ph: x % 6 }); }
    const selRing = new THREE.Mesh(new THREE.RingGeometry(11, 11.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0c83c, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false })); selRing.renderOrder = 25; selRing.visible = false; live.add(selRing);
    liveBits.push({ kind: "sel", m: selRing });
    stat = { trees, treesCulled: culled, instances, liveCards: cards.length, buildMs: 0 };
    cards.forEach((c) => liveBits.push({ kind: "card", c }));
    built = true;
  }
  function frameCamera() {
    const w = opt.width, h = opt.height; cam.aspect = w / h; cam.updateProjectionMatrix();
    // fit the box around every map + feature (fogged ones too), tilted ~47 deg; portrait looks from the west so the long axis runs up the screen
    // fit: "world" (default) frames the whole zone like v1; "maps" frames the node bbox (closer, for big zones)
    let minX = 0, maxX = W, minY = 0, maxY = H;
    if (opt.fit === "maps") { const pts = maps.map((m) => [m.x, m.y]).concat(mods.filter((f) => !f.hidden).map((f) => { const p = modPos(f); return [p.x, p.y]; }));
      minX = Math.min(...pts.map((p) => p[0])) - 34; maxX = Math.max(...pts.map((p) => p[0])) + 34; minY = Math.min(...pts.map((p) => p[1])) - 34; maxY = Math.max(...pts.map((p) => p[1])) + 40; }
    if (opt.focus) { const sx = (maxX - minX) / 2 / (opt.zoom || 1), sy = (maxY - minY) / 2 / (opt.zoom || 1); minX = opt.focus.x - sx; maxX = opt.focus.x + sx; minY = opt.focus.y - sy; maxY = opt.focus.y + sy; }
    const cx = wx((minX + maxX) / 2), cz = wz((minY + maxY) / 2), spanX = (maxX - minX) * M, spanZ = (maxY - minY) * M;
    const pitch = THREE.MathUtils.degToRad(opt.portrait ? 58 : 47), vf = THREE.MathUtils.degToRad(cam.fov / 2), hf = Math.atan(Math.tan(vf) * cam.aspect);
    const across = opt.portrait ? spanZ : spanX, deep = opt.portrait ? spanX : spanZ;
    const dist = Math.max((across / 2) / Math.tan(hf), (deep * 0.95 * Math.sin(pitch) / 2) / Math.tan(vf)) * 1.04;
    const tgt = new THREE.Vector3(cx + (opt.portrait ? 6 : 0), 0, cz + (opt.portrait ? 0 : 10));
    if (opt.portrait) cam.position.set(cx - Math.cos(pitch) * dist, Math.sin(pitch) * dist, cz); else cam.position.set(cx, Math.sin(pitch) * dist, cz + Math.cos(pitch) * dist);
    cam.up.set(0, 1, 0); cam.lookAt(tgt);
    scene.fog = new THREE.Fog(0x14161c, dist * 1.05, dist * 2.4);
  }
  function bake() {
    renderer.setSize(opt.width, opt.height, true);
    if (!opt.bake) return;
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(Math.round(opt.width * opt.dpr), Math.round(opt.height * opt.dpr), { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    rt.texture.colorSpace = THREE.SRGBColorSpace;   // encode on write + decode as background: baked == live colours
    renderer.info.reset(); renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null);
    stat.bakeCalls = renderer.info.render.calls; stat.bakeTriangles = renderer.info.render.triangles; renderer.info.reset();
    live.background = rt.texture;
  }
  let time = 0, raf = 0;
  function draw(dt = 0) {
    time += dt; renderer.info.reset();
    for (const b of liveBits) {
      if (b.kind === "card") b.c.material.uniforms.uTime.value = time;
      else if (b.kind === "pillar") b.m.uniforms.uT.value = time + b.ph;
      else if (b.kind === "glow") b.s.scale.setScalar(b.base * (0.9 + 0.12 * Math.sin(time * 2.4 + b.ph)));
      else if (b.kind === "fire") b.s.scale.setScalar(b.base * (0.85 + 0.15 * Math.sin(time * 9 + b.ph) * Math.sin(time * 5.3)));
      else if (b.kind === "sel") { const s = selected && project3(selected); b.m.visible = !!s; if (s) { b.m.position.copy(s.p).setY(s.p.y + 0.4); b.m.scale.setScalar(s.kind === "map" ? 1 : 0.5); } }
    }
    if (opt.bake) { renderer.render(live, cam); return; }
    // no-bake path (debug / comparison): full scene every frame, then the live layer on top
    renderer.render(scene, cam); renderer.autoClear = false; renderer.render(live, cam); renderer.autoClear = true;
  }
  function project3(id) {
    const m = maps.find((q) => q.id === id); if (m) { const X = wx(m.x), Z = wz(m.y); return { kind: "map", p: new THREE.Vector3(X, hgt(X, Z), Z) }; }
    const f = mods.find((q) => q.id === id); if (f) { const p = modPos(f), X = wx(p.x), Z = wz(p.y); return { kind: "modifier", p: new THREE.Vector3(X, hgt(X, Z), Z) }; }
    return null;
  }
  const api = {
    // The game's map space can be anything (live: 1000 x 600). Internally everything runs in a 450-px-wide space at
    // 0.5 m/px (a ~225 m zone), which is what every size constant (tree spacing, glades, recipes) is tuned for.
    setWorld(w) { K = 450 / w.w; W = 450; H = Math.round(w.h * K); M = 0.5; },
    setMaps(m, e) { maps = m.map((q) => Object.assign({}, q, { x: q.x * K, y: q.y * K, r: q.r != null ? q.r * K : undefined })); edges = e || []; },
    setTerrain(t) { t = t || {}; terrain = { creeks: (t.creeks || []).map((c) => c.map(([x, y]) => [x * K, y * K])), ponds: (t.ponds || []).map((p) => ({ x: p.x * K, y: p.y * K, rx: p.rx * K, ry: p.ry * K })) }; },
    setFog(ex) { explored = (ex || []).map((e) => Object.assign({}, e, { x: e.x * K, y: e.y * K, r: e.r * K })); },
    setPalette(p) { palette = Object.assign({}, TIER_COLORS, p); },   // e.g. setPalette(Object.fromEntries(Object.entries(MAPSV2.modifiers.categories).map(([k, c]) => [k, parseInt(c.color.slice(1), 16)])))
    colorOf(m) { const k = opt.colorKey(m); return m.off ? palette.off : (palette[k] != null ? palette[k] : palette.unknown); },   // same colour for the game's DOM pins/cards
    setModifiers(m) { mods = (m || []).map((q) => Object.assign({}, q, q.x != null ? { x: q.x * K, y: q.y * K } : {})); },
    async update() { const t = performance.now(); await build(); frameCamera(); bake(); draw(0); stat.buildMs = Math.round(performance.now() - t); if (stat.firstFrameMs == null) stat.firstFrameMs = Math.round(performance.now() - T0); },
    select(id) { selected = id; },
    project(id) { const s = project3(id); if (!s) return null; const v = s.p.clone().project(cam); return { x: (v.x + 1) / 2 * opt.width, y: (1 - v.y) / 2 * opt.height }; },
    pick(x, y, radius = 30) { let best = null; for (const it of maps.map((m) => ({ kind: "map", id: m.id })).concat(mods.filter((f) => !f.hidden).map((f) => ({ kind: "modifier", id: f.id })))) { const p = api.project(it.id), d = Math.hypot(p.x - x, p.y - y); if (d < radius && (!best || d < best.d)) best = Object.assign({ d }, it); } return best; },
    focus(x, y, zoom) { opt.focus = x == null ? null : { x, y }; opt.zoom = zoom || 1; frameCamera(); bake(); draw(0); },   // phone pan/zoom: re-bakes (one full render)
    resize(w, h) { opt.width = w; opt.height = h; frameCamera(); bake(); draw(0); },
    render(dt) { draw(dt); },
    renderAt(t) { time = t; draw(0); },
    start() { let last = performance.now(); const loop = (now) => { draw(Math.min(0.1, (now - last) / 1000)); last = now; raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); },
    stop() { cancelAnimationFrame(raf); },
    snapshot() { draw(0); return canvas.toDataURL("image/png"); },
    stats() { return Object.assign({ frameCalls: renderer.info.render.calls, frameTriangles: renderer.info.render.triangles, target: [Math.round(opt.width * opt.dpr), Math.round(opt.height * opt.dpr)] }, stat); },
    renderer, camera: cam, canvas,
    dispose() { api.stop(); if (rt) rt.dispose(); renderer.dispose(); canvas.remove(); },
  };
  canvas.addEventListener("pointermove", (ev) => { if (!opt.onHover) return; const r = canvas.getBoundingClientRect(); opt.onHover(api.pick(ev.clientX - r.left, ev.clientY - r.top)); });
  canvas.addEventListener("click", (ev) => { const r = canvas.getBoundingClientRect(); const hit = api.pick(ev.clientX - r.left, ev.clientY - r.top); if (hit) { selected = hit.id; } if (opt.onSelect) opt.onSelect(hit); });
  return api;
}
