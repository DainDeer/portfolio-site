// Outpost buildings (Slice 2 §8, Slice 3 §9-10): build / upgrade on real-time timers with 1 build crew for the whole
// outpost (DATA.outpost.crews); pouch and stash limits; resource production (Water Still, Infirmary L2 Med).
// Level 0 = not built yet (DATA.outpost.buildings[k].startLevel).
(function (root) {
  const G = root.G;
  const O = G.Outpost = {};
  const D = () => DATA.outpost;
  O.fresh1 = (k) => ({ level: D().buildings[k].startLevel != null ? D().buildings[k].startLevel : 1, upgrading: null });
  O.freshState = () => { const b = {}; for (const k in D().buildings) b[k] = O.fresh1(k); return b; };
  O.st = (k) => { const s = G.state; s.buildings = s.buildings || O.freshState(); s.buildings[k] = s.buildings[k] || O.fresh1(k); return s.buildings[k]; };
  O.def = (k) => D().buildings[k];
  O.ids = () => (D().buildOrder || Object.keys(D().buildings)).filter((k) => D().buildings[k]);
  O.level = (k) => { O.tick(); return O.st(k).level; };
  O.built = (k) => O.level(k) >= 1;
  O.effects = (k) => { const d = O.def(k); return (d.levels[O.level(k)] || {}).effects || {}; };
  O.nextLevel = (k) => { const st = O.st(k), d = O.def(k); return st.level < d.maxLevel ? st.level + 1 : null; };
  O.byHotspot = (hs) => O.ids().find((k) => O.def(k).hotspot === hs) || null;
  // Slice 3 §10c: productionEnabled false hides production buildings (the Water Still lot) and stops production
  O.enabled = (k) => !O.def(k).production || !!D().productionEnabled;
  // cost of the next level, after reputation perks (Dunn L2: food/water x0.8, rounded up)
  O.cost = function (k, lvl) {
    const L = O.def(k).levels[lvl || O.nextLevel(k)]; if (!L || !L.cost) return {};
    const out = {};
    for (const r in L.cost) out[r] = Math.max(0, Math.ceil(L.cost[r] * (G.Quests ? G.Quests.upgradeCostMult(r) : 1) - 1e-9));   // -1e-9: float noise never rounds a whole number up
    return out;
  };
  O.busyCrews = () => O.ids().filter((k) => O.st(k).upgrading).length;
  O.crewBusy = () => O.busyCrews() >= (D().crews || 1);
  // ---- Grunt recruiting (config.grunts) ----
  O.gruntCount = () => G.state.grunts.filter((g) => g.rank === "grunt").length;
  O.recruitCost = () => Object.assign({}, DATA.config.grunts.recruitCost);
  O.canRecruit = function () {
    if (G.state.run) return "Finish the expedition first.";
    if (O.gruntCount() >= DATA.config.grunts.rosterCap) return `Roster full (${DATA.config.grunts.rosterCap} Grunts).`;
    if (G.Allies && !G.Allies.candidates().length) return "No candidates left. New ones show up after your next run.";
    const c = O.recruitCost(), res = G.state.stash.res, miss = Object.keys(c).filter((r) => (res[r] || 0) < c[r]);
    return miss.length ? "Not enough " + miss.map((r) => DATA.resources[r].name).join(", ") + "." : null;
  };
  // Slice 3 §1: hiring is from the lot's candidates (G.Allies.hire); O.recruit(i) hires card i (default the first)
  O.recruit = (i) => G.Allies.hire(i || 0);
  O.canUpgrade = function (k) {
    const st = O.st(k), lvl = O.nextLevel(k);
    if (G.state.run) return "Finish the expedition first.";
    if (!lvl) return "Max level.";
    if (!O.enabled(k)) return "Production buildings are switched off.";
    if (st.upgrading) return st.level ? "Already upgrading." : "Already being built.";
    O.tick();
    if (O.crewBusy()) { const b = O.ids().find((x) => O.st(x).upgrading); return `The build crew is busy (${O.def(b).name}, ${G.Util.fmtTime(O.remainingMs(b))} left).`; }
    const c = O.cost(k, lvl), res = G.state.stash.res;
    const miss = Object.keys(c).filter((r) => (res[r] || 0) < c[r]);
    return miss.length ? "Not enough " + miss.map((r) => DATA.resources[r].name).join(", ") + "." : null;
  };
  O.startUpgrade = function (k) {
    const why = O.canUpgrade(k); if (why) return why;
    const lvl = O.nextLevel(k), c = O.cost(k, lvl), L = O.def(k).levels[lvl];
    for (const r in c) G.state.stash.res[r] -= c[r];
    O.st(k).upgrading = { to: lvl, until: G.now() + L.buildSec * 1000, started: G.now() };
    G.log(`${O.def(k).name} ${lvl === 1 ? "construction" : "upgrade to L" + lvl} started (${G.Util.fmtTime(L.buildSec * 1000)}).`);
    return null;
  };
  // complete finished timers; returns the list of finished upgrades
  O.tick = function () {
    const s = G.state, done = [];
    if (!s || !s.buildings || O._ticking) return done;   // hooks read levels (O.level ticks): no re-entry
    O._ticking = true;
    try { O.tick0(s, done); } finally { O._ticking = false; }
    return done;
  };
  O.tick0 = function (s, done) {
    for (const k in s.buildings) {
      const st = s.buildings[k];
      if (!O.def(k)) continue;
      if (st.upgrading && G.now() >= st.upgrading.until) {
        const at = st.upgrading.until; st.level = st.upgrading.to; st.upgrading = null; done.push(k);
        if (G.log) G.log(st.level === 1 ? `${O.def(k).name} built.` : `${O.def(k).name} upgraded to L${st.level}.`);
        O.startProduction(k, at);
      }
    }
    if (O.tickProduction()) O.dirty = true;
    for (const f of O.tickHooks) if (f()) O.dirty = true;   // Workbench jobs, Infirmary beds (true = something finished: the UI re-renders)
  };
  O.remainingMs = (k) => { const u = O.st(k).upgrading; return u ? Math.max(0, u.until - G.now()) : 0; };
  O.tickHooks = [];
  // ---- production (Slice 3 §10c Water Still, §10a Infirmary L2 Med): effects.produce { res: { everySec, cap } }.
  // st.prod[res] = { n: waiting to be collected, since: timestamp the next unit started }. Accrues from timestamps (offline too);
  // while full the clock is held, so nothing grows while you're away beyond the cap.
  O.produce = (k) => (O.enabled(k) && O.st(k).level >= 1 ? O.effects(k).produce || null : null);
  O.startProduction = function (k, at) { const P = (O.def(k).levels[O.st(k).level] || {}).effects; if (!P || !P.produce) return; const st = O.st(k); st.prod = st.prod || {}; for (const r in P.produce) st.prod[r] = st.prod[r] || { n: 0, since: at || G.now() }; };
  O.tickProduction = function () {
    const s = G.state; if (!s || !s.buildings) return false; let changed = false;
    for (const k of O.ids()) {
      const st = s.buildings[k]; if (!st || st.level < 1) continue;
      const P = (O.def(k).levels[st.level] || {}).effects; if (!P || !P.produce) continue;
      st.prod = st.prod || {};
      for (const r in P.produce) {
        const p = st.prod[r] = st.prod[r] || { n: 0, since: G.now() }, R = P.produce[r], per = R.everySec * 1000;
        if (!D().productionEnabled && O.def(k).production) { p.since = G.now(); continue; }   // switched off: no production
        if (p.n >= R.cap) { p.since = G.now(); continue; }   // full: paused
        const k2 = Math.floor((G.now() - p.since) / per);
        if (k2 > 0) { const add = Math.min(k2, R.cap - p.n); p.n += add; changed = true; p.since = p.n >= R.cap ? G.now() : p.since + add * per; }
      }
    }
    return changed;
  };
  O.stored = (k) => { O.tick(); const st = O.st(k); return st.prod ? Object.fromEntries(Object.entries(st.prod).map(([r, p]) => [r, p.n])) : {}; };
  O.nextUnitMs = function (k, r) { const P = O.produce(k); if (!P || !P[r]) return null; const p = O.st(k).prod[r]; if (!p || p.n >= P[r].cap) return null; return Math.max(0, p.since + P[r].everySec * 1000 - G.now()); };
  // collect everything waiting into the stockpile; returns { res: n }
  O.collect = function (k) {
    O.tick(); const st = O.st(k), got = {};
    for (const r in st.prod || {}) { const p = st.prod[r]; if (p.n > 0) { const P = O.produce(k); const full = P && P[r] && p.n >= P[r].cap; got[r] = p.n; G.state.stash.res[r] = (G.state.stash.res[r] || 0) + p.n; p.n = 0; if (full) p.since = G.now(); } }
    if (Object.keys(got).length && G.log) G.log(`${O.def(k).name}: collected ` + Object.entries(got).map(([r, n]) => `${n} ${DATA.resources[r].name}`).join(", ") + ".");
    return got;
  };
  // limits used by the deploy screen and the expedition (replace DATA.config.carry.pouchSlots / pouchMaxKg)
  O.pouchSlots = () => O.effects("vault").pouchSlots || DATA.config.carry.pouchSlots;
  O.pouchMaxKg = () => O.effects("vault").pouchMaxKg || DATA.config.carry.pouchMaxKg;
  O.stashCap = () => DATA.outpost.stash.baseCap + (O.effects("vault").stashBonus || 0);
  O.stashCount = () => G.state.stash.items.filter((it) => !G.Items.isQuest(it)).length;
  O.stashOver = () => Math.max(0, O.stashCount() - O.stashCap());
})(typeof window !== "undefined" ? window : globalThis);
