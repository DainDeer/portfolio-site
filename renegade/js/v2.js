// Maps, Areas & Loot, ruleset 2 (Notion: "RENEGADE — Maps, Areas & Loot design draft", 5 Oct 2026). DOM-free.
// The authority for a V2 expedition: the pinned ruleset, Map instances (classification, modifier roll, finite enemy
// pool, Area instances, extraction opportunities), encounters, the battle reward ledger, Heat's source allowlist and
// extraction. Legacy code (js/expedition.js, js/site.js) calls in here when G.V2.on(); a run without run.ruleset === 2 is
// legacy and never touches this module. Data: data/mapsv2.js. Views: js/areawalk.js, js/traversal.js.
//
// run.v2 = { schema, content, modTable, maps: { nid: Map instance }, enc: { id: encounter }, encN, ops: { opKey: 1 },
//            opOrder: [], heatLedger: [], heatBlocked: { why: n }, heatRefs: { ref: 1 }, loud: { n, paid, credited },
//            safe: [{ zone, nid, area, pos }], events: [] }
// Map instance = { id, loc, zone, kind: "v2" | "legacy", content, classification, mods: [{ id, on }], locked,
//                  pool: { groups: [group], nextR }, area, seenAreas, opps: { id: state }, defeated: [gid], finish }
// group = { id, area, arrival, budgetMult, state: available | reserved | defeated | dismissed, enc, units, waiting, reinforcement }
// encounter = { id, nid, site, groups: [gid], source, outcome: null | victory | retreat | defeat, attempt, rewardSeed }
(function (root) {
  const G = root.G, U = G.Util;
  const V = G.V2 = {};
  const D = () => DATA.mapsV2, CFG = () => DATA.config;
  const run = () => (G.state ? G.state.run : null);
  const X = () => G.Exp;

  // ---------- ruleset ----------
  V.on = (r) => { r = r === undefined ? run() : r; return !!(r && r.ruleset === 2 && r.v2); };
  // X.start: a new expedition picks its ruleset once and keeps it (§13 "Pin the ruleset")
  V.pin = function (r) {
    if (!D() || !D().enabled) return false;
    r.ruleset = D().ruleset;
    r.v2 = { schema: D().schema, content: D().contentVersion, modTable: D().modTableVersion, maps: {}, enc: {}, encN: 0, ops: {}, opOrder: [],
      heatLedger: [], heatBlocked: {}, heatRefs: {}, loud: { n: 0, paid: 0, credited: {} }, safe: [], events: [] };
    return true;
  };
  // development log of domain events (diagnostic only: never analytics, never sent anywhere)
  V.ev = function (type, data) {
    const r = run(); if (!V.on(r)) return;
    r.v2.events.push(Object.assign({ type, run: G.state.runCount, moves: r.moves }, data || {}));
    if (r.v2.events.length > 150) r.v2.events.shift();
  };
  V.persist = function () { return G.State.trySave ? G.State.trySave() : (G.State.save(), true); };

  // ---------- seeds: independent streams from the expedition seed (never the shared G.rng) ----------
  V.hash = function () { let h = 2166136261 >>> 0; const s = Array.prototype.join.call(arguments, "|"); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0 || 1; };
  V.rngFor = function () { return U.makeRng(V.hash.apply(null, arguments)); };
  V.withRng = function (rng, fn) { const saved = G.rng; G.rng = rng; try { return fn(); } finally { G.rng = saved; } };

  // ---------- definitions ----------
  // the V2 definition of a starting slot's template (no instance needed); null = not a V2 Area Map
  V.v2Def = function (nid) {
    const S = D().starting; if (!S.slots.includes(nid) || G.Zones.zoneOf(nid) !== S.zone) return null;
    const r = run(), maps = V.on(r) && r.v2.content < 2 && D().mapsV1 ? D().mapsV1 : D().maps;
    const node = G.Zones.node(nid); return (node && node.loc && maps[node.loc]) || null;
  };
  // in this run: a Map with walkable Areas? (fixed by its instance: one content implementation per Map instance)
  V.areaDef = function (nid) {
    const r = run(); if (!V.on(r) || !nid) return null;
    const m = r.v2.maps[nid]; if (m && m.kind !== "v2") return null;
    return V.v2Def(nid);
  };
  V.isAreaMap = (nid) => !!V.areaDef(nid);
  V.entryArea = (def) => Object.keys(def.areas).find((a) => def.areas[a].entry) || Object.keys(def.areas)[0];
  V.questArea = (def) => Object.keys(def.areas).find((a) => def.areas[a].quest) || V.entryArea(def);
  V.links = (def, aid) => (def.links || []).filter((l) => l.includes(aid)).map((l) => (l[0] === aid ? l[1] : l[0]));
  V.key = (nid, aid) => nid + "@" + aid;
  V.areaOfKey = (k) => (k && k.indexOf("@") > 0 ? k.slice(k.indexOf("@") + 1) : null);
  V.nidOfKey = (k) => (k && k.indexOf("@") > 0 ? k.slice(0, k.indexOf("@")) : k);
  V.curArea = function (nid) { const def = V.areaDef(nid); if (!def) return null; const m = V.inst(nid); return (m && m.area) || V.entryArea(def); };
  // the site key for "here" in Map nid: its current Area (V2) or the Map's own site (legacy)
  V.siteKey = (nid) => (V.isAreaMap(nid) ? V.key(nid, V.curArea(nid)) : nid);

  // ---------- Map instances ----------
  V.inst = function (nid, create) {
    const r = run(); if (!V.on(r) || !nid) return null;
    let m = r.v2.maps[nid]; if (m || create === false) return m || null;
    const node = G.Zones.node(nid), loc = G.Map.loc(node); if (!loc) return null;
    const def = V.v2Def(nid), zone = G.Zones.zoneOf(nid), plan = V.classPlan(zone);
    m = r.v2.maps[nid] = { id: nid, loc: node.loc, zone, kind: def ? "v2" : "legacy", content: r.v2.content,
      classification: plan[nid] || (def ? def.classification : loc.extraction ? "legacy" : "none"),
      mods: V.rollMods(nid), locked: false, pool: null, area: def ? V.entryArea(def) : null, seenAreas: {}, opps: {}, defeated: [], finish: null };
    m.pool = V.makePool(nid, def, node, m);
    if (def) for (const o of def.opportunities || []) m.opps[o.id] = { revealed: !o.hidden, unlocked: !(o.reveal && (o.reveal.groups || []).length), closed: false, attempts: 0, last: null };
    V.ev("map_instance", { nid, kind: m.kind, classification: m.classification, mods: m.mods.map((x) => x.id) });
    return m;
  };
  // m: the Map instance being built (its active modifiers, classification and danger shape the pool: design §1, §4)
  V.makePool = function (nid, def, node, m) {
    const groups = [], C = D().classification, loc = G.Map.loc(node), zone = G.Zones.zoneOf(nid);
    if (def) {
      for (const g of def.groups || []) groups.push({ id: g.id, area: g.area || null, arrival: !!g.arrival, budgetMult: g.budgetMult || 1, family: g.family || null, state: "available" });
      // "whoever's walking around": one unbound group, so an Area with no group of its own is never a guaranteed safe room
      const RM = D().pool.roam; if (RM && !(RM.skip || []).includes(m ? m.classification : def.classification) && !(m && V.attOld(m, "roam"))) groups.push({ id: RM.id || "roam", area: null, arrival: false, budgetMult: 1, family: null, state: "available", roam: true });
    } else {   // the legacy pool adapter (§13): a reviewed, stable, finite set for a Map that has no authored groups
      const P = D().pool, h = X().baseHostiles(node), n = h > 0 ? Math.min(P.legacyMax, Math.ceil(h / P.legacyPerGroupPct)) : 0;
      for (let i = 0; i < n; i++) groups.push({ id: "g" + (i + 1), area: null, arrival: true, budgetMult: 1, family: null, state: "available" });
    }
    if (m) {
      const mods = V.activeMods(nid, m), cls = m.classification;
      const add = (id) => groups.push({ id, area: null, arrival: true, budgetMult: 1, family: null, state: "available" });
      // A smaller pool must still contain every group whose defeat opens an extraction.
      const required = new Set((def && def.opportunities || []).flatMap(o => (o.reveal && o.reveal.groups) || []));
      const drop = () => {
        if (groups.length <= 1) return false;
        let k = -1;
        for (let j = groups.length - 1; j >= 0; j--) if (!required.has(groups[j].id)) {
          if (k < 0) k = j;
          if (!groups[j].arrival) { k = j; break; }
        }
        if (k < 0) return false;
        groups.splice(k, 1); return true;
      };
      let extra = 0; for (const x of mods) extra += x.groups || 0;
      extra += Math.floor(V.dangerOf(m) / (D().danger.groupPerPips || 99));
      if (cls === "occupied") extra += (C.pool.occupied || {}).plus || 0;
      for (let i = 0; i < extra; i++) add("x" + (i + 1));
      // Non-Peaceful Maps also keep their guaranteed unbound group when optional groups are removed.
      for (const g of groups) if (g.roam) required.add(g.id);
      for (let i = extra; i < 0; i++) drop();
      if (mods.some((x) => x.patrol)) add("patrol");   // unbound: answers noise anywhere on the Map
      if (cls === "peaceful") while (groups.length > ((C.pool.peaceful || {}).max || 99) && drop()) {}
      const all = mods.find((x) => x.allFamily); if (all && !X().familyBarred(all.allFamily, zone)) for (const g of groups) g.family = all.allFamily;
      if (mods.some((x) => x.secondFamily) && groups.length && loc) { const other = loc.family === "beasts" ? "outlaws" : "beasts"; if (!X().familyBarred(other, zone)) (groups.find((q) => !q.arrival) || groups[groups.length - 1]).family = other; }
    }
    return { groups, nextR: 1 };
  };
  // the pool is rebuilt from the enabled set when the crossing locks it, as long as nothing in it has been touched
  V.rebuildPool = function (m) {
    if (!m || m.pool.groups.some((g) => g.state !== "available" || g.enc || g.waiting || g.units || g.reinforcement) || m.defeated.length) return;
    m.pool = V.makePool(m.id, V.v2Def(m.id), G.Zones.node(m.id), m);
  };
  V.group = (m, gid) => (m ? m.pool.groups.find((g) => g.id === gid) : null);

  // ---------- classification (design §4): every Map gets one; Peaceful is the extraction-density dial ----------
  // One seeded plan per zone per expedition: V2 definitions keep theirs, a Map with its own extraction is "legacy", every
  // other Map rolls Peaceful / Occupied / none (a legacy Map has no opportunities, so its Contested share is "none").
  // Then: Occupied never in the first row or next to another Occupied; and every Map has a way out (a Peaceful Map or a
  // legacy extraction) within exitWithin steps, else the nearest eligible Map is promoted to Peaceful (deterministic).
  V.classPlan = function (zone) {
    const r = run(); if (!V.on(r)) return {};
    r.v2.classes = r.v2.classes || {};
    if (r.v2.classes[zone]) return r.v2.classes[zone];
    const C = D().classification, map = G.Zones.map(zone), plan = {};
    if (!map) return {};
    const ids = Object.keys(map.nodes).filter((id) => G.Map.loc(map.nodes[id])).sort();
    const fixed = (id) => !!V.v2Def(id) || plan[id] === "legacy";
    for (const id of ids) {
      const node = map.nodes[id], loc = G.Map.loc(node), def = V.v2Def(id);
      if (def) plan[id] = def.classification;
      else if (loc.extraction) plan[id] = "legacy";
      else { const k = V.rngFor(r.seed, zone, id, "class").weighted(Object.keys(C.shares), (x) => C.shares[x]); plan[id] = k === "contested" ? "none" : k; }
    }
    for (const id of ids) if (plan[id] === "occupied" && !V.v2Def(id) && ((map.nodes[id].row || 0) < C.occupiedMinRow || G.Map.neighbors(map, id).some((n) => plan[n] === "occupied"))) plan[id] = "none";
    // Like X.canMoveTo: the insertion point cannot be entered again or used as a shortcut.
    const dists = (from) => { const d = { [from]: 0 }, q = [from]; while (q.length) { const x = q.shift(); for (const y of G.Map.neighbors(map, x)) if (y !== map.insertion && d[y] == null) { d[y] = d[x] + 1; q.push(y); } } return d; };
    const exit = (id) => plan[id] === "peaceful" || plan[id] === "legacy";
    const need = ids.filter((id) => !map.nodes[id].secret);
    for (let guard = 0; guard <= ids.length; guard++) {
      let bad = null, bd = null;
      for (const id of need) { const d = dists(id); if (!ids.some((e) => exit(e) && d[e] != null && d[e] <= C.exitWithin)) { bad = id; bd = d; break; } }
      if (!bad) break;
      const cand = ids.filter((id) => !fixed(id) && plan[id] !== "peaceful" && bd[id] != null && bd[id] <= C.exitWithin)
        .sort((a, b) => (bd[a] - bd[b]) || ((map.nodes[a].row || 0) - (map.nodes[b].row || 0)) || (a < b ? -1 : 1));
      if (!cand.length) break;
      plan[cand[0]] = "peaceful";
    }
    r.v2.classes[zone] = plan;
    return plan;
  };
  // danger pips (design §1): active hazards + the classification baseline, clamped. Always shown, never explained.
  V.dangerOf = function (m) {
    if (!m) return 0; const C = D().classification.danger || {}, DG = D().danger;
    const n = V.activeMods(m.id, m).reduce((a, x) => a + (x.danger || 0), 0) + (C[m.classification] || 0);
    return U.clamp(n, 0, DG.max);
  };
  V.danger = (nid) => V.dangerOf(V.inst(nid));
  V.lootRarityBonus = (nid) => V.danger(nid) * (D().danger.rarityPerPip || 0);
  // resource weight multipliers in force on a Map (resMult of its active modifiers, multiplied)
  V.resMult = function (nid) { const out = {}; for (const x of V.activeMods(nid)) for (const k in x.resMult || {}) out[k] = (out[k] || 1) * x.resMult[k]; return out; };
  V.available = (m) => (m ? m.pool.groups.filter((g) => g.state === "available" && !g.reinforcement) : []);

  // ---------- modifiers (SP-039, draft §5) ----------
  const MODS = () => D().modifiers;
  V.modDef = (id) => MODS().list[id];
  // a hazard (danger > 0) can be turned off before the crossing; anything else is just how the place is
  V.canDisable = (id) => ((V.modDef(id) || {}).danger || 0) > 0;
  // seeded by expedition + Map + table version: the same roll every time it's loaded, never rerolled (design §1):
  // 2-4 modifiers, exactly one HEADLINE (always shown), the rest hidden; two of one category never roll together
  V.rollMods = function (nid) {
    const M = MODS(), L = M.list, ids = Object.keys(L), rng = V.rngFor(run().seed, nid, "mods", D().modTableVersion);
    const n = 2 + rng.weighted([0, 1, 2], (i) => M.countWeights[i] || 0);
    const out = [];
    const okWith = (id) => !out.some((o) => o.id === id || L[o.id].cat === L[id].cat || (L[o.id].excludes || []).includes(id) || (L[id].excludes || []).includes(o.id));
    const heads = ids.filter((id) => L[id].headline);
    out.push({ id: rng.weighted(heads, (id) => L[id].headlineWeight || 1), on: true, headline: true });
    for (let i = 1; i < n; i++) {
      const pool = ids.filter(okWith); if (!pool.length) break;
      const cats = Object.keys(M.catWeights).filter((c) => pool.some((id) => L[id].cat === c));
      const cat = rng.weighted(cats, (c) => M.catWeights[c]);
      out.push({ id: rng.weighted(pool.filter((id) => L[id].cat === cat), (id) => L[id].weight || 1), on: true });
    }
    return out;
  };
  V.mods = (nid, m) => { m = m || V.inst(nid); return m ? m.mods : []; };
  // the modifiers in force on Map nid (rolled, enabled; before the crossing they're a preview). m: an instance being built
  V.activeMods = (nid, m) => V.mods(nid, m).filter((x) => x.on && V.modDef(x.id)).map((x) => Object.assign({ id: x.id }, V.modDef(x.id)));   // (an id a newer table dropped is inert)
  // what the player can see of a Map's roll: the headline, anything experienced, and anything a skill reveals (design §1)
  V.modVisible = function (x) {
    if (x.headline || x.seen) return true;
    const d = V.modDef(x.id); if (!d || !d.reveal) return true;
    return run() ? X().bestSkill(d.reveal.skill) >= d.reveal.level : false;
  };
  V.visibleMods = (nid) => V.mods(nid).filter(V.modVisible);
  // a hidden modifier flips to shown once its effect has been felt: when = its seenOn (area | fight | object | trap | force | search)
  V.markSeen = function (nid, when) {
    const m = nid && V.inst(nid, false); if (!m) return;
    for (const x of m.mods) { const d = V.modDef(x.id); if (x.on && !x.seen && d && d.seenOn === when) { x.seen = true; V.ev("mod_seen", { nid, mod: x.id, when }); } }
  };
  V.seenMod = function (nid, id) { const m = nid && V.inst(nid, false), x = m && m.mods.find((q) => q.id === id); if (x && !x.seen) { x.seen = true; V.ev("mod_seen", { nid, mod: id, when: "object" }); } };
  V.modActive = (nid, id) => V.activeMods(nid).some((x) => x.id === id);
  V.modNum = (nid, field, base) => V.activeMods(nid).reduce((v, x) => (x[field] != null ? v * x[field] : v), base == null ? 1 : base);
  V.modSum = (nid, field) => V.activeMods(nid).reduce((v, x) => v + (x[field] || 0), 0);
  // before the crossing only: disable / re-enable a modifier with a downside (its reward goes with it)
  V.setMod = function (nid, id, on) {
    const m = V.inst(nid); if (!m) return "No Map.";
    if (m.locked) return "Locked: you've crossed into this Map.";
    const x = m.mods.find((q) => q.id === id); if (!x) return "No such modifier here.";
    if (!V.canDisable(id)) return `${V.modDef(id).name} can't be turned off.`;
    if (!V.modVisible(x)) return "You don't know about that yet.";
    x.on = !!on; V.ev("mod_toggle", { nid, mod: id, on: x.on }); G.State.save(); return null;
  };
  // the crossing commits the enabled set before anything on the Map resolves (draft §5 step 4)
  V.lockMods = function (nid) { const m = V.inst(nid); if (m && !m.locked) { V.rebuildPool(m); m.locked = true; V.ev("mods_locked", { nid, on: m.mods.filter((x) => x.on).map((x) => x.id) }); } return m; };

  // the modifier objects (a closet, a cache, a vending machine...) of Map nid that belong in site `site`; once per run
  V.addModObjects = function (site, nid) {
    const r = run(); if (!V.on(r)) return;
    const m = V.inst(nid); if (!m || !m.locked) return;
    const def = V.areaDef(nid), rc = G.state.runCount, mods = V.activeMods(nid);
    // where a guarded / deep object goes: an Area that holds a group (seeded pick), else the Area farthest from the way in
    const areaFor = (x) => {
      const ids = Object.keys(def.areas), rng = V.rngFor(r.seed, nid, "modarea", x.id);
      if (x.object.guard || x.object.deep) {
        const held = (def.groups || []).filter((g) => g.area && !g.arrival).map((g) => g.area);
        if (held.length) return rng.pick(held);
        const entry = V.entryArea(def), d = { [entry]: 0 }, q = [entry]; while (q.length) { const a = q.shift(); for (const b of V.links(def, a)) if (d[b] == null) { d[b] = d[a] + 1; q.push(b); } }
        return ids.slice().sort((a, b) => (d[b] || 0) - (d[a] || 0))[0];
      }
      return rng.pick(ids);
    };
    for (const x of mods) {
      if (!x.object) continue;
      if (def && site.area !== areaFor(x)) continue;
      // Saves can contain an object placed by an older table. Its identity, contents and Area win over a new roll.
      const existingSites = def ? V.areaSites(nid).concat(site) : [site];
      if (existingSites.some(s => s.objects.some(o => o.mod === x.id && o.modRun === rc))) continue;
      const O = x.object, f = Object.assign({ kind: O.kind || "search", mod: x.id, modRun: rc, perRun: true }, O);
      delete f.object; delete f.deep;
      const o = X()._mk(site, f);
      if (o.kind === "search" && !o.type) o.type = "crate";
      if (O.unlocked) o.locked = false;
      X()._place(site, o, G.rng.int(0, site.rooms.length - 1), G.rng);
    }
    // Picked over: whoever got here first may have left a pack (the way in only, once per run)
    const po = mods.find((x) => x.rivalPack);
    if (po && (!def || site.area === V.entryArea(def)) && site.rivalPackRun !== rc) {
      site.rivalPackRun = rc;
      if (V.rngFor(r.seed, nid, "rivalpack").chance(po.rivalPack) && DATA.searchables.types.rival_pack) { const T = DATA.searchables.types.rival_pack, o = X()._mk(site, { type: "rival_pack", name: T.name, sprite: T.sprite, mod: po.id, modRun: rc, perRun: true }); X()._place(site, o, G.rng.int(0, site.rooms.length - 1), G.rng); }
    }
    // Locked down: every door shut, half the containers locked (once per site per run; nothing already opened changes)
    const ld = mods.find((x) => x.lockdown);
    if (ld && site.lockdownRun !== rc) {
      site.lockdownRun = rc; const rng = V.rngFor(r.seed, nid, site.area || "site", "lockdown");
      for (const o of site.objects) {
        if (o.kind !== "search" || o.searched || o.sealed) continue;
        if (o.type === "door") { if (ld.lockdown.doors && !site.rooms[o.opens].open && !o.broken) o.locked = true; }
        else if ((X().typeDef(o).lock || {}).check && rng.chance(ld.lockdown.containersPct || 0)) o.locked = true;
      }
    }
  };

  // ---------- Area sites ----------
  const sites = () => G.state.world.sites;
  V.areaSites = (nid) => Object.keys(sites()).filter((k) => V.nidOfKey(k) === nid && k !== nid).map((k) => sites()[k]);
  // the site of Area aid of Map nid, built or restocked for this run
  V.ensureArea = function (nid, aid) {
    const def = V.areaDef(nid), node = G.Zones.node(nid), k = V.key(nid, aid), S = sites(), rc = G.state.runCount;
    let site = S[k];
    if (!site) { site = S[k] = X().generateSite(node, { id: aid, def: def.areas[aid], map: def }); site.enteredRun = rc; site.entry = { run: rc, level: 1, mult: 1, fresh: true }; }
    else if (site.enteredRun !== rc) X().restockOnEntry(site, node);
    V.addAreaAccess(site, nid, aid);
    V.addModObjects(site, nid);
    return site;
  };
  // the ways out of an Area: back to traversal (the entry Area), the exits to linked Areas, the Map's opportunities here
  V.addAreaAccess = function (site, nid, aid) {
    const def = V.areaDef(nid) || V.v2Def(nid), A = def.areas[aid], R = site.rooms[0], VW = DATA.searchables.view, wall = VW.wall;
    if (A.entry && !site.objects.some((o) => o.kind === "exit")) {
      const st = X().exitStyle(G.Map.loc(G.Zones.node(nid)), site.loc);
      X()._mk(site, { kind: "exit", style: st.style, name: D().text.backToTraversal, sprite: st.sprite, room: 0, x: Math.round(R.x + R.w / 2), y: Math.round(R.y + R.h + wall / 2) });
    }
    if (site.art) {
      for (const to of V.links(def, aid)) if (!site.objects.some(o => o.kind === "areaExit" && o.to === to))
        X()._mk(site, {kind:"areaExit",to,name:`To the ${def.areas[to].name}`,sprite:D().exitStyles.gate.sprite,
          room:0,x:500,y:575,stand:{x:500,y:540},side:"bottom"});
      return;
    }
    const outer = (x, y) => !site.rooms.some((Q) => Q !== R && x >= Q.x - wall && x <= Q.x + Q.w + wall && y >= Q.y - wall && y <= Q.y + Q.h + wall);
    const slots = [
      { x: R.x + R.w * 0.2, y: R.y + R.h + wall / 2, side: "bottom" }, { x: R.x + R.w * 0.8, y: R.y + R.h + wall / 2, side: "bottom" },
      { x: R.x - wall / 2, y: R.y + R.h / 2, side: "left", vertical: true }, { x: R.x + R.w / 2, y: R.y - wall / 2, side: "top" },
      { x: R.x + R.w + wall / 2, y: R.y + R.h / 2, side: "right", vertical: true }, { x: R.x + R.w / 2, y: R.y + R.h + wall / 2, side: "bottom", centre: true }
    ].filter((p) => !(p.centre && A.entry) && outer(p.x + (p.side === "left" ? -30 : p.side === "right" ? 30 : 0), p.y + (p.side === "top" ? -30 : p.side === "bottom" ? 30 : 0)));
    const used = (p) => site.objects.some((o) => (o.kind === "areaExit" || o.kind === "exit") && Math.abs(o.x - p.x) < 40 && Math.abs(o.y - p.y) < 40);
    for (const to of V.links(def, aid)) {
      if (site.objects.some((o) => o.kind === "areaExit" && o.to === to)) continue;
      const p = slots.find((q) => !used(q)) || { x: R.x + R.w * 0.5, y: R.y + R.h * 0.5 };
      const T = def.areas[to], st = D().exitStyles[T.exitStyle] || D().exitStyles.door;
      X()._mk(site, { kind: "areaExit", to, name: `To the ${T.name}`, sprite: st.sprite, room: 0, x: Math.round(p.x), y: Math.round(p.y), vertical: !!p.vertical, side: p.side || "floor",
        examine: `[PLACEHOLDER] The way through to the ${T.name}.` });
    }
    for (const od of def.opportunities || []) {
      if (od.area !== aid || site.objects.some((o) => o.opp === od.id)) continue;
      const o = X()._mk(site, { kind: "extract", opp: od.id, nid, loc: site.loc, name: od.name, sprite: od.sprite, wide: od.wide || 1, examine: od.examine });
      X()._place(site, o, 0, G.rng);
    }
  };
  // the arrival anchor in Area aid: by the exit you came through (from Area `via`), else by the way in
  V.anchor = function (site, via) {
    const o = site.objects.find((q) => (via ? q.kind === "areaExit" && q.to === via : q.kind === "exit")) || site.objects.find((q) => q.kind === "areaExit") || null;
    if (o) return G.AreaPath.anchorFor(site, o);
    const R = site.rooms[0]; return { x: R.x + R.w / 2, y: R.y + R.h - 40 };
  };
  V.exploring = () => { const r = run(); return !!r && !r.queue.length && !r.dead; };
  // Enter an Area: from traversal (Enter / Continue) or through a linked Area's exit (`via` = the Area you left).
  // An Area transition is not a Map crossing: no moves, Heat, XP, encounter roll, modifier change or enterNode (§3).
  V.enterArea = function (nid, aid, via) {
    const r = run(), def = V.areaDef(nid); if (!def || !def.areas[aid]) return "No such Area.";
    if (!V.exploring()) return "Finish what's in front of you first.";
    if (r.loc !== nid) return "You're not on that Map.";
    const m = V.inst(nid), from = m.area;
    if (via && (via !== from || !V.links(def, from).includes(aid))) return "You can't get there from here.";
    if (via && X().immobile()) return X().overloadText();
    V.clearWaits(nid);
    m.area = aid; m.seenAreas[aid] = true;
    const site = V.ensureArea(nid, aid);
    if (via || !site.pos || site.posRun !== G.state.runCount) { site.pos = V.anchor(site, via); site.posRun = G.state.runCount; }
    site.visitSearches = 0; site.visits = (site.visits || 0) + 1; site.seen = true;
    r.view = "site";
    V.markSafe(nid, aid, site.pos);
    V.ev("area_enter", { nid, area: aid, via: via || null });
    V.markSeen(nid, "area");
    const dmg = V.modSum(nid, "areaEntryDmgPct");   // Chemical leak: every room you enter here costs a little health (once per Area per run)
    if (dmg > 0 && site.leakRun !== G.state.runCount) { site.leakRun = G.state.runCount; X().log("The air burns your throat.", "bad"); X().damageBody(dmg); if (!run()) return null; }
    if (!V.attOwed(nid, V.key(nid, aid)) && !V.reengage(nid, aid)) V.entryRoll(m, aid, site);
    G.State.save();
    return null;
  };
  // Entering an Area whose own group is still there is the second encounter moment (the first is the Map crossing):
  // once per Area per expedition, roll alert.entryPct x the Map's arrivalMult. A miss leaves the group for later noise.
  // Arrival groups are the crossing's business, and a group bound elsewhere can't be met here.
  V.entryRoll = function (m, aid, site) {
    const A = D().alert, r = run(); if (!A.entryPct || !m || !site) return null;
    if (site.entryRun === G.state.runCount) return null;
    if (V.attOld(m, "entryRoll")) return null;   // SP-133: Attention replaces this roll on a non-Peaceful Map (data/attention.js disableOld)
    const g = V.available(m).find((x) => x.area === aid && !x.arrival && !x.waiting); if (!g) return null;
    site.entryRun = G.state.runCount;
    const tm = X().tutorialOn() && CFG().tutorial.disturbanceMult != null ? CFG().tutorial.disturbanceMult : 1;
    const pct = U.clamp(A.entryPct * V.modNum(m.id, "arrivalMult", 1) * tm, 0, 100), dr = G.rng() * 100, hit = dr < pct;
    X().log(`${V.areaDef(m.id).areas[aid].name || aid}: entry check ${Math.round(pct * 10) / 10}% → rolled ${Math.floor(dr)}: ${hit ? "they're in here!" : "quiet."}`, "roll");
    V.ev("area_entry", { nid: m.id, area: aid, pct, roll: Math.floor(dr), hit, group: hit ? g.id : null });
    return hit ? V.pushFight(m, g, V.key(m.id, aid), "entry", "They're in here!") : null;
  };
  V.markSafe = function (nid, aid, pos) {
    const r = run(); if (!V.on(r)) return;
    const top = r.v2.safe[r.v2.safe.length - 1];
    if (top && top.nid === nid && top.area === (aid || null)) { top.pos = pos ? { x: pos.x, y: pos.y } : null; return; }
    r.v2.safe.push({ zone: r.zone, nid, area: aid || null, pos: pos ? { x: pos.x, y: pos.y } : null });
    if (r.v2.safe.length > 24) r.v2.safe.shift();
  };
  // the squad's position in the current Area (kept across battles, saves and renderer rebuilds)
  V.setPos = function (site, p) { if (!site || !p) return; site.pos = { x: Math.round(p.x), y: Math.round(p.y) }; site.posRun = G.state.runCount; const m = run() && V.inst(site.nid, false); if (m && site.area === m.area) V.markSafe(site.nid, site.area, site.pos); };

  // ---------- arrival: one encounter check per Map crossing (SP-036) ----------
  // Called by X.arrive in a V2 run. Lands on traversal with the "Enter or continue" choice (draft §4) unless a fight
  // meets you: then the fight's Area is where you come back to.
  V.arrive = function (node, revisit) {
    const r = run(), loc = G.Map.loc(node), nid = node.id, m = V.lockMods(nid), def = V.areaDef(nid);
    let siteKey = nid; V.clearWaits(nid);
    if (def) { m.area = V.entryArea(def); const site = V.ensureArea(nid, m.area); site.pos = V.anchor(site, null); site.posRun = G.state.runCount; siteKey = V.key(nid, m.area); }
    else { const site = X().ensureSite(node); V.addModObjects(site, nid); }
    { const st = X().site(siteKey); if (st) { st.visitSearches = 0; st.visits = (st.visits || 0) + 1; const ex = X().exitObj(st); if (ex) st.squadAt = ex.id; } }
    r.view = "map";
    if (!revisit && loc.entryHeat) X().addHeat(loc.entryHeat, "secret");   // the Crater: not an approved source, so nothing (logged)
    // a fight you broke away from on the way in is still waiting at the door
    if (V.reengage(nid, def ? m.area : null, true)) { X().pushSpots(node, loc, X().site(siteKey)); return; }
    if (V.attOwed(nid, siteKey)) { X().pushSpots(node, loc, X().site(siteKey)); return; }   // SP-133: you fled a patrol here: coming back means that fight
    if (!revisit && G.Rivals && G.Rivals.onArrive(node)) { X().pushSpots(node, loc, X().site(siteKey)); return; }   // a separate, explicit source
    const base = X().baseHostiles(node), mult = (revisit ? CFG().revisit.hostileMult : 1) * V.modNum(nid, "arrivalMult", 1);
    const pct = U.clamp(base * mult, 0, 100), dr = G.rng() * 100, hit = dr < pct;
    const g = hit ? V.pick(m, { arrival: true }) : null;
    X().log(`${loc.name}: crossing check ${Math.round(pct * 10) / 10}% → rolled ${Math.floor(dr)}: ${hit ? (g ? "something's waiting!" : "quiet (nothing left to meet you).") : "quiet."}`, "roll");
    V.ev("crossing", { nid, pct, roll: Math.floor(dr), hit, group: g ? g.id : null });
    if (g) V.pushFight(m, g, siteKey, "arrival", revisit ? "They were waiting for you." : "Hostiles!");
    else V.markSafe(nid, null, null);   // a quiet crossing: this Map (on traversal) is somewhere a retreat can fall back to
    X().pushSpots(node, loc, X().site(siteKey));
    // next-playtest (Hazel / Megan): after travel, enter the first Area automatically — same side effects as the Enter
    // click (entry roll, markSeen, …). Skip when a fight or spot check is already queued.
    if (run() && !run().queue.length && (def || X().site(nid))) X().enterSite();
  };

  // ---------- the finite enemy pool (SP-033, draft §9) ----------
  // the next eligible available group: one bound to this Area first, then a Map-wide one (arrival: arrival groups only)
  V.pick = function (m, opts) {
    const av = V.available(m).filter((g) => !g.waiting || opts.waiting);
    if (opts.arrival) return av.find((g) => g.arrival) || null;
    return av.find((g) => opts.area && g.area === opts.area) || av.find((g) => !g.area) || null;
  };
  V.reserve = function (m, g, source, siteKey) {
    const r = run(), id = "e" + G.state.runCount + "." + (++r.v2.encN);   // unique across expeditions (sites outlive runs)
    r.v2.enc[id] = { id, nid: m.id, site: siteKey, groups: [g.id], source, outcome: null, attempt: 0, rewardSeed: V.hash(r.seed, m.id, g.id, "reward") };
    g.state = "reserved"; g.enc = id; delete g.waiting;
    V.ev("reserve", { enc: id, nid: m.id, group: g.id, source });
    return r.v2.enc[id];
  };
  V.pushFight = function (m, g, siteKey, source, why, front) {
    const enc = V.reserve(m, g, source, siteKey), loc = DATA.map.locations[m.loc];
    V.markSeen(m.id, "fight");
    const step = Object.assign({}, g.step || {}, { type: "battle", family: g.family || loc.family, nid: m.id, site: siteKey, enc: enc.id, why });
    if (source === "attention") step.attention = true;   // SP-133: a max-Attention pull (its own Flee rules)
    X().push(step, front);
    return step;
  };
  // an explicit, uniquely identified addition to the Map's pool (an event's fight, an extraction defense): never a
  // silent refill of a defeated group
  V.reinforce = function (m, cause, siteKey) {
    const r = run(), g = { id: "r" + (m.pool.nextR++), area: V.areaOfKey(siteKey), arrival: false, budgetMult: 1, family: null, state: "available", reinforcement: cause };
    m.pool.groups.push(g);
    V.ev("reinforcement", { nid: m.id, group: g.id, cause });
    return V.reserve(m, g, "reinforcement:" + cause, siteKey || m.id);
  };
  // an encounter for a battle step that has none yet (hunters, rivals, events, extraction fights): built once
  V.encFor = function (step) {
    const r = run(); if (!V.on(r)) return null;
    if (step.enc && r.v2.enc[step.enc]) return r.v2.enc[step.enc];
    const nid = step.nid || r.loc, m = V.inst(nid), siteKey = step.site || V.siteKey(nid);
    let enc;
    if (m) enc = V.reinforce(m, step.extraction ? "extraction" : step.after || step.eventFight ? "event" : step.family === "hunters" ? "hunters" : step.rival ? "rival" : "external", siteKey);
    else { const id = "e" + G.state.runCount + "." + (++r.v2.encN); enc = r.v2.enc[id] = { id, nid, site: siteKey, groups: [], source: step.family === "hunters" ? "hunters" : step.rival ? "rival" : "external", outcome: null, attempt: 0, rewardSeed: V.hash(r.seed, nid, id, "reward") }; }
    step.enc = enc.id; step.site = step.site || siteKey;
    return enc;
  };
  V.encOf = (step) => { const r = run(); return V.on(r) && step && step.enc ? r.v2.enc[step.enc] || null : null; };
  // a pool group's fight, built once and kept: the same composition on every re-engagement (draft §12)
  V.enemiesFor = function (step, elites) {
    const r = run(), enc = V.encOf(step), m = enc && V.inst(enc.nid, false), g = m && enc.groups.length && V.group(m, enc.groups[0]);
    if (!g || g.reinforcement) return null;
    if (!g.units) {
      const heard = V.attOld(m, "defeatedBudget") ? 1 : 1 + ((D().pool.defeatedBudgetPct || 0) / 100) * m.defeated.length;   // the rest heard the first (SP-133: Attention's escalation replaces it where it runs)
      const mult = (g.area ? D().pool.areaBudgetMult : D().pool.budgetMult) * (g.budgetMult || 1) * V.modNum(enc.nid, "budgetMult", 1) * heard, budget = X().enemyBudget(G.Zones.node(enc.nid), mult);
      g.units = G.Battle.buildEnemyGroup(V.rngFor(r.seed, enc.nid, g.id, "units"), step.family, budget, (elites || 0) + V.modSum(enc.nid, "elites"), G.Zones.zoneOf(enc.nid)); g.family = step.family;
    }
    const hp = V.modNum(enc.nid, "enemyHpMult", 1), st = V.attState(enc.nid);
    // SP-133: a patrol's notoriety extras (g.extra) and the Map's pending escalation (+units), copies of the group's own units
    enc.esc = st && st.esc > 0 && step.family !== "hunters" && step.family !== "rivals" ? st.esc : 0;
    const units = g.units.slice(); for (let i = 0; i < (g.extra || 0) + enc.esc; i++) units.push({ id: g.units[i % g.units.length].id, elite: false });
    return units.map((u) => Object.assign({}, u, hp !== 1 ? { hpMult: (u.hpMult || 1) * hp } : {}));
  };
  // Capture the complete scripted force, including future waves, before battle mutates any units.
  V.battleSetup = function (step, setup) {
    const enc = V.encOf(step), m = enc && V.inst(enc.nid, false), g = m && V.group(m, enc.groups[0]);
    if (!g || !g.reinforcement) return;
    const copy = x => JSON.parse(JSON.stringify(x));
    if (g.setup) Object.assign(setup, copy(g.setup));
    else {
      g.setup = {};
      for (const k of ["enemies", "enemyUnits", "waves", "mode", "surviveSec", "ambush", "freeze"]) if (setup[k] !== undefined) g.setup[k] = copy(setup[k]);
      g.step = copy(step); delete g.step.enc; g.family = step.family;
    }
  };
  V.onBuild = function (step) {
    const enc = V.encFor(step); if (!enc) return;
    enc.attempt = ((run() && run().retries) || 0) + 1;
    if (enc.groups.length) { const m = V.inst(enc.nid, false), g = V.group(m, enc.groups[0]); if (g && g.state === "available") { g.state = "reserved"; g.enc = enc.id; } }
  };
  // a fight that was broken away from waits at its source at full strength; walking back in meets it again
  // (a legacy Map has no Areas: any fight waiting there meets you on the way in, or when you go back inside)
  V.reengage = function (nid, aid, arrival) {
    const m = V.inst(nid, false); if (!m) return false;
    const legacy = m.kind !== "v2", match = (w) => (arrival ? w.arrival || legacy : !w.arrival && (w.area || null) === (aid || null));
    const g = m.pool.groups.find((x) => x.state === "available" && x.waiting && match(x.waiting));
    if (!g) return false;
    const siteKey = aid ? V.key(nid, aid) : nid;
    X().log(`${DATA.map.locations[m.loc].name}: the fight you broke away from is still here.`, "bad");
    V.pushFight(m, g, siteKey, g.waiting.source || "reengage", "They're still here.");
    return true;
  };
  // ordinary alerts (draft §9 allowlist). Returns the battle step, or null (no eligible group: nothing comes).
  V.alert = function (siteKey, source, why) {
    const nid = V.nidOfKey(siteKey), m = V.inst(nid); if (!m) return null;
    const g = V.pick(m, { area: V.areaOfKey(siteKey) }) || (V.attOnM(m) ? V.attGroup(m, V.areaOfKey(siteKey)) : null);   // SP-133: a non-Peaceful Map never runs out
    if (!g) { V.ev("alert_empty", { nid, site: siteKey, source }); return null; }
    return V.pushFight(m, g, siteKey, source, why);
  };
  V.eligibleCount = (siteKey) => { const m = V.inst(V.nidOfKey(siteKey), false), a = V.areaOfKey(siteKey); return V.available(m).filter((g) => !g.waiting && (!g.area || g.area === a)).length; };   // a waiting group only meets you where it waits
  // free looting (SP-033): few groups left on the whole Map, or none that could reach this spot
  V.freeLoot = (siteKey) => V.available(V.inst(V.nidOfKey(siteKey), false)).length <= D().pool.freeLootAtOrBelow || V.eligibleCount(siteKey) === 0;
  // the alert chance of an ordinary search (SP-025 "barely ever"); a body that was never a fight: only its authored trap
  // Alert % = object noise x noiseMult (+ forcedNoise when forcing) + perSearchPct x searches already made in this Area
  // this visit - stealthPer10 x floor(best Stealth / 10), x the Map's alertMult, x unboundMult when only an unbound group
  // could answer. A natural body only gives you away through its trap; a cleared Map (free looting) never does.
  V.alertInfo = function (site, o, action) {
    const A = D().alert, T = X().typeDef(o), key = site.key || site.nid;
    const forced = action === "force" || action === "kick";
    const natural = /^body_/.test(o.type || "") && !o.fresh;
    const noise = (o.noise != null ? o.noise : T.noise || 0), prior = (site.visitSearches || 0) * (A.perSearchPct || 0);
    const stealth = Math.floor(X().bestSkill("stealth") / 10) * A.stealthPer10;
    const tm = X().tutorialOn() && CFG().tutorial.disturbanceMult != null ? CFG().tutorial.disturbanceMult : 1;
    const am = V.modNum(site.nid, "alertMult", 1);   // patrols / sleepers / the dark
    const a = V.areaOfKey(key), m = V.inst(site.nid, false);
    const nobodyPosted = !!a && !!m && !V.available(m).some((g) => !g.waiting && g.area === a), unbound = nobodyPosted && A.unboundMult != null ? A.unboundMult : 1;
    let pct = natural && !forced ? 0 : Math.max(0, noise * A.noiseMult + (forced ? A.forcedNoise || 0 : 0) + prior - stealth) * tm * am * unbound;
    if (V.attOld(m || V.inst(site.nid), "searchAlert")) {   // SP-133: Attention replaces the alert roll (and its per-search ramp) on a non-Peaceful Map
      const att = V.attValue(o, action);
      return { pct: 0, free: false, natural, forced, unbound: false, att, math: `${AT().text.label} +${att}` };
    }
    const free = V.freeLoot(key);
    if (free) pct = 0;
    const math = free ? "nobody left nearby to hear you" : natural && !forced ? "a body: only a trap could give you away"
      : `noise ${noise}${A.noiseMult !== 1 ? " × " + A.noiseMult : ""}${forced ? " + forced " + (A.forcedNoise || 0) : ""} + searches ${prior} − Stealth ${stealth}${tm !== 1 ? " × tutorial " + tm : ""}${am !== 1 ? " × " + am : ""}${unbound !== 1 ? " × " + unbound + " (nobody posted here)" : ""} = ${Math.round(pct * 100) / 100}%`;
    return { pct, free, natural, forced, unbound: nobodyPosted, math };
  };
  // Sweep the area: go looking for whoever's here, on your terms. The fight comes from the same pool as every other
  // encounter (an Area's own group first, then an unbound one); a fight you broke away from here is met again instead.
  V.canSweep = function () {
    const r = run(); if (!V.on(r) || r.view !== "site" || !V.exploring()) return false;
    const site = X().site(); if (!site) return false;
    const m = V.inst(site.nid, false); if (!m) return false;
    if (m.pool.groups.some((g) => g.state === "available" && g.waiting)) return true;
    return V.eligibleCount(site.key || site.nid) > 0;
  };
  V.sweep = function () {
    const r = run(); if (!V.on(r)) return { error: "No expedition." };
    if (!V.exploring()) return { error: "Finish what's in front of you first." };
    const site = r.view === "site" ? X().site() : null; if (!site) return { error: "Go inside first." };
    const key = site.key || site.nid, m = V.inst(site.nid);
    if (V.reengage(site.nid, site.area || null)) { G.State.save(); return { ok: true, text: "They're still here." }; }
    const g = V.pick(m, { area: site.area || null }); if (!g) return { error: D().text.sweepNone };
    V.pushFight(m, g, key, "sweep", "You go looking for trouble, and find it.");
    G.State.save();
    return { ok: true };
  };
  // a loud moment with a chance (a failed extraction check, a tripped alarm): roll it against the pool
  V.loudAlert = function (siteKey, pct, source, why) {
    const roll = G.rng() * 100, hit = roll < pct;
    const step = hit ? V.alert(siteKey, source, why) : null;
    V.ev("loud", { site: siteKey, source, pct, roll: Math.floor(roll), hit, fight: !!step });
    return { pct, roll, hit, step };
  };

  // ---------- battle outcomes (one result owner: X.finishBattle / X.afterEscape call these once) ----------
  V.commitWin = function (step) {
    const enc = V.encOf(step); if (!enc || enc.outcome) return enc;
    enc.outcome = "victory";
    const m = V.inst(enc.nid, false);
    for (const gid of enc.groups) { const g = V.group(m, gid); if (g) { g.state = "defeated"; if (!m.defeated.includes(gid)) m.defeated.push(gid); } }
    if (m) { V.updateOpps(m); V.attWin(m, enc); }
    V.ev("victory", { enc: enc.id, nid: enc.nid, groups: enc.groups });
    return enc;
  };
  // Retreat (draft §12, CONFIRMED 5 Oct): the encounter's whole enemy force is restored, the squad keeps its damage, no
  // enemy loot / rewards / clear progress. The group waits at its source for re-engagement (same units, same reward seed).
  V.commitRetreat = function (step) {
    const enc = V.encOf(step); if (!enc || enc.outcome) return enc;
    enc.outcome = "retreat";
    const m = V.inst(enc.nid, false);
    for (const gid of enc.groups) {
      const g = V.group(m, gid); if (!g) continue;
      g.enc = null;
      g.state = "available"; g.waiting = { area: V.areaOfKey(enc.site), arrival: enc.source === "arrival" || !V.areaOfKey(enc.site), source: enc.source };
    }
    V.ev("retreat", { enc: enc.id, nid: enc.nid, groups: enc.groups });
    return enc;
  };
  // a retreat empties the queue: any other fight that was waiting in it never happened (its group goes back, unharmed)
  V.releaseQueued = function (steps) {
    for (const s of steps) {
      const enc = s && s.type === "battle" ? V.encOf(s) : null; if (!enc || enc.outcome) continue;
      enc.outcome = "dropped";
      const m = V.inst(enc.nid, false);
      for (const gid of enc.groups) { const g = V.group(m, gid); if (!g) continue; g.enc = null; g.state = g.reinforcement ? "dismissed" : "available"; }
      V.ev("dropped", { enc: enc.id });
    }
  };
  V.commitLoss = function (step) { const enc = V.encOf(step); if (enc && !enc.outcome) { enc.outcome = "defeat"; V.ev("defeat", { enc: enc.id }); } return enc; };
  // where a retreat goes: the last safe Map / Area anchor that isn't where the fight was; else the zone's insertion point
  V.retreatTarget = function (step) {
    const r = run(), nid = step.nid || r.loc, area = V.areaOfKey(step.site), enc = V.encOf(step), pl = r.prevLoc;
    // met on the way in: back the way you came (the Map you crossed from, on traversal), never further back than that
    if (enc && enc.source === "arrival" && pl && pl.nid !== nid && G.state.maps[pl.zone] && G.state.maps[pl.zone].nodes[pl.nid]) return { zone: pl.zone, nid: pl.nid, area: null };
    for (let i = r.v2.safe.length - 1; i >= 0; i--) {
      const s = r.v2.safe[i];
      if (s.nid === nid && (!area || !s.area || s.area === area)) continue;
      if (!G.state.maps[s.zone] || !G.state.maps[s.zone].nodes[s.nid]) continue;
      if (s.area && (V.inst(s.nid, false)?.pool.groups || []).some((g) => g.state === "available" && g.waiting && !g.waiting.arrival && g.waiting.area === s.area)) continue;   // never back into a fight that's waiting
      return s;
    }
    return { zone: r.zone, nid: G.Zones.map(r.zone).insertion, area: null, insertion: true };
  };
  V.goTo = function (t) {
    const r = run(); r.zone = t.zone || r.zone; r.loc = t.nid;
    if (t.area && V.isAreaMap(t.nid)) { const m = V.inst(t.nid); m.area = t.area; const site = V.ensureArea(t.nid, t.area); if (t.pos) { site.pos = { x: t.pos.x, y: t.pos.y }; site.posRun = G.state.runCount; } r.view = "site"; }
    else r.view = "map";   // a Map you only crossed (or the insertion point): back on traversal there
  };
  // the fight's Area becomes "here" again after a win: you come back to the place you fought (draft §7)
  V.returnTo = function (step) {
    const r = run(), k = step.site; if (!k) return;
    const nid = V.nidOfKey(k), aid = V.areaOfKey(k);
    if (r.loc !== nid) return;
    if (aid && V.isAreaMap(nid)) { const m = V.inst(nid); m.area = aid; m.seenAreas[aid] = true; const st = X().site(k); if (st && !st.pos) { st.pos = V.anchor(st, null); st.posRun = G.state.runCount; } V.markSafe(nid, aid, st && st.pos); }
    else V.markSafe(nid, null, null);
    r.view = "site";
  };

  // ---------- battle loot: rolled once at the committed victory, kept on the bodies (draft §8) ----------
  // Every object this commit created (ids >= firstId) gets its loot as entries: enemy bodies (rolled from the
  // encounter's reward seed), a fallen teammate's body (its gear + bag share), a rival's pack.
  V.lootBodies = function (step, site, firstId) {
    const enc = V.encOf(step), node = G.Zones.node(enc.nid), out = [], m = V.inst(enc.nid, false), mods = V.activeMods(enc.nid);
    const rng = U.makeRng(enc.rewardSeed);
    const leader = mods.find((x) => x.leaderDrop), victory = enc.outcome === "victory" && enc.groups.length;
    V.withRng(rng, () => {
      for (const o of site.objects) {
        if (+String(o.id).slice(1) < firstId || (o.combat && o.combat.enc)) continue;
        if (!o.fresh && !o.rival) continue;
        const kind = o.gruntBody ? "teammate" : o.rivalBody || o.rival ? "rival" : o.hunter ? "hunter" : "enemy";
        if (!o.loot) {   // (a teammate's body already holds its own gear and bag share: X.addGruntBodies)
          if (kind === "enemy" && leader && victory && m && !m.leaderDone) { m.leaderDone = true; o.weaponRarity = leader.leaderDrop; o.name = "Body: " + (leader.leaderName || "the leader"); }   // Named leader: a Tuned+ weapon on one body
          const l = o.fixedLoot ? { items: o.fixedLoot.items.slice(), res: Object.assign({}, o.fixedLoot.res) } : X().rollObjectLoot(node, o.type, o);
          o.loot = V.toEntries(enc.id + ":" + o.id, l);
        }
        o.combat = { enc: enc.id, kind }; o.searched = true; o.left = null;
        out.push(o);
      }
      // Deserter: after the first win on the Map, one of theirs is left alive among the bodies, asking to come along
      if (victory && m && !m.deserterDone && mods.some((x) => x.deserter) && out.some((o) => o.combat.kind === "enemy")) {
        m.deserterDone = true; const S = DATA.searchables.survivorObject;
        const o = X()._mk(site, { kind: "survivor", name: "Deserter", sprite: S.sprite, examine: "[PLACEHOLDER] Hands up, weapon down. They'd rather come with you than stay with what's left here.", mod: "deserter", modRun: G.state.runCount, perRun: true });
        X()._place(site, o, 0, rng);
      }
    });
    V.ev("rewards", { enc: enc.id, bodies: out.map((o) => o.id), entries: out.reduce((a, o) => a + o.loot.length, 0) });
    return out;
  };
  V.toEntries = function (prefix, l) {
    const out = [];
    (l.items || []).forEach((it, i) => out.push({ id: prefix + ":i" + i, item: it }));
    for (const k in l.res || {}) if (l.res[k] > 0) out.push({ id: prefix + ":r:" + k, res: k, n: l.res[k] });
    return out;
  };
  V.left = (o) => (o && o.loot ? o.loot.filter((e) => (e.item ? 1 : e.n) > 0) : []);
  V.hasLoot = (o) => V.left(o).length > 0;
  V.entryKg = (e) => (e.item ? G.Items.weight(e.item) : e.n * DATA.items.resources[e.res].kgPerUnit);
  V.sources = (site, enc) => site.objects.filter((o) => o.combat && o.combat.enc === enc);
  // can kg more be carried? limit: "fit" (Take all: <= fitPct) or "take" (a single Take: short of the immobile line)
  V.room = function (limit) {
    const cap = X().capacity(), kg = X().carried();
    return limit === "fit" ? cap * D().loot.fitPct / 100 - kg : cap * CFG().carry.immobileAtPct / 100 - kg - 1e-6;
  };
  const opSeen = function (r, opKey) {
    if (!opKey) return false;
    if (r.v2.ops[opKey]) return true;
    r.v2.ops[opKey] = 1; r.v2.opOrder.push(opKey);
    if (r.v2.opOrder.length > 400) delete r.v2.ops[r.v2.opOrder.shift()];
    return false;
  };
  // move one entry (or n units of a resource entry) from its source into the bag, all at once, at most once per opKey
  V.take = function (siteKey, objId, entryId, opts) {
    opts = opts || {}; if (!V.on()) return { error: "No expedition." };
    const r = run(); if (opts.opKey && r.v2.ops[opts.opKey]) return { dup: true };   // the same request again: already done
    const site = X().site(siteKey), o = site && X().obj(objId, site); if (!o || !o.loot) return { error: "Nothing there." };
    const e = o.loot.find((x) => x.id === entryId); if (!e || !(e.item || e.n > 0)) return { error: D().text.alreadyEmpty };
    const lim = opts.limit || "take", room = V.room(lim);
    if (e.item) {
      const kg = G.Items.weight(e.item);
      if (!G.Items.isQuest(e.item) && kg > room + 1e-9) return { error: `No room: you need ${U.fmt1(kg - room)} kg more.`, needKg: kg - room };
      opSeen(r, opts.opKey); r.bag.items.push(e.item); e.item = null; e.taken = true;
    } else {
      const per = DATA.items.resources[e.res].kgPerUnit, want = Math.min(e.n, opts.n || e.n), n = Math.min(want, Math.floor((room + 1e-9) / per));
      if (n <= 0) return { error: `No room: you need ${U.fmt1(per - room)} kg more.`, needKg: per - room };
      opSeen(r, opts.opKey); r.bag.res[e.res] = (r.bag.res[e.res] || 0) + n; e.n -= n;
    }
    V.ev("take", { site: siteKey, obj: objId, entry: entryId });
    if (!opts.noSave) G.State.save();
    return { ok: true };
  };
  // Take all that fits: complete legal quantities only, at most fitPct of capacity; reports what stays
  V.takeAll = function (siteKey, objIds, opKey) {
    const r = run(); if (!V.on(r)) return { taken: 0, left: 0, needKg: 0 }; if (opKey && r.v2.ops[opKey]) return { dup: true }; opSeen(r, opKey);
    const site = X().site(siteKey), got = [], left = []; let need = 0;
    for (const id of objIds) {
      const o = X().obj(id, site); if (!o) continue;
      for (const e of V.left(o)) {
        const res = V.take(siteKey, id, e.id, { limit: "fit", noSave: true });
        if (res.ok) { got.push(e.id); if (!e.item && e.n > 0) left.push(e.id); }
        else { left.push(e.id); need = Math.max(need, res.needKg || 0); }
      }
    }
    G.State.save();
    return { taken: got.length, left: left.length, needKg: need };
  };

  // the loot panel for one source (a fight's body opens every body of that fight here that still holds something)
  V.openLoot = function (site, o) {
    const key = site.key || site.nid, objs = o.combat && o.combat.enc ? V.sources(site, o.combat.enc).filter(V.hasLoot).map((x) => x.id) : [o.id];
    X().push({ type: "loot", site: key, objs, title: objs.length > 1 ? "Bodies" : o.name });
    return {};
  };
  // a modifier's object: the vending machine (a snack or a med item), the printer (a decree), the shrine (a small gift)
  V.useModObject = function (site, o) {
    const r = run(), key = site.key || site.nid, rng = V.rngFor(r.seed, key, o.id, "use");
    o.done = true;
    if (o.use === "print") { X().log(`${o.name}: ${U.copy(o.text)}`); X().push({ type: "message", title: o.name, text: U.copy(o.text) }); G.State.save(); return {}; }
    const l = { items: [], res: {} };
    if (o.use === "vend") { if (rng.chance(60)) l.res.food = rng.int(1, 2); else l.res.med = 1; }
    else { const k = rng.pick(["scrap", "cloth", "food", "water", "chemicals"]); l.res[k] = rng.int(1, 2); }
    o.loot = V.toEntries(key + ":" + o.id, l);
    X().push({ type: "loot", site: key, objs: [o.id], title: o.name });
    G.State.save(); return {};
  };

  // ---------- Heat (SP-034, draft §10): an explicit event ledger ----------
  V.heatAllowed = (why) => !!D().heat.sources[why];
  // X.addHeat asks first: true = add it. A blocked source is recorded (development) and adds nothing.
  V.heatGate = function (n, why) {
    const r = run(); if (!V.on(r)) return true;
    if (!V.heatAllowed(why)) { r.v2.heatBlocked[why || "other"] = (r.v2.heatBlocked[why || "other"] || 0) + n; return false; }
    r.v2.heatLedger.push({ why, n, moves: r.moves });
    return true;
  };
  // an approved Heat event, at most once per ref (an orbital chest, a destroyed relay, the nth loud fight)
  V.heat = function (n, source, ref) {
    const r = run(); if (!V.on(r) || !n) return 0;
    if (ref) { if (r.v2.heatRefs[ref]) return 0; r.v2.heatRefs[ref] = 1; }
    return X().addHeat(n, source);
  };
  // "lots of loud fights" (OPEN, data heat.loud): a committed fight with enough gunfire counts once per encounter
  V.noteFight = function (step, b) {
    const r = run(), L = D().heat.loud, enc = V.encOf(step); if (!enc || !L) return;
    if (enc.source === "attention" && AT() && !AT().heat.attentionFightsLoud && step.family !== "hunters") { V.ev("loud_skipped", { enc: enc.id, why: "attention" }); return; }   // SP-133: local Attention fights add no Heat
    if ((b.gunShots || 0) < L.minGunShots || r.v2.loud.credited[enc.id] != null) return;
    const w = V.modNum(enc.nid, "loudMult", 1);
    r.v2.loud.credited[enc.id] = w; r.v2.loud.n += w;
    V.ev("loud_fight", { enc: enc.id, shots: b.gunShots, weight: w });
    while (L.every > 0 && r.v2.loud.n + 1e-9 >= (r.v2.loud.paid + 1) * L.every) { r.v2.loud.paid++; V.heat(L.amount, "loud_fights", "loud:" + r.v2.loud.paid); }
  };
  // a tripped alarm (a noise trap, a wire on a body, a terminal's drone alarm): approved Heat, once per object
  V.alarmHeat = (site, o) => V.heat(D().heat.alarm || 0, "alarm", "alarm:" + (site.key || site.nid) + ":" + o.id);
  V.heatShown = () => { const r = run(); return !V.on(r) || r.heat >= D().heat.revealAt; };
  // an event option's own Heat (option-level `heat`, or a heat effect) only counts when its source is approved
  V.optionHeat = function (opt) {
    let n = 0;
    if (opt.heat && V.heatAllowed(opt.heatSource)) n += opt.heat;
    for (const e of opt.effects || []) if (e.heat > 0 && V.heatAllowed(e.source)) n += e.heat;
    return n;
  };

  // ---------- extraction authority (draft §11) ----------
  V.oppDef = (nid, id) => { const def = V.areaDef(nid); return def ? (def.opportunities || []).find((o) => o.id === id) : null; };
  V.updateOpps = function (m) {
    const def = V.v2Def(m.id); if (!def) return;
    for (const od of def.opportunities || []) {
      const os = m.opps[od.id], need = (od.reveal && od.reveal.groups) || [];
      if (!os || os.unlocked) continue;
      if (need.every((g) => m.defeated.includes(g))) { const was = os.revealed; os.revealed = true; os.unlocked = true; V.ev("opportunity_unlocked", { nid: m.id, opp: od.id, revealed: !was });
        X().log(!was && od.revealText ? od.revealText : `${od.name}: open now.`, "good"); }
    }
  };
  // what the panel, the HUD and the object all say about getting out of Map nid
  V.extractInfo = function (nid) {
    const r = run(), m = V.inst(nid), node = G.Zones.node(nid), loc = G.Map.loc(node), here = r && r.loc === nid;
    const N = D().extraction.names, B = D().extraction.blurb;
    if (!m) return { category: "none", text: "—" };
    if (m.finish) return { category: m.classification, name: N[m.classification] || "", canNow: here && V.exploring(), finish: true, text: "Your way out is held: finish the extraction." };
    if (m.kind === "legacy" && loc.extraction) {
      const ex = X().extractionDef(node), open = X().extractionOpen(node);
      return { category: "legacy", name: N.legacy, canNow: here && open && V.exploring(), legacy: ex, open, text: open ? `${B.legacy} ${X().extractShort(ex)}` : X().wrecked(node) ? "Wrecked. Find another way out." : "Closed." };
    }
    if (m.classification === "peaceful") return { category: "peaceful", name: N.peaceful, canNow: here && V.exploring(), text: here && !V.exploring() ? "Finish what's in front of you first." : B.peaceful };
    if (m.classification === "occupied") {
      const it = V.escapeItem(nid);
      return { category: "occupied", name: N.occupied, canNow: !!it && here && V.exploring(), item: it, text: it ? `${G.Items.name(it)} could get you out of here.` : B.occupied };
    }
    if (m.kind === "legacy" || !V.areaDef(nid)) return { category: "none", name: "", canNow: false, text: "No extraction on this Map." };
    const opps = (V.areaDef(nid).opportunities || []).map((od) => {
      const os = m.opps[od.id], ck = od.check ? `${DATA.skills[od.check.skill].name} DC ${od.check.dc}` : "no check";
      const state = os.closed ? "closed" : !os.revealed ? "hidden" : !os.unlocked ? "locked" : "ready";
      const text = state === "closed" ? `${od.name}: wrecked.` : state === "hidden" ? "A way out is somewhere here: clear enemies to find it." : state === "locked" ? `${od.name}: ${od.reveal.text}, then ${ck}.` : `${od.name} (${V.areaDef(nid).areas[od.area].name}): ${ck}.`;
      return { id: od.id, name: od.name, area: od.area, state, text };
    });
    return { category: "contested", name: N.contested, canNow: false, opps, text: opps.map((o) => o.text).join(" ") || B.contested };
  };
  const extractGate = () => { if (!V.exploring()) return "Finish what's in front of you first."; if (!V.persist()) return "The game couldn't save, so you stay put (your extraction isn't lost: try again)."; return null; };
  // Peaceful: one Map-level Extract, from any Area or the traversal panel, in the exploration state
  V.extractHere = function () {
    const r = run(); if (!V.on(r)) return { error: "No expedition." };
    const nid = r.loc, info = V.extractInfo(nid);
    if (info.finish) return V.finishExtraction();
    if (info.category !== "peaceful") return { error: info.text };
    const why = extractGate(); if (why) return { error: why };
    V.ev("extract", { nid, how: "peaceful" });
    X().extractSuccess();
    return { ok: true, text: "You slip out and head home." };
  };
  // Contested: use the opportunity object (Area-local). One check per explicit attempt; the result is saved first.
  V.attemptOpp = function (nid, oppId) {
    const r = run(), m = V.inst(nid), od = V.oppDef(nid, oppId), os = m && m.opps[oppId];
    if (!V.on(r) || !od || !os) return { error: "No way out here." };
    if (r.loc !== nid || m.classification !== "contested" || m.area !== od.area || r.view !== "site") return { error: "Go to that extraction opportunity first." };
    if (!os.revealed) return { error: "You don't know of a way out here." };
    if (os.closed) return { error: `${od.name} is wrecked.` };
    if (!os.unlocked) return { error: `${od.name}: ${od.reveal.text}.` };
    if (os.wait) return { error: `${od.name} won't go again yet: step away from it and come back.` };
    const why = extractGate(); if (why) return { error: why };
    os.attempts++;
    if (!od.check) { V.ev("extract", { nid, how: "opportunity", opp: oppId }); X().extractSuccess(); return { ok: true, text: od.okText || "You're out." }; }
    const info = G.Checks.compute(od.check.skill, od.check.dc, X().members(), X().gearItems()), roll = G.Checks.roll(info, null, "extract");
    os.last = { grade: roll.grade, attempt: os.attempts }; X().log(roll.text, "check");
    if (G.Checks.isSuccess(roll.grade)) { V.ev("extract", { nid, how: "opportunity", opp: oppId }); X().extractSuccess(); return { ok: true, roll, text: roll.text + " — " + (od.okText || "you're out!") }; }
    if (roll.grade === "badFail" && od.badFail === "crash") { os.closed = true; G.State.save(); return { ok: false, roll, crash: true, text: `${roll.text} — ${od.name} is wrecked for this expedition.` }; }
    const A = D().alert, loud = V.loudAlert(V.key(nid, od.area), roll.grade === "badFail" ? A.extractBadFailPct : A.extractFailPct, "extract_fail", "The noise draws attention!");
    os.wait = true;   // draft §11: a retry needs a state change, never free rapid clicks
    G.State.save();
    return { ok: false, roll, alert: loud, text: `${roll.text} — it won't go.` + (loud.step ? " The noise draws attention!" : "") + " Step away and come back to try again." };
  };
  // stepping away (another Area, traversal, a new crossing) lets a failed extraction be tried again
  V.clearWaits = function (nid) {
    const r = run(), m = V.on(r) ? V.inst(nid, false) : null; if (!m) return;
    for (const id in m.opps) delete m.opps[id].wait;
    if (r.v2.extractWait) delete r.v2.extractWait[nid];
  };
  // Occupied: the item-gated special escape (OPEN content: no production item yet; the contract is here and tested)
  V.escapeItem = function (nid) {
    const r = run(), def = V.areaDef(nid); if (!r || !def || !def.escape) return null;
    return r.bag.items.find((it) => (G.Items.base(it.base) || {}).escapeTag === def.escape.tag) || null;
  };
  V.useEscape = function (nid) {
    const r = run();
    if (!V.on(r) || r.loc !== nid || V.inst(nid).classification !== "occupied") return { error: "No escape here." };
    const it = V.escapeItem(nid); if (!it) return { error: D().extraction.blurb.occupied };
    const why = extractGate(); if (why) return { error: why };
    r.bag.items.splice(r.bag.items.indexOf(it), 1);   // consumed in the same transaction as the extraction, never on opening a menu
    V.ev("extract", { nid, how: "escape_item", item: it.base });
    X().extractSuccess();
    return { ok: true, text: `You use the ${G.Items.name(it)}.` };
  };
  // a won extraction fight (defense, stall, chase): the satisfied fact is kept; "Finish extraction" ends the run
  V.holdExtraction = function (step) { const m = V.inst(step.nid || run().loc); if (m) { m.finish = { enc: step.enc || null }; V.ev("extraction_held", { nid: m.id }); } };
  V.finishExtraction = function () {
    const r = run(), m = V.on(r) ? V.inst(r.loc, false) : null; if (!m || !m.finish) return { error: "Nothing to finish here." };
    const st = X().current(); if (st && st.type === "spoils") X().next();
    if (!V.exploring()) return { error: "Finish what's in front of you first." };
    if (!V.persist()) return { error: "The game couldn't save, so you stay put (try again)." };
    V.ev("extract", { nid: m.id, how: "finish" });
    X().extractSuccess();
    return { ok: true, text: "You're out." };
  };

  // ---------- knowledge (draft §4 "Proposed knowledge rule"): Known / Rumored / Last seen / Unknown ----------
  V.intel = function (nid) {
    const r = run(), node = G.Zones.node(nid), loc = G.Map.loc(node), m = V.inst(nid);
    if (!loc || !m) return null;
    const def = V.areaDef(nid), fam = DATA.enemies.families[loc.family], scoutHid = G.Scout && G.Scout.hidden(nid);
    const known = !scoutHid && (X().visible(nid) || r.visited[nid]);
    const loot = [];
    const modObjs = (def ? V.areaSites(nid) : [X().site(nid)].filter(Boolean)).flatMap((s) => s.objects.filter((o) => o.mod && o.modRun === G.state.runCount));
    for (const x of m.mods) {   // a visible modifier's find is Known until it's used up
      const d = V.modDef(x.id); if (!x.on || !d || !d.object || d.cat !== "loot" || !V.modVisible(x)) continue;
      const o = modObjs.find((q) => q.mod === x.id); if (o && (o.done || (o.searched && !V.hasLoot(o)))) continue;
      loot.push({ kind: "known", text: `${d.name}: ${d.reward}` });
    }
    const gl = loc.guaranteedLoot; if (gl && !(gl.once !== false && G.state.locFlags[node.loc + "_gl"])) loot.push({ kind: "rumored", text: `${(DATA.items.bases[gl.base] || {}).name || gl.base} (${gl.object.name})` });
    for (const q of G.Quests.findObjectsAt(G.Zones.zoneOf(nid), node.loc)) if (G.Quests.itemAvailable(q)) loot.push({ kind: "known", text: `Quest: ${G.Quests.def(q).name}` });
    const all = (def ? V.areaSites(nid) : [X().site(nid)].filter(Boolean)).filter((s) => s.seen);   // only places you've actually been in
    const bodies = all.reduce((a, s) => a + s.objects.filter((o) => o.combat && V.hasLoot(o)).length, 0);
    if (bodies) loot.push({ kind: "known", text: `Loot left on ${bodies} bod${bodies === 1 ? "y" : "ies"}` });
    const unsearched = all.reduce((a, s) => a + s.objects.filter((o) => o.kind === "search" && !o.searched && !o.blocked && !o.fresh).length, 0);
    if (all.length && unsearched) loot.push({ kind: "last seen", text: `${unsearched} unsearched container${unsearched === 1 ? "" : "s"}` });
    const beaten = m.defeated.length, hp = r.hunt && r.hunt.pack && r.hunt.pack.nid === nid;
    return {
      nid, name: loc.name, zone: DATA.zones.list[m.zone].name, visited: !!r.visited[nid], here: r.loc === nid, kind: m.kind,
      classification: m.classification, className: (D().extraction.names[m.classification] || ""), blurb: D().extraction.blurb[m.classification] || "",
      mods: m.mods.filter((x) => V.modDef(x.id) && V.modVisible(x)).map((x) => { const d = V.modDef(x.id), C = MODS().categories[d.cat] || {}; return { id: x.id, name: d.name, cat: d.cat, catName: C.name || d.cat, color: C.color || "#e8e8e8", headline: !!x.headline, seen: !!x.seen, danger: d.danger || 0, effect: d.effect, reward: d.reward, on: x.on, canDisable: V.canDisable(x.id) && !m.locked, locked: m.locked }; }),
      hiddenMods: m.mods.filter((x) => V.modDef(x.id) && !V.modVisible(x)).length,
      danger: V.dangerOf(m),
      enemies: { known, text: known ? fam.name : D().text.unknown, beaten, hunters: !!hp },
      loot,
      extraction: V.extractInfo(nid),
      areas: def ? Object.keys(def.areas).map((a) => ({ id: a, name: def.areas[a].name, seen: !!m.seenAreas[a], current: r.loc === nid && m.area === a, entry: !!def.areas[a].entry })) : null
    };
  };

  // ---------- Enemy Attention (SP-133, DEC-92): a per-Map local alertedness bar. Never Heat. Data: data/attention.js ----------
  // run.v2.att = { maps: { nid: { bar, fills, noto, esc, owed } }, nextA }, added lazily (an older save's run starts every Map
  // at 0). bar: 0..barMax. fills: how many Attention fights the bar pulled on this Map this expedition (a count, never
  // shown). noto: the Map's notoriety level, +1 every fightsPerNotoriety fills (Megan, Oct 7: 1 level per 3 Attention
  // fights); per Map, never goes down unless something modifies it, reset by a new expedition. esc: the escalation (+units)
  // the next battle on this Map shows. owed: { area } after a successful flee from a pull (entering again = that fight).
  const AT = () => DATA.attention;
  // Peaceful (explicit flag in data, else the Map's classification): no bar running, finite pool, can be cleared
  V.attPeacefulM = function (m) {
    const P = (AT() && AT().peaceful) || {}, by = P.maps || {};
    if (!m) return false;
    if (m.kind === "v2" && by[m.loc] != null) return !!by[m.loc];   // an authored V2 Map's own flag
    return (P.classifications || []).includes(m.classification);
  };
  V.attOnM = (m) => !!(m && AT() && AT().enabled && !(X().tutorialOn() && !AT().tutorial) && !(AT().peacefulClearable && V.attPeacefulM(m)));   // Megan (Oct 7): Peaceful Maps keep producing enemies too, unless peacefulClearable
  V.attTutMult = () => (X().tutorialOn() && AT().tutorialMult != null ? AT().tutorialMult : 1);
  V.attOn = (nid) => { const r = run(); return !!(V.on(r) && nid && G.Map.loc(G.Zones.node(nid)) && V.attOnM(V.inst(nid))); };
  V.peaceful = (nid) => V.attPeacefulM(V.inst(nid));
  // an old V2 roll switched off because Attention runs on this Map (data disableOld; reversible)
  V.attOld = (m, which) => !!(V.attOnM(m) && (AT().disableOld || {})[which]);
  V.attState = function (nid) { const r = run(); return (V.on(r) && r.v2.att && r.v2.att.maps[nid]) || null; };
  V.att = function (nid) {
    const r = run(); if (!V.on(r)) return null;
    const A = r.v2.att || (r.v2.att = { maps: {}, nextA: 0 });
    const st = A.maps[nid] || (A.maps[nid] = { bar: 0, fills: 0, noto: 0, esc: 0, owed: null });
    if (st.noto == null) st.noto = Math.floor((st.fills || 0) / V.attFightsPerNoto());   // an older save (fills was the level): additive
    return st;
  };
  V.attFightsPerNoto = () => Math.max(1, AT().fightsPerNotoriety || 1);
  V.attNoto = (st) => (!st ? 0 : st.noto != null ? st.noto : Math.floor((st.fills || 0) / V.attFightsPerNoto()));
  // what one interaction is worth (data: actions + object noise, or an absolute per type). A fight's body: 0, always.
  V.attValue = function (o, action) {
    const C = AT(); if (!o || o.combat) return 0;
    const T = X().typeDef(o), noise = o.noise != null ? o.noise : T.noise || 0, base = C.actions[action] != null ? C.actions[action] : C.actions.search;
    const v = (action || "search") === "search" && C.types[o.type] != null ? C.types[o.type] : base + noise * C.noiseMult;
    return Math.max(0, Math.round(v * V.attTutMult()));
  };
  // Stealth check on a container loot (data/attention.js stealth): the multiplier a roll gives the base value
  V.attStealthMult = function (d, total, dc) {
    const S = AT().stealth, die = DATA.config.checks.die || 20;
    if (d === 1) return { mult: S.nat1, band: "nat1" };
    if (d === die) return { mult: S.nat20, band: "nat20" };
    if (total < dc) return { mult: S.fail, band: "fail" };
    const by = total - dc, p = (S.pass || []).find((x) => by >= x.by);
    return { mult: p ? p.mult : S.fail, band: "pass", by };
  };
  V.attStealthOn = (o, action) => !!(AT().stealth && AT().stealth.enabled && o && !o.combat && o.type !== "door" && action !== "train");
  // roll it for the acting body (no helpers): { roll, mult, band, value } (value = round(base x mult))
  V.attStealth = function (base, rng) {
    const S = AT().stealth, b = X().body(), ci = G.Checks.compute(S.skill, S.dc, b ? [{ kind: "body", body: b }] : [], X().gearItems());
    const roll = G.Checks.roll(ci, rng, "stealth"), sm = V.attStealthMult(roll.d, roll.total, ci.dc);
    return { roll, dc: ci.dc, mult: sm.mult, band: sm.band, by: sm.by, base, value: Math.max(0, Math.round(base * sm.mult)) };
  };
  // raise Map nid's bar; at max: notoriety +1 and the pull (straight to battle prep). Returns the battle step or null.
  V.attAdd = function (siteKey, n, source) {
    const nid = V.nidOfKey(siteKey), m = V.inst(nid); if (!V.attOnM(m) || !(n > 0)) return null;
    const st = V.att(nid), max = AT().barMax;
    if (st.bar >= max) return null;   // a pull is already out (fought, waiting or owed): the bar resets after that fight
    st.bar = Math.min(max, st.bar + n);
    X().log(`${AT().text.label} +${n} (${source}) → ${st.bar}/${max}`, "roll");
    V.ev("attention", { nid, n, source, bar: st.bar });
    if (st.bar < max) return null;
    st.fills++;
    if (st.fills % V.attFightsPerNoto() === 0) st.noto++;   // 1 notoriety level per fightsPerNotoriety Attention fights
    V.ev("attention_full", { nid, fills: st.fills, noto: st.noto });
    return V.attPull(m, siteKey, AT().text.pullWhy);
  };
  // a fresh group: the "effectively infinite" enemies of a non-Peaceful Map
  V.attGroup = function (m, area) {
    const A = run().v2.att || (run().v2.att = { maps: {}, nextA: 0 });
    const g = { id: "a" + (++A.nextA), area: area || null, arrival: false, budgetMult: AT().patrol.budgetMult || 1, family: null, state: "available", attention: true };
    m.pool.groups.push(g); V.ev("attention_group", { nid: m.id, group: g.id });
    return g;
  };
  // the patrol a full bar sends: the Area's own group if it's still there, else a fresh one; sized by notoriety
  V.attPull = function (m, siteKey, why) {
    const st = V.att(m.id), a = V.areaOfKey(siteKey), L = AT().patrol.extraUnitsByNotoriety || [0];
    const g = V.available(m).find((x) => !x.waiting && !x.arrival && a && x.area === a) || V.attGroup(m, a);
    g.extra = L[Math.min(V.attNoto(st), L.length - 1)] || 0;
    return V.pushFight(m, g, siteKey, "attention", why);
  };
  // you fled a pull here: entering this Map again (an Area, the site, or the crossing) starts that fight
  V.attOwed = function (nid, siteKey) {
    const st = V.attState(nid); if (!st || !st.owed) return null;
    const m = V.inst(nid); st.owed = null;
    if (!V.attOnM(m)) return null;
    X().log(AT().text.owedWhy, "bad");
    return V.attPull(m, siteKey, AT().text.owedWhy);
  };
  // a committed win: an Attention fight resets the bar and arms the next battle's escalation; a battle that showed the
  // escalation used it up
  V.attWin = function (m, enc) {
    const st = V.attState(m.id); if (!st) return;
    if (enc.esc) st.esc = 0;
    if (enc.source === "attention") { st.bar = 0; st.owed = null; st.esc = AT().escalation.units || 0; V.ev("attention_reset", { nid: m.id, esc: st.esc }); }
  };
  // Flee from a max-Attention pull (only that pull). Standard: free. Hardcore / Ragnarök: the Athletics check.
  V.attFleeInfo = function (step) {
    if (!step || !step.attention || !V.on()) return null;
    const F = AT().flee, free = (F.free || []).includes(G.Difficulty ? G.Difficulty.id() : "hardcore");
    return { free, check: free ? null : G.Checks.compute(F.check.skill, F.check.dc, X().members(), X().gearItems()) };
  };
  V.attFlee = function (step) {
    const r = run(), fi = V.attFleeInfo(step); if (!fi || X().current() !== step || step.fleeTried) return { error: "Nothing to flee from." };
    const F = AT().flee, T = AT().text;
    let roll = null;
    if (!fi.free) {
      roll = G.Checks.roll(fi.check, null, "flee"); X().log(roll.text, "check");
      if (!G.Checks.isSuccess(roll.grade)) {   // no downside, except a natural 1: stunned at battle start
        const nat1 = roll.d === 1; step.fleeTried = true;
        if (nat1) step.freeze = { side: 0, sec: F.nat1StunSec };
        V.ev("attention_flee", { ok: false, nat1 }); G.State.save();
        return { fled: false, roll, nat1, text: `${roll.text} — ${nat1 ? T.fleeNat1 : T.fleeFail}` };
      }
    }
    const enc = V.encOf(step), nid = (enc && enc.nid) || step.nid || r.loc, m = V.inst(nid, false);
    if (enc && !enc.outcome) {
      enc.outcome = "fled";
      for (const gid of enc.groups) { const g = V.group(m, gid); if (g) { g.enc = null; delete g.waiting; g.state = g.attention ? "dismissed" : "available"; } }
    }
    V.releaseQueued(r.queue.filter((s) => s !== step));
    r.queue = [];
    V.att(nid).owed = { area: V.areaOfKey(step.site) };
    r.loc = nid; r.view = "map"; V.clearWaits(nid);   // ejected: on traversal, travel on or extract
    V.ev("attention_flee", { ok: true, nid, free: fi.free });
    X().log(T.fled, "good");
    G.State.save();
    return { fled: true, roll, text: (roll ? roll.text + " — " : "") + T.fled };
  };
  // what the Map header shows (never Heat): null when it isn't a place with a bar
  V.attView = function (nid) {
    const r = run(); if (!V.on(r) || !nid || !G.Map.loc(G.Zones.node(nid))) return null;
    const m = V.inst(nid); if (!m || !AT() || !AT().enabled) return null;
    if (!V.attOnM(m)) return { peaceful: V.attPeacefulM(m), off: true };
    const st = V.attState(nid) || { bar: 0, fills: 0, noto: 0, esc: 0, owed: null };
    return { bar: st.bar, max: AT().barMax, fills: st.fills, noto: V.attNoto(st), esc: st.esc, owed: !!st.owed };
  };
  // the escalation a battle step about to start will show (+units), 0 if none
  V.attEscFor = function (step) {
    if (!step || step.family === "hunters" || step.family === "rivals") return 0;
    const enc = V.encOf(step), m = enc && V.inst(enc.nid, false), g = m && V.group(m, enc.groups[0]);
    if (!g || g.reinforcement) return 0;
    const st = V.attState(enc.nid); return (st && st.esc) || 0;
  };

  // ---------- development assertions (tests/maps_v2.js; the debug panel) ----------
  V.audit = function () {
    const r = run(), out = []; if (!V.on(r)) return out;
    for (const h of r.v2.heatLedger) if (!V.heatAllowed(h.why)) out.push("unapproved Heat source " + h.why);
    for (const id in r.v2.maps) { const m = r.v2.maps[id], legacy = G.state.world.sites[id]; if (m.kind === "v2" && legacy && legacy.enteredRun === G.state.runCount) out.push("two controllers for Map " + id); }
    for (const id in r.v2.enc) { const e = r.v2.enc[id]; if (/corpse|body/.test(e.source)) out.push("combat started by a body: " + id); }
    for (const z in r.v2.classes || {}) { const map = G.state.maps[z]; if (!map) continue; const plan = r.v2.classes[z], C = D().classification;
      for (const id in plan) if (plan[id] === "occupied" && (map.nodes[id].row || 0) < C.occupiedMinRow && !V.v2Def(id)) out.push("Occupied Map in the first row: " + id); }
    return out;
  };
})(typeof window !== "undefined" ? window : globalThis);
