// Slice 4 §H: difficulties (DATA.config.difficulty). Picked on the start screen for a new save (js/title.js) and
// locked for it; only the death rules change. Casual: equipped items come home, each found item (and found resource
// type) is lost on its own 50% roll, and a lost fight can be retried from its start (unlimited). Standard: as before.
// Hardcore: the body that dies is gone for good (the Basic body comes back as a fresh level-1 husk).
(function (root) {
  const G = root.G, U = G.Util;
  const Df = G.Difficulty = {};
  const C = () => DATA.config.difficulty;
  Df.id = (s) => { s = s || G.state; const d = s && s.difficulty; return d && C().list[d] ? d : C().default; };
  Df.def = (s) => C().list[Df.id(s)];
  Df.name = (s) => Df.def(s).name;
  Df.locked = (s) => { s = s || G.state; return !!(s && s.difficultyLocked); };
  Df.pending = (s) => { s = s || G.state; return !!s && !s.difficultyLocked; };   // a new save that hasn't picked yet
  // pick (only while it isn't locked); lock() when the save starts for real (Play, or the first deploy)
  Df.set = function (id, s) { s = s || G.state; if (!C().list[id]) return "No such difficulty."; if (Df.locked(s)) return "The difficulty is locked for this save."; s.difficulty = id; return null; };
  Df.lock = function (s) { s = s || G.state; if (!s || s.difficultyLocked) return; s.difficulty = Df.id(s); s.difficultyLocked = true; G.log(`Difficulty: ${Df.name(s)} (locked for this save).`); };

  // ---- Casual: Retry fight. A snapshot of the save + the shared rng just before the battle is built (so the enemies,
  // their gear and the ammo pack are the same); the retry gets a fresh battle seed.
  Df.canRetry = function () { const d = Df.def(); return !!(d.retries && G.state && G.state.run && Df.snap && (d.retries < 0 || (Df.snap.used || 0) < d.retries)); };
  Df.snapBattle = function () {
    if (!Df.def().retries || !G.state || !G.state.run) { Df.snap = null; return; }
    const key = G.state.runCount + ":" + G.state.run.stats.battles;   // the same fight again (a retry doesn't count a battle)
    Df.snap = { json: JSON.stringify(G.state), rng: G.rng.getState(), key, used: Df.snap && Df.snap.key === key ? Df.snap.used : 0 };
  };
  // back to the snapshot: returns the battle step to start again (the caller builds + mounts it), or null
  Df.retry = function () {
    if (!Df.canRetry()) return null;
    const sn = Df.snap; G.state = JSON.parse(sn.json); G.rng.setState(sn.rng); sn.used = (sn.used || 0) + 1;
    const r = G.state.run; r.retries = (r.retries || 0) + 1;
    G.Exp.log(`Retry fight (${r.retries}). The battle starts again.`, "good");
    return G.Exp.current();
  };

  // ---- death: what comes home. Called by G.Exp.die before the standard rules (which then only apply to what's left).
  // returns { keptGear: [names], foundKept: [names], foundLost: [names], resKept: {k:n}, resLost: {k:n} } or null
  Df.onDeath = function (s, r, rng) {
    const d = Df.def(s); if (!d.keepEquipped) return null;
    rng = rng || G.rng;
    const out = { keptGear: [], foundKept: [], foundLost: [], resKept: {}, resLost: {} };
    for (const k in r.gear) { const it = r.gear[k]; if (!it) continue; s.stash.items.push(it); out.keptGear.push(G.Items.name(it)); r.gear[k] = null; }
    const bag = r.bag.items; r.bag.items = [];
    for (const it of bag) { if (rng() * 100 < d.foundLossPct) out.foundLost.push(G.Items.name(it)); else { s.stash.items.push(it); out.foundKept.push(G.Items.name(it)); } }
    for (const k in r.bag.res) { const n = r.bag.res[k]; if (!n) continue; if (rng() * 100 < (d.foundResLossPct ?? d.foundLossPct)) out.resLost[k] = n; else { s.stash.res[k] = (s.stash.res[k] || 0) + n; out.resKept[k] = n; } r.bag.res[k] = 0; }
    if (r.ammo && r.ammo.n > 0 && G.Workbench) { G.Workbench.addAmmo(r.ammo.base, r.ammo.n); out.ammoKept = r.ammo.n; r.ammo.n = 0; }   // brought from the stash: kept like gear
    return out;
  };
  // Hardcore: the body is gone for good. Returns the replacement's title, or null (not Hardcore)
  Df.permadeath = function (s, body) {
    if (!Df.def(s).permadeath || !body) return null;
    s.fallenBodies = s.fallenBodies || [];
    s.fallenBodies.push({ uid: body.uid, name: body.name, title: G.State.bodyTitle(body), level: G.Skills.bodyLevel(body), diedRun: s.runCount });
    s.bodies = s.bodies.filter((b) => b !== body && b.uid !== body.uid);
    let next = null;
    if (body.uid === "body_basic" || !s.bodies.length) { next = G.State.makeBasicBody(); s.bodies.unshift(next); }   // the husk is always there, fresh
    else next = s.bodies.find((b) => G.State.bodyReady(b)) || s.bodies[0];
    s.loadout.bodyId = next.uid;
    return G.State.bodyTitle(next);
  };
})(typeof window !== "undefined" ? window : globalThis);
