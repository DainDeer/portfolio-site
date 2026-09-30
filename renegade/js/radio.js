// Slice 3 §10b: the Radio (lot_comms). Bounty board (st.board), decoding Data Shards, the L2 fog reveal. Rival intel: step 10.
(function (root) {
  const G = root.G, U = G.Util;
  const R = G.Radio = {};
  const D = () => DATA.radio, O = () => G.Outpost;
  R.built = () => O().st("radio").level >= 1;
  R.st = () => { const st = O().st("radio"); st.board = st.board || { made: null, list: [] }; return st; };
  R.board = () => R.st().board.list;
  R.active = () => R.board().filter((b) => b.status === "active");
  R.size = () => O().effects("radio").bounties || 0;
  // zones where a family shows up (location families on the zone map), unlocked only
  R.zonesWith = (family) => Object.keys(G.state.maps).filter((z) => G.Zones.unlocked(z) && Object.values(G.state.maps[z].nodes).some((n) => { const l = G.Map.loc(n); return l && l.family === family; }));
  R.scoutTargets = () => { const out = []; for (const z of Object.keys(G.state.maps)) { if (!G.Zones.unlocked(z)) continue; const m = G.state.maps[z]; for (const n of Object.values(m.nodes)) { const l = G.Map.loc(n); if (l && l.name && n.id !== m.insertion && !G.Map.hiddenSecret(n) && !(G.state.world.sites || {})[n.id]) out.push({ zone: z, nid: n.id }); } } return out; };
  R.make = function (tplId, rng, hot) {
    const t = D().templates[tplId], b = { uid: U.uid("bty"), tpl: tplId, type: t.type, status: "open", progress: 0, hot: !!hot };
    if (t.type === "kill") { const zs = R.zonesWith(t.family); if (!zs.length) return null; b.zone = rng.pick(zs); b.family = t.family; b.n = t.n; }
    if (t.type === "turnin") { b.res = t.res; b.n = t.n; }
    if (t.type === "scout") { const c = R.scoutTargets(); if (!c.length) return null; const p = rng.pick(c); b.zone = p.zone; b.nid = p.nid; b.n = 1; }
    const W = D().reward, rw = {}; rw[rng.pick(W.common)] = rng.int(W.min, W.max);
    if (hot) for (const k in W.hot) rw[k] = (rw[k] || 0) + W.hot[k]; else { const e = rng.pick(W.extra); rw[e] = (rw[e] || 0) + W.extraN; }
    b.reward = rw;
    return b;
  };
  R.text = function (b) {
    const t = D().templates[b.tpl]; if (!t) return "";
    const node = b.nid ? G.Zones.node(b.nid) : null;
    return t.text.replace("{zone}", b.zone ? DATA.zones.list[b.zone].name : "").replace("{n}", b.n).replace("{loc}", node ? G.Map.loc(node).name : "?");
  };
  // (re)fill the board every refreshRuns runs (or when forced: first built). Active bounties stay; the open offers reroll so the
  // board holds `bounties` in total (L2: one of the open offers is hot). Paid ones drop off.
  R.due = () => { const bd = R.st().board; return bd.made == null || G.state.runCount - bd.made >= D().refreshRuns; };
  R.refresh = function (force) {
    if (!R.built() || (!force && !R.due())) return false;
    const bd = R.st().board, runs = G.state.runCount;
    const rng = U.makeRng(((G.state.seed >>> 0) ^ Math.imul(runs + 1, 2654435761)) >>> 0);
    const list = bd.list.filter((b) => b.status === "active"), ids = Object.keys(D().templates), hotN = O().effects("radio").hot || 0;
    let guard = 60;
    while (list.length < R.size() && guard-- > 0) {
      const hot = list.filter((b) => b.hot && b.status === "open").length < hotN;
      const b = R.make(rng.pick(ids), rng, hot); if (!b) continue;
      if (list.some((x) => x.tpl === b.tpl)) continue;   // one of each template on the board
      list.push(b);
    }
    bd.list = list; bd.made = runs;
    return true;
  };
  R.open = () => R.board().filter((b) => b.status === "open");
  R.canTake = function (uid) {
    if (G.state.run) return "Finish the expedition first.";
    const b = R.board().find((x) => x.uid === uid); if (!b || b.status !== "open") return "Not on the board.";
    if (R.active().length >= D().maxActive) return `Up to ${D().maxActive} bounties at once.`;
    return null;
  };
  R.take = function (uid) { const why = R.canTake(uid); if (why) return why; const b = R.board().find((x) => x.uid === uid); b.status = "active"; b.progress = 0; G.log(`Bounty taken: ${R.text(b)}`); return null; };
  R.anyTakeable = () => R.built() && R.open().length > 0 && R.active().length < D().maxActive;
  R.pay = function (b) {
    for (const k in b.reward) G.state.stash.res[k] = (G.state.stash.res[k] || 0) + b.reward[k];
    b.status = "paid"; G.log(`Bounty paid: ${U.resText ? U.resText(b.reward) : Object.entries(b.reward).map(([k, n]) => n + " " + DATA.resources[k].name).join(", ")}.`, "good");
    if (G.Sfx && G.Sfx.play) G.Sfx.play("sfx_radio");
  };
  // turn-in bounties: pay from the stockpile at the board
  R.canTurnIn = function (uid) {
    const b = R.board().find((x) => x.uid === uid); if (!b || b.status !== "active" || b.type !== "turnin") return "Not a turn-in bounty.";
    if (G.state.run) return "Finish the expedition first.";
    return (G.state.stash.res[b.res] || 0) >= b.n ? null : `Needs ${b.n} ${DATA.resources[b.res].name}.`;
  };
  R.turnIn = function (uid) { const why = R.canTurnIn(uid); if (why) return why; const b = R.board().find((x) => x.uid === uid); G.state.stash.res[b.res] -= b.n; R.pay(b); return null; };
  // kills (expedition finishBattle): progress counts for active kill bounties in that zone; paid on completion
  R.onKills = function (zone, kills) {
    const done = [];
    for (const b of R.active()) { if (b.type !== "kill" || b.zone !== zone) continue; b.progress += kills.filter((k) => k.family === b.family).length; if (b.progress >= b.n) { b.progress = b.n; R.pay(b); done.push(b); } }
    return done;
  };
  // scout: reach it, then extract (expedition extractSuccess)
  R.onExtract = function (run) { const done = []; for (const b of R.active()) if (b.type === "scout" && run.visited[b.nid]) { b.progress = 1; R.pay(b); done.push(b); } return done; };
  R.clearPaid = () => { const st = R.st(); st.board.list = st.board.list.filter((b) => b.status !== "paid"); };
  // ---- decode (Data Shards → lore fragment + Lore XP) ----
  R.nextFragment = () => D().decode.fragments.find((f) => !G.state.lore.includes(f)) || null;
  R.canDecode = function () {
    if (G.state.run) return "Finish the expedition first.";
    if (!R.built()) return "Build the Radio first.";
    const c = D().decode.cost, miss = Object.keys(c).filter((k) => (G.state.stash.res[k] || 0) < c[k]);
    return miss.length ? "Not enough " + miss.map((k) => DATA.resources[k].name).join(", ") + "." : null;
  };
  R.decode = function () {
    const why = R.canDecode(); if (why) return { error: why };
    const c = D().decode.cost; for (const k in c) G.state.stash.res[k] -= c[k];
    const f = R.nextFragment(); if (f) G.state.lore.push(f);
    const body = G.State.body(G.state.loadout.bodyId) || G.state.bodies[0];
    G.State.giveXp({ kind: "body", body }, "lore", D().decode.loreXp);
    G.log(f ? `Decoded a fragment (${G.state.lore.length} lore found). +${D().decode.loreXp} Lore XP.` : `Nothing new in the static. +${D().decode.loreXp} Lore XP.`);
    return { fragment: f, xp: D().decode.loreXp };
  };
  // ---- Radio L2: fog reveal +1 around the insertion point (expedition start) ----
  R.fogReveal = function (run, zone) {
    const n = R.built() ? O().effects("radio").fogReveal || 0 : 0; if (!n) return [];
    const map = G.state.maps[zone], dist = { [map.insertion]: 0 }, q = [map.insertion], out = [];
    while (q.length) { const c = q.shift(); if (dist[c] >= 1 + n) continue; for (const m of G.Map.neighbors(map, c)) if (dist[m] == null) { dist[m] = dist[c] + 1; q.push(m); if (dist[m] >= 2) out.push(m); } }
    run.revealed = run.revealed || {}; for (const m of out) run.revealed[m] = true;
    return out;
  };
  // after every run (X.endRun) and when the Radio is built: refresh the board if it's due
  R.onRunEnd = () => { if (R.built()) R.refresh(false); };
  if (G.Outpost) G.Outpost.tickHooks.push(() => { if (R.built() && R.st().board.made == null) { R.refresh(true); return true; } return false; });
})(typeof window !== "undefined" ? window : globalThis);
