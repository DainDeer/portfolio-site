// Quests and reputation (Slice 2 §9). Turn-in pays from the stockpile; find needs the quest item in the Vault stash;
// kill quests count kills made while the quest is active (any squad member, in the quest's zone).
(function (root) {
  const G = root.G;
  const Q = G.Quests = {};
  const D = () => DATA.quests;
  Q.freshState = () => ({ active: {}, done: {}, rep: { dunn: 0, ilse: 0 }, flags: {} });
  Q.st = () => { const s = G.state; s.quests = s.quests || Q.freshState(); return s.quests; };
  Q.def = (id) => D().list[id];
  Q.ofGiver = (g) => Object.keys(D().list).filter((id) => D().list[id].giver === g);
  Q.status = (id) => (Q.st().done[id] ? "done" : Q.st().active[id] ? "active" : "available");
  Q.activeIds = () => Object.keys(Q.st().active);
  Q.canTake = function (id) {
    if (Q.status(id) !== "available") return "Already " + Q.status(id) + ".";
    if (Q.activeIds().length >= D().maxActive) return `You can hold at most ${D().maxActive} quests.`;
    return null;
  };
  Q.take = function (id) { const why = Q.canTake(id); if (why) return why; Q.st().active[id] = { progress: 0 }; G.log(`Quest taken: ${Q.def(id).name}.`); return null; };
  Q.abandon = function (id) { delete Q.st().active[id]; };
  // quest item somewhere the player owns it (stash, or the current run's bag)
  Q.ownsItem = function (base) {
    const s = G.state, has = (arr) => (arr || []).some((it) => it && it.base === base);
    return has(s.stash.items) || (s.run && has(s.run.bag.items));
  };
  // progress as { have, need }
  Q.progress = function (id) {
    const q = Q.def(id), o = q.objective, a = Q.st().active[id];
    if (q.type === "turnin") return { have: Math.min(o.n, G.state.stash.res[o.res] || 0), need: o.n };
    if (q.type === "find") return { have: G.state.stash.items.some((it) => it.base === o.item) ? 1 : 0, need: 1 };
    return { have: Math.min(o.n, a ? a.progress : 0), need: o.n };
  };
  Q.canTurnIn = function (id) {
    if (Q.status(id) !== "active") return false;
    if (G.state.run) return false;
    const p = Q.progress(id); return p.have >= p.need;
  };
  Q.anyTurnIn = (giver) => Q.ofGiver(giver).some((id) => Q.canTurnIn(id));
  Q.rewardText = function (rw) {
    const out = [];
    for (const r in rw.res || {}) out.push(`${rw.res[r]} ${DATA.resources[r].name}`);
    if (rw.item) out.push(`${DATA.items.rarities[rw.item.rarity].name} ${DATA.items.bases[rw.item.base].name} (ilvl ${rw.item.ilvl})`);
    if (rw.lore) out.push("a lore entry");
    return out.join(", ");
  };
  Q.objectiveText = function (id) {
    const q = Q.def(id), o = q.objective, zn = (z) => DATA.zones.list[z].name;
    if (q.type === "turnin") return `Bring ${o.n} ${DATA.resources[o.res].name}`;
    if (q.type === "find") return `Find the ${DATA.items.bases[o.item].name} (${o.object.name}, ${DATA.map.locations[o.loc].name}, ${zn(o.zone)})`;
    const what = o.family ? DATA.enemies.families[o.family].name : o.units.map((u) => DATA.enemies.units[u].name).join(" / ");
    return `Kill ${o.n} ${what} in ${zn(o.zone)}`;
  };
  Q.turnIn = function (id) {
    if (!Q.canTurnIn(id)) return { error: "Not ready to turn in." };
    const q = Q.def(id), o = q.objective, st = Q.st(), s = G.state;
    if (q.type === "turnin") s.stash.res[o.res] -= o.n;
    if (q.type === "find") { const i = s.stash.items.findIndex((it) => it.base === o.item); if (i >= 0) s.stash.items.splice(i, 1); }
    const rw = q.reward, got = [];
    for (const r in rw.res || {}) { s.stash.res[r] = (s.stash.res[r] || 0) + rw.res[r]; }
    if (rw.item) { const it = G.Items.make(rw.item.base, rw.item.rarity, rw.item.ilvl); s.stash.items.push(it); got.push(it); }
    if (rw.lore && !s.lore.includes(rw.lore)) s.lore.push(rw.lore);
    delete st.active[id]; st.done[id] = true;
    const before = Q.repLevel(q.giver);
    st.rep[q.giver] = (st.rep[q.giver] || 0) + D().repPerQuest;
    const after = Q.repLevel(q.giver);
    if (after > before) Q.onRepLevel(q.giver, after);
    G.log(`Quest complete: ${q.name}. Reward: ${Q.rewardText(rw)}.`);
    return { quest: q, items: got, repUp: after > before ? after : 0 };
  };
  Q.repLevel = function (g) { const rep = Q.st().rep[g] || 0, L = D().repLevels; let lvl = 0; for (let i = 0; i < L.length; i++) if (rep >= L[i]) lvl = i + 1; return lvl; };
  Q.perk = (g, lvl) => (D().givers[g].perks || {})[lvl];
  Q.onRepLevel = function (g, lvl) {
    const p = Q.perk(g, lvl); if (!p) return;
    if (p.type === "medicNextPick") Q.st().flags.medicPick = true;
    G.log(`${D().givers[g].name} reputation L${lvl}: ${p.desc}`);
  };
  Q.upgradeCostMult = function (res) {
    let m = 1;
    for (const g in D().givers) for (const lvl in D().givers[g].perks || {}) {
      const p = D().givers[g].perks[lvl];
      if (p.type === "upgradeCostMult" && Q.repLevel(g) >= +lvl && p.res.includes(res)) m *= p.mult;
    }
    return m;
  };
  Q.consumeMedicPick = function () { const st = G.state && G.state.quests; if (!st || !st.flags.medicPick) return false; st.flags.medicPick = false; return true; };
  // kills: [{ eid, family }] made in zone
  Q.onKills = function (zone, kills) {
    for (const id of Q.activeIds()) {
      const q = Q.def(id), o = q.objective; if (q.type !== "kill" || o.zone !== zone) continue;
      const n = kills.filter((k) => (o.family ? k.family === o.family : o.units.includes(k.eid))).length;
      if (n) { const a = Q.st().active[id], was = a.progress; a.progress = Math.min(o.n, a.progress + n); if (a.progress > was) G.log(`Quest ${q.name}: ${a.progress}/${o.n}.`); }
    }
  };
  // find-quest objects at a location (always placed), and whether they currently hold the item
  Q.findObjectsAt = (zone, locId) => Object.keys(D().list).filter((id) => { const q = D().list[id]; return q.type === "find" && q.objective.zone === zone && q.objective.loc === locId; });
  Q.itemAvailable = (id) => Q.status(id) === "active" && !Q.ownsItem(Q.def(id).objective.item);
  Q.questsInZone = (zone) => Q.activeIds().filter((id) => Q.def(id).objective.zone === zone);
})(typeof window !== "undefined" ? window : globalThis);
