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
      state: "alive", atk: 0.3 + Math.random() * 0.5, reloadT: 0, ammo: 0, buffs: {}, bleeds: [], hitsLanded: 0,
      firstShot: true, cd: 0, quirks: [], spec: null, domedBonus: 0, stabilized: false,
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
    movePct += lv("athletics") * DATA.skills.athletics.moveSpeedPctPerLevel;
    const over = Math.max(0, (ctx && ctx.carryPct ? ctx.carryPct : 0) - 100);
    movePct -= over * DATA.config.carry.speedPenaltyPerPctOver;
    const skills = {}; for (const k in body.skills) skills[k] = body.skills[k].lvl;
    const u = baseUnit({
      name: body.name, sprite: G.State.bodySprite(body), rank: "body", side: 0, ai: cls ? cls.ai : tpl.ai,
      maxHp: hp * C().hpMult, armor, eva, speed: Math.max(0.3, st.move_speed * (1 + movePct / 100)),
      critChance: st.crit_chance + G.Items.affixSum(items, "crit_chance"), critDmg: st.crit_damage,
      asPct: G.Items.affixSum(items, "attack_speed"), dmgPct: G.Items.affixSum(items, "damage_pct"), accBonus: G.Items.affixSum(items, "accuracy"),
      skills, medicine: G.Skills.level(G.state.mind.skills, "medicine"), quirks: body.quirks.slice(),
      spec: body.spec ? DATA.bodies.specialties[body.spec] : null, ref: { kind: "body", body }, value: 10,
      domedBonus: items.reduce((s, it) => s + (G.Items.base(it.base).domedBonus || 0), 0)
    });
    withWeapon(u, gear && gear.weapon ? gear.weapon : tpl.naturalWeapon);
    u.hp = ctx && ctx.hp != null ? Math.min(ctx.hp, u.maxHp) : u.maxHp;
    return u;
  };

  B.unitFromGrunt = function (g, hp) {
    const tpl = G.State.gruntTpl(g), st = tpl.stats;
    const skills = {}; for (const k in g.skills) skills[k] = g.skills[k].lvl;
    const u = baseUnit({
      name: g.name, sprite: tpl.sprite, rank: g.rank || "grunt", side: 0, ai: "auto",
      maxHp: st.max_hp * C().hpMult, armor: st.armor, eva: st.evasion, speed: st.move_speed * (1 + (skills.athletics || 0) * DATA.skills.athletics.moveSpeedPctPerLevel / 100),
      critChance: st.crit_chance, critDmg: st.crit_damage, skills, ref: { kind: "grunt", grunt: g }, value: tpl.deployCost
    });
    withWeapon(u, g.weapon);
    u.hp = hp != null ? Math.min(hp, u.maxHp) : u.maxHp;
    return u;
  };

  B.unitFromEnemy = function (id, elite) {
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
    u.hp = u.maxHp;
    return u;
  };

  // Buy enemies from a budget (§7.3)
  B.buildEnemyGroup = function (rng, family, budget, eliteCount) {
    const fam = DATA.enemies.families[family];
    const out = []; let left = Math.max(1, Math.round(budget)); let guard = 50;
    while (left > 0 && guard-- > 0) {
      const opts = fam.units.filter((k) => DATA.enemies.units[k].cost <= left);
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
    B.spawnEnemies(b, setup.enemies);
    for (const u of b.units) B.assignCorpse(u);
    return b;
  };

  // presentation data only: which corpse / gib set a unit leaves (DATA.sprites: per-unit corpse + death variants)
  B.assignCorpse = function (u) {
    const S = DATA.sprites || {};
    u.corpseKind = (S.beastFamilies || ["beasts"]).includes(u.family) ? "beast" : "human";
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
      const u = B.unitFromEnemy(e.id, e.elite);
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
  const enemiesOf = (b, u) => b.units.filter((o) => o.side !== u.side && alive(o));
  const alliesOf = (b, u) => b.units.filter((o) => o.side === u.side && alive(o) && o !== u);
  // XP events are anchored over the unit that earned them (Slice 2 §10 floating "+N XP" labels)
  const xp = (u, skill, amt) => { if (!u.ref || !G.State) return; if (G.XP) G.XP.at({ unit: u }, () => G.State.giveXp(u.ref, skill, amt)); else G.State.giveXp(u.ref, skill, amt); };
  const XP = () => DATA.config.leveling.xp;

  function hitChance(att, def, extraAcc) {
    const r = R();
    const raw = att.weapon.acc + att.accBonus + (extraAcc || 0) + (att.skills[att.weapon.skill] || 0) / r.hitSkillDiv - def.eva - (def.skills.acrobatics || 0) / r.hitAcroDiv;
    return U.clamp(raw, r.hitMin, r.hitMax);
  }
  B.hitChance = hitChance;
  function fumbleChance(u) {
    const r = R();
    const raw = u.weapon.jam * (1 - u.weapon.jamReducePct / 100) - (u.skills[u.weapon.skill] || 0) / r.fumbleSkillDiv;
    return Math.max(r.fumbleMin, raw);
  }
  B.fumbleChance = fumbleChance;
  const attackSpeedMult = (u) => 1 + (u.asPct + (u.buffs.stim ? u.buffs.stim.pct : 0)) / 100;

  // ---------- damage ----------
  function applyDamage(b, att, def, raw, dtype, opts) {
    opts = opts || {};
    const r = R();
    // Bulwark intercept: a nearby ally with the passive takes part of the hit
    if (!opts.noIntercept) {
      const bw = b.units.find((o) => o !== def && o.side === def.side && alive(o) && o.spec && o.spec.passive && o.spec.passive.type === "intercept" && U.dist(o, def) <= o.spec.passive.radiusM);
      if (bw) { const part = raw * bw.spec.passive.pct / 100; raw -= part; applyDamage(b, att, bw, part, dtype, { noIntercept: true, small: true }); }
    }
    let dmg = raw;
    if (def.shield > 0) { const s = Math.min(def.shield, dmg * (dtype === "energy" ? 1.5 : 1)); def.shield -= s; dmg -= s / (dtype === "energy" ? 1.5 : 1); }
    const armor = def.armor * (opts.pierce ? 1 - DATA.items.tags.pierce.armorIgnorePct / 100 : 1);
    dmg *= r.armorConstant / (r.armorConstant + Math.max(0, armor));
    const res = U.clamp(def.res[dtype] || 0, -100, r.resistCap);
    dmg *= 1 - res / 100;
    if (!opts.dot) dmg = Math.max(0.5, dmg); // minimum only for direct hits, not damage-over-time ticks
    def.hp -= dmg; def.stats.taken += dmg; if (att) att.stats.dmg += dmg;
    if (def.ref && !opts.dot) xp(def, "endurance", XP().enduranceOnDamaged);
    if (!opts.silent) floatText(b, def, (opts.crit ? "CRIT " : "") + Math.round(dmg), opts.crit ? "#ffd84a" : (def.side === 0 ? "#ff8080" : "#ffffff"), opts.crit);
    if (dmg >= 2 && b.rng() < 0.6 + dmg / 30) B.fx(b, { t: "blood", x: def.x + b.rng.range(-0.6, 0.6), y: def.y + b.rng.range(-0.6, 0.6), size: U.clamp(dmg / 12, 0.4, 1.4), rot: opts.dir != null ? opts.dir : b.rng() * 6.28, spray: !!opts.crit, kind: def.corpseKind });
    def.lastHitDir = opts.dir != null ? opts.dir : def.lastHitDir;
    if (def.hp <= 0) onZero(b, att, def, -def.hp, opts);
    return dmg;
  }

  function onZero(b, att, def, overkill, opts) {
    const r = R();
    const overPct = (overkill / def.maxHp) * 100;
    if (att) att.stats.kills++;
    const gore = overPct >= C().gibOverkillPct || (opts.crit && b.rng() < 0.5) || (att && att.spec && att.spec.passive && att.spec.passive.finisherGib);
    if (def.rank === "core") { // §9.4 allies above Grunt: Domed roll else Critical
      let domed = r.domedBase + overPct / r.domedOverkillDiv - (def.skills.endurance || 0) / r.domedEnduranceDiv - def.domedBonus;
      if (def.quirks.includes("half_domed")) domed /= 2;
      domed = Math.max(r.domedMin, domed);
      const roll = b.rng() * 100;
      if (roll < domed) { kill(b, def, true, "domed"); floatText(b, def, "DOMED!" + (b.rollMath ? ` (${Math.round(domed)}%)` : ""), "#ff3030", true); B.fx(b, { t: "shake", mag: 6 }); B.fx(b, { t: "slowmo" }); b.log.push(`${def.name} was DOMED (${U.fmt1(domed)}% chance)`); }
      else { def.state = "critical"; def.hp = 0; B.fx(b, { t: "drag", x: def.x, y: def.y, dir: def.lastHitDir != null ? def.lastHitDir : def.facing + Math.PI }); floatText(b, def, "CRITICAL" + (b.rollMath ? ` (dome ${Math.round(domed)}%)` : ""), "#ff9030", true); b.log.push(`${def.name} went Critical (Domed chance was ${U.fmt1(domed)}%)`); B.fx(b, { t: "blood", x: def.x, y: def.y, size: 1.5, rot: 0, pool: true }); }
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
    B.fx(b, { t: "death", x: u.x, y: u.y, gore, side: u.side });
    B.fx(b, { t: "blood", x: u.x, y: u.y, size: 1.6, rot: b.rng() * 6.28, pool: true });
    if (gore) B.fx(b, { t: "gibs", x: u.x, y: u.y, n: 6 + Math.floor(b.rng() * 6), kind: u.corpseKind || "human" });
    B.fx(b, { t: "slowmo" });
  }

  // ---------- attacks ----------
  function attack(b, u, tgt, opts) {
    opts = opts || {};
    const w = u.weapon, r = R();
    let chance = hitChance(u, tgt, opts.accBonus);
    if (u.firstShot && u.quirks.includes("first_shot_hits") && w.style === "gun") chance = 100;
    u.firstShot = false;
    const roll = b.rng() * 100;
    xp(u, w.skill, XP().combatRoll); xp(tgt, "acrobatics", XP().evadeRoll);
    B.fx(b, { t: "shot", x1: u.x, y1: u.y, x2: tgt.x, y2: tgt.y, proj: w.projectile, melee: w.style !== "gun", hit: roll < chance, sfx: w.sfx });
    const math = b.rollMath ? ` (${Math.round(roll)}/${Math.round(chance)})` : "";
    if (roll >= chance) { u.stats.misses++; floatText(b, tgt, "MISS" + math, "#aaaaaa"); return; }
    // Parry (Duelist): contested Blades vs attacker weapon skill, melee only
    if (w.style !== "gun" && tgt.spec && tgt.spec.passive && tgt.spec.passive.type === "parry") {
      const pc = U.clamp(r.contestedBase + ((tgt.skills.blades || 0) - (u.skills[w.skill] || 0)) / r.contestedDiv, r.hitMin, r.hitMax);
      if (b.rng() * 100 < pc) { floatText(b, tgt, "PARRY" + (b.rollMath ? ` (${Math.round(pc)}%)` : ""), "#80d0ff"); xp(tgt, "blades", XP().combatRoll); return; }
    }
    u.stats.hits++; u.hitsLanded++;
    const crit = b.rng() * 100 < u.critChance + (opts.critBonus || 0);
    let dmg = w.dmg * (crit ? u.critDmg / 100 : 1) * (1 + (u.dmgPct + (opts.dmgBonus || 0)) / 100);
    if (crit) B.fx(b, { t: "shake", mag: C().shakeOnCrit });
    const pierce = w.tags.includes("pierce");
    const dir = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    applyDamage(b, u, tgt, dmg, w.type, { crit, pierce, dir });
    // weapon tags
    if (w.tags.includes("splash")) for (const o of enemiesOf(b, u)) if (o !== tgt && U.dist(o, tgt) <= DATA.items.tags.splash.radiusM) applyDamage(b, u, o, dmg * DATA.items.tags.splash.pct / 100, w.type, { pierce, small: true });
    const bleedSrc = w.tags.includes("bleed") ? DATA.items.tags.bleed : (u.spec && u.spec.passive && u.spec.passive.type === "bleed" ? u.spec.passive : null);
    if (bleedSrc && alive(tgt)) tgt.bleeds.push({ dps: (dmg * bleedSrc.pctOfHit / 100) / bleedSrc.durationSec, t: bleedSrc.durationSec, src: u });
    if (w.tags.includes("stagger") && u.hitsLanded % DATA.items.tags.stagger.everyNthHit === 0 && alive(tgt)) { tgt.atk += DATA.items.tags.stagger.interruptSec; floatText(b, tgt, "STAGGER", "#d0d0ff"); }
    if (u.spec && u.spec.passive && u.spec.passive.type === "slow" && alive(tgt)) tgt.buffs.slow = { pct: u.spec.passive.pct, t: u.spec.passive.durationSec };
    if (opts.knockdown && alive(tgt)) { tgt.buffs.knockdown = { t: opts.knockdown }; floatText(b, tgt, "KNOCKDOWN", "#ffb070"); B.fx(b, { t: "drag", x: tgt.x, y: tgt.y, dir }); }
  }

  function startReload(b, u) {
    const f = fumbleChance(u), roll = b.rng() * 100;
    xp(u, u.weapon.skill, XP().handlingRoll);
    u.reloadT = u.weapon.reload / attackSpeedMult(u);
    if (roll < f) { u.reloadT += R().fumblePenaltySec; u.stats.jams++; floatText(b, u, "JAMMED!" + (b.rollMath ? ` (${Math.round(f)}%)` : ""), "#ff5050"); B.fx(b, { t: "sfx", key: "sfx_jam" }); b.log.push(`${u.name} fumbled a reload (${U.fmt1(f)}% chance)`); }
    else floatText(b, u, "reload", "#999");
  }

  // ---------- abilities (auto mode, §7.5) ----------
  function abilities(b, u, dt) {
    if (!u.spec || !u.spec.active) return;
    u.cd = Math.max(0, u.cd - dt);
    if (u.cd > 0) return;
    const a = u.spec.active;
    if (a.type === "heal") {
      // stabilize a Critical ally first (Field Surgeon), else heal lowest ally below threshold
      const crit = a.stabilize ? b.units.find((o) => o.side === u.side && o.state === "critical" && !o.stabilized && U.dist(o, u) <= a.rangeM) : null;
      const tgt = crit || b.units.filter((o) => o.side === u.side && alive(o) && o.hp / o.maxHp * 100 < a.belowPct && U.dist(o, u) <= a.rangeM).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0];
      if (!tgt) return;
      const r = R();
      const chance = u.quirks.includes("heals_cant_fail") ? 100 : U.clamp(r.fieldHealBase + (u.medicine || 0) / r.fieldHealSkillDiv, r.hitMin, r.hitMax);
      const ok = b.rng() * 100 < chance;
      xp(u, "medicine", XP().fieldHeal);
      if (crit) {
        if (ok) { crit.state = "alive"; crit.stabilized = true; crit.hp = crit.maxHp * DATA.bodies.criticalCare.rallyHpPct / 100; floatText(b, crit, "STABILIZED", "#60ff90", true); b.log.push(`${u.name} stabilized ${crit.name}`); }
        else floatText(b, crit, "STABILIZE FAILED" + (b.rollMath ? ` (${Math.round(chance)}%)` : ""), "#c08080");
      } else {
        const amt = tgt.maxHp * a.healPctOfMax / 100 * (ok ? 1 : r.fieldHealFailMult);
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt); u.stats.heals += amt;
        floatText(b, tgt, (ok ? "+" : "weak heal +") + Math.round(amt) + (b.rollMath ? ` (${Math.round(chance)}%)` : ""), "#60ff90");
        B.fx(b, { t: "sfx", key: "sfx_heal" });
      }
      u.cd = a.cooldownSec;
    } else if (a.type === "stim") {
      const tgt = alliesOf(b, u).concat([u]).filter((o) => !o.buffs.stim && U.dist(o, u) <= a.rangeM && enemiesOf(b, o).length).sort((p, q) => q.weapon.dmg / q.weapon.interval - p.weapon.dmg / p.weapon.interval)[0];
      if (!tgt) return;
      tgt.buffs.stim = { pct: a.attackSpeedPct, t: a.durationSec }; floatText(b, tgt, "STIM +" + a.attackSpeedPct + "% AS", "#80ffff"); u.cd = a.cooldownSec;
    } else if (a.type === "charge") {
      const tgt = u.target;
      if (tgt && alive(tgt)) { const d = U.dist(u, tgt); if (d <= a.triggerRangeM && d > 2) { u.buffs.charge = { tgt, t: 2 }; floatText(b, u, "CHARGE!", "#ffb070"); u.cd = a.cooldownSec; } }
    } else if (a.type === "called_shot") {
      if (u.reloadT > 0 || u.ammo === 0 && u.weapon.mag > 0) return;
      const tgts = enemiesOf(b, u).filter((o) => U.dist(o, u) <= u.weapon.range);
      if (!tgts.length) return;
      const tgt = tgts.sort((p, q) => q.value - p.value || q.hp - p.hp)[0];
      floatText(b, u, "CALLED SHOT", "#ffe080");
      attack(b, u, tgt, { critBonus: a.critChanceBonus, accBonus: a.accuracyBonus });
      if (u.weapon.mag > 0) u.ammo = Math.max(0, u.ammo - 1);
      u.atk = u.weapon.interval / attackSpeedMult(u);
      u.cd = a.cooldownSec;
    }
  }

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
    for (const u of b.units) {
      if (!alive(u)) continue;
      u.moving = false;
      // buffs
      for (const k in u.buffs) { u.buffs[k].t -= dt; if (u.buffs[k].t <= 0) delete u.buffs[k]; }
      for (const bl of u.bleeds) { bl.t -= dt; applyDamage(b, bl.src, u, bl.dps * dt, "kinetic", { silent: true, noIntercept: true, dot: true }); if (!alive(u)) break; }
      u.bleeds = u.bleeds.filter((x) => x.t > 0);
      if (!alive(u)) continue;
      if (u.buffs.knockdown) continue;
      const foes = enemiesOf(b, u);
      if (!foes.length) continue;
      // target: nearest enemy
      if (!u.target || !alive(u.target) || b.rng() < 0.02) u.target = foes.reduce((best, o) => (U.dist(u, o) < U.dist(u, best) ? o : best), foes[0]);
      const tgt = u.target, d = U.dist(u, tgt);
      abilities(b, u, dt);
      // movement
      let mx = 0, my = 0;
      const speed = u.speed * (u.buffs.slow ? 1 - u.buffs.slow.pct / 100 : 1) * (u.buffs.charge ? u.spec.active.speedMult : 1);
      const reach = u.weapon.range + u.r + tgt.r;
      const dx = (tgt.x - u.x) / (d || 1), dy = (tgt.y - u.y) / (d || 1);
      if (u.buffs.charge) {
        mx = dx; my = dy;
        if (d <= reach) { attack(b, u, tgt, { dmgBonus: u.spec.active.bonusDmgPct, knockdown: u.spec.active.knockdownSec }); delete u.buffs.charge; u.atk = u.weapon.interval; }
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
      u.facing = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      // attacking
      if (u.reloadT > 0) { u.reloadT -= dt; if (u.reloadT <= 0) { u.reloadT = 0; u.ammo = u.weapon.mag; } continue; }
      u.atk -= dt;
      if (u.atk <= 0 && U.dist(u, tgt) <= reach && !u.buffs.charge) {
        attack(b, u, tgt);
        u.atk = u.weapon.interval / attackSpeedMult(u);
        if (u.weapon.mag > 0) { u.ammo--; if (u.ammo <= 0) startReload(b, u); }
      }
    }
    B.checkEnd(b);
  };

  B.checkEnd = function (b) {
    const body = b.units.find((u) => u.rank === "body");
    const alliesUp = b.units.some((u) => u.side === 0 && alive(u));
    const enemiesUp = b.units.some((u) => u.side === 1 && alive(u));
    let res = null;
    if (body && !alive(body)) res = "loss";
    else if (!alliesUp) res = "loss";
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

  B.summary = function (b) {
    const rows = b.units.filter((u) => u.side === 0 || u.stats.dmg > 0).map((u) => ({
      name: u.name, side: u.side, state: u.state, dmg: Math.round(u.stats.dmg), hits: u.stats.hits, misses: u.stats.misses, jams: u.stats.jams, kills: u.stats.kills, heals: Math.round(u.stats.heals)
    }));
    return { rows, log: b.log.slice(-12), duration: b.t, seed: b.seed };
  };
})(typeof window !== "undefined" ? window : globalThis);
