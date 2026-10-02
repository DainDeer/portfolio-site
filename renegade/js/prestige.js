// Slice 5 §I: relocate the settlement (prestige). Data + the [DRAFT] keep / reset lists: data/prestige.js. No DOM.
// state.prestige = { act, count, xpPct, history: [{ act, home, runs, extractions, at }] } (absent = Act I, never moved).
(function (root) {
  const G = root.G, U = G.Util;
  const P = G.Prestige = {};
  const D = () => DATA.prestige;
  P.fresh = () => ({ act: 1, count: 0, xpPct: 0, history: [] });
  P.st = () => { const s = G.state; s.prestige = s.prestige || P.fresh(); return s.prestige; };
  const peek = () => (G.state && G.state.prestige) || P.fresh();   // read without writing to the save
  P.act = () => D().acts[Math.min(peek().act, D().acts.length) - 1];
  P.nextAct = () => D().acts[peek().act] || null;
  P.xpMult = () => 1 + (peek().xpPct || 0) / 100;
  // why you can't relocate right now (null = you can)
  P.gateWhy = function () {
    const s = G.state, g = D().gate, T = D().text;
    if (!D().enabled) return "Not in this build.";
    if (!P.nextAct()) return "There's nowhere further to move to yet.";
    if (s.run) return "Finish the expedition first.";
    const mainOk = !g.main || !G.Main || G.Main.status(g.main) === "done";
    if (!mainOk || (s.extractions || 0) < g.minExtractions)
      return T.locked.replace("{main}", g.main && DATA.main.quests[g.main] ? `"${DATA.main.quests[g.main].name}"` : "the main quest").replace(/\{n\}/g, g.minExtractions).replace("{have}", Math.min(s.extractions || 0, g.minExtractions));
    return null;
  };
  P.available = () => !P.gateWhy();
  const rarOrder = () => Object.keys(DATA.items.rarities);
  // the stash items you may take along (equipped gear is in the stash too)
  P.keepable = function () {
    const max = rarOrder().indexOf(D().keep.maxRarity);
    return G.state.stash.items.filter((it) => !G.Items.isQuest(it) && !G.Items.isPet(it) && rarOrder().indexOf(it.rarity) <= max);
  };
  // the town art for the current act: its home set once Smudge's files are committed (artReady), else the outpost art
  P.townArt = function () {
    const a = P.act(), H = DATA.townArtHomes || {};
    return a && a.home && D().artReady[a.home] && H[a.home] ? H[a.home] : DATA.townArt;
  };
  P.homeId = () => { const a = P.act(); return a && a.home && D().artReady[a.home] && (DATA.townArtHomes || {})[a.home] ? a.home : null; };
  // Smudge's carried props (the bunker re-mounts the forest camp's memorial wall): shown if you moved here from that home
  P.cameFrom = (townKey) => peek().history.some((h) => "town_" + h.home === townKey && D().artReady[h.home]);
  // Pack up and move: a new save in the next act's home, keeping the binder, looks, settings, difficulty, Marta's
  // talk (no tutorial replay), the stacked XP bonus and one item. Everything else is a new game.
  P.relocate = function (keepUid) {
    const why = P.gateWhy(); if (why) return { error: why };
    const old = G.state, keepIt = keepUid ? P.keepable().find((i) => i.uid === keepUid) : null;
    if (keepUid && !keepIt) return { error: "You can't take that along." };
    const pr = U.clone(P.st()), from = P.act(), next = P.nextAct();
    pr.history.push({ act: pr.act, home: from.home, runs: old.runCount, extractions: old.extractions, at: G.now() });
    pr.act = next.id; pr.count += 1; pr.xpPct = (pr.xpPct || 0) + (D().bonus.xpPct || 0);
    const s = G.State.newGame();   // G.state = the new save
    s.prestige = pr;
    if (old.cards) { s.cards = old.cards; s.cards.searchedRun = -1; }
    s.cosmetics = old.cosmetics || s.cosmetics; s.settings = old.settings || s.settings; s.lore = old.lore || [];
    s.difficulty = old.difficulty; s.difficultyLocked = old.difficultyLocked;
    if (old.tut) s.tut = old.tut;   // Marta knows you: Main 1 goes straight to active, no tutorial replay
    if (keepIt) s.stash.items.push(keepIt);
    if (G.Main) G.Main.st();
    G.log(D().text.done.replace("{home}", next.homeName), "good");
    G.State.save();
    return { ok: true, act: next, kept: keepIt || null };
  };
})(window);
