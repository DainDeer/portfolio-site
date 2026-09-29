// Outpost buildings (Slice 2 §8): Vault L2 upgrade on a real-time timer; pouch and stash limits come from here.
(function (root) {
  const G = root.G;
  const O = G.Outpost = {};
  O.freshState = () => { const b = {}; for (const k in DATA.outpost.buildings) b[k] = { level: 1, upgrading: null }; return b; };
  O.st = (k) => { const s = G.state; s.buildings = s.buildings || O.freshState(); s.buildings[k] = s.buildings[k] || { level: 1, upgrading: null }; return s.buildings[k]; };
  O.def = (k) => DATA.outpost.buildings[k];
  O.level = (k) => { O.tick(); return O.st(k).level; };
  O.effects = (k) => { const d = O.def(k); return (d.levels[O.level(k)] || {}).effects || {}; };
  O.nextLevel = (k) => { const st = O.st(k), d = O.def(k); return st.level < d.maxLevel ? st.level + 1 : null; };
  // cost of the next level, after reputation perks (Dunn L2: food/water x0.8, rounded up)
  O.cost = function (k, lvl) {
    const L = O.def(k).levels[lvl || O.nextLevel(k)]; if (!L || !L.cost) return {};
    const out = {};
    for (const r in L.cost) out[r] = Math.max(0, Math.ceil(L.cost[r] * (G.Quests ? G.Quests.upgradeCostMult(r) : 1) - 1e-9));   // -1e-9: float noise never rounds a whole number up
    return out;
  };
  // ---- Grunt recruiting (config.grunts) ----
  O.gruntCount = () => G.state.grunts.filter((g) => g.rank === "grunt").length;
  O.recruitCost = () => Object.assign({}, DATA.config.grunts.recruitCost);
  O.canRecruit = function () {
    if (G.state.run) return "Finish the expedition first.";
    if (O.gruntCount() >= DATA.config.grunts.rosterCap) return `Roster full (${DATA.config.grunts.rosterCap} Grunts).`;
    const c = O.recruitCost(), res = G.state.stash.res, miss = Object.keys(c).filter((r) => (res[r] || 0) < c[r]);
    return miss.length ? "Not enough " + miss.map((r) => DATA.resources[r].name).join(", ") + "." : null;
  };
  O.recruit = function () {
    const why = O.canRecruit(); if (why) return { error: why };
    const c = O.recruitCost(); for (const r in c) G.state.stash.res[r] -= c[r];
    const g = G.State.makeGrunt(G.rng); G.state.grunts.push(g);
    G.log(`Recruited ${g.name} (${Object.entries(c).map(([r, n]) => n + " " + DATA.resources[r].name).join(" + ")}).`, "good");
    G.State.save();
    return { grunt: g };
  };
  O.canUpgrade = function (k) {
    const st = O.st(k), lvl = O.nextLevel(k);
    if (G.state.run) return "Finish the expedition first.";
    if (!lvl) return "Max level.";
    if (st.upgrading) return "Already upgrading.";
    const c = O.cost(k, lvl), res = G.state.stash.res;
    const miss = Object.keys(c).filter((r) => (res[r] || 0) < c[r]);
    return miss.length ? "Not enough " + miss.map((r) => DATA.resources[r].name).join(", ") + "." : null;
  };
  O.startUpgrade = function (k) {
    const why = O.canUpgrade(k); if (why) return why;
    const lvl = O.nextLevel(k), c = O.cost(k, lvl), L = O.def(k).levels[lvl];
    for (const r in c) G.state.stash.res[r] -= c[r];
    O.st(k).upgrading = { to: lvl, until: G.now() + L.buildSec * 1000 };
    G.log(`${O.def(k).name} upgrade to L${lvl} started (${G.Util.fmtTime(L.buildSec * 1000)}).`);
    return null;
  };
  // complete finished timers; returns the list of finished upgrades
  O.tick = function () {
    const s = G.state, done = [];
    if (!s || !s.buildings) return done;
    for (const k in s.buildings) {
      const st = s.buildings[k];
      if (st.upgrading && G.now() >= st.upgrading.until) { st.level = st.upgrading.to; st.upgrading = null; done.push(k); if (G.log) G.log(`${O.def(k).name} upgraded to L${st.level}.`); }
    }
    return done;
  };
  O.remainingMs = (k) => { const u = O.st(k).upgrading; return u ? Math.max(0, u.until - G.now()) : 0; };
  // limits used by the deploy screen and the expedition (replace DATA.config.carry.pouchSlots / pouchMaxKg)
  O.pouchSlots = () => O.effects("vault").pouchSlots || DATA.config.carry.pouchSlots;
  O.pouchMaxKg = () => O.effects("vault").pouchMaxKg || DATA.config.carry.pouchMaxKg;
  O.stashCap = () => DATA.outpost.stash.baseCap + (O.effects("vault").stashBonus || 0);
  O.stashCount = () => G.state.stash.items.filter((it) => !G.Items.isQuest(it)).length;
  O.stashOver = () => Math.max(0, O.stashCount() - O.stashCap());
})(typeof window !== "undefined" ? window : globalThis);
