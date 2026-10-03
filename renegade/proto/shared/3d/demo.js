// Battle 3D prototypes (shared): the demo runner. One simulated example fight; the game's own sim decides everything
// (simbridge.js). This is the loop, the fixed 3/4 camera (45° pitch, Vixie Oct 3) + kill shots, controls, the loading card
// with timings, and the bridge from sim fx to 3D (fx.js, figures.js, physics.js). Each demo (battle3d_goats,
// battle3d_urban) passes its world builder, fight spec and unit looks: runDemo(cfg).
// URL: ?look=smooth (testing; toggle shown with ?debug), ?q=low (phone quality), ?seed=N, ?killcam=0, ?assets=none|all, ?debug.
import * as THREE from "three";
import { createPhysics } from "./physics.js";
import { createFx, CAPS } from "./fx.js";
import { makeHuman, makeGoat, setHeld, animate, ragdoll, GORE_PARTS } from "./figures.js";
import { createLook, loadFxTextures, createSfx } from "./look.js";
import { loadAssets3d } from "./assets3d.js";
import { createKillcam, KC } from "./killcam.js";
import { loadGame, buildFight, startFight, stepFight, applySwapRule } from "./simbridge.js";

const ROOT = "../../", SIM_DT = 1 / 30, SPEEDS = { 1: 0.25, 2: 0.5, 3: 1, 4: 2 };
export function combatStartBeat() { return Promise.resolve(); }   // the real rule lands the reveal on the first beat after loading

