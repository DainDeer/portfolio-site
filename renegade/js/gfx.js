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
  // ---- RNG-077 / SP-006 (Megan, Oct 2): the battle loading screen and the beat-synced reveal ----
  // A 3D battle's real load (engine, scene, models) runs behind a loading screen. The zone music keeps playing, dipping very
  // gradually to no less than 80% (G.Music.hold). Once loaded, the battle is mounted UNDER the screen (shaders warm up)
  // and the screen ends on the zone track's next combat_start_beat (G.Music.nextStartBeat): on that beat the battle
  // track starts (G.Music.releaseAt, scheduled on the Web Audio clock), the screen lifts and the HUD fades in
  // (Gfx.revealUI; the combat UI opening Gfx.openUI is off until Smudge's art: music.reveal.uiOpen). No music to sync to (muted, locked, file://): it reveals as soon as it's loaded. The wait for a
  // beat is capped (music.reveal.maxWaitSec, then a hard cap 0.5 s later), and a tap / Space / Enter on the ready screen
  // reveals at once, so nothing can hang on it. The sim isn't touched before Fight!, so outcomes are unchanged.
  // The 2D view (Low / no WebGL / Auto on phones / a failed load) mounts at once, as before.
  Gfx.REVEAL_OPEN_MS = 1300;   // the combat UI's opening: the end locks spin 3 times, then the beam (SP-082, placeholder art)
  Gfx.reducedMotion = () => !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // pure (tested headless): when to reveal once loading is done. beat = G.Music.nextStartBeat() (or null), maxWait s
  Gfx.revealPlan = function (beat, maxWait) {
    if (!beat || !(beat.wait >= 0)) return { wait: 0, synced: false, why: "no music" };
    if (beat.wait > maxWait + 1e-9) return { wait: maxWait, synced: false, why: "beat past maxWaitSec", beat };
    return { wait: beat.wait, synced: true, why: "beat", at: beat.at, beat };
  };
  // the HUD on the reveal beat. Megan (Oct 6, PR #23): the placeholder combat UI opening stays OFF until Smudge's end-panel
  // art (SP-082 parked): music.reveal.uiOpen = false gives SP-006's plain reveal (the HUD fades in on the beat, 250 ms,
  // the same as reduced motion). uiOpen = true turns the opening back on: Gfx.openUI below.
  Gfx.revealUI = function (container, v) {
    const R = (DATA.audio && DATA.audio.music && DATA.audio.music.reveal) || {};
    if (R.uiOpen === true) return Gfx.openUI(container, v);
    const wrap = container && container.querySelector(".battle-wrap"); if (!wrap) return null;
    const ms = 250, open = { mode: "plain", reduced: Gfx.reducedMotion(), plain: true, ms, spins: 0, done: false };
    container.classList.add("rv-opening", "rv-reduced-motion");
    setTimeout(() => { container.classList.remove("rv-opening", "rv-reduced-motion"); open.done = true; }, ms + 60);
    return open;
  };
  // the combat UI opening (SP-082: the left and right end panels unlock like a combination lock, spin 3 times, expand and
  // project a beam across; the interface appears). CSS only, decorative, pointer-events none, removed when done.
  // Reduced motion: no spin or beam, the interface fades in. Off by default (music.reveal.uiOpen, Gfx.revealUI).
  Gfx.openUI = function (container, v) {
    const wrap = container && container.querySelector(".battle-wrap"); if (!wrap) return null;
    const reduced = Gfx.reducedMotion(), ms = reduced ? 250 : Gfx.REVEAL_OPEN_MS;
    const el = root.document.createElement("div"); el.className = "rv-open" + (reduced ? " rv-reduced" : ""); el.setAttribute("aria-hidden", "true");
    el.innerHTML = '<i class="rv-lock rv-l"><b></b></i><i class="rv-beam"></i><i class="rv-lock rv-r"><b></b></i>';
    el.style.setProperty("--rv-ms", ms + "ms");
    wrap.appendChild(el); container.classList.add("rv-opening"); if (reduced) container.classList.add("rv-reduced-motion");
    const open = { mode: reduced ? "reduced" : "full", reduced, plain: false, ms, spins: reduced ? 0 : 3, done: false };
    setTimeout(() => { el.remove(); container.classList.remove("rv-opening", "rv-reduced-motion"); open.done = true; }, ms + 60);
    return open;
  };

  // the battle screen: 3D when Gfx.decide says so (the loading screen first), otherwise the 2D view. Returns the view object
  // at once (UI.battle.v); a 3D mount fills it in when the load finishes, a failed / timed-out load mounts 2D into it.
  // v.pending stays true until the reveal.
  Gfx.mountBattle = function (container, b, opts) {
    const zone = (G.state && G.state.run && G.state.run.zone) || null, d = Gfx.decide(zone);
    Gfx.last = Object.assign({ zone }, d);
    const v = { b, opts, done: false, pending: true, container };
    if (!d.use3d) { const r = G.BattleView.mount(container, b, opts, v); v.pending = false; if (d.why === "weak" || d.why === "phone") Gfx.autoToast(); return r; }
    G.BattleView.active = v;
    container.innerHTML = "";
    const Mu = G.Music, R = (DATA.audio && DATA.audio.music && DATA.audio.music.reveal) || {}, maxWait = R.maxWaitSec != null ? R.maxWaitSec : 2;
    const card = root.document.createElement("div"); card.className = "b3d-loading"; card.dataset.state = "loading";
    card.innerHTML = '<div class="b3d-card"><h3>Loading the fight</h3><ol></ol><p class="b3d-ready">Ready</p></div>';
    container.appendChild(card);
    const ol = card.querySelector("ol"), t0 = performance.now();
    v.reveal = { phase: "loading", t0, hold: !!(Mu && Mu.hold && Mu.hold(zone)) };
    let li = null; const step = (name) => { if (li) li.lastChild.textContent = Math.round(performance.now() - t0) + " ms"; li = root.document.createElement("li"); li.innerHTML = "<span></span><b>…</b>"; li.firstChild.textContent = name; ol.appendChild(li); };
    let settled = false, revealed = false, beatTimer = 0, capTimer = 0, raf = 0;
    const actx = () => (G.Sfx && G.Sfx.ctx) || null;
    const keySkip = (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); reveal("key"); } };
    const stopWaiting = () => { clearTimeout(beatTimer); clearTimeout(capTimer); cancelAnimationFrame(raf); root.removeEventListener("keydown", keySkip, true); card.onclick = null; };
    // the reveal: the screen lifts, the battle music is on (scheduled on the beat, or the usual switch), the UI opens
    const reveal = (how) => {
      if (revealed) return; revealed = true; stopWaiting();
      const c = actx(), plan = v.reveal.plan || {};
      if (!plan.synced && Mu && Mu.release) Mu.release();
      card.remove(); v.pending = false;
      Object.assign(v.reveal, { phase: "revealed", how, at: performance.now(), audioAt: c ? c.currentTime : null });
      if (!v.done && how !== "cancel") v.reveal.open = Gfx.revealUI(container, v);
    };
    v.cancelReveal = () => { if (!revealed) { reveal("cancel"); } else if (Mu && Mu.release) Mu.release(); };
    const fail = (why) => {
      if (settled) return; settled = true; clearTimeout(timer);
      const msg = why && why.message ? why.message : String(why);
      console.warn("[gfx] 3D battle unavailable, drawing it in 2D: " + msg);
      Gfx.sessionFailed = msg; Gfx.last = { zone, use3d: false, why: "load-failed", detail: msg };
      if (v.done) return;
      v.reveal.plan = { wait: 0, synced: false, why: "load failed" }; reveal("cancel");
      G.BattleView.mount(container, b, opts, v); v.pending = false;
      if (G.UI && G.UI.toast) G.UI.toast("3D couldn't load, so this battle is in 2D.");
    };
    const timer = setTimeout(() => fail("loading took over " + Gfx.LOAD_TIMEOUT_MS / 1000 + " s"), Gfx.LOAD_TIMEOUT_MS);
    step("3D engine (three.js + cannon-es)");
    Gfx.load().then((m) => m.prepare(b, zone, step)).then((prep) => {
      if (settled) return; if (v.done) { settled = true; clearTimeout(timer); return; }
      step("the " + (DATA.zones.list[zone] || {}).name + " scene");
      Gfx.mod.mount(container, b, opts, v, prep); settled = true; clearTimeout(timer); v.pending = true; v.loadMs = performance.now() - t0;
      if (li) li.lastChild.textContent = Math.round(performance.now() - t0) + " ms";
      container.appendChild(card); card.dataset.state = "ready";   // mount() cleared the container: the screen goes back on top
      try { waitForBeat(); } catch (e) { console.warn("[gfx] battle reveal: " + (e && e.message)); reveal("error"); }   // never stuck behind the screen
    }).catch(fail);
    function waitForBeat() {
      const beat = Mu && Mu.nextStartBeat ? Mu.nextStartBeat() : null, plan = Gfx.revealPlan(beat, maxWait);
      Object.assign(v.reveal, { phase: "ready", loadedAt: performance.now(), plan });
      if (plan.synced && !(Mu.releaseAt(plan.at))) plan.synced = false;   // battle track scheduled on the beat (Web Audio clock)
      if (plan.wait <= 0) { reveal("loaded"); return; }
      root.addEventListener("keydown", keySkip, true); card.onclick = () => reveal("tap");
      capTimer = setTimeout(() => reveal("cap"), (maxWait + 0.5) * 1000);   // hard cap: never wait longer than this
      const c = actx();
      // the frame nearest the beat: lift on the first frame within half a frame of it (frame length measured as it goes)
      if (plan.synced && c) { let last = 0, dt = 1 / 60; const poll = (ts) => { if (revealed) return; if (last) dt = Math.min(0.1, Math.max(0.004, (ts - last) / 1000)); last = ts;
          if (c.currentTime >= plan.at - dt / 2) reveal("beat"); else raf = requestAnimationFrame(poll); }; raf = requestAnimationFrame(poll);
        beatTimer = setTimeout(() => reveal("beat"), plan.wait * 1000 + 40); }   // backup if frames stall (a hidden tab)
      else beatTimer = setTimeout(() => reveal(plan.synced ? "beat" : "max-wait"), plan.wait * 1000);
    }
    return v;
  };
  // mid-battle: the WebGL context was lost / the 3D view threw. The same battle carries on in 2D.
  Gfx.fallbackLive = function (v, why) {
    if (!v || !v.is3d || v.done) return;
    if (v.cancelReveal) v.cancelReveal();   // lost during the loading screen's wait for the beat: lift it now
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
