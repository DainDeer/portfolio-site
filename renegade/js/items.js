// §10 loot generation + item stat math.
(function (root) {
  const G = root.G, U = G.Util;
  const I = G.Items = {};
  const LC = () => DATA.config.loot;

  I.base = (id) => DATA.items.bases[id];
  I.scale = (ilvl) => 1 + LC().statScalePerIlvl * (ilvl - 1);

  I.rollRarity = function (rng, rarityBonusPct) {
    const R = DATA.items.rarities;
    const ids = Object.keys(R).filter((k) => R[k].enabled && R[k].weight > 0);
    const b = 1 + (rarityBonusPct || 0) / 100;
    return rng.weighted(ids, (k) => (k === "white" ? R[k].weight : R[k].weight * b));
  };

  I.rollBase = function (rng) {
    const B = DATA.items.bases;
    const ids = Object.keys(B).filter((k) => !B[k].natural && (B[k].dropWeight || 0) > 0);
    return rng.weighted(ids, (k) => B[k].dropWeight);
  };

  I.rollAffix = function (rng, base, tier, ilvl, taken) {
    const A = DATA.items.affixes;
    const ids = Object.keys(A).filter((k) => {
      const a = A[k];
      if (a.tier !== tier || taken.includes(k)) return false;
      if (!a.slots.includes(base.slot)) return false;
      if (a.gunOnly && base.style !== "gun") return false;
      return true;
    });
    if (!ids.length) return null;
    const id = rng.pick(ids), a = A[id];
    let v = rng.int(a.min, a.max);
    if (a.scales) v = Math.max(1, Math.round(v * I.scale(ilvl)));
    const aff = { id, v };
    if (a.skills) aff.skill = rng.pick(a.skills);
    return aff;
  };

  I.make = function (baseId, rarity, ilvl, rng) {
    rng = rng || G.rng;
    const base = I.base(baseId);
    if (!base) throw new Error("Unknown item base " + baseId);
    ilvl = Math.max(1, Math.round(ilvl || 1));
    rarity = rarity || "white";
    if (base.rarityCap) { const order = Object.keys(DATA.items.rarities); if (order.indexOf(rarity) > order.indexOf(base.rarityCap)) rarity = base.rarityCap; } // data: base never rolls above this rarity
    const item = { uid: U.uid("it"), base: baseId, rarity, ilvl, affixes: [] };
    const tiers = DATA.items.rarityAffixTiers[item.rarity] || [];
    const taken = [];
    for (const t of tiers) {
      const a = I.rollAffix(rng, base, t, ilvl, taken) || I.rollAffix(rng, base, "basic", ilvl, taken);
      if (a) { item.affixes.push(a); taken.push(a.id); }
    }
    if (base.slot === "weapon" && base.req) item.req = Math.max(base.req, Math.round(ilvl * LC().reqPerIlvl));
    return item;
  };

  I.rollLoot = function (rng, ilvl, rarityBonus) {
    return I.make(I.rollBase(rng), I.rollRarity(rng, rarityBonus), ilvl, rng);
  };

  I.name = (item) => I.base(item.base).name;
  I.color = (item) => (I.isQuest(item) ? DATA.items.questColor || "#e8c060" : DATA.items.rarities[item.rarity].color);
  // quest items (Slice 2 §9): gold, can't be equipped or pouched, don't count toward the stash limit
  I.isQuest = (item) => !!item && !!I.base(item.base) && I.base(item.base).slot === "quest";
  I.makeQuest = (baseId) => ({ uid: U.uid("it"), base: baseId, rarity: "white", ilvl: 1, affixes: [], quest: true });
  I.weight = (item) => I.base(item.base).weight || 0;
  I.sprite = (item) => I.base(item.base).sprite || ("item_" + item.base);

  I.affixText = function (a) {
    const d = DATA.items.affixes[a.id]; if (!d) return a.id;
    return d.label.replace("{v}", a.v).replace("{skill}", a.skill ? DATA.skills[a.skill].name : "");
  };
  I.affixSum = function (items, stat, skill) {
    let s = 0;
    for (const it of items) if (it) for (const a of it.affixes) {
      const d = DATA.items.affixes[a.id];
      if (d && d.stat === stat && (!skill || a.skill === skill)) s += a.v;
    }
    return s;
  };

  // Final weapon stats (base scaled by ilvl + weapon-only affixes)
  I.weaponStats = function (item) {
    const baseId = typeof item === "string" ? item : item.base;
    const b = I.base(baseId);
    const ilvl = typeof item === "string" ? 1 : item.ilvl;
    const sc = b.natural ? 1 : I.scale(ilvl);
    const w = {
      id: baseId, name: b.name, style: b.style, skill: b.skill, type: b.type,
      dmg: b.dmg * sc, interval: b.interval, range: b.range, acc: b.acc, mag: b.mag, reload: b.reload,
      jam: b.jam, tags: b.tag ? [b.tag] : [], projectile: b.projectile || (b.style === "gun" ? "fx_bullet" : null), sfx: b.sfx,
      jamReducePct: 0
    };
    if (typeof item !== "string") {
      for (const a of item.affixes) {
        const d = DATA.items.affixes[a.id];
        if (d.stat === "magazine" && w.mag > 0) w.mag += a.v;
        if (d.stat === "jam_pct") w.jamReducePct += a.v;
        if (d.stat === "tag_pierce" && !w.tags.includes("pierce")) w.tags.push("pierce");
      }
    }
    return w;
  };

  I.describe = function (item) {
    const b = I.base(item.base);
    const lines = [];
    const sc = b.noScale ? 1 : I.scale(item.ilvl);
    if (b.slot === "weapon") {
      const w = I.weaponStats(item);
      lines.push(`${U.fmt1(w.dmg)} ${DATA.damageTypes[w.type]} · ${w.interval}s · ${w.range} m · Acc ${w.acc}`);
      if (w.mag) lines.push(`Mag ${w.mag} · Reload ${w.reload}s · Jam ${w.jam}`);
      if (w.tags.length) lines.push("Tags: " + w.tags.join(", "));
      lines.push(`Skill: ${DATA.skills[w.skill].name}` + (item.req ? ` (req ${item.req}${LC().enforceRequirements ? "" : ", not enforced"})` : ""));
    }
    if (b.armor) lines.push(`+${Math.round(b.armor * sc)} Armor`);
    if (b.domedBonus) lines.push(`-${b.domedBonus}% Domed chance`);
    if (b.carryKg) lines.push(`+${b.carryKg} kg carry`);
    if (b.moveSpeedPct) lines.push(`${b.moveSpeedPct}% Move Speed`);
    for (const a of item.affixes) lines.push("◆ " + I.affixText(a));
    lines.push(`${b.weight} kg · iLvl ${item.ilvl} · ${DATA.items.rarities[item.rarity].name}`);
    return lines;
  };
})(typeof window !== "undefined" ? window : globalThis);
