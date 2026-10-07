// Music (Snare, assets/music/, notes in assets/music_src/README.md): one looping track per music state
// (outpost / run / battle, data/audio.js DATA.audio.music), on its own channel: track gain -> music bus
// (master x Music slider) -> the master, next to the SFX bus and the ambience, not through them.
// Web Audio buffers with loop = true (gapless). Tracks in one sync group (the Hushwood pair) switch at the same playback
// position, on the bar grid; other switches crossfade and restart the incoming track from the top.
// Under file:// (no fetch) it falls back to HTMLAudio elements: same mapping, approximate sync.
// Starts after the first tap / click / key (G.Sfx.unlock). A file that fails to load is silent (tried once, ogg then mp3).
// Megan: music starts muted on every page load (Mu.muted, never saved); the title's sound button or Settings > Music turns it
// on for this visit. Muted, nothing is downloaded.
(function (root) {
  const G = root.G;
  const M = () => DATA.audio.music;
  const Mu = G.Music = { state: null, zone: null, want: null, main: null, voices: [], cache: {}, requests: {}, log: [], bus: null, muted: true };
  const hasDom = typeof document !== "undefined" && typeof Audio !== "undefined";
  const S = () => G.Sfx;
  const base = () => (DATA.sprites.basePath || "assets/");
  const mod = (x, d) => ((x % d) + d) % d;

  // ---- pure helpers (tested headless) ----
  Mu.trackFor = (state, zone) => { const Z = (M().zones || {})[zone] || {}; return (state && (Z[state] || M().states[state])) || null; };
  Mu.beatSec = (key) => 60 / M().tracks[key].bpm;
  Mu.barSec = (key) => Mu.beatSec(key) * (M().tracks[key].beatsPerBar || 4);
  Mu.untilLine = (pos, step) => { const r = mod(pos, step); return r < 1e-3 || step - r < 1e-3 ? 0 : step - r; };   // seconds to the next grid line (0 = on one)
  Mu.sameGroup = (a, b) => { const T = M().tracks; return !!(a && b && T[a] && T[b] && T[a].sync && T[a].sync === T[b].sync); };
  // how to get from track `from` (playing at position `pos` s) to track `to` when entering music state `toState`
  Mu.plan = function (from, to, pos, toState) {
    const D = M();
    if (!from) return { mode: "start", wait: 0, fade: D.firstFadeSec, offset: 0 };
    if (!Mu.sameGroup(from, to)) {
      const al = (D.barAlign || []).some((p) => p[0] === from && p[1] === to);   // Slice 4 §G: title -> outpost on the title's bar line
      return { mode: "restart", wait: al ? Mu.untilLine(pos, Mu.barSec(from)) : 0, fade: D.restartFadeSec, offset: 0, grid: al ? "bar" : undefined };
    }
    const bar = Mu.barSec(to), beat = Mu.beatSec(to), len = D.tracks[to].loopSec;
    let wait = Mu.untilLine(pos, bar), grid = "bar", fade;
    if (toState === "battle") { const T = D.toBattle, maxWait = T.maxBarWaitBars != null ? T.maxBarWaitBars * bar : T.maxBarWaitSec; if (wait > maxWait + 1e-9 && D.tracks[to].quantize !== "bar") { wait = Mu.untilLine(pos, beat); grid = "beat"; } fade = T.fadeSec; }
    else fade = bar * (D.fromBattle.fadeBars || 1);
    return { mode: "sync", wait, fade, grid, offset: mod(pos + wait, len) };
  };
  // ---- RNG-077 / SP-006: the battle reveal's combat_start_beat flags (pure, tested headless) ----
  // A zone track's flagged beats: Snare's explicit list when the track has one (tracks[key].combatStartBeats: beat numbers
  // from the loop start, in the track's own beats), otherwise derived from its grid: every bar line, halved (on even
  // meters) until the gap is at most reveal.maxGridSec, so the wait after loading stays short on long bars (Hushwood
  // 3.2 s -> 1.6 s, Drowned 3.0 -> 1.5, Hollis 2.0 -> 1.0). When the zone's battle track switches on bar lines only
  // (quantize "bar": Greyback's 4/4 over the 3/4 run track) the flags stay on bar lines.
  Mu.startGrid = function (key) {
    const D = M(), T = D.tracks[key]; if (!T) return null;
    const R = D.reveal || {}, beat = Mu.beatSec(key), bpb = T.beatsPerBar || 4, len = T.loopSec;
    if (Array.isArray(T.combatStartBeats) && T.combatStartBeats.length) return { key, list: T.combatStartBeats.map((n) => mod(n * beat, len)).sort((a, b) => a - b), len, source: "flags" };
    const partner = Object.keys(D.tracks).find((k) => k !== key && Mu.sameGroup(k, key) && D.tracks[k].quantize === "bar");
    let n = bpb;
    if (!partner) { while (n * beat > (R.maxGridSec ?? 1.6) + 1e-9 && n % 2 === 0) n /= 2; if (n * beat > (R.maxGridSec ?? 1.6) + 1e-9) n = 1; }
    return { key, every: n * beat, beats: n, len, source: partner ? "bar (battle track quantize bar)" : n === bpb ? "bar" : n + " beats" };
  };
  // seconds from playback position pos (s) of track key to its next flagged beat (0 = on one)
  Mu.untilStartBeat = function (key, pos) {
    const g = Mu.startGrid(key); if (!g) return null;
    const p = mod(pos, g.len);
    if (g.list) { for (const x of g.list) if (x >= p - 1e-3) return Math.max(0, x - p); return g.len - p + g.list[0]; }
    return Mu.untilLine(p, g.every);
  };
  // the loading dip: the zone track's level (x its starting level) after t s of loading. Very gradual, never below the floor
  Mu.dipLevel = function (t) { const R = M().reveal || {}, floor = Math.max(0.8, R.dipFloor ?? 0.8), sec = Math.max(0.1, R.dipSec ?? 6); return Math.max(floor, 1 - (1 - floor) * Math.min(1, Math.max(0, t) / sec)); };

  // equal-power fade curves (N points), scaled to a start level
  const curve = (from, to, n) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1); c[i] = from * Math.cos(x * Math.PI / 2) + to * Math.sin(x * Math.PI / 2); } return c; };
  Mu.curve = curve;

  // ---- loading (cache the current pair; remember missing tracks; ogg then mp3) ----
  Mu.exts = () => M().exts.filter((x) => !(x === ".ogg" && hasDom && !(new Audio()).canPlayType('audio/ogg; codecs="vorbis"')));
  Mu.urls = (key) => Mu.exts().map((x) => base() + M().path + key + x);
  const useWA = () => !!(S() && S().ctx) && typeof location !== "undefined" && /^https?:/.test(location.protocol);
  Mu.now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  Mu.load = function (key) {
    let e = Mu.cache[key]; if (e) { e.used = Mu.now(); return e; }
    e = Mu.cache[key] = { state: "pending", buf: null, el: null, url: null, used: Mu.now(), abort: typeof AbortController !== "undefined" ? new AbortController() : null };
    const urls = Mu.urls(key);
    const next = (i) => {
      if (Mu.cache[key] !== e) return;
      if (i >= urls.length) { e.state = "missing"; e.abort = null; e.loading = null; return; }
      const url = G.Assets ? G.Assets.url(urls[i]) : urls[i]; Mu.requests[url] = (Mu.requests[url] || 0) + 1; e.url = url;
      if (useWA()) {
        fetch(url, e.abort ? { signal: e.abort.signal } : undefined).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.arrayBuffer(); })
          .then((ab) => new Promise((res, rej) => { const p = S().ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej); }))   // callback form for old Safari
          .then((buf) => { if (Mu.cache[key] !== e) return; e.buf = buf; e.state = "ok"; e.used = Mu.now(); Mu.onReady(key); Mu.trim(); })
          .catch(() => next(i + 1));
      } else {
        const el = new Audio(); e.loading = el; el.preload = "auto"; el.loop = true;
        el.addEventListener("canplaythrough", () => { if (Mu.cache[key] === e && e.state === "pending") { e.loading = null; e.el = el; e.state = "ok"; Mu.onReady(key); } }, { once: true });
        el.addEventListener("error", () => { if (Mu.cache[key] === e && e.state === "pending") next(i + 1); }, { once: true });
        el.src = url; el.load();
      }
    };
    next(0);
    return e;
  };
  // SP-118: byte-budgeted LRU. Always pin live voices, Mu.want and the current zone pair; music_outpost is a soft pin.
  // Evict least-recently-used (by e.used) only while total decoded PCM exceeds DATA.audio.music.cacheMB.
  Mu.bufBytes = (e) => (e && e.buf) ? e.buf.length * e.buf.numberOfChannels * 4 : 0;
  Mu.cacheBudget = function () {
    const mb = (M().cacheMB || { desktop: 220, phone: 120 });
    const phone = !!(G.Touch && G.Touch.layout && G.Touch.layout());
    return (phone ? mb.phone : mb.desktop) * 1024 * 1024;
  };
  Mu.drop = function (key) {
    const e = Mu.cache[key]; if (!e) return;
    delete Mu.cache[key]; if (e.abort) try { e.abort.abort(); } catch (x) {}
    for (const el of [e.el, e.loading]) if (el) { try { el.pause(); } catch (x) {} if (el.removeAttribute) el.removeAttribute("src"); try { el.load(); } catch (x) {} }
    e.buf = null; e.loading = null; e.el = null;
  };
  Mu.trim = function () {
    const keep = new Set(Mu.voices.map((v) => v.key));
    if (Mu.want) keep.add(Mu.want);
    if (Mu.state === "run" || Mu.state === "battle") { keep.add(Mu.trackFor("run", Mu.zone)); keep.add(Mu.trackFor("battle", Mu.zone)); }
    // music_outpost is a soft pin: kept across expeditions while it fits, but the hard pins above come first, so a
    // phone's budget (outpost + a zone pair can pass 120 MB) drops it during a run rather than overrunning cacheMB
    const soft = new Set(["music_outpost"].filter((k) => !keep.has(k)));
    // Never kept past their use, whatever the budget: an unpinned download while muted (cancelled, as before SP-118:
    // muting must not keep fetching), and one-shot tracks (the title's music plays once per load) once nothing plays or wants them
    const muted = Mu.gain() <= 0, oneShot = new Set(M().oneShot || []);
    const live = new Set(Mu.voices.map((v) => v.key));
    for (const key of Object.keys(Mu.cache)) { const st = Mu.cache[key].state;
      if (!live.has(key) && st !== "missing" && ((muted && st === "pending") || (oneShot.has(key) && !keep.has(key)))) Mu.drop(key); }   // muted: even a pinned download stops (decoded pins stay)
    const budget = Mu.cacheBudget();
    let total = 0;
    const lru = [];
    for (const key of Object.keys(Mu.cache)) {
      const e = Mu.cache[key]; if (e.state === "missing") continue;
      const bytes = Mu.bufBytes(e);
      if (keep.has(key)) { total += bytes; continue; }
      lru.push({ key, used: e.used || 0, bytes, soft: soft.has(key) });
      total += bytes;
    }
    lru.sort((a, b) => (a.soft - b.soft) || (a.used - b.used));   // unpinned LRU first, the soft pin last
    for (const x of lru) {
      if (total <= budget) break;
      Mu.drop(x.key); total -= x.bytes;
    }
  };
  Mu.status = (key) => (Mu.cache[key] ? Mu.cache[key].state : "not loaded");

  // ---- the music channel ----
  Mu.gain = () => { const s = S() ? S().settings() : {}, d = DATA.audio.defaults; return s.mute || Mu.muted ? 0 : (s.master ?? d.master) * (s.music ?? d.music ?? 0.7); };
  Mu.ensureBus = function () { const c = S().ctx; if (c && !Mu.bus) { Mu.bus = c.createGain(); Mu.bus.gain.value = Mu.gain(); Mu.bus.connect(S().master || c.destination); } return Mu.bus; };
  Mu.applySettings = function () {
    if (Mu.bus) Mu.bus.gain.setTargetAtTime(Mu.gain(), S().ctx.currentTime, 0.05);
    for (const v of Mu.voices) if (v.el) v.apply();
    if (Mu.state) Mu.set(Mu.state, Mu.zone);
  };

  // ---- music state: called on every render (UI.render) and when a battle mounts ----
  Mu.set = function (state, zone) {
    Mu.state = state; Mu.zone = zone == null ? null : zone;
    const key = M().enabled === false ? null : Mu.trackFor(Mu.held(state), zone);
    Mu.want = key;
    if (!hasDom || !S() || !S().unlocked || !S().enabled) return;
    if (Mu.gain() <= 0) { Mu.stopAll(); Mu.trim(); return; }
    for (const k of ((M().preload || {})[state] || [])) if (M().tracks[k]) Mu.load(k);
    if (state === "run") { const bk = Mu.trackFor("battle", zone); if (bk && M().tracks[bk]) Mu.load(bk); }   // this zone's battle track, decoded early (Snare's note)
    if (!key) { Mu.stopAll(); return; }
    if (Mu.main && Mu.main.key === key) return;
    const e = Mu.load(key); if (e.state === "ok") Mu.go(key, Mu.held(state));
  };
  Mu.onReady = function (key) { if (Mu.want === key && (!Mu.main || Mu.main.key !== key)) Mu.go(key, Mu.held(Mu.state)); };
  Mu.onUnlock = function () { if (Mu.state) Mu.set(Mu.state, Mu.zone); };
  // Music on / off for this visit: the title's sound button and Settings > Music on both come here. On also lifts a
  // saved Mute, so turning music on is never silent
  Mu.setOn = function (on) {
    Mu.muted = !on;
    const st = G.state && G.state.settings;
    if (on && st && st.mute) { st.mute = false; if (G.State && G.State.save) G.State.save(); }
    if (on && S()) { S().enabled = true; if (S().resume) S().resume(); }
    if (S() && S().applySettings) S().applySettings(); else Mu.applySettings();
  };
  Mu.go = function (key, state) {
    const e = Mu.cache[key]; if (!e || e.state !== "ok" || (Mu.main && Mu.main.key === key)) return;
    e.used = Mu.now();
    if (e.buf && S().ctx) goWA(key, state, e.buf); else if (e.el) goEl(key, state, e);
  };
  const note = (x) => { Mu.log.push(x); if (Mu.log.length > 40) Mu.log.shift(); };

  // Web Audio voices
  function voiceWA(key, buf, T, off) {
    const c = S().ctx, src = c.createBufferSource(), g = c.createGain(), vol = M().tracks[key].vol ?? 1;
    src.buffer = buf; src.loop = true; g.gain.value = 0; src.connect(g); g.connect(Mu.ensureBus()); src.start(T, off);
    const v = { key, vol, startAt: T, off, dur: buf.duration, src, g, timer: null, endAt: null };
    v.pos = (t) => mod(t - T + off, buf.duration);
    const hold = () => { const t = c.currentTime, cur = g.gain.value; g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(cur, t); return { t, cur }; };
    v.fadeIn = (at, fade) => { const h = hold(); g.gain.setValueCurveAtTime(curve(h.cur, vol, 64), Math.max(at, h.t + 0.01), Math.max(0.02, fade)); };
    v.fadeOut = (at, fade) => { const h = hold(), a = Math.max(at, h.t + 0.01), f = Math.max(0.02, fade); g.gain.setValueCurveAtTime(curve(h.cur, 0, 64), a, f); v.endAt = a + f;
      clearTimeout(v.timer); v.timer = setTimeout(() => v.kill(), (a + f - h.t) * 1000 + 250); };
    v.restore = () => { clearTimeout(v.timer); v.endAt = null; const h = hold(); g.gain.linearRampToValueAtTime(vol, h.t + 0.1); };
    // RNG-077 loading dip: a linear ramp from the current level to floor x the track's full level over sec (a track still
    // fading in finishes towards that floor instead), so never below floor x its level when the loading screen came up
    v.dip = (floor, sec) => { const h = hold(); v.dipFrom = h.cur; v.dipTo = Math.max(h.cur, vol) * floor; g.gain.linearRampToValueAtTime(v.dipTo, h.t + sec); };
    v.kill = () => { clearTimeout(v.timer); try { src.stop(); } catch (x) {} try { src.disconnect(); g.disconnect(); } catch (x) {} v.src = v.g = null; Mu.voices = Mu.voices.filter((o) => o !== v); if (Mu.main === v) Mu.main = null; v.prev = null; for (const other of Mu.voices) if (other.prev === v) other.prev = null; Mu.trim(); };
    return v;
  }
  function goWA(key, state, buf) {
    const c = S().ctx, now = c.currentTime;
    let from = Mu.main;
    // a switch still waiting for its bar line is called off: the track before it carries on (or is the one wanted again)
    if (from && from.startAt > now + 0.005) { const back = from.prev; from.kill(); from = back || null; if (from) { from.restore(); Mu.main = from; } if (from && from.key === key) { note({ at: now, to: key, state, mode: "cancelled" }); return; } }
    const t = now + (M().leadSec || 0.05), pos = from ? from.pos(t) : 0;
    const p = Mu.plan(from && from.key, key, pos, state), T = t + p.wait, off = mod(p.offset, buf.duration);
    const v = voiceWA(key, buf, T, off); v.prev = from;
    v.fadeIn(T, p.fade); if (from) from.fadeOut(T, p.fade);
    Mu.voices.push(v); Mu.main = v;
    note({ at: now, from: from ? from.key : null, to: key, state, mode: p.mode, grid: p.grid || null, wait: p.wait, fade: p.fade, startAt: T, offset: off, fromPosAtStart: from ? from.pos(T) : null });
  }
  // HTMLAudio voices (file://): ramps on a timer, sync by copying currentTime at the switch
  function goEl(key, state, e) {
    let from = Mu.main;
    if (from && !from.started) { const back = from.prev; from.kill(); from = back || null; if (from) { from.restore(); Mu.main = from; } if (from && from.key === key) return; }
    const pos = from && from.el ? from.el.currentTime : 0, p = Mu.plan(from && from.key, key, pos, state);
    const n = e.el.cloneNode(); n.loop = true; n.volume = 0;
    const v = { key, el: n, vol: M().tracks[key].vol ?? 1, level: 0, started: false, timer: null, ramp: null, prev: from };
    v.apply = () => { n.volume = Math.max(0, Math.min(1, v.level * v.vol * Mu.gain())); };
    const ramp = (vv, to, fade, done) => { clearInterval(vv.ramp); const from0 = vv.level, t0 = Date.now(); vv.ramp = setInterval(() => { const x = Math.min(1, (Date.now() - t0) / (fade * 1000));
      vv.level = to > from0 ? from0 + (to - from0) * Math.sin(x * Math.PI / 2) : to + (from0 - to) * Math.cos(x * Math.PI / 2); vv.apply(); if (x >= 1) { clearInterval(vv.ramp); if (done) done(); } }, 40); };
    v.fadeOut = (fade) => ramp(v, 0, fade, () => v.kill());
    v.restore = () => { clearTimeout(v.timer); ramp(v, 1, 0.1); };
    v.dip = (floor, sec) => { v.dipFrom = v.level; v.dipTo = Math.max(v.level, 1) * floor; ramp(v, v.dipTo, sec); };
    v.kill = () => { clearTimeout(v.timer); clearInterval(v.ramp); try { n.pause(); } catch (x) {} Mu.voices = Mu.voices.filter((o) => o !== v); if (Mu.main === v) Mu.main = null; v.prev = null; for (const other of Mu.voices) if (other.prev === v) other.prev = null; Mu.trim(); };
    v.timer = setTimeout(() => { v.started = true; if (p.mode === "sync" && from && from.el) { try { n.currentTime = from.el.currentTime; } catch (x) {} }
      const pr = n.play(); if (pr && pr.catch) pr.catch(() => {}); ramp(v, 1, p.fade); if (from) from.fadeOut(p.fade); }, p.wait * 1000);
    Mu.voices.push(v); Mu.main = v;
    note({ at: Date.now() / 1000, from: from ? from.key : null, to: key, state, mode: p.mode, grid: p.grid || null, wait: p.wait, fade: p.fade, html: true });
  }
  // ---- RNG-077 / SP-006: the battle loading screen holds the music ----
  // Mu.hold(zone): from "To battle" until the reveal, the battle state keeps the zone's run track playing (Mu.set maps
  // "battle" to "run"), dipping very gradually to no less than 80% of its level (data/audio.js music.reveal).
  // Mu.nextStartBeat(): once loading is done, when the next flagged beat of the playing track is (Web Audio clock), or null
  // when there is no music to sync to (muted, locked, nothing playing yet, HTMLAudio under file://): the reveal then
  // doesn't wait. Mu.releaseAt(T): the battle track starts at audio time T (that beat), crossfading reveal.fadeSec;
  // Mu.release(): no beat to land on, back to the usual switch (the next bar line of the battle track, js/music.js plan).
  Mu.revealHold = null;
  Mu.held = (state) => (Mu.revealHold && state === "battle" ? "run" : state);
  Mu.hold = function (zone) {
    const c = S() && S().ctx, R = M().reveal || {}, floor = Math.max(0.8, R.dipFloor ?? 0.8), sec = Math.max(0.1, R.dipSec ?? 6);
    const h = Mu.revealHold = { zone: zone == null ? null : zone, t0: c ? c.currentTime : 0, at0: Date.now(), floor, sec, voice: null };
    const v = Mu.main; if (v && v.dip && (!v.startAt || !c || v.startAt <= c.currentTime + 0.005) && !v.stopping) { v.dip(floor, sec); h.voice = v; }
    note({ at: h.t0, hold: zone, dip: h.voice ? h.voice.key : null });
    return h;
  };
  Mu.nextStartBeat = function () {
    const c = S() && S().ctx, v = Mu.main;
    if (!c || c.state !== "running" || !v || !v.src || v.stopping || Mu.gain() <= 0) return null;
    const lead = M().leadSec || 0.05, t = c.currentTime + lead; if (v.startAt > t) return null;
    const pos = v.pos(t), wait = Mu.untilStartBeat(v.key, pos); if (wait == null) return null;
    const g = Mu.startGrid(v.key);
    return { key: v.key, now: c.currentTime, at: t + wait, wait: lead + wait, pos, grid: g.list ? "flags" : g.every, source: g.source };
  };
  Mu.releaseAt = function (T) {
    const h = Mu.revealHold; Mu.revealHold = null;
    const c = S() && S().ctx, key = M().enabled === false ? null : Mu.trackFor("battle", h ? h.zone : Mu.zone), from = Mu.main, e = key && Mu.cache[key];
    if (!c || !key || !e || e.state !== "ok" || !e.buf || !from || !from.src || Mu.gain() <= 0) { note({ at: c ? c.currentTime : 0, release: "plan" }); if (Mu.state) Mu.set(Mu.state, Mu.zone); return false; }
    if (from.key === key) return true;
    const R = M().reveal || {}, fade = R.fadeSec ?? 0.12, at = Math.max(T, c.currentTime + 0.01);
    const off = Mu.sameGroup(from.key, key) ? mod(from.pos(at), e.buf.duration) : 0;
    const v = voiceWA(key, e.buf, at, off); v.prev = from; v.fadeIn(at, fade); from.fadeOut(at, fade);
    Mu.voices.push(v); Mu.main = v; Mu.want = key;
    note({ at: c.currentTime, from: from.key, to: key, state: "battle", mode: "reveal", startAt: at, offset: off, fade, fromPosAtStart: from.pos(at), fromGain: from.g.gain.value });
    return true;
  };
  Mu.release = function () {
    const h = Mu.revealHold; if (!h) return;
    Mu.revealHold = null;
    if (Mu.state === "battle") Mu.set("battle", Mu.zone);
    else if (h.voice && Mu.main === h.voice) h.voice.restore();   // left before the reveal (exit / failure): back to full level
  };
  Mu.stopAll = function () { const f = M().restartFadeSec; for (const v of Mu.voices.slice()) { if (v.stopping) continue; v.stopping = true; if (v.src) v.fadeOut(S().ctx.currentTime, f); else if (v.fadeOut) v.fadeOut(f); } Mu.main = null; };
  // debug / tests: what is playing and where
  Mu.snapshot = function () {
    const c = S() && S().ctx, now = c ? c.currentTime : 0;
    return { state: Mu.state, want: Mu.want, main: Mu.main ? Mu.main.key : null, hold: !!Mu.revealHold, now, bus: Mu.bus ? Mu.bus.gain.value : null, ctx: c ? c.state : null,
      voices: Mu.voices.map((v) => ({ key: v.key, main: v === Mu.main, startAt: v.startAt, off: v.off, gain: v.g ? v.g.gain.value : v.level, pos: v.pos ? v.pos(now) : v.el && v.el.currentTime, endAt: v.endAt || null, dur: v.dur })) };
  };
})(window);
