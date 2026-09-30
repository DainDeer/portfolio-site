// Slice 4 §B: the main questline (G.Main) and the cryo pods puzzle. Data: data/main.js. No DOM.
// state.main = { quests: { m1: "locked"|"active"|"done", ... }, pods: { sol: [w0, w1, w2] } }
(function (root) {
  const G = root.G, U = G.Util;
  const M = G.Main = {};
  const D = () => DATA.main, P = () => DATA.main.pods;
  M.fresh = () => ({ quests: {}, pods: null });
  // the mural's answer: random per save (from the save seed, its own stream: no draws from G.rng), 4^3 = 64 combos
  M.rollSolution = function (seed) { const rng = U.makeRng((((seed >>> 0) || 1) ^ 0x5eed7) >>> 0); const out = []; for (let i = 0; i < P().wheels; i++) out.push(rng.int(0, P().positions - 1)); return out; };
  M.st = function () {
    const s = G.state; s.main = s.main || M.fresh(); s.main.quests = s.main.quests || {};
    if (!s.main.pods || !Array.isArray(s.main.pods.sol)) s.main.pods = { sol: M.rollSolution(s.seed) };
    for (const id of D().order) if (!s.main.quests[id]) s.main.quests[id] = "locked";
    if (s.tutorialDone && s.main.quests.m1 !== "done") { s.main.quests.m1 = "done"; if (s.main.quests.m2 === "locked") s.main.quests.m2 = "active"; }   // older saves
    else if (s.main.quests.m1 === "locked" && s.tut && s.tut.talked) s.main.quests.m1 = "active";
    return s.main;
  };
  M.status = (id) => M.st().quests[id] || "locked";
  M.def = (id) => D().quests[id];
  M.activate = function (id) { if (M.status(id) === "locked") { M.st().quests[id] = "active"; G.log(`Main objective: ${M.def(id).objective}`, "good"); } };
  M.complete = function (id) {
    if (M.status(id) === "done") return;
    M.st().quests[id] = "done"; G.log(`Main quest complete: ${M.def(id).name}.`, "good");
    if (G.Cards && id === DATA.main.order[0]) G.Cards.onQuestDone("marta");   // Slice 4 §D: Marta's card (her first quest is Main 1)
    if (M.def(id).next) M.activate(M.def(id).next);
  };
  // the one objective shown in the Journal: the first quest in order that isn't done (null if it's still locked)
  M.current = function () { const q = M.st().quests; for (const id of D().order) if (q[id] !== "done") return q[id] === "active" ? id : null; return null; };
  // "where" appears once the location has been scouted (its node seen on a map: everSeen, as the map fog uses)
  M.whereText = function (id) {
    const q = M.def(id); if (!q.where) return null;
    const s = G.state, map = s.maps && (s.maps.a || s.maps[P().zone]);
    const node = map && map.nodes ? Object.values(map.nodes).find((n) => n.loc === q.where) : null;
    const seen = node && ((s.everSeen || {})[node.id] || (s.run && s.run.zone === P().zone && G.Exp.visible(node.id)));
    return seen ? `${DATA.zones.list[P().zone].name}: ${DATA.map.locations[q.where].name}` : null;
  };
  M.onMartaTalked = () => M.activate("m1");   // Marta hands you Main 1 whatever tutorial choice you pick

  // ---------- the pods room ----------
  M.isPodsSite = (site) => !!site && site.loc === P().loc && (site.zone || "a") === P().zone;
  // called by G.Exp.generateSite (and ensureSite for a site built before this existed). helpers = { mk, place, rng }.
  M.decorate = function (site, H) {
    if (!M.isPodsSite(site) || site.pods || site.rooms.length < 2) return;
    const door = site.objects.find((o) => o.type === "door" && o.opens === 1 && o.room === site.rooms[1].parent);
    if (!door) return;
    const sol = M.st().pods.sol;
    door.sealed = true; door.locked = false; door.name = P().door.name;
    site.pods = { door: door.id, wheels: [] };
    // the free slot of room ri nearest to (x, y) (deterministic; falls back to place() if the room is full)
    // ok(p): optional slot filter (wheels keep a column apart so the phone arrow buttons under each one don't collide)
    const put = (o, ri, x, y, ok) => {
      const R = site.rooms[ri]; if (!R.free || !R.free.length) return H.place(site, o, ri, H.rng);
      const cand = R.free.map((p, k) => k).filter((k) => !ok || ok(R.free[k])), pool = cand.length ? cand : R.free.map((p, k) => k);
      let best = pool[0]; for (const k of pool) if (Math.hypot(R.free[k].x - x, R.free[k].y - y) < Math.hypot(R.free[best].x - x, R.free[best].y - y)) best = k;
      const p = R.free.splice(best, 1)[0]; o.room = ri; o.x = p.x; o.y = p.y; return o;
    };
    for (let i = 0; i < P().wheels; i++) {
      const w = H.mk(site, { kind: "wheel", idx: i, pos: (sol[i] + 2) % P().positions, name: `${P().wheel.name} ${i + 1}`, sprite: "obj_wheel" });
      const slot = DATA.searchables.view.slot, placed = site.pods.wheels.map((id) => site.objects.find((q) => q.id === id));
      put(w, door.room, door.x, door.y, (p) => placed.every((q) => Math.abs(q.x - p.x) >= slot * 2 - 1)); site.pods.wheels.push(w.id);
    }
    // wheels numbered left to right, then top to bottom, so "wheel 1" on the mural is the one you'd call the first
    site.pods.wheels.sort((a, b) => { const A = site.objects.find((o) => o.id === a), B = site.objects.find((o) => o.id === b); return A.x - B.x || A.y - B.y; });
    site.pods.wheels.forEach((id, i) => { const w = site.objects.find((o) => o.id === id); w.idx = i; w.pos = (sol[i] + 2) % P().positions; w.name = `${P().wheel.name} ${i + 1}`; });
    const R0 = site.rooms[door.room], R1 = site.rooms[door.opens];
    // the mural is 64x32 art: two side-by-side slots (like the car), nearest the top wall; one slot if there's no pair
    const mural = H.mk(site, { kind: "mural", name: P().mural.name, sprite: "obj_mural" }), sl = DATA.searchables.view.slot;
    let pair = null;
    for (const p of R0.free || []) { const q = R0.free.find((f) => f.y === p.y && f.x === p.x + sl); if (q && (!pair || Math.hypot(p.x - R0.x - R0.w / 2, p.y - R0.y) < Math.hypot(pair[0].x - R0.x - R0.w / 2, pair[0].y - R0.y))) pair = [p, q]; }
    if (pair) { R0.free = R0.free.filter((f) => f !== pair[0] && f !== pair[1]); Object.assign(mural, { room: door.room, x: Math.round((pair[0].x + pair[1].x) / 2), y: pair[0].y, wide: 2 }); }
    else put(mural, door.room, R0.x + R0.w / 2, R0.y);
    put(H.mk(site, { kind: "pod", name: P().pod.name, sprite: P().pod.sprite }), door.opens, R1.x + R1.w / 2, R1.y + R1.h / 2);
  };
  M.solText = () => M.st().pods.sol.map((p, i) => `wheel ${i + 1} ${P().arrows[p]}`).join(", ");
  M.examine = (o) => (o.kind === "mural" ? P().mural.examine.replace("{sol}", M.solText()) : o.examine || (o.kind === "wheel" || o.kind === "pod" ? P()[o.kind].examine : o.sealed ? P().door.examine : null));
  M.solved = (site) => !!site && !!site.pods && site.pods.wheels.every((id, i) => (site.objects.find((o) => o.id === id) || {}).pos === M.st().pods.sol[i]);
  // spin a wheel: dir +1 clockwise, -1 counterclockwise. No noise, no Heat, no fail state. Returns { pos, opened }.
  M.spin = function (objId, dir) {
    const X = G.Exp, site = X.site(), o = site && site.objects.find((q) => q.id === objId);
    if (!o || o.kind !== "wheel") return { error: "Not a wheel." };
    const door = site.objects.find((q) => q.id === site.pods.door);
    if (!door.sealed) return { error: "The door is already open." };
    if (G.state.run.queue.length) return { error: "Finish what's in front of you first." };
    o.pos = (o.pos + (dir < 0 ? -1 : 1) + P().positions) % P().positions;
    site.squadAt = o.id;
    let opened = false;
    if (M.solved(site)) { door.sealed = false; door.searched = true; site.rooms[door.opens].open = true; opened = true; X.log(P().openText, "good"); }
    G.State.save();
    return { pos: o.pos, opened };
  };
  // Vixie: while Main 1 isn't done, keep the Cryo Ward Annex in pods.activeRows of Zone A. An annex outside them swaps
  // locations with the topmost pool node (not fixed / guaranteed) in the nearest allowed row that has one (row 4+ ->
  // row 3, then 2; a row-1 roll -> row 2). No rng. Both nodes' saved site state is dropped (they rebuild on the next visit). Never mid-run.
  M.clampAnnex = function (s) {
    s = s || G.state; const rows = P().activeRows, map = s && s.maps && s.maps[P().zone];
    if (!rows || !rows.length || !map || s.run) return false;
    const prev = G.state; G.state = s; const done = M.status("m1") === "done"; G.state = prev; if (done) return false;
    const an = Object.values(map.nodes).find((n) => n.loc === P().loc); if (!an || rows.includes(an.row)) return false;
    const D = DATA.map, ok = (n) => n.loc && !n.secret && !D.fixed[n.loc] && !(D.guaranteed || {})[n.loc] && D.locations[n.loc] && !D.locations[n.loc].zone;
    let to = null; for (const r of rows.slice().sort((a, b) => Math.abs(a - an.row) - Math.abs(b - an.row) || a - b)) { to = Object.values(map.nodes).filter((n) => n.row === r && ok(n)).sort((a, b) => a.y - b.y)[0]; if (to) break; }
    if (!to) return false;
    an.loc = to.loc; to.loc = P().loc;
    G.Map.attachSpurs(map);   // Slice 5 §G: a secret spur follows its host (the Witch's Cottage off Owlfall)
    if (s.world && s.world.sites) { delete s.world.sites[an.id]; delete s.world.sites[to.id]; }
    return true;
  };
  // claim the body in the working pod: completes Main 1 and rolls the human body offer (the pick is the same as before;
  // it sets tutorialDone). Loot still has to be extracted.
  M.claim = function (objId) {
    const s = G.state, X = G.Exp, site = X.site(), o = site && site.objects.find((q) => q.id === objId);
    if (!o || o.kind !== "pod") return { error: "Not a pod." };
    if (o.done || M.status("m1") === "done") { o.done = true; return { error: P().pod.claimed }; }
    o.done = true; site.squadAt = o.id;
    if (!s.tutorialDone && !s.humanOffer) s.humanOffer = G.State.rollHumanOffer(G.rng);
    if (!s.tutorialDone) s.tutorialEnds = true;   // Vixie: the tutorial ends with this run (X.endRun), even if the pick waits
    M.complete("m1");
    X.log(P().claimText, "good");
    if (s.humanOffer) X.push({ type: "bodyoffer" });   // the pick (UI.showBodyOffer; headless: tests/lib/game.js)
    G.State.save();
    return { text: P().claimText, offer: !!s.humanOffer };
  };
})(typeof window !== "undefined" ? window : globalThis);
