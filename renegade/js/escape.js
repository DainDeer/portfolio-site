// Break away (Megan, milestone 5): a repeatable escape check in battle. Numbers: DATA.config.battle.breakAway.
// Logic only (js/battleview.js draws the button, js/tactical.js queues it, X.finishBattle settles a success).
// b.esc = { cd (s of combat time left), stumble (s left), tries, fails, last: { d, mod, total, dc, pass, text } }
// The body channels (u.channel kind "escape") for channelSec; at the end the roll decides.
(function (root) {
  const G = root.G, U = G.Util;
  const E = G.Escape = {};
  const D = () => DATA.config.battle.breakAway || {};
  const alive = (u) => u && u.state === "alive";
  const body = (b) => b.units.find((u) => u.rank === "body" && u.side === 0);
  const st = (b) => (b.esc = b.esc || { cd: 0, stumble: 0, tries: 0, fails: 0, last: null });

  // the combat feed under the ability bar (js/battleview.js): check rolls and what came of them
  E.feed = (b, text, kind) => { (b.feed = b.feed || []).push({ t: b.t, text, kind: kind || "info" }); };
  E.on = (b) => !!D().enabled && !!b.escapable;
  // the check: best Acrobatics of your standing units; DC from the enemies still up, a Marked / Manhunt pack, machines
  E.info = function (b) {
    const C = D(), mine = b.units.filter((u) => u.side === 0 && alive(u));
    const best = Math.max(0, ...mine.map((u) => (u.skills && u.skills[C.skill]) || 0)), mod = Math.floor(best / DATA.config.checks.skillDiv);
    const foes = b.units.filter((u) => u.side === 1 && alive(u)).length, extra = Math.max(0, foes - C.freeEnemies) * C.perEnemy;
    const hunt = b.family === "hunters" && (C.hunterPacks || []).includes(b.pack) ? C.hunterPack : 0, mach = b.family === "machines" ? C.machines : 0;
    const dc = C.dc + extra + hunt + mach, die = DATA.config.checks.die;
    let succ = 0; for (let d = 1; d <= die; d++) if (d === die || (d !== 1 && d + mod >= dc)) succ++;
    const why = [`DC ${C.dc}`]; if (extra) why.push(`+${extra} (${foes} enemies)`); if (hunt) why.push(`+${hunt} ${b.pack} pack`); if (mach) why.push(`+${mach} machines`);
    return { skill: C.skill, best, mod, dc, foes, chance: succ / die * 100, why: why.join(" ") };
  };
  // why it can't be used now (null = ok)
  E.block = function (b) {
    if (!E.on(b)) return "You can't break away from this fight.";
    if (b.phase !== "fight" || b.over) return "Not in a fight.";
    const u = body(b), s = st(b);
    if (!u || u.state === "downed" || !alive(u)) return "Not while you're down.";
    if (u.channel && u.channel.kind === "escape") return "Already breaking away.";
    if (G.Tactical && (b.tq || []).some((a) => a.kind === "escape")) return "Already queued.";
    if (s.stumble > 0) return "Stumbling!";
    if (s.cd > 0) return `Break away ready in ${U.fmt1(s.cd)} s.`;
    return null;
  };
  // start the channel on the body (a med kit channel already running on the body goes first)
  E.start = function (b) {
    const why = E.block(b); if (why) return why;
    const u = body(b), ch = { kind: "escape", t: 0, max: D().channelSec };
    if (u.channel) (u.chQ = u.chQ || []).unshift(ch); else u.channel = ch;
    b.log.push(`${u.name} tries to break away (${U.fmt1(D().channelSec)} s)…`); E.feed(b, `${u.name} calls the retreat… (${U.fmt1(D().channelSec)} s)`);
    G.Battle._.floatText(b, u, "BREAKING AWAY…", "#9fd8ff", true);
    return null;
  };
  // B.step: cooldown / stumble clocks (combat time only: nothing runs while paused); a downed body cancels the channel
  E.tick = function (b, dt) {
    if (!b.esc) return;
    const s = b.esc, u = body(b);
    if (s.stumble > 0) { s.stumble -= dt; if (s.stumble <= 0) { s.stumble = 0; s.cd = D().cooldownSec; } }
    else if (s.cd > 0) s.cd = Math.max(0, s.cd - dt);
    if (u && !alive(u)) {
      const drop = (c) => c && c.kind === "escape";
      if (drop(u.channel) || (u.chQ || []).some(drop)) { u.channel = drop(u.channel) ? null : u.channel; u.chQ = (u.chQ || []).filter((c) => !drop(c)); b.log.push("Break away cancelled: you went down."); E.feed(b, "Break away cancelled: you went down.", "bad"); }
    }
  };
  E.stumbling = (b) => !!(b.esc && b.esc.stumble > 0);
  // end of the channel (js/tactical.js channelTick): roll it
  E.resolve = function (b) {
    const u = body(b), s = st(b); if (!alive(u)) return null;
    const i = E.info(b), die = DATA.config.checks.die, d = b.rng.int(1, die), total = d + i.mod, pass = d === die || (d !== 1 && total >= i.dc);
    const text = `Break away: ${DATA.skills[i.skill].name} d20 ${d} + ${i.mod} (best skill ${i.best}) = ${total} vs ${i.dc} [${i.why}] → ${pass ? (d === die ? "natural 20, " : "") + "you get out!" : (d === 1 ? "natural 1, " : "") + "you stumble!"}`;
    s.tries++; s.last = { d, mod: i.mod, total, dc: i.dc, pass, text };
    if (G.Dice) G.Dice.capture({ d, total, grade: d === die ? "crit" : d === 1 ? "badFail" : pass ? "success" : "fail", text }, "breakaway");   // Slice 5 §B: the fight holds while it rolls
    b.log.push(text); (b.checks = b.checks || []).push({ kind: "escape", text, pass, t: b.t }); E.feed(b, text, pass ? "good" : "bad");
    G.Battle._.floatText(b, u, pass ? `BREAK AWAY ${total} vs ${i.dc}: OUT!` : `BREAK AWAY ${total} vs ${i.dc}: STUMBLE`, pass ? "#7ee07e" : "#ff7a6a", true);
    if (pass) {
      b.over = true; b.result = "escape"; b.phase = "over"; b.escaped = true;
      b.log.push(`Broke away after ${Math.round(b.t)} s (seed ${b.seed})`);
    } else {
      s.fails++; s.stumble = D().stumbleSec;
      b.log.push(`Your squad stumbles: ${U.fmt1(D().stumbleSec)} s of free attacks, then Break away cools down ${D().cooldownSec} s.`); E.feed(b, `Stumble! ${U.fmt1(D().stumbleSec)} s of free attacks, then ${D().cooldownSec} s cooldown.`, "bad");
    }
    return s.last;
  };
})(typeof window !== "undefined" ? window : globalThis);
