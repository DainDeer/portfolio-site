// Slice 3 §7 rival snapshots (async ghosts, no server) + the Radio's rival intel (§10b). Logic only; numbers: DATA.rivals.
// state.rivals: { echoes: [snapshot] (newest first, last 10), imported: [snapshot], defeated, met, next: { id, zone, nid } | null, force: id | true | null }
(function (root) {
  const G = root.G, U = G.Util;
  const RV = G.Rivals = {};
  const D = () => DATA.rivals;
  const X = () => G.Exp;
  const run = () => G.state.run;

  RV.st = function () {
    const s = G.state; s.rivals = s.rivals || {};
    const r = s.rivals; r.echoes = r.echoes || []; r.imported = r.imported || []; r.defeated = r.defeated || 0; r.met = r.met || 0;
    if (r.next === undefined) r.next = null; if (r.force === undefined) r.force = null;
    return r;
  };
  RV.all = () => D().seeded.concat(RV.st().imported, RV.st().echoes);
  RV.byId = (id) => RV.all().find((x) => x.id === id) || null;
  RV.myScore = () => G.State.deployScore();

  // ---------- picking ----------
  RV.echoesOk = () => G.state.runCount >= D().echoes.fromRun;
  RV.pool = function (zone, source) {
    if (source === "own") return RV.echoesOk() ? RV.st().echoes.filter((x) => x.zone === zone) : [];
    return D().seeded.concat(RV.st().imported).filter((x) => x.zone === zone);
  };
  // a snapshot for this zone whose deploy score is closest to yours (ties random); 40% of picks are an echo when echoes exist
  RV.pick = function (zone, rng) {
    rng = rng || G.rng;
    const own = RV.pool(zone, "own"), seeded = RV.pool(zone, "seeded");
    let pool = own.length && rng() * 100 < D().echoes.sharePct ? own : seeded;
    if (!pool.length) pool = own.length ? own : seeded;
    if (!pool.length) return null;
    const me = RV.myScore(), dist = (x) => Math.abs((x.deployScore || 0) - me), best = Math.min(...pool.map(dist));
    return rng.pick(pool.filter((x) => dist(x) === best));
  };
  // eligible map nodes: locations, not the insertion point, an extraction or Hollow Creek
  RV.zoneOk = (z) => !D().zones || D().zones.includes(z);   // follow-up (Vixie): rivals only in these zones (Zone B)
  RV.eligibleNode = function (map, n) {
    const loc = G.Map.loc(n); if (!loc) return false;
    return n.id !== map.insertion && !loc.extraction && n.loc !== "hollow_creek";
  };
  // before each run: the next run's rival, pre-rolled for one unlocked zone (the Radio can read it), with a location
  RV.rollNext = function (rng) {
    rng = rng || G.rng; const s = G.state, st = RV.st();
    const zones = Object.keys(DATA.zones.list).filter((z) => RV.zoneOk(z) && G.Zones.unlocked(z) && s.maps[z] && (RV.pool(z, "seeded").length || RV.pool(z, "own").length));
    if (!zones.length) { st.next = null; return null; }
    const zone = rng.pick(zones), snap = RV.pick(zone, rng); if (!snap) { st.next = null; return null; }
    const map = s.maps[zone], nodes = Object.values(map.nodes).filter((n) => RV.eligibleNode(map, n));
    st.next = { id: snap.id, zone, nid: nodes.length ? rng.pick(nodes).id : null };
    return st.next;
  };
  RV.next = function () { const st = RV.st(); if (!st.next || !RV.byId(st.next.id) || !G.state.maps[st.next.zone]) RV.rollNext(); return st.next; };

  // ---------- Radio intel (§10b) ----------
  const radioFx = () => (G.Radio && G.Radio.built() ? G.Outpost.effects("radio") : {});
  RV.intelOn = () => !!radioFx().rivalIntel;
  RV.markOn = () => !!radioFx().rivalMark;
  RV.intelText = function () {
    if (!RV.intelOn()) return "Build the Radio to hear about renegades.";
    const n = RV.next(); if (!n) return "Nothing on the air.";
    const z = DATA.zones.list[n.zone].name, node = RV.markOn() && n.nid ? G.state.maps[n.zone].nodes[n.nid] : null;
    return `A renegade was sighted in ${z}. Rival chance there ×${D().intelMult} ${G.state.run ? "this run" : "next run"}.` + (node ? ` Last seen at ${G.Map.label(node)} (marked on the map).` : "");
  };
  // the marked location (Radio L2) in the current zone, for the map view
  RV.markedNode = function () {
    const r = run(), n = RV.st().next; if (!r || !n || !RV.markOn() || n.zone !== r.zone || r.rivalMet || !n.nid) return null;
    return n.nid;
  };

  // ---------- the encounter ----------
  RV.chance = function (zone) { const n = RV.st().next; return D().encounterPct * (RV.intelOn() && n && n.zone === zone ? D().intelMult : 1); };
  // X.arrive, first entry of a location: true = a rival is here (instead of the normal Hostiles roll)
  RV.onArrive = function (node) {
    const r = run(), map = G.Zones.map(), st = RV.st();
    if (!D().enabled || !r || r.rivalMet || X().tutorialOn() || !RV.eligibleNode(map, node)) return false;
    if (!RV.zoneOk(r.zone) && !st.force) return false;   // no rivals outside rivals.zones (only the debug force ignores it)
    const nx = RV.next(), marked = RV.markOn() && nx && nx.zone === r.zone && nx.nid === node.id;
    let snap = null, why;
    if (st.force) { snap = st.force === true ? null : RV.byId(st.force); why = "forced (debug)"; }
    else if (r.forceRivalAt != null && r.forceRivalAt === r.moves) { why = "forced (sim)"; if (r.forceRivalId) snap = RV.byId(r.forceRivalId); }
    else if ((G.state.extractions || 0) < (D().minExtractions || 0)) return false;   // milestone 5: no rivals until you've extracted this many times
    else if (marked) { why = "the Radio marked this place"; }
    else {
      const pct = RV.chance(r.zone), roll = G.rng() * 100;
      X().log(`Rival roll: ${pct}%${pct !== D().encounterPct ? " (Radio intel ×" + D().intelMult + ")" : ""} → rolled ${Math.floor(roll)}: ${roll < pct ? "a renegade squad is here!" : "no."}`, "roll");
      if (roll >= pct) return false;
      why = "rolled";
    }
    if (!snap) snap = nx && nx.zone === r.zone ? RV.byId(nx.id) : RV.pick(r.zone);
    if (!snap) return false;
    st.force = null; r.rivalMet = true; st.met++;
    X().push({ type: "rival", snap: U.clone(snap), nid: node.id, why });
    X().log(`⚠ ${snap.handle}: a renegade squad (${why}).`, "bad");
    return true;
  };

  RV.checkInfo = (o) => G.Checks.compute(o.skill, o.dc, X().members(), X().gearItems());
  RV.odds = () => ({ ambush: RV.checkInfo(D().ambush), hide: RV.checkInfo(D().hide), parley: RV.checkInfo(D().parley) });
  // choice: engage | ambush | hide | parley. Returns { text, battle?, roll? }
  RV.resolve = function (step, choice) {
    const r = run(), snap = step.snap, fight = (freeze, why) => { X().next(); X().push({ type: "battle", family: "rivals", rival: snap, freeze, nid: step.nid, why }, true); G.State.save(); };
    if (choice === "engage") { fight(null, `${snap.handle}!`); return { text: "Engage!", battle: true }; }
    if (choice === "ambush") {
      const roll = G.Checks.roll(RV.checkInfo(D().ambush)); X().log(roll.text, "check");
      if (G.Checks.isSuccess(roll.grade)) { fight({ side: 1, sec: D().ambush.freezeSec }, "Ambush!"); return { text: `Ambush! They're frozen for ${D().ambush.freezeSec} s.`, battle: true, roll }; }
      fight(null, "They saw you coming."); return { text: "They saw you coming. Engage!", battle: true, roll };
    }
    if (choice === "hide") {
      const roll = G.Checks.roll(RV.checkInfo(D().hide)); X().log(roll.text, "check");
      if (G.Checks.isSuccess(roll.grade)) { X().next(); X().log(`You stay out of sight. ${snap.handle} moves on.`, "good"); G.State.save(); return { text: "You stay hidden. They move on.", roll }; }
      fight(null, "They found you."); return { text: "They found you. Engage!", battle: true, roll };
    }
    if (choice === "parley") {
      const P = D().parley, roll = G.Checks.roll(RV.checkInfo(P)); X().log(roll.text, "check");
      if (roll.grade === "badFail") { fight({ side: 0, sec: P.freezeSec }, "It was a trap!"); return { text: `It was a trap: they ambush you (you're frozen for ${P.freezeSec} s).`, battle: true, roll }; }
      X().next();
      if (!G.Checks.isSuccess(roll.grade)) { X().log(`${snap.handle} doesn't want to talk and leaves.`); G.State.save(); return { text: "They don't want to talk. They leave.", roll }; }
      const n = RV.shareIntel(); let text = `They share what they know: ${n} places on the map revealed.`;
      if (roll.grade === "crit") { const it = RV.packItem(snap, step.nid); if (it) { r.bag.items.push(it); text += ` They also hand over ${G.Items.name(it)}.`; } }
      X().log(text, "good"); G.State.save(); return { text, roll };
    }
    return { error: "Unknown choice." };
  };
  // Parley success: fog lifts on the 3 nearest unseen locations and every extraction in the zone
  RV.shareIntel = function () {
    const r = run(), map = G.Zones.map(), dist = G.Hunters.dists(r.loc); r.revealed = r.revealed || {};
    const unseen = Object.keys(map.nodes).filter((n) => G.Map.loc(map.nodes[n]) && !X().visible(n) && dist[n] != null).sort((a, b) => dist[a] - dist[b]);
    let n = 0;
    for (const id of unseen.slice(0, D().parley.revealNearest)) { r.revealed[id] = true; n++; }
    for (const id in map.nodes) { const loc = G.Map.loc(map.nodes[id]); if (loc && loc.extraction && !X().visible(id)) { r.revealed[id] = true; n++; } }
    X().markSeen(); return n;
  };
  // Parley crit: 1 item from their pack (a gear roll at the pack's rarity bonus)
  RV.packItem = function (snap, nid) {
    const node = X().node(nid || run().loc), T = DATA.searchables.types.rival_pack, ilvl = X().itemLevel(node);
    const base = G.Items.rollBase(G.rng); return G.Items.make(base, G.Items.rollRarity(G.rng, X().rarityBonus() + T.rarityBonus, ilvl), ilvl, G.rng);
  };

  // ---------- battle units ----------
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const skillsRec = (sk) => { const o = {}; for (const k in sk || {}) o[k] = { lvl: sk[k], xp: 0 }; return o; };
  const itemOf = (g) => { const it = G.Items.make(g.base, g.rarity, g.ilvl, U.makeRng(7)); it.affixes = clone(g.affixes || []); return it; };
  // one snapshot unit -> a save-like record the battle code understands (never saved)
  RV.recordOf = function (su) {
    const gear = {}; for (const g of su.gear || []) gear[g.slot] = itemOf(g);
    if (su.kind === "body") {
      const rec = { uid: "rival_body", name: su.name, family: "human", cls: su.cls, spec: su.spec, quirks: (su.quirks || []).slice(), skills: skillsRec(su.skills), bodyXp: Math.pow(su.bodyLevel || 1, 2) * DATA.config.leveling.bodyLevelDivisor, ablAuto: {} };
      return { rec, gear };
    }
    const tplKey = su.tplKey || (su.kind === "core" ? "veteran" : "grunt");
    const rec = { uid: "rival_" + (su.name || "ally"), name: su.name, nickname: su.nickname || null, rank: tplKey === "veteran" ? DATA.allies.veteran.rank : "grunt", tplKey, weapon: su.weapon || DATA.bodies.grunt.weapons[0], skills: skillsRec(su.skills), traits: (su.traits || []).slice(), gear: {} };
    const slots = G.State.gruntSlots(rec);
    for (const k in slots) rec.gear[k] = null;
    for (const g of su.gear || []) { const bs = G.Items.base(g.base).slot, k = Object.keys(slots).find((x) => slots[x].includes(bs)); if (k) rec.gear[k] = itemOf(g); }
    return { rec, gear: rec.gear };
  };
  // battle units for a snapshot: [{ u, cell }] with their layout cells mirrored onto the enemy side
  RV.units = function (snap) {
    const C = DATA.config.battle, cols = Math.floor(C.arenaW / C.gridCell);
    return snap.units.map((su, i) => {
      const { rec, gear } = RV.recordOf(su);
      const u = su.kind === "body" ? G.Battle.unitFromBody(rec, gear, { rival: true }) : G.Battle.unitFromGrunt(rec, null, { rival: true });
      if (su.kind === "body") { u.name = su.name; if (G.Abilities) u.abl = (su.abilities && su.abilities.length ? su.abilities : G.Abilities.idsFor(rec)).filter((id) => G.Abilities.def(id)).map((id) => { const d = G.Abilities.def(id); return { id, d, cd: d.cooldownSec * DATA.abilities.startCdFrac, max: d.cooldownSec, auto: true }; }); }
      const sc = D().scale || {}; if (sc.hp && sc.hp !== 1) { u.maxHp *= sc.hp; u.hp = u.maxHp; } if (sc.dmg && sc.dmg !== 1) u.dmgPct = (100 + (u.dmgPct || 0)) * sc.dmg - 100;
      u.side = 1; u.ref = null; u.rival = true; u.family = "rivals"; u.eid = "rival_" + su.kind; u.rivalIdx = i; u.rivalOf = snap.handle; u.snapUnit = su;
      const L = (snap.layout || [])[i], cell = L ? { cx: U.clamp(cols - 1 - L.cx, cols - C.playerZoneCols, cols - 1), cy: L.cy } : null;
      return { u, cell };
    });
  };

  // ---------- after the fight ----------
  // each rival unit leaves a body with its gear (the rival body's weapon 100%, other slots 50%, item level capped at
  // the location's + 4), plus a Rival's pack. Called from X.finishBattle on a win.
  RV.afterWin = function (step, b) {
    const st = RV.st(); st.defeated++;
    const dead = b.units.filter((u) => u.side === 1 && u.rival && u.state === "dead");
    X().addRivalBodies(step.nid || run().loc, dead, step.rival);
    X().log(`${step.rival.handle} is beaten. Rivals defeated: ${st.defeated}.`, "good");
  };
  RV.lootFor = function (su, node, rng) {
    const L = D().loot, cap = X().itemLevel(node) + L.ilvlCapPlus, out = [];
    for (const g of su.gear || []) {
      const pct = su.kind === "body" && g.slot === "weapon" ? L.bodyWeaponPct : L.otherSlotPct;
      if (rng() * 100 >= pct) continue;
      const it = itemOf(g); it.uid = U.uid("it"); if (it.ilvl > cap) it.ilvl = cap; out.push(it);
    }
    return out;
  };

  // ---------- own echoes ----------
  // X.start: the deployed squad as a draft snapshot; finalized (heat, layout) at extraction or death
  RV.fromSquad = function (body, gear, grunts, opts) {
    opts = opts || {};
    const gearList = (g) => Object.entries(g || {}).filter(([, it]) => it && !G.Items.isQuest(it)).map(([slot, it]) => ({ slot: G.Items.base(it.base).slot === "backpack" ? "backpack" : slot, base: it.base, rarity: it.rarity, ilvl: it.ilvl, affixes: clone(it.affixes || []) }));
    const lv = (sk) => { const o = {}; for (const k in sk || {}) o[k] = sk[k].lvl; return o; };
    const units = [{ kind: "body", name: body.name, cls: body.cls, spec: body.spec, bodyLevel: G.Skills.bodyLevel(body), skills: lv(body.skills), quirks: (body.quirks || []).slice(), gear: gearList(gear), traits: [], abilities: G.Abilities ? G.Abilities.idsFor(body) : [] }];
    for (const g of grunts) units.push({ kind: g.tplKey === "veteran" || g.rank === "core" ? "core" : "grunt", name: g.name, nickname: g.nickname || null, tplKey: g.tplKey || "grunt", weapon: g.weapon, skills: lv(g.skills), traits: (g.traits || []).slice(), gear: gearList(g.gear), abilities: [] });
    const zone = opts.zone || "a";
    return { version: D().version, id: opts.id || U.uid("echo"), handle: opts.handle || D().echoes.prefix + body.name, source: opts.source || "own", zone, tier: DATA.zones.list[zone].tier || 1,
      heat: opts.heat || 0, deployScore: RV.myScore(), createdRun: G.state.runCount, units, layout: opts.layout || null };
  };
  RV.draftAtStart = function (r) {
    const body = G.State.body(r.bodyUid);
    r.echoDraft = RV.fromSquad(body, r.gear, r.squad.map((s) => s.g), { zone: r.zone });
  };
  // X.finishBattle: remember where you placed your units (the echo's layout)
  RV.noteLayout = function (b) {
    const r = run(); if (!r || !r.echoDraft) return;
    const lay = []; const us = b.units.filter((u) => u.side === 0 && u.cell);
    const body = us.find((u) => u.rank === "body"); if (body) lay[0] = { cx: body.cell.cx, cy: body.cell.cy };
    for (const u of us) if (u.squadIdx != null) lay[1 + u.squadIdx] = { cx: u.cell.cx, cy: u.cell.cy };
    r.echoLayout = lay;
  };
  RV.recordEcho = function (r, outcome) {
    if (!r || !r.echoDraft || !D().enabled) return null;
    const e = r.echoDraft; e.heat = r.heat; e.outcome = outcome;
    if (r.echoLayout) e.layout = e.units.map((_, i) => r.echoLayout[i] || null); else e.layout = null;
    if (e.layout && e.layout.some((c) => !c)) e.layout = null;
    const st = RV.st(); st.echoes.unshift(e); st.echoes = st.echoes.slice(0, D().echoes.keep); r.echoDraft = null;
    return e;
  };
  RV.onRunEnd = function () { RV.rollNext(); };

  // ---------- debug: export / import / force ----------
  RV.exportCurrent = function () {
    const s = G.state, r = s.run;
    if (r) return RV.fromSquad(G.State.body(r.bodyUid), r.gear, r.squad.filter((q) => q.hp > 0).map((q) => q.g), { zone: r.zone, heat: r.heat, source: "own", layout: r.echoLayout && r.echoLayout.length === 1 + r.squad.length ? r.echoLayout : null });
    const lo = s.loadout, gear = {}; for (const k in lo.gear) { const it = s.stash.items.find((i) => i.uid === lo.gear[k]); if (it) gear[k] = it; }
    return RV.fromSquad(G.State.body(lo.bodyId), gear, lo.grunts.map((id) => s.grunts.find((g) => g.uid === id)).filter(Boolean), { zone: lo.zone || "a", source: "own" });
  };
  RV.validate = function (snap) {
    if (!snap || typeof snap !== "object") return "Not a snapshot.";
    if (snap.version !== D().version) return `Snapshot version ${snap.version}, this build reads ${D().version}.`;
    if (!snap.id || !snap.handle || !DATA.zones.list[snap.zone]) return "Missing id / handle / zone.";
    if (!Array.isArray(snap.units) || !snap.units.length || snap.units[0].kind !== "body") return "The first unit must be the body.";
    for (const su of snap.units) {
      if (su.kind === "body" && su.cls && !DATA.bodies.classes[su.cls]) return "Unknown class " + su.cls;
      for (const g of su.gear || []) if (!DATA.items.bases[g.base]) return "Unknown item " + g.base;
    }
    return null;
  };
  RV.importSnap = function (json) {
    let snap; try { snap = typeof json === "string" ? JSON.parse(json) : clone(json); } catch (e) { return { error: "Bad JSON: " + e.message }; }
    const why = RV.validate(snap); if (why) return { error: why };
    const st = RV.st(); st.imported = st.imported.filter((x) => x.id !== snap.id); st.imported.push(snap); G.State.save();
    return { snap };
  };
  RV.forceNext = function (id) { RV.st().force = id || true; G.State.save(); };
})(typeof window !== "undefined" ? window : globalThis);
