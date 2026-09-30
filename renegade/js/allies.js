// Slice 3 §1: allies. Traits (effects read by battle.js / expedition.js / site.js), First "Nickname" Last names,
// recruit candidates, nickname moments, promotion to Veteran, the 10-line history log and the Memorial Wall.
// Logic only (no DOM); a toast goes through G.UI when it exists. Numbers live in data/allies.js.
(function (root) {
  const G = root.G, U = G.Util;
  const A = G.Allies = {};
  const D = () => DATA.allies;
  const S = () => G.state;

  // ---------- traits ----------
  A.trait = (id) => D().traits[id];
  A.kind = (id) => (D().traits[id] || {}).kind;
  A.kindColor = (id) => ((D().traitKinds[A.kind(id)] || {}).color || "#ccc");
  // one trait: pick a kind by weight (among kinds with something left), then a trait of that kind uniformly
  A.rollTrait = function (rng, have, kinds) {
    const K = D().traitKinds, left = (k) => Object.keys(D().traits).filter((t) => D().traits[t].kind === k && !have.includes(t));
    const ks = kinds.filter((k) => left(k).length);
    if (!ks.length) return null;
    const tot = ks.reduce((s, k) => s + K[k].weight, 0); let x = rng() * tot, kind = ks[ks.length - 1];
    for (const k of ks) { x -= K[k].weight; if (x < 0) { kind = k; break; } }
    return rng.pick(left(kind));
  };
  // opts: { noNegative, kinds }
  A.rollTraits = function (rng, n, opts, have) {
    opts = opts || {}; const out = (have || []).slice();
    for (let i = 0; i < n; i++) {
      let kinds = opts.kinds || Object.keys(D().traitKinds);
      if (opts.noNegative || out.filter((t) => A.kind(t) === "negative").length >= D().maxNegative) kinds = kinds.filter((k) => k !== "negative");
      const t = A.rollTrait(rng, out, kinds); if (t) out.push(t);
    }
    return out.slice((have || []).length);
  };
  // summed trait effects for a record (or a trait list)
  A.mods = function (gOrTraits) {
    const list = Array.isArray(gOrTraits) ? gOrTraits : (gOrTraits && gOrTraits.traits) || [];
    const m = { acc: 0, hpPct: 0, movePct: 0, asPct: 0, dmgPct: 0, jam: 0, carryKg: 0, disturbPct: 0, healAfterBattlePct: 0, dmgVsFamily: {}, nearBody: [], target: null, flee: null };
    for (const id of list) {
      const t = D().traits[id]; if (!t) continue;
      for (const k of ["acc", "hpPct", "movePct", "asPct", "dmgPct", "jam", "carryKg", "disturbPct", "healAfterBattlePct"]) if (t[k]) m[k] += t[k];
      if (t.dmgVsFamily) for (const f in t.dmgVsFamily) m.dmgVsFamily[f] = (m.dmgVsFamily[f] || 0) + t.dmgVsFamily[f];
      if (t.nearBody) m.nearBody.push(t.nearBody);
      if (t.target) m.target = t.target;
      if (t.flee) m.flee = t.flee;
    }
    return m;
  };
  // squad-wide sums from standing deployed allies (Pack Rat carry, Loudmouth disturbance)
  A.squadSum = function (r, key) {
    let n = 0; for (const m of (r && r.squad) || []) if (m.hp > 0) n += A.mods(m.g)[key] || 0;
    return n;
  };
  A.traitText = (id) => { const t = A.trait(id); return t ? `${t.name} (${D().traitKinds[t.kind].label}): ${t.desc}` : id; };

  // ---------- names ----------
  // g.name holds "First Last"; the nickname goes after the first word
  A.name = function (g) {
    if (!g) return "?";
    const nm = g.name || "", nick = g.nickname; if (!nick) return nm;
    const i = nm.indexOf(" ");
    return i < 0 ? `${nm} "${nick}"` : `${nm.slice(0, i)} "${nick}" ${nm.slice(i + 1)}`;
  };
  A.rankName = (g) => (g.tplKey === "pet" ? ((D().pets || {})[g.petKey] || { name: "Pet" }).name : g.tplKey === "veteran" ? "Veteran" : g.rank === "core" ? "Core ally" : "Grunt");
  A.isVeteran = (g) => g.tplKey === "veteran";

  // ---------- history (newest first, capped) ----------
  const where = (nid) => { try { return nid ? G.Map.label(G.Zones.node(nid)) : null; } catch (e) { return null; } };
  A.log = function (g, what, text, extra) {
    g.history = g.history || [];
    const run = S() ? S().runCount : 0;
    g.history.unshift(Object.assign({ run, what, text: `Run ${run}: ${text}` }, extra || {}));
    g.history.length = Math.min(g.history.length, D().history.max);
  };
  A.lineText = function (h) {
    if (!h) return "";
    if (h.text) return h.text;
    const map = { recruited: "Recruited.", renamed: `Renamed (was ${h.from}).`, died: `Died${h.where ? " at " + h.where : ""}.` };
    return `Run ${h.run || 0}: ${map[h.what] || h.what}`;
  };
  A.lastLine = (g, skipDied) => A.lineText(((g && g.history) || []).find((h) => !skipDied || h.what !== "died"));

  // ---------- recruit candidates ----------
  A.candidates = function () {
    const s = S();
    if (!Array.isArray(s.recruitCands)) A.rerollCandidates();
    return s.recruitCands;
  };
  A.rerollCandidates = function () {
    const s = S(); s.recruitCands = [];
    for (let i = 0; i < D().candidates; i++) s.recruitCands.push(G.State.makeGrunt(G.rng, null, { noNegative: false, candidate: true }));
    return s.recruitCands;
  };
  // hire candidate i: pays config.grunts.recruitCost (G.Outpost.canRecruit); the card leaves the lot until the next reroll
  A.hire = function (i) {
    const O = G.Outpost, why = O.canRecruit(); if (why) return { error: why };
    const c = A.candidates(), g = c[i]; if (!g) return { error: "No such candidate." };
    const cost = O.recruitCost(); for (const r in cost) S().stash.res[r] -= cost[r];
    c.splice(i, 1); delete g.candidate; g.history = []; A.log(g, "recruited", "Recruited.");
    S().grunts.push(g);
    G.log(`Recruited ${A.name(g)} (${Object.entries(cost).map(([r, n]) => n + " " + DATA.resources[r].name).join(" + ")}).`, "good");
    G.State.save();
    return { grunt: g };
  };

  // ---------- Slice 5 §F: pets ----------
  // extracting with a pet item unlocks its template for good (returns the pet def, or null if it already was)
  A.unlockPet = function (it) {
    const id = (G.Items.base(it.base) || {}).pet, P = (D().pets || {})[id]; if (!P) return null;
    const s = S(); s.pets = s.pets || {}; const fresh = !s.pets[id];
    if (fresh) { s.pets[id] = { run: s.runCount }; G.log(`${P.name}: it followed you home. Recruit it at the Recruitment lot.`, "good"); }
    return fresh ? P : null;
  };
  A.petsUnlocked = () => Object.keys(S().pets || {}).filter((id) => (D().pets || {})[id]);
  A.petAlive = (id) => S().grunts.some((g) => g.tplKey === "pet" && g.petKey === id && !g.dead);
  A.canHirePet = function (id) {
    const P = (D().pets || {})[id], s = S(); if (!P || !(s.pets || {})[id]) return "Not unlocked.";
    if (s.run) return "Finish the expedition first.";
    if (A.petAlive(id)) return `Your ${P.name.toLowerCase()} is already on the roster.`;
    if (G.Outpost.gruntCount() >= DATA.config.grunts.rosterCap) return `Roster full (${DATA.config.grunts.rosterCap} Grunts).`;
    const miss = Object.keys(P.cost || {}).filter((r) => (s.stash.res[r] || 0) < P.cost[r]);
    return miss.length ? "Not enough " + miss.map((r) => DATA.resources[r].name).join(", ") + "." : null;
  };
  A.hirePet = function (id) {
    const why = A.canHirePet(id); if (why) return { error: why };
    const P = D().pets[id], s = S(); for (const r in P.cost || {}) s.stash.res[r] -= P.cost[r];
    const g = G.State.makeGrunt(G.rng, Object.assign({ petKey: id }, P)); s.grunts.push(g);
    G.log(`${A.name(g)} the ${P.name.toLowerCase()} joins the roster.`, "good"); G.State.save();
    return { grunt: g };
  };

  // ---------- nicknames ----------
  A.notify = (text) => { if (G.Exp && G.state.run) G.Exp.log(text, "good"); if (G.UI && G.UI.toast) G.UI.toast(text); };
  // an ally earns a nickname: applied at once (toast) if it has none, else offered on the extraction summary
  A.earn = function (g, trig, rng) {
    const T = D().nicknames[trig]; if (!T || !g) return null;
    const pool = T.pool.filter((n) => n !== g.nickname); const nick = (rng || G.rng).pick(pool.length ? pool : T.pool);
    const r = S().run;
    if (!g.nickname) {
      g.nickname = nick; A.log(g, "nickname", `Earned the nickname "${nick}" (${T.desc.split(":")[0].toLowerCase()}).`, { trig });
      A.notify(`${A.name(g)} earned a nickname: "${nick}".`);
      return { applied: nick };
    }
    const offer = { uid: g.uid, nick, trig, name: A.name(g) };
    if (r) { r.nickOffers = (r.nickOffers || []).filter((o) => o.uid !== g.uid); r.nickOffers.push(offer); }
    else { S().nickOffers = (S().nickOffers || []).filter((o) => o.uid !== g.uid); S().nickOffers.push(offer); }
    return { offered: nick };
  };
  // Keep / Take the new one (extraction summary)
  A.resolveOffer = function (uid, take) {
    const s = S(), offers = s.nickOffers || [], o = offers.find((x) => x.uid === uid); if (!o) return "No such offer.";
    s.nickOffers = offers.filter((x) => x !== o);
    const g = s.grunts.find((x) => x.uid === uid); if (!g) return null;
    if (take) { const old = g.nickname; g.nickname = o.nick; A.log(g, "nickname", `Now called "${o.nick}" (was "${old}").`, { trig: o.trig }); }
    G.State.save(); return null;
  };
  const giant = (k) => { const T = D().nicknames.giant_kill; return (T.elite && k.elite) || (T.units || []).includes(k.eid) || (T.families || []).includes(k.family); };

  // after every battle (X.finishBattle, before death is handled). Won or lost.
  A.afterBattle = function (step, b, r) {
    const won = b.result === "win", body = b.units.find((u) => u.rank === "body" && u.side === 0), place = where(step.nid || r.loc) || "the wastes";
    const H = D().history, NK = D().nicknames;
    for (const u of b.units) {
      if (u.side !== 0 || u.squadIdx == null) continue;
      const m = r.squad[u.squadIdx], g = m.g; if (!g) continue;
      g.kills = (g.kills || 0) + u.stats.kills;
      if (u.stats.kills >= H.multiKill) A.log(g, "kills", `${u.stats.kills} kills at ${place}.`);
      if (u.state === "critical") A.log(g, "critical", `Went Critical at ${place}.`);
      if (u.stats.kills >= NK.multi_kill.kills) A.earn(g, "multi_kill", b.rng);
      if ((u.killed || []).some(giant)) A.earn(g, "giant_kill", b.rng);
      if (!won || u.state !== "alive") continue;
      if (body && body.state === "downed" && !b.units.some((o) => o !== u && o.side === 0 && o.rank !== "body" && o.state === "alive")) A.earn(g, "last_standing", b.rng);
      if (u.hp / u.maxHp * 100 < NK.low_hp_win.belowPct) A.earn(g, "low_hp_win", b.rng);
      const md = A.mods(g);
      if (md.healAfterBattlePct && m.hp > 0) { const max = u.maxHp, amt = max * md.healAfterBattlePct / 100; m.hp = Math.min(max, m.hp + amt); if (G.Exp) G.Exp.log(`${A.name(g)} patches up (+${Math.round(amt)} HP, Field Dresser).`); }
    }
  };

  // cause-of-death line for the wall ("Killed by an Elite Hound at Hound Warrens, run 12")
  const art = (n) => (/^[aeiou]/i.test(n) ? "an " : "a ") + n;
  A.causeText = function (m, extracted) {
    const d = m.died || {}, run = S().runCount, at = where(d.where) || where(S().run && S().run.loc) || "the wastes";
    if (d.cause === "battle") return d.killer ? `Killed by ${art(d.killer)} at ${at}, run ${run}` : `Killed at ${at}, run ${run}`;
    if (d.cause === "left_behind") return `Left behind at ${at}, run ${run}`;   // Break away (milestone 5)
    if (m.left) return `Left behind Critical at ${at}, run ${run}`;
    if (m.carried && !extracted) return `Died on the way out after you fell (carried Critical from ${at}), run ${run}`;
    if (d.cause === "critical") return `Went Critical at ${at} and was lost when the squad fell, run ${run}`;
    if (d.cause === "scout") return `Went ahead at ${at} and didn't come back, run ${run}`;
    return `Lost at ${at}, run ${run}`;
  };

  // run end (X.settleSquad): survivors count runs and extractions; old_hand nickname; every 5th extraction is logged
  A.afterRun = function (extracted, survivors) {
    const H = D().history, P = D().promotion;
    for (const g of survivors) {
      g.runs = (g.runs || 0) + 1;
      if (!extracted) continue;
      g.extractions = (g.extractions || 0) + 1;
      if (g.extractions % H.extractedEvery === 0) A.log(g, "extracted", `Extraction number ${g.extractions}.`);
      if (g.extractions === D().nicknames.old_hand.extractions) A.earn(g, "old_hand");
      if (g.extractions === P.extractions && A.canPromote(g, true) === null) A.notify(`${A.name(g)} can be promoted at the Recruitment lot.`);
    }
  };

  // ---------- promotion ----------
  A.veteranCount = () => S().grunts.filter(A.isVeteran).length;
  A.canPromote = function (g, ignoreRun) {
    const P = D().promotion;
    if (!g || g.tplKey !== "grunt" || g.rank !== "grunt") return "Only a Grunt can be promoted.";
    if (!ignoreRun && S().run) return "Finish the expedition first.";
    if ((g.extractions || 0) < P.extractions) return `Needs ${P.extractions} extractions (${g.extractions || 0} so far).`;
    if (A.veteranCount() >= P.veteranCap) return `Veterans full (${P.veteranCap}).`;
    return null;
  };
  A.promotable = () => S().grunts.filter((g) => A.canPromote(g) === null);
  A.promote = function (uid) {
    const g = S().grunts.find((x) => x.uid === uid), why = A.canPromote(g); if (why) return why;
    const V = D().veteran;
    g.tplKey = "veteran"; g.rank = V.rank;
    for (const k in g.skills) g.skills[k].lvl += V.skillBonus;
    const t = A.rollTraits(G.rng, 1, { kinds: D().promoteTraitKinds }, g.traits); g.traits = g.traits.concat(t);
    // Grunt gear -> Veteran slots (the old single gear slot's item moves to head / body / pack)
    const old = g.gear || {}, gear = { weapon: old.weapon || null }; for (const k in V.slots) if (k !== "weapon") gear[k] = old[k] || null;   // Slice 4 §F: Grunts already have the 4 slots
    if (old.gear) { const sl = G.Items.base(old.gear.base).slot, k = Object.keys(V.slots).find((x) => V.slots[x].includes(sl)); if (k) gear[k] = old.gear; else S().stash.items.push(old.gear); }
    g.gear = gear;
    A.log(g, "promoted", `Promoted to Veteran (new trait: ${t.map((x) => A.trait(x).name).join(", ") || "none left"}).`);
    G.log(`${A.name(g)} is now a Veteran.`, "good");
    G.State.save(); return null;
  };

  // ---------- Memorial Wall ----------
  A.memorial = function () {
    return S().fallenGrunts.slice().reverse().map((g) => ({
      uid: g.uid, name: A.name(g), rank: A.rankName(g), veteran: A.isVeteran(g), traits: (g.traits || []).slice(),
      runs: g.runs || 0, kills: g.kills || 0, cause: g.deathCause || (g.diedAt ? `Died at ${g.diedAt}, run ${g.diedRun}` : `Died, run ${g.diedRun || 0}`),
      last: A.lastLine(g, true)
    }));
  };
})(typeof window !== "undefined" ? window : globalThis);
