// SP-100: graphics settings + the 3D / 2D battle switch. Battles are 3D (js/b3d/, loaded on demand with a dynamic import)
// unless the player picked Low (2D), the device has no WebGL, the 3D code / renderer failed to load this session, the
// zone has no 3D scene yet, or (Auto) the device looks weak; then the 2D view (js/battleview.js) draws the same battle.
// Both views read the same sim (js/battle.js), so the choice never changes an outcome.
// Preferences live in their own localStorage key (G.State.key("gfx"): renegade_gfx, sandbox / namespaced builds use their
// prefix), NOT in the save: changing them never touches the game state, and a new build's save wipe keeps them.
(function (root) {
  const G = root.G;
  const Gfx = G.Gfx = {
    MODELS_BASE: typeof root.RENEGADE_MODELS_BASE === "string" ? root.RENEGADE_MODELS_BASE : "assets/3d/",   // Smudge's game copy (af90b6c)
    MODULE: "js/b3d/view.js",
    SCENES: ["greyback", "a", "b", "hollis", "scablands"],   // zones with a 3D scene (Greyback Hills, Hushwood, Drowned Suburbs, Hollis Outskirts, Scablands)
    LOAD_TIMEOUT_MS: 15000,
    defaults: { graphics: "auto", killcam: true },
    last: null, sessionFailed: null, mod: null
  };
  let cache = null, webglOk = null, loadP = null;
  const LS = () => root.localStorage;
  Gfx.key = () => G.State.key("gfx");
  Gfx.prefs = function () {
    if (cache) return cache;
    let raw = null;
    try { raw = LS().getItem(Gfx.key()); if (raw == null && G.State.sandbox) raw = LS().getItem(G.State.NS ? G.State.NS + "gfx" : "renegade_gfx"); } catch (e) { raw = null; }   // a sandbox starts from the player's own choice (read only)
    let p = {}; try { p = raw ? JSON.parse(raw) || {} : {}; } catch (e) { p = {}; }
    cache = Object.assign({}, Gfx.defaults, p);
    return cache;
  };
  Gfx.set = function (k, val) {
    const p = Gfx.prefs(); p[k] = val;
    try { G.State.store.set(Gfx.key(), JSON.stringify(p)); } catch (e) { /* storage may be unavailable */ }
  };
  Gfx.reload = () => { cache = null; return Gfx.prefs(); };
  Gfx.graphics = () => { const g = Gfx.prefs().graphics; return g === "3d" || g === "low" ? g : "auto"; };
  Gfx.killcam = () => Gfx.prefs().killcam !== false;
  Gfx.webgl = function () {
    if (webglOk != null) return webglOk;
    try {
      const c = root.document && root.document.createElement("canvas"), gl = c && (c.getContext("webgl2") || c.getContext("webgl"));
      webglOk = !!gl; if (gl) { const x = gl.getExtension("WEBGL_lose_context"); if (x) x.loseContext(); }
    } catch (e) { webglOk = false; }
    return webglOk;
  };
  // a weak device (Auto only): little memory / few cores, or 3D measured slow here before (Gfx.noteFps)
  Gfx.weak = function () {
    const n = root.navigator || {};
    return (n.deviceMemory != null && n.deviceMemory < 2) || (n.hardwareConcurrency != null && n.hardwareConcurrency < 3) || !!Gfx.prefs().measuredSlow;
  };
  // the phone budget (Vixie): no shadow maps (blob shadows), fewer grass tufts
  Gfx.low = function () {
    const mm = (q) => !!(root.matchMedia && root.matchMedia(q).matches);
    return !!(G.Touch && G.Touch.layout()) || mm("(pointer: coarse)") || Math.min(root.innerWidth || 1e4, root.innerHeight || 1e4) < 560;
  };
  // Vixie (Oct 3): phones stay on 2D under Auto until the draw calls are optimised (touch / coarse pointer / small
  // screen); an explicit 3D in Settings still draws 3D there (with the phone budget, Gfx.low)
  Gfx.phone = () => Gfx.low();
  Gfx.decide = function (zone) {
    const g = Gfx.graphics();
    if (g === "low") return { use3d: false, why: "settings" };
    if (!Gfx.webgl()) return { use3d: false, why: "no-webgl" };
    if (Gfx.sessionFailed) return { use3d: false, why: "load-failed", detail: Gfx.sessionFailed };
    if (Gfx.SCENES.indexOf(zone) < 0) return { use3d: false, why: "no-scene" };
    if (g === "auto" && Gfx.phone()) return { use3d: false, why: "phone" };
    if (g === "auto" && Gfx.weak()) return { use3d: false, why: "weak" };
    return { use3d: true, why: g };
  };
  Gfx.status = function () {   // one line for Settings
    const d = Gfx.decide(Gfx.SCENES[0]);
    return d.use3d ? "3D battles are on" + (Gfx.low() ? " (phone budget: no shadow maps)" : "") + "." : { settings: "Battles are drawn in 2D (Low).", "no-webgl": "This browser has no WebGL: battles are drawn in 2D.", "load-failed": "3D couldn't load this session: battles are drawn in 2D.", weak: "Auto: this device looks slow for 3D, so battles are drawn in 2D. Pick 3D to force it.", phone: "Auto: on phones battles are drawn in 2D for now. Pick 3D to force it.", "no-scene": "3D battles are on (zones without a 3D scene yet are drawn in 2D)." }[d.why] || "";
  };
  // milestone 1 loads ES modules relative to the page; resolved once per session
  Gfx.load = function () {
    if (!loadP) loadP = import(new URL(Gfx.MODULE, root.document.baseURI).href).then((m) => (Gfx.mod = m), (e) => { loadP = null; throw e; });
    return loadP;
  };
  // RNG-077 hook: the reveal could wait for the first combat_start_beat after loading (data/audio.js, Snare). Not wired yet.
  Gfx.combatStartBeat = () => Promise.resolve();

  // the battle screen: 3D when Gfx.decide says so (a loading card first), otherwise the 2D view. Returns the view object at
  // once (UI.battle.v); a 3D mount fills it in when the load finishes, a failed / timed-out load mounts 2D into it.
  Gfx.mountBattle = function (container, b, opts) {
    const zone = (G.state && G.state.run && G.state.run.zone) || null, d = Gfx.decide(zone);
    Gfx.last = Object.assign({ zone }, d);
    const v = { b, opts, done: false, pending: true, container };
    if (!d.use3d) { const r = G.BattleView.mount(container, b, opts, v); v.pending = false; if (d.why === "weak" || d.why === "phone") Gfx.autoToast(); return r; }
    G.BattleView.active = v;
    container.innerHTML = "";
    const card = root.document.createElement("div"); card.className = "battle-wrap b3d-loading"; card.dataset.state = "loading";
    card.innerHTML = '<div class="b3d-card"><h3>Loading the fight</h3><ol></ol></div>';
    container.appendChild(card);
    const ol = card.querySelector("ol"), t0 = performance.now();
    let li = null; const step = (name) => { if (li) li.lastChild.textContent = Math.round(performance.now() - t0) + " ms"; li = root.document.createElement("li"); li.innerHTML = "<span></span><b>…</b>"; li.firstChild.textContent = name; ol.appendChild(li); };
    let settled = false;
    const fail = (why) => {
      if (settled) return; settled = true; clearTimeout(timer);
      const msg = why && why.message ? why.message : String(why);
      console.warn("[gfx] 3D battle unavailable, drawing it in 2D: " + msg);
      Gfx.sessionFailed = msg; Gfx.last = { zone, use3d: false, why: "load-failed", detail: msg };
      if (v.done) return;
      G.BattleView.mount(container, b, opts, v); v.pending = false;
      if (G.UI && G.UI.toast) G.UI.toast("3D couldn't load, so this battle is in 2D.");
    };
    const timer = setTimeout(() => fail("loading took over " + Gfx.LOAD_TIMEOUT_MS / 1000 + " s"), Gfx.LOAD_TIMEOUT_MS);
    step("3D engine (three.js + cannon-es)");
    Gfx.load().then((m) => m.prepare(b, zone, step)).then((prep) => { step("the " + (DATA.zones.list[zone] || {}).name + " scene"); return Gfx.combatStartBeat(b).then(() => prep); }).then((prep) => {
      if (settled) return; if (v.done) { settled = true; clearTimeout(timer); return; }
      Gfx.mod.mount(container, b, opts, v, prep); settled = true; clearTimeout(timer); v.pending = false; v.loadMs = performance.now() - t0;
    }).catch(fail);
    return v;
  };
  // mid-battle: the WebGL context was lost / the 3D view threw. The same battle carries on in 2D.
  Gfx.fallbackLive = function (v, why) {
    if (!v || !v.is3d || v.done) return;
    console.warn("[gfx] switching this battle to 2D: " + why);
    Gfx.sessionFailed = why; Gfx.last = { zone: v.zone, use3d: false, why: "load-failed", detail: why };
    // opts.speed is the speed at mount time; keep the player's current setting, including a stopped (0x) fight.
    const c = v.container, opts = Object.assign({}, v.opts, { speed: v.speed });
    try { v.dispose(); } catch (e) { /* already gone */ }
    v.is3d = false; v.dispose = null; v.test = null;
    G.BattleView.mount(c, v.b, opts, v);
    if (G.UI && G.UI.toast) G.UI.toast("3D stopped working, so this battle continues in 2D.");
  };
  // Auto picked 2D for smoothness (a phone, a weak device, a slow fight): say so once per device (the gfx key, not the save)
  Gfx.AUTO_TOAST = "Switched to 2D so battles run smoothly on this device. You can change it in Settings.";
  Gfx.autoToast = function () {
    if (Gfx.graphics() !== "auto" || Gfx.prefs().toast2d) return false;
    Gfx.set("toast2d", true);
    if (G.UI && G.UI.toast) G.UI.toast(Gfx.AUTO_TOAST);
    return true;
  };
  // Vixie (Oct 3): Auto only. After a 3D fight ends, if more than half of its frames took over 33 ms, the device is noted
  // slow in the gfx key (never the save) and the NEXT fight goes 2D (Gfx.weak), where the one-time toast shows (mountBattle).
  // Called once the fight is over, never mid-fight: a slow fight finishes in 3D. A manual 3D pick is never overridden.
  Gfx.SLOW_MS = 33.4; Gfx.SLOW_SHARE = 0.5; Gfx.SLOW_MIN_FRAMES = 60; Gfx.SLOW_SKIP_MS = 2500; Gfx.SLOW_GAP_MS = 1000;
  // one fight frame of realMs (the real time since the last frame). perf.fightMs is the fight's playing time so far; frames
  // in its first 2.5 s, gaps of 1 s or more (notification shade, a call, a background tab), a paused battle and a hidden
  // page are not counted (Pocket, Oct 3). Only counted frames go into the ratio.
  Gfx.countFrame = function (perf, realMs, st) {
    if (!(realMs > 0) || realMs >= Gfx.SLOW_GAP_MS || (st && (st.paused || st.hidden))) return false;
    const early = perf.fightMs < Gfx.SLOW_SKIP_MS; perf.fightMs += realMs;
    if (early) return false;
    perf.fightFrames++; if (realMs > Gfx.SLOW_MS) perf.over33++;
    return true;
  };
  Gfx.slowFight = (perf) => !!perf && perf.fightFrames >= Gfx.SLOW_MIN_FRAMES && perf.over33 > perf.fightFrames * Gfx.SLOW_SHARE;
  Gfx.noteFps = function (perf) {
    if (Gfx.graphics() !== "auto" || Gfx.prefs().measuredSlow || !Gfx.slowFight(perf)) return false;
    Gfx.set("measuredSlow", true);
    return true;
  };
})(typeof window !== "undefined" ? window : globalThis);
