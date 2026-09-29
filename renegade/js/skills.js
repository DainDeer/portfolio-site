// §4.4 skill XP + levels. Skill record = { lvl, xp } where xp is progress toward next level.
(function (root) {
  const G = root.G;
  const S = G.Skills = {};
  const L = () => DATA.config.leveling;

  S.xpToNext = function (lvl, kind, xpMult) {
    const base = kind === "mind" ? L().mindBase : L().bodyBase * (xpMult || 1);
    return Math.max(1, Math.round(base * Math.pow(lvl, L().exponent)));
  };
  S.make = (lvl) => ({ lvl: lvl || 1, xp: 0 });
  S.level = (rec, id) => (rec && rec[id] ? rec[id].lvl : 1);

  // owner: { skills: {id:{lvl,xp}}, cap, xpMult, bodyXp? } ; returns levels gained
  S.addXp = function (owner, id, amount, opts) {
    if (!owner || !owner.skills || amount <= 0) return 0;
    const def = DATA.skills[id]; if (!def) return 0;
    const kind = def.kind;
    if (kind === "mind") amount *= L().mindXpSourceMult;
    const rec = owner.skills[id] || (owner.skills[id] = S.make(1));
    const cap = owner.cap || 99;
    rec.xp += amount;
    let gained = 0;
    while (rec.lvl < cap && rec.xp >= S.xpToNext(rec.lvl, kind, owner.xpMult)) {
      rec.xp -= S.xpToNext(rec.lvl, kind, owner.xpMult); rec.lvl++; gained++;
    }
    if (rec.lvl >= cap) rec.xp = Math.min(rec.xp, S.xpToNext(rec.lvl, kind, owner.xpMult));
    // body level / character level bookkeeping
    if (owner.onXp) owner.onXp(amount, kind);
    if (gained && G.log) G.log(`${owner.name || "You"}: ${def.name} → ${rec.lvl}`, "lvl");
    return gained;
  };

  S.bodyLevel = (body) => {
    const fam = DATA.bodies.families[body.family];
    return Math.min(fam.bodyLevelCap, Math.floor(Math.sqrt((body.bodyXp || 0) / L().bodyLevelDivisor)));
  };
  S.charLevel = (state) => Math.floor(Math.sqrt((state.lifetimeXp || 0) / L().charLevelDivisor));
})(typeof window !== "undefined" ? window : globalThis);
