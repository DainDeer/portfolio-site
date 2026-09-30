// Addendum A2 (cut-down): scouting reads on the map location tooltip. Numbers: DATA.scouting.
// run.scout[zone:nid] = { d, mod, total, dc, pass, text } - one roll per location per run, made the first time it's
// adjacent to you (or you're in it). Its own seeded rng (run seed x location), so it never shifts other rolls.
(function (root) {
  const G = root.G, U = G.Util;
  const S = G.Scout = {};
  const D = () => DATA.scouting;
  const X = () => G.Exp;
  const run = () => G.state.run;
  const key = (nid) => (run().zone || "a") + ":" + nid;
  const hash = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

  S.on = () => !!(D() && D().enabled);
  S.radioBonus = () => (G.Outpost && G.Outpost.level("radio") >= D().radio.level ? D().radio.bonus : 0);
  // the squad's best Perception (standing members), d20 + floor(skill / skillDiv) + Radio L2; no helpers, no gear
  S.info = function () {
    const best = Math.max(0, ...X().members().map((m) => G.State.skillOf(m, D().skill)));
    const mod = Math.floor(best / DATA.config.checks.skillDiv) + S.radioBonus(), die = DATA.config.checks.die;
    let succ = 0; for (let d = 1; d <= die; d++) if (d === die || (d !== 1 && d + mod >= D().dc)) succ++;
    return { skill: D().skill, dc: D().dc, best, mod, radio: S.radioBonus(), chance: succ / die * 100 };
  };
  S.get = (nid) => (run() && run().scout ? run().scout[key(nid)] || null : null);
  S.roll = function (nid) {
    const r = run(); r.scout = r.scout || {}; if (r.scout[key(nid)]) return r.scout[key(nid)];
    const i = S.info(), rng = U.makeRng(hash(r.seed + ":" + key(nid)) || 1), die = DATA.config.checks.die, d = rng.int(1, die), total = d + i.mod;
    const pass = d === die || (d !== 1 && total >= i.dc);
    const node = G.Zones.map().nodes[nid], text = `Scouting ${G.Map.label(node)}: ${DATA.skills[i.skill].name} d20 ${d} + ${i.mod} (skill ${i.best}${i.radio ? ", +" + i.radio + " Radio" : ""}) = ${total} vs DC ${i.dc} → ${pass ? "Pass" : "Fail"}`;
    const o = r.scout[key(nid)] = { d, mod: i.mod, total, dc: i.dc, pass, text };
    X().log(text, pass ? "good" : "roll");
    if (G.Dice) G.Dice.capture({ d, total, grade: d === die ? "crit" : d === 1 ? "badFail" : pass ? "success" : "fail", text }, "scout");   // Slice 5 §B
    return o;
  };
  // called whenever the squad's position changes (X.markSeen): roll every location in reach that hasn't rolled this run
  S.around = function () {
    const r = run(); if (!S.on() || !r || X().tutorialOn()) return;
    const map = G.Zones.map(); if (!map || !map.nodes[r.loc]) return;
    for (const nid of [r.loc].concat(G.Map.neighbors(map, r.loc))) if (G.Map.loc(map.nodes[nid]) && !S.get(nid)) S.roll(nid);
  };

  // design call (milestone 5): a failed read also hides the family and resource types in the node label and the tooltip
  // (the top supply in the Scouting block stays)
  S.hidden = (nid) => { if (!S.on() || !run() || X().tutorialOn()) return false; const sc = S.get(nid); return !!(sc && !sc.pass); };
  // ---------- supplies ----------
  const resOk = (k) => k && DATA.resources[k] && !DATA.resources[k].hidden;
  S.expected = function (node) {
    const loc = G.Map.loc(node), SD = DATA.searchables, sz = SD.sizes[loc.size || "M"], zone = DATA.zones.list[node.zone || "a"] || {};
    const w = X().objectWeights(loc, node.zone || "a"), tot = Object.values(w).reduce((a, v) => a + Math.max(0, v), 0);
    const avg = (a) => (a[0] + a[1]) / 2, nGen = Math.max(0, Math.max(avg(sz.rooms), avg(sz.searchables)) - (avg(sz.rooms) - 1));
    const counts = {};
    for (const k in w) if (w[k] > 0) { const t = k === "body" ? (loc.family === "beasts" ? "body_beast" : "body_human") : k; counts[t] = (counts[t] || 0) + nGen * w[k] / tot; }
    for (const t in SD.objectWeights.fixedByTag || {}) if ((loc.tags || []).includes(t)) for (const type of SD.objectWeights.fixedByTag[t]) counts[type] = (counts[type] || 0) + 1;
    const tags = loc.tags || [], medK = (SD.medWeightByKind || {})[loc.kind] ?? 1, out = {};
    const wOf = (x) => x[1] * (x[0] && tags.includes((DATA.resources[x[0]] && DATA.resources[x[0]].tag) || x[0]) ? SD.tagWeightMult : 1) * (x[0] === "med" ? medK : 1);
    for (const t in counts) {
      const T = SD.types[t]; if (!T) continue;
      const tb = T.table || [], tw = tb.reduce((a, x) => a + wOf(x), 0);
      if (tw > 0) for (const x of tb) if (resOk(x[0])) out[x[0]] = (out[x[0]] || 0) + counts[t] * (T.resRolls || 0) * wOf(x) / tw * (x[2] + x[3]) / 2 * (zone.resourceMult || 1) * (DATA.resources[x[0]].dropMult || 1);
      for (const e of T.extras || []) if (resOk(e.res) && !e.minTier) out[e.res] = (out[e.res] || 0) + counts[t] * (e.chance / 100) * (e.n || 1);
    }
    return out;
  };
  // what's left: the restock level before you go in; the unsearched share once you've been inside this run
  S.remaining = function (nid) {
    const site = X().site(nid); if (!site) return 1;
    if (site.enteredRun === G.state.runCount) { const s = site.objects.filter((o) => o.kind === "search" && o.type !== "door" && !o.blocked); return s.length ? s.filter((o) => !o.searched).length / s.length : 0; }
    return X().restockLevel(site);
  };
  S.amountLabel = (v) => (v >= D().supply.lots ? "Lots" : v >= D().supply.some ? "Some" : "Few");
  S.supplies = function (nid) {
    const node = G.Zones.map().nodes[nid], e = S.expected(node), f = S.remaining(nid);
    return Object.keys(e).map((k) => ({ res: k, name: DATA.resources[k].name, v: e[k] * f, raw: e[k] })).filter((x) => x.raw >= D().supply.minShown)
      .sort((a, b) => b.raw - a.raw).map((x) => Object.assign(x, { label: S.amountLabel(x.v) }));
  };

  // ---------- enemies ----------
  S.squadPower = function () {
    const r = run(), P = D().strength.power; let p = P.body * U.clamp(r.bodyHp / Math.max(1, X().maxBodyHp()), 0, 1);
    for (const q of r.squad) if (q.hp > 0) { const mx = G.Battle.unitFromGrunt(q.g).maxHp; p += (q.g.tplKey === "veteran" || q.g.rank === "core" ? P.veteran : P.grunt) * U.clamp(q.hp / Math.max(1, mx), 0, 1); }
    return p;
  };
  S.strength = function (nid) {
    const r = run(), node = G.Zones.map().nodes[nid], here = nid === r.loc;
    if (!here) r.moves++;   // the budget of the move that takes you there
    let budget; try { budget = X().enemyBudget(node); } finally { if (!here) r.moves--; }
    const ratio = budget / Math.max(0.1, S.squadPower()), T = D().strength;
    return { budget, ratio, label: ratio >= T.heavy ? "Heavy" : ratio >= T.medium ? "Medium" : "Light" };
  };

  // ---------- the tooltip block ----------
  S.tipHtml = function (nid) {
    if (!S.on() || !run() || X().tutorialOn()) return "";
    const node = G.Zones.map().nodes[nid], loc = G.Map.loc(node); if (!loc) return "";
    const sc = S.get(nid), sup = loc.extraction ? [] : S.supplies(nid), fam = DATA.enemies.families[loc.family].name;
    const lines = [];
    if (sup.length) lines.push(`${sup[0].name}: <b>${sup[0].label}</b>`);
    if (sc && sc.pass) { for (const x of sup.slice(1)) lines.push(`${x.name}: ${x.label}`); lines.push(`${fam}: <b>${S.strength(nid).label}</b>`); }
    else lines.push(`<span class="unscouted">${sup.length ? "Other supplies, enemies" : "Enemies"}: Unscouted</span>`);
    const roll = sc ? `<small class="${sc.pass ? "good" : "bad"}">${sc.text}</small>` : `<small>Not scouted yet: rolls when it's next to you (${DATA.skills[D().skill].name} DC ${D().dc}).</small>`;
    return `<div class="scout-read" data-scout="${sc ? (sc.pass ? "pass" : "fail") : "none"}"><b>Scouting</b><br>${lines.join("<br>")}<br>${roll}</div>`;
  };
})(typeof window !== "undefined" ? window : globalThis);
