// §8 D&D-style checks: d20 + floor(best skill/4) + helpers + gear vs DC.
(function (root) {
  const G = root.G, U = G.Util;
  const K = G.Checks = {};
  const C = () => DATA.config.checks;

  // members: array of refs {kind:'body',body} | {kind:'grunt',grunt}; gearItems: body's equipped items
  K.compute = function (skill, dc, members, gearItems) {
    const def = DATA.skills[skill];
    const lv = members.map((m) => ({ m, lvl: G.State.skillOf(m, skill) }));
    lv.sort((a, b) => b.lvl - a.lvl);
    const best = lv[0] || { m: null, lvl: 0 };
    let helpers = 0;
    const each = G.Perks ? G.Perks.helperEach(C().helperBonusEach) : C().helperBonusEach;   // Helping Hand: +2 each
    if (def.kind === "body") for (const x of lv.slice(1)) if (x.lvl >= C().helperMinSkill) helpers += each;
    helpers = Math.min(C().helperMax * each / C().helperBonusEach, helpers);   // helperMax counts helpers (3), so the cap scales with the bonus
    const gear = G.Items.checkBonus(gearItems || [], skill);   // affixes + base checkSkill + set bonuses (Hunter's Garb)
    const mod = Math.floor(best.lvl / C().skillDiv) + helpers + gear;
    const effDc = dc + (C().zoneDcBonus || 0);
    let succ = 0;
    for (let d = 1; d <= C().die; d++) if (d === C().die || (d !== 1 && d + mod >= effDc)) succ++;
    return { skill, dc: effDc, best: best.lvl, roller: best.m, helpers, gear, mod, chance: (succ / C().die) * 100 };
  };

  K.roll = function (info, rng) {
    rng = rng || G.rng;
    const d = rng.int(1, C().die);
    const total = d + info.mod;
    let grade;
    if (d === 1) grade = "badFail";
    else if (d === C().die || total >= info.dc + C().critMargin) grade = "crit";
    else if (total >= info.dc) grade = "success";
    else if (info.dc - total >= C().badFailMargin) grade = "badFail";
    else grade = "fail";
    const xpAmt = DATA.config.leveling.xp.check * (grade === "crit" || grade === "success" ? 1 : DATA.config.leveling.checkFailXpMult);
    if (info.roller) G.State.giveXp(info.roller, info.skill, xpAmt);
    const text = `${DATA.skills[info.skill].name} check: d20 ${d} + ${Math.floor(info.best / C().skillDiv)} (skill ${info.best})` +
      (info.helpers ? ` + ${info.helpers} helpers` : "") + (info.gear ? ` + ${info.gear} gear` : "") + ` = ${total} vs DC ${info.dc} → ${K.gradeName(grade)}`;
    return { d, total, grade, text };
  };
  K.gradeName = (g) => ({ crit: "CRITICAL SUCCESS", success: "Success", fail: "Fail", badFail: "BAD FAIL" }[g]);
  K.isSuccess = (g) => g === "crit" || g === "success";
})(typeof window !== "undefined" ? window : globalThis);
