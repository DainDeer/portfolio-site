// Tactical pause (Megan, Sep 29): pause the fight at any time, queue ready abilities (aimed) and item uses from the
// carried inventory (Med Supplies), then resume: the queue runs in order. Items channel for
// DATA.config.battle.tacticalPause.channelSec after the resume. Pure logic; js/battleview.js draws and takes input.
// b.paused, b.tq = [{ kind: "ability" | "med", u, i?, tgt?, n }], u.channel = { kind, t, max, ... }.
(function (root) {
  const G = root.G, U = G.Util;
  const T = G.Tactical = {};
  const CF = () => DATA.config.battle.tacticalPause || {};
  const alive = (u) => u && u.state === "alive";
  const run = () => G.state && G.state.run;

  T.on = () => !!CF().enabled;
  T.canPause = (b) => T.on() && b.phase === "fight" && !b.over;
  T.pause = function (b) { if (!T.canPause(b)) return "Not in a fight."; b.paused = true; b.tq = b.tq || []; return null; };
  T.queue = (b) => (b.tq = b.tq || []);
  // resume: run the queue in order (abilities fire now, items start channelling; 2 items on one unit chain)
  T.resume = function (b) {
    if (!b.paused) return null;
    b.paused = false; if (G.Abilities) G.Abilities.aimCancel(b); b.itemAim = null;
    const q = T.queue(b).splice(0); const done = [];
    for (const a of q) {
      a.u.queued = (a.u.queued || 1) - 1;
      if (a.kind === "escape") { const err = G.Escape.start(b); if (err) b.log.push(`Queued Break away failed: ${err}`); done.push({ a, err }); continue; }
      if (a.kind === "ability") {
        const s = a.u.abl[a.i]; s.queued = false;
        const err = G.Abilities.use(b, a.u, a.i, a.tgt, false); if (err) b.log.push(`Queued ${s.d.name} failed: ${err}`); done.push({ a, err });
      } else {
        const ch = { kind: a.kind, t: 0, max: CF().channelSec[a.kind] || 1, order: a.order };
        (a.u.chQ = a.u.chQ || []).push(ch); if (!a.u.channel) a.u.channel = a.u.chQ.shift();
        b.log.push(`${a.u.name}: ${T.label(a)} (${U.fmt1(ch.max)} s)`); done.push({ a });
      }
    }
    return done;
  };
  T.toggle = (b) => (b.paused ? (T.resume(b), null) : T.pause(b));

  // what the squad carries for the pause menu: Med Supplies in the bag
  // TODO (design, milestone 5): special-ammo swaps were dropped from the pause for now (the step-9 pack auto-loads every gun)
  T.items = function () {
    const r = run(); if (!r) return [];
    const out = [{ kind: "med", name: DATA.resources.med.name, n: (r.bag.res.med || 0), sprite: DATA.resources.med.sprite }];
    return out;
  };
  T.label = (a) => (a.kind === "ability" ? a.u.abl[a.i].d.name : a.kind === "escape" ? "Break away" : "Med kit");
  // why an item can't go on this unit (null = ok)
  T.itemBlock = function (b, kind, u) {
    if (!b.paused) return "Pause first (Space).";
    if (!u || u.side !== 0) return "Pick one of your squad.";
    if (!alive(u)) return `${u.name} is down.`;
    const r = run(); if (!r) return "No expedition.";
    if (kind === "med") {
      if (!(r.bag.res.med > 0)) return "No Med Supplies carried.";
      if (u.medCd > 0) return `${u.name} can't take another Med kit for ${U.fmt1(u.medCd)} s.`;
      if (T.queue(b).some((a) => a.kind === "med" && a.u === u) || (u.channel && u.channel.kind === "med") || (u.chQ || []).some((c) => c.kind === "med")) return `${u.name} already has a Med kit coming (cooldown).`;
      if (u.hp >= u.maxHp - 0.5) return `${u.name} is at full HP.`; return null;
    }
    return "Unknown item.";
  };
  // queue an item use: spent from the carried inventory now, refunded on cancel
  T.queueItem = function (b, kind, u) {
    const why = T.itemBlock(b, kind, u); if (why) return why;
    const r = run();
    r.bag.res.med--;
    const a = { kind, u, order: T.queue(b).length + 1 };
    T.queue(b).push(a); u.queued = (u.queued || 0) + 1; return null;
  };
  // queue an aimed ability (the view calls this instead of firing while paused); cooldown spent when it fires
  T.queueAbility = function (b, u, i, tgt) {
    if (!b.paused) return "Pause first (Space).";
    const s = u && u.abl && u.abl[i]; if (!s) return "No such ability.";
    if (s.queued) return `${s.d.name} is already queued.`;
    const why = G.Abilities.validate(b, u, s, tgt); if (why) return why;
    s.queued = true; T.queue(b).push({ kind: "ability", u, i, tgt, order: T.queue(b).length + 1 }); u.queued = (u.queued || 0) + 1;
    G.Abilities.aimCancel(b); return null;
  };
  // queue Break away (resolves on unpause: the channel starts then)
  T.queueEscape = function (b) {
    if (!b.paused) return "Pause first (Space).";
    const why = G.Escape.block(b); if (why) return why;
    const u = b.units.find((x) => x.rank === "body" && x.side === 0);
    T.queue(b).push({ kind: "escape", u, order: T.queue(b).length + 1 }); u.queued = (u.queued || 0) + 1; return null;
  };
  // Med kit cooldown for a unit, from the user's (your body's) Medicine level
  T.medCooldown = function (b) {
    const C = CF().medCooldown || { baseSec: 0, perMedicine: 0, minSec: 0 }, body = b.units.find((o) => o.rank === "body" && o.side === 0);
    return Math.max(C.minSec, C.baseSec - C.perMedicine * (body ? body.medicine || 0 : 0));
  };
  // cancel a queued action while paused (item refunded)
  T.cancel = function (b, idx) {
    if (!b.paused) return "Only while paused.";
    const q = T.queue(b), a = q[idx]; if (!a) return "Nothing there.";
    q.splice(idx, 1); a.u.queued = Math.max(0, (a.u.queued || 1) - 1);
    const r = run();
    if (a.kind === "ability") a.u.abl[a.i].queued = false;
    else if (a.kind === "med" && r) r.bag.res.med++;
    q.forEach((x, k) => (x.order = k + 1));
    return null;
  };

  // B.step, per channelling unit: the unit does nothing else; at the end the item takes effect
  T.channelTick = function (b, u, dt) {
    const ch = u.channel; ch.t += dt;
    if (ch.t < ch.max) return;
    u.channel = (u.chQ && u.chQ.shift()) || null;
    const X = G.Battle._;
    if (ch.kind === "escape") { G.Escape.resolve(b); return; }
    if (ch.kind === "med") {
      // the field heal roll, made now (the pause never shows its outcome): Medicine chance, fail heals x0.25
      const R = DATA.config.rolls, body = b.units.find((o) => o.rank === "body" && o.side === 0), calm = body && (body.quirks || []).includes("heals_cant_fail");
      const med = body ? body.medicine || 0 : 0, chance = calm ? 100 : U.clamp(R.fieldHealBase + med / R.fieldHealSkillDiv, R.hitMin, R.hitMax), roll = b.rng() * 100, ok = roll < chance;
      const amt = u.maxHp * DATA.config.expedition.medHealPct / 100 * (ok ? 1 : R.fieldHealFailMult), was = u.hp;
      u.hp = Math.min(u.maxHp, u.hp + amt);
      X.floatText(b, u, `+${Math.round(u.hp - was)} ${ok ? "" : "(fumbled) "}Med kit`, ok ? "#7ee07e" : "#f0b050", true);
      b.log.push(`Med kit on ${u.name}: field heal ${Math.round(chance)}% → rolled ${Math.floor(roll)}: ${ok ? "success" : "fumbled"}, +${Math.round(u.hp - was)} HP`);
      if (G.Escape) G.Escape.feed(b, `Med kit on ${u.name}: ${Math.round(chance)}% → rolled ${Math.floor(roll)}: ${ok ? "success" : "fumbled"}, +${Math.round(u.hp - was)} HP`, ok ? "good" : "bad");
      (b.tStats = b.tStats || []).push({ kind: "med", u: u.name, t: b.t, ok, amt: u.hp - was, order: ch.order });
      // design call (milestone 5): a Med kit used in battle gives the body the same Medicine XP as one used between fights
      if (body) X.xp(body, "medicine", X.XP().fieldHeal);
      u.medCd = u.medCdMax = T.medCooldown(b);   // Megan (milestone 5): no other kit on this unit for a while
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
