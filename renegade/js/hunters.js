// Slice 3 §4b Hunters on the zone map: spawn rolls at Hunted+, the pack token (visible through fog) chasing you one node
// per move, passages shaking them off, the encounter (Fight / Hide / Bait), fixed packs, the Captain debuff.
// Logic only (the UI draws the token and the encounter). Numbers: DATA.enemies.hunters.
(function (root) {
  const G = root.G, U = G.Util;
  const H = G.Hunters = {};
  const D = () => DATA.enemies.hunters;
  const X = () => G.Exp;
  const run = () => G.state.run;

  H.state = function (r) { r = r || run(); r.hunt = r.hunt || { pack: null, cooldown: 0, rolls: [] }; return r.hunt; };
  H.active = () => { const r = run(); return !!(r && r.hunt && r.hunt.pack); };
  // Hunter's Garb (3) on your body: the pack moves only every 2nd move
  H.slowEvery = function () { const r = run(); return r ? G.Items.setFlag(Object.values(r.gear).filter(Boolean), "hunterSlowEvery") || 0 : 0; };
  H.tierName = () => X().heatTier().name;
  H.canRoll = () => X().tierAtLeast(D().minTier);
  H.spawnPct = function () { const t = H.tierName(), P = D().spawnPct; return P[t] != null ? P[t] : t === "Manhunt" ? P.Marked : 0; };

  // graph distances from a node on the current zone map
  H.dists = function (from) {
    const map = G.Zones.map(), dist = { [from]: 0 }, q = [from];
    while (q.length) { const x = q.shift(); for (const y of G.Map.neighbors(map, x)) if (dist[y] == null) { dist[y] = dist[x] + 1; q.push(y); } }
    return dist;
  };
  // next node on a shortest path from `from` toward `to`
  H.stepToward = function (from, to) {
    if (from === to) return from;
    const dt = H.dists(to), map = G.Zones.map();
    return G.Map.neighbors(map, from).reduce((best, y) => (dt[y] != null && (best == null || dt[y] < dt[best]) ? y : best), null) || from;
  };

  // called by X.enterNode after you arrive (opts.passage: you crossed a passage this move)
  H.afterMove = function (opts) {
    const r = run(); if (!r) return; const h = H.state(r);
    if (h.pack && opts && opts.passage) { H.shake("You crossed a passage. The Hunters lost your trail."); return; }
    if (h.pack) {
      const p = h.pack; p.moves = (p.moves || 0) + 1;
      if (p.lostFor > 0) { p.lostFor--; X().log(`The Hunters are still searching for you (${p.lostFor} more moves).`, "heat"); return; }
      const se = H.slowEvery(); p.tick = (p.tick || 0) + 1;
      if (se > 1 && p.tick % se !== 0) { X().log("The Hunters hesitate (Hunter's Garb).", "heat"); }
      else { p.trail = (p.trail || []).concat([p.nid]).slice(-3); p.nid = H.stepToward(p.nid, r.loc); }
      if (p.nid === r.loc) H.encounter();
      return;
    }
    if (h.cooldown > 0) { h.cooldown--; return; }
    if (!H.canRoll()) return;
    const pct = H.spawnPct(), roll = G.rng() * 100, hit = roll < pct;
    h.rolls.push({ move: r.moves, pct, roll: Math.floor(roll), hit });
    X().log(`Hunter roll (${H.tierName()}): ${pct}% → rolled ${Math.floor(roll)}: ${hit ? "a pack picks up your trail!" : "no pack."}`, "roll");
    if (hit) H.spawn();
  };

  // a pack 2-3 nodes from you, never at an extraction (or the insertion point)
  H.spawn = function (nid) {
    const r = run(), h = H.state(r), map = G.Zones.map(), [lo, hi] = D().spawnDist;
    if (!nid) {
      const dist = H.dists(r.loc);
      const cand = Object.keys(dist).filter((n) => dist[n] >= lo && dist[n] <= hi && G.Map.loc(map.nodes[n]) && !X().extractionDef(map.nodes[n]) && n !== map.insertion);
      if (!cand.length) { X().log("(No room for a Hunter pack to spawn.)", "roll"); return null; }
      nid = G.rng.pick(cand);
    }
    h.pack = { nid, zone: r.zone, tier: H.tierName(), moves: 0, tick: 0, lostFor: 0, trail: [] };
    h.banner = { text: "You're being tracked.", at: r.moves, shown: false };
    X().log(`⚠ You're being tracked: a Hunter pack at ${G.Map.label(map.nodes[nid])}.`, "bad");
    return h.pack;
  };
  H.shake = function (why) {
    const h = H.state(); h.pack = null; h.cooldown = D().cooldownMoves;
    if (why) X().log(why, "good");
  };

  // the pack reached you: an encounter step at the front of the queue
  H.encounter = function () {
    const r = run(), h = H.state(r); if (!h.pack) return;
    if (r.queue.some((s) => s.type === "hunters")) return;
    const tier = H.tierName() === "Manhunt" ? "Manhunt" : H.tierName() === "Marked" ? "Marked" : "Hunted";
    X().push({ type: "hunters", pack: tier, nid: r.loc }, true);
    X().log("The Hunters have found you!", "bad");
  };
  H.packUnits = function (tier) {
    const t = DATA.config.heat.thresholds.find((x) => x.name === X().heatTier().name), mult = t ? t.budgetMult : 1;
    // design call (milestone 3): the Heat mult scales Hunter damage fully, HP at half strength (scale.hp 0.5: 1 + (mult - 1) / 2)
    // design call (milestone 4): scale 0.25 / 0.25, and a per-pack damage mult (packDmgMult) instead of steep Heat scaling
    const sc = D().scale || { dmg: 1, hp: 1 }, pm = (D().packDmgMult || {})[tier] || 1, dm = (1 + (mult - 1) * sc.dmg) * pm, hm = (1 + (mult - 1) * sc.hp) * ((D().packHpMult || {})[tier] || 1);
    return (D().packs[tier] || D().packs.Hunted).map((id) => ({ id, elite: false, mult: DATA.enemies.units[id].beh && DATA.enemies.units[id].beh.captain ? dm / pm : dm, hpMult: DATA.enemies.units[id].beh && DATA.enemies.units[id].beh.captain ? hm / ((D().packHpMult || {})[tier] || 1) : hm }));   // packDmgMult: not the Captain
  };
  H.hideInfo = () => G.Checks.compute(D().hide.skill, D().hide.dc, X().members(), X().gearItems());
  // choice: fight | hide | bait. Returns { text, battle? }
  H.resolve = function (step, choice) {
    const r = run(), h = H.state(r);
    if (choice === "bait") {
      const alive = r.squad.filter((s) => s.hp > 0); if (!alive.length) return { error: "No Grunt to use as bait." };
      const s = alive[0], nm = G.Allies.name(s.g), roll = G.rng() * 100, dies = roll < D().bait.deathPct;
      X().next();
      if (dies) { s.hp = 0; s.died = { where: r.loc, cause: "bait" }; X().log(`${nm} draws the Hunters off and doesn't come back (${D().bait.deathPct}%: rolled ${Math.floor(roll)}).`, "bad"); }
      else X().log(`${nm} draws the Hunters off and makes it back (${D().bait.deathPct}%: rolled ${Math.floor(roll)}).`, "good");
      if (h.pack) h.pack.lostFor = D().bait.loseMoves;
      G.State.save();
      return { text: dies ? `${nm} didn't make it. The Hunters lose you for ${D().bait.loseMoves} moves.` : `${nm} made it back. The Hunters lose you for ${D().bait.loseMoves} moves.`, died: dies };
    }
    if (choice === "hide") {
      const info = H.hideInfo(), roll = G.Checks.roll(info); X().log(roll.text, "check");
      if (G.Checks.isSuccess(roll.grade)) { X().next(); H.shake("You stay hidden. The Hunters move on."); G.State.save(); return { text: "You stay hidden. They move on.", roll }; }
      X().next(); X().push({ type: "battle", family: "hunters", pack: step.pack, ambush: true, hunters: true, nid: r.loc, why: "They found you: ambush!" }, true); G.State.save();
      return { text: "They found you. The Stalkers strike first!", roll, battle: true };
    }
    X().next(); X().push({ type: "battle", family: "hunters", pack: step.pack, hunters: true, nid: r.loc, why: "Hunters!" }, true); G.State.save();
    return { text: "Fight!", battle: true };
  };

  // after a Hunter battle you won: the pack is beaten (cooldown); killing a Captain sets the debuff
  H.afterBattle = function (step, b) {
    const r = run(); if (!r) return;
    if (step.hunters || step.family === "hunters") { const h = H.state(r); h.pack = null; h.cooldown = D().cooldownMoves; }
    H.captainMark(b);
  };
  // killing a Captain sets "Marked by the Orbitals", won or not (follow-up fix: also when the squad breaks away afterwards)
  H.captainMark = function (b) {
    if (!b.captainKilled || !D().debuff.enabled) return false;
    const d = D().debuff; G.state.debuffs = G.state.debuffs || {}; G.state.debuffs[d.id] = d.runs;
    X().log(`${d.name}: your next ${d.runs} runs start at Heat ${d.startHeat}.`, "bad");
    return true;
  };
  // X.start: "Marked by the Orbitals" makes the run start at Heat 25 and uses one charge
  H.onRunStart = function (r) {
    const d = D().debuff, db = G.state.debuffs || {};
    if (!d.enabled || !(db[d.id] > 0)) return;
    r.heat = Math.max(r.heat, d.startHeat); db[d.id]--; if (db[d.id] <= 0) delete db[d.id];
    X().log(`${d.name}: this run starts at Heat ${d.startHeat}${db[d.id] ? ` (${db[d.id]} more run${db[d.id] > 1 ? "s" : ""})` : ""}.`, "bad");
  };
})(typeof window !== "undefined" ? window : globalThis);
