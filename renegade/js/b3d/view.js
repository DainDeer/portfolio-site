// SP-100 3D battles: the 3D battle view inside the real game. A pure renderer over the game's own sim (js/battle.js): it
// reads b.units / b.fx and never writes to the sim or calls b.rng. The sim is stepped by G.BattleClock in fixed 1/60 s
// steps (js/battleclock.js), so kill cams, the speed slider and the frame rate change WHEN things happen on screen, never
// WHAT happens. The DOM around the arena (HUD, speed slider, ability bar, touch buttons, tactical pause panel, tooltips)
// is the 2D view's own (js/battleview.js); the arena is WebGL (three r185, vendor/) with a 2D overlay canvas on top for
// HP bars, floating text, aiming and placement. Loaded on demand by js/gfx.js (dynamic import); any failure = 2D.
import * as THREE from "three";
import { createPhysics } from "./physics.js";
import { createFx } from "./fx.js";
import { makeHuman, makeQuad, makeMachine, setHeld, animate, ragdoll, GORE_PARTS, MAIN_PART, setOpacity } from "./figures.js";
import { createLook, loadFxTextures } from "./look.js";
import { loadManifest, loadModels } from "./assets.js";
import { createKillcam } from "./killcam.js";
import { createUnitBatches, LIB_FILE } from "./instancing.js";
import * as greyback from "./scenes/greyback.js";
import * as hushwood from "./scenes/hushwood.js";
import * as drowned from "./scenes/drowned.js";
import * as hollis from "./scenes/hollis.js";
import * as scablands from "./scenes/scablands.js";

const G = window.G;
export const SCENES = { greyback, a: hushwood, b: drowned, hollis, scablands };   // keyed by the game's zone ids
export const hasScene = (zone) => !!SCENES[zone];
const GRUNT_TINTS = [0x66784a, 0x5c6e48, 0x72784e, 0x6a7050];
const RING = { body: 0xffd84a, ally: 0x4aa3ff, enemy: 0xff4a4a };
const KC_GHOST = 0.3;   // a unit the kill cam can't see past from any angle (killcam.js): see-through for that shot
let SESSION = null, texP = null, partsP = null, partsBase = null;   // one WebGL renderer + materials for the whole session (contexts are never leaked per battle)

function session(low) {
  if (SESSION && SESSION.low === low && !SESSION.lost) return SESSION;
  if (SESSION) { try { SESSION.renderer.dispose(); } catch (e) { /* gone */ } }
  const canvas = document.createElement("canvas"); canvas.className = "b3d-gl";
  const { renderer, mats } = createLook(canvas, { low });
  SESSION = { canvas, renderer, mats, low, lost: false };
  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); SESSION.lost = true; if (G.Gfx && G.BattleView.active && G.BattleView.active.is3d) G.Gfx.fallbackLive(G.BattleView.active, "the 3D context was lost"); });
  return SESSION;
}

// SP-100 m3 step 1 (Smudge, props_merged/README.md): one baked static-prop chunk per room. The scene still builds exactly as
// before (physics boxes, hitMeshes, occluders: the scene files and world.js stay frozen, her baker md5-checks them); the
// merged originals then leave the render graph (they keep answering raycasts from their final matrices) and the chunk is
// added at identity. Lights, InstancedMesh scatters, terrain, transparent (water) and the hollis 90x60 floor stay (the
// baker's kept() rule). A chunk missing from the manifest -> nothing changes.
const CHUNKS = { greyback: ["props_merged/greyback_hills.glb"], a: ["props_merged/hushwood_clearing.glb"], b: ["props_merged/drowned_culdesac.glb"],
  scablands: ["props_merged/scablands_railline.glb"], hollis: ["props_merged/hollis_outskirts.glb", "props_merged/hollis_outskirts_ground.glb"] };
function mergeProps(scene, world, assets, files, low) {
  const out = { on: false, removed: [], chunks: [] };
  if (!files || !files.every((f) => assets.has(f))) return out;
  const kept = (o) => o.isLight || o.isInstancedMesh || o === world.terrain || o.userData.terrain
    || [].concat(o.material || []).some((m) => m && m.transparent)
    || (o.isMesh && o.geometry.type === "PlaneGeometry" && o.geometry.parameters.width >= 80)
    || (!o.isMesh && !o.children.length);
  scene.updateMatrixWorld(true);
  for (const o of [...scene.children]) if (!kept(o)) { scene.remove(o); out.removed.push(o); }
  for (const f of files) { const c = assets.clone(f); c.matrixAutoUpdate = false; c.userData.propsMerged = f;
    c.traverse((m) => { if (m.isMesh) { m.castShadow = !low && !f.endsWith("_ground.glb"); m.receiveShadow = true; m.userData.propsMerged = f; } });
    c.updateMatrixWorld(true); scene.add(c); out.chunks.push(c); }
  out.on = true;
  // test/screenshot toggle: put the separate props back (and hide the chunk), or swap again
  out.set = function (on) { on = !!on; if (on === out.on) return out.on;
    for (const o of out.removed) { if (on) scene.remove(o); else scene.add(o); }
    for (const c of out.chunks) c.visible = on; out.on = on; return on; };
  return out;
}

// the loading step: renderer, manifest, this battle's models, the decal textures. step(name) marks progress on the card.
export async function prepare(b, zone, step) {
  const low = G.Gfx.low(), base = G.Gfx.MODELS_BASE, S = session(low), t0 = performance.now();
  step && step("models");
  const man = await loadManifest(base);
  // m3 step 2: Smudge's shared part library + its tables (parts_shared/), for the instanced units. Missing -> clone path
  const ps = man.parts_shared && man.parts_shared.manifest && man.files.includes(LIB_FILE) ? man.parts_shared.manifest : null;
  if (ps && (!partsP || partsBase !== base)) { partsBase = base; partsP = fetch(G.Assets ? G.Assets.url(base + ps) : base + ps).then((r) => (r.ok ? r.json() : null)).catch(() => null); }
  const names = G.Roster3D.filesFor(b, man, SCENES[zone].FILES.concat(CHUNKS[zone] || [], ps ? [LIB_FILE] : []));
  const [assets, tex, parts] = await Promise.all([loadModels(base, names, S.mats), texP || (texP = loadFxTextures("")), ps ? partsP : null]);
  return { zone, man, assets, tex, parts: parts && parts.units ? parts : null, low, ms: performance.now() - t0, files: names.length };
}

