// Slice 3 §4 enemy behaviours: Machines (drone mark + orbit, crawler mine, sentry cone / burst / vent, Warden shield)
// and Hunters (Stalker unseen, Marksman aimed shot, Captain aura / "Close in!" / retreat). Numbers: DATA.enemies.units[id].beh.
// Pure logic, called from js/battle.js (B.step, applyDamage, kill, hitChance, B.create).
(function (root) {
  const G = root.G, U = G.Util;
  const EA = G.EnemyAI = {};
  const X = () => G.Battle._;
  const alive = (u) => u.state === "alive";
  const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return Math.abs(d); };
  EA.angDiff = angDiff;
  const R = () => DATA.config.rolls;

  // unit setup (B.unitFromEnemy)
  EA.init = function (u) {
    const t = u.beh && u.beh.turret; if (t) { u.gunAng = Math.PI; u.bursts = 0; u.burstLeft = 0; u.burstT = 0; u.ventT = 0; }
    if (u.beh && u.beh.mark) u.markT = u.beh.mark.everySec;
    if (u.beh && u.beh.mine) u.atk = 1e9;   // its "weapon" never swings
    if (u.beh && u.beh.burst) { u.burstCd = u.beh.burst.firstSec; u.cb = null; }
  };

  // B.create: Stalkers roll Unseen (Stealth vs the squad's best Perception, contested; setup.ambush = automatic),
  // and an unseen Stalker spawns behind your placement zone
  EA.onCreate = function (b, setup) {
    const squad = b.units.filter((o) => o.side === 0);
    const perc = squad.reduce((m, o) => Math.max(m, (o.skills && o.skills.perception) || 0), 0);
    for (const u of b.units) {
      const us = u.beh && u.beh.unseen; if (!us) continue;
      const pc = U.clamp(R().contestedBase + (us.stealth - perc) / R().contestedDiv, R().hitMin, R().hitMax);
      const roll = b.rng() * 100;
      u.unseenRoll = { chance: pc, roll, perception: perc, ambush: !!setup.ambush };
      if (setup.ambush || roll < pc) {
        u.unseen = true; u.unseenT = us.sec; u.unseenBonus = true;
        u.x = 0.6 + b.rng() * 0.6; u.y = U.clamp(2 + b.rng() * (b.H - 4), 1, b.H - 1); u.facing = 0;
        b.log.push(`${u.name} is Unseen (${setup.ambush ? "ambush" : `Stealth ${us.stealth} vs Perception ${perc}: ${Math.round(pc)}%, rolled ${Math.floor(roll)}`})`);
      } else b.log.push(`${u.name} was spotted (Stealth ${us.stealth} vs Perception ${perc}: ${Math.round(pc)}%, rolled ${Math.floor(roll)})`);
    }
  };

  // once per step, before the unit loop: Captain aura, retreat movement, the unseen timer
  EA.stepStart = function (b, dt) {
    const cap = b.units.find((o) => o.beh && o.beh.captain && alive(o));
    for (const u of b.units) {
      if (u.family === "hunters") u.auraAcc = cap && u !== cap ? cap.beh.captain.accAura : 0;
      if (u.unseen && b.phase === "fight") { u.unseenT -= dt; if (u.unseenT <= 0) EA.reveal(b, u, "4 s passed"); }
      if (u.state === "retreating") {
        u.retreatT -= dt; u.moving = true; u.facing = 0;
        u.x += Math.max(u.speed * 1.5, (b.W + 1 - u.x) / Math.max(0.2, u.retreatT)) * dt;
        if (u.x >= b.W - 0.3 || u.retreatT <= 0) { u.state = "fled"; u.x = Math.min(u.x, b.W - 0.3); }
      }
    }
  };
  EA.reveal = function (b, u, why) { if (!u.unseen) return; u.unseen = false; X().floatText(b, u, "REVEALED", "#ff9090", true); b.log.push(`${u.name} is revealed (${why})`); };

  // targeting overrides (null = the default nearest)
  EA.target = function (b, u, foes) {
    const be = u.beh; if (!be || !foes.length) return null;
    const body = foes.find((o) => o.rank === "body" && o.side === 0);
    if (be.targetBody) {   // Marksman: your body while it's up, then the highest deploy cost
      if (body) return body;
      return foes.reduce((m, o) => ((o.value || 0) > (m.value || 0) ? o : m), foes[0]);
    }
    if (be.targetWounded) {   // Stalker: the most wounded; your body first once it's below 50%
      if (body && body.hp / body.maxHp * 100 < be.targetWounded.bodyBelowPct) return body;
      return foes.reduce((m, o) => (o.hp / o.maxHp < m.hp / m.maxHp ? o : m), foes[0]);
    }
    if (be.seekDensest || be.mine || be.turret) return foes.reduce((m, o) => (U.dist(u, o) < U.dist(u, m) ? o : m), foes[0]);
    return null;
  };

  // per unit, after targeting. true = fully handled this tick (skip default movement + attack)
  EA.tick = function (b, u, dt, foes) {
    const be = u.beh; if (!be) return false;
    if (be.mark) {   // Scout Drone: every 6 s mark the nearest unmarked squad unit: +20% damage from all enemies for 4 s
      u.markT -= dt;
      if (u.markT <= 0) {
        u.markT = be.mark.everySec;
        const cand = foes.filter((o) => !o.buffs.marked);
        const t = cand.length ? cand.reduce((m, o) => (U.dist(u, o) < U.dist(u, m) ? o : m), cand[0]) : null;
        if (t) { t.buffs.marked = { t: be.mark.sec, pct: be.mark.dmgTakenPct, src: u }; X().floatText(b, t, "MARKED", "#ff4040", true); G.Battle.fx(b, { t: "sfx", key: "sfx_ability_aim" }); b.log.push(`${u.name} marks ${t.name}`); }
      }
    }
    if (be.mine) return mineTick(b, u, dt, foes);
    if (be.turret) return turretTick(b, u, dt, foes);
    if (be.marksman && u.aimT > 0) return aimTick(b, u, dt);
    if (be.burst) return burstTick(b, u, dt, foes);
    return false;
  };

  // design call (milestone 4): the Captain's telegraphed burst. Phases on u.cb: aim (tracking, then locked) -> fire.
  // Between bursts it returns false: normal movement and its (weak) sustained carbine fire.
  // b.capStats: { bursts, rounds, hits, dodgeTries, dodges (bursts whose target stepped out of the line and took none of it) }
  function burstTick(b, u, dt, foes) {
    const bs = u.beh.burst, cs = b.capStats = b.capStats || { bursts: 0, rounds: 0, hits: 0, dodgeTries: 0, dodges: 0 };
    if (!u.cb) {
      u.burstCd -= dt;
      const tgt = u.target;
      if (u.burstCd > 0 || !tgt || !alive(tgt) || U.dist(u, tgt) > u.weapon.range + u.r + tgt.r) return false;
      u.cb = { phase: "aim", t: bs.aimSec, max: bs.aimSec, tgt, ang: Math.atan2(tgt.y - u.y, tgt.x - u.x), locked: false, hitTgt: false };
      X().floatText(b, u, "TAKING AIM", "#ff5050", true); G.Battle.fx(b, { t: "sfx", key: "sfx_ability_aim" }); b.log.push(`${u.name} takes aim at ${tgt.name}`);
    }
    const c = u.cb; u.moving = false;
    if (c.phase === "aim") {
      if (!c.locked && c.tgt && alive(c.tgt)) c.ang = Math.atan2(c.tgt.y - u.y, c.tgt.x - u.x);
      u.facing = c.ang; c.t -= dt;
      if (!c.locked && c.t <= bs.lockSec) {
        c.locked = true;
        const t = c.tgt;
        if (t && alive(t) && t.side !== u.side) {   // the target tries to step out of the line
          const pct = Math.min(bs.reactMax, bs.reactBase + bs.reactPerAcro * ((t.skills && t.skills.acrobatics) || 0)), roll = b.rng() * 100;
          cs.dodgeTries++; c.react = { pct, roll: Math.floor(roll), ok: roll < pct };
          if (roll < pct) {
            let px = -Math.sin(c.ang), py = Math.cos(c.ang);   // perpendicular to the line, toward the roomier side
            if ((t.y + py * 3 > b.H - 1) || (t.y + py * 3 < 1)) { px = -px; py = -py; }
            t.buffs.sidestep = { t: bs.lockSec + bs.rounds * bs.gapSec + 0.1, dx: px, dy: py };
            X().floatText(b, t, "SIDESTEP", "#9fe0ff", true);
          }
          b.log.push(`${t.name} ${roll < pct ? "steps out of the line" : "doesn't react"} (${Math.round(pct)}%, rolled ${Math.floor(roll)})`);
        }
      }
      if (c.t <= 0) { c.phase = "fire"; c.left = bs.rounds; c.gap = 0; cs.bursts++; }
      return true;
    }
    // fire: each round goes down the locked line and hits the first squad unit within widthM of it
    c.gap -= dt;
    if (c.gap <= 0) {
      const ex = Math.cos(c.ang), ey = Math.sin(c.ang), R = u.weapon.range + 2;
      let hit = null, best = 1e9;
      for (const o of foes) {
        const rx = o.x - u.x, ry = o.y - u.y, along = rx * ex + ry * ey; if (along < 0 || along > R) continue;
        if (Math.abs(rx * ey - ry * ex) <= o.r + bs.widthM && along < best) { best = along; hit = o; }
      }
      cs.rounds++;
      if (hit) { cs.hits++; if (hit === c.tgt) c.hitTgt = true; X().attack(b, u, hit, { baseDmg: bs.dmg, accBonus: bs.accBonus, pierce: bs.pierce }); }
      else { G.Battle.fx(b, { t: "shot", x1: u.x, y1: u.y, x2: u.x + ex * R, y2: u.y + ey * R, hit: false, sfx: u.weapon.sfx }); if (c.left === bs.rounds && c.tgt && alive(c.tgt)) X().floatText(b, c.tgt, "DODGED", "#9fe0ff", true); }
      c.left--; c.gap = bs.gapSec;
      if (c.left <= 0) { if (c.react && c.react.ok && !c.hitTgt) cs.dodges++; u.cb = null; u.burstCd = bs.everySec; u.atk = u.weapon.interval; }
    }
    return true;
  }
  EA.burstInfo = (u) => (u.cb ? { phase: u.cb.phase, t: u.cb.t, max: u.cb.max, ang: u.cb.ang, locked: u.cb.locked, tgt: u.cb.tgt } : null);

  // movement overrides: { mx, my } or null
  EA.move = function (b, u, tgt, d, reach) {
    const be = u.beh; if (!be) return null;
    if (be.fly) {   // Drone: circles its target at ~10 m
      const a = Math.atan2(u.y - tgt.y, u.x - tgt.x) + 0.5, px = tgt.x + Math.cos(a) * be.fly.orbitM, py = tgt.y + Math.sin(a) * be.fly.orbitM;
      const qx = U.clamp(px, 1, b.W - 1), qy = U.clamp(py, 1, b.H - 1), l = Math.hypot(qx - u.x, qy - u.y) || 1;
      return { mx: (qx - u.x) / l, my: (qy - u.y) / l };
    }
    if (be.seekDensest) {   // Warden: walks toward the densest group of squad units; stops when something is in reach
      if (d <= reach * 0.9) return { mx: 0, my: 0 };
      const foes = X().enemiesOf(b, u); let best = null, bn = -1;
      for (const o of foes) { const n = foes.filter((q) => U.dist(q, o) <= be.seekDensest.radiusM).length; if (n > bn) { bn = n; best = o; } }
      const grp = foes.filter((q) => U.dist(q, best) <= be.seekDensest.radiusM), cx = grp.reduce((s, q) => s + q.x, 0) / grp.length, cy = grp.reduce((s, q) => s + q.y, 0) / grp.length;
      const l = Math.hypot(cx - u.x, cy - u.y) || 1; u.seekPt = { x: cx, y: cy };
      return { mx: (cx - u.x) / l, my: (cy - u.y) / l };
    }
    return null;
  };

  // design call (milestone 3): your units flank a shielded unit. From inside its front arc they move to a point at
  // arc/2 + flank.extraDeg off its facing (the nearer side), at their current distance (inside their reach). null = no change.
  EA.flank = function (b, u, tgt, d, reach) {
    const F = DATA.config.battle.flank, sh = tgt.beh.shield; if (!F || !F.enabled) return null;
    const bear = Math.atan2(u.y - tgt.y, u.x - tgt.x), half = sh.arcDeg / 2 * Math.PI / 180;
    if (angDiff(tgt.facing, bear) > half + 0.05) return null;   // already on its side / back
    const off = half + F.extraDeg * Math.PI / 180;
    const cands = [tgt.facing + off, tgt.facing - off];
    const a = angDiff(cands[0], bear) <= angDiff(cands[1], bear) ? cands[0] : cands[1];
    const rr = U.clamp(Math.min(d, reach * 0.85), tgt.r + u.r + 0.3, 99);
    const gx = U.clamp(tgt.x + Math.cos(a) * rr, 1, b.W - 1), gy = U.clamp(tgt.y + Math.sin(a) * rr, 1, b.H - 1), l = Math.hypot(gx - u.x, gy - u.y);
    if (l < 0.2) return null;
    u.flanking = true;
    return { mx: (gx - u.x) / l, my: (gy - u.y) / l };
  };
  // turn-rate limited facing (the Warden)
  EA.turn = function (from, to, degPerSec, dt) {
    if (from == null || isNaN(from)) return to;
    let da = to - from; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const st = degPerSec * Math.PI / 180 * dt; return Math.abs(da) <= st ? to : from + Math.sign(da) * st;
  };

  // Marksman: an attack becomes a 1.5 s aim (red line); 20+ damage during it resets it; the aimed shot gets +50% crit
  EA.startAttack = function (b, u, tgt) {
    const m = u.beh && u.beh.marksman; if (!m) return false;
    u.aimT = m.aimSec; u.aimDmg = 0; u.aimTgt = tgt; u.aimMax = m.aimSec;
    return true;
  };
  function aimTick(b, u, dt) {
    const tgt = u.aimTgt;
    if (!tgt || !alive(tgt) || tgt.unseen) { u.aimT = 0; u.aimTgt = null; return false; }
    u.facing = Math.atan2(tgt.y - u.y, tgt.x - u.x); u.moving = false;
    u.aimT -= dt;
    if (u.aimT <= 0) { u.aimT = 0; u.aimTgt = null; X().attack(b, u, tgt, { critBonus: u.beh.marksman.critBonus }); u.atk = u.weapon.interval / X().attackSpeedMult(u); }
    return true;
  }

  // Crawler Mine: rush the nearest unit; at 1.5 m arm (0.8 s beeping), then blast everyone in 2.5 m (machines too)
  function mineTick(b, u, dt, foes) {
    const mn = u.beh.mine;
    if (u.fuse != null) {
      u.fuse -= dt; u.moving = false;
      if (u.fuse <= 0) { explode(b, u, 1); X().kill(b, u, false, "blast"); b.log.push(`${u.name} detonated`); }
      return true;
    }
    const tgt = u.target; if (!tgt) return true;
    const d = U.dist(u, tgt);
    if (d <= mn.armM + tgt.r + u.r) { u.fuse = mn.fuseSec; X().floatText(b, u, "BEEP!", "#ff4040", true); G.Battle.fx(b, { t: "sfx", key: "sfx_ability_aim" }); b.log.push(`${u.name} arms next to ${tgt.name}`); return true; }
    return false;   // default melee movement closes in (its weapon never attacks)
  }
  function explode(b, u, frac) {
    if (u.exploded) return; u.exploded = true;
    const mn = u.beh.mine, dmg = mn.dmg * frac;
    G.Battle.fx(b, { t: "explosion", x: u.x, y: u.y, r: mn.radiusM, metal: true }); G.Battle.fx(b, { t: "sfx", key: "sfx_explosion" }); G.Battle.fx(b, { t: "shake", mag: frac >= 1 ? 8 : 4 });
    for (const o of b.units.filter((o) => o !== u && alive(o) && Math.hypot(o.x - u.x, o.y - u.y) <= mn.radiusM + o.r)) X().applyDamage(b, u, o, dmg, mn.dtype, { dir: Math.atan2(o.y - u.y, o.x - u.x), noIntercept: true });
    b.log.push(`${u.name} ${frac >= 1 ? "explodes" : "pops"}: ${Math.round(dmg)} in ${mn.radiusM} m`);
  }
  EA.explode = explode;

  // Sentry: stationary; the gun turns 90°/s and fires 5-round bursts only inside its 60° cone; vents after 3 bursts
  function turretTick(b, u, dt, foes) {
    const t = u.beh.turret; u.moving = false;
    if (u.ventT > 0) { u.ventT -= dt; return true; }
    const tgt = u.target; if (!tgt) return true;
    const want = Math.atan2(tgt.y - u.y, tgt.x - u.x), step = t.turnDegPerSec * Math.PI / 180 * dt;
    let da = want - u.gunAng; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    u.gunAng += Math.abs(da) <= step ? da : Math.sign(da) * step;
    u.facing = Math.cos(u.gunAng) < 0 ? Math.PI : 0;
    const inCone = (o) => angDiff(u.gunAng, Math.atan2(o.y - u.y, o.x - u.x)) <= t.coneDeg / 2 * Math.PI / 180 && U.dist(u, o) <= u.weapon.range + u.r + o.r;
    u.atk -= dt;
    if (u.burstLeft > 0) {
      u.burstT -= dt;
      if (u.burstT <= 0) {
        const shot = inCone(tgt) ? tgt : foes.find(inCone);
        if (shot) X().attack(b, u, shot);
        u.burstLeft--; u.burstT = t.burstGapSec;
        if (u.burstLeft <= 0) { u.bursts++; if (u.bursts % t.ventAfter === 0) { u.ventT = t.ventSec; X().floatText(b, u, "VENTING", "#c0e0ff", true); b.log.push(`${u.name} vents (+${t.ventDmgTakenPct}% damage taken)`); } }
      }
      return true;
    }
    if (u.atk <= 0 && inCone(tgt)) { u.burstLeft = t.burst; u.burstT = 0; u.atk = u.weapon.interval; }
    return true;
  }

  // damage taken multiplier (applyDamage, direct hits): drone mark, sentry vent, Warden front shield; Marksman aim reset
  EA.damageMult = function (b, att, def, dmg, opts) {
    let m = 1;
    if (def.buffs.marked && att && att.side !== def.side) m *= 1 + def.buffs.marked.pct / 100;
    if (def.ventT > 0) m *= 1 + def.beh.turret.ventDmgTakenPct / 100;
    const sh = def.beh && def.beh.shield;
    if (sh && !opts.dot && (opts.dir != null || att)) {
      const from = opts.dir != null ? opts.dir + Math.PI : Math.atan2(att.y - def.y, att.x - def.x);
      if (angDiff(def.facing, from) <= sh.arcDeg / 2 * Math.PI / 180) {
        m *= 1 - sh.pct / 100;
        G.Battle.fx(b, { t: "shield", x: def.x, y: def.y, rot: def.facing }); G.Battle.fx(b, { t: "sfx", key: "sfx_hit_metal" });
        opts.blocked = true; def.shieldBlocked = (def.shieldBlocked || 0) + 1;
      } else def.flankHits = (def.flankHits || 0) + 1;   // a side / back hit: goes around the shield (sims report the share)
    }
    return m;
  };
  EA.afterDamage = function (b, def, dmg, opts) {
    if (def.aimT > 0 && !opts.dot) {
      def.aimDmg += dmg;
      if (def.aimDmg >= def.beh.marksman.resetDmg) { def.aimT = def.beh.marksman.aimSec; def.aimDmg = 0; X().floatText(b, def, "AIM RESET", "#ffd0d0"); }
    }
  };
  // accuracy modifiers (hitChance): melee -20 vs a flying drone; Captain aura
  EA.accMod = function (att, def) {
    let a = att.auraAcc || 0;
    if (def.beh && def.beh.fly && att.weapon.style !== "gun") a -= def.beh.fly.meleeAccPenalty;
    return a;
  };
  // attack() hook: an Unseen Stalker's first hit +100% and it's revealed
  EA.attackBonus = function (b, u) {
    if (!u.unseenBonus) return 0;
    const pct = u.beh.unseen.firstHitPct; u.unseenBonus = false; EA.reveal(b, u, "it struck"); return pct;
  };

  // kill() hook: crawler pops; Hunters "Close in!" / Captain retreat
  EA.onDeath = function (b, u) {
    if (u.beh && u.beh.mine && !u.exploded) explode(b, u, u.fuse != null ? 1 : u.beh.mine.earlyPct / 100);
    if (u.family !== "hunters") return;
    const cap = b.units.find((o) => o.beh && o.beh.captain && o !== u && alive(o));
    if (u.beh && u.beh.captain) {
      const c = u.beh.captain; let n = 0;
      for (const o of b.units) if (o.family === "hunters" && alive(o) && o.side === u.side) { o.state = "retreating"; o.retreatT = c.retreatSec; o.unseen = false; n++; }
      if (n) { G.Battle.fx(b, { t: "text", x: b.W / 2, y: 3, text: "THE HUNTERS RETREAT!", color: "#ffd84a", big: true }); b.log.push(`The Captain is down: ${n} Hunter(s) retreat`); }
      b.captainKilled = true;
    } else if (cap) {
      const c = cap.beh.captain;
      for (const o of b.units) if (o.family === "hunters" && alive(o)) { o.buffs.closeIn = { pct: c.closeInAsPct, t: c.closeInSec }; }
      X().floatText(b, cap, "CLOSE IN!", "#ff8060", true); b.log.push(`${cap.name}: "Close in!" (+${c.closeInAsPct}% Attack Speed ${c.closeInSec} s)`);
    }
  };

  // B.buildEnemyGroup: maxPerBattle (Crawler 3, Sentry 1, Captain 1)
  EA.allowed = (id, picked) => { const d = DATA.enemies.units[id]; return !d.maxPerBattle || picked.filter((k) => k === id).length < d.maxPerBattle; };
})(typeof window !== "undefined" ? window : globalThis);
