// Slice 4 §H: difficulties (DATA.config.difficulty). Picked on the start screen for a new save (js/title.js) and
// locked for it; only the death rules change. Casual: equipped items come home, each found item (and found resource
// unit) is lost on its own 50% roll, and a lost fight can be retried from its start (unlimited). Standard: as before.
// Hardcore: a human body that dies is gone for good; the Basic body dies as in Standard (Vixie).
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
    // resources: every unit on its own roll (Vixie), i.e. a binomial draw per stack
    const pr = (d.foundResLossPct ?? d.foundLossPct) / 100;
    for (const k in r.bag.res) { const n = Math.round(r.bag.res[k] || 0); if (n <= 0) continue; const lostN = Df.binomial(n, pr, rng), keptN = n - lostN;
      if (keptN) { s.stash.res[k] = (s.stash.res[k] || 0) + keptN; out.resKept[k] = keptN; } if (lostN) out.resLost[k] = lostN; r.bag.res[k] = 0; }
    if (r.ammo && r.ammo.n > 0 && G.Workbench) { G.Workbench.addAmmo(r.ammo.base, r.ammo.n); out.ammoKept = r.ammo.n; r.ammo.n = 0; }   // brought from the stash: kept like gear
    return out;
  };
  // how many of n units are lost at probability p: one roll per unit (a normal approximation past 2000 units)
  Df.binomial = function (n, p, rng) {
    if (n <= 2000) { let k = 0; for (let i = 0; i < n; i++) if (rng() < p) k++; return k; }
    const u = Math.max(1e-12, rng()), v = rng(), z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(0, Math.min(n, Math.round(n * p + z * Math.sqrt(n * p * (1 - p)))));
  };
  // Hardcore: does this body die for good? Human bodies only; the Basic body is never reset (Vixie)
  Df.isPermadeath = (s, body) => !!(Df.def(s).permadeath && body && body.family !== "basic" && body.uid !== "body_basic");
  // Hardcore: the human body is gone for good. Returns the next body's title, or null (not a permadeath)
  Df.permadeath = function (s, body) {
    if (!Df.isPermadeath(s, body)) return null;
    s.fallenBodies = s.fallenBodies || [];
    s.fallenBodies.push({ uid: body.uid, name: body.name, title: G.State.bodyTitle(body), level: G.Skills.bodyLevel(body), diedRun: s.runCount });
    s.bodies = s.bodies.filter((b) => b !== body && b.uid !== body.uid);
    let next = s.bodies.find((b) => G.State.bodyReady(b)) || s.bodies.find((b) => b.uid === "body_basic") || s.bodies[0];
    if (!next) { next = G.State.makeBasicBody(); s.bodies.unshift(next); }   // (can't happen: the Basic body is never removed)
    s.loadout.bodyId = next.uid;
    return G.State.bodyTitle(next);
  };
})(typeof window !== "undefined" ? window : globalThis);