export function runDemo(cfg) {
  const T = { libraries: performance.now() - (window.__protoT0 || 0) };
  const params = new URLSearchParams(location.search), DEBUG = params.has("debug");
  const LOOK = params.get("look") === "smooth" ? "smooth" : "chunky";
  const LOW = params.get("q") === "low" || (window.matchMedia && matchMedia("(pointer: coarse)").matches) || Math.min(innerWidth, innerHeight) < 560;
  const $ = (id) => document.getElementById(id), cardList = $("load-steps");
  const stepLine = (name, ms) => { const li = document.createElement("li"); li.innerHTML = "<span></span><b></b>"; li.firstChild.textContent = name; li.lastChild.textContent = ms == null ? "…" : Math.round(ms) + " ms"; cardList.appendChild(li); return li; };
  stepLine("libraries (three r185, cannon-es 0.20)", T.libraries);

  const canvas = $("view"), { renderer, mats } = createLook(canvas, { look: LOOK, low: LOW });
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200), sfx = createSfx(ROOT);
  let phys = null, fx = null, world = null, assets = null, tex = null, kc = null, controls = null;

  // ---- the fixed camera: 3/4 overhead, 45° pitch (both demos), fitted to the arena width ------------------------------------
  const camBase = new THREE.Vector3(), camTarget = new THREE.Vector3(); let shake = 0;
  function fitCamera() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
    // portrait phones: same 45° pitch, but turned 90° (from behind the left side) so the arena's long axis runs up the
    // screen, with a wider lens; otherwise the 22 m arena only fits at ~75 m away
    const portrait = camera.aspect < 0.8; camera.fov = portrait ? 55 : 40;
    const pitch = THREE.MathUtils.degToRad(45), yaw = THREE.MathUtils.degToRad((cfg.yaw || 0) + (portrait ? 90 : 0)), hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
    const fitW = portrait ? world.fitD : world.fitW, dist = Math.max(world.minDist || 16, (fitW / 2) / Math.tan(hfov / 2));
    if (scene.fog) { scene.fog.near = dist + 8; scene.fog.far = dist + 70; }
    camTarget.copy(world.camTarget);
    camBase.copy(camTarget).add(new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist));
    camera.position.copy(camBase); camera.lookAt(camTarget); camera.updateProjectionMatrix();
  }
  addEventListener("resize", () => world && fitCamera());

  // ---- the fight ------------------------------------------------------------------------------------------------------------
  let b = null, rngFx = null, size = +params.get("size") || (cfg.sizes ? cfg.sizes[0] : 0);
  if (cfg.sizes && !cfg.sizes.includes(size)) size = cfg.sizes[0];
  const defaultSeed = () => (cfg.defaultSeeds ? cfg.defaultSeeds[size] : cfg.defaultSeed);
  let seed = +params.get("seed") || defaultSeed();
  let units = [], paused = false, speed = 3, slowUntil = 0, ended = false, simAcc = 0;
  const stats = { shots: 0, hits: 0, misses: 0, melee: 0, swaps: 0, deaths: 0, gore: 0, ragdolls: 0, nanBodies: 0, maxCasings: 0, maxDecals: 0, maxChunks: 0 };
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const spec = () => cfg.fight(size);
  function clearFight() {
    for (const v of units) { scene.remove(v.fig); if (v.rag) for (const l of v.rag.links) scene.remove(l.mesh); }
    units = []; phys.clearDynamic(); if (fx) fx.clear(); if (kc) kc.reset(); ended = false; simAcc = 0; $("end").hidden = true;
  }
  function setupFight(s) {
    clearFight(); seed = s >>> 0; rngFx = mulberry(seed ^ 0x9e3779b9);
    const sp = spec(); b = buildFight(sp, seed); let ai = 0, ei = 0;
    for (const u of b.units) {
      const i = u.side === 0 ? ai++ : ei++, look = cfg.look(u.side, i, sp);
      const fig = look.goat ? makeGoat(mats, assets, i) : makeHuman(mats, assets, look, look.main, look.backup); scene.add(fig);
      const p = world.map(u.x, u.y); fig.position.copy(p); fig.rotation.y = -u.facing;
      units.push({ u, fig, prev: u.state, setIdx: u.setIdx || 0, pos: p.clone(), yaw: -u.facing, walk: 0, shove: new THREE.Vector3(), lastDir: new THREE.Vector3(u.side === 0 ? 1 : -1, 0, 0), gore: false, rag: null, slump: 0, look });
    }
    for (const k in stats) stats[k] = 0;
    $("seed").textContent = "seed " + seed + (cfg.sizes ? " · " + size + "v" + size : "");
  }
  const nearest = (sx, sy, pred) => { let best = null, bd = 1e9; for (const v of units) { if (pred && !pred(v)) continue; const d = (v.u.x - sx) ** 2 + (v.u.y - sy) ** 2; if (d < bd) { bd = d; best = v; } } return best; };
  const chest = (v) => v.fig.position.clone().add(new THREE.Vector3(0, v.fig.userData.kind === "human" ? 1.2 : 0.8, 0));
  const ray = new THREE.Raycaster();
  function castOn(from, dir, far) { ray.set(from, dir); ray.far = far; const h = ray.intersectObjects(world.hitMeshes, false)[0]; if (!h) return null;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0); return { point: h.point, normal: n }; }
  const groundStamp = (p, size, map, grow) => { const g = world.ground(p.x, p.z); fx.stamp(new THREE.Vector3(p.x, g.y + 0.003, p.z), g.n, size, map, grow); };

  function onFx(e) {
    if (e.t === "shot") {
      const sh = nearest(e.x1, e.y1, (v) => !v.rag), tg = nearest(e.x2, e.y2, (v) => v !== sh); if (!sh || !tg) return;
      const d = world.map(e.x2, e.y2).sub(world.map(e.x1, e.y1)); d.y = 0; if (d.lengthSq() < 1e-6) d.set(sh.u.side === 0 ? 1 : -1, 0, 0); d.normalize();
      const U = sh.fig.userData;
      if (e.melee) { stats.melee++; if (U.kind === "human") U.chop = 1; else U.lunge = 1;
        if (e.hit) { tg.shove.addScaledVector(d, U.kind === "goat" ? 0.6 : 0.3); tg.lastDir.copy(d); sfx.play(U.kind === "goat" ? "sfx_bonk_bass" : "sfx_melee_hit", 0.5); } return; }
      stats.shots++; U.recoil = 1;
      sh.fig.updateMatrixWorld(true); const w = U.active, muzzle = w.localToWorld(w.userData.muzzle.clone()), ej = w.localToWorld(w.userData.eject.clone());
      fx.flash(muzzle); world.muzzleLight.position.copy(muzzle); world.muzzleLight.intensity = 14; sfx.play(e.sfx || "sfx_shot_scrap", 0.35, 40);
      fx.eject(ej, new THREE.Vector3(-d.z, 0, d.x), null); stats.maxCasings = Math.max(stats.maxCasings, fx.live().casings);
      const tc = chest(tg), pellets = w.userData.kind === "shotgun" ? 5 : 1;
      for (let i = 0; i < pellets; i++) {
        const spread = pellets > 1 ? 0.9 : 0;
        if (e.hit && i === 0) { stats.hits++; fx.tracer(muzzle, tc); tg.lastDir.copy(d); continue; }
        if (e.hit && pellets > 1 && rngFx() < 0.5) { fx.tracer(muzzle, tc.clone().add(new THREE.Vector3((rngFx() - 0.5) * 0.3, (rngFx() - 0.5) * 0.3, (rngFx() - 0.5) * 0.3))); continue; }
        if (!e.hit && i === 0) stats.misses++;
        const off = new THREE.Vector3((rngFx() - 0.5) * (1.2 + spread), (rngFx() - 0.5) * (0.6 + spread * 0.5), (rngFx() - 0.5) * (1.2 + spread));
        const aim = tc.clone().add(off).sub(muzzle).normalize(), hit = castOn(muzzle, aim, 40), end = hit ? hit.point : muzzle.clone().addScaledVector(aim, 20);
        fx.tracer(muzzle, end); if (hit) { fx.spark(hit.point.clone().addScaledVector(hit.normal, 0.05)); fx.stamp(hit.point, hit.normal, 0.12, tex.hole); fx.dust(hit.point); }
      }
    } else if (e.t === "blood") {
      const v = nearest(e.x, e.y); if (!v) return; const from = chest(v), dir = v.lastDir.clone();
      fx.puff(from, dir, e.spray);
      // the shot keeps going: up to ~6 m along its line (tilted down a little) to the first wall / ground / prop
      const down = dir.clone(); down.y = -(0.12 + rngFx() * 0.3); down.normalize();
      const hit = castOn(from, down, 6) || castOn(from, new THREE.Vector3(dir.x * 0.3, -1, dir.z * 0.3).normalize(), 3);
      if (hit) { const s = (0.35 + e.size * 0.55) * (e.spray ? 1.6 : 1); fx.stamp(hit.point, hit.normal, s, e.spray ? tex.spray : tex.blood[(rngFx() * 3) | 0]); }
      stats.maxDecals = Math.max(stats.maxDecals, fx.live().decals); sfx.play("sfx_hit_flesh", 0.35, 60);
    } else if (e.t === "death") { const v = nearest(e.x, e.y, (x) => !x.rag); if (v) v.gore = v.gore || !!e.gore; if (e.gore) stats.gore++; }
    else if (e.t === "gibs") { const v = nearest(e.x, e.y); if (v) { v.gore = true; v.gibs = 2 + ((rngFx() * 3) | 0); } }
    else if (e.t === "shake") shake = Math.max(shake, Math.min(0.35, (e.mag || 4) * 0.04));
    else if (e.t === "slowmo") { if (!kc.enabled) slowUntil = performance.now() + 700; }   // the kill shot replaces the sim's own slow-mo
    else if (e.t === "drag") { const v = nearest(e.x, e.y); if (v) groundStamp(v.fig.position, 0.7, tex.drag); }
  }
  function onDeath(v) {
    stats.deaths++; const kind = v.fig.userData.kind, G = GORE_PARTS[kind];
    const detach = v.gore ? G[(rngFx() * G.length) | 0] : null;
    v.rag = ragdoll(phys, scene, v.fig, v.lastDir, v.vel || new THREE.Vector3(), detach, rngFx); stats.ragdolls++;
    if (v.gibs) { fx.chunks(chest(v), v.lastDir, v.gibs); stats.maxChunks = Math.max(stats.maxChunks, fx.live().chunks); sfx.play("sfx_gib", 0.6); }
    if (v.rag.detached) v.trail = 1.2;
    groundStamp(v.fig.position.clone().addScaledVector(v.lastDir, 0.5), kind === "goat" ? 1.5 : 1.7, tex.pool, 2.5);   // the pool spreads
    sfx.play(kind === "goat" ? "sfx_death_beast" : "sfx_death_human", 0.6);
    const torso = v.rag.links.find((l) => l.name === (kind === "human" ? "torso" : "body"));
    const lastOfSide = !units.some((x) => x !== v && x.u.side === v.u.side && x.u.state === "alive");
    kc.request({ focus: () => new THREE.Vector3(torso.body.position.x, torso.body.position.y, torso.body.position.z), dir: v.lastDir.clone(), drama: 1 + (v.gore ? 1 : 0) + (lastOfSide ? 2 : 0), x: v.fig.position.x, z: v.fig.position.z }, rngFx);
  }

  // ---- per frame ------------------------------------------------------------------------------------------------------------
  const clock = { last: performance.now() }; let fps = 0, fpsAcc = 0, fpsN = 0, frames = 0;
  function frame() {
    const now = performance.now(), rdt = Math.min(0.05, (now - clock.last) / 1000); clock.last = now; frames++;
    fpsAcc += rdt; fpsN++; if (fpsAcc >= 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
    // camera first: the kill shot sets the time scale for this frame
    const base = camBase.clone(); if (shake > 0) { base.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake)); shake = Math.max(0, shake - rdt * 1.2); }
    let ts = 1; if (controls) { controls.update(); } else ts = kc.update(rdt, base, camTarget);
    const scale = paused ? 0 : SPEEDS[speed] * ts * (now < slowUntil ? 0.35 : 1), dt = rdt * scale;
    if (b && !ended && b.phase === "fight") { simAcc += dt; let n = 0;
      while (simAcc >= SIM_DT && n++ < 8) { simAcc -= SIM_DT; applySwapRule(b); stepFight(b, SIM_DT); for (const e of b.fx) onFx(e); b.fx.length = 0;
        for (const v of units) { if (v.prev !== v.u.state) { if (v.u.state === "dead" && !v.rag) onDeath(v); v.prev = v.u.state; }
          if ((v.u.setIdx || 0) !== v.setIdx && !v.rag) { v.setIdx = v.u.setIdx || 0; setHeld(v.fig, v.setIdx ? "backup" : "main"); stats.swaps++; sfx.play("sfx_reload", 0.4); } }
        if (b.over) { ended = true; $("end").textContent = b.result === "win" ? cfg.labels.win : cfg.labels.lose; $("end").hidden = false; break; } } }
    for (const v of units) {
      if (v.rag) { for (const l of v.rag.links) phys.sync(l.body, l.mesh);
        if (v.trail > 0 && dt > 0 && v.rag.detached) { v.trail -= dt; const bp = v.rag.detached.body.position; if (rngFx() < dt * 12) groundStamp(bp, 0.14 + rngFx() * 0.12, tex.blood[(rngFx() * 3) | 0]); }
        continue; }
      const tgt = world.map(v.u.x, v.u.y), prev = v.fig.position.clone();
      v.pos.lerp(tgt, Math.min(1, rdt * 14 * (scale > 0 ? 1 : 0)));
      if (dt > 0) v.shove.multiplyScalar(Math.max(0, 1 - dt * 6));
      const down = v.u.state === "critical" || v.u.state === "downed"; v.slump += ((down ? 1 : 0) - v.slump) * Math.min(1, rdt * 6);
      v.fig.position.copy(v.pos).add(v.shove); v.fig.position.y = world.ground(v.fig.position.x, v.fig.position.z).y;
      const moving = Math.hypot(v.fig.position.x - prev.x, v.fig.position.z - prev.z) / Math.max(1e-4, rdt) > 0.2; if (dt > 0 && moving) v.walk += dt * 9;
      v.vel = v.fig.position.clone().sub(prev).divideScalar(Math.max(1e-4, rdt));
      let dy = -v.u.facing - v.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI; v.yaw += dy * Math.min(1, rdt * 10);
      v.fig.rotation.set(0, v.yaw, 0); v.fig.rotateX(v.slump * 1.35); v.fig.position.y += v.slump * 0.15;
      animate(v.fig, scale > 0 ? rdt * scale : 0, moving && !down, v.walk);
    }
    fx.update(rdt, dt); phys.step(dt); const bad = phys.check(); if (bad) stats.nanBodies += bad;
    if (world.tick) world.tick(now, rdt);
    world.muzzleLight.intensity = Math.max(0, world.muzzleLight.intensity - rdt * 160);
    renderer.render(scene, camera);
    if (overlayOn) drawOverlay();
    requestAnimationFrame(frame);
  }

  // ---- overlay / controls ---------------------------------------------------------------------------------------------------
  let overlayOn = DEBUG;
  function drawOverlay() {
    const el = $("overlay"), l = fx.live(), ps = phys.stats(), loaded = assets.report.filter((r) => r.status === "loaded");
    el.hidden = false;
    el.textContent = `${fps} fps · ${LOOK}${LOW ? " · low" : ""} · ${SPEEDS[speed]}x${paused ? " · paused" : ""}${kc.active() ? " · KILL SHOT " + kc.timeScale.toFixed(2) + "x" : ""}\n` +
      `sim t ${b ? b.t.toFixed(1) : 0}s · seed ${seed} · swaps ${stats.swaps} · kill shots ${kc.shots} (skipped ${kc.skipped}, merged ${kc.merged})${kc.enabled ? "" : " OFF"}\n` +
      `casings ${l.casings}/${CAPS.casings} · decals ${l.decals}/${CAPS.decals} · chunks ${l.chunks}/${CAPS.chunks}\nbodies ${ps.dynamic} (awake ${ps.awake}) · joints ${ps.constraints}\n` +
      `models: ${loaded.length}/${assets.report.length} loaded${DEBUG ? "\n" + assets.report.map((r) => `  ${r.name}: ${r.status}${r.tris ? " " + r.tris + " tris" : ""}${r.why ? " (" + r.why + ")" : ""}`).join("\n") : ""}\n` +
      Object.entries(T).map(([k, v]) => `${k} ${Math.round(v)} ms`).join(" · ");
  }
  function setSpeed(s) { speed = s; for (const bt of document.querySelectorAll("[data-speed]")) bt.setAttribute("aria-pressed", String(+bt.dataset.speed === s)); }
  function togglePause() { paused = !paused; $("btn-pause").textContent = paused ? "▶ Play" : "❚❚ Pause"; }
  function replay(s) { setupFight(s == null ? seed : s); startFight(b); }
  function setKillcam(on) { kc.enabled = on; if (!on) kc.reset(); const bt = $("btn-killcam"); if (bt) bt.textContent = "Kill cam: " + (on ? "On" : "Off"); }
  function setSize(n) { size = n; const bt = $("btn-size"); if (bt) bt.textContent = n + "v" + n; replay(defaultSeed()); }
  addEventListener("keydown", (e) => {
    if (e.code === "Space") { e.preventDefault(); togglePause(); }
    else if (SPEEDS[e.key]) setSpeed(+e.key);
    else if (e.key === "r" || e.key === "R") replay();
    else if (e.key === "n" || e.key === "N") replay((Math.random() * 1e6) | 0);
    else if (e.key === "f" || e.key === "F") { overlayOn = !overlayOn; if (!overlayOn) $("overlay").hidden = true; }
    else if ((e.key === "k" || e.key === "K") && DEBUG) setKillcam(!kc.enabled);
  });
  $("btn-pause").onclick = togglePause; for (const bt of document.querySelectorAll("[data-speed]")) bt.onclick = () => setSpeed(+bt.dataset.speed);
  $("btn-replay").onclick = () => replay(); $("btn-new").onclick = () => replay((Math.random() * 1e6) | 0);
  $("btn-fps").onclick = () => { overlayOn = !overlayOn; if (!overlayOn) $("overlay").hidden = true; };
  $("btn-sound").onclick = () => { sfx.on = !sfx.on; $("btn-sound").textContent = "Sound: " + (sfx.on ? "On" : "Off"); };
  if (cfg.sizes && $("btn-size")) { const bt = $("btn-size"); bt.hidden = false; bt.textContent = size + "v" + size; bt.onclick = () => setSize(cfg.sizes[(cfg.sizes.indexOf(size) + 1) % cfg.sizes.length]); }
  if (DEBUG) { const bt = $("btn-look"); bt.hidden = false; bt.textContent = "Look: " + (LOOK === "chunky" ? "Chunky" : "Smooth");
    bt.onclick = () => { const p = new URLSearchParams(location.search); if (LOOK === "chunky") p.set("look", "smooth"); else p.delete("look"); location.search = p.toString(); };
    const kb = $("btn-killcam"); kb.hidden = false; kb.onclick = () => setKillcam(!kc.enabled); }

  // ---- boot: the loading card with timings ----------------------------------------------------------------------------------
  (async function boot() {
    try {
      let li = stepLine("game data"); const g = await loadGame(); T["game data"] = g.dataMs; li.lastChild.textContent = Math.round(g.dataMs) + " ms";
      li = stepLine("the sim"); T["the sim"] = g.simMs; li.lastChild.textContent = Math.round(g.simMs) + " ms";
      li = stepLine("textures + models"); let t = performance.now();
      [tex, assets] = await Promise.all([loadFxTextures(ROOT), loadAssets3d("../assets3d/", cfg.assets, mats, params.get("assets"))]);
      T["textures + models"] = performance.now() - t; li.lastChild.textContent = Math.round(T["textures + models"]) + " ms · models " + assets.report.filter((r) => r.status === "loaded").length + "/" + assets.report.length;
      li = stepLine("the scene"); t = performance.now();
      phys = createPhysics({ bounds: cfg.physBounds }); world = cfg.build({ THREE, scene, mats, phys, assets, tex, low: LOW, look: LOOK });
      world.muzzleLight = new THREE.PointLight(0xffb060, 0, 6, 2); scene.add(world.muzzleLight);   // always present (a changing light count recompiles shaders)
      fx = createFx(scene, phys, mats, tex, mulberry(seed), world.ground, assets);
      kc = createKillcam(camera, { enabled: params.get("killcam") !== "0", groundAt: (x, z) => world.ground(x, z).y, occluders: () => world.occluders.concat(units.filter((v) => !v.rag).map((v) => v.fig)), inBounds: world.camBounds, baseTarget: () => camTarget });
      if (kc && $("btn-killcam")) $("btn-killcam").textContent = "Kill cam: " + (kc.enabled ? "On" : "Off");
      fitCamera(); setupFight(seed); T["the scene"] = performance.now() - t; li.lastChild.textContent = Math.round(T["the scene"]) + " ms";
      li = stepLine("shader warm-up"); t = performance.now(); fx.flash(new THREE.Vector3(0, -50, 0)); fx.tracer(new THREE.Vector3(0, -50, 0), new THREE.Vector3(1, -50, 0));
      renderer.compile(scene, camera); T["shader warm-up"] = performance.now() - t; li.lastChild.textContent = Math.round(T["shader warm-up"]) + " ms";
      li = stepLine("first frame"); t = performance.now(); renderer.render(scene, camera); await new Promise((r) => requestAnimationFrame(r)); T["first frame"] = performance.now() - t; li.lastChild.textContent = Math.round(T["first frame"]) + " ms";
      T.total = performance.now() - (window.__protoT0 || 0); stepLine("total", T.total);
      console.table(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, { ms: Math.round(v) }])));
      if (DEBUG && params.has("orbit")) { const { OrbitControls } = await import("three/addons/controls/OrbitControls.js"); controls = new OrbitControls(camera, canvas); controls.target.copy(camTarget); controls.update(); }
      await combatStartBeat();
      $("card").classList.add("gone"); setTimeout(() => { $("card").hidden = true; }, 600);
      startFight(b); requestAnimationFrame(frame);
    } catch (err) { console.error(err); stepLine("FAILED: " + err.message); }
  })();

  // test hook (Playwright): read-only state + the same controls the keys use
  window.PROTO_B3D = {
    state: () => ({ t: b ? b.t : 0, over: !!(b && b.over), result: b ? b.result : null, ended, seed, size, paused, speed: SPEEDS[speed], look: LOOK, low: LOW, fps, frames,
      units: units.map((v) => ({ side: v.u.side, state: v.u.state, rag: !!v.rag, setIdx: v.setIdx, weapon: v.fig.userData.active ? v.fig.userData.active.userData.kind : "natural", x: v.fig.position.x, y: v.fig.position.y, z: v.fig.position.z })),
      live: fx ? fx.live() : null, counts: fx ? { ...fx.counts } : null, phys: phys ? phys.stats() : null, stats: { ...stats }, timings: { ...T }, caps: CAPS,
      killcam: kc ? { enabled: kc.enabled, phase: kc.phase, timeScale: kc.timeScale, shots: kc.shots, skipped: kc.skipped, merged: kc.merged, last: kc.last, weight: kc.weight, KC } : null,
      cam: { x: camera.position.x, y: camera.position.y, z: camera.position.z, ground: world ? world.ground(camera.position.x, camera.position.z).y : 0 },
      assets: assets ? assets.report : null, bounds: world ? world.bounds : null,
      ragBodies: units.filter((v) => v.rag).flatMap((v) => v.rag.links.map((l) => ({ x: l.body.position.x, y: l.body.position.y, z: l.body.position.z, vx: l.body.velocity.x, vy: l.body.velocity.y, vz: l.body.velocity.z, g: world.ground(l.body.position.x, l.body.position.z).y }))) }),
    replay: (s) => replay(s), setSize, setSpeed, pause: () => { if (!paused) togglePause(); }, play: () => { if (paused) togglePause(); }, setKillcam: (on) => setKillcam(on)
  };
}
