// Slice 3 §8 audio. Plays assets/sfx/<key>.mp3 and the ambient loops in assets/amb/ (data/audio.js); silent if a file
// is missing (each file is requested once, then remembered as ok / missing). Web Audio (fetch + decode) when served
// over http(s); HTMLAudio elements under file:// (browsers block fetch there). Audio starts after the first click.
(function (root) {
  const G = root.G;
  const A = () => DATA.audio;
  const SFX = G.Sfx = { enabled: A().enabled, unlocked: false, cache: {}, requests: {}, last: {}, guns: [], played: [], screen: null, amb: null, ctx: null };
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
  const hasDom = typeof document !== "undefined" && typeof Audio !== "undefined";
  const base = () => (DATA.sprites.basePath || "assets/");
  // settings live in the save (state.settings); defaults from data/audio.js
  SFX.settings = () => (G.state && G.state.settings) || A().defaults;
  SFX.vol = (kind) => { const s = SFX.settings(); return s.mute ? 0 : (s.master ?? A().defaults.master) * (s[kind] ?? A().defaults[kind]); };

  // ---- admission (pure, tested headless): retrigger window + gunshot voice cap (quietest dropped first) ----
  // returns { ok, stop: voice | null, why }
  SFX.admit = function (key, vol, t) {
    const D = A(), def = D.sfx[key] || {};
    if (SFX.last[key] != null && t - SFX.last[key] < D.retriggerMs) return { ok: false, why: "retrigger" };
    if (def.group === "gun") {
      SFX.guns = SFX.guns.filter((v) => v.end > t);
      if (SFX.guns.length >= D.maxGunshots) {
        const q = SFX.guns.reduce((a, v) => (v.vol < a.vol ? v : a), SFX.guns[0]);
        if (vol <= q.vol) return { ok: false, why: "voices" };
        return { ok: true, stop: q };
      }
    }
    return { ok: true, stop: null };
  };

  // ---- loading (once per file) ----
  const useWA = () => SFX.ctx && typeof location !== "undefined" && /^https?:/.test(location.protocol);
  function load(key, urls) {
    let e = SFX.cache[key]; if (e) return e;
    e = SFX.cache[key] = { state: "pending", buf: null, el: null, url: null };
    const tryUrl = (i) => {
      if (i >= urls.length) { e.state = "missing"; return; }
      const url = urls[i]; SFX.requests[url] = (SFX.requests[url] || 0) + 1; e.url = url;
      if (useWA()) {
        fetch(url).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then((ab) => SFX.ctx.decodeAudioData(ab)).then((buf) => { e.buf = buf; e.state = "ok"; SFX.onReady(key); })
          .catch(() => tryUrl(i + 1));
      } else {
        const el = new Audio(); el.preload = "auto";
        el.addEventListener("canplaythrough", () => { if (e.state === "pending") { e.el = el; e.state = "ok"; SFX.onReady(key); } }, { once: true });
        el.addEventListener("error", () => { if (e.state === "pending") tryUrl(i + 1); }, { once: true });
        el.src = url; el.load();
      }
    };
    tryUrl(0);
    return e;
  }
  const sfxUrls = (key) => [base() + ((A().sfx[key] || {}).path || A().sfxPath) + key + A().ext];   // path: a key filed elsewhere (Snare's stinger_roll in music/)
  const loopUrls = (key) => {
    const exts = A().loopExts.filter((x) => !(x === ".ogg" && hasDom && !(new Audio()).canPlayType("audio/ogg")));
    return exts.map((x) => base() + A().ambPath + key + x);
  };
  SFX.status = (key) => ((A().sfx[key] || {}).pending ? "pending (no file yet)" : SFX.cache[key] ? SFX.cache[key].state : "not loaded");
  SFX.onReady = function (key) { if (A().loops[key] && SFX.wantLoop === key && (!SFX.amb || SFX.amb.key !== key)) SFX.startLoop(key); };

  // ---- one-shot SFX ----
  SFX.play = function (key, opts) {
    if (!key || !SFX.enabled) return false;
    opts = opts || {};
    const def = A().sfx[key] || { vol: 0.7 }, vol = (def.vol ?? 0.7) * (opts.vol ?? 1) * SFX.vol("sfx"), t = now();
    SFX.played.push(key); if (SFX.played.length > 50) SFX.played.shift();   // debug / tests: what the game asked for
    if (!A().sfx[key] || def.pending) return false;   // unknown keys and pending files are silent (never requested)
    if (!hasDom || !SFX.unlocked || vol <= 0) return false;
    const e = load(key, sfxUrls(key));
    if (e.state !== "ok") return false;
    const adm = SFX.admit(key, vol, t); if (!adm.ok) return false;
    if (adm.stop) { try { adm.stop.stop(); } catch (x) {} SFX.guns = SFX.guns.filter((v) => v !== adm.stop); }
    SFX.last[key] = t;
    const rate = def.noPitch ? 1 : 1 + (Math.random() * 2 - 1) * A().pitchVar;   // noPitch: musical one-shots stay in key
    let voice;
    try {
      if (e.buf && SFX.ctx) {
        const src = SFX.ctx.createBufferSource(), g = SFX.ctx.createGain(); src.buffer = e.buf; src.playbackRate.value = rate; g.gain.value = vol;
        src.connect(g); g.connect(SFX.bus || SFX.master); src.start();
        voice = { vol, end: t + (e.buf.duration / rate) * 1000, stop: () => src.stop() };
      } else if (e.el) {
        const B = A().bus || {}, att = def.group === "gun" && B.htmlGunAtten ? 1 / Math.sqrt(1 + SFX.guns.filter((v) => v.end > t).length) : 1;   // no limiter without Web Audio
        const n = e.el.cloneNode(); n.volume = Math.min(1, vol * att * (B.gain ?? 1)); n.preservesPitch = false; n.playbackRate = rate; n.play().catch(() => {});
        voice = { vol, end: t + ((e.el.duration || 0.5) / rate) * 1000, stop: () => n.pause() };
      }
    } catch (x) { return false; }
    if (voice && def.group === "gun") SFX.guns.push(voice);
    return true;
  };

  // ---- ambient loops: one per screen, 1 s crossfade ----
  SFX.setScreen = function (screen) {
    const key = A().screens[screen]; SFX.screen = screen; SFX.wantLoop = key;
    if (!hasDom || !SFX.unlocked || !SFX.enabled) return;
    if (SFX.amb && SFX.amb.key === key) { SFX.amb.setVol(SFX.loopVol(key)); return; }
    const e = load(key, loopUrls(key)); if (e.state === "ok") SFX.startLoop(key);
  };
  SFX.loopVol = (key) => ((A().loops[key] || {}).vol ?? 0.8) * SFX.vol("ambient");
  SFX.startLoop = function (key) {
    const e = SFX.cache[key], fade = A().crossfadeSec, v = SFX.loopVol(key), old = SFX.amb;
    if (!e || e.state !== "ok") return;
    let voice;
    if (e.buf && SFX.ctx) {
      const src = SFX.ctx.createBufferSource(), g = SFX.ctx.createGain(), t0 = SFX.ctx.currentTime; src.buffer = e.buf; src.loop = true;   // gapless
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + fade); src.connect(g); g.connect(SFX.master); src.start();
      voice = { key, setVol: (x) => g.gain.setTargetAtTime(x, SFX.ctx.currentTime, 0.1), fadeOut: () => { const t = SFX.ctx.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade + 0.05); } };
    } else if (e.el) {
      const n = e.el.cloneNode(); n.loop = true; n.volume = 0; n.play().catch(() => {});
      const ramp = (from, to, done) => { const t0 = now(); const id = setInterval(() => { const f = Math.min(1, (now() - t0) / (fade * 1000)); n.volume = Math.max(0, Math.min(1, from + (to - from) * f)); if (f >= 1) { clearInterval(id); if (done) done(); } }, 50); };
      ramp(0, v);
      voice = { key, setVol: (x) => { n.volume = Math.max(0, Math.min(1, x)); }, fadeOut: () => ramp(n.volume, 0, () => n.pause()) };
    }
    if (old) old.fadeOut();
    SFX.amb = voice;
  };
  SFX.applySettings = function () { if (SFX.amb) SFX.amb.setVol(SFX.loopVol(SFX.amb.key)); if (G.Music) G.Music.applySettings(); };   // music: js/music.js, its own channel

  // SFX bus: gain -> limiter -> master (loops connect to the master directly)
  SFX.makeBus = function (ctx, out) {
    const B = A().bus || {}, g = ctx.createGain(); g.gain.value = B.gain ?? 1;
    if (B.limiter && ctx.createDynamicsCompressor) {
      const c = ctx.createDynamicsCompressor(), L = B.limiter;
      c.threshold.value = L.threshold; c.knee.value = L.knee; c.ratio.value = L.ratio; c.attack.value = L.attack; c.release.value = L.release;
      g.connect(c); c.connect(out); SFX.limiter = c;
    } else g.connect(out);
    return g;
  };
  // browsers only allow audio after a user gesture
  SFX.unlock = function () {
    if (SFX.unlocked) return; SFX.unlocked = true;
    try { const AC = root.AudioContext || root.webkitAudioContext; if (AC) { SFX.ctx = new AC(); SFX.master = SFX.ctx.createGain(); SFX.master.connect(SFX.ctx.destination); SFX.bus = SFX.makeBus(SFX.ctx, SFX.master); } } catch (x) { SFX.ctx = null; }
    if (SFX.screen) SFX.setScreen(SFX.screen);
    if (G.Music) G.Music.onUnlock();
  };
  // iOS Safari only lets audio start from a touchend / click (not touchstart / pointerdown), can hand back a suspended
  // context, and suspends it again after an interruption: every gesture resumes it, and the first one plays a 1-sample
  // silent buffer (the old iOS unlock). Cheap once it's running.
  SFX.resume = function () {
    SFX.unlock(); const c = SFX.ctx; if (!c) return;
    if (c.state !== "running" && c.resume) { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); } catch (x) {} }
    if (!SFX._kicked) { SFX._kicked = true; try { const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, 22050); s.connect(c.destination); s.start(0); } catch (x) {} }
  };
  if (hasDom) {
    for (const k of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) document.addEventListener(k, SFX.resume, { capture: true, passive: true });
    document.addEventListener("click", (ev) => { const b = ev.target && ev.target.closest && ev.target.closest("button"); if (b && !b.disabled && !b.dataset.nosfx) SFX.play("sfx_ui_click"); }, true);
  }
})(window);
