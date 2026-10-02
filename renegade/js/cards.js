// Slice 4 §D: cards (G.Cards). Data: data/cards.js. No DOM: the UI sets G.Cards.onPickup(info) for the corner pop.
(function (root) {
  const G = root.G;
  const C = G.Cards = { onPickup: null, onSet: null };   // onSet(list): Slice 5 §J set rewards (the UI toasts them)
  const D = () => DATA.cards;
  C.fresh = () => ({ have: {}, searched: {}, searchedRun: -1, rs: 0, sets: {}, full: null, wild: 0 });   // sets / full / wild: Slice 5 §J
  // cards roll on their OWN stream (state.cards.rs, mulberry32), so a drop never shifts the battle / loot rng
  C.rng = function () {
    const st = C.st(); if (!st.rs) st.rs = (Math.floor(Math.random() * 4294967295) >>> 0) || 1;
    let t = (st.rs = (st.rs + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  C.st = function () { const s = G.state; s.cards = s.cards || C.fresh(); s.cards.have = s.cards.have || {}; s.cards.searched = s.cards.searched || {}; return s.cards; };
  let cache = null, cacheKey = "";
  // every Series 1 card, built from data (so new units / locations / givers add cards)
  C.list = function () {
    const E = DATA.enemies.units, L = DATA.map.locations, Q = DATA.quests.givers, key = Object.keys(E).length + "/" + Object.keys(L).length + "/" + Object.keys(Q).length;
    if (cache && key === cacheKey) return cache;
    const out = [], d = D();
    for (const id in E) {
      const u = E[id], rare = u.rare || d.rareFamilies.includes(u.family);
      out.push({ id: "enemy:" + id, kind: "enemy", ref: id, name: u.name, sprite: u.sprite, group: d.peopleFamilies.includes(u.family) ? "people" : "creatures", rarity: rare ? "rare" : d.uncommonUnits.includes(id) ? "uncommon" : "common", family: u.family });
    }
    out.push({ id: "rival:crew", kind: "rival", ref: "crew", name: d.rival.name, sprite: d.rival.sprite, group: "people", rarity: "rare", family: "rivals" });
    for (const g in Q) out.push({ id: "npc:" + g, kind: "npc", ref: g, name: Q[g].name, sprite: Q[g].portrait, group: "people", rarity: "uncommon", portrait: true });
    if (DATA.tutorial && DATA.tutorial.marta) out.push({ id: "npc:marta", kind: "npc", ref: "marta", name: DATA.tutorial.marta.name, sprite: DATA.tutorial.marta.portrait, group: "people", rarity: "uncommon", portrait: true });
    for (const id in L) { const l = L[id]; if (l.zone && !DATA.zones.list[l.zone]) continue;   // every zone's places (Slice 5 §G: + Greyback)
      out.push({ id: "loc:" + id, kind: "loc", ref: id, name: l.name, sprite: G.Map.icon(l), group: "places", rarity: l.rare || l.secret || d.rareLocations.includes(id) ? "rare" : "common", zone: l.zone || "a" }); }
    for (const c of out) c.blurb = d.blurbs[c.id] || d.blurbDefault[c.group];
    cache = out; cacheKey = key; return out;
  };
  C.def = (id) => C.list().find((c) => c.id === id);
  C.count = () => ({ have: C.list().filter((c) => C.st().have[c.id]).length, total: C.list().length });
  // give a card now (no extraction). Returns { card, isNew, foil, n }
  C.give = function (id, rng, why) {
    const c = C.def(id); if (!c) return null;
    rng = rng || C.rng;
    const st = C.st(), h = st.have[id] || (st.have[id] = { n: 0, foil: 0, first: Date.now() }), isNew = h.n === 0;
    const foil = rng() * 100 < D().foilPct;
    h.n++; if (foil) h.foil++;
    const info = { card: c, isNew, foil, n: h.n, why: why || "" };
    G.log(`Card: ${c.name}${foil ? " (Foil)" : ""}${isNew ? " — new!" : ` ×${h.n}`}`, "good");
    if (isNew) info.sets = C.checkSets();   // Slice 5 §J
    G.State.save();
    if (C.onPickup) try { C.onPickup(info); } catch (e) { /* UI only */ }
    if (info.sets && info.sets.length && C.onSet) try { C.onSet(info.sets); } catch (e) { /* UI only */ }
    return info;
  };
  C.roll = function (id, pct, rng, why) { rng = rng || C.rng; return rng() * 100 < pct ? C.give(id, rng, why) : null; };
  // hooks
  C.onKills = function (dead, rng) {
    const out = [];
    for (const u of dead || []) {
      const id = u.family === "rivals" || u.rival ? "rival:crew" : "enemy:" + u.eid, c = C.def(id); if (!c) continue;
      const got = C.roll(id, c.rarity === "rare" ? D().drops.rare : D().drops.kill, rng, "kill"); if (got) out.push(got);
    }
    return out;
  };
  C.onSearch = function (nid, locId, rng) {
    const st = C.st();
    if (st.searchedRun !== G.state.runCount) { st.searched = {}; st.searchedRun = G.state.runCount; }   // only this run's marks are kept
    if (st.searched[nid]) return null;
    st.searched[nid] = true;
    return C.roll("loc:" + locId, D().drops.search, rng, "search");
  };
  // ---------- Slice 5 §J: set completion ----------
  const SD = () => D().sets;
  C.groupDone = (gid) => { const cs = C.list().filter((c) => c.group === gid), have = C.st().have; return cs.length > 0 && cs.every((c) => have[c.id]); };
  C.setEarned = (gid) => !!(C.st().sets || {})[gid];
  C.fullEarned = () => !!C.st().full;
  C.title = () => (C.fullEarned() ? SD().full.title : null);
  C.wild = () => C.st().wild || 0;
  // grant every reward that's newly earned (once each). Returns [{ kind: "group" | "full", id, name, res }]
  C.checkSets = function () {
    const st = C.st(), out = []; st.sets = st.sets || {};
    for (const [gid, gname] of D().groups) {
      if (st.sets[gid] || !C.groupDone(gid)) continue;
      st.sets[gid] = { at: Date.now() };
      const res = SD().group.res || {}; if (G.state.stash) for (const k in res) G.state.stash.res[k] = (G.state.stash.res[k] || 0) + res[k];
      const txt = SD().text.group.replace(/\{name\}/g, gname).replace("{res}", Object.keys(res).map((k) => `${res[k]} ${(DATA.resources[k] || {}).name || k}`).join(", "));
      G.log(txt, "good"); out.push({ kind: "group", id: gid, name: gname, res, text: txt });
    }
    if (!st.full && D().groups.every(([gid]) => st.sets[gid])) {
      st.full = { at: Date.now() }; st.wild = (st.wild || 0) + (SD().full.wildFoil || 0);
      const txt = SD().text.full.replace("{title}", SD().full.title); G.log(txt, "good"); out.push({ kind: "full", id: "series", name: "Series " + D().series, text: txt });
    }
    return out;
  };
  // the Foil wild card: one more copy of a card you have, as a Foil
  C.useWild = function (id) {
    const st = C.st(), h = st.have[id], c = C.def(id);
    if (!c || !h || !h.n) return { error: "You need a copy of that card first." };
    if (!(st.wild > 0)) return { error: "No Foil wild card left." };
    st.wild--; h.n++; h.foil = (h.foil || 0) + 1;
    const txt = SD().text.wildDone.replace("{name}", c.name); G.log(txt, "good"); G.State.save();
    return { ok: true, text: txt, n: h.n, foil: h.foil };
  };
  C.onQuestDone = function (giver) { if (C.def("npc:" + giver) && !C.st().have["npc:" + giver]) return C.roll("npc:" + giver, D().drops.npcQuest, null, "quest"); return null; };
})(typeof window !== "undefined" ? window : globalThis);
