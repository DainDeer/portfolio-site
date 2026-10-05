// Core helpers: namespace, seeded RNG, math utils. No DOM access here (usable from node tests).
(function (root) {
  const G = root.G = root.G || {};
  G.Util = {};
  const U = G.Util;

  // mulberry32 seeded RNG
  U.makeRng = function (seed) {
    let a = (seed >>> 0) || 1;
    const rng = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.seed = seed;
    rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));        // inclusive
    rng.range = (lo, hi) => lo + rng() * (hi - lo);
    rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
    rng.chance = (pct) => rng() * 100 < pct;
    rng.getState = () => a; rng.setState = (v) => { a = v | 0; };   // Slice 4 §H: Standard's Retry fight rewinds the shared stream
    rng.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    rng.weighted = (entries, wf) => { // entries array, wf(entry)->weight
      let tot = 0; for (const e of entries) tot += Math.max(0, wf(e));
      if (tot <= 0) return entries[0];
      let r = rng() * tot;
      for (const e of entries) { r -= Math.max(0, wf(e)); if (r <= 0) return e; }
      return entries[entries.length - 1];
    };
    return rng;
  };
  U.randomSeed = () => (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0;
  // global gameplay rng (reseeded per expedition); battles get their own
  G.rng = U.makeRng(U.randomSeed());

  U.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.uid = (() => { let n = 0; return (p) => (p || "id") + "_" + Date.now().toString(36) + "_" + (n++).toString(36) + Math.floor(Math.random() * 1e4).toString(36); })();
  U.fmt1 = (v) => (Math.round(v * 10) / 10).toString();
  U.pct = (v) => Math.round(v) + "%";
  // Vixie (Hex beginning pass): data copy still carries [DRAFT] / [PLACEHOLDER] tags (the flavor pass to-do list, see
  // tests/copy_tags.js); they're stripped here, at display time, never in the data. A tag right before punctuation
  // takes its leading space with it ("LOG [PLACEHOLDER]: x" -> "LOG: x"), otherwise the space after it.
  U.copy = (s) => (typeof s !== "string" || s.indexOf("[") < 0 ? s : s.replace(/ ?\[(?:DRAFT|PLACEHOLDER)\](?=[:;,.!?)]|$)/g, "").replace(/\[(?:DRAFT|PLACEHOLDER)\] ?/g, ""));
  // Hex retest (g): global hotkeys ignore keys typed into a field (input, textarea, select, contenteditable)
  U.typing = (e) => { const t = (e && e.target && e.target.nodeType === 1 ? e.target : null) || (typeof document !== "undefined" ? document.activeElement : null);
    return !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.isContentEditable); };
  U.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  U.fmtTime = (ms) => {
    if (ms <= 0) return "ready";
    const s = Math.ceil(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
    if (h) return h + "h " + (m % 60) + "m";
    if (m) return m + "m " + (s % 60) + "s";
    return s + "s";
  };
  // get/set by dotted path
  U.getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  U.setPath = (obj, path, v) => { const ks = path.split("."); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; };

  // simple event log hook (UI subscribes)
  G.logListeners = [];
  G.log = function (msg, cls) { for (const f of G.logListeners) f(msg, cls); };
  // clock indirection so the debug panel can fast-forward timers
  G.clockOffset = 0;
  G.now = () => Date.now() + G.clockOffset;
})(typeof window !== "undefined" ? window : globalThis);
