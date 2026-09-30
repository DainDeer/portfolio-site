// Slice 3 §10a: injuries on bodies and allies (rec.injuries = [{ id, got: runCount }]) and the Infirmary beds.
(function (root) {
  const G = root.G, U = G.Util;
  const J = G.Injuries = {};
  const D = () => DATA.injuries, O = () => G.Outpost;
  J.def = (id) => D().list[id];
  J.of = (rec) => (rec && rec.injuries) || [];
  // refs: a save body or a grunt record. Returns the injury id given, or null (cap / all kinds held)
  J.add = function (rec, source, rng) {
    if (!rec || (source && D().sources[source] === false)) return null;
    rec.injuries = rec.injuries || [];
    if (rec.injuries.length >= D().maxPerUnit) return null;
    const pool = Object.keys(D().list).filter((k) => !rec.injuries.some((x) => x.id === k)); if (!pool.length) return null;
    const id = (rng || G.rng).pick(pool);
    rec.injuries.push({ id, got: G.state.runCount, src: source || null });
    (G.state.run && G.Exp ? G.Exp.log : G.log)(`${J.name(rec)}: ${J.def(id).name} (${J.def(id).desc}). Treat it at the Infirmary, or it heals after ${J.healRuns()} runs.`, "bad");
    return id;
  };
  J.name = (rec) => (rec.family ? G.State.bodyTitle(rec) : G.Allies ? G.Allies.name(rec) : rec.name);
  // summed stat mods for a unit's injuries
  J.mods = function (rec) {
    const m = { hpPct: 0, acc: 0, movePct: 0, jam: 0, asPct: 0 };
    for (const x of J.of(rec)) { const d = J.def(x.id); if (d) for (const k in d.mods) m[k] += d.mods[k]; }
    return m;
  };
  J.healRuns = () => (O().built("infirmary") && O().effects("infirmary").healRuns) || D().healRuns;
  J.runsLeft = (x) => Math.max(0, J.healRuns() - (G.state.runCount - x.got));
  // all units that can hold injuries (bodies, living allies)
  J.units = () => G.state.bodies.concat(G.state.grunts);
  J.find = (uid) => J.units().find((u) => u.uid === uid) || null;
  // X.endRun: untreated injuries heal after healRuns runs (counted from the run they were taken in)
  J.onRunEnd = function () {
    for (const u of J.units()) {
      if (!u.injuries || !u.injuries.length) continue;
      const keep = [];
      for (const x of u.injuries) { if (J.inBed(u.uid, x.id)) { keep.push(x); continue; } if (G.state.runCount - x.got >= J.healRuns()) G.log(`${J.name(u)}: ${J.def(x.id).name} healed by itself.`, "good"); else keep.push(x); }
      u.injuries = keep;
    }
  };
  // ---- Infirmary beds: effects.beds at once, treatSec each, treatCost from the stockpile ----
  J.beds = () => { const st = O().st("infirmary"); st.beds = st.beds || []; return st.beds; };
  J.inBed = (uid, id) => { const s = G.state; const st = s.buildings && s.buildings.infirmary; return !!(st && st.beds && st.beds.some((b) => b.uid === uid && (!id || b.inj === id))); };
  J.bedUntil = (uid) => { const b = J.beds().find((x) => x.uid === uid); return b ? b.until : 0; };
  J.canTreat = function (uid, id) {
    if (G.state.run) return "Finish the expedition first.";
    if (!O().built("infirmary")) return "Build the Infirmary first.";
    const u = J.find(uid); if (!u || !J.of(u).some((x) => x.id === id)) return "No such injury.";
    if (J.inBed(uid, id)) return "Already being treated.";
    const E = O().effects("infirmary"); if (J.beds().length >= E.beds) return `All beds are taken (${E.beds}).`;
    const c = E.treatCost || {}, miss = Object.keys(c).filter((r) => (G.state.stash.res[r] || 0) < c[r]);
    return miss.length ? "Not enough " + miss.map((r) => DATA.resources[r].name).join(", ") + "." : null;
  };
  J.treat = function (uid, id) {
    const why = J.canTreat(uid, id); if (why) return why;
    const E = O().effects("infirmary"), c = E.treatCost || {};
    for (const r in c) G.state.stash.res[r] -= c[r];
    J.beds().push({ uid, inj: id, until: G.now() + E.treatSec * 1000 });
    G.log(`Infirmary: treating ${J.name(J.find(uid))}'s ${J.def(id).name} (${U.fmtTime(E.treatSec * 1000)}).`);
    return null;
  };
  J.tick = function () {
    const s = G.state, st = s && s.buildings && s.buildings.infirmary; if (!st || !st.beds || !st.beds.length) return false;
    let n = 0;
    st.beds = st.beds.filter((b) => { if (G.now() < b.until) return true; const u = J.find(b.uid); if (u && u.injuries) { u.injuries = u.injuries.filter((x) => x.id !== b.inj); G.log(`Infirmary: ${J.name(u)}'s ${J.def(b.inj).name} is treated.`, "good"); } n++; return false; });
    return n > 0;
  };
  // deploy: a unit in a bed stays home until its treatment ends
  J.busy = (uid) => J.inBed(uid);
  if (G.Outpost) G.Outpost.tickHooks.push(J.tick);
})(typeof window !== "undefined" ? window : globalThis);
