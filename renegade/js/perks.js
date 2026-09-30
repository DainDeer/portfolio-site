// Slice 3 §3: character perks (G.Perks). state.perks = { id: rank }. Picks are derived from the character level, so an
// old save gets its picks for the levels it already has. Logic only.
(function (root) {
  const G = root.G;
  const P = G.Perks = {};
  const D = () => DATA.perks;
  const S = () => G.state;

  P.def = (id) => D().list[id];
  P.rank = (id) => ((S() && S().perks) || {})[id] || 0;
  P.has = (id) => P.rank(id) > 0;
  // sum of a numeric field over owned perks (x rank)
  P.sum = (field) => { let n = 0; for (const id in D().list) { const d = D().list[id]; if (d[field] && typeof d[field] === "number") n += d[field] * P.rank(id); } return n; };
  P.level = () => G.Skills.charLevel(S());
  P.earned = function (lvl) {
    lvl = lvl == null ? P.level() : lvl;
    return { normal: Math.floor(lvl / D().pickEvery), keystone: D().keystoneLevels.filter((l) => lvl >= l).length };
  };
  P.spent = function () {
    let normal = 0, keystone = 0;
    for (const id in (S().perks || {})) { const d = P.def(id); if (!d) continue; if (d.keystone) keystone += P.rank(id); else normal += P.rank(id); }
    return { normal, keystone };
  };
  P.unspent = function () { const e = P.earned(), s = P.spent(); return { normal: Math.max(0, e.normal - s.normal), keystone: Math.max(0, e.keystone - s.keystone) }; };
  P.unspentTotal = () => { const u = P.unspent(); return u.normal + u.keystone; };
  P.nextPickLevel = function () {
    const lvl = P.level(), n = (Math.floor(lvl / D().pickEvery) + 1) * D().pickEvery, k = D().keystoneLevels.find((l) => l > lvl);
    return { normal: n, keystone: k || null };
  };
  P.canPick = function (id) {
    const d = P.def(id); if (!d) return "Unknown perk.";
    if (S().run) return "Perks are picked at the outpost, not on a run.";
    if (P.rank(id) >= d.ranks) return "Max rank.";
    const u = P.unspent();
    if (d.keystone) { if (P.level() < D().keystoneLevels[0]) return `Keystones unlock at Lv ${D().keystoneLevels[0]}.`; if (!u.keystone) return "No Keystone pick left."; }
    else if (!u.normal) return "No perk pick left.";
    return null;
  };
  P.pick = function (id) {
    const why = P.canPick(id); if (why) return why;
    const s = S(); s.perks = s.perks || {}; s.perks[id] = P.rank(id) + 1;
    G.log(`Perk: ${P.def(id).name}${P.def(id).ranks > 1 ? " rank " + s.perks[id] : ""}.`, "good");
    G.State.save(); return null;
  };
  P.reset = function () { S().perks = {}; G.State.save(); };   // debug only (no respec in this slice)

  // ---- effects, read where they apply ----
  P.rarityBonus = () => P.sum("rarityPct");                     // X.rarityBonus
  P.carryKg = () => P.sum("carryKg");                           // X.capacity
  P.deployScore = () => P.sum("deployScore");                   // St.deployScore
  P.jamMult = () => Math.max(0, 1 - P.sum("jamPct") / 100);     // squad fumble chance (battle.js fumbleChance)
  P.cooldownMult = () => Math.max(0, 1 - P.sum("cooldownPct") / 100);   // your body's ability cooldowns
  P.helperEach = (base) => (P.has("helping_hand") ? P.def("helping_hand").helperEach : base);   // G.Checks
  P.bodyHpPct = () => P.sum("bodyHpPct");                       // unitFromBody (Thick Skin + Glass Mind)
  P.bodyAsPct = () => P.sum("bodyAsPct");
  P.bodyDmgPct = () => P.sum("bodyDmgPct");
  P.gruntDmgPct = () => P.sum("gruntDmgPct");                   // Expendables (rank grunt only; Veterans aren't Grunts)
  P.onGruntDeath = () => (P.has("expendables") ? P.def("expendables").onGruntDeath : null);
  P.ironWill = () => P.has("iron_will");
  P.ghostProtocol = () => P.has("ghost_protocol");

  // a level-up that makes a pick available: "Perk pick ready" (the UI shows it clickable at the outpost)
  P.checkReady = function (lvlBefore) {
    const before = P.earned(lvlBefore), after = P.earned();
    if (after.normal > before.normal || after.keystone > before.keystone) { S().perkReady = true; if (G.UI && G.UI.perkReadyToast) G.UI.perkReadyToast(); }
  };
})(typeof window !== "undefined" ? window : globalThis);
