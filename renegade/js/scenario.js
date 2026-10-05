// SP-096 scenario links: capture the current game as a self-contained snapshot, turn it into a link (#s=<code>), a
// hosted file (?scenario=<id> -> scenarios/<id>.json) or a .renegade file, and open one as a SANDBOX that never reads,
// writes or wipes the real save (js/state.js St.sandbox / St.key / St.store). Logic only (no DOM): js/scenarioview.js
// draws the banner and dialogs, js/main.js routes the boot. Tests: tests/scenario_links.js, tests/browser/scenario_links.py.
(function (root) {
  const G = root.G, U = G.Util, St = G.State;
  const Sc = G.Scenario = {};
  Sc.FMT = "renegade-scenario";
  Sc.V = 1;
  Sc.MAX_FRAGMENT = 8000;            // a #s= code longer than this isn't offered as a link (download / publish instead)
  Sc.ID_RE = /^[a-z0-9-]{1,64}$/;    // ?scenario=<id> and scenarios/<id>.json
  Sc.LOCAL_ID = "local";             // ?scenario=local opens the payload the Load dialog left in sessionStorage
  Sc.PENDING_KEY = "renegade_sandbox_pending";   // sessionStorage (this tab only), never localStorage

  // A readable failure: the message completes "This scenario link couldn't be opened: ..."
  const fail = (msg) => { const e = new Error(msg); e.scenario = true; throw e; };
  Sc.isScenarioError = (e) => !!(e && e.scenario);

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const cleanText = (v, max) => String(v == null ? "" : v).replace(/</g, "‹").replace(/>/g, "›").slice(0, max);
  // every string (and key) in a value, with its path: f(str, path) -> true stops
  function walkStrings(v, path, f) {
    if (typeof v === "string") return f(v, path);
    if (!v || typeof v !== "object") return false;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (walkStrings(v[i], path + "[" + i + "]", f)) return true; return false; }
    for (const k of Object.keys(v)) { if (f(k, path + " (key)")) return true; if (walkStrings(v[k], path + "." + k, f)) return true; }
    return false;
  }
  function walkObjects(v, f) {
    if (!v || typeof v !== "object") return;
    f(v);
    for (const k of Object.keys(v)) walkObjects(v[k], f);
  }

  // --- capture
  // Maps take most of a payload, so only the zones the load path (St.repair: rebuild missing zones from the save's seed,
  // then the annex clamp) wouldn't give back byte-identically are carried: none for a fresh map; zone A once the annex
  // moved (Main 1), any zone a debug "Reseed map" changed. Checked by running that load path on a copy.
  // -> the maps object to put in the payload, or undefined for none
  const sameMaps = (c, s) => { try { St.repair(c); return JSON.stringify(c.maps) === JSON.stringify(s.maps); } catch (e) { return false; } };
  Sc.mapsToCarry = function (s) {
    if (!s.maps) return undefined;
    const bare = clone(s); delete bare.maps;
    if (sameMaps(clone(bare), s)) return undefined;
    const rebuilt = clone(bare); St.repair(rebuilt);
    const keep = {};   // zone A always rides along when anything does (St.repair rebuilds everything when A is missing)
    for (const z in s.maps) if (z === "a" || JSON.stringify(s.maps[z]) !== JSON.stringify(rebuilt.maps[z])) keep[z] = s.maps[z];
    const part = clone(bare); part.maps = clone(keep);
    return sameMaps(part, s) ? keep : s.maps;
  };
  // capture({ name, note, by }) -> payload. Strings with < or > (a Grunt renamed "Bob <3") become ‹ › so the payload
  // passes the load-side check; payload's sanitized count is reported by share().
  Sc.capture = function (o) {
    o = o || {};
    if (!G.state) throw new Error("no game is loaded");
    const st = clone(G.state);
    if (st.run) delete st.run.snapshot;   // the deploy snapshot doubles the size; debug "Restart expedition" is off in a sandbox
    const maps = Sc.mapsToCarry(G.state); if (maps) st.maps = clone(maps); else delete st.maps;
    let sanitized = 0;
    const fix = (v) => {
      if (typeof v === "string") { if (/[<>]/.test(v)) { sanitized++; return cleanText(v, Infinity); } return v; }
      if (!v || typeof v !== "object") return v;
      if (Array.isArray(v)) return v.map(fix);
      const out = {}; for (const k of Object.keys(v)) out[fix(k)] = fix(v[k]); return out;
    };
    const tuning = G.Debug && G.Debug.overrides && Object.keys(G.Debug.overrides).length ? clone(G.Debug.overrides) : undefined;
    const p = {
      fmt: Sc.FMT, v: Sc.V,
      name: cleanText(o.name, 120).trim() || "Untitled scenario",
      note: cleanText(o.note, 2000).trim(),
      by: cleanText(o.by, 60).trim(),
      createdAt: new Date().toISOString(),
      build: String(root.BUILD_ID || "dev"),
      saveVersion: DATA.config.version,
      rng: G.rng.getState(),           // the shared stream's position: the same link replays the same rolls
      capturedNow: Math.round(G.now()),   // game clock at capture: restore timers / Vault timers read the same on open
      state: fix(st),
    };
    if (tuning) p.tuning = fix(tuning);
    Object.defineProperty(p, "_sanitized", { value: sanitized, enumerable: false });
    return p;
  };

  // --- codec: JSON -> deflate-raw (CompressionStream) -> base64url, and back
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  Sc.b64url = function (bytes) {
    let out = "", i = 0;
    for (; i + 2 < bytes.length; i += 3) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]; out += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
    if (i < bytes.length) { const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8); out += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : ""); }
    return out;
  };
  Sc.unb64url = function (str) {
    str = String(str).replace(/=+$/, "");
    if (!/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) fail("the code is damaged (it has characters a scenario code can't contain)");
    const out = new Uint8Array(Math.floor(str.length * 3 / 4)); let o = 0;
    for (let i = 0; i < str.length; i += 4) {
      const c = [0, 1, 2, 3].map((j) => (i + j < str.length ? B64.indexOf(str[i + j]) : 0));
      const n = (c[0] << 18) | (c[1] << 12) | (c[2] << 6) | c[3];
      out[o++] = n >> 16; if (i + 2 < str.length) out[o++] = (n >> 8) & 255; if (i + 3 < str.length) out[o++] = n & 255;
    }
    return out.subarray(0, o);
  };
  async function pump(stream, bytes) {
    const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {});
    const r = stream.readable.getReader(), parts = []; let n = 0;
    for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); n += value.length; }
    const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const streams = () => {
    if (typeof root.CompressionStream !== "function" || typeof root.DecompressionStream !== "function") fail("this browser can't unpack scenario links (no CompressionStream; update it, or use a .renegade file)");
    return root;
  };
  Sc.encode = async function (payload) {
    const json = typeof payload === "string" ? payload : JSON.stringify(payload);
    return Sc.b64url(await pump(new (streams().CompressionStream)("deflate-raw"), new root.TextEncoder().encode(json)));
  };
  Sc.decode = async function (code) {
    const bytes = Sc.unb64url(String(code || "").trim());
    if (!bytes.length) fail("the link has no scenario code in it");
    let raw;
    try { raw = await pump(new (streams().DecompressionStream)("deflate-raw"), bytes); } catch (e) { if (e.scenario) throw e; fail("the code is damaged or cut short (it may have been truncated when it was copied)"); }
    return Sc.parseJson(new root.TextDecoder().decode(raw));
  };
  Sc.parseJson = function (text) {
    try { return JSON.parse(text); } catch (e) { fail("the scenario data is damaged (" + e.message + ")"); }
  };

  // --- validate + prepare (no side effects: throws a readable error, or returns a ready state)
  // Version table (saveVersion = DATA.config.version when captured):
  //   same version, same build  -> opens
  //   same version, other build -> opens with a warning in the banner (content tuning may differ)
  //   version 4                 -> opens: St.migrate5 renames the difficulty (same rules)
  //   older version (< 4)       -> refused (the existing migrations only go v1 -> v2 -> v3, and v4 is a wipe)
  //   newer version             -> refused: reload to update the game
  Sc.prepare = function (p) {
    if (!p || typeof p !== "object" || Array.isArray(p)) fail("it isn't a Renegade scenario");
    if (p.fmt !== Sc.FMT) fail("it isn't a Renegade scenario (format \"" + cleanText(p.fmt, 40) + "\")");
    if (typeof p.v !== "number") fail("it isn't a Renegade scenario (no format version)");
    if (p.v > Sc.V) fail("it was made by a newer version of the game. Reload the page to update, then open the link again");
    if (p.v !== Sc.V) fail("it uses an unknown scenario format (v" + p.v + ")");
    let bad = null;
    walkStrings(p, "scenario", (str, path) => { if (/[<>]/.test(str)) { bad = path; return true; } return false; });
    if (bad) fail("it contains \"<\" or \">\" (in " + bad.replace(/^scenario\./, "") + "), which scenarios may not");
    const cur = DATA.config.version, sv = p.saveVersion;
    if (typeof sv !== "number") fail("it has no save version");
    if (sv > cur) fail("it was saved by a newer build (save version " + sv + "; this game reads " + cur + "). Reload the page to update, then open the link again");
    if (!p.state || typeof p.state !== "object" || Array.isArray(p.state)) fail("it has no game state in it");
    if (p.state.version !== sv) fail("its save version doesn't match its game state");
    if (!Number.isFinite(p.rng) || !Number.isFinite(p.capturedNow)) fail("it's missing its dice position or clock");
    let st = clone(p.state);
    if (st.version === 1) st = St.migrate(st);
    if (st.version === 2) st = St.migrate3(st);
    if (st.version === 4) st = St.migrate5(st);
    if (st.version < cur) fail("it was saved by an older build (save version " + sv + "; this game reads " + cur + " since The Scablands reshaped the map). Capture it again on the current build");
    if (st.version !== cur) fail("it has an unknown save version " + st.version);
    // ids the content may have dropped since it was captured
    walkObjects(st, (o) => { if (!bad && typeof o.uid === "string" && typeof o.base === "string" && "rarity" in o && !G.Items.base(o.base)) bad = "an item that no longer exists (\"" + o.base + "\")"; });
    if (bad) fail("it uses " + bad + ". It was probably captured on another build");
    if (st.maps && typeof st.maps === "object") for (const z in st.maps) if (!DATA.zones.list[z]) fail("it has a map for a zone this build doesn't know (\"" + z + "\")");
    try { St.repair(st); } catch (e) { fail("its game state couldn't be rebuilt (" + e.message + ")"); }
    if (st.run) {
      const z = st.run.zone || "a";
      if (!DATA.zones.list[z]) fail("its expedition is in a zone this build doesn't know (\"" + z + "\")");
      if (st.run.loc && !(st.maps[z] && st.maps[z].nodes && st.maps[z].nodes[st.run.loc])) fail("its expedition stands on a location this build's map doesn't have (\"" + st.run.loc + "\")");
    }
    const warnings = [];
    const here = String(root.BUILD_ID || "dev");
    if (p.build && p.build !== here) warnings.push("made on build " + p.build + ", this is " + here);
    const tuning = {};
    if (p.tuning && typeof p.tuning === "object") for (const k in p.tuning) {
      try { const c = U.getPath(DATA, k), v = p.tuning[k]; if (c !== undefined && typeof c === typeof v && typeof c !== "object") tuning[k] = v; } catch (e) {}
    }
    return { state: st, warnings, tuning };
  };

  // --- enter: everything is checked before the first change. Afterwards St.sandbox is set, the sandbox keys hold only
  // this scenario, and G.state / G.rng / G.clockOffset are the captured ones. source: { kind, id }
  Sc.enter = function (p, source) {
    const ready = Sc.prepare(p);
    source = source || {};
    St.sandbox = { kind: source.kind || "file", id: source.id || null, name: p.name || "Untitled scenario", note: p.note || "", by: p.by || "", build: p.build || "", createdAt: p.createdAt || "", warnings: ready.warnings };
    Sc.clearSandboxKeys();
    if (Object.keys(ready.tuning).length) St.saveOverrides(ready.tuning);   // js/main.js applies them through St.loadOverrides
    G.state = ready.state;
    G.clockOffset = p.capturedNow - Date.now();
    G.rng = U.makeRng(1); G.rng.setState(p.rng);
    St.save();
    return St.sandbox;
  };
  // remove this sandbox's keys (only ever renegade_sandbox_* / <namespace>sandbox_*)
  Sc.clearSandboxKeys = function () {
    for (const k of ["save", "save_unreadable", "tuning"]) { try { St.store.remove(St.SANDBOX_PREFIX + k); } catch (e) {} }
  };
  // Exit: clear the sandbox keys and stop further saves; the caller then navigates back to the plain game URL
  Sc.exit = function () {
    if (!St.sandbox) return;
    St.sandbox.exiting = true;
    Sc.clearSandboxKeys();
    try { root.sessionStorage && root.sessionStorage.removeItem(Sc.PENDING_KEY); } catch (e) {}
  };

  // --- where a boot finds its scenario. loc: { search, hash } -> null | { kind: "hosted"|"fragment"|"local", id?, code? } | { kind: "bad", error }
  Sc.request = function (loc) {
    const q = new root.URLSearchParams((loc && loc.search) || "");
    if (q.has("scenario")) {
      const id = q.get("scenario") || "";
      if (id === Sc.LOCAL_ID) return { kind: "local", id };
      if (!Sc.ID_RE.test(id)) return { kind: "bad", error: "the scenario name in the link isn't valid (lowercase letters, digits and - only)" };
      return { kind: "hosted", id };
    }
    const hash = (loc && loc.hash) || "";
    if (hash.indexOf("#s=") === 0) return { kind: "fragment", code: hash.slice(3) };
    return null;
  };
  // resolve(req) -> Promise<payload>. Hosted ids are fetched relative to the page (same origin, scenarios/<id>.json).
  Sc.resolve = async function (req, signal) {
    if (req.kind === "bad") fail(req.error);
    if (req.kind === "fragment") return Sc.decode(req.code);
    if (req.kind === "local") {
      let raw = null; try { raw = root.sessionStorage.getItem(Sc.PENDING_KEY); } catch (e) {}
      if (!raw) fail("the scenario you loaded from a file is gone (it only lives in the tab you loaded it in)");
      return Sc.parseJson(raw);
    }
    let res;
    try { res = await root.fetch("scenarios/" + req.id + ".json", { cache: "no-cache", credentials: "same-origin", signal }); } catch (e) { fail("the scenario \"" + req.id + "\" couldn't be downloaded (are you offline?)"); }
    if (res.status === 404) fail("there's no published scenario called \"" + req.id + "\"");
    if (!res.ok) fail("the scenario \"" + req.id + "\" couldn't be downloaded (HTTP " + res.status + ")");
    return Sc.parseJson(await res.text());
  };
  // Pasted text or a file's contents: a link (…#s=code or …?scenario=id is handled by the caller), a bare code, or JSON
  Sc.parseAny = async function (text) {
    text = String(text || "").trim();
    if (!text) fail("there's nothing to load");
    if (text[0] === "{") return Sc.parseJson(text);
    const i = text.indexOf("#s="); if (i >= 0) text = text.slice(i + 3);
    return Sc.decode(text);
  };

  // --- share({ name, note, by }) -> { payload, json, code, link, chars, bytes, fits, sanitized }
  // link: <base>#s=<code> when the code fits Sc.MAX_FRAGMENT, else null (download the .renegade file or publish it).
  // base: window.RENEGADE_LINK_BASE (a published playable build) or this page's URL without query / hash.
  Sc.linkBase = function () {
    if (typeof root.RENEGADE_LINK_BASE === "string" && /^https?:\/\//.test(root.RENEGADE_LINK_BASE)) return root.RENEGADE_LINK_BASE;
    const l = root.location; return l ? l.origin + l.pathname : "";
  };
  Sc.share = async function (o) {
    const payload = Sc.capture(o), json = JSON.stringify(payload), code = await Sc.encode(json);
    const fits = code.length <= Sc.MAX_FRAGMENT;
    const out = { payload, json, code, chars: code.length, bytes: json.length, fits, link: fits ? Sc.linkBase() + "#s=" + code : null, sanitized: payload._sanitized };
    if (fits && root.navigator && root.navigator.clipboard) { try { await root.navigator.clipboard.writeText(out.link); out.copied = true; } catch (e) { out.copied = false; } }
    return out;
  };
  // a hosted link for a published id
  Sc.hostedLink = (id) => Sc.linkBase() + "?scenario=" + id;
})(typeof window !== "undefined" ? window : globalThis);
