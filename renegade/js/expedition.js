// Expedition flow: loadout -> map moves -> encounter queue -> extraction or death.
// UI reads G.state.run and G.Exp.current(); UI calls resolve* functions. No DOM here.
(function (root) {
  const G = root.G, U = G.Util;
  const X = G.Exp = {};
  const CFG = () => DATA.config;
  const run = () => G.state.run;

  // ---------- derived values ----------
  X.body = () => G.State.body(run().bodyUid);
  X.gearItems = () => Object.values(run().gear).filter(Boolean);
  // Heat per move from carried resources with heatPerMove (Relic Tech), bag + pouch
  X.carriedResHeat = function () {
    const r = run(); if (!r) return 0; let h = 0;
    for (const k in DATA.resources) { const per = DATA.resources[k].heatPerMove; if (!per) continue; let n = (r.bag.res[k] || 0); for (const p of r.pouch || []) if (p.res === k) n += p.n; h += n * per; }
    return h;
  };
  X.heatTier = function (heat) {
    const th = CFG().heat.thresholds; let t = th[0];
    for (const x of th) if ((heat == null ? run().heat : heat) >= x.min) t = x;
    return t;
  };
  X.capacity = function (r, body, gearItems) {
    r = r || run(); body = body || X.body(); gearItems = gearItems || Object.values(r.gear).filter(Boolean);
    const c = CFG().carry;
    let cap = c.baseKg + G.Skills.level(body.skills, "hauling") * c.kgPerHaulingLevel;
    for (const q of body.quirks) { const qd = DATA.bodies.quirks[q]; if (qd.effect === "carry_base") cap += qd.value; }
    for (const it of gearItems) cap += G.Items.base(it.base).carryKg || 0;
    cap += G.Items.affixSum(gearItems, "carry_kg") + G.Items.setStat(gearItems, "carry_kg");   // + Scav Kit (2)
    cap += G.Perks.carryKg();   // Mule (Slice 3 §3)
    for (const m of (r && r.squad) || []) if (m.hp > 0) cap += X.memberCarryKg(m);   // standing teammates (Slice 5 §C)
    return cap;
  };
  // what one standing teammate adds to squad capacity: Slice 5 §C's per-teammate kg + the pack it wears (+ its carry
  // affixes and set bonus) + Pack Rat. (A Grunt's gear doesn't count toward your carried kg.)
  X.memberCarryKg = function (m) {
    let kg = CFG().carry.perTeammateKg || 0;
    const pk = G.State.gruntPack(m.g); if (pk) kg += (G.Items.base(pk.base).carryKg || 0) + G.Items.affixSum([pk], "carry_kg");
    if (G.State.gruntItems) kg += G.Items.setStat(G.State.gruntItems(m.g), "carry_kg");
    if (G.Allies) kg += G.Allies.mods(m.g).carryKg || 0;
    return kg;
  };
  // Slice 5 §C: a dying teammate's share of the run bag (frac = its kg / the capacity it was part of). Every resource
  // stack gives round(n x frac); items (newest first, never quest items) go while they keep the taken weight nearest
  // frac x the items' weight. Removed from the bag and returned.
  X.takeBagShare = function (frac) {
    const r = run(), out = { items: [], res: {} }; if (!(frac > 0)) return out;
    for (const k in r.bag.res) { const n = Math.min(r.bag.res[k] || 0, Math.round((r.bag.res[k] || 0) * frac)); if (n > 0) { out.res[k] = n; r.bag.res[k] -= n; } }
    const pool = r.bag.items.filter((it) => !G.Items.isQuest(it)), target = frac * pool.reduce((a, it) => a + G.Items.weight(it), 0);
    let kg = 0;
    for (let i = pool.length - 1; i >= 0; i--) { const w = G.Items.weight(pool[i]); if (kg + w - target > target - kg) continue; kg += w; out.items.push(pool[i]); }
    r.bag.items = r.bag.items.filter((it) => !out.items.includes(it));
    return out;
  };
  X.carried = function (r) {
    r = r || run();
    let kg = 0;
    if (CFG().carry.equippedCountsTowardCarry) for (const it of Object.values(r.gear)) if (it) kg += G.Items.weight(it);
    for (const it of r.bag.items) kg += G.Items.weight(it);
    for (const k in r.bag.res) kg += (r.bag.res[k] || 0) * DATA.items.resources[k].kgPerUnit;
    for (const p of r.pouch) kg += X.pouchEntryKg(p);
    kg += r.carriedCritical.length * DATA.bodies.criticalCare.carryKg;
    if (r.ammo && r.ammo.n > 0) kg += r.ammo.n * G.Items.base(r.ammo.base).weight;   // Slice 3 §9 ammo packs (0.3 kg each)
    return kg;
  };
  X.pouchEntryKg = (p) => (p.item ? G.Items.weight(p.item) : p.n * DATA.items.resources[p.res].kgPerUnit);
  X.carryPct = () => (X.carried() / X.capacity()) * 100;
  X.immobile = () => X.carryPct() >= CFG().carry.immobileAtPct;
  X.members = function () { // refs for checks: body + standing grunts/core allies
    const r = run(), out = [{ kind: "body", body: X.body() }];
    for (const s of r.squad) if (s.hp > 0) out.push({ kind: "grunt", grunt: s.g });
    return out;
  };
  X.itemLevel = function (node) {
    const L = CFG().loot, r = run();
    return Math.max(1, (L.ilvlByTier[node.tier] || 1) + r.moves * L.ilvlPerDepth + Math.floor(r.heat / L.heatPerIlvl) + G.rng.int(-L.ilvlVariance, L.ilvlVariance));
  };
  X.rarityBonus = () => X.heatTier().lootBonus + G.Skills.level(G.state.mind.skills, "scavenging") * CFG().loot.scavengingRarityPerLevel + G.Perks.rarityBonus();   // + Scavenger's Eye (Slice 3 §3)
  X.odds = function (node) {
    const loc = G.Map.loc(node); if (!loc) return null;
    const o = Object.assign({}, loc.odds);
    const t = X.heatTier();
    if (o.hostiles > 0 || loc.odds.hostiles === 0 && t.forcedBattle) o.hostiles = U.clamp(o.hostiles + t.hostileBonus, 0, 100);
    const w = X.worldOverride(node);
    if (w) Object.assign(o, w.odds || {});
    return o;
  };
  X.worldOverride = function (node) {
    const loc = G.Map.loc(node); if (!loc || !loc.worldEvent) return null;
    const st = G.state.world.hollow_creek;
    // Slice 2: the Slice 1 "container %" is gone (every location has its own searchables); a fallen town adds Town Salvage
    if (st === "aftermath") return { event: "aftermath_hollow_creek", odds: { hostiles: 0, event: 100, survivors: 0 }, label: "Aftermath" };
    if (st === "aftermath_cleared") return { odds: { hostiles: 0, event: 0, survivors: 0 }, label: "Ruins (cleared)" };
    if (st === "allied") return { event: "allied_hollow_creek", odds: { hostiles: 0, event: 100, survivors: 0 }, label: "Allied" };
    if (st === "allied_visited") return { odds: { hostiles: 0, event: 0, survivors: 0 }, label: "Allied" };
    const D = loc.distress || {};
    if (st === "ignored" && run() && run().distressLeft > 0) return { event: D.holdingEvent, odds: { hostiles: 0, event: 100, survivors: 0 }, label: `Holding: ${run().distressLeft} move${run().distressLeft === 1 ? "" : "s"} left`, countdown: run().distressLeft };
    if ((st === "ignored" || st === "fallen") && D.fallen) return { odds: D.fallen.odds, container: D.fallen.container, label: D.fallen.label };
    if (st === "saved") return { odds: { hostiles: 0, event: 0, survivors: 0 }, label: "Saved" };
    return null;
  };
  X.visible = function (nid) {
    const r = run(); if (!r) return !!G.state.everSeen[nid];
    if (r.visited[nid] || (r.revealed && r.revealed[nid])) return true;   // revealed: fog lifted by an event (Signal peace)
    const map = G.Zones.map(G.Zones.zoneOf(nid));
    return G.Map.neighbors(map, nid).some((n) => r.visited[n]) || nid === map.insertion;
  };
  X.wrecked = (node) => !!(run() && run().wrecked && node && run().wrecked[node.id]);   // Slice 5 §A: crashed this run
  X.extractionOpen = function (node) {
    const loc = G.Map.loc(node); if (!loc || !loc.extraction) return false;
    if (X.wrecked(node)) return false;
    const n = X.heatTier().closeExtractions; if (!n) return true;
    // per zone: each zone keeps at least one open (a wrecked one doesn't count as that one)
    const order = (run().extractOrder[G.Zones.zoneOf(node.id)] || []).filter((id) => !(run().wrecked && run().wrecked[id]));
    const closed = order.slice(0, Math.min(n, order.length - 1));
    return !closed.includes(node.id);
  };

  // ---------- start ----------
  // loadout: { bodyId, gear:{slot:uid}, pouch:[{uid}|{res,n}], grunts:[uid], med:n }
  X.validateLoadout = function (lo) {
    const s = G.state, body = G.State.body(lo.bodyId);
    if (!body) return "Pick a body.";
    if (!G.State.bodyReady(body)) return body.name + " is still restoring.";
    let cost = G.State.bodyCost(body);
    for (const gid of lo.grunts) { const g = s.grunts.find((x) => x.uid === gid); if (g) cost += G.State.gruntTpl(g).deployCost; }
    if (cost > G.State.deployScore()) return `Deploy cost ${cost} exceeds score ${G.State.deployScore()}.`;
    let pk = 0;
    for (const p of lo.pouch || []) { if (p.uid) { const it = s.stash.items.find((i) => i.uid === p.uid); if (it) pk += G.Items.weight(it); } else pk += p.n * DATA.items.resources[p.res].kgPerUnit; }
    if ((lo.pouch || []).length > G.Outpost.pouchSlots() || pk > G.Outpost.pouchMaxKg() + 1e-9) return "Secure Pouch is over its slot/kg limit.";
    if ((lo.pouch || []).some((p) => p.uid && G.Items.isQuest(s.stash.items.find((i) => i.uid === p.uid)))) return "Quest items can't go in the Secure Pouch.";
    if (G.Injuries && G.Injuries.busy(lo.bodyId)) return `${G.State.bodyTitle(body)} is in the Infirmary.`;
    { const inBed = lo.grunts.map((id) => s.grunts.find((x) => x.uid === id)).find((g) => g && G.Injuries && G.Injuries.busy(g.uid)); if (inBed) return `${G.Allies.name(inBed)} is in the Infirmary.`; }
    if (lo.ammo && lo.ammo.base && lo.ammo.n > 0 && (!G.Workbench || G.Workbench.ammoCount(lo.ammo.base) < lo.ammo.n)) return "Not enough ammo packs in the stash.";
    if (G.Outpost.stashOver() > 0) return `The Vault stash is over its limit (${G.Outpost.stashCount()}/${G.Outpost.stashCap()}). Discard some gear first.`;
    return null;
  };

  // Vixie (Slice 4): the names of the loadout's units that would fight with bare fists (no weapon, and their own
  // fallback is the Fists: the Basic body / Vanguard with an empty weapon slot; a Grunt has its Shiv). gear: a run's
  // taken gear (else the loadout's, looked up in the stash).
  X.unarmedUnits = function (lo, gear) {
    const s = G.State && G.state, out = [], fists = (w) => !w || w === "nat_fists";
    if (!s || !lo) return out;
    const body = G.State.body(lo.bodyId);
    if (body) {
      const has = gear ? !!gear.weapon : !!(lo.gear && lo.gear.weapon && s.stash.items.some((i) => i.uid === lo.gear.weapon));
      const tpl = (body.cls && DATA.bodies.classes[body.cls]) || DATA.bodies.basicBody, nat = tpl.naturalWeapon || "nat_fists";   // as G.Battle.unitFromBody
      if (!has && fists(nat)) out.push(body.name || G.State.bodyTitle(body));
    }
    for (const gid of lo.grunts || []) { const g = s.grunts.find((x) => x.uid === gid); if (!g) continue;
      if (!(g.gear && g.gear.weapon) && fists(g.weapon)) out.push(G.Allies ? G.Allies.name(g) : g.name); }
    return out;
  };
  X.start = function (lo, seed, zone) {
    const s = G.state;
    zone = zone || lo.zone || "a";
    if (!G.Zones.unlocked(zone)) return "That zone is still locked.";
    const err = X.validateLoadout(lo); if (err) return err;
    if (G.Difficulty) G.Difficulty.lock(s);   // Slice 4 §H: the first deploy locks it even without the start screen
    if (G.Main) G.Main.clampAnnex(s);   // Vixie: annex rows while Main 1 isn't done (also after a debug reseed)
    const snapshot = JSON.stringify(s);
    seed = seed == null ? U.randomSeed() : seed;
    G.rng = U.makeRng(seed);
    const take = (uid) => { const i = s.stash.items.findIndex((x) => x.uid === uid); return i >= 0 ? s.stash.items.splice(i, 1)[0] : null; };
    const gear = {};
    for (const slot in lo.gear) if (lo.gear[slot]) { const it = take(lo.gear[slot]); if (it) gear[slot] = it; }
    // Vixie (Slice 4): no free weapon any more; an unarmed unit fights with bare fists (config.unarmed). The deploy
    // button asks first (X.unarmedUnits).
    // every run starts with a basic backpack (config.deploy.freeBackpack): none picked -> one from the stash, else a free one
    const FB = CFG().deploy.freeBackpack; let freePack = null;
    if (!gear.backpack && FB) { const own = s.stash.items.find((i) => i.base === FB.base); if (own) gear.backpack = take(own.uid); else gear.backpack = freePack = G.Items.make(FB.base, FB.rarity, FB.ilvl, G.rng); }
    const pouch = [];
    for (const p of lo.pouch || []) {
      if (p.uid) { const it = take(p.uid); if (it) pouch.push({ item: it }); }
      else if (p.res && (s.stash.res[p.res] || 0) >= p.n) { s.stash.res[p.res] -= p.n; pouch.push({ res: p.res, n: p.n }); }
    }
    const bag = { items: [], res: {} };
    // Slice 3 §9: the ammo type picked on the deploy screen and how many packs to carry (1 used per battle)
    let ammo = null;
    if (lo.ammo && lo.ammo.base && lo.ammo.n > 0 && G.Workbench) { const n = G.Workbench.takeAmmo(lo.ammo.base, lo.ammo.n); if (n) ammo = { base: lo.ammo.base, n, used: 0 }; }
    const med = Math.min(lo.med || 0, s.stash.res.med || 0);
    if (med) { s.stash.res.med -= med; bag.res.med = med; }
    const squad = [];
    for (const gid of lo.grunts) { const g = s.grunts.find((x) => x.uid === gid); if (g) squad.push({ g, hp: G.Battle.unitFromGrunt(g).maxHp }); }
    const body = G.State.body(lo.bodyId);
    const extractOrder = {};
    for (const z in s.maps) extractOrder[z] = G.rng.shuffle(Object.values(s.maps[z].nodes).filter((n) => G.Map.loc(n) && G.Map.loc(n).extraction).map((n) => n.id));
    const ins = s.maps[zone].insertion;
    s.run = {
      seed, snapshot, zone, loc: ins, view: "map", moves: 0, heat: 0, visited: { [ins]: true }, bodyUid: body.uid, gear, bag, pouch, squad,
      bodyHp: null, queue: [], log: [], gruntsJoin: 0, claimedBodies: [], lore: [], done: {}, distressFired: false, xpTally: {},
      stats: { battles: 0, kills: 0, searches: 0, events: 0 }, carriedCritical: [], extractOrder, pendingUnlocks: [], ammo
    };
    s.run.bodyHp = G.Battle.unitFromBody(body, gear, {}).maxHp;
    if (G.Hunters) G.Hunters.onRunStart(s.run);   // Slice 3 §4b: "Marked by the Orbitals" (Heat 25 start)
    if (G.Radio) G.Radio.fogReveal(s.run, zone);   // Slice 3 §10b: Radio L2 lifts the fog 1 ring further around the insertion point
    if (G.Rivals) { G.Rivals.next(); G.Rivals.draftAtStart(s.run); }   // Slice 3 §7: this run's pre-rolled rival; the echo draft of the deployed squad
    s.runCount++;
    s.loadout = U.clone(lo); s.loadout.zone = zone;
    X.markSeen();
    X.log(`Expedition ${s.runCount} begins in ${G.State.bodyTitle(body)}, ${DATA.zones.list[zone].name}. Seed ${seed}.`);
    if (freePack) { s.run.freeBackpack = freePack.uid; X.log(`No backpack: the outpost hands you a ${DATA.items.bases[freePack.base].name} (free).`, "good"); }
    else if (gear.backpack && !(lo.gear || {}).backpack) X.log(`You grab your ${DATA.items.bases[gear.backpack.base].name} from the stash.`);
    for (const n of X.unarmedUnits(lo, gear)) X.log(`${n} is unarmed: bare fists.`, "warn");
    // a zone whose insertion point is a location (Zone B: B1) rolls its arrival there (ASSUMPTION)
    const insNode = s.maps[zone].nodes[ins];
    if (G.Map.loc(insNode)) X.arrive(insNode, false);
    G.State.save();
    return null;
  };

  X.log = function (msg, cls) { if (run()) { run().log.push(msg); if (run().log.length > 200) run().log.shift(); } G.log(msg, cls); };
  X.markSeen = function () { const m = G.Zones.map(); for (const nid in m.nodes) if (X.visible(nid)) G.state.everSeen[nid] = true; if (G.Scout) G.Scout.around(); };   // Addendum A2: scouting rolls
  X.current = () => (run() ? run().queue[0] : null);
  X.push = (step, front) => { if (front) run().queue.unshift(step); else run().queue.push(step); };
  X.next = function () { run().queue.shift(); G.State.save(); };

  // ---------- movement ----------
  X.canMoveTo = function (nid) {
    const r = run();
    if (!r || r.queue.length) return false;
    if (X.immobile()) return false;
    const map = G.Zones.map();
    return G.Map.neighbors(map, r.loc).includes(nid) && nid !== map.insertion;
  };

  X.moveTo = function (nid) {
    if (!X.canMoveTo(nid)) return false;
    X.enterNode(nid, {});
    return true;
  };
  // A move (map click) or a passage crossing (opts.noMoveHeat: the crossing's own Heat was already added)
  X.enterNode = function (nid, opts) {
    const r = run(), node = G.Zones.node(nid);
    if (X.dropBagsGone) X.dropBagsGone(r.loc);   // Slice 5 §C: a dead teammate's pack left behind is gone
    r.prevLoc = { zone: r.zone, nid: r.loc };   // Break away returns you here
    r.moves++; r.loc = nid; r.view = "map";
    if (!opts.noMoveHeat) X.addHeat(CFG().heat.perMove, "move");
    if (!opts.noMoveHeat) { const ch = X.carriedResHeat(); if (ch) X.addHeat(ch, "relic"); }   // Slice 3 §11: Relic Tech +1 per move per unit
    // XP: Athletics per move, Hauling per kg carried
    const bref = { kind: "body", body: X.body() };
    G.State.giveXp(bref, "athletics", CFG().leveling.xp.athleticsPerMove);
    G.State.giveXp(bref, "hauling", X.carried() * CFG().leveling.xp.haulingPerMovePerKg);
    const first = !r.visited[nid];
    r.visited[nid] = true; X.markSeen();
    X.log(`→ ${G.Map.label(node)} (Heat ${r.heat}, ${X.heatTier().name})`);
    // distress countdown (same run): every move that doesn't reach the town uses up one of its remaining moves
    if (G.state.world.hollow_creek === "ignored" && r.distressLeft > 0 && node.loc !== "hollow_creek") {
      r.distressLeft--;
      if (r.distressLeft <= 0) {
        G.state.world.hollow_creek = "fallen"; X.log("📻 Hollow Creek has gone silent. Scavengers are moving in.", "radio");
        const hc = G.Map.nodeOfLoc(G.state.maps.a, "hollow_creek"), site = hc && X.site(hc.id), F = DATA.map.locations.hollow_creek.distress.fallen;
        if (site) { // already generated this run: the holding gate goes quiet and the salvage appears
          for (const o of site.objects) if (o.kind === "event" && !o.done) o.done = true;
          X.addSearchObject(site, F.container.type, { name: F.container.name, bonusItems: F.container.bonusItems, rarityBonus: F.container.rarityBonus, salvage: true });
        }
      }
    }
    X.arrive(node, !first);
    if (G.Hunters && run()) G.Hunters.afterMove({ passage: !!opts.passage });   // Slice 3 §4b: spawn roll / the pack moves 1 node
    // radio: the distress call is a "Crackling radio" object in the location you reach (Zone A only)
    if (G.state.world.hollow_creek === "pending" && !r.distressFired && r.moves >= CFG().expedition.distressTriggerAfterMoves && r.zone === "a" && X.site(nid)) {
      r.distressFired = true;
      X.addEventObject(X.site(nid), "distress_hollow_creek", { room: 0, perRun: true });
      X.log("📻 A radio crackles somewhere in here: a distress call from Hollow Creek!", "radio");
    }
    G.State.save();
    return true;
  };

  X.addHeat = function (n, why) {
    const r = run(); const before = X.heatTier(r.heat).name, h0 = r.heat;
    r.heat = U.clamp(r.heat + n, 0, CFG().heat.max);
    if (r.heat !== h0) { r.heatBy = r.heatBy || {}; r.heatBy[why || "other"] = (r.heatBy[why || "other"] || 0) + (r.heat - h0); }
    const after = X.heatTier(r.heat).name;
    if (after !== before) X.log(`Heat ${r.heat}: now ${after}!`, "heat");
  };

  // Tutorial overrides (DATA.config.tutorial): only while the tutorial is running
  X.tutorialOn = () => !G.state.tutorialDone && !!(CFG().tutorial && CFG().tutorial.enabled);
  X.extractionDef = function (node) {
    const loc = G.Map.loc(node); if (!loc || !loc.extraction) return null;
    const o = X.tutorialOn() && CFG().tutorial.extraction && CFG().tutorial.extraction[node.loc];
    return o ? Object.assign({}, loc.extraction, o) : loc.extraction;
  };
  X.enemyBudget = function (node, mult) {
    const E = CFG().enemies, r = run();
    const T = X.tutorialOn() ? CFG().tutorial : null;
    let tut = 1;
    if (T) {
      const byLoc = (T.enemyBudgetMultByLoc || {})[node.loc];
      if (byLoc != null) tut = byLoc;
      else {
        const cap = T.enemyBudgetMultBelowTier && CFG().heat.thresholds.find((x) => x.name === T.enemyBudgetMultBelowTier);
        tut = (cap && r.heat >= cap.min) ? (T.enemyBudgetMultAtOrAbove ?? 1) : (T.enemyBudgetMult ?? 1);
      }
    }
    const locMult = (G.Map.loc(node) || {}).enemyBudgetMult ?? 1;   // per-location, always (not a tutorial value)
    const sq = E.squadScale, extra = sq && !T && (!sq.zones || sq.zones.includes(r.zone || "a")) ? 1 + (r.squad || []).length - (sq.base ?? 3) : 0;
    const squadMult = extra > 0 ? Math.min(sq.maxMult ?? Infinity, 1 + (sq.perExtra || 0) * extra) : 1;   // capped (follow-up: max x2.0)   // Slice 3 §11: bigger squads, bigger fights
    const zoneMult = (DATA.zones.list[r.zone || "a"] || {}).enemyBudgetMult ?? 1;   // Slice 3 §11: Zone B enemy budgets
    return ((E.budgetByTier[node.tier] || 3) + r.moves * E.budgetPerDepth) * X.heatTier().budgetMult * (mult || 1) * tut * locMult * squadMult * zoneMult;
  };

  // X.arrive, sites, searches: js/site.js

  X.takeItem = function (step, idx) {
    const it = step.items.splice(idx, 1)[0]; if (it) run().bag.items.push(it);
  };
  X.takeRes = function (step, k) { const r = run(); r.bag.res[k] = (r.bag.res[k] || 0) + step.res[k]; delete step.res[k]; };
  X.takeAll = function (step) { while (step.items.length) X.takeItem(step, 0); for (const k of Object.keys(step.res)) X.takeRes(step, k); };
  X.dropItem = function (uid) { const r = run(); const i = r.bag.items.findIndex((x) => x.uid === uid); if (i >= 0) { const it = r.bag.items.splice(i, 1)[0]; X.log(`Dropped ${G.Items.name(it)}.`); } };
  X.dropRes = function (k, n) { const r = run(); r.bag.res[k] = Math.max(0, (r.bag.res[k] || 0) - n); };
  X.equipFromBag = function (uid) {
    const r = run(); const i = r.bag.items.findIndex((x) => x.uid === uid); if (i < 0) return;
    const it = r.bag.items[i], slot = G.Items.base(it.base).slot;
    r.bag.items.splice(i, 1);
    if (r.gear[slot]) r.bag.items.push(r.gear[slot]);
    const oldMax = G.Battle.unitFromBody(X.body(), r.gear, {}).maxHp;
    r.gear[slot] = it;
    const newMax = G.Battle.unitFromBody(X.body(), r.gear, {}).maxHp;
    r.bodyHp = Math.max(1, Math.min(newMax, r.bodyHp + Math.max(0, newMax - oldMax)));
  };
  X.unequip = function (slot) { const r = run(); if (r.gear[slot]) { r.bag.items.push(r.gear[slot]); delete r.gear[slot]; const m = G.Battle.unitFromBody(X.body(), r.gear, {}).maxHp; r.bodyHp = Math.min(r.bodyHp, m); } };
  X.toPouch = function (uid) {
    const r = run(); const i = r.bag.items.findIndex((x) => x.uid === uid); if (i < 0) return "Not in bag.";
    const it = r.bag.items[i];
    if (G.Items.isQuest(it)) return "Quest items can't go in the Secure Pouch.";
    if (r.pouch.length >= G.Outpost.pouchSlots()) return "Secure Pouch is full.";
    const used = r.pouch.reduce((t, p) => t + X.pouchEntryKg(p), 0);
    if (used + G.Items.weight(it) > G.Outpost.pouchMaxKg() + 1e-9) return `Too heavy for the pouch (max ${G.Outpost.pouchMaxKg()} kg).`;
    r.bag.items.splice(i, 1); r.pouch.push({ item: it }); return null;
  };
  X.resToPouch = function (k) {
    const r = run(); if (r.pouch.length >= G.Outpost.pouchSlots()) return "Secure Pouch is full.";
    const used = r.pouch.reduce((t, p) => t + X.pouchEntryKg(p), 0);
    const n = Math.min(r.bag.res[k] || 0, Math.floor((G.Outpost.pouchMaxKg() - used + 1e-9) / DATA.items.resources[k].kgPerUnit));
    if (n <= 0) return "Nothing fits.";
    r.bag.res[k] -= n; r.pouch.push({ res: k, n }); return null;
  };
  X.fromPouch = function (i) { const r = run(); const p = r.pouch.splice(i, 1)[0]; if (!p) return; if (p.item) r.bag.items.push(p.item); else r.bag.res[p.res] = (r.bag.res[p.res] || 0) + p.n; };

  X.maxBodyHp = () => G.Battle.unitFromBody(X.body(), run().gear, {}).maxHp;
  X.damageBody = function (pct) {
    const r = run(), max = X.maxBodyHp();
    r.bodyHp -= max * pct / 100;
    X.log(`You take ${Math.round(max * pct / 100)} damage.`, "bad");
    if (r.bodyHp <= 0) { r.bodyHp = 0; X.die("Died from injuries."); }
  };

  // Out-of-combat Med Supply use: Field heal roll (60 + Medicine/2); fail heals 25%.
  X.useMed = function (target) { // target: 'body' | squad index
    const r = run(); if (!(r.bag.res.med > 0)) return "No Med Supplies in your bag.";
    const R = CFG().rolls;
    const calm = X.body().quirks.includes("heals_cant_fail");
    const chance = calm ? 100 : U.clamp(R.fieldHealBase + G.Skills.level(G.state.mind.skills, "medicine") / R.fieldHealSkillDiv, R.hitMin, R.hitMax);
    const ok = G.rng() * 100 < chance;
    r.bag.res.med--;
    G.State.giveXp({ kind: "body", body: X.body() }, "medicine", CFG().leveling.xp.fieldHeal);
    let max, name;
    if (target === "body") { max = X.maxBodyHp(); name = X.body().name; }
    else { const s = r.squad[target]; max = G.Battle.unitFromGrunt(s.g).maxHp; name = G.Allies.name(s.g); }
    const amt = max * CFG().expedition.medHealPct / 100 * (ok ? 1 : R.fieldHealFailMult);
    if (target === "body") r.bodyHp = Math.min(max, r.bodyHp + amt); else { const s = r.squad[target]; if (s.hp <= 0) return "They're dead."; s.hp = Math.min(max, s.hp + amt); }
    const msg = `Field heal on ${name}: ${ok ? "success" : "fumbled"} (${Math.round(chance)}% chance), +${Math.round(amt)} HP.`;
    X.log(msg); G.State.save(); return msg;
  };

  X.spendGrunt = function () {
    const r = run(); const alive = r.squad.filter((s) => s.hp > 0);
    if (!alive.length) return "No Grunt to send.";
    const s = alive[0];
    const nm = G.Allies.name(s.g);
    if (G.rng.chance(DATA.map.gruntSpendDeathChance)) { s.hp = 0; s.died = { where: r.loc, cause: "scout" }; X.log(`${nm} went ahead and didn't come back.`, "bad"); return `${nm} auto-passed the check but died doing it.`; }
    return `${nm} auto-passed the check and made it back.`;
  };

  // ---------- events ----------
  X.eventDef = (step) => DATA.events[step.eventId];
  // option text with its up-front Heat (option-level `heat`, Megan's playtest) so the player takes it knowingly
  X.optionLabel = (opt) => opt.label + (opt.heat && !/Heat/.test(opt.label) ? ` (+${opt.heat} Heat)` : "");
  X.optionChance = function (opt) {
    if (!opt.check) return null;
    return G.Checks.compute(opt.check.skill, opt.check.dc, X.members(), X.gearItems());
  };
  // returns { texts:[], roll } ; queues follow-up steps (battle, loot) at the FRONT after this event
  X.resolveEvent = function (step, optIdx, useGrunt) {
    const ev = X.eventDef(step), opt = ev.options[optIdx], r = run();
    r.stats.events++;
    let effects, roll = null, texts = [];
    if (opt.heat) { X.addHeat(opt.heat, "bigEvent"); texts.push(`+${opt.heat} Heat`); }
    if (opt.check) {
      if (useGrunt && opt.gruntSpendable) { texts.push(X.spendGrunt()); effects = opt.outcomes.success; roll = { grade: "success", text: "Grunt sent ahead: automatic success." }; }
      else {
        const info = X.optionChance(opt); roll = G.Checks.roll(info, null, "event");
        X.log(roll.text, "check");
        const o = opt.outcomes;
        effects = o[roll.grade] || (roll.grade === "crit" ? o.success : roll.grade === "badFail" ? o.fail : o.fail) || [];
      }
    } else effects = opt.effects;
    X.next(); // remove the event step before queueing follow-ups
    const out = X.applyEffects(effects, step);
    texts = texts.concat(out.texts);
    return { roll, texts };
  };

  // Effects run in order. A battle effect queues a battle step and defers the remaining effects until it's won.
  X.applyEffects = function (effects, ctxStep) {
    const r = run(), texts = [], front = [];
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      if (!run() || G.state.run !== r) break; // died
      if (e.text) texts.push(e.text);
      if (e.heat) { X.addHeat(e.heat, e.heat >= 10 ? "bigEvent" : "event"); texts.push(`${e.heat > 0 ? "+" : ""}${e.heat} Heat`); }
      if (e.res) { for (const k in e.res) { r.bag.res[k] = (r.bag.res[k] || 0) + e.res[k]; texts.push(`+${e.res[k]} ${DATA.items.resources[k].name}`); } }
      if (e.lore) { if (!G.state.lore.includes(e.lore)) G.state.lore.push(e.lore); texts.push("Lore: " + DATA.lore[e.lore]); }
      if (e.damagePct) X.damageBody(e.damagePct);
      if (e.gruntsJoin) { r.gruntsJoin += e.gruntsJoin; texts.push(`+${e.gruntsJoin} recruit(s) will join if you extract`); }
      if (e.claimBody) { const b = G.State.rollHumanBody(G.rng); r.claimedBodies.push(b); texts.push(`Claimed: ${G.State.bodyTitle(b)} (arrives at the Body Lab if you extract)`); }
      if (e.setWorld) Object.assign(G.state.world, e.setWorld);
      if (e.distressCountdown) { const l = DATA.map.locations[e.distressCountdown]; r.distressLeft = (l.distress && l.distress.holdMoves) || 0; texts.push(`${l.name} holds for ${r.distressLeft} more moves.`); }
      if (e.travelTo) {
        const n = G.Map.nodeOfLoc(G.Zones.map(), e.travelTo);
        if (n) { r.loc = n.id; r.visited[n.id] = true; X.markSeen(); const site = X.ensureSite(n); site.visitSearches = 0; site.visits++; r.view = "site"; texts.push(`You arrive at ${G.Map.label(n)}.`); }
      }
      if (e.hiddenContainer) { const site = X.site(); if (site) { X.addSearchObject(site, "crate", { name: "Hidden stash" }); texts.push("A hidden stash is now searchable here."); } }
      if (e.payKg) texts.push(X.payKg(e.payKg));
      if (e.revealFog) texts.push(X.revealFog(e.revealFog));
      if (e.loot) {
        const n = X.node(); const ilvl = X.itemLevel(G.Map.loc(n) ? n : { tier: 1 });
        const items = []; for (let k = 0; k < e.loot.rolls; k++) items.push(G.Items.rollLoot(G.rng, ilvl, X.rarityBonus() + (e.loot.rarityBonus || 0)));
        front.push({ type: "container", def: { id: "loot", name: "Loot" }, items, res: {}, opened: true, nid: r.loc, title: "Loot" });
      }
      if (e.battle) {
        front.push({ type: "battle", family: e.battle.family, budgetMult: e.battle.budgetMult, defense: e.battle.defense, nid: r.loc, why: "Battle!", after: effects.slice(i + 1) });
        break;
      }
    }
    if (!run() || G.state.run !== r) return { texts };
    for (let k = front.length - 1; k >= 0; k--) X.push(front[k], true);
    if (texts.length) X.log(texts.join(" · "));
    G.State.save();
    return { texts };
  };

  // lift the fog on the n nearest unseen locations (graph distance from you)
  X.revealFog = function (n) {
    const r = run(), map = G.Zones.map(), dist = { [r.loc]: 0 }, q = [r.loc], got = [];
    while (q.length && got.length < n) {
      const x = q.shift();
      for (const y of G.Map.neighbors(map, x)) if (dist[y] == null) { dist[y] = dist[x] + 1; q.push(y); if (!X.visible(y) && G.Map.loc(map.nodes[y])) got.push(y); if (got.length >= n) break; }
    }
    r.revealed = r.revealed || {}; for (const y of got) r.revealed[y] = true; X.markSeen();
    return got.length ? `Fog lifted on ${got.map((y) => G.Map.label(map.nodes[y])).join(", ")}.` : "Nothing new to see.";
  };
  X.payKg = function (kg) {
    const r = run(); let paid = 0; const taken = [];
    // outlaws take the most valuable-looking items first (rarity, then ilvl) — ASSUMPTION
    const order = { yellow: 3, blue: 2, white: 1, grey: 0 };
    r.bag.items.sort((a, b) => (order[b.rarity] - order[a.rarity]) || b.ilvl - a.ilvl);
    while (paid < kg && r.bag.items.length) { const it = r.bag.items.shift(); paid += G.Items.weight(it); taken.push(G.Items.name(it)); }
    for (const k of Object.keys(r.bag.res)) { while (paid < kg && r.bag.res[k] > 0) { r.bag.res[k]--; paid += DATA.items.resources[k].kgPerUnit; } }
    return paid > 0 ? `Paid ${U.fmt1(paid)} kg: ${taken.join(", ") || "resources"}` : "You had nothing to pay with.";
  };

  X.resolveMessage = function (step) { X.next(); if (step.effects) X.applyEffects(step.effects, step); };
  X.closeContainer = function () { const st = X.current(); if (st && st.type === "container") X.storeLeftovers(st); X.next(); };

  // ---------- battles ----------
  X.buildBattle = function (step, rollMath) {
    if (G.Difficulty) G.Difficulty.snapBattle();   // Slice 4 §H: Casual's Retry fight goes back to here
    const r = run(), node = X.node(step.nid || r.loc);
    const allies = [G.Battle.unitFromBody(X.body(), r.gear, { carryPct: X.carryPct(), hp: r.bodyHp })];
    r.squad.forEach((s, i) => { if (s.hp > 0) { const u = G.Battle.unitFromGrunt(s.g, s.hp); u.squadIdx = i; allies.push(u); } });
    const t = X.heatTier();
    const budget = X.enemyBudget(node, step.budgetMult);
    const elites = t.eliteUnits ? DATA.enemies.elite.count : 0;
    const setup = { allies, family: step.family, rollMath };
    if (step.defense && step.extraction) {
      const ex = step.extraction;
      setup.mode = "defense"; setup.surviveSec = ex.surviveSec;
      setup.enemies = G.Battle.buildEnemyGroup(G.rng, step.family, budget * ex.waveBudgetMult, elites);
      setup.waves = []; for (let w = 0; w < ex.waves - 1; w++) setup.waves.push(G.Battle.buildEnemyGroup(G.rng, step.family, budget * ex.waveBudgetMult, 0));
    } else if (step.family === "rivals" && step.rival && G.Rivals) { setup.enemies = []; setup.enemyUnits = G.Rivals.units(step.rival); if (step.freeze) setup.freeze = step.freeze; }   // Slice 3 §7 snapshot
    else if (step.family === "hunters" && G.Hunters) { setup.enemies = G.Hunters.packUnits(step.pack || "Hunted"); setup.ambush = !!step.ambush; }   // fixed packs
    else if (step.enemies) setup.enemies = step.enemies.map((id) => ({ id }));   // debug / screenshots: an explicit unit list
    else setup.enemies = G.Battle.buildEnemyGroup(G.rng, step.family, budget, elites);
    const b = G.Battle.create(setup);
    b.escapable = true; b.pack = step.pack || null; b.nid = step.nid || r.loc;   // Break away (js/escape.js)
    const used = G.Workbench ? G.Workbench.applyAmmo(r, b.units) : null;   // Slice 3 §9: 1 pack per battle, every gun in the squad
    if (used) { b.ammoUsed = used; b.log.push(`${G.Items.base(used).name}: ${G.Items.base(used).desc} (${r.ammo.n} pack${r.ammo.n === 1 ? "" : "s"} left)`); X.log(`Loaded ${G.Items.base(used).name} (${r.ammo.n} left).`); }
    return b;
  };

  // result: battle object after it ended
  X.finishBattle = function (step, b) {
    const r = run();
    r.stats.battles++;
    if (G.Rivals) G.Rivals.noteLayout(b);   // Slice 3 §7: your placement becomes your echo's layout
    const body = b.units.find((u) => u.rank === "body" && u.side === 0);
    if (b.result === "escape") return X.afterEscape(step, b, body);
    // Ghost Protocol (Slice 3 §3): a battle won with nobody on your side down, Critical or dead gives 0 Heat
    const ghost = G.Perks.ghostProtocol() && b.result === "win" && b.units.every((u) => u.side !== 0 || u.state === "alive");
    if (ghost) X.log("Ghost Protocol: a clean win, no Heat.", "heat");
    else X.addHeat(CFG().heat.perBattle + (b.t > CFG().heat.longBattleSeconds ? CFG().heat.longBattleExtra : 0), "battle");
    if (body.ironWillFired) r.ironWillUsed = true;   // Iron Will: once per expedition
    r.bodyHp = Math.max(0, body.hp);
    const downed = body.state === "downed";
    if (downed && b.result === "win") { r.bodyHp = Math.min(body.maxHp, CFG().battle.downedReviveHp); X.log(`You were downed, but your squad won. You get back up with ${r.bodyHp} HP.`, "bad"); if (G.Injuries) G.Injuries.add(X.body(), "downed"); }   // Slice 3 §10a
    const criticals = [], deadGrunts = [];
    for (const u of b.units) {
      if (u.side !== 0 || u.squadIdx == null) continue;
      const s = r.squad[u.squadIdx];
      s.hp = u.state === "alive" ? Math.max(1, u.hp) : 0;
      if (u.state === "critical") criticals.push(u.squadIdx);
      if (u.state === "dead") { X.log(`${G.Allies.name(s.g)} died.`, "bad"); s.died = { where: X.node(step.nid || r.loc).id, cause: "battle", corpse: u.corpseSprite, gibbed: !!u.gibbed, killer: u.killedBy ? u.killedBy.name : null }; deadGrunts.push(s); }
      if (u.state === "critical") s.died = { where: X.node(step.nid || r.loc).id, cause: "critical" };   // only used if they're lost
    }
    G.Allies.afterBattle(step, b, r);   // Slice 3 §1: kills, history, nickname moments, Field Dresser
    const deadEnemies = b.units.filter((u) => u.side === 1 && u.state === "dead");
    r.stats.kills += deadEnemies.length;
    if (G.Cards) G.Cards.onKills(deadEnemies);   // Slice 4 §D: card drops
    // kill quests count at the kill, before death is handled (Slice 2 §9)
    for (const qid of G.Quests.onKills(r.zone, deadEnemies.map((u) => ({ eid: u.eid, family: u.family })))) {
      const qh = G.Quests.objectiveHeat(qid); if (qh) { X.addHeat(qh, "quest"); X.log(`Quest objective done: ${G.Quests.def(qid).name}. +${qh} Heat`, "heat"); }
    }
    if (G.Radio) for (const bt of G.Radio.onKills(r.zone, deadEnemies.map((u) => ({ eid: u.eid, family: u.family })))) X.log(`Bounty complete: ${G.Radio.text(bt)} Paid to the stockpile.`, "good");   // Slice 3 §10b
    X.next();
    if (b.result !== "win") {
      // carried Critical allies die if your side loses (§9.4)
      if (r.carriedCritical.length) { X.log("The Critical allies you carried didn't make it.", "bad"); r.carriedCritical = []; }
      X.die(downed ? "You were downed and nobody was left standing to win the fight." : body.hp <= 0 ? "Your body was killed in battle." : "Your squad was wiped out.");
      return "loss";
    }
    X.log(`Victory in ${Math.round(b.t)} s.`, "good");
    if (G.Hunters) G.Hunters.afterBattle(step, b);   // the pack is beaten; a dead Captain sets the debuff
    if (step.extraction) { X.extractSuccess(); return "win"; }
    { const ws = X.site(step.nid || r.loc); if (ws) { X.markPicked(ws); ws.everPicked = true; } }   // Slice 3 §12: a won battle picks a place over
    const front = [];
    for (const idx of criticals) front.push({ type: "critical", squadIdx: idx });
    X.addGruntBodies(step.nid || r.loc, deadGrunts);   // a Grunt killed in battle leaves a lootable body holding its gear
    if (step.after) { // continue deferred event effects (e.g. "battle, then loot")
      for (let k = front.length - 1; k >= 0; k--) X.push(front[k], true);
      X.applyEffects(step.after, step);
      return "win";
    }
    // Slice 2: no spoils screen. Every killed enemy is a searchable body; the battle's gear drops sit in human bodies.
    if (step.family === "rivals" && step.rival && G.Rivals) G.Rivals.afterWin(step, b);   // Slice 3 §7: bodies with their gear + the Rival's pack
    else X.addBattleBodies(step.nid || r.loc, deadEnemies);
    for (let k = front.length - 1; k >= 0; k--) X.push(front[k], true);
    G.State.save();
    return "win";
  };

  // Break away (Megan, milestone 5): standing units leave; downed allies are left behind and die; no loot, no corpses;
  // +heat Heat; back to the location you came from; the fight's enemies stay there for the rest of the run
  X.afterEscape = function (step, b, body) {
    const r = run(), BA = CFG().battle.breakAway, nid = step.nid || r.loc, here = X.node(nid), label = G.Map.label(here);
    X.addHeat(BA.heat, "escape");
    r.bodyHp = Math.max(1, body.hp);
    for (const u of b.units) {
      if (u.side !== 0 || u.squadIdx == null) continue;
      const s = r.squad[u.squadIdx];
      if (u.state === "alive") { s.hp = Math.max(1, u.hp); continue; }
      s.hp = 0;
      if (u.state === "dead") { X.log(`${G.Allies.name(s.g)} died.`, "bad"); s.died = { where: here.id, cause: "battle", killer: u.killedBy ? u.killedBy.name : null }; }
      else { s.died = { where: here.id, cause: "left_behind" }; X.log(`${G.Allies.name(s.g)} is left behind at ${label}.`, "bad"); }
    }
    G.Allies.afterBattle(step, b, r);
    if (G.Hunters && G.Hunters.captainMark) G.Hunters.captainMark(b);   // a Captain you killed before breaking away still marks you
    const deadEnemies = b.units.filter((u) => u.side === 1 && u.state === "dead"); r.stats.kills += deadEnemies.length;
    if (G.Cards) G.Cards.onKills(deadEnemies);
    for (const qid of G.Quests.onKills(r.zone, deadEnemies.map((u) => ({ eid: u.eid, family: u.family })))) { const qh = G.Quests.objectiveHeat(qid); if (qh) X.addHeat(qh, "quest"); }
    // the fight stays here: the enemies still standing wait at this location (this run). A Hunter pack keeps its own state.
    const site = X.site(nid), left = b.units.filter((u) => u.side === 1 && (u.state === "alive" || u.state === "retreating"));
    if (site && step.family !== "hunters") {
      const again = Object.assign(U.clone(Object.assign({}, step, { rival: null })), { rival: step.rival || null, why: "They're still here.", escapedFrom: true });
      if (step.family !== "rivals" && !step.defense) again.enemies = left.map((u) => u.eid).filter(Boolean);
      site.escaped = { run: G.state.runCount, step: again };
    }
    r.queue = [];   // whatever was waiting in there stays there
    r.stats.escapes = (r.stats.escapes || 0) + 1;
    const back = r.prevLoc && G.state.maps[r.prevLoc.zone] && G.state.maps[r.prevLoc.zone].nodes[r.prevLoc.nid] ? r.prevLoc : { zone: r.zone, nid: r.loc };
    r.zone = back.zone; r.loc = back.nid; r.view = "map";
    X.log(`You broke away from ${label} and fell back to ${G.Map.label(X.node(r.loc))}. +${BA.heat} Heat. No loot.`, "bad");
    G.State.save();
    return "escape";
  };

  // §9.4 Critical ally choice: heal / stabilize / carry / leave
  X.resolveCritical = function (step, choice) {
    const r = run(), s = r.squad[step.squadIdx], cc = DATA.bodies.criticalCare, max = G.Battle.unitFromGrunt(s.g).maxHp;
    const med = r.bag.res.med || 0;
    if (choice === "heal") { if (med < cc.healMed) return "Not enough Med Supplies."; r.bag.res.med -= cc.healMed; s.hp = max * cc.healHpPct / 100; X.log(`${G.Allies.name(s.g)} is back in action.`); }
    else if (choice === "stabilize") { if (med < cc.stabilizeMed) return "Not enough Med Supplies."; r.bag.res.med -= cc.stabilizeMed; s.hp = max * cc.stabilizeHpPct / 100; X.log(`${G.Allies.name(s.g)} is stabilized.`); if (G.Injuries) G.Injuries.add(s.g, "stabilized"); }   // Slice 3 §10a: stabilized, not healed
    else if (choice === "carry") { s.hp = 0; s.carried = true; r.carriedCritical.push(s.g.uid); X.log(`You carry ${G.Allies.name(s.g)} (${cc.carryKg} kg).`); }
    else { s.hp = 0; s.left = true; X.log(`You leave ${G.Allies.name(s.g)} behind.`, "bad"); X.addGruntBodies((s.died && s.died.where) || r.loc, [s]); }   // Slice 5 §C: they die here: body + pack
    X.next(); return null;
  };

  // ---------- extraction ----------
  X.canExtract = function () {
    const r = run(); if (!r || r.queue.length) return false;
    const node = X.node();
    return X.extractionOpen(node);
  };
  X.extract = function () {
    if (!X.canExtract()) return { ok: false, text: "No open extraction here." };
    const r = run(), node = X.node(), ex = X.extractionDef(node);
    if (ex.type === "free") { X.extractSuccess(); return { ok: true, text: "Extracted." }; }
    if (ex.type === "check") {
      const info = G.Checks.compute(ex.skill, ex.dc, X.members(), X.gearItems()); const roll = G.Checks.roll(info, null, "extract");
      X.log(roll.text, "check");
      if (G.Checks.isSuccess(roll.grade)) { X.extractSuccess(); return { ok: true, roll, text: roll.text + " — the engine turns over!" }; }
      if (roll.grade === "badFail" && ex.badFail === "crash") return X.crash(node, ex, roll);   // Slice 5 §A
      if (roll.grade === "badFail" && ex.badFail === "battle") { X.push({ type: "battle", family: G.Map.loc(node).family, budgetMult: 1, nid: node.id, why: "The noise draws attention!" }); return { ok: false, roll, text: roll.text + " — the noise draws attention!" }; }
      X.addHeat(ex.failHeat, "extract"); return { ok: false, roll, text: roll.text + ` — it won't start. +${ex.failHeat} Heat.` };
    }
    if (ex.type === "defense") { X.push({ type: "battle", family: G.Map.loc(node).family, budgetMult: ex.budgetMult != null ? ex.budgetMult : 1, defense: true, extraction: ex, nid: node.id, why: `Hold out for ${ex.surviveSec} s!` }); return { ok: false, text: "Defend the extraction!" }; }
  };

  // Slice 5 §A: a Bad Fail crashes the truck: Heat spike, closed for the rest of the run, no re-roll. (A later "enemies
  // hear loud noises" system can read run.wrecked[nid].loud; nothing listens yet.)
  X.crash = function (node, ex, roll) {
    const r = run(), C = CFG().extraction.crash, heat = ex.crashHeat != null ? ex.crashHeat : ex.failHeat;
    r.wrecked = r.wrecked || {}; r.wrecked[node.id] = { moves: r.moves, loud: true };
    X.addHeat(heat, "extract");
    X.log(`${C.log} +${heat} Heat. ${G.Map.loc(node).name} is closed for this run: find another way out.`, "bad");
    G.State.save();
    return { ok: false, crash: true, roll, text: `${roll.text} — ${C.line} +${heat} Heat.`, line: C.line, sfx: C.sfx, heat };
  };

  X.extractSuccess = function () {
    const s = G.state, r = run();
    const got = [];
    for (const it of Object.values(r.gear)) if (it) s.stash.items.push(it);
    for (const it of r.bag.items) { s.stash.items.push(it); got.push(it); }
    for (const p of r.pouch) { if (p.item) { s.stash.items.push(p.item); got.push(p.item); } else s.stash.res[p.res] = (s.stash.res[p.res] || 0) + p.n; }
    const resGot = {};
    for (const k in r.bag.res) { if (!r.bag.res[k]) continue; s.stash.res[k] = (s.stash.res[k] || 0) + r.bag.res[k]; resGot[k] = r.bag.res[k]; }
    if (r.ammo && r.ammo.n > 0 && G.Workbench) G.Workbench.addAmmo(r.ammo.base, r.ammo.n);   // leftover packs go back to the stash
    const bounties = G.Radio ? G.Radio.onExtract(r) : [];   // Slice 3 §10b: scouting bounties pay when you get back out
    for (const z of r.pendingUnlocks || []) s.zonesUnlocked[z] = true;
    // squad: dead grunts removed; carried critical allies make it home (Slice 3 §10a: with an injury)
    if (G.Injuries) for (const uid of r.carriedCritical) { const m = r.squad.find((x) => x.g.uid === uid); if (m) G.Injuries.add(m.g, "carried"); }
    if (G.Rivals) G.Rivals.recordEcho(r, "extracted");   // Slice 3 §7: an echo of this squad
    X.settleSquad(true);
    const newGrunts = [];
    for (let i = 0; i < r.gruntsJoin; i++) { const g = G.State.makeGrunt(G.rng); s.grunts.push(g); newGrunts.push(G.Allies.name(g)); }
    // nickname offers for allies who already had one: Keep / Take the new one on the summary
    s.nickOffers = (s.nickOffers || []).concat((r.nickOffers || []).filter((o) => s.grunts.some((g) => g.uid === o.uid))); r.nickOffers = [];
    for (const b of r.claimedBodies) s.bodies.push(b);
    s.extractions++;
    let offer = null;
    // Slice 4 §B: the first extraction no longer rolls the human body offer; the working pod in the cryo annex does (G.Main.claim)
    s.lastResult = { kind: "extracted", items: got.map((i) => ({ name: G.Items.name(i), rarity: i.rarity, ilvl: i.ilvl })), res: resGot, grunts: newGrunts, bodies: r.claimedBodies.map((b) => G.State.bodyTitle(b)),
                     heat: r.heat, moves: r.moves, stats: r.stats, offer: !!offer, xp: r.xpTally || {}, zone: r.zone, nickOffers: s.nickOffers.map((o) => o.uid),
                     ammo: r.ammo ? { base: r.ammo.base, used: r.ammo.used, left: r.ammo.n } : null, bounties: bounties.map((b) => G.Radio.text(b)) };
    if (G.Tut) { const ml = G.Tut.onExtracted(); if (ml) s.lastResult.marta = ml; }   // Slice 4 §A1: "I've got this" + a successful extraction
    X.endRun();
  };

  X.die = function (why) {
    const s = G.state, r = run(); if (!r || r.dead) return;
    r.dead = true;
    const body = X.body();
    const lost = r.bag.items.length + Object.values(r.gear).filter(Boolean).length;
    const kept = [];
    for (const p of r.pouch) { if (p.item) { s.stash.items.push(p.item); kept.push(G.Items.name(p.item)); } else { s.stash.res[p.res] = (s.stash.res[p.res] || 0) + p.n; kept.push(p.n + " " + DATA.items.resources[p.res].name); } }
    // Slice 4 §H: Casual keeps the equipped items and rolls each find; Hardcore loses the body for good
    const DF = G.Difficulty, cas = DF ? DF.onDeath(s, r) : null;
    const lostNow = cas ? cas.foundLost.length : lost;
    const hard = DF && DF.isPermadeath(s, body);   // Hardcore + a human body (the Basic body dies as in Standard)
    const ms = hard ? 0 : G.State.restoreMs(body);
    body.restoreUntil = ms ? G.now() + ms : 0;
    if (DF) DF.snap = null;
    // survivors head home; each carried Critical ally makes a Survival check (party best) or dies — simplified: they die (carried allies lost with the body)
    if (G.Rivals) G.Rivals.recordEcho(r, "died");
    X.settleSquad(false);
    s.deaths++;
    const next = hard ? DF.permadeath(s, body) : null;   // after the echo / squad (they read the body)
    s.lastResult = { kind: "death", why, lost: lostNow, kept, restoreMs: ms, body: body.name, difficulty: DF ? DF.id(s) : "standard", casual: cas, permadeath: hard ? { next } : null, heat: r.heat, moves: r.moves, stats: r.stats, xp: r.xpTally || {}, zone: r.zone,
                     ammo: r.ammo ? { base: r.ammo.base, used: r.ammo.used, left: 0, lost: r.ammo.n } : null };
    X.log("☠ " + why, "bad");
    if (cas) X.log(`Casual: your equipped gear came home${cas.foundKept.length || Object.keys(cas.resKept).length ? "; some finds too" : ""}.${cas.foundLost.length ? " Lost: " + cas.foundLost.join(", ") + "." : ""}`, "good");
    if (hard) X.log(`Hardcore: ${body.name} is gone for good. You go on as ${next}.`, "bad");
    X.endRun();
  };

  // Dead Grunts stay dead: their records move to state.fallenGrunts (dead: true, with where / when) for a later memorial.
  // A Grunt's gear is on its body in the location if it fell in battle, otherwise it's lost with it.
  X.settleSquad = function (extracted) {
    const s = G.state, r = run();
    const dead = r.squad.filter((x) => x.hp <= 0 && !(extracted && r.carriedCritical.includes(x.g.uid)));
    for (const m of dead) {
      const g = s.grunts.find((x) => x.uid === m.g.uid) || m.g; if (!s.grunts.includes(g) && s.fallenGrunts.some((x) => x.uid === g.uid)) continue;
      G.State.repairGrunt(g, s.runCount);
      g.dead = true; g.diedRun = s.runCount; g.diedAt = m.died ? G.Map.label(G.Zones.node(m.died.where)) : G.Map.label(X.node(r.loc)); g.gear = G.State.emptyGear(g);
      g.deathCause = G.Allies.causeText(m, extracted);   // Memorial Wall: "Killed by an Elite Hound at Hound Warrens, run 12"
      G.Allies.log(g, "died", g.deathCause + ".", { where: g.diedAt, cause: (m.died && m.died.cause) || (m.left ? "left behind" : "lost") });
      s.fallenGrunts.push(g);
    }
    const deadIds = dead.map((x) => x.g.uid);
    s.grunts = s.grunts.filter((g) => !deadIds.includes(g.uid));
    G.Allies.afterRun(extracted, r.squad.map((m) => s.grunts.find((g) => g.uid === m.g.uid)).filter(Boolean));   // runs / extractions / old_hand
  };

  X.endRun = function () {
    const s = G.state;
    // world moves on between runs (§2.3)
    const w = s.world;
    X.worldTick();   // Slice 3 §12: restock clock, battle bodies and gore removed
    if (w.hollow_creek === "ignored" || w.hollow_creek === "fallen") w.hollow_creek = "aftermath"; // world advances per run (unchanged)
    else if (w.hollow_creek === "saved" || w.hollow_creek === "allied_visited") w.hollow_creek = "allied";
    // tutorial Grunts are free: top the roster up to the starting count while the tutorial is on. After it, dead Grunts
    // stay dead until you recruit (G.Outpost.recruit, config.grunts.recruitCost).
    if (!s.tutorialDone) while (s.grunts.filter((g) => g.rank === "grunt").length < CFG().deploy.startingGrunts) {
      const i = s.grunts.filter((g) => g.rank === "grunt").length, g = G.State.makeGrunt(G.rng); s.grunts.push(g);
      if (G.GruntGear) G.GruntGear.giveStartKit(g, i);   // Slice 4 §F: the tutorial's free top-ups come with the starting kit
    }
    // ASSUMPTION: during the tutorial, re-issue the starter gear if you lost it, so the Basic body is never soft-locked with bare fists
    if (!s.tutorialDone && CFG().deploy.tutorialReissueStarterGear) {
      const sg = DATA.items.startingGear;
      for (const slot in sg) if (!s.stash.items.some((i) => G.Items.base(i.base).slot === slot)) { const it = G.Items.make(sg[slot].base, sg[slot].rarity, sg[slot].ilvl, G.rng); s.stash.items.push(it); s.loadout.gear[slot] = it.uid; }
    }
    if (s.tutorialEnds) { s.tutorialDone = true; delete s.tutorialEnds; G.log(`Tutorial complete. Deploy score is now ${G.State.deployScore()}. Recruit more Grunts at the Recruitment lot.`, "good"); }   // Vixie: after the claim run's top-ups / re-issue
    G.Allies.rerollCandidates();   // Slice 3 §1: the Recruitment lot's 3 candidates reroll after every run
    if (G.Injuries) G.Injuries.onRunEnd();   // Slice 3 §10a: untreated injuries heal after 3 runs (Infirmary L2: 2)
    if (G.Radio) G.Radio.onRunEnd();         // Slice 3 §10b: the bounty board refreshes every 2 runs
    if (G.Rivals) G.Rivals.onRunEnd();       // Slice 3 §7: the next run's rival is pre-rolled (Radio intel reads it)
    s.run = null;
    // prune loadout references that no longer exist
    const lo = s.loadout;
    for (const k in lo.gear) if (!s.stash.items.some((i) => i.uid === lo.gear[k])) delete lo.gear[k];
    lo.pouch = (lo.pouch || []).filter((p) => !p.uid || s.stash.items.some((i) => i.uid === p.uid));
    lo.grunts = lo.grunts.filter((id) => s.grunts.some((g) => g.uid === id));
    G.State.save();
  };

  X.chooseHumanBody = function (idx) {
    const s = G.state; if (!s.humanOffer) return;
    const b = s.humanOffer[idx]; s.bodies.push(b); s.humanOffer = null;
    s.loadout.bodyId = b.uid;
    // Vixie: the tutorial's protections stay on until the run the pod was claimed in ends (extraction or death):
    // s.tutorialEnds is set by G.Main.claim, X.endRun turns it into tutorialDone. Outside a run it ends right away.
    if (s.run) { s.tutorialEnds = true; G.log(`New body: ${G.State.bodyTitle(b)}. The tutorial ends when this expedition does.`, "good"); }
    else { s.tutorialDone = true; delete s.tutorialEnds; G.log(`Tutorial complete. New body: ${G.State.bodyTitle(b)}. Deploy score is now ${G.State.deployScore()}. Recruit more Grunts at the Recruitment lot.`, "good"); }
    G.State.save();
  };

  // Debug: restore the snapshot taken at expedition start and start again with the same loadout
  X.restart = function () {
    const r = run(); if (!r) return;
    const lo = G.state.loadout, zone = r.zone; G.state = JSON.parse(r.snapshot); G.state.runCount = Math.max(0, G.state.runCount);
    return X.start(lo, undefined, zone);
  };
})(typeof window !== "undefined" ? window : globalThis);
