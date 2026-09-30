// Slice 3 §2 Manual abilities: your body's 1-2 actives (DATA.abilities). Pure logic (no DOM): the battle view calls
// aimStart / aimFire / aimCancel / setAuto; B.step calls tick (cooldowns + the Auto rules). Battle internals come from B._.
(function (root) {
  const G = root.G, U = G.Util;
  const A = G.Abilities = {};
  const D = () => DATA.abilities, B = () => G.Battle, I = () => G.Battle._;
  const alive = (u) => u.state === "alive";

  A.def = (id) => D().list[id];
  // the ability ids of a save body: Basic = Shove; human = [specialty active, class active]
  A.idsFor = function (body) {
    if (!body || !body.cls) return D().basic.slice();
    return [D().bySpec[body.spec], D().byClass[body.cls]].filter((id) => id && D().list[id]);
  };
  // battle slots for a body unit: [{ id, d, cd, max, auto }]; every ability starts at startCdFrac of its cooldown
  A.slotsFor = function (body, u) {
    const auto = (body && body.ablAuto) || {};
    return A.idsFor(body).map((id) => { const d = A.def(id), max = d.cooldownSec * (u.cdMult != null ? u.cdMult : 1); return { id, d, cd: max * D().startCdFrac, max, auto: auto[id] !== false }; });
  };
  A.range = (u, d) => (d.rangeM === "weapon" ? u.weapon.range : d.rangeM || 0);

  // ---- targeting ----
  // tgt: a unit (enemy / ally), or { x, y } for ground; self abilities take none. Returns an error string or null.
  A.validate = function (b, u, s, tgt) {
    const d = s.d;
    if (!alive(u)) return "Your body is down.";
    if (s.cd > 0) return `${d.name} is not ready (${U.fmt1(s.cd)} s).`;
    if (d.target === "self") return null;
    if (!tgt) return "Pick a target.";
    const R = A.range(u, d);
    if (d.target === "ground") { if (Math.hypot(tgt.x - u.x, tgt.y - u.y) > R + 0.01) return `Out of range (${R} m).`; return null; }
    if (d.target === "enemy" && (tgt.side === u.side || !alive(tgt))) return "Pick an enemy.";
    if (d.target === "ally" && (tgt.side !== u.side || !(alive(tgt) || (d.stabilize && tgt.state === "critical" && !tgt.stabilized)))) return "Pick one of your squad.";
    if (U.dist(u, tgt) > R + (tgt.r || 0) + u.r + 0.01) return `Out of range (${R} m).`;
    if (d.shot && u.reloadT > 0) return "Reloading.";
    return null;
  };
  // valid unit targets while aiming (highlighted by the view)
  A.validTargets = function (b, u, s) {
    if (s.d.target !== "enemy" && s.d.target !== "ally") return [];
    return b.units.filter((o) => o.state !== "dead" && !A.validate(b, u, Object.assign({}, s, { cd: 0 }), o));
  };
  A.hitChance = (b, u, s, tgt) => (s.d.shot && tgt && tgt.side !== u.side ? B().hitChance(u, tgt, s.d.accuracyBonus) : null);

  // ---- firing ----
  A.use = function (b, u, i, tgt, byAuto) {
    const s = u.abl && u.abl[i]; if (!s) return "No such ability.";
    const why = A.validate(b, u, s, tgt); if (why) return why;
    const d = s.d, X = I();
    if (d.target === "ground") tgt = { x: U.clamp(tgt.x, 0.5, b.W - 0.5), y: U.clamp(tgt.y, 0.5, b.H - 0.5) };
    X.floatText(b, u, d.name.toUpperCase(), "#ffe080", true);
    if (s.id !== "heal") X.xp(u, d.skill, X.XP().combatRoll);   // Field Heal gives its Field heal roll XP instead
    FIRE[s.id](b, u, d, tgt, X);
    s.cd = s.max; s.uses = (s.uses || 0) + 1; if (!byAuto) s.manual = (s.manual || 0) + 1;
    b.log.push(`${u.name} used ${d.name}${byAuto ? "" : " (manual)"}`);
    B().fx(b, { t: "ability", id: s.id, x: u.x, y: u.y });
    return null;
  };

  const knock = (b, o, fromX, fromY, m) => { const dx = o.x - fromX, dy = o.y - fromY, l = Math.hypot(dx, dy) || 1; o.x = U.clamp(o.x + dx / l * m, 0.5, b.W - 0.5); o.y = U.clamp(o.y + dy / l * m, 0.5, b.H - 0.5); };
  A.knock = knock;
  const FIRE = {
    shove(b, u, d, t, X) { knock(b, t, u.x, u.y, d.knockbackM); t.buffs.stagger = { t: d.staggerSec }; X.floatText(b, t, "STAGGER", "#d0d0ff"); B().fx(b, { t: "drag", x: t.x, y: t.y, dir: Math.atan2(t.y - u.y, t.x - u.x) }); },
    taunt(b, u, d, t, X) { for (const o of X.enemiesOf(b, u)) if (U.dist(o, u) <= d.radiusM) { o.buffs.taunt = { src: u, t: d.sec }; o.target = u; } u.buffs.armorUp = { v: d.armor, t: d.sec }; },
    dash(b, u, d, t) { u.buffs.dash = { x: t.x, y: t.y, t: d.maxSec, speedMult: d.speedMult }; u.buffs.nextHit = { dmgPct: d.nextHitDmgPct, t: 10 }; },
    frag(b, u, d, t) { (b.nades = b.nades || []).push({ x: t.x, y: t.y, sx: u.x, sy: u.y, t: d.fuseSec, src: u, d }); B().fx(b, { t: "grenade", x1: u.x, y1: u.y, x2: t.x, y2: t.y, fuse: d.fuseSec }); },
    smoke(b, u, d, t) { (b.zones = b.zones || []).push({ kind: "smoke", x: t.x, y: t.y, r: d.radiusM, t: d.sec, max: d.sec, evasion: d.evasion }); },
    brace(b, u, d) { u.buffs.brace = { t: d.sec, dmgTakenPct: d.dmgTakenPct, interceptPct: d.interceptPct }; },
    charge(b, u, d, t) { u.target = t; u.buffs.charge = { tgt: t, t: d.maxSec, speedMult: d.speedMult, dmgPct: d.bonusDmgPct, knockdown: d.knockdownSec }; },
    rend(b, u, d, t) { u.target = t; u.buffs.charge = { tgt: t, t: d.maxSec, speedMult: d.speedMult, dmgPct: 0, knockdown: 0 }; u.buffs.rend = { t: 8, bleedMult: d.bleedMult }; },
    riposte(b, u, d) { u.buffs.riposte = { t: d.sec, counterPct: d.counterPct }; },
    called_shot(b, u, d, t, X) {
      X.attack(b, u, t, { critBonus: d.critChanceBonus, accBonus: d.accuracyBonus });
      if (u.weapon.mag > 0) u.ammo = Math.max(0, u.ammo - 1);
      u.atk = u.weapon.interval / X.attackSpeedMult(u);
    },
    suppress(b, u, d, t) { const z = { kind: "suppress", x: t.x, y: t.y, r: d.radiusM, t: d.sec, max: d.sec, side: u.side, src: u, slowPct: d.slowPct, accuracy: d.accuracy, attackSpeedPct: d.attackSpeedPct }; (b.zones = b.zones || []).push(z); u.supZone = z; },
    heal(b, u, d, tgt, X) {
      const r = DATA.config.rolls, chance = u.quirks.includes("heals_cant_fail") ? 100 : U.clamp(r.fieldHealBase + (u.medicine || 0) / r.fieldHealSkillDiv, r.hitMin, r.hitMax);
      const ok = b.rng() * 100 < chance;
      X.xp(u, "medicine", X.XP().fieldHeal);
      if (tgt.state === "critical") {
        if (ok) { tgt.state = "alive"; tgt.stabilized = true; tgt.hp = tgt.maxHp * DATA.bodies.criticalCare.rallyHpPct / 100; X.floatText(b, tgt, "STABILIZED", "#60ff90", true); b.log.push(`${u.name} stabilized ${tgt.name}`); }
        else X.floatText(b, tgt, "STABILIZE FAILED" + (b.rollMath ? ` (${Math.round(chance)}%)` : ""), "#c08080");
      } else {
        const amt = tgt.maxHp * d.healPctOfMax / 100 * (ok ? 1 : r.fieldHealFailMult);
        tgt.hp = Math.min(tgt.maxHp, tgt.hp + amt); u.stats.heals += amt;
        X.floatText(b, tgt, (ok ? "+" : "weak heal +") + Math.round(amt) + (b.rollMath ? ` (${Math.round(chance)}%)` : ""), "#60ff90");
        B().fx(b, { t: "sfx", key: "sfx_heal" });
      }
    },
    stim(b, u, d, t, X) { t.buffs.stim = { pct: d.attackSpeedPct, t: d.durationSec }; X.floatText(b, t, "STIM +" + d.attackSpeedPct + "% AS", "#80ffff"); }
  };
  A.FIRE = FIRE;

  // ---- Auto rules: return a target (unit / point / true for self) or null ----
  const within = (list, p, m) => list.filter((o) => Math.hypot(o.x - p.x, o.y - p.y) <= m);
  const AUTO = {
    shove: (b, u, d, X) => X.enemiesOf(b, u).find((o) => o.ai === "melee" && U.dist(o, u) <= d.rangeM + o.r + u.r) || null,
    taunt: (b, u, d, X) => (X.alliesOf(b, u).some((o) => U.dist(o, u) <= d.radiusM && o.hp / o.maxHp * 100 < d.autoAllyBelowPct) ? true : null),
    dash(b, u, d, X) {
      const foes = X.enemiesOf(b, u); if (!foes.length) return null;
      const low = foes.reduce((m, o) => (o.hp < m.hp ? o : m), foes[0]), dist = U.dist(u, low);
      if (dist <= d.autoMinDistM) return null;
      const stop = Math.min(d.rangeM, Math.max(0, dist - (u.weapon.range + u.r + low.r) * 0.8));
      if (stop < 1) return null;
      return { x: u.x + (low.x - u.x) / dist * stop, y: u.y + (low.y - u.y) / dist * stop, unit: low };
    },
    frag(b, u, d, X) {
      const foes = X.enemiesOf(b, u), mine = b.units.filter((o) => o.side === u.side && o.state !== "dead");
      let best = null, bestN = d.autoMinEnemies - 1;
      for (const c of foes) {
        if (U.dist(c, u) > d.rangeM) continue;
        const n = within(foes, c, d.radiusM).length;
        if (n > bestN && !within(mine, c, d.radiusM).length) { best = c; bestN = n; }
      }
      return best ? { x: best.x, y: best.y } : null;
    },
    smoke(b, u, d) {
      const low = b.units.filter((o) => o.side === u.side && alive(o) && o.hp / o.maxHp * 100 < d.autoBelowPct);
      for (let i = 0; i < low.length; i++) for (let j = i + 1; j < low.length; j++) if (U.dist(low[i], low[j]) <= d.radiusM) {
        const p = { x: (low[i].x + low[j].x) / 2, y: (low[i].y + low[j].y) / 2 };
        if (Math.hypot(p.x - u.x, p.y - u.y) <= d.rangeM) return p;
      }
      return null;
    },
    brace: (b, u, d, X) => (X.enemiesOf(b, u).filter((o) => o.target === u).length >= d.autoTargetedBy || X.alliesOf(b, u).some((o) => U.dist(o, u) <= d.autoAllyM && o.hp / o.maxHp * 100 < d.autoAllyBelowPct) ? true : null),
    charge(b, u, d) { const t = u.target; if (!t || !alive(t)) return null; const dd = U.dist(u, t); return dd <= d.autoRangeM && dd > 2 ? t : null; },
    rend(b, u, d, X) { const near = X.enemiesOf(b, u).filter((o) => U.dist(o, u) <= d.rangeM + o.r + u.r); return near.length ? near.reduce((m, o) => (o.hp < m.hp ? o : m), near[0]) : null; },
    riposte: (b, u, d, X) => (X.enemiesOf(b, u).some((o) => o.ai === "melee" && U.dist(o, u) <= d.autoMeleeM + o.r + u.r) ? true : null),
    called_shot(b, u, d, X) {
      if (u.reloadT > 0 || (u.ammo === 0 && u.weapon.mag > 0)) return null;
      const tgts = X.enemiesOf(b, u).filter((o) => U.dist(o, u) <= u.weapon.range);
      return tgts.length ? tgts.sort((p, q) => q.value - p.value || q.hp - p.hp)[0] : null;
    },
    suppress(b, u, d, X) {
      const foes = X.enemiesOf(b, u).filter((o) => U.dist(o, u) <= u.weapon.range);
      let best = null, bestN = d.autoMinEnemies - 1;
      for (const c of foes) { const n = within(foes, c, d.radiusM).length; if (n > bestN) { best = c; bestN = n; } }
      return best ? { x: best.x, y: best.y } : null;
    },
    heal(b, u, d, X) {
      const crit = d.stabilize ? b.units.find((o) => o.side === u.side && o.state === "critical" && !o.stabilized && U.dist(o, u) <= d.rangeM) : null;
      return crit || b.units.filter((o) => o.side === u.side && alive(o) && o.hp / o.maxHp * 100 < d.belowPct && U.dist(o, u) <= d.rangeM).sort((p, q) => p.hp / p.maxHp - q.hp / q.maxHp)[0] || null;
    },
    stim: (b, u, d, X) => X.alliesOf(b, u).concat([u]).filter((o) => !o.buffs.stim && U.dist(o, u) <= d.rangeM && X.enemiesOf(b, o).length).sort((p, q) => q.weapon.dmg / q.weapon.interval - p.weapon.dmg / p.weapon.interval)[0] || null
  };
  A.AUTO = AUTO;
  A.autoTarget = (b, u, s) => AUTO[s.id](b, u, s.d, I());

  // per step (from B.step, for units with abl): cooldowns, then Auto fires whatever is ready and has a target
  A.tick = function (b, u, dt) {
    for (let i = 0; i < u.abl.length; i++) {
      const s = u.abl[i];
      s.cd = Math.max(0, s.cd - dt);
      if (s.cd > 0 || !s.auto) continue;
      if (b.aim && b.aim.u === u && b.aim.i === i) continue;   // you're aiming it: Auto waits
      const t = A.autoTarget(b, u, s); if (!t) continue;
      A.use(b, u, i, t === true ? null : t, true);
    }
  };

  // ---- aiming (the view) ----
  A.body = (b) => b.units.find((o) => o.rank === "body" && o.side === 0);
  // press the button / hotkey: self abilities fire at once; the rest start aiming. Pressing again cancels.
  A.aimStart = function (b, i) {
    const u = A.body(b); if (!u || !u.abl || !u.abl[i]) return "No such ability.";
    if (!alive(u)) return "Your body is down.";
    if (b.phase !== "fight" || b.over) return "The fight hasn't started.";
    if (b.aim && b.aim.i === i) { A.aimCancel(b); return null; }
    const s = u.abl[i];
    if (s.cd > 0) return `${s.d.name} is not ready (${U.fmt1(s.cd)} s).`;
    if (s.d.target === "self") { b.aim = null; return A.use(b, u, i, null, false); }
    b.aim = { u, i, t0: b.t };
    return null;
  };
  A.aimCancel = function (b) { b.aim = null; };   // no cooldown spent
  A.aimFire = function (b, tgt) {
    if (!b.aim) return "Not aiming.";
    const { u, i } = b.aim, err = A.use(b, u, i, tgt, false);
    if (!err) b.aim = null;
    return err;
  };
  // Auto pip: remembered per body (save body.ablAuto)
  A.setAuto = function (u, i, on) {
    const s = u.abl && u.abl[i]; if (!s) return;
    s.auto = !!on;
    const body = u.ref && u.ref.body; if (body) { body.ablAuto = body.ablAuto || {}; if (on) delete body.ablAuto[s.id]; else body.ablAuto[s.id] = false; }
  };
  // sim seconds per real second: aiming = aimTimeScale of 1x (absolute) or 0 in "Full pause"; else speed x slow-mo
  A.timeScale = function (b, speed, slowmo) {
    if (b.paused) return 0;   // tactical pause (js/tactical.js): frozen completely
    if (b.aim) { const mode = (G.state && G.state.settings && G.state.settings.aimMode) || DATA.config.settings.aimMode; return mode === "pause" ? 0 : D().aimTimeScale; }
    return speed * (slowmo || 1);
  };
})(typeof window !== "undefined" ? window : globalThis);
