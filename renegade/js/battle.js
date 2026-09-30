// §6-7 Battle simulation. Pure logic: no DOM. Emits fx events that the renderer drains.
(function (root) {
  const G = root.G, U = G.Util;
  const B = G.Battle = {};
  const C = () => DATA.config.battle, R = () => DATA.config.rolls;

  // ---------- unit construction ----------
  function baseUnit(o) {
    return Object.assign({
      id: U.uid("u"), side: 0, x: 0, y: 0, vx: 0, vy: 0, facing: 0, r: C().unitRadius,
      shield: 0, res: { kinetic: 0, energy: 0, bio: 0 }, dmgPct: 0, asPct: 0, accBonus: 0,
      state: "alive", atk: 0.3 + Math.random() * 0.5, reloadT: 0, ammo: 0, buffs: {}, bleeds: [], burns: [], hitsLanded: 0,
      firstShot: true, cd: 0, quirks: [], spec: null, domedBonus: 0, stabilized: false, cx: {},
      stats: { dmg: 0, hits: 0, misses: 0, jams: 0, kills: 0, taken: 0, heals: 0 }
    }, o);
  }

  function withWeapon(u, weaponItemOrId) {
    u.weapon = G.Items.weaponStats(weaponItemOrId);
    u.ammo = u.weapon.mag;
    const aiFromStyle = u.weapon.style === "gun" ? "ranged" : "melee";
    if (u.ai === "auto") u.ai = aiFromStyle;
    if (u.ai === "ranged" && u.weapon.style !== "gun") u.ai = "melee";
    if (u.ai === "melee" && u.weapon.style === "gun") u.ai = "ranged";
    return u;
  }

  // Slice 3 §5-6: set flags / jam, and the Complex affixes (u.cx) on one unit's items
  function gearUp(u, items) {
    const jp = G.Items.setStat(items, "jam_pct");
    u.jamSetMult = 1 - jp / 100;   // Militia Issue (3): -40% jam (fumble) chance
    u.firstCrit = !!G.Items.setFlag(items, "firstAttackCrit");            // Hunter's Garb (3)
    u.hunterSlowEvery = G.Items.setFlag(items, "hunterSlowEvery") || 0;
    u.cx = G.Items.complexes(items);
  }

  // Slice 3 §10a injuries on the save record: Max HP %, Accuracy, Move Speed %, Jam rating, Attack Speed % (shown in the stats)
  function injure(u, rec) {
    if (!G.Injuries || !rec || !rec.injuries || !rec.injuries.length) return;
    const m = G.Injuries.mods(rec);
    u.maxHp *= Math.max(0.05, 1 + m.hpPct / 100); u.accBonus += m.acc; u.speed = Math.max(0.3, u.speed * (1 + m.movePct / 100)); u.asPct += m.asPct;
    if (u.weapon && m.jam) u.weapon.jam += m.jam;
    u.injuries = rec.injuries.map((x) => x.id);
  }
  B.injure = injure;
  // body = save body; gear = {slot: item}; ctx = {carryPct, hp}
  B.unitFromBody = function (body, gear, ctx) {
    const cls = body.cls ? DATA.bodies.classes[body.cls] : null;
    const tpl = cls || DATA.bodies.basicBody;
    const st = tpl.stats, items = Object.values(gear || {}).filter(Boolean);
    const lv = (k) => G.Skills.level(body.skills, k);
    let armor = st.armor, hp = st.max_hp, eva = st.evasion, movePct = 0;
    for (const it of items) {
      const b = G.Items.base(it.base), sc = b.noScale ? 1 : G.Items.scale(it.ilvl);
      if (b.armor) armor += Math.round(b.armor * sc);
      if (b.moveSpeedPct) movePct += b.moveSpeedPct;
    }
    armor += G.Items.affixSum(items, "armor"); hp += G.Items.affixSum(items, "max_hp");
    eva += G.Items.affixSum(items, "evasion"); movePct += G.Items.affixSum(items, "move_speed_pct");
    armor += G.Items.setStat(items, "armor"); eva += G.Items.baseEvasion(items) + G.Items.setStat(items, "evasion"); movePct += G.Items.setStat(items, "move_speed_pct");   // Slice 3 §5 sets
    movePct += lv("athletics") * DATA.skills.athletics.moveSpeedPctPerLevel;
    const over = Math.max(0, (ctx && ctx.carryPct ? ctx.carryPct : 0) - 100);
    movePct -= over * DATA.config.carry.speedPenaltyPerPctOver;
    const skills = {}; for (const k in body.skills) skills[k] = body.skills[k].lvl;
    const u = baseUnit({
      name: body.name, sprite: G.State.bodySprite(body), rank: "body", side: 0, ai: cls ? cls.ai : tpl.ai,
      maxHp: hp * C().hpMult, armor, eva, speed: Math.max(0.3, st.move_speed * (1 + movePct / 100)),
      critChance: st.crit_chance + G.Items.affixSum(items, "crit_chance"), critDmg: st.crit_damage,
      asPct: G.Items.affixSum(items, "attack_speed"), dmgPct: G.Items.affixSum(items, "damage_pct"), accBonus: G.Items.affixSum(items, "accuracy") + G.Items.setStat(items, "accuracy"),
      skills, medicine: ctx && ctx.rival ? (skills.medicine || 0) : G.Skills.level(G.state.mind.skills, "medicine"), quirks: body.quirks.slice(),
      spec: body.spec ? DATA.bodies.specialties[body.spec] : null, ref: { kind: "body", body }, value: 10,
      domedBonus: items.reduce((s, it) => s + (G.Items.base(it.base).domedBonus || 0), 0)
    });
    withWeapon(u, gear && gear.weapon ? gear.weapon : tpl.naturalWeapon);
    gearUp(u, items);
    injure(u, body);
    // Slice 3 §3 perks on your body: Thick Skin / Glass Mind HP, Quick Hands AS, Glass Mind damage, Gun Nut (squad),
    // Quick Recovery cooldowns, Iron Will (once per expedition)
    const P = ctx && ctx.rival ? null : G.Perks;   // Slice 3 §7: a rival body carries no perks of yours
    if (P) {
      u.maxHp *= Math.max(0.05, 1 + P.bodyHpPct() / 100); u.asPct += P.bodyAsPct(); u.dmgPct += P.bodyDmgPct();
      u.jamMult = P.jamMult(); u.cdMult = P.cooldownMult();
      u.ironWill = P.ironWill() && !(G.state.run && G.state.run.ironWillUsed);
    }
    u.hp = ctx && ctx.hp != null ? Math.min(ctx.hp, u.maxHp) : u.maxHp;
    if (G.Abilities) u.abl = G.Abilities.slotsFor(body, u);   // Slice 3 §2: your body's 1-2 actives
    return u;
  };

  B.unitFromGrunt = function (g, hp, opts) {   // opts.rival (Slice 3 §7): a rival ally, none of your perks
    const tpl = G.State.gruntTpl(g), st = tpl.stats;
    const skills = {}; for (const k in g.skills) skills[k] = g.skills[k].lvl;
    // Grunt gear (Megan's playtest): an equipped weapon replaces the Grunt's own; armour / pack adds like it does for your body
    const gw = g.gear && g.gear.weapon, items = G.State.gruntItems ? G.State.gruntItems(g) : [];
    let armor = st.armor, mhp = st.max_hp, eva = st.evasion, movePct = (skills.athletics || 0) * DATA.skills.athletics.moveSpeedPctPerLevel;
    for (const it of items) { const bd = G.Items.base(it.base); if (bd.slot === "weapon") continue; if (bd.armor) armor += Math.round(bd.armor * (bd.noScale ? 1 : G.Items.scale(it.ilvl))); if (bd.moveSpeedPct) movePct += bd.moveSpeedPct; }
    armor += G.Items.affixSum(items, "armor"); mhp += G.Items.affixSum(items, "max_hp"); eva += G.Items.affixSum(items, "evasion"); movePct += G.Items.affixSum(items, "move_speed_pct");
    armor += G.Items.setStat(items, "armor"); eva += G.Items.baseEvasion(items) + G.Items.setStat(items, "evasion"); movePct += G.Items.setStat(items, "move_speed_pct");   // Slice 3 §5 sets
    // Slice 3 §1 traits (DATA.allies.traits): flat ones here, conditional ones (vs family, near your body, targeting, flee) in the fight
    const tm = G.Allies ? G.Allies.mods(g) : null;
    if (tm) { mhp *= 1 + tm.hpPct / 100; movePct += tm.movePct; }
    const u = baseUnit({
      name: G.Allies ? G.Allies.name(g) : g.name, sprite: tpl.sprite, rank: g.rank || "grunt", side: 0, ai: "auto",
      maxHp: mhp * C().hpMult, armor, eva, speed: st.move_speed * (1 + movePct / 100),
      critChance: st.crit_chance + G.Items.affixSum(items, "crit_chance"), critDmg: st.crit_damage, skills, ref: { kind: "grunt", grunt: g }, value: tpl.deployCost,
      asPct: G.Items.affixSum(items, "attack_speed") + (tm ? tm.asPct : 0), dmgPct: G.Items.affixSum(items, "damage_pct") + (tm ? tm.dmgPct : 0),
      accBonus: G.Items.affixSum(items, "accuracy") + G.Items.setStat(items, "accuracy") + (tm ? tm.acc : 0), traits: (g.traits || []).slice(), tm
    });
    withWeapon(u, gw || g.weapon);
    gearUp(u, items);
    if (tm && tm.jam) u.weapon.jam += tm.jam;   // "Jam rating": added to the weapon's own
    injure(u, g);
    if (G.Perks && !(opts && opts.rival)) { u.jamMult = G.Perks.jamMult(); if (u.rank === "grunt") u.dmgPct += G.Perks.gruntDmgPct(); }   // Gun Nut (squad), Expendables (Grunts only)
    u.hp = hp != null ? Math.min(hp, u.maxHp) : u.maxHp;
    return u;
  };

  // mult (Slice 3 §4b): Hunter stats x the Heat tier's budget mult (HP and damage)
  B.unitFromEnemy = function (id, elite, mult, hpMult) {   // mult: stats x (HP and damage); hpMult overrides the HP part
    const d = DATA.enemies.units[id], st = d.stats, E = DATA.enemies.elite;
    const skills = Object.assign({}, d.skills);
    if (elite) for (const k in skills) skills[k] += E.skillBonus;
    const u = baseUnit({
      name: (elite ? E.prefix : "") + d.name, sprite: d.sprite, rank: "enemy", side: 1, ai: d.ai, family: d.family, eid: id, weaponBase: d.weapon,
      maxHp: st.max_hp * (elite ? E.hpMult : 1) * C().hpMult, armor: st.armor, eva: st.evasion, speed: st.move_speed,
      critChance: st.crit_chance, critDmg: st.crit_damage, skills, value: d.cost * (elite ? 2 : 1), elite: !!elite,
      dmgPct: elite ? (E.dmgMult - 1) * 100 : 0, corpse: DATA.enemies.families[d.family].corpse
    });
    withWeapon(u, d.weapon);
    // Slice 3 §4: family-shared rules (machines: resistances, Bleed immunity, metal) + per-unit behaviour
    const sh = DATA.enemies.families[d.family].shared || {};
    Object.assign(u.res, sh.res || {}, d.res || {});
    u.immuneBleed = !!sh.immuneBleed; u.burnPct = sh.burnPct != null ? sh.burnPct : 100; u.metal = !!sh.metal; u.beh = d.beh || null;
    const hm = hpMult != null ? hpMult : mult;
    if (hm && hm !== 1) u.maxHp *= hm;
    if (mult && mult !== 1) u.dmgPct += (mult - 1) * 100;
    if (G.EnemyAI) G.EnemyAI.init(u);
    u.hp = u.maxHp;
    return u;
  };

  // Buy enemies from a budget (§7.3)
  B.buildEnemyGroup = function (rng, family, budget, eliteCount) {
    const fam = DATA.enemies.families[family];
    const out = []; let left = Math.max(1, Math.round(budget)); let guard = 50;
    while (left > 0 && guard-- > 0) {
      const opts = fam.units.filter((k) => DATA.enemies.units[k].cost <= left && (!G.EnemyAI || G.EnemyAI.allowed(k, out)));
      if (!opts.length) break;
      const k = rng.pick(opts); out.push(k); left -= DATA.enemies.units[k].cost;
    }
    if (!out.length) out.push(fam.units[0]);
    return out.map((k, i) => ({ id: k, elite: i < (eliteCount || 0) }));
  };

  // ---------- battle state ----------
  // setup: { allies:[unit], enemies:[{id,elite}], mode:'normal'|'defense', surviveSec, waves, family, seed }
  B.create = function (setup) {
    const seed = setup.seed != null ? setup.seed : U.randomSeed();
    const b = {
      seed, rng: U.makeRng(seed), t: 0, phase: "place", units: [], fx: [], over: false, result: null,
      mode: setup.mode || "normal", surviveSec: setup.surviveSec || 0, waves: setup.waves || [], waveIdx: 0,
      family: setup.family, log: [], rollMath: !!setup.rollMath, W: C().arenaW, H: C().arenaH, corpses: [], projectiles: []
    };
    for (const u of setup.allies) { u.side = 0; b.units.push(u); }
    B.autoPlace(b);
    B.spawnEnemies(b, setup.enemies || []);
    // Slice 3 §7: prebuilt enemy units (rival snapshots) on their own layout cells (free cells otherwise)
    if (setup.enemyUnits) for (const e of setup.enemyUnits) {
      const u = e.u; u.side = 1; u.facing = Math.PI;
      const taken = (cl) => b.units.some((o) => o.side === 1 && o.cell && o.cell.cx === cl.cx && o.cell.cy === cl.cy);
      let cl = e.cell && !taken(e.cell) ? e.cell : null;
      if (!cl) cl = B.cellsFor(1).find((c) => !taken(c));
      u.cell = { cx: cl.cx, cy: cl.cy }; u.x = cl.cx * C().gridCell + C().gridCell / 2; u.y = cl.cy * C().gridCell + C().gridCell / 2;
      b.units.push(u);
    }
    for (const u of b.units) B.assignCorpse(u);
    // Slice 3 §7: Ambush / a Parley gone wrong: one side is frozen for the first seconds of the fight
    if (setup.freeze) for (const u of b.units) if (u.side === setup.freeze.side) u.buffs.frozen = { t: setup.freeze.sec };
    if (G.EnemyAI) G.EnemyAI.onCreate(b, setup);   // Stalker Unseen rolls (setup.ambush: automatic)
    return b;
  };

  // presentation data only: which corpse / gib set a unit leaves (DATA.sprites: per-unit corpse + death variants)
  B.assignCorpse = function (u) {
    const S = DATA.sprites || {};
    u.corpseKind = u.metal ? "machine" : (S.beastFamilies || ["beasts"]).includes(u.family) ? "beast" : "human";
    u.corpse = (S[u.sprite] && S[u.sprite].corpse) || u.corpse || (u.corpseKind === "beast" ? "corpse_beast" : "corpse_human");
  };

  B.cellsFor = function (side) {
    const c = C(), cells = [];
    const cols = Math.floor(c.arenaW / c.gridCell), rows = Math.floor(c.arenaH / c.gridCell);
    for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
      const x = cx * c.gridCell + c.gridCell / 2, y = cy * c.gridCell + c.gridCell / 2;
      if (side === 0 && cx < c.playerZoneCols) cells.push({ cx, cy, x, y });
      if (side === 1 && x >= c.enemyZoneFromX) cells.push({ cx, cy, x, y });
    }
    return cells;
  };

  B.autoPlace = function (b) {
    const c = C(), allies = b.units.filter((u) => u.side === 0);
    const midY = Math.floor(c.arenaH / c.gridCell / 2);
    allies.forEach((u, i) => {
      const front = u.ai === "melee" ? 1 : 0;
      const col = c.playerZoneCols - 2 - (u.ai === "support" ? 2 : 0) + front - (u.ai === "ranged" ? 1 : 0);
      const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 2;
      B.placeAt(b, u, U.clamp(col, 0, c.playerZoneCols - 1), U.clamp(midY + off, 0, Math.floor(c.arenaH / c.gridCell) - 1));
    });
  };

  // placement grid prevents stacking (§7.1)
  B.placeAt = function (b, u, cx, cy) {
    const c = C();
    const occupied = b.units.find((o) => o !== u && o.side === u.side && o.cell && o.cell.cx === cx && o.cell.cy === cy);
    if (occupied) { // swap
      if (u.cell) { occupied.cell = { cx: u.cell.cx, cy: u.cell.cy }; occupied.x = u.cell.cx * c.gridCell + c.gridCell / 2; occupied.y = u.cell.cy * c.gridCell + c.gridCell / 2; }
      else return false;
    }
    u.cell = { cx, cy }; u.x = cx * c.gridCell + c.gridCell / 2; u.y = cy * c.gridCell + c.gridCell / 2;
    u.facing = u.side === 0 ? 0 : Math.PI;
    return true;
  };

  B.spawnEnemies = function (b, list, fromEdge) {
    const cells = b.rng.shuffle(B.cellsFor(1).filter((cl) => !b.units.some((o) => o.side === 1 && o.state !== "dead" && o.cell && o.cell.cx === cl.cx && o.cell.cy === cl.cy)));
    list.forEach((e, i) => {
      const u = B.unitFromEnemy(e.id, e.elite, e.mult, e.hpMult);
      const cl = cells[i % cells.length];
      u.cell = { cx: cl.cx, cy: cl.cy }; u.x = fromEdge ? C().arenaW - 0.5 : cl.x; u.y = cl.y; u.facing = Math.PI;
      B.assignCorpse(u);
      b.units.push(u);
    });
  };

  B.start = function (b) { b.phase = "fight"; b.t = 0; B.fx(b, { t: "text", x: b.W / 2, y: 2, text: "FIGHT!", color: "#fff", big: true }); };

  B.fx = (b, e) => { b.fx.push(e); };
  const floatText = (b, u, text, color, big) => B.fx(b, { t: "text", x: u.x, y: u.y - 0.9, text, color, big: !!big });
  const alive = (u) => u.state === "alive";
  const enemiesOf = (b, u) => b.units.filter((o) => o.side !== u.side && alive(o) && !o.unseen);   // an Unseen Stalker can't be targeted
  const alliesOf = (b, u) => b.units.filter((o) => o.side === u.side && alive(o) && o !== u);
  // XP events are anchored over the unit that earned them (Slice 2 §10 floating "+N XP" labels)
  const xp = (u, skill, amt) => { if (!u.ref || !G.State) return; if (G.XP) G.XP.at({ unit: u }, () => G.State.giveXp(u.ref, skill, amt)); else G.State.giveXp(u.ref, skill, amt); };
  const XP = () => DATA.config.leveling.xp;

  function hitChance(att, def, extraAcc) {
    const r = R();
    // zoneAcc / zoneEva: Suppressing Fire (-Accuracy) and Smoke (+Evasion) this tick (B.applyZones)
    const raw = att.weapon.acc + att.accBonus + (extraAcc || 0) + (att.zoneAcc || 0) + (att.skills[att.weapon.skill] || 0) / r.hitSkillDiv - def.eva - (def.zoneEva || 0) - (def.skills.acrobatics || 0) / r.hitAcroDiv + (G.EnemyAI ? G.EnemyAI.accMod(att, def) : 0);
    return U.clamp(raw, r.hitMin, r.hitMax);
  }
  B.hitChance = hitChance;
  B.applyDamage = (b, att, def, raw, dtype, opts) => applyDamage(b, att, def, raw, dtype || "kinetic", opts);   // tests / debug
  function fumbleChance(u) {
    const r = R();
    const raw = (u.weapon.jam * (1 - u.weapon.jamReducePct / 100) - (u.skills[u.weapon.skill] || 0) / r.fumbleSkillDiv) * (u.jamMult != null ? u.jamMult : 1) * (u.jamSetMult != null ? u.jamSetMult : 1) * (u.ammoJamMult != null ? u.ammoJamMult : 1);   // Gun Nut, Militia Issue (3), Hand-loads (Slice 3 §9)
    return Math.max(r.fumbleMin, raw);
  }
  B.fumbleChance = fumbleChance;
  const attackSpeedMult = (u) => 1 + (u.asPct + (u.buffs.stim ? u.buffs.stim.pct : 0) + (u.buffs.expend ? u.buffs.expend.pct : 0) + (u.buffs.allyDown ? u.buffs.allyDown.pct : 0) + (u.buffs.closeIn ? u.buffs.closeIn.pct : 0) + (u.supFiring ? u.supZone.attackSpeedPct : 0)) / 100;

  // ---------- damage ----------
  function applyDamage(b, att, def, raw, dtype, opts) {
    opts = opts || {};
    const r = R();
    // Bulwark intercept: a nearby ally with the passive takes part of the hit
    if (!opts.noIntercept) {
      const bw = b.units.find((o) => o !== def && o.side === def.side && alive(o) && o.spec && o.spec.passive && o.spec.passive.type === "intercept" && U.dist(o, def) <= o.spec.passive.radiusM);
      if (bw) { const part = raw * (bw.buffs.brace ? bw.buffs.brace.interceptPct : bw.spec.passive.pct) / 100; raw -= part; applyDamage(b, att, bw, part, dtype, { noIntercept: true, small: true }); }
    }
    let dmg = raw;
    if (!opts.dot) { if (def.cx.cx_first_hit && !def.firstHitTaken) { dmg *= 1 - def.cx.cx_first_hit.pct / 100; floatText(b, def, "BRACED", "#a0d0ff"); } def.firstHitTaken = true; }   // Complex: first hit -50%
    if (def.shield > 0) { const s = Math.min(def.shield, dmg * (dtype === "energy" ? 1.5 : 1)); def.shield -= s; dmg -= s / (dtype === "energy" ? 1.5 : 1); }
    const armor = (def.armor + (def.buffs.armorUp ? def.buffs.armorUp.v : 0)) * (opts.pierce ? 1 - DATA.items.tags.pierce.armorIgnorePct / 100 : 1);   // Taunt +Armor
    dmg *= r.armorConstant / (r.armorConstant + Math.max(0, armor));
    if (def.buffs.brace) dmg *= 1 + def.buffs.brace.dmgTakenPct / 100;   // Brace: -40% damage taken
    if (G.EnemyAI && !opts.dot) dmg *= G.EnemyAI.damageMult(b, att, def, dmg, opts);   // mark, vent, Warden shield
    const res = U.clamp(def.res[dtype] || 0, -100, r.resistCap);
    dmg *= 1 - res / 100;
    if (!opts.dot) dmg = Math.max(0.5, dmg); // minimum only for direct hits, not damage-over-time ticks
    def.hp -= dmg; def.stats.taken += dmg; if (att) att.stats.dmg += dmg;
    if (G.EnemyAI) G.EnemyAI.afterDamage(b, def, dmg, opts);   // Marksman aim reset
    if (def.ref && !opts.dot) xp(def, "endurance", XP().enduranceOnDamaged);
    if (!opts.silent) floatText(b, def, (opts.blocked ? "BLOCKED " : "") + (opts.crit ? "CRIT " : "") + Math.round(dmg), opts.crit ? "#ffd84a" : (def.side === 0 ? "#ff8080" : "#ffffff"), opts.crit);
    if (dmg >= 2 && b.rng() < 0.6 + dmg / 30) B.fx(b, { t: "blood", x: def.x + b.rng.range(-0.6, 0.6), y: def.y + b.rng.range(-0.6, 0.6), size: U.clamp(dmg / 12, 0.4, 1.4), rot: opts.dir != null ? opts.dir : b.rng() * 6.28, spray: !!opts.crit, kind: def.corpseKind });
    def.lastHitDir = opts.dir != null ? opts.dir : def.lastHitDir;
    if (def.tm && def.tm.flee && !def.fled && def.hp > 0 && def.hp / def.maxHp * 100 < def.tm.flee.belowPct) {   // Coward (once per battle)
      def.fled = true; def.buffs.flee = { t: def.tm.flee.sec }; floatText(b, def, "PANIC!", "#ffb0b0", true); b.log.push(`${def.name} panics and runs (Coward)`);
    }
    if (def.hp <= 0) onZero(b, att, def, -def.hp, opts);
    return dmg;
  }

  // Complex "ally goes down": everyone on that side with it gets +20% Attack Speed for 5 s
  function onZero(b, att, def, overkill, opts) {
    onZero0(b, att, def, overkill, opts);
    if (alive(def)) return;
    for (const o of b.units) if (o !== def && o.side === def.side && alive(o) && o.cx.cx_ally_down) { const c = o.cx.cx_ally_down; o.buffs.allyDown = { pct: c.asPct, t: c.sec }; floatText(b, o, `+${c.asPct}% AS`, "#ffb070"); }
  }
  function onZero0(b, att, def, overkill, opts) {
    const r = R();
    if (def.ironWill) {   // Iron Will (Slice 3 §3): your body survives the lethal hit at 1 HP, once per expedition
      def.ironWill = false; def.ironWillFired = true; def.hp = 1; def.bleeds = []; def.burns = [];
      floatText(b, def, "IRON WILL", "#ffd84a", true); b.log.push(`${def.name} refuses to die (Iron Will)`); return;
    }
    const overPct = (overkill / def.maxHp) * 100;
    if (att && att.side !== def.side) {
      att.stats.kills++; (att.killed = att.killed || []).push({ eid: def.eid, elite: !!def.elite, family: def.family, name: def.name });
      if (att.cx.cx_kill_speed) att.buffs.killSpeed = { pct: att.cx.cx_kill_speed.movePct, t: att.cx.cx_kill_speed.sec };   // Complex: on kill +20% Move Speed 3 s
      if (att.cx.cx_kill_cd && att.abl) for (const s of att.abl) s.cd = Math.max(0, s.cd - att.cx.cx_kill_cd.sec);    // Complex: kills cut cooldowns 1 s
    }
    def.killedBy = att ? { name: att.name, elite: !!att.elite, eid: att.eid, family: att.family } : null;   // Memorial Wall cause of death
    const gore = opts.gib || overPct >= C().gibOverkillPct || (opts.crit && b.rng() < 0.5) || (att && att.spec && att.spec.passive && att.spec.passive.finisherGib);
    // Slice 3 §7: rivals play by enemy rules: at 0 HP every rival unit dies (the rival body can show DOMED)
    if (def.rival) {
      if (def.rank === "body") {
        const domed = Math.max(r.domedMin, r.domedBase + overPct / r.domedOverkillDiv - (def.skills.endurance || 0) / r.domedEnduranceDiv);
        if (b.rng() * 100 < domed) { B.fx(b, { t: "sfx", key: "sfx_domed" }); kill(b, def, true, "domed"); floatText(b, def, "DOMED!", "#ff3030", true); B.fx(b, { t: "shake", mag: 6 }); b.log.push(`${def.name} was DOMED`); return; }
      }
      kill(b, def, gore); b.log.push(`${def.name} (rival) killed${att ? " by " + att.name : ""}`); return;
    }
    if (def.rank === "core") { // §9.4 allies above Grunt: Domed roll else Critical
      let domed = r.domedBase + overPct / r.domedOverkillDiv - (def.skills.endurance || 0) / r.domedEnduranceDiv - def.domedBonus;
      if (def.quirks.includes("half_domed")) domed /= 2;
      domed = Math.max(r.domedMin, domed);
      const roll = b.rng() * 100;
      if (roll < domed) { B.fx(b, { t: "sfx", key: "sfx_domed" }); kill(b, def, true, "domed"); floatText(b, def, "DOMED!" + (b.rollMath ? ` (${Math.round(domed)}%)` : ""), "#ff3030", true); B.fx(b, { t: "shake", mag: 6 }); B.fx(b, { t: "slowmo" }); b.log.push(`${def.name} was DOMED (${U.fmt1(domed)}% chance)`); }
      else { def.state = "critical"; def.hp = 0; B.fx(b, { t: "drag", x: def.x, y: def.y, dir: def.lastHitDir != null ? def.lastHitDir : def.facing + Math.PI }); floatText(b, def, "CRITICAL" + (b.rollMath ? ` (dome ${Math.round(domed)}%)` : ""), "#ff9030", true); b.log.push(`${def.name} went Critical (Domed chance was ${U.fmt1(domed)}%)`); B.fx(b, { t: "blood", x: def.x, y: def.y, size: 1.5, rot: 0, pool: true }); }
      return;
    }
    // Megan's playtest: your body goes DOWNED at 0 HP instead of dying. It's out of the fight (not "alive": enemies
    // retarget, splash and bleeds skip it) and B.checkEnd only ends the battle when nobody else is left standing.
    if (def.rank === "body" && C().downedEnabled) {
      def.state = "downed"; def.hp = 0; def.bleeds = []; def.burns = []; def.downedAt = b.t;
      floatText(b, def, "DOWNED", "#ff5050", true); b.log.push(`${def.name} (your body) is DOWNED`);
      B.fx(b, { t: "blood", x: def.x, y: def.y, size: 1.5, rot: 0, pool: true }); B.fx(b, { t: "slowmo" });
      return;
    }
    kill(b, def, gore);
    if (def.rank === "body") { floatText(b, def, "YOU DIED", "#ff3030", true); b.log.push(`${def.name} (your body) died`); }
    else b.log.push(`${def.name} killed${att ? " by " + att.name : ""}${gore ? " (gibbed)" : ""}`);
  }

  function kill(b, u, gore, cause) {
    u.state = "dead"; u.hp = 0;
    const V = (DATA.sprites || {}).corpseVariants || {}, variant = V[cause || (gore ? "gore" : "")];
    const sprite = (variant && ((variant.byUnit && variant.byUnit[u.sprite]) || variant[u.corpseKind || "human"])) || u.corpse || "corpse_human";
    b.corpses.push({ x: u.x, y: u.y, rot: u.facing + (b.rng() - 0.5), sprite, of: u.sprite, gore, cause: cause || (gore ? "gore" : "normal") });
    u.corpseSprite = sprite; u.gibbed = !!gore;   // Slice 2: the location view turns this corpse into a searchable body
    B.fx(b, { t: "death", x: u.x, y: u.y, gore, side: u.side, beast: u.family === "beasts", metal: !!u.metal });
    B.fx(b, { t: "blood", x: u.x, y: u.y, size: 1.6, rot: b.rng() * 6.28, pool: true });
    if (gore) B.fx(b, { t: "gibs", x: u.x, y: u.y, n: 6 + Math.floor(b.rng() * 6), kind: u.corpseKind || "human" });
    B.fx(b, { t: "slowmo" });
    if (G.EnemyAI) G.EnemyAI.onDeath(b, u);   // Crawler pop, Hunters "Close in!" / retreat
    // Expendables (Slice 3 §3): each Grunt death gives your side +10% Attack Speed for 5 s (up to 3 stacks, refreshes)
    const ex = u.side === 0 && u.rank === "grunt" && G.Perks ? G.Perks.onGruntDeath() : null;
    if (ex) for (const o of b.units) if (o.side === 0 && alive(o)) { const cur = o.buffs.expend; o.buffs.expend = { pct: Math.min(ex.asPct * (ex.maxStacks || 99), (cur ? cur.pct : 0) + ex.asPct), t: ex.sec }; floatText(b, o, `+${ex.asPct}% AS`, "#ffb070"); }
  }

  // ---------- attacks ----------
  function attack(b, u, tgt, opts) {
    opts = opts || {};
    const w = u.weapon, r = R();
    let chance = hitChance(u, tgt, opts.accBonus);
    if (u.firstShot && u.quirks.includes("first_shot_hits") && w.style === "gun") chance = 100;
    const firstCrit = u.firstCrit && !u.firstAttackDone; u.firstAttackDone = true;   // Hunter's Garb (3): the first attack is a guaranteed crit
    if (firstCrit) chance = 100;
    u.firstShot = false;
    const roll = b.rng() * 100;
    xp(u, w.skill, XP().combatRoll); xp(tgt, "acrobatics", XP().evadeRoll);
    B.fx(b, { t: "shot", x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, proj: w.projectile, melee: w.style !== "gun", hit: roll < chance, sfx: w.sfx });
    const math = b.rollMath ? ` (${Math.round(roll)}/${Math.round(chance)})` : "";
    if (roll >= chance) { u.stats.misses++; floatText(b, tgt, "MISS" + math, "#aaaaaa"); return; }
    // Riposte (Slice 3 §2): every melee attack is parried (no roll) and countered for 100% weapon damage
    if (w.style !== "gun" && tgt.buffs.riposte && alive(tgt)) {
      floatText(b, tgt, "RIPOSTE", "#80d0ff", true); xp(tgt, "blades", XP().combatRoll);
      applyDamage(b, tgt, u, tgt.weapon.dmg * tgt.buffs.riposte.counterPct / 100 * (1 + tgt.dmgPct / 100), tgt.weapon.type, { dir: Math.atan2(u.y - tgt.y, u.x - tgt.x), noIntercept: true });
      return;
    }
    // Parry (Duelist): contested Blades vs attacker weapon skill, melee only
    if (w.style !== "gun" && tgt.spec && tgt.spec.passive && tgt.spec.passive.type === "parry") {
      const pc = U.clamp(r.contestedBase + ((tgt.skills.blades || 0) - (u.skills[w.skill] || 0)) / r.contestedDiv, r.hitMin, r.hitMax);
      if (b.rng() * 100 < pc) { floatText(b, tgt, "PARRY" + (b.rollMath ? ` (${Math.round(pc)}%)` : ""), "#80d0ff"); xp(tgt, "blades", XP().combatRoll); return; }
    }
    u.stats.hits++; u.hitsLanded++;
    const crit = firstCrit || b.rng() * 100 < u.critChance + (opts.critBonus || 0);
    const nh = u.buffs.nextHit ? u.buffs.nextHit.dmgPct : 0; if (nh) delete u.buffs.nextHit;   // Dash: the next hit +50%
    const rend = u.buffs.rend; if (rend) delete u.buffs.rend;                                    // Rend: triple Bleed, always gibs
    const ub = G.EnemyAI && u.unseenBonus ? G.EnemyAI.attackBonus(b, u) : 0;                        // Unseen Stalker: first hit +100%
    const low = u.cx.cx_low_hp_dmg && u.hp / u.maxHp * 100 < u.cx.cx_low_hp_dmg.belowPct ? u.cx.cx_low_hp_dmg.dmgPct : 0;   // Complex: below 30% HP +25%
    let dmg = (opts.baseDmg != null ? opts.baseDmg : w.dmg) * (crit ? u.critDmg / 100 : 1) * (1 + (u.dmgPct + (opts.dmgBonus || 0) + nh + low + ub + traitDmg(b, u, tgt)) / 100);
    if (crit) { B.fx(b, { t: "shake", mag: C().shakeOnCrit, crit: true }); B.fx(b, { t: "sfx", key: "sfx_crit" }); }   // layers over sfx_hit_flesh
    const pierce = w.tags.includes("pierce") || !!opts.pierce;
    const dir = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    applyDamage(b, u, tgt, dmg, w.type, { crit, pierce, dir, gib: !!rend });
    if (crit && u.cx.cx_crit_heal && alive(u)) { const hv = Math.min(u.maxHp - u.hp, u.maxHp * u.cx.cx_crit_heal.healPct / 100); if (hv > 0) { u.hp += hv; floatText(b, u, "+" + Math.round(hv), "#60e060"); } }   // Complex: crit heals 5%
    if (u.cx.cx_stagger5 && u.hitsLanded % u.cx.cx_stagger5.every === 0 && alive(tgt)) { tgt.buffs.stagger = { t: u.cx.cx_stagger5.sec }; floatText(b, tgt, "STAGGER", "#d0d0ff"); }   // Complex: every 5th hit
    // weapon tags
    if (w.tags.includes("splash")) for (const o of enemiesOf(b, u)) if (o !== tgt && U.dist(o, tgt) <= DATA.items.tags.splash.radiusM) applyDamage(b, u, o, dmg * DATA.items.tags.splash.pct / 100, w.type, { pierce, small: true });
    const bleedSrc = w.tags.includes("bleed") ? DATA.items.tags.bleed : (u.spec && u.spec.passive && u.spec.passive.type === "bleed" ? u.spec.passive : null) || (rend ? DATA.items.tags.bleed : null);
    if (bleedSrc && alive(tgt) && !tgt.immuneBleed) tgt.bleeds.push({ dps: (dmg * bleedSrc.pctOfHit / 100) / bleedSrc.durationSec * (rend ? rend.bleedMult : 1), t: bleedSrc.durationSec, src: u });
    // Burn (Slice 3 §9, Incendiary rounds): 30% of the hit over 3 s, x the target's burnPct (machines 50%)
    if (w.tags.includes("burn") && alive(tgt) && (tgt.burnPct == null || tgt.burnPct > 0)) { const bn = DATA.items.tags.burn; tgt.burns.push({ dps: (dmg * bn.pctOfHit / 100) / bn.durationSec * (tgt.burnPct != null ? tgt.burnPct : 100) / 100, t: bn.durationSec, src: u }); }
    if (w.tags.includes("stagger") && u.hitsLanded % DATA.items.tags.stagger.everyNthHit === 0 && alive(tgt)) { tgt.atk += DATA.items.tags.stagger.interruptSec; floatText(b, tgt, "STAGGER", "#d0d0ff"); }
    if (u.spec && u.spec.passive && u.spec.passive.type === "slow" && alive(tgt)) tgt.buffs.slow = { pct: u.spec.passive.pct, t: u.spec.passive.durationSec };
    if (opts.knockdown && alive(tgt)) { tgt.buffs.knockdown = { t: opts.knockdown }; floatText(b, tgt, "KNOCKDOWN", "#ffb070"); B.fx(b, { t: "drag", x: tgt.x, y: tgt.y, dir }); }
  }

  // conditional trait damage (Beast-scarred vs a family, Owes You a Life near your body)
  function traitDmg(b, u, tgt) {
    const tm = u.tm; if (!tm) return 0;
    let pct = tm.dmgVsFamily[tgt.family] || 0;
    if (tm.nearBody.length) { const body = b.units.find((o) => o.rank === "body" && o.side === u.side && o.state !== "dead"); if (body) for (const nb of tm.nearBody) if (U.dist(u, body) <= nb.m) pct += nb.dmgPct; }
    return pct;
  }
  B.traitDmg = traitDmg;
  // Glory Hound: the enemy with the highest deploy cost (nearest on a tie)
  function pickTarget(u, foes) {
    if (u.tm && u.tm.target === "highest_cost") {
      const cost = (o) => (o.eid && DATA.enemies.units[o.eid] ? DATA.enemies.units[o.eid].cost : o.value || 0);
      return foes.reduce((best, o) => (cost(o) > cost(best) || (cost(o) === cost(best) && U.dist(u, o) < U.dist(u, best)) ? o : best), foes[0]);
    }
    return foes.reduce((best, o) => (U.dist(u, o) < U.dist(u, best) ? o : best), foes[0]);
  }
  B.pickTarget = pickTarget;

  function startReload(b, u) {
    const safe = u.cx.cx_first_reload && !u.reloadedOnce; u.reloadedOnce = true;   // Complex: the first reload can't fumble
    const f = safe ? 0 : fumbleChance(u), roll = b.rng() * 100;
    xp(u, u.weapon.skill, XP().handlingRoll);
    u.reloadT = u.weapon.reload / attackSpeedMult(u); B.fx(b, { t: "sfx", key: "sfx_reload" });
    if (roll < f) { u.reloadT += R().fumblePenaltySec; u.stats.jams++; floatText(b, u, "JAMMED!" + (b.rollMath ? ` (${Math.round(f)}%)` : ""), "#ff5050"); B.fx(b, { t: "sfx", key: "sfx_jam" }); b.log.push(`${u.name} fumbled a reload (${U.fmt1(f)}% chance)`); }
    else floatText(b, u, "reload", "#999");
  }

  // ---------- abilities: js/abilities.js (Slice 3 §2), called from B.step ----------
  // Smoke / Suppressing Fire zones and Frag grenades tick here; each unit's zone effects are cached for hitChance
  B.applyZones = function (b, dt) {
    for (const z of b.zones || []) z.t -= dt;
    if (b.zones) b.zones = b.zones.filter((z) => z.t > 0);
    for (const u of b.units) {
      u.zoneEva = 0; u.zoneAcc = 0; u.zoneSlow = 0;
      for (const z of b.zones || []) {
        if (Math.hypot(u.x - z.x, u.y - z.y) > z.r) continue;
        if (z.kind === "smoke") u.zoneEva += z.evasion;
        else if (z.kind === "suppress" && u.side !== z.side) { u.zoneAcc += z.accuracy; u.zoneSlow = Math.max(u.zoneSlow, z.slowPct); }
      }
      if (u.supZone && !(b.zones || []).includes(u.supZone)) { u.supZone = null; u.supFiring = false; }
    }
    for (const n of b.nades || []) {
      n.t -= dt; if (n.t > 0) continue;
      const d = n.d; n.done = true;
      B.fx(b, { t: "explosion", x: n.x, y: n.y, r: d.radiusM }); B.fx(b, { t: "sfx", key: "sfx_explosion" }); B.fx(b, { t: "shake", mag: 8 });
      for (const o of b.units.filter((o) => alive(o) && Math.hypot(o.x - n.x, o.y - n.y) <= d.radiusM)) {
        const friendly = o.side === n.src.side, dir = Math.atan2(o.y - n.y, o.x - n.x);
        applyDamage(b, n.src, o, d.dmg * (friendly ? d.friendlyPct / 100 : 1), d.dtype, { dir, noIntercept: true });
        if (alive(o) && d.knockbackM) G.Abilities.knock(b, o, n.x, n.y, d.knockbackM);
      }
    }
    if (b.nades) b.nades = b.nades.filter((n) => !n.done);
  };

  // ---------- step ----------
  B.step = function (b, dt) {
    if (b.phase !== "fight" || b.over) return;
    b.t += dt;
    const c = C();
    // defense waves
    if (b.mode === "defense" && b.waves.length && b.waveIdx < b.waves.length) {
      const every = b.surviveSec / (b.waves.length + 1);
      if (b.t >= every * (b.waveIdx + 1)) { B.spawnEnemies(b, b.waves[b.waveIdx], true); b.waveIdx++; B.fx(b, { t: "text", x: b.W - 4, y: 2, text: "WAVE " + (b.waveIdx + 1), color: "#ff9050", big: true }); }
    }
    B.applyZones(b, dt);
    if (G.EnemyAI) G.EnemyAI.stepStart(b, dt);   // Captain aura, retreating Hunters, Unseen timers
    if (b.aim && !alive(b.aim.u)) b.aim = null;   // aiming cancels by itself if the body goes down
    if (G.Escape) G.Escape.tick(b, dt);   // Break away: cooldown / stumble clocks, a downed body cancels it
    for (const u of b.units) {
      if (!alive(u)) continue;
      u.moving = false;
      // buffs
      for (const k in u.buffs) { u.buffs[k].t -= dt; if (u.buffs[k].t <= 0) delete u.buffs[k]; }
      for (const bl of u.bleeds) { bl.t -= dt; applyDamage(b, bl.src, u, bl.dps * dt, "kinetic", { silent: true, noIntercept: true, dot: true }); if (!alive(u)) break; }
      u.bleeds = u.bleeds.filter((x) => x.t > 0);
      if (!alive(u)) continue;
      for (const bn of u.burns) { bn.t -= dt; const d = applyDamage(b, bn.src, u, bn.dps * dt, DATA.items.tags.burn.dtype || "kinetic", { silent: true, noIntercept: true, dot: true }); u.stats.burnTaken = (u.stats.burnTaken || 0) + d; if (!alive(u)) break; }
      u.burns = u.burns.filter((x) => x.t > 0);
      if (!alive(u)) continue;
      if (u.medCd > 0) u.medCd = Math.max(0, u.medCd - dt);   // Med kit cooldown on this unit (combat time)
      if (u.side === 0 && G.Escape && G.Escape.stumbling(b)) { if (u.abl) for (const s of u.abl) s.cd = Math.max(0, s.cd - dt); continue; }   // a failed Break away: your units don't act
      if (u.channel && G.Tactical) { if (u.abl) for (const s of u.abl) s.cd = Math.max(0, s.cd - dt); G.Tactical.channelTick(b, u, dt); continue; }   // tactical pause: using an item
      if (u.buffs.knockdown || u.buffs.stagger || u.buffs.frozen) continue;
      const foes = enemiesOf(b, u);
      if (!foes.length) continue;
      // target: nearest enemy (Taunt forces the taunter; Suppressing Fire prefers enemies in its zone)
      if (!u.target || !alive(u.target) || b.rng() < 1 - Math.pow(0.98, dt * 60)) u.target = pickTarget(u, foes);   // Slice 4 §A2: 2% per 1/60 s of sim time (was 2% per step: tiny speeds took tiny steps)
      if (u.beh && G.EnemyAI) { const et = G.EnemyAI.target(b, u, foes); if (et) u.target = et; }   // Slice 3 §4 targeting rules
      if (u.buffs.taunt && alive(u.buffs.taunt.src)) u.target = u.buffs.taunt.src;
      u.supFiring = false;
      if (u.supZone) { const z = u.supZone, inZ = foes.filter((o) => Math.hypot(o.x - z.x, o.y - z.y) <= z.r && U.dist(u, o) <= u.weapon.range + u.r + o.r); if (inZ.length) { if (!inZ.includes(u.target)) u.target = pickTarget(u, inZ); u.supFiring = true; } }
      if (u.abl) G.Abilities.tick(b, u, dt);
      if (!alive(u)) continue;
      if (u.beh && G.EnemyAI && G.EnemyAI.tick(b, u, dt, foes)) continue;   // crawler / sentry / Marksman aim run themselves
      if (!alive(u)) continue;
      if (u.buffs.charge && !alive(u.buffs.charge.tgt)) delete u.buffs.charge;
      if (u.buffs.charge) u.target = u.buffs.charge.tgt;
      const tgt = u.target, d = U.dist(u, tgt);
      // movement
      let mx = 0, my = 0, em = null;
      const moveMult = u.buffs.charge ? u.buffs.charge.speedMult : u.buffs.dash ? u.buffs.dash.speedMult : 1;
      const speed = u.speed * (u.buffs.killSpeed ? 1 + u.buffs.killSpeed.pct / 100 : 1) * (u.buffs.slow ? 1 - u.buffs.slow.pct / 100 : 1) * (1 - (u.zoneSlow || 0) / 100) * moveMult;
      const reach = u.weapon.range + u.r + tgt.r;
      const dx = (tgt.x - u.x) / (d || 1), dy = (tgt.y - u.y) / (d || 1);
      if (u.buffs.flee) {   // Coward: runs from the nearest enemy, no attacks
        const near = foes.reduce((best, o) => (U.dist(u, o) < U.dist(u, best) ? o : best), foes[0]), nd = U.dist(u, near) || 1;
        mx = (u.x - near.x) / nd; my = (u.y - near.y) / nd;
      } else if (u.buffs.charge) {   // Charge / Rend: run in, hit on arrival
        mx = dx; my = dy;
        if (d <= reach) { const ch = u.buffs.charge; delete u.buffs.charge; attack(b, u, tgt, { dmgBonus: ch.dmgPct, knockdown: ch.knockdown }); u.atk = u.weapon.interval / attackSpeedMult(u); }
      } else if (u.buffs.sidestep) { // stepping out of a Hunter Captain's aim line (js/enemyai.js burst)
        mx = u.buffs.sidestep.dx; my = u.buffs.sidestep.dy;
      } else if (u.buffs.dash) {     // Dash: to the point at 4x speed
        const ds = u.buffs.dash, dd = Math.hypot(ds.x - u.x, ds.y - u.y);
        if (dd < 0.25) delete u.buffs.dash; else { mx = (ds.x - u.x) / dd; my = (ds.y - u.y) / dd; }
      } else if (u.beh && G.EnemyAI && (em = G.EnemyAI.move(b, u, tgt, d, reach))) { mx = em.mx; my = em.my;   // drone orbit, Warden
      } else if (u.side === 0 && tgt.beh && tgt.beh.shield && G.EnemyAI && (em = G.EnemyAI.flank(b, u, tgt, d, reach))) { mx = em.mx; my = em.my;   // flank a shielded Warden
      } else if (u.ai === "melee") {
        if (d > reach * 0.9) { mx = dx; my = dy; }
      } else if (u.ai === "ranged") {
        const closest = foes.reduce((m, o) => Math.min(m, U.dist(u, o)), 99);
        if (d > u.weapon.range * 0.95) { mx = dx; my = dy; }
        else if (closest < u.weapon.range * c.kiteRangeFrac && closest < 6) { const near = foes.find((o) => U.dist(u, o) === closest); mx = (u.x - near.x) / closest; my = (u.y - near.y) / closest; }
      } else if (u.ai === "support") {
        const friends = alliesOf(b, u);
        if (friends.length) {
          const cx = friends.reduce((s, o) => s + o.x, 0) / friends.length, cy = friends.reduce((s, o) => s + o.y, 0) / friends.length;
          const ex = foes.reduce((s, o) => s + o.x, 0) / foes.length, ey = foes.reduce((s, o) => s + o.y, 0) / foes.length;
          const ax = cx - ex, ay = cy - ey, al = Math.hypot(ax, ay) || 1;
          const px = cx + (ax / al) * c.medicHangBackM, py = cy + (ay / al) * c.medicHangBackM;
          const pd = Math.hypot(px - u.x, py - u.y);
          if (pd > 1) { mx = (px - u.x) / pd; my = (py - u.y) / pd; }
        } else if (d > u.weapon.range * 0.95) { mx = dx; my = dy; }
        const closest = foes.reduce((m, o) => Math.min(m, U.dist(u, o)), 99);
        if (closest < 4) { const near = foes.find((o) => U.dist(u, o) === closest); mx = (u.x - near.x) / closest; my = (u.y - near.y) / closest; }
      }
      // separation
      for (const o of b.units) {
        if (o === u || !alive(o)) continue;
        const sd = U.dist(u, o), min = u.r + o.r;
        if (sd < min && sd > 0.001) { mx += ((u.x - o.x) / sd) * c.separationForce * (min - sd); my += ((u.y - o.y) / sd) * c.separationForce * (min - sd); }
      }
      const ml = Math.hypot(mx, my);
      if (ml > 0.001) {
        const k = Math.min(1, ml);
        u.x += (mx / ml) * speed * k * dt; u.y += (my / ml) * speed * k * dt;
        u.moving = k > 0.3; // walk animation only for deliberate movement, not separation jitter
      }
      u.x = U.clamp(u.x, 0.5, b.W - 0.5); u.y = U.clamp(u.y, 0.5, b.H - 0.5);
      const f0 = u.facing;
      u.facing = u.buffs.flee || u.buffs.dash ? Math.atan2(my, mx) : Math.atan2(tgt.y - u.y, tgt.x - u.x);
      if (u.beh && u.beh.shield && u.beh.shield.turnDegPerSec && G.EnemyAI) u.facing = G.EnemyAI.turn(f0, u.facing, u.beh.shield.turnDegPerSec, dt);   // the Warden turns slowly
      if (u.buffs.flee) continue;
      // attacking
      if (u.reloadT > 0) { u.reloadT -= dt; if (u.reloadT <= 0) { u.reloadT = 0; u.ammo = u.weapon.mag; } continue; }
      u.atk -= dt;
      if (u.atk <= 0 && U.dist(u, tgt) <= reach && !u.buffs.charge) {
        if (u.beh && G.EnemyAI && G.EnemyAI.startAttack(b, u, tgt)) continue;   // Marksman: aim first
        attack(b, u, tgt);
        u.atk = u.weapon.interval / attackSpeedMult(u);
        if (u.weapon.mag > 0) { u.ammo--; if (u.ammo <= 0) startReload(b, u); }
      }
    }
    B.checkEnd(b);
  };

  // Slice 3 §2: advance by real seconds at the view's speed (aiming: 25% of 1x absolute, or 0 in Full pause). Returns sim seconds.
  // Slice 4 §A2: speed slider mapping (DATA.config.battle.speedSlider). pos 0..1 <-> speed
  B.speedPos = function (speed) { const S = C().speedSlider; return Math.pow(U.clamp(speed, 0, S.max) / S.max, 1 / S.curve); };
  B.speedAt = function (pos) {
    const S = C().speedSlider; pos = U.clamp(pos, 0, 1);
    for (const s of S.snaps) if (Math.abs(B.speedPos(s) - pos) <= S.snapPos) return s;
    const v = Math.round(S.max * Math.pow(pos, S.curve) / S.step) * S.step;
    return U.clamp(+v.toFixed(2), S.min, S.max);
  };
  B.advance = function (b, realDt, speed, slowmo) {
    let sim = realDt * (G.Abilities ? G.Abilities.timeScale(b, speed, slowmo) : speed * (slowmo || 1)), done = 0;
    while (sim > 1e-9 && !b.over) { const s = Math.min(1 / 60, sim); B.step(b, s); sim -= s; done += s; }
    return done;
  };

  B.checkEnd = function (b) {
    if (b.over) return;   // Break away already ended it
    const body = b.units.find((u) => u.rank === "body" && u.side === 0);
    const alliesUp = b.units.some((u) => u.side === 0 && alive(u));
    const enemiesUp = b.units.some((u) => u.side === 1 && (alive(u) || u.state === "retreating"));   // retreating Hunters leave first
    let res = null;
    if (body && !alive(body) && body.state !== "downed") res = "loss";
    else if (!alliesUp) res = "loss";          // downed body with nobody else standing (or no allies at all): a normal death
    else if (b.mode === "defense") { if (b.t >= b.surviveSec || (!enemiesUp && b.waveIdx >= b.waves.length)) res = "win"; }
    else if (!enemiesUp) res = "win";
    if (!res && b.t >= C().maxDurationSec) res = "loss";
    if (res) { b.over = true; b.result = res; b.phase = "over"; b.log.push(`Battle ${res === "win" ? "won" : "lost"} in ${Math.round(b.t)} s (seed ${b.seed})`); }
  };

  // Run a battle to completion with no renderer (tests / debug "auto-resolve")
  B.simulate = function (b, dt) {
    if (b.phase === "place") B.start(b);
    let guard = 0;
    while (!b.over && guard++ < 200000) { B.step(b, dt || 1 / 30); b.fx.length = 0; }
    return b.result;
  };

  B._ = { attack, startReload, applyDamage, kill, floatText, xp, XP, enemiesOf, alliesOf, attackSpeedMult };   // for js/abilities.js

  B.summary = function (b) {
    const rows = b.units.filter((u) => u.side === 0 || u.stats.dmg > 0).map((u) => ({
      name: u.name, side: u.side, state: u.state, dmg: Math.round(u.stats.dmg), hits: u.stats.hits, misses: u.stats.misses, jams: u.stats.jams, kills: u.stats.kills, heals: Math.round(u.stats.heals)
    }));
    return { rows, log: b.log.slice(-12), duration: b.t, seed: b.seed };
  };
})(typeof window !== "undefined" ? window : globalThis);