export function mount(container, b, opts, v, prep) {
  const BV = G.BattleView, C = DATA.config.battle, OW = C.arenaW * C.pxPerM, OH0 = C.arenaH * C.pxPerM; let OH = OH0;   // OH grows in phone portrait (layout)
  const S = session(prep.low), { renderer, mats } = S, { assets, tex, man } = prep, SC = SCENES[prep.zone], LOW = prep.low;
  Object.assign(v, { b, opts, speed: opts.speed == null ? 1 : opts.speed, is3d: true, done: false, ended: false, raf: 0, drag: null, hover: null, mouse: null, slowmo: 0, last: performance.now(),
    W: OW, H: OH, px: C.pxPerM, art: false, tutSeen: false, clock: G.BattleClock.create(), zone: prep.zone, stung: false, sting: null });
  container.innerHTML = "";
  if (G.Dice && G.Dice.dismissMini) G.Dice.dismissMini();
  const wrap = document.createElement("div"); wrap.className = "battle-wrap b3d";
  const hud = document.createElement("div"); hud.className = "battle-hud";
  const stack = document.createElement("div"); stack.className = "b3d-stack";
  const ov = document.createElement("canvas"); ov.width = OW; ov.height = OH; ov.className = "battle-canvas b3d-overlay"; ov.setAttribute("aria-label", "3D battle");
  const gl = S.canvas; stack.appendChild(gl); stack.appendChild(ov);
  wrap.appendChild(hud); wrap.appendChild(stack); container.appendChild(wrap);
  v.canvas = ov; v.ctx = ov.getContext("2d"); v.hud = hud;
  const bar = document.createElement("div"); bar.className = "ability-bar"; container.appendChild(bar); v.bar = bar; BV.renderBar(v);
  const bottom = document.createElement("div"); bottom.className = "battle-bottom"; container.appendChild(bottom); v.bottom = bottom;
  const tc = document.createElement("div"); tc.className = "touch-ctl"; container.appendChild(tc); v.touchEl = tc;
  BV.renderHud(v);

  // ---- the scene -----------------------------------------------------------------------------------------------------------
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, OW / OH, 0.1, 200);
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rng = mulberry((b.seed >>> 0) ^ 0x9e3779b9);   // render-only randomness (never b.rng, never Math.random in the sim)
  const phys = createPhysics({ bounds: SC.PHYS || { cx: 0, cz: 0, half: 30 } });
  const world = SC.build({ THREE, scene, mats, phys, assets, tex, low: LOW });
  const merged = mergeProps(scene, world, assets, CHUNKS[prep.zone], LOW);   // Smudge's baked static-prop chunk (props_merged/README.md)
  const sceneRoots = new Set(scene.children.concat(merged.removed));   // the zone's own objects (draw-call accounting in v.test.drawStats)
  // units: one InstancedMesh per shared part id (instancing.js); the frame updates the scene's matrices itself (once)
  const batches = createUnitBatches(scene, assets, prep.parts, LOW); scene.matrixWorldAutoUpdate = false;
  const muzzleLight = new THREE.PointLight(0xffb060, 0, 6, 2); scene.add(muzzleLight);
  const fx = createFx(scene, phys, mats, tex, rng, world.ground, assets);
  const kc = createKillcam(camera, { enabled: G.Gfx.killcam(), groundAt: (x, z) => world.ground(x, z).y,
    occluders: () => world.occluders, unitFigs: () => figs().filter((x) => !x.rag && x.fig.visible).map((x) => ({ fig: x.fig, id: x.u.id })),
    ghost: (ids) => { for (const x of vmap.values()) x.kcGhost = ids.includes(x.u.id); },   // the hidden-death fallback: see-through for the shot
    inBounds: world.camBounds, baseTarget: () => camTarget, rng, onFinalEnd: (e, how) => BV.sting(v, how) });   // Vixie (Oct 4): the sting as the final shot ends / is skipped
  v.kc = kc;
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3(); let shake = 0, lastW = 0, lastH = 0;
  // Vixie (Oct 3): in phone portrait the view takes the free height (down to the ability bar and the fixed touch
  // controls) instead of the 1280 x 768 shape, and the camera turns to look up the battle line from behind your side
  // (yours at the bottom, theirs at the top) so the arena's short side spans the narrow screen: the camera comes ~1.7x
  // closer. The overlay keeps 1280 px across; its height follows the view's shape.
  const portrait = () => { const W = window.innerWidth, H = window.innerHeight; return H > W * 1.15 && W < 940; };
  let isPortrait = false;
  function fitPortraitHeight() {
    const want = portrait();
    if (!want) { if (isPortrait) { isPortrait = false; ov.style.height = ""; ov.style.width = ""; if (ov.height !== OH0) { ov.height = OH = OH0; v.H = OH; } } return; }
    isPortrait = true;
    const r = ov.getBoundingClientRect(), tcR = tc.getBoundingClientRect(), fixedTc = tc.offsetParent === null || getComputedStyle(tc).position === "fixed";
    const below = bar.offsetHeight + bottom.offsetHeight + (fixedTc ? (tcR.height || 0) : 0) + 14;
    const css = Math.round(Math.max(r.width * 0.62, Math.min(r.width * 2.1, window.innerHeight - r.top - below)));
    if (Math.abs((parseFloat(ov.style.height) || 0) - css) > 1) { ov.style.width = "100%"; ov.style.height = css + "px"; }
    const oh = Math.round(OW * css / Math.max(1, r.width)); if (Math.abs(oh - ov.height) > 2) { ov.height = OH = oh; v.H = OH; }
  }
  function layout() {
    fitPortraitHeight();
    const r = ov.getBoundingClientRect(), sr = stack.getBoundingClientRect(), w = Math.max(2, Math.round(r.width - 2)), h = Math.max(2, Math.round(r.height - 2));
    gl.style.left = (r.left - sr.left + 1) + "px"; gl.style.top = (r.top - sr.top + 1) + "px"; gl.style.width = w + "px"; gl.style.height = h + "px";
    if (w === lastW && h === lastH) return; lastW = w; lastH = h;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    const pitch = THREE.MathUtils.degToRad(45), tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), hfov = 2 * Math.atan(tv * camera.aspect);
    camTarget.copy(world.camTarget);
    let dist;
    if (isPortrait) {   // across: the arena depth (fitD); up the screen: its length, foreshortened by the pitch
      const across = (world.fitD || world.fitW * 0.6) / 2 / Math.tan(hfov / 2), along = (world.fitW / 2) * Math.sin(pitch) / tv;
      dist = Math.max(10, Math.max(across, along * 0.92));
      camTarget.x += (world.fitW || 0) * 0.04;   // a touch toward their side: yours stand nearer the camera
      camBase.copy(camTarget).add(new THREE.Vector3(-Math.cos(pitch), Math.sin(pitch), 0).multiplyScalar(dist));
    } else {
      dist = Math.max(world.minDist || 16, (world.fitW / 2) / Math.tan(hfov / 2));
      camBase.copy(camTarget).add(new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(dist));
    }
    if (scene.fog) { scene.fog.near = dist + 8; scene.fog.far = dist + 70; }
    v.camDist = dist; v.portrait = isPortrait;
    if (!kc.active()) { camera.position.copy(camBase); camera.lookAt(camTarget); } camera.updateProjectionMatrix();
  }

  // ---- units ---------------------------------------------------------------------------------------------------------------
  const vmap = new Map(); let nAlly = 0, nEnemy = 0;
  const figs = () => [...vmap.values()];
  const ringGeo = new THREE.RingGeometry(0.8, 1, 28).rotateX(-Math.PI / 2), blobGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  const blobMat = new THREE.MeshBasicMaterial({ map: tex.blob, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const ringMats = { body: mats.flat(RING.body, 0.9), ally: mats.flat(RING.ally, 0.8), enemy: mats.flat(RING.enemy, 0.8) };
  function addUnit(u) {
    const spec = G.Roster3D.unitSpec(u, man), i = u.side === 0 ? nAlly++ : nEnemy++; let fig;
    const ws = (w) => G.Roster3D.weaponSpec(w, man);
    if (spec.plan === "human") {
      const sets = u.sets && u.sets[0] ? u.sets : [{ main: u.weapon }], S0 = sets[0], S1 = sets[1];
      fig = makeHuman(mats, assets, { file: spec.file, gear: spec.gear, tint: spec.tint ? GRUNT_TINTS[i % GRUNT_TINTS.length] : null, side: u.side,
        main: ws(S0.main), backup: S1 ? ws(S1.main) : null, off: S0.off ? ws(S0.off) : null, shield: S0.shield ? (G.Roster3D.shieldFile(S0.shield.base, man) || "none") : null });
    } else if (spec.plan === "quad") fig = makeQuad(mats, assets, spec.file, i);
    else fig = makeMachine(mats, assets, spec.plan, spec.file);
    fig.scale.setScalar(spec.scale); scene.add(fig);
    const p = world.map(u.x, u.y); fig.position.copy(p); fig.rotation.y = -u.facing;
    const R = Math.max(0.32, (u.r || 0.5) * world.S * 1.3) * (spec.plan === "quad" && spec.key === "maw" ? 1.3 : 1) * spec.scale;
    const kind = u.side === 0 ? (u.rank === "body" ? "body" : "ally") : "enemy";
    const ring = new THREE.Mesh(ringGeo, ringMats[kind]); ring.scale.setScalar(R); ring.renderOrder = 1; scene.add(ring);
    const blob = LOW ? new THREE.Mesh(blobGeo, blobMat) : null; if (blob) { blob.scale.setScalar(R * 1.1); blob.renderOrder = 1; scene.add(blob); }
    const x = { u, fig, ring, blob, spec, prev: u.state, setIdx: u.setIdx || 0, pos: p.clone(), yaw: -u.facing, walk: 0, shove: new THREE.Vector3(), lastDir: new THREE.Vector3(u.side === 0 ? 1 : -1, 0, 0), gore: false, gibs: 0, rag: null, slump: 0, fade: 1 };
    if (spec.rival) setOpacity(fig, 0.78, true);
    x.inst = batches.add(fig); batches.sync(x.inst);
    vmap.set(u, x); return x;
  }
  for (const u of b.units) addUnit(u);
  const alive = (u) => u.state === "alive";
  const nearest = (sx, sy, pred) => { let best = null, bd = 1e9; for (const x of vmap.values()) { if (pred && !pred(x)) continue; const d = (x.u.x - sx) ** 2 + (x.u.y - sy) ** 2; if (d < bd) { bd = d; best = x; } } return best ? { x: best, d: Math.sqrt(bd) } : null; };
  const height = (x) => (x.fig.userData.height || 1.6) * x.spec.scale;
  const chest = (x) => x.fig.position.clone().add(new THREE.Vector3(0, height(x) * (x.fig.userData.kind === "human" ? 0.68 : x.fig.userData.kind === "hover" ? 0.8 : 0.7), 0));
  const ray = new THREE.Raycaster();
  function castOn(from, dir, far) { ray.set(from, dir); ray.far = far; const h = ray.intersectObjects(world.hitMeshes, false)[0]; if (!h) return null;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0); return { point: h.point, normal: n }; }
  const groundStamp = (p, size, map, grow) => { const g = world.ground(p.x, p.z); fx.stamp(new THREE.Vector3(p.x, g.y + 0.003, p.z), g.n, size, map, grow); };
  const ACID = (DATA.sprites.acidPoolOn || {}).projectile;

  // ---- sim fx -> 3D (called after every sim step, so unit positions are exactly the ones the event was made at) --------------
  const floaters = [], booms = [], arcs = [], textQ = [];
  function onFx(e) {
    if (e.t === "text") { textQ.push(e); return; }
    if (e.t === "shot") {
      const s = nearest(e.x1, e.y1, (x) => !x.rag), sh = s && s.x; if (!sh) { G.Sfx.play(e.sfx); return; }
      const tn = nearest(e.x2, e.y2, (x) => x !== sh && !x.rag), tg = tn && tn.d < 1.5 ? tn.x : null;
      const p2 = tg ? chest(tg) : world.map(e.x2, e.y2).add(new THREE.Vector3(0, 1, 0));
      const d = p2.clone().sub(sh.fig.position); d.y = 0; if (d.lengthSq() < 1e-6) d.set(sh.u.side === 0 ? 1 : -1, 0, 0); d.normalize();
      const U = sh.fig.userData;
      G.Sfx.play(e.sfx); if (!e.hit && !e.melee) setTimeout(() => G.Sfx.play("sfx_miss"), DATA.audio.missDelayMs || 0);
      if (e.melee) { if (U.kind === "human") U.chop = 1; else U.lunge = 1; if (e.hit && tg) { tg.shove.addScaledVector(d, U.kind === "quad" ? 0.6 : 0.3); tg.lastDir.copy(d); } return; }
      U.recoil = 1; sh.fig.updateMatrixWorld(true);
      const w = U.active && !U.active.userData.melee ? U.active : null;
      const muzzle = w ? w.localToWorld(w.userData.muzzle.clone()) : chest(sh).addScaledVector(d, 0.45);
      if (ACID && e.proj === ACID) { fx.tracer(muzzle, p2, 0x9aff3c); fx.glob(p2, 0x9aff3c); if (tg && e.hit) tg.lastDir.copy(d); return; }
      fx.flash(muzzle); muzzleLight.position.copy(muzzle); muzzleLight.intensity = 14;
      if (w) { const ej = w.localToWorld(w.userData.eject.clone()); fx.eject(ej, new THREE.Vector3(-d.z, 0, d.x), null); }
      const pellets = w ? w.userData.pellets || 1 : 1;
      for (let i = 0; i < pellets; i++) {
        const spread = pellets > 1 ? 0.9 : 0;
        if (e.hit && tg && i === 0) { fx.tracer(muzzle, p2); tg.lastDir.copy(d); continue; }
        if (e.hit && pellets > 1 && rng() < 0.5) { fx.tracer(muzzle, p2.clone().add(new THREE.Vector3((rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3))); continue; }
        const off = new THREE.Vector3((rng() - 0.5) * (1.2 + spread), (rng() - 0.5) * (0.6 + spread * 0.5), (rng() - 0.5) * (1.2 + spread));
        const aim = p2.clone().add(off).sub(muzzle).normalize(), hit = castOn(muzzle, aim, 40), end = hit ? hit.point : muzzle.clone().addScaledVector(aim, 20);
        fx.tracer(muzzle, end); if (hit) { fx.spark(hit.point.clone().addScaledVector(hit.normal, 0.05)); fx.stamp(hit.point, hit.normal, 0.12, tex.hole); fx.dust(hit.point); }
      }
    } else if (e.t === "blood") {
      const n = nearest(e.x, e.y), x = n && n.x; if (!x) return;
      if (e.kind === "machine") { if (e.pool) groundStamp(x.fig.position, 1.1, tex.scorch); else { fx.spark(chest(x)); fx.spark(chest(x).add(new THREE.Vector3(0, 0.15, 0))); G.Sfx.play("sfx_hit_metal", { vol: 0.8 }); } return; }
      if (e.pool) { groundStamp(x.fig.position.clone().addScaledVector(x.lastDir, 0.4), 1.5, tex.pool, 2.5); return; }
      const from = chest(x), dir = x.lastDir.clone(); fx.puff(from, dir, e.spray);
      const down = dir.clone(); down.y = -(0.12 + rng() * 0.3); down.normalize();
      const hit = castOn(from, down, 6) || castOn(from, new THREE.Vector3(dir.x * 0.3, -1, dir.z * 0.3).normalize(), 3);
      if (hit) { const s = (0.35 + e.size * 0.55) * (e.spray ? 1.6 : 1); fx.stamp(hit.point, hit.normal, s, e.spray ? tex.spray : tex.blood[(rng() * 3) | 0]); }
      G.Sfx.play("sfx_hit_flesh", { vol: 0.8 });
    } else if (e.t === "death") { const n = nearest(e.x, e.y, (x) => !x.rag); if (n) n.x.gore = n.x.gore || !!e.gore; G.Sfx.play(e.metal ? "sfx_explosion" : e.beast ? "sfx_death_beast" : "sfx_death_human"); }
    else if (e.t === "gibs") { const n = nearest(e.x, e.y); if (n) { n.x.gore = true; n.x.gibs = Math.min(6, 2 + ((e.n || 4) >> 1)); n.x.metalGibs = e.kind === "machine"; } G.Sfx.play(e.kind === "machine" ? "sfx_hit_metal" : "sfx_gib"); }
    else if (e.t === "shake") shake = Math.max(shake, Math.min(0.35, (e.mag || 4) * 0.04));
    else if (e.t === "slowmo") { if (!kc.enabled) v.slowmo = C.slowMoSec; }
    else if (e.t === "drag") { const n = nearest(e.x, e.y); if (n) groundStamp(n.x.fig.position, 0.7, tex.drag); }
    else if (e.t === "shield") { const n = nearest(e.x, e.y); if (n) arcs.push({ x: n.x, rot: e.rot, life: 0.3, max: 0.3 }); }
    else if (e.t === "sfx") G.Sfx.play(e.key);
    else if (e.t === "explosion") { const p = world.map(e.x, e.y); fx.flash(p.clone().add(new THREE.Vector3(0, 0.6, 0)), Math.max(1.2, e.r * world.S * 2)); muzzleLight.position.copy(p).add(new THREE.Vector3(0, 1, 0)); muzzleLight.intensity = 40;
      groundStamp(p, Math.max(1, e.r * world.S * 1.6), tex.scorch); for (let i = 0; i < 4; i++) fx.dust(p.clone().add(new THREE.Vector3((rng() - 0.5) * e.r * world.S, 0.2, (rng() - 0.5) * e.r * world.S))); booms.push({ e, age: 0 }); }
  }
  function onDeath(x) {
    const plan = x.fig.userData.plan || "human", GP = GORE_PARTS[plan] || [];
    const detach = x.gore && GP.length ? GP[(rng() * GP.length) | 0] : null;
    x.rag = ragdoll(phys, scene, x.fig, x.lastDir, x.vel || new THREE.Vector3(), detach, rng); x.ring.visible = false; if (x.blob) x.blob.visible = false;
    if (x.gibs) fx.chunks(chest(x), x.lastDir, x.gibs, x.metalGibs);
    if (x.rag.detached) x.trail = 1.2;
    const main = x.rag.links.find((l) => l.name === MAIN_PART[plan]) || x.rag.links[0];
    const lastOfSide = !b.units.some((u) => u !== x.u && u.side === x.u.side && alive(u));
    kc.enabled = G.Gfx.killcam();
    const still = chest(x).clone(), focus = main ? () => new THREE.Vector3(main.body.position.x, main.body.position.y, main.body.position.z) : () => still;   // every death gets its shot (Vixie)
    kc.request({ id: x.u.id, name: x.u.name, focus, dir: x.lastDir.clone(), drama: 1 + (x.gore ? 1 : 0) + (lastOfSide ? 2 : 0), x: x.fig.position.x, z: x.fig.position.z, final: !!b.over }, rng);   // a death in the step that ended the fight: the fight-ending blow
  }
  // Vixie (Oct 4), the losing blow: your last body going DOWNED (bleeding out, not dead: no ragdoll) when that ends the fight,
  // or (my call) an ally going Critical as the last one standing, counts as a death for the kill cam: the final shot
  function onDowned(x) {
    kc.enabled = G.Gfx.killcam();
    const h = (x.fig.userData.height || 1.6) * 0.45, focus = () => x.fig.localToWorld(new THREE.Vector3(0, h, 0));   // the slumped torso (live)
    kc.request({ id: x.u.id, name: x.u.name, focus, dir: x.lastDir.clone(), drama: 4, x: x.fig.position.x, z: x.fig.position.z, final: true, downed: x.u.state }, rng);
  }
  function onStep() {
    for (const e of b.fx) onFx(e); b.fx.length = 0;
    for (const u of b.units) if (!vmap.has(u)) addUnit(u);   // waves / spawns
    for (const x of vmap.values()) {
      if (x.prev !== x.u.state) { if (x.u.state === "dead" && !x.rag) onDeath(x);
        else if (b.over && b.result === "loss" && x.u.side === 0 && (x.u.state === "downed" || x.u.state === "critical")) onDowned(x);
        x.prev = x.u.state; }
      if ((x.u.setIdx || 0) !== x.setIdx && !x.rag) { x.setIdx = x.u.setIdx || 0; setHeld(x.fig, x.setIdx); }
    }
    // the fight ended: the deaths / the downing that ended it are in a final shot (kc.finalShot), whose end plays the sting;
    // with none (kill cams off, the time cap, Break away) it plays now
    if (b.over && !v.stung && kc.finalShot == null) BV.sting(v);
  }

  // ---- input: the 2D view's handlers, with picking through the camera -------------------------------------------------------
  const ndc = new THREE.Vector2(), tmpV = new THREE.Vector3();
  const toOv = (e) => { const r = ov.getBoundingClientRect(); return { ox: ((e.clientX - r.left) / r.width) * OW, oy: ((e.clientY - r.top) / r.height) * OH, r }; };
  const proj = (p) => { tmpV.copy(p).project(camera); return { x: (tmpV.x + 1) / 2 * OW, y: (1 - tmpV.y) / 2 * OH, ok: tmpV.z < 1 }; };
  function groundAt(e) {
    const o = toOv(e); ndc.set(o.ox / OW * 2 - 1, 1 - o.oy / OH * 2); ray.setFromCamera(ndc, camera); ray.far = 500;
    const h = ray.intersectObject(world.terrain, false)[0]; let s;
    if (h) s = world.toSim(h.point.x, h.point.z); else { const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), q = new THREE.Vector3(); ray.ray.intersectPlane(pl, q); s = world.toSim(q.x, q.z); }
    return { x: Math.max(0, Math.min(b.W, s.x)), y: Math.max(0, Math.min(b.H, s.y)), o };
  }
  const segDist = (px, py, a, c) => { const dx = c.x - a.x, dy = c.y - a.y, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / L)) : 0; return Math.hypot(px - (a.x + dx * t), py - (a.y + dy * t)); };
  function unitAt(o, pred) {
    const tol = 22 * (OW / Math.max(1, o.r.width)); let best = null, bd = 1e9;
    for (const x of vmap.values()) { const u = x.u; if (x.rag || u.state === "dead" || u.state === "fled" || !x.fig.visible || (pred && !pred(u))) continue;
      const a = proj(x.fig.position), c = proj(x.fig.position.clone().add(new THREE.Vector3(0, height(x), 0))), d = segDist(o.ox, o.oy, a, c);
      if (d < tol && d < bd) { bd = d; best = u; } }
    return best;
  }
  function mouseM(e) { const g = groundAt(e), u = unitAt(g.o); return { x: u ? u.x : g.x, y: u ? u.y : g.y, gx: g.x, gy: g.y, unit: u, cx: e.clientX, cy: e.clientY }; }
  function onDown(e) {
    if (v.done) return;
    if (kc.active() && (b.phase === "fight" || b.over) && e.button !== 2) { if (kc.skip()) return; }   // a tap skips the kill shot (the final one too, after the fight ended)
    if (b.itemAim) { if (e.button === 0) BV.itemFire(v, mouseM(e)); else if (e.button === 2) BV.itemCancel(v); return; }
    if (b.aim) { if (e.button === 0) BV.fireAim(v, mouseM(e)); else if (e.button === 2) BV.cancelAim(v); return; }
    if (b.phase !== "place") return;
    const m = mouseM(e); if (m.unit && m.unit.side === 0) v.drag = m.unit;
  }
  function onMove(e) {
    if (v.done) return;
    const m = mouseM(e); v.mouse = m;
    if (v.drag) { v.drag.x = m.gx; v.drag.y = m.gy; return; }
    if (b.aim || b.itemAim) { v.hover = m.unit; G.UI.hideTip(); return; }
    v.hover = m.unit;
    if (m.unit) G.UI.showTip(BV.unitTip(v, m.unit), m.cx, m.cy); else G.UI.hideTip();
  }
  function onUp(e) {
    if (!v.drag) return;
    const m = groundAt(e), cx = Math.max(0, Math.min(C.playerZoneCols - 1, Math.floor(m.x / C.gridCell))), cy = Math.max(0, Math.min(Math.floor(C.arenaH / C.gridCell) - 1, Math.floor(m.y / C.gridCell)));
    if (!G.Battle.placeAt(b, v.drag, cx, cy)) G.Battle.placeAt(b, v.drag, v.drag.cell.cx, v.drag.cell.cy);
    v.drag = null;
  }
  const L = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); L.push([el, ev, fn, o]); };
  on(ov, "mousedown", onDown); on(ov, "mousemove", onMove); on(window, "mouseup", onUp);
  on(ov, "mouseleave", () => { v.hover = null; v.mouse = null; G.UI.hideTip(); });
  on(ov, "contextmenu", (e) => { if (b.itemAim) { e.preventDefault(); BV.itemCancel(v); } else if (b.aim) { e.preventDefault(); BV.cancelAim(v); } });
  on(window, "keydown", (e) => BV.onKey(v, e));
  const tp = (e) => { const t = e.changedTouches[0]; return { clientX: t.clientX, clientY: t.clientY, button: 0 }; };
  on(ov, "touchstart", (e) => { e.preventDefault(); if (e.touches.length > 1) return; const p = tp(e); onMove(p); onDown(p); }, { passive: false });
  on(ov, "touchmove", (e) => { e.preventDefault(); if (v.drag) { onMove(tp(e)); G.UI.hideTip(); } }, { passive: false });
  on(ov, "touchend", (e) => { e.preventDefault(); if (v.drag) { onUp(tp(e)); G.UI.hideTip(); } }, { passive: false });
  on(ov, "touchcancel", () => { if (v.drag) { G.Battle.placeAt(b, v.drag, v.drag.cell.cx, v.drag.cell.cy); v.drag = null; } });

  // ---- per frame -----------------------------------------------------------------------------------------------------------
  // perf: the fight's frames by their REAL time (not the clamped rdt), for Vixie's between-fights rule (G.Gfx.countFrame /
  // noteFps: more than half over 33 ms -> Auto draws the NEXT fight in 2D). Pocket: the first 2.5 s, gaps of 1 s or more,
  // a paused battle (tactical pause / 0x) and a hidden page don't count.
  const perf = { frames: 0, fpsAcc: 0, fpsN: 0, fps: 0, steps: 0, fightFrames: 0, over33: 0, fightMs: 0 };
  function frame(t) {
    const real = t - v.last, rdt = Math.max(0, Math.min(0.05, real / 1000)); v.last = t; perf.frames++;
    if (b.phase === "fight") G.Gfx.countFrame(perf, real, { paused: !!b.paused || v.speed <= 0, hidden: typeof document !== "undefined" && document.hidden });
    perf.fpsAcc += rdt; perf.fpsN++; if (perf.fpsAcc >= 0.5) { perf.fps = Math.round(perf.fpsN / perf.fpsAcc); perf.fpsAcc = 0; perf.fpsN = 0; }
    layout();
    if (b.phase === "fight" && !v.tutSeen && G.TutView) { v.tutSeen = true; G.TutView.check(); }
    const diceHeld = !!(G.Dice && G.Dice.busy()), held = !!(G.TutView && G.TutView.holds()) || diceHeld;
    const base = camBase.clone(); if (shake > 0) { base.add(new THREE.Vector3((rng() - 0.5) * shake, (rng() - 0.5) * shake, (rng() - 0.5) * shake)); shake = Math.max(0, shake - rdt * 1.2); }
    let ts = kc.update(rdt, base, camTarget, { live: b.phase === "fight" && !held && !b.paused && v.speed > 0, over: b.over });   // the 3 s live stretch counts only while the fight runs
    if (!kc.active() && v.slowmo > 0) { ts = C.slowMoOnKill; v.slowmo = Math.max(0, v.slowmo - rdt); }
    if (b.phase === "fight" && !held) perf.steps += G.BattleClock.advance(v.clock, b, rdt, v.speed, ts, onStep);
    else if (b.phase !== "fight") onStep();
    if (!diceHeld) while (textQ.length) { const e = textQ.shift(); floaters.push({ x: e.x, y: e.y, text: e.text, color: e.color, big: e.big, life: e.big ? 1.6 : 1.0, max: e.big ? 1.6 : 1.0, dx: (rng() - 0.5) * 18, rise: 0, global: e.y <= 3.5 && e.big }); }
    if (v.barEls) BV.updateBar(v);
    if (v.touchCancel) BV.updateTouch(v);
    const rate = b.phase === "fight" && !held ? G.Abilities.timeScale(b, v.speed, ts) : 0, dt = rdt * rate;
    for (const x of vmap.values()) updateUnit(x, rdt, dt);
    fx.update(rdt, dt); phys.step(dt); phys.check();
    muzzleLight.intensity = Math.max(0, muzzleLight.intensity - rdt * 160);
    for (const f of floaters) { f.life -= rdt * Math.max(rate, 0.35); f.rise += rdt * 38; } for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].life <= 0) floaters.splice(i, 1);
    for (const a of arcs) a.life -= dt; for (let i = arcs.length - 1; i >= 0; i--) if (arcs[i].life <= 0) arcs.splice(i, 1);
    for (const o of booms) o.age += dt; for (let i = booms.length - 1; i >= 0; i--) if (booms[i].age > 0.4) booms.splice(i, 1);
    batches.update(); renderer.render(scene, camera); perf.calls = renderer.info.render.calls; perf.tris = renderer.info.render.triangles;
    drawOverlay(rdt);
    if (v.timerEl) v.timerEl.textContent = b.phase === "fight" || b.phase === "over" ? (b.mode === "defense" ? `Hold: ${Math.max(0, Math.ceil(b.surviveSec - b.t))} s` : `${b.t.toFixed(1)} s`) : "";
    if (b.over && !v.ended && !diceHeld && !kc.busy()) { v.ended = true; G.Gfx.noteFps(perf); setTimeout(() => v.opts.onEnd && !v.done && v.opts.onEnd(b), 900); }
  }
  function updateUnit(x, rdt, dt) {
    const u = x.u;
    if (x.rag) { for (const l of x.rag.links) phys.sync(l.body, l.mesh);
      if (x.trail > 0 && dt > 0 && x.rag.detached) { x.trail -= dt; const bp = x.rag.detached.body.position; if (rng() < dt * 12) groundStamp(bp, 0.14 + rng() * 0.12, tex.blood[(rng() * 3) | 0]); }
      return; }
    const gone = u.state === "fled" || u.state === "dead";
    if (gone) { x.fade = Math.max(0, x.fade - rdt * 3); if (x.fade <= 0) { x.fig.visible = false; x.ring.visible = false; if (x.blob) x.blob.visible = false; return; } }
    const hidePlace = u.unseen && b.phase === "place"; x.fig.visible = !hidePlace; x.ring.visible = !hidePlace && !gone; if (x.blob) x.blob.visible = !hidePlace;
    const alpha = Math.min(u.unseen ? 0.18 : x.spec.rival ? 0.78 : u.state === "retreating" ? 0.8 : gone ? x.fade : 1, x.kcGhost ? KC_GHOST : 1);
    if (alpha < 1 || x.fig.userData.opacity != null) { setOpacity(x.fig, alpha, x.spec.rival); batches.sync(x.inst); }
    const tgt = world.map(u.x, u.y), prev = x.fig.position.clone();
    if (b.phase !== "fight" || v.drag === u) x.pos.copy(tgt); else x.pos.lerp(tgt, Math.min(1, rdt * 14 * (dt > 0 ? 1 : 0)));
    if (dt > 0) x.shove.multiplyScalar(Math.max(0, 1 - dt * 6));
    const down = u.state === "critical" || u.state === "downed" || !!(u.buffs && u.buffs.knockdown); x.slump += ((down ? 1 : 0) - x.slump) * Math.min(1, rdt * 6);
    x.fig.position.copy(x.pos).add(x.shove); const gy = world.ground(x.fig.position.x, x.fig.position.z).y; x.fig.position.y = gy;
    const moving = Math.hypot(x.fig.position.x - prev.x, x.fig.position.z - prev.z) / Math.max(1e-4, rdt) > 0.2; if (dt > 0 && moving) x.walk += dt * 9;
    x.vel = x.fig.position.clone().sub(prev).divideScalar(Math.max(1e-4, rdt));
    const face = x.fig.userData.kind === "turret" ? 0 : -u.facing;
    let dy = face - x.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; x.yaw += dy * Math.min(1, rdt * 10);
    x.fig.rotation.set(0, x.yaw, 0); if (x.fig.userData.kind !== "hover" && x.fig.userData.kind !== "turret") { x.fig.rotateX(x.slump * 1.35); x.fig.position.y += x.slump * 0.15; }
    animate(x.fig, dt > 0 ? dt : 0, moving && !down, x.walk, u.gunAng != null ? -u.gunAng : -u.facing);
    const rp = x.fig.position; x.ring.position.set(rp.x, gy + 0.03, rp.z); if (x.blob) x.blob.position.set(rp.x, gy + 0.02, rp.z);
  }

  // ---- the overlay: HP bars, labels, floating text, placement grid, aiming, tactical pause --------------------------------------
  const ctx = v.ctx, SPR = G.Sprites, U = G.Util;
  const TL = () => !!(G.Touch && G.Touch.layout());
  const simP = (sx, sy, lift) => { const p = world.map(sx, sy); p.y += lift || 0; return proj(p); };
  function groundPath(pts, close) { ctx.beginPath(); pts.forEach((q, i) => { const s = simP(q[0], q[1], 0.03); if (i) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); }); if (close) ctx.closePath(); }
  const circlePts = (cx, cy, r, n) => Array.from({ length: (n || 40) + 1 }, (_, i) => [cx + Math.cos(i / (n || 40) * 6.2832) * r, cy + Math.sin(i / (n || 40) * 6.2832) * r]);
  const line = (x0, y0, x1, y1, n) => Array.from({ length: (n || 8) + 1 }, (_, i) => [x0 + (x1 - x0) * i / (n || 8), y0 + (y1 - y0) * i / (n || 8)]);
  const headP = (x, extra) => proj(x.fig.position.clone().add(new THREE.Vector3(0, height(x) + (extra || 0.25), 0)));
  const chestP = (x) => proj(chest(x));
  const label = (t, x, y, col, size, align) => { ctx.font = `bold ${size || 13}px sans-serif`; ctx.textAlign = align || "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
  function drawOverlay() {
    ctx.clearRect(0, 0, OW, OH); ctx.save();
    const fk = TL() && ov.clientWidth ? OW / ov.clientWidth : 0, fp = C.phoneFloatPx || { word: 10, num: 8 }, fsz = (base, word) => (fk ? Math.max(base, Math.round((word ? fp.word : fp.num) * fk)) : base);
    if (b.phase === "place") {
      const cols = C.playerZoneCols, rows = Math.floor(C.arenaH / C.gridCell), gc = C.gridCell;
      groundPath([...line(0, 0, cols * gc, 0), ...line(cols * gc, 0, cols * gc, C.arenaH), ...line(cols * gc, C.arenaH, 0, C.arenaH), ...line(0, C.arenaH, 0, 0)], true); ctx.fillStyle = "rgba(80,160,255,0.16)"; ctx.fill();
      ctx.strokeStyle = "rgba(120,190,255,0.55)"; ctx.lineWidth = 1.5;
      for (let i = 0; i <= cols; i++) { groundPath(line(i * gc, 0, i * gc, C.arenaH)); ctx.stroke(); }
      for (let j = 0; j <= rows; j++) { groundPath(line(0, j * gc, cols * gc, j * gc)); ctx.stroke(); }
      groundPath([...line(C.enemyZoneFromX, 0, C.arenaW, 0), ...line(C.arenaW, 0, C.arenaW, C.arenaH), ...line(C.arenaW, C.arenaH, C.enemyZoneFromX, C.arenaH), ...line(C.enemyZoneFromX, C.arenaH, C.enemyZoneFromX, 0)], true); ctx.fillStyle = "rgba(255,80,80,0.10)"; ctx.fill();
    }
    for (const z of b.zones || []) { const fade = U.clamp(z.t / 0.6, 0, 1) * U.clamp((z.max - z.t) / 0.3, 0, 1); groundPath(circlePts(z.x, z.y, z.r), true);
      if (z.kind === "smoke") { ctx.fillStyle = `rgba(190,196,196,${0.45 * fade})`; ctx.fill(); } else { ctx.fillStyle = `rgba(255,70,40,${0.12 * fade})`; ctx.fill(); ctx.setLineDash([6, 5]); ctx.strokeStyle = `rgba(255,90,60,${0.8 * fade})`; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); } }
    for (const n of b.nades || []) { const f = U.clamp(1 - (n.t - n.d.fuseSec / 2) / (n.d.fuseSec / 2), 0, 1), sx = n.sx + (n.x - n.sx) * f, sy = n.sy + (n.y - n.sy) * f, p = simP(sx, sy, 0.15 + Math.sin(f * Math.PI) * 1.6);
      SPR.drawWorld(ctx, "fx_grenade", p.x, p.y, 16, { rot: f * 12 }); if (f >= 1 && Math.floor(b.t * 8) % 2) { groundPath(circlePts(n.x, n.y, n.d.radiusM), true); ctx.strokeStyle = "rgba(255,80,40,.6)"; ctx.lineWidth = 1.5; ctx.stroke(); } }
    for (const o of booms) { const p = simP(o.e.x, o.e.y, 0.5), d = SPR.def("fx_explosion") || {}; if (SPR.get("fx_explosion")) SPR.drawWorld(ctx, "fx_explosion", p.x, p.y, 64, { frame: Math.min(3, Math.floor(o.age * (d.fps || 12))), scale: (o.e.r * 40) / (64 * (DATA.sprites.texelScale || 1)) }); }
    // aiming: ground rings + valid targets (under the unit labels)
    const body = BV.body(v), aimS = b.aim && body && body.abl[b.aim.i];
    if (aimS) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(0, 0, OW, OH); const d = aimS.d, R = G.Abilities.range(body, d);
      if (R) { groundPath(circlePts(body.x, body.y, R, 64), true); ctx.fillStyle = "rgba(255,224,128,.07)"; ctx.fill(); ctx.setLineDash([8, 6]); ctx.strokeStyle = "rgba(255,224,128,.85)"; ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]); }
      for (const o of G.Abilities.validTargets(b, body, aimS)) { groundPath(circlePts(o.x, o.y, 0.95, 24), true); ctx.strokeStyle = o.side === body.side ? "rgba(96,255,144,.9)" : "rgba(255,90,60,.95)"; ctx.lineWidth = 3; ctx.stroke(); }
      const m = v.mouse; if (m && d.target === "ground" && d.radiusM) { const inR = Math.hypot(m.gx - body.x, m.gy - body.y) <= R; groundPath(circlePts(m.gx, m.gy, d.radiusM, 40), true); ctx.fillStyle = inR ? "rgba(255,160,60,.18)" : "rgba(160,160,160,.12)"; ctx.fill(); ctx.strokeStyle = inR ? "rgba(255,160,60,.9)" : "rgba(160,160,160,.7)"; ctx.lineWidth = 2; ctx.stroke(); } }
    if (b.paused && b.itemAim) for (const u of b.units) if (u.side === 0 && alive(u)) { const ok = !G.Tactical.itemBlock(b, b.itemAim.kind, u); groundPath(circlePts(u.x, u.y, 0.95, 24), true); ctx.strokeStyle = ok ? "rgba(96,255,144,.9)" : "rgba(150,150,150,.6)"; ctx.lineWidth = 3; ctx.stroke(); }
    // per unit: HP bar, reload, bleed, elite, labels, behaviour marks
    for (const x of vmap.values()) {
      const u = x.u; if (x.rag || !x.fig.visible || u.state === "dead" || u.state === "fled") continue;
      const hp = headP(x), down = u.state === "critical" || u.state === "downed";
      if (!hp.ok) continue;
      if (u.state === "downed") { label("DOWNED — bleeding out", hp.x, hp.y - 4, "#ff4040", fsz(13, true)); continue; }
      if (u.state === "critical") { label("CRITICAL", hp.x, hp.y - 4, "#ff9030", fsz(11, true)); continue; }
      const bw = 40, hpF = U.clamp(u.hp / u.maxHp, 0, 1), by = Math.round(hp.y);
      ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(hp.x - bw / 2, by, bw, 5);
      ctx.fillStyle = hpF > 0.5 ? "#5fd35f" : hpF > 0.25 ? "#e0c040" : "#e04040"; ctx.fillRect(hp.x - bw / 2, by, bw * hpF, 5);
      if (u.reloadT > 0) { ctx.fillStyle = "#aaa"; ctx.fillRect(hp.x - bw / 2, by + 6, bw * (1 - u.reloadT / Math.max(0.1, u.weapon.reload + 2)), 2); }
      if (u.bleeds && u.bleeds.length) { ctx.fillStyle = "#c00"; ctx.fillRect(hp.x + bw / 2 + 2, by, 4, 4); }
      if (u.elite) label("★", hp.x - bw / 2 - 8, by + 6, "#ffd84a", 12);
      if (v.hover === u) { const ft = proj(x.fig.position); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.strokeRect(hp.x - bw / 2 - 3, by - 3, bw + 6, Math.max(12, ft.y - by + 6)); }
      if (u.ventT > 0) label("VENTING", hp.x, by - 8, "#c0e0ff", 11);
      if (u.fuse != null && alive(u) && Math.floor(b.t * 10) % 2 && u.beh && u.beh.mine) { groundPath(circlePts(u.x, u.y, u.beh.mine.radiusM), true); ctx.strokeStyle = "rgba(255,40,40,.75)"; ctx.lineWidth = 2; ctx.stroke(); }
      if (u.buffs && u.buffs.marked) { const c = chestP(x); SPR.drawWorld(ctx, "fx_mark", c.x, c.y, 36, { alpha: 0.6 + 0.4 * Math.sin(b.t * 8) }); }
      if (u.burns && u.burns.length) { const f = proj(x.fig.position.clone().add(new THREE.Vector3(0, 0.3, 0))); SPR.drawWorld(ctx, "fx_fire", f.x, f.y, 30, { alpha: 0.75 + 0.25 * Math.sin(b.t * 11) }); }
      if (u.channel && alive(u)) { const c = u.channel, w = 50, y0 = by - 14; ctx.fillStyle = "rgba(0,0,0,.7)"; ctx.fillRect(hp.x - w / 2, y0, w, 6); ctx.fillStyle = "#7ee0ff"; ctx.fillRect(hp.x - w / 2, y0, w * U.clamp(c.t / c.max, 0, 1), 6); label(c.kind === "escape" ? "Breaking away" : "Med kit", hp.x, y0 - 3, "#bfefff", 10); }
      if (u.side === 0 && u.medCd > 0 && alive(u)) { const cx = hp.x + bw / 2 + 14, cy = by + 2, f = u.medCd / Math.max(0.01, u.medCdMax || u.medCd); ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.beginPath(); ctx.arc(cx, cy, 9, 0, 7); ctx.fill(); ctx.strokeStyle = "#e05050"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke(); label(String(Math.ceil(u.medCd)), cx, cy + 3.5, "#ffd0d0", 10); }
      void down;
    }
    // Marksman aim lines + the Hunter Captain's burst telegraph
    for (const x of vmap.values()) { const u = x.u; if (x.rag || !alive(u)) continue;
      if (u.aimT > 0 && u.aimTgt) { const f = 1 - u.aimT / (u.aimMax || 1.5), t2 = vmap.get(u.aimTgt); if (t2) { const a = chestP(x), c = chestP(t2); ctx.save(); ctx.strokeStyle = `rgba(255,40,40,${0.35 + 0.55 * f})`; ctx.lineWidth = 1 + f * 1.5; ctx.setLineDash(f > 0.8 ? [] : [6, 4]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke(); ctx.restore(); } }
      if (u.cb) { const c = u.cb, Ld = (c.tgt ? Math.hypot(c.tgt.x - u.x, c.tgt.y - u.y) : 10) + 4, f = c.phase === "fire" ? 1 : 1 - c.t / (c.max || 1.5);
        ctx.save(); if (c.phase === "aim" && !c.locked) { ctx.strokeStyle = `rgba(255,60,40,${0.6 + 0.35 * f})`; ctx.lineWidth = 2.5; ctx.setLineDash([10, 5]); } else { ctx.strokeStyle = c.phase === "fire" ? "rgba(255,210,120,0.5)" : `rgba(255,30,30,${0.6 + 0.4 * Math.abs(Math.sin(performance.now() / 60))})`; ctx.lineWidth = c.phase === "fire" ? 2 : 4; }
        groundPath(line(u.x, u.y, u.x + Math.cos(c.ang) * Ld, u.y + Math.sin(c.ang) * Ld, 12)); ctx.stroke(); ctx.restore();
        if (c.phase === "aim") { const hp = headP(x, 0.6); label(c.locked ? "LOCKED - MOVE!" : `BURST IN ${U.fmt1(Math.max(0, c.t))}s`, hp.x, hp.y - 10, c.locked ? "#ff3030" : "#ff8060", 13); } } }
    for (const a of arcs) { const c = chestP(a.x); SPR.drawWorld(ctx, "fx_shield_arc", c.x, c.y, 48, { rot: a.rot, alpha: a.life / a.max }); }
    // floating combat text (the sim's floatText), banners ("FIGHT!", waves) up top
    for (const f of floaters) { ctx.globalAlpha = U.clamp(f.life / f.max * 1.5, 0, 1); const word = /[A-Za-z]{2}/.test(f.text), size = fsz(f.big ? 18 : 13, word) * (f.big && fk ? 1.3 : 1);
      if (f.global) label(f.text, OW / 2, 70 - f.rise * 0.2, f.color, Math.round(size * 1.6));
      else { const p = simP(f.x, f.y + 0.9, 2.1); label(f.text, p.x + f.dx * (1 - f.life / f.max), p.y - f.rise, f.color, Math.round(size)); } }
    ctx.globalAlpha = 1;
    if (G.XPFloat && G.XPFloat.battle.length) for (const f of G.XPFloat.battle) { const x = vmap.get(f.unit); if (!x || x.rag) continue; const st = G.XPFloat.battleStyle(f), c = chestP(x); ctx.globalAlpha = st.alpha;
      ctx.font = "11px sans-serif"; ctx.textAlign = "left"; ctx.lineWidth = 2.5; ctx.strokeStyle = "rgba(0,0,0,.8)"; ctx.strokeText(f.text, c.x + 26, c.y - f.idx * 12 - st.rise); ctx.fillStyle = f.color; ctx.fillText(f.text, c.x + 26, c.y - f.idx * 12 - st.rise); }
    ctx.globalAlpha = 1;
    // tactical pause: queued actions over their units, the blue frame
    const q = (G.Tactical && b.tq) || [], per = new Map();
    q.forEach((a, k) => { const x = vmap.get(a.u); if (!x) return; const n = per.get(a.u) || 0; per.set(a.u, n + 1); const hp = headP(x, 0.7), ix = hp.x + (n - 0.5) * 26 + 13, iy = hp.y - 14;
      ctx.fillStyle = "rgba(0,0,0,.75)"; ctx.strokeStyle = "#ffe080"; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(ix - 13, iy - 13, 26, 26); ctx.fill(); ctx.stroke();
      SPR.drawWorld(ctx, a.kind === "ability" ? a.u.abl[a.i].d.icon : a.kind === "escape" ? "ui_break_away" : DATA.resources.med.sprite, ix, iy, 20, {}); label(String(k + 1), ix + 11, iy + 13, "#ffe080", 11);
      if (a.kind === "ability" && a.tgt) { const tp = a.tgt.side != null && vmap.get(a.tgt) ? chestP(vmap.get(a.tgt)) : simP(a.tgt.x, a.tgt.y, 0.05), sp = chestP(x); ctx.setLineDash([5, 5]); ctx.strokeStyle = "rgba(255,224,128,.7)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(tp.x, tp.y); ctx.stroke(); ctx.setLineDash([]); SPR.drawWorld(ctx, "ui_aim_reticle", tp.x, tp.y, 32, { alpha: 0.8 }); } });
    if (b.paused) { ctx.fillStyle = "rgba(20,40,70,.3)"; ctx.fillRect(0, 0, OW, OH); ctx.strokeStyle = "rgba(120,190,255,.8)"; ctx.lineWidth = 4; ctx.strokeRect(2, 2, OW - 4, OH - 4);
      const t = TL() ? (b.itemAim ? "MED KIT: tap one of your units · tap Cancel aim" : "⏸ TACTICAL PAUSE · tap Resume") : b.itemAim ? "MED KIT: click one of your units · right click / Esc cancels" : "⏸ TACTICAL PAUSE · Space resumes";
      if (!b.aim) label(t, OW / 2, 36, "#bfe4ff", fsz(22, true)); }
    if (aimS) { const d = aimS.d, m = v.mouse;
      if (m) { const tgt = BV.aimTarget(v, m), R = G.Abilities.range(body, d), inR = d.target === "ground" ? Math.hypot(m.gx - body.x, m.gy - body.y) <= R : !!tgt;
        const tx = tgt && tgt.side != null && vmap.get(tgt) ? chestP(vmap.get(tgt)) : simP(m.gx, m.gy, 0.05);
        SPR.drawWorld(ctx, "ui_aim_reticle", tx.x, tx.y, 38, { alpha: inR ? 1 : 0.5 });
        const hc = tgt && tgt.side != null ? G.Abilities.hitChance(b, body, aimS, tgt) : null, lb = hc != null ? `${Math.round(hc)}% hit` : !inR ? "out of range" : "";
        if (lb) label(lb, tx.x + 18, tx.y - 14, hc != null ? "#ffe080" : "#bbb", fsz(13, true), "left"); }
      const mode = b.paused ? "TACTICAL PAUSE: it queues" : (G.state.settings && G.state.settings.aimMode) === "pause" ? "PAUSED" : "SLOW-MO 25%";
      label(TL() ? `${d.name.toUpperCase()}: tap ${d.target === "ground" ? "a spot" : "a target"} · tap Cancel aim · ${mode}` : `${d.name.toUpperCase()}: left click ${d.target === "ground" ? "a spot" : "a target"} · right click / Esc cancels · ${mode}`, OW / 2, 22, "#ffe080", fsz(14, true)); }
    if (kc.active() && (kc.phase === "in" || kc.phase === "hold")) label(TL() ? "KILL SHOT · tap to skip" : "KILL SHOT · click to skip", OW - 12, OH - 14, "rgba(255,255,255,.75)", fsz(12, true), "right");
    ctx.restore();
  }

  // ---- warm-up, loop, teardown ----------------------------------------------------------------------------------------------
  layout(); camera.position.copy(camBase); camera.lookAt(camTarget);
  fx.flash(new THREE.Vector3(0, -50, 0)); fx.tracer(new THREE.Vector3(0, -50, 0), new THREE.Vector3(1, -50, 0));
  try { renderer.compile(scene, camera); } catch (e) { /* first frame compiles */ }
  const loop = (t) => { if (v.done) return; try { frame(t); } catch (err) { console.error("[3D battle]", err); G.Gfx.fallbackLive(v, "the 3D view hit an error"); return; } v.raf = requestAnimationFrame(loop); };
  v.raf = requestAnimationFrame(loop);
  let disposed = false;
  v.dispose = function () {
    if (disposed) return; disposed = true;
    v.done = true; cancelAnimationFrame(v.raf); for (const [el, ev, fn, o] of L) el.removeEventListener(ev, fn, o); L.length = 0;
    batches.dispose(); fx.dispose();
    const geometries = new Set([ringGeo, blobGeo]), materials = new Set([blobMat]), objects = new Set();
    const collect = (o) => { if (objects.has(o)) return; objects.add(o);
      if (o.geometry && !assets.shared(o.geometry)) geometries.add(o.geometry);
      for (const m of [].concat(o.material || [])) materials.add(m);
      if (o.isInstancedMesh) o.dispose();   // instance buffers are separate from geometry
      if (o.shadow) o.shadow.dispose(); };   // per-scene shadow render targets; the renderer survives
    scene.traverse(collect);
    for (const r of merged.removed) r.traverse(collect);
    for (const x of vmap.values()) { x.fig.traverse(collect);
      for (const [original, copy] of x.fig.userData.matCopies || []) { materials.add(original); materials.add(copy); }
      if (x.rag) for (const l of x.rag.links) l.mesh.traverse(collect); }
    for (const g of geometries) g.dispose();
    for (const m of materials) if (!assets.shared(m) && !mats.shared(m)) m.dispose();
    phys.clearDynamic(); phys.clearStatic(); scene.clear(); renderer.renderLists.dispose();
    if (gl.parentNode) gl.parentNode.removeChild(gl);
  };
  // read-only test hook (Playwright): the view's state + a manual pump (the real frame function at given real-time deltas)
  v.test = {
    state: () => ({ is3d: true, zone: prep.zone, t: b.t, over: b.over, result: b.result, phase: b.phase, steps: v.clock.steps, fps: perf.fps, frames: perf.frames, fightFrames: perf.fightFrames, over33: perf.over33,
      sting: v.sting || null, killcam: { enabled: kc.enabled, phase: kc.phase, finalShot: kc.finalShot, shots: kc.shots, cuts: kc.cuts, queued: kc.queued, ghostShots: kc.ghostShots, swings: kc.swings, pending: kc.pending(), liveLeft: kc.liveLeft(), skipped: kc.skipped, merged: kc.merged, tapped: kc.tapped, off: kc.off,
        log: kc.log.map((e) => Object.assign({}, e, { ids: e.ids.slice(), tapped: !!e.tapped })) }, fx: fx.live(), phys: phys.stats(), low: LOW,
      portrait: isPortrait, camDist: v.camDist, overlay: [ov.width, ov.height], units: [...vmap.values()].map((x) => ({ name: x.u.name, side: x.u.side, state: x.u.state, key: x.spec.key, file: x.spec.file, glb: !!x.fig.userData.glb, rag: !!x.rag,
        ghost: !!x.kcGhost, opacity: x.fig.userData.opacity == null ? 1 : x.fig.userData.opacity, instanced: !!(x.inst && x.inst.on) })),
      instancing: batches.state(), assets: assets.report(), files: prep.files, loadMs: Math.round(prep.ms) }),
    pump: (dtsMs) => { cancelAnimationFrame(v.raf); let t = v.last; for (const d of dtsMs) { t += d; frame(t); } v.raf = requestAnimationFrame(loop); return v.test.state(); },
    skipKillcam: () => kc.skip(),
    // a hidden death on demand: the standing unit nearest the line moves onto it, frac of the way from the first victim to
    // the camera (sim position too: only for a test fight whose outcome doesn't matter). Returns what blocks the view now
    blockKillcam: (frac) => { const c = kc.current(); if (!c) return null; const f = c.focus[0], p = f.clone().lerp(camera.position, frac || 0.3);
      const xs = figs().filter((x) => !x.rag && x.fig.visible && alive(x.u) && !c.ids.includes(x.u.id)).sort((a, z) => a.fig.position.distanceTo(p) - z.fig.position.distanceTo(p)); if (!xs.length) return null;
      const x = xs[0], sp = world.toSim(p.x, p.z); x.u.x = sp.x; x.u.y = sp.y; x.pos.copy(world.map(sp.x, sp.y)); x.fig.position.copy(x.pos); x.fig.position.y = world.ground(x.pos.x, x.pos.z).y; scene.updateMatrixWorld();
      return Object.assign(v.test.kcSight(), { moved: x.u.name }); },
    // what blocks the kill cam's view of its victims right now ({ blocked rays, units by name, props, ghosted }), null when idle
    kcSight: () => { scene.updateMatrixWorld(); const r = kc.sightNow(); if (!r) return r; const nm = (id) => { const x = figs().find((y) => y.u.id === id); return x ? x.u.name : id; };
      return Object.assign(r, { units: r.units.map(nm), ghosted: r.ghosted.map(nm) }); },
    // A/B: "m2" = milestone 2's rule (a full shot for every death outside a shot), "merge" = Vixie's merge window (default)
    killcamLimit: (n) => { kc.maxCands = n || 0; return kc.maxCands; },   // the ghost fallback on demand: only n candidate angles
    setKillcamRules: (r) => { kc.rules = r === "m2" ? "m2" : "merge"; return kc.rules; },
    // props_merged before/after: false puts the separate static props back (chunk hidden), true swaps the chunk in again
    // instanced units on / off (off = every unit on its own meshes, the pre-m3 path), and what's on which path
    setInstancing: (on) => batches.set(on),
    instancing: () => batches.state(),
    // n blood decals stamped on a grid over the arena (render-only: the sim never sees decals); returns fx.live()
    stampDecals: (n) => { for (let i = 0; i < n; i++) groundStamp(world.map(b.W * (0.1 + 0.8 * ((i * 7) % 10) / 9), b.H * (0.15 + 0.7 * ((i * 3) % 8) / 7)), 0.6, tex.blood[i % 3]); return fx.live(); },
    // a kill-cam occlusion ray straight through a standing unit's chest (side to side): blocked by its real meshes even
    // while it draws instanced (layer 1); a layer-0-only ray would miss it
    occlusionThrough: (i) => { const x = figs().filter((y) => !y.rag && y.fig.visible)[i || 0]; if (!x) return null; scene.updateMatrixWorld();
      const c = chest(x), a = c.clone().add(new THREE.Vector3(0, 0, 2)), z = c.clone().add(new THREE.Vector3(0, 0, -2)), r0 = new THREE.Raycaster(a, new THREE.Vector3(0, 0, -1), 0, 4);
      return { name: x.u.name, instanced: !!(x.inst && x.inst.on), killcam: kc.occluded(a, z), layer0: r0.intersectObject(x.fig, true).length > 0 }; },
    setMerged: (on) => merged.set ? merged.set(on) : false,
    // pixel A/B of the current frame (no time passes): render with toggle(true), then toggle(false), read the drawing buffer
    // right after each render; returns the differing pixel count (any channel), the largest channel delta, and with
    // images=true the two frames + |A-B| x 8 as PNG data urls. The toggle is left on.
    compare: (toggle, images) => {
      const g = renderer.getContext(), snap = () => { renderer.render(scene, camera); const w = g.drawingBufferWidth, h = g.drawingBufferHeight, px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px); return { w, h, px }; };
      toggle(true); const A = snap(); toggle(false); const B = snap(); toggle(true); renderer.render(scene, camera);
      let n = 0, max = 0; const D = new Uint8Array(A.px.length);
      for (let i = 0; i < A.px.length; i += 4) { let m = 0; for (let c = 0; c < 3; c++) { const d = Math.abs(A.px[i + c] - B.px[i + c]); if (d > m) m = d; D[i + c] = Math.min(255, d * 8); } D[i + 3] = 255; if (m) { n++; if (m > max) max = m; } }
      const out = { w: A.w, h: A.h, pixels: A.w * A.h, differing: n, maxDelta: max };
      if (images) { const url = (px) => { const c = document.createElement("canvas"); c.width = A.w; c.height = A.h; const x = c.getContext("2d"), im = x.createImageData(A.w, A.h);
          for (let y = 0; y < A.h; y++) im.data.set(px.subarray((A.h - 1 - y) * A.w * 4, (A.h - y) * A.w * 4), y * A.w * 4); for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255; x.putImageData(im, 0, 0); return c.toDataURL("image/png"); };
        out.a = url(A.px); out.b = url(B.px); out.d = url(D); }
      return out;
    },
    merged: () => ({ available: !!merged.set, on: merged.on, removed: merged.removed.length, chunks: merged.chunks.map((c) => c.userData.propsMerged) }),
    // draw calls: the renderer's count for the last frame (main pass + shadow pass), and an estimate of the main pass by
    // what draws it (zone props by file, terrain / ground, instanced scatter, units, fx), only meshes in the camera's view
    drawStats: () => {
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const unitObjs = new Map(); for (const s of scene.children) if (s.userData.unitBatch) unitObjs.set(s, "instanced"); for (const x of vmap.values()) { x.fig.traverse((o) => unitObjs.set(o, "figure")); unitObjs.set(x.ring, "ring"); if (x.blob) unitObjs.set(x.blob, "blob"); if (x.rag) for (const l of x.rag.links) l.mesh.traverse((o) => unitObjs.set(o, "ragdoll")); }
      const out = { calls: perf.calls, tris: perf.tris, main: 0, casters: 0, shadows: renderer.shadowMap.enabled, by: { scene: 0, units: 0, fx: 0 }, props: {}, unitParts: {}, fxParts: {} };
      const rootOf = (o) => { while (o.parent && o.parent !== scene) o = o.parent; return o; };
      scene.traverseVisible((o) => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.layers.test(camera.layers)) return;
        const n = Array.isArray(o.material) ? (o.geometry.groups.length || o.material.length) : 1;
        if (o.castShadow) out.casters += n;
        if (o.frustumCulled !== false && o.geometry) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!o.isInstancedMesh && !fr.intersectsObject(o)) return; }
        out.main += n; const r = rootOf(o);
        if (unitObjs.has(o)) { out.by.units += n; const k = unitObjs.get(o); out.unitParts[k] = (out.unitParts[k] || 0) + n; }
        else if (sceneRoots.has(r)) { out.by.scene += n; const k = r.userData.prop || (r.userData.propsMerged ? "merged:" + r.userData.propsMerged.replace(/^.*\//, "") : r.userData.scatter ? "scatter:" + r.userData.scatter : r.userData.terrain ? "terrain" : r.isLight ? "light" : (o.geometry && o.geometry.type) || "mesh"); out.props[k] = (out.props[k] || 0) + n; }
        else { out.by.fx += n; const k = o.userData.fx || o.name || (o.isPoints ? "points" : o.isInstancedMesh ? "instanced" : (o.material && o.material.map ? "decal/sprite" : (o.geometry && o.geometry.type) || "mesh")); out.fxParts[k] = (out.fxParts[k] || 0) + n; }
      });
      return out;
    }
  };
  G.BattleView.active = v;
  return v;
}
