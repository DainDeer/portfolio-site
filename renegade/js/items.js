// §10 loot generation + item stat math.
(function (root) {
  const G = root.G, U = G.Util;
  const I = G.Items = {};
  const LC = () => DATA.config.loot;

  I.base = (id) => DATA.items.bases[id];
  I.scale = (ilvl) => 1 + LC().statScalePerIlvl * (ilvl - 1);

  // ilvl (Slice 3 §6): a rarity with minIlvl above the source item level drops to the next enabled tier down
  I.rollRarity = function (rng, rarityBonusPct, ilvl) {
    const R = DATA.items.rarities;
    const ids = Object.keys(R).filter((k) => R[k].enabled && R[k].weight > 0);
    const b = 1 + (rarityBonusPct || 0) / 100;
    return I.capRarity(rng.weighted(ids, (k) => (k === "white" ? R[k].weight : R[k].weight * b)), ilvl);
  };
  I.capRarity = function (r, ilvl) {
    if (ilvl == null) return r;
    const R = DATA.items.rarities, order = Object.keys(R);
    let i = order.indexOf(r);
    while (i > 0 && (!R[order[i]].enabled || (R[order[i]].minIlvl || 0) > ilvl)) i--;
    return order[i];
  };
  I.isRare = (item) => !!(item && DATA.items.rarities[item.rarity] && DATA.items.rarities[item.rarity].rare);

  // opts.setMult { setId: x } (Militia x2 from Gunmen). hunterOnly pieces never come from here: I.rollHunterPiece (Hunter bodies)
  // Slice 4 §C: opts.zone (default: the current run's zone) applies DATA.items.zoneTypeWeight by wtype; with
  // DATA.items.slotShares the slot is picked first (Slice 3 proportions), then the base inside it.
  I.dropWeight = function (id, zone, sm) {
    const b = DATA.items.bases[id], zt = (DATA.items.zoneTypeWeight || {})[zone] || {};
    return b.dropWeight * (b.set && sm && sm[b.set] ? sm[b.set] : 1) * (b.wtype && zt[b.wtype] != null ? zt[b.wtype] : 1);
  };
  I.rollBase = function (rng, opts) {
    const B = DATA.items.bases, sm = (opts && opts.setMult) || {}, SS = DATA.items.slotShares;
    const zone = opts && opts.zone !== undefined ? opts.zone : (G.state && G.state.run ? G.state.run.zone || "a" : null);
    let ids = Object.keys(B).filter((k) => !B[k].natural && (B[k].dropWeight || 0) > 0 && !B[k].hunterOnly);
    if (SS) { const slots = Object.keys(SS).filter((s) => SS[s] > 0 && ids.some((k) => B[k].slot === s)); const slot = rng.weighted(slots, (s) => SS[s]); ids = ids.filter((k) => B[k].slot === slot); }
    return rng.weighted(ids, (k) => I.dropWeight(k, zone, sm));
  };

  // tier: basic | advanced | complex, or advanced_top (the top half of the range, Orange) / complex_or_advanced (Purple's 4th line)
  I.rollAffix = function (rng, base, tier, ilvl, taken) {
    const A = DATA.items.affixes;
    let top = false;
    if (tier === "complex_or_advanced") tier = rng() * 100 < (DATA.items.complexChancePct != null ? DATA.items.complexChancePct : 50) ? "complex" : "advanced";
    if (tier === "advanced_top") { tier = "advanced"; top = true; }
    const ids = Object.keys(A).filter((k) => {
      const a = A[k];
      if (a.tier !== tier || taken.includes(k)) return false;
      if (!a.slots.includes(base.slot)) return false;
      if (a.gunOnly && base.style !== "gun") return false;
      return true;
    });
    if (!ids.length) return null;
    const id = rng.pick(ids), a = A[id];
    if (a.tier === "complex") return { id, v: 1 };
    let v = rng.int(top ? Math.ceil((a.min + a.max) / 2) : a.min, a.max);
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
      const a = I.rollAffix(rng, base, t, ilvl, taken) || (t !== "basic" ? I.rollAffix(rng, base, t === "advanced_top" ? "advanced_top" : "advanced", ilvl, taken) : null) || I.rollAffix(rng, base, "basic", ilvl, taken);
      if (a) { item.affixes.push(a); taken.push(a.id); }
    }
    if (base.slot === "weapon" && base.req) item.req = Math.max(base.req, Math.round(ilvl * LC().reqPerIlvl));
    return item;
  };

  I.rollLoot = function (rng, ilvl, rarityBonus, opts) {
    return I.make(I.rollBase(rng, opts), I.rollRarity(rng, rarityBonus, ilvl), ilvl, rng);
  };
  // Hunter's Garb piece (Slice 3 §5): only Hunter bodies roll this (DATA.enemies.hunters.loot.garbPct per body)
  I.rollHunterPiece = (rng, ilvl, rarityBonus) => I.make(rng.pick(DATA.sets.list.hunter.pieces), I.rollRarity(rng, rarityBonus, ilvl), ilvl, rng);

  // "item level still wins" (Slice 3 §6): raw DPS for weapons (dmg x Damage% x Attack Speed% x expected crit at 5% / 150%),
  // Armor for armour (base scaled + flat affixes)
  I.rawPower = function (item) {
    const b = I.base(item.base);
    if (b.slot === "weapon") {
      const w = I.weaponStats(item), cc = 5 + I.affixSum([item], "crit_chance");
      return w.dmg * (1 + I.affixSum([item], "damage_pct") / 100) * (1 + I.affixSum([item], "attack_speed") / 100) / w.interval * (1 + cc / 100 * 0.5);
    }
    return Math.round((b.armor || 0) * (b.noScale ? 1 : I.scale(item.ilvl))) + I.affixSum([item], "armor");
  };

  // debug "roll 10,000 items" readout (Slice 3 §6 acceptance 1): shares by rarity, set pieces, Complex lines
  I.rollStats = function (n, ilvl, rarityBonus, rng) {
    rng = rng || G.rng; const by = {}; let sets = 0, cx = 0;
    for (let i = 0; i < n; i++) { const it = I.rollLoot(rng, ilvl, rarityBonus || 0); by[it.rarity] = (by[it.rarity] || 0) + 1; if (I.setOf(it)) sets++; cx += it.affixes.filter((a) => DATA.items.affixes[a.id].tier === "complex").length; }
    const R = DATA.items.rarities, en = Object.keys(R).filter((k) => R[k].enabled && R[k].weight > 0), tot = en.reduce((s, k) => s + R[k].weight, 0);
    return { n, ilvl, by, sets, cx, expected: Object.fromEntries(en.map((k) => [k, R[k].weight / tot * 100])) };
  };

  // ---- Slice 3 §5 sets: pieces counted per unit (the item list you pass is one unit's) ----
  I.setOf = (item) => { const b = item && I.base(item.base); return b && b.set ? DATA.sets.list[b.set] : null; };
  // [{ id, def, n, on: [2, 3] }] for the sets present in items
  I.sets = function (items) {
    const out = {};
    for (const it of items || []) { if (!it) continue; const b = I.base(it.base); if (!b || !b.set) continue; (out[b.set] = out[b.set] || new Set()).add(it.base); }
    return Object.keys(out).map((id) => { const def = DATA.sets.list[id], n = out[id].size; return { id, def, n, on: Object.keys(def.bonuses).map(Number).filter((k) => n >= k) }; });
  };
  I.setStat = function (items, stat, skill) {
    let s = 0;
    for (const st of I.sets(items)) for (const k of st.on) { const bo = st.def.bonuses[k]; if (stat === "check_skill") { if (bo.checks && skill) s += bo.checks[skill] || 0; } else if (bo.stats && bo.stats[stat]) s += bo.stats[stat]; }
    return s;
  };
  I.setFlag = function (items, flag) { for (const st of I.sets(items)) for (const k of st.on) { const f = st.def.bonuses[k].flags; if (f && f[flag]) return f[flag]; } return null; };
  // base-level stats that aren't armor (set pieces): evasion (scales like armor), checkSkill
  I.baseEvasion = (items) => (items || []).reduce((s, it) => { if (!it) return s; const b = I.base(it.base); return s + (b.evasion ? Math.round(b.evasion * (b.noScale ? 1 : I.scale(it.ilvl))) : 0); }, 0);
  I.baseCheck = (items, skill) => (items || []).reduce((s, it) => { const b = it && I.base(it.base); return s + (b && b.checkSkill && b.checkSkill[skill] || 0); }, 0);
  // everything a unit's items give to a check / evasion beyond affixes (base stats + set bonuses)
  I.checkBonus = (items, skill) => I.affixSum(items || [], "check_skill", skill) + I.baseCheck(items, skill) + I.setStat(items, "check_skill", skill);
  // Complex affixes (Slice 3 §6) on one unit's items: { cx_id: its cx numbers }
  I.complexes = function (items) {
    const out = {};
    for (const it of items || []) if (it) for (const a of it.affixes) { const d = DATA.items.affixes[a.id]; if (d && d.tier === "complex") out[a.id] = d.cx || {}; }
    return out;
  };

  I.name = (item) => I.base(item.base).name;
  I.color = (item) => (I.isQuest(item) ? DATA.items.questColor || "#e8c060" : DATA.items.rarities[item.rarity].color);
  // quest items (Slice 2 §9): gold, can't be equipped or pouched, don't count toward the stash limit
  I.isQuest = (item) => !!item && !!I.base(item.base) && I.base(item.base).slot === "quest";
  I.makeQuest = (baseId) => ({ uid: U.uid("it"), base: baseId, rarity: "white", ilvl: 1, affixes: [], quest: true });
  I.weight = (item) => I.base(item.base).weight || 0;
  // ---- Slice 5 §E weapon sets: hand slots weapon / offhand (Main), weapon2 / offhand2 (Backup) ----
  I.HAND_SLOTS = ["weapon", "offhand", "weapon2", "offhand2"];
  I.BACKUP_SLOTS = ["weapon2", "offhand2"];
  I.hands = (b) => (!b ? 0 : b.slot === "shield" ? "shield" : b.slot === "weapon" ? (b.hands === 2 ? 2 : 1) : 0);   // 2 | 1 | "shield" | 0
  I.isPet = (item) => !!(item && (I.base(item.base) || {}).slot === "pet");   // Slice 5 §F: carried out = unlocked (G.Allies.unlockPet)
  I.isHandItem = (item) => !!(item && I.hands(I.base(item.base)));
  // Putting item in hand slot key: { why } if it can't go there, else { clear: [keys] } the slots it pushes out.
  // Rules: a shield only goes in an off hand, a 2H weapon only in a main hand (and empties that set's off hand);
  // an off hand next to a 2H main pushes the main out (the newer pick wins). get(key) -> the item in that slot.
  I.handFit = function (key, item, get) {
    const h = I.hands(I.base(item.base)), off = key === "offhand" || key === "offhand2", bk = key === "weapon2" || key === "offhand2";
    const mainK = bk ? "weapon2" : "weapon", offK = bk ? "offhand2" : "offhand";
    if (!h) return { why: "That isn't a weapon or a shield." };
    if (!off) { if (h === "shield") return { why: "A shield goes in the off hand." }; return { clear: h === 2 && get(offK) ? [offK] : [] }; }
    if (h === 2) return { why: "Two-handed: it goes in the main hand." };
    const m = get(mainK); return { clear: m && I.hands(I.base(m.base)) === 2 ? [mainK] : [] };
  };
  // the slot a bag / stash item goes to when you just press Equip (set: "main" | "backup")
  I.autoSlot = function (item, get, set) {
    const b = I.base(item.base), h = I.hands(b), bk = set === "backup", mainK = bk ? "weapon2" : "weapon", offK = bk ? "offhand2" : "offhand";
    if (!h) return b.slot;
    if (h === "shield") return offK;
    if (h === 2) return mainK;
    const m = get(mainK); return !m ? mainK : I.hands(I.base(m.base)) === 1 && !get(offK) ? offK : mainK;
  };
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

  I.describe = function (item, ctx) {
    const b = I.base(item.base);
    const lines = [];
    const sc = b.noScale ? 1 : I.scale(item.ilvl);
    if (b.slot === "weapon") {
      const w = I.weaponStats(item);
      if (b.wtype && DATA.items.wtypes) lines.push(`${DATA.items.wtypes[b.wtype].name} · ${b.hands === 2 ? "two-handed" : "one-handed"}`);   // Slice 4 §C
      lines.push(`${U.fmt1(w.dmg)} ${DATA.damageTypes[w.type]} · ${w.interval}s · ${w.range} m · Acc ${w.acc}`);
      if (w.mag) lines.push(`Mag ${w.mag} · Reload ${w.reload}s · Jam ${w.jam}`);
      if (w.tags.length) lines.push("Tags: " + w.tags.join(", "));
      lines.push(`Skill: ${DATA.skills[w.skill].name}` + (item.req ? ` (req ${item.req}${LC().enforceRequirements ? "" : ", not enforced"})` : ""));
    }
    if (b.silly) lines.push(`<span class="cos-tag">Cosmetic</span> · equip once to unlock its look for good`);   // Slice 5 §H (Vixie)
    if (b.slot === "shield") lines.push(`Shield · off hand · blocks ${b.blockPct}% of hits from the front · Brawling`);   // Slice 5 §E
    if (b.armor) lines.push(`+${Math.round(b.armor * sc)} Armor`);
    if (b.evasion) lines.push(`+${Math.round(b.evasion * sc)} Evasion`);
    if (b.checkSkill) for (const k in b.checkSkill) lines.push(`+${b.checkSkill[k]} ${DATA.skills[k].name} (checks)`);
    if (b.domedBonus) lines.push(`-${b.domedBonus}% Domed chance`);
    if (b.carryKg) lines.push(`+${b.carryKg} kg carry`);
    if (b.moveSpeedPct) lines.push(`${b.moveSpeedPct}% Move Speed`);
    for (const a of item.affixes) lines.push((DATA.items.affixes[a.id] && DATA.items.affixes[a.id].tier === "complex" ? "✦ " : "◆ ") + I.affixText(a));
    lines.push(`${b.weight} kg · iLvl ${item.ilvl} · ${DATA.items.rarities[item.rarity].name}`);
    // set line (green) + its bonuses; ctx = the items on the same unit (lit when that many pieces are on)
    const set = I.setOf(item);
    if (set) {
      const n = ctx ? (I.sets(ctx).find((x) => x.def === set) || { n: 0 }).n : null;
      lines.push(`<span class="set-line">${set.name}${n != null ? ` (${n}/${set.pieces.length})` : ` (set, ${set.pieces.length} pieces)`}</span>`);
      for (const k of Object.keys(set.bonuses)) lines.push(`<span class="set-bonus${n != null && n >= +k ? " on" : ""}">(${k}) ${set.bonuses[k].text}</span>`);
    }
    return lines;
  };
})(typeof window !== "undefined" ? window : globalThis);
