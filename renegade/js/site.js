// Location views (Slice 2 §5-6): per-run sites with rooms, doors and searchable objects; timed searches with a
// disturbance roll; battle corpses become searchable bodies; the passage grate. Logic only: the UI runs the
// progress bar and then calls G.Exp.completeSearch(objId, action). No DOM here.
(function (root) {
  const G = root.G, U = G.Util, X = G.Exp;
  const SD = () => DATA.searchables, CFG = () => DATA.config;
  const run = () => G.state.run;
  const f1 = (n) => (Math.round(n * 10) / 10).toString();

  X.node = (nid) => G.Zones.node(nid || run().loc);
  // Slice 3 §12: sites live in the world state (state.world.sites, by node id) and persist between runs
  const sites = () => { const w = G.state.world; w.sites = w.sites || {}; return w.sites; };
  X.site = (nid) => (nid || run() ? sites()[nid || run().loc] || null : null);
  X.inSite = () => !!run() && run().view === "site" && !!X.site();
  X.leaveSite = function () { const r = run(); if (r && !r.queue.length) r.view = "map"; };
  X.enterSite = function () { const r = run(); if (r && X.site()) r.view = "site"; };
  X.obj = (id, site) => (site || X.site()).objects.find((o) => o.id === id);
  X.typeDef = (o) => SD().types[o.type] || {};

  // ---------- generation ----------
  X.ensureSite = function (node) {
    const S = sites(), rc = G.state.runCount, loc = G.Map.loc(node);
    let site = S[node.id];
    // a world-event location whose state moved on since the site was built (Hollow Creek -> aftermath) is rebuilt
    if (site && loc && loc.worldEvent && site.enteredRun !== rc && site.world !== G.state.world.hollow_creek) site = null;   // the one world event (same key as X.worldOverride)
    if (!site) { site = S[node.id] = X.generateSite(node); site.enteredRun = rc; site.entry = { run: rc, level: 1, mult: 1, fresh: true }; return site; }
    if (site.enteredRun !== rc) X.restockOnEntry(site, node);
    if (G.Main && !site.pods && G.Main.isPodsSite(site)) G.Main.decorate(site, { mk, place, rng: G.rng });   // a site built before Slice 4
    X.addAccess(site, node);   // Slice 5 §D: a site built before the exit / extract hotspots gets them (no-op otherwise)
    return site;
  };

  // ---------- Slice 3 §12: restocking ----------
  const RS = () => CFG().world.restock;
  X.restockSteps = (site) => RS().runsBySize[site.size || "M"] || 1;
  X.restockLevel = (site) => (!site || !site.pickedOver ? 1 : Math.min(1, (site.restock || 0) / X.restockSteps(site)));
  X.restockMult = (level) => RS().hostileFloor + (1 - RS().hostileFloor) * level;
  X.markPicked = function (site) { if (!site) return; if (!site.pickedOver) X.log(`${G.Map.loc(X.node(site.nid)).name} is picked over now.`); site.pickedOver = true; site.restock = 0; };
  // map / tooltip text: "Unsearched" (never picked over), "Picked over (1/2)", "Normal" (restocked)
  X.lootRead = function (nid) {
    const site = X.site(nid); if (!site) return "Unsearched";
    if (site.pickedOver) return `Picked over (${site.restock || 0}/${X.restockSteps(site)})`;
    return site.everPicked ? "Normal" : "Unsearched";
  };
  // Hostiles % on arriving (not an in-run revisit): original x the restock multiplier of this run's first entry
  X.entryHostiles = function (node) {
    const o = X.odds(node), site = X.site(node.id), rc = G.state.runCount;
    const lvl = site && site.entry && site.entry.run === rc ? site.entry.level : X.restockLevel(site), mult = X.restockMult(lvl);
    const pct = U.clamp(o.hostiles * mult, 0, 100);
    return { base: o.hostiles, level: lvl, mult, pct, text: lvl < 1 ? `Hostiles ${f1(o.hostiles)}% × (${RS().hostileFloor} + ${+(1 - RS().hostileFloor).toFixed(3)} × restock ${Math.round(lvl * 100)}% = ${Math.round(mult * 1000) / 1000}) = ${f1(pct)}%` : `Hostiles ${f1(pct)}%` };
  };
  X.refillObject = function (o) {
    o.searched = false; o.left = null; o.jammed = false;
    if (o.guaranteed && o.guaranteed.once !== false) delete o.guaranteed;   // one-time finds stay found
    return o;
  };
  // first entry of a later run: refill rolls, and at 100% old bodies; quests taken since the site was built get their object
  X.restockOnEntry = function (site, node) {
    const rc = G.state.runCount, loc = G.Map.loc(node), lvl = X.restockLevel(site), was = !!site.pickedOver;
    site.enteredRun = rc; site.visits = 0;
    site.entry = { run: rc, level: lvl, mult: X.restockMult(lvl), refilled: 0, rolls: [], pickedOver: was };
    if (was) {
      const searched = site.objects.filter((o) => o.kind === "search" && o.type !== "door" && o.searched && !o.salvage);
      for (const o of searched) {
        const d = G.rng() * 100, hit = lvl >= 1 || d < lvl * 100;
        site.entry.rolls.push({ obj: o.id, name: o.name, roll: lvl >= 1 ? null : Math.floor(d), hit });
        if (hit) { X.refillObject(o); site.entry.refilled++; }
      }
      X.log(`${loc.name}: restock ${Math.round(lvl * 100)}% (${site.restock || 0}/${X.restockSteps(site)}). ` + (searched.length ? site.entry.rolls.map((x) => `${x.name} ${x.roll == null ? "100%" : "rolled " + x.roll + " vs " + Math.round(lvl * 100)}: ${x.hit ? "refilled" : "still empty"}`).join("; ") : "Nothing was searched.") + ".", "roll");
      if (lvl >= 1) {
        const [a, b] = RS().oldBodies, n = G.rng.int(a, b), rooms = site.rooms.filter((R) => R.open), type = loc.family === "beasts" ? "body_beast" : "body_human";
        for (let i = 0; i < n; i++) { const T = SD().types[type]; place(site, mk(site, { type, name: T.name, sprite: T.sprite, rot: Math.round(G.rng() * 360) }), G.rng.pick(rooms.length ? rooms : site.rooms).i, G.rng); }
        site.pickedOver = false; site.restock = 0;
      }
    }
    // a quest object whose item is still to be found (lost on death, quest re-taken) refills every run, as in Slice 2
    for (const o of site.objects) if (o.questId && o.searched && G.Quests.itemAvailable(o.questId)) X.refillObject(o);
    for (const qid of G.Quests.findObjectsAt(site.zone, node.loc)) if (!site.objects.some((o) => o.questId === qid)) {
      const q = G.Quests.def(qid).objective.object; X.addSearchObject(site, q.type, { name: q.name, sprite: q.sprite || SD().types[q.type].sprite, searchSec: q.searchSec, noise: q.noise, questId: qid });
    }
  };
  // debug: the world clock without an expedition; "Restock everything" puts every picked-over place at 100% and makes
  // its next entry (this run too) a fresh first entry
  X.debugAdvanceWorld = function () { X.worldTick(); for (const nid in sites()) if (run() && nid !== run().loc) sites()[nid].enteredRun = -1; G.State.save(); };
  X.debugRestockAll = function () { for (const nid in sites()) { const st = sites()[nid]; if (st.pickedOver) st.restock = X.restockSteps(st); if (!run() || nid !== run().loc) st.enteredRun = -1; } G.State.save(); };
  // run end (extraction or death): battle bodies and gore go, per-run objects go, picked-over sites restock one step
  X.worldTick = function () {
    for (const nid in sites()) {
      const site = sites()[nid];
      site.objects = site.objects.filter((o) => !o.fresh && !o.perRun);
      site.decals = [];
      if (site.pickedOver) site.restock = Math.min(X.restockSteps(site), (site.restock || 0) + 1);
    }
  };

  function floorFor(loc) {
    const F = SD().floors, tags = loc.tags || [], Z = (F.byZone || {})[loc.zone || "a"];
    if (loc.floor) return loc.floor;                       // per-location override (e.g. the flooded Zone B sites)
    if (Z) { for (const t of tags) if ((Z.byTag || {})[t]) return Z.byTag[t]; return Z.default; }
    for (const t of tags) if (F.byTag[t]) return F.byTag[t];
    if ((F.bySize || {})[loc.size]) return F.bySize[loc.size];
    for (const t of tags) if ((F.byTagLow || {})[t]) return F.byTagLow[t];
    return F.default;
  }
  X.objectWeights = (loc, zone) => objectWeights(loc, zone);   // Addendum A2 supply reads
  function objectWeights(loc, zone) {
    const W = SD().objectWeights, w = Object.assign({}, W.base), tags = loc.tags || [];
    for (const t of tags) for (const k in W.byTag[t] || {}) w[k] = (w[k] || 0) + W.byTag[t][k];
    for (const k in (W.byZone || {})[zone] || {}) w[k] = (w[k] || 0) + W.byZone[zone][k];
    for (const k in W.anyOf || {}) { const c = W.anyOf[k]; if ((c.tags || []).some((t) => tags.includes(t)) || (c.zones || []).includes(zone)) w[k] = (w[k] || 0) + c.weight; }
    for (const k in loc.objectWeights || {}) w[k] = (w[k] || 0) + loc.objectWeights[k];
    return w;
  }
  // free object slots of a room (grid of view.slot px), shuffled
  function roomSlots(room, rng) {
    const s = SD().view.slot, pad = 20, out = [];
    const cols = Math.max(1, Math.floor((room.w - pad * 2) / s)), rows = Math.max(1, Math.floor((room.h - pad * 2) / s));
    const ox = room.x + (room.w - cols * s) / 2 + s / 2, oy = room.y + (room.h - rows * s) / 2 + s / 2;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) out.push({ x: Math.round(ox + c * s), y: Math.round(oy + r * s) });
    return rng.shuffle(out);
  }
  function place(site, o, roomIdx, rng) {
    let R = site.rooms[roomIdx];
    if (!R.free.length) { const alt = site.rooms.filter((q) => q.free.length); if (alt.length) R = rng.pick(alt); }
    o.room = R.i;
    const T = o.type && SD().types[o.type];
    if ((T && T.wide > 1) || o.wide > 1) {   // Slice 3: the car takes two side-by-side slots (centred between them)
      const s = SD().view.slot, rooms = [R].concat(site.rooms.filter((q) => q !== R));
      for (const Q of rooms) for (let i = 0; i < Q.free.length; i++) {
        const p = Q.free[i], j = Q.free.findIndex((q) => q.y === p.y && q.x === p.x + s);
        if (j < 0) continue;
        const q = Q.free[j]; Q.free = Q.free.filter((f) => f !== p && f !== q); o.room = Q.i; o.x = Math.round((p.x + q.x) / 2); o.y = p.y; return o;
      }
    }
    if (R.free.length) { const p = R.free.pop(); o.x = p.x; o.y = p.y; }
    else { o.x = Math.round(R.x + 30 + rng() * (R.w - 60)); o.y = Math.round(R.y + 30 + rng() * (R.h - 60)); }
    return o;
  }
  function mk(site, fields) { const o = Object.assign({ id: "o" + site.nextId++, kind: "search", searched: false }, fields); site.objects.push(o); return o; }

  X.generateSite = function (node) {
    const loc = G.Map.loc(node), S = SD(), size = loc.size || "M", sz = S.sizes[size], tpl = S.templates[sz.template], rng = G.rng;
    const nRooms = Math.min(tpl.order.length, rng.int(sz.rooms[0], sz.rooms[1]));
    const nSearch = Math.max(nRooms, rng.int(sz.searchables[0], sz.searchables[1]));
    const V = S.view, cw = V.w / tpl.cols, ch = V.h / tpl.rows;
    const rooms = [];
    for (let i = 0; i < nRooms; i++) {
      const [c, rw, p] = tpl.order[i];
      rooms.push({ i, col: c, row: rw, parent: p, open: i === 0, x: Math.round(V.x + c * cw + V.wall / 2), y: Math.round(V.y + rw * ch + V.wall / 2), w: Math.round(cw - V.wall), h: Math.round(ch - V.wall) });
    }
    for (const R of rooms) R.free = roomSlots(R, rng);
    const site = { nid: node.id, loc: node.loc, zone: node.zone || "a", size, rooms, objects: [], props: [], decals: [], floor: floorFor(loc), visits: 0, visitSearches: 0, searches: 0, nextId: 1,
      pickedOver: false, restock: 0, world: loc.worldEvent ? G.state.world.hollow_creek : undefined };
    // doors: each room after the first sits behind a door in the wall it shares with its parent (the door belongs to the parent)
    const D = S.types.door;
    for (let i = 1; i < nRooms; i++) {
      const R = rooms[i], P = rooms[R.parent];
      let x, y;
      if (R.row === P.row) { x = (R.col > P.col ? R.x : P.x) - V.wall / 2; y = R.y + R.h / 2; }
      else { y = (R.row > P.row ? R.y : P.y) - V.wall / 2; x = R.x + R.w / 2; }
      mk(site, { type: "door", name: "Door", sprite: D.sprite, room: P.i, opens: i, vertical: R.row === P.row, x: Math.round(x), y: Math.round(y), locked: rng.chance(D.lock.chance) });
    }
    // Slice 4 §B: the pods room (sealed door, 3 wheels by it, the mural, the working pod) takes its slots first. No rng draws.
    if (G.Main) G.Main.decorate(site, { mk, place, rng });
    X.addAccess(site, node);   // Slice 5 §D: the way out + the extraction hotspot (no rng draws; the hotspot takes its slots before the searchables)
    // the searchables: fixed ones first (they take generated slots, so the count stays in the size range)
    const fixed = [];
    const gl = loc.guaranteedLoot;
    if (gl && !(gl.once !== false && G.state.locFlags[node.loc + "_gl"])) fixed.push({ type: gl.object.type, name: gl.object.name, guaranteed: gl });
    const wo = X.worldOverride(node);
    if (wo && wo.container) fixed.push({ type: wo.container.type, name: wo.container.name, bonusItems: wo.container.bonusItems, rarityBonus: wo.container.rarityBonus, salvage: true });
    for (const t in S.objectWeights.fixedByTag || {}) if ((loc.tags || []).includes(t)) for (const type of S.objectWeights.fixedByTag[t]) fixed.push({ type });
    for (const qid of G.Quests.findObjectsAt(site.zone, node.loc)) { const o = G.Quests.def(qid).objective.object; fixed.push({ type: o.type, name: o.name, sprite: o.sprite, searchSec: o.searchSec, noise: o.noise, questId: qid }); }
    const w = objectWeights(loc, node.zone || "a"), keys = Object.keys(w).filter((k) => w[k] > 0);
    const nGen = Math.max(0, nSearch - (nRooms - 1) - fixed.length);
    const list = fixed.slice();
    for (let i = 0; i < nGen; i++) { let t = rng.weighted(keys, (k) => w[k]); if (t === "body") t = loc.family === "beasts" ? "body_beast" : "body_human"; list.push({ type: t }); }
    for (const f of list) {
      const T = S.types[f.type];
      const o = mk(site, Object.assign({ name: T.name, sprite: T.sprite }, f));
      if (!o.sprite) o.sprite = T.sprite;
      if (T.heavy && rng.chance(T.heavy.chance)) { o.heavy = true; o.name = f.name || T.heavy.name; }
      if (T.trap && rng.chance(T.trap.chance)) o.trapped = true;       // hidden until it goes off (or you spot it)
      if (T.lock && rng.chance(T.lock.chance)) o.locked = true;
      place(site, o, rng.int(0, nRooms - 1), rng);
    }
    // Slice 5 §F training spots: extra objects (kind "train": not searchables, so the size's count and restock ignore them)
    for (const t in S.training || {}) if (X.trainHere(t, loc, node.loc)) place(site, mk(site, { type: t, kind: "train", name: S.types[t].name, sprite: S.types[t].sprite }), rng.int(0, nRooms - 1), rng);
    // event object (Slice 1 "Event %" = is there an event object here), survivor object
    const odds = X.odds(node);
    let ev = null;
    if (wo && wo.event) ev = wo.event;
    else if ((loc.events || []).length && rng.chance(odds.event)) {
      const zp = (DATA.zones.list[site.zone] || {}).eventPool;   // zone-wide pool (Zone B drone patrol), weighted vs 1 per location event
      if (zp && Object.keys(zp).length) { const ids = loc.events.concat(Object.keys(zp).filter((k) => !loc.events.includes(k))); ev = rng.weighted(ids, (k) => (zp[k] != null ? zp[k] : 1)); }
      else ev = rng.pick(loc.events);
    }
    if (ev) X.addEventObject(site, ev);
    if (rng.chance(odds.survivors || 0)) { const so = S.survivorObject; place(site, mk(site, { kind: "survivor", name: so.name, sprite: so.sprite }), rng.int(0, nRooms - 1), rng); }
    // the passage grate (always in the first room); hidden at the Zone A end until spotted
    if (loc.passage) { const P = DATA.zones.passages[loc.passage]; place(site, mk(site, { kind: "grate", pid: loc.passage, name: P.name || "Storm drain grate", sprite: P.sprite }), 0, rng); }
    // props (decor), swapped by tags
    const PR = S.props, pool = []; for (const t of loc.tags || []) for (const p of PR.byTag[t] || []) pool.push(p);
    if (!pool.length) pool.push(...PR.default);
    pool.push(...((PR.byZone || {})[site.zone] || []));
    for (const R of rooms) {
      const n = rng.int(PR.perRoom[0], PR.perRoom[1]);
      for (let i = 0; i < n; i++) { const p = R.free.length ? R.free.pop() : { x: R.x + 20 + rng() * (R.w - 40), y: R.y + 20 + rng() * (R.h - 40) }; site.props.push({ sprite: rng.pick(pool), x: Math.round(p.x), y: Math.round(p.y), room: R.i, rot: Math.round(rng() * 4) * 90 }); }
    }
    return site;
  };

  // ---------- Slice 5 §F: training spots ----------
  X.trainHere = function (type, loc, locId) { const W = (SD().training || {})[type]; return !!W && SD().types[type] && ((W.locs || []).includes(locId) || (W.tags || []).some((t) => ((loc && loc.tags) || []).includes(t))); };
  X.trainDef = (o) => { const T = o && o.type && SD().types[o.type]; return (T && T.train) || null; };
  X.trainedNow = (o) => o.trainedRun != null && o.trainedRun === G.state.runCount;   // once per run
  // Slice 5 §F: the family's own rare drops on a body (enemies.familyDrops) -> items / res (a pet = its item)
  X.rollFamilyDrops = function (family, items, res, rng, ilvl, resOnly, unit) {
    for (const d of (DATA.enemies.familyDrops || {})[family] || []) {
      if ((d.units && !d.units.includes(unit)) || (d.notUnits && d.notUnits.includes(unit))) continue;   // Slice 5 §G: the goat pet from goats only
      if (!rng.chance(d.pct)) continue;
      if (d.res) res[d.res] = (res[d.res] || 0) + (d.n || 1);
      else if (resOnly) continue;
      else if (d.item) items.push(G.Items.make(d.item, d.rarity || "white", ilvl, rng));
      else if (d.pet && DATA.allies.pets[d.pet]) items.push(G.Items.make(DATA.allies.pets[d.pet].item, "white", 1, rng));
    }
  };

  X.addEventObject = function (site, eventId, fields) {
    const E = SD().eventObjects[eventId] || SD().eventObjects.default;
    const o = mk(site, Object.assign({ kind: "event", eventId, name: E.name, sprite: E.sprite }, fields || {}));
    return place(site, o, fields && fields.room != null ? fields.room : G.rng.int(0, site.rooms.length - 1), G.rng);
  };
  // an extra searchable (event effect "hiddenContainer", Town Salvage after a fall)
  X.addSearchObject = function (site, type, fields) {
    const T = SD().types[type];
    const o = mk(site, Object.assign({ type, name: T.name, sprite: T.sprite }, fields || {}));
    return place(site, o, 0, G.rng);
  };

  // ---------- Slice 5 §D: the way in / out and the extraction hotspot ----------
  const AC = () => SD().access;
  X.exitStyle = function (loc, locId) {
    const E = AC().exit, tags = (loc && loc.tags) || [];
    const k = E.byLoc[locId] || (loc && E.byKind[loc.kind]) || (tags.find((t) => E.byTag[t]) && E.byTag[tags.find((t) => E.byTag[t])]) || E.default;
    return Object.assign({ style: k }, E.styles[k] || E.styles[E.default]);
  };
  X.extractSpot = (locId) => Object.assign({}, AC().extract.default, AC().extract.byLoc[locId] || {});
  X.extractSprite = function (o, still) {   // intact / the burning wreck (still: its first frame, for reduced motion)
    const sp = X.extractSpot(o.loc), has = (k) => !!(k && DATA.sprites[k]);
    if (!X.wrecked(X.node(o.nid))) return sp.sprite;
    return has(sp.wreckedAnim) && !still ? sp.wreckedAnim : has(sp.wreckedSprite) ? sp.wreckedSprite : sp.sprite;
  };
  X.exitObj = (site) => (site || X.site()).objects.find((o) => o.kind === "exit");
  X.addAccess = function (site, node) {
    if (!site || !AC()) return;
    const loc = G.Map.loc(node || X.node(site.nid)), R = site.rooms[0], V = SD().view;
    if (!X.exitObj(site)) {   // on the first room's bottom wall (always an outer wall: room 0 is bottom-left in every template)
      const st = X.exitStyle(loc, site.loc);
      mk(site, { kind: "exit", style: st.style, name: st.name, sprite: st.sprite, room: 0, x: Math.round(R.x + R.w / 2), y: Math.round(R.y + R.h + V.wall / 2) });
    }
    if (loc && loc.extraction && !site.objects.some((o) => o.kind === "extract")) {
      const sp = X.extractSpot(site.loc);
      place(site, mk(site, { kind: "extract", loc: site.loc, nid: site.nid, name: sp.name, sprite: sp.sprite, wide: sp.wide || 1 }), 0, G.rng);
    }
  };

  // ---------- visibility / availability ----------
  X.roomOpen = (site, i) => !!site.rooms[i] && site.rooms[i].open;
  X.objVisible = function (o, site) {
    site = site || X.site();
    if (o.kind === "grate") return G.Zones.passageVisible(o.pid, site.zone);
    return true;
  };
  // why an object can't be used right now (null = can)
  X.objBlocked = function (o, site) {
    site = site || X.site(); const r = run();
    if (!r || r.queue.length) return "Finish what's in front of you first.";
    if (!X.roomOpen(site, o.room)) return "Behind a closed door.";
    if (o.kind === "event" || o.kind === "survivor") return o.done ? "Already dealt with." : null;
    if (o.kind === "grate" || o.kind === "exit") return null;
    if (o.kind === "extract") { const node = X.node(site.nid); return X.extractionOpen(node) ? null : X.wrecked(node) ? `${CFG().extraction.crash.line} Find another way out.` : "Closed at this Heat level."; }   // Slice 5 §D
    if (o.kind === "mural") return null;   // Slice 4 §B pods room
    if (X.trainDef(o)) return X.trainedNow(o) ? "Done for this run." : null;   // Slice 5 §F
    if (o.kind === "wheel") { const d = site.pods && X.obj(site.pods.door, site); return d && !d.sealed ? "Set. The door is open." : null; }
    if (o.kind === "pod") return o.done || (G.Main && G.Main.status("m1") === "done") ? DATA.main.pods.pod.claimed : null;
    if (o.sealed) return DATA.main.pods.door.blocked;
    if (o.type === "door" && site.rooms[o.opens].open) return "Open.";
    if (o.blocked) return "Too heavy to shift.";
    if (o.searched && !X.hasLeft(o)) return "Searched.";
    return null;
  };
  X.hasLeft = (o) => !!o.left && (o.left.items.length > 0 || Object.keys(o.left.res).some((k) => o.left.res[k] > 0));
  // actions available on an object: search | pick | force | kick | reopen | use | cross
  X.objActions = function (o) {
    if (o.kind === "event" || o.kind === "survivor") return o.done ? [] : ["use"];
    if (o.kind === "grate") return ["cross"];
    if (o.kind === "exit") return ["leave"];   // Slice 5 §D
    if (o.kind === "extract") return ["extract"];
    if (o.kind === "mural") return ["examine"];
    if (o.kind === "wheel") return ["spin"];
    if (o.kind === "pod") return o.done ? [] : ["claim"];
    if (o.sealed) return [];
    if (X.trainDef(o)) return X.trainedNow(o) ? [] : ["train"];   // Slice 5 §F
    if (o.searched) return X.hasLeft(o) ? ["reopen"] : [];
    if (o.blocked) return [];
    const T = X.typeDef(o);
    if (o.locked) {
      const a = [];
      if (!o.jammed) a.push("pick");
      if (o.type === "door") a.push("kick");
      else if (T.lock && T.lock.force) a.push("force");
      return a;
    }
    return ["search"];
  };

  // ---------- search math ----------
  X.bestSkill = function (skill) { let best = 0; for (const m of X.members()) best = Math.max(best, G.State.skillOf(m, skill)); return best; };
  X.baseHostiles = function (node) {
    const loc = G.Map.loc(node), wo = X.worldOverride(node);
    return wo && wo.odds && wo.odds.hostiles != null ? wo.odds.hostiles : loc.odds.hostiles;
  };
  // Disturbance % = object noise (+10 forced) + location Hostiles % / 10 + Heat bonus + 1% per search this visit
  //                 - 1% per 10 levels of the squad's best Stealth; minimum 1%.
  X.searchInfo = function (objId, action) {
    const site = X.site(), o = X.obj(objId, site), T = X.typeDef(o), C = CFG().search, node = X.node(site.nid);
    action = action || X.objActions(o)[0] || "search";
    let sec = o.searchSec != null ? o.searchSec : T.searchSec || 0;
    if (action === "pick" && T.lock && T.lock.pickSec) sec = T.lock.pickSec;
    if (action === "kick" && T.lock && T.lock.kick) sec = T.lock.kick.sec;
    const scav = X.bestSkill("scavenging");
    if (action !== "train") sec = sec * Math.max(0, 1 - (C.scavTimePctPer10 / 100) * Math.floor(scav / 10));
    if (action === "search") sec *= Math.max(0, 1 - G.Items.setStat(X.gearItems(), "search_pct") / 100);   // Scav Kit (3): 15% faster
    const forced = action === "force" || action === "kick";
    const noise = (o.noise != null ? o.noise : T.noise || 0) + (forced ? C.forceNoise : 0);
    const H = X.baseHostiles(node), heat = X.heatTier().siteBonus || 0, prior = site.visitSearches * C.perSearchPct;
    const stealth = Math.floor(X.bestSkill("stealth") / 10) * C.stealthPer10;
    const loud = G.Allies ? G.Allies.squadSum(run(), "disturbPct") : 0;   // Loudmouth (Slice 3 §1): +2% per deployed standing ally with it
    const raw = noise + H / C.hostilesDiv + heat + prior - stealth + loud;
    const tm = X.tutorialOn() && CFG().tutorial.disturbanceMult != null ? CFG().tutorial.disturbanceMult : 1;   // tutorial only
    const pct = Math.max(C.minPct, raw * tm);
    const heatGain = action === "force" ? CFG().heat.forceLock : action === "kick" ? CFG().heat.kickDoor : action === "train" ? (T.train.heat || 0) : action === "search" && o.type !== "door" ? (T.searchHeat || 0) : 0;   // searchHeat: Slice 5 §G Crater pod
    let check = null;
    if (action === "pick" && T.lock) check = G.Checks.compute(T.lock.check.skill, T.lock.check.dc, X.members(), X.gearItems());
    if (action === "search" && o.heavy && T.heavy) check = G.Checks.compute(T.heavy.check.skill, T.heavy.check.dc, X.members(), X.gearItems());
    const math = `noise ${noise}${forced ? " (forced)" : ""} + Hostiles ${H}/${C.hostilesDiv} = ${f1(H / C.hostilesDiv)} + Heat ${heat} + searches ${prior} − Stealth ${stealth}${loud ? ` + Loudmouth ${loud}` : ""}${tm !== 1 ? ` = ${f1(raw)} × tutorial ${tm}` : ""} = ${f1(pct)}%`;
    return { action, sec, noise, H, heat, prior, stealth, loud, pct, tutorialMult: tm, heatGain, check, math };
  };

  // ---------- loot ----------
  X.rollObjectLoot = function (node, type, o) {
    if (o && o.fixedLoot) return { items: o.fixedLoot.items.slice(), res: Object.assign({}, o.fixedLoot.res) };   // a fallen Grunt's body
    const T = SD().types[type], rng = G.rng, zone = DATA.zones.list[node.zone || "a"], loc = G.Map.loc(node);
    const items = [], res = {};
    if (!(o && o.resOnly)) {   // resOnly: the debug loot readout (works at the outpost, no gear rolls)
      const HL = o && o.hunter ? DATA.enemies.hunters.loot : null;   // Hunter bodies: iLvl +3, +10 rarity, 12% Hunter's Garb
      const ilvl = X.itemLevel(node) + (HL ? HL.ilvlPlus : 0), rb = X.rarityBonus() + (T.rarityBonus || 0) + ((o && o.rarityBonus) || 0) + (HL ? HL.rarityBonus : 0);
      if (HL && rng.chance(HL.garbPct)) items.push(G.Items.rollHunterPiece(rng, ilvl, rb));
      let n = (T.gearRolls || 0) + (T.gearChance && rng.chance(T.gearChance) ? 1 : 0) + (T.bonusItems || 0) + ((o && o.bonusItems) || 0) + (o && o.heavy && T.heavy ? T.heavy.bonusItems : 0);
      // Slice 3 §5: Militia Issue pieces x2 in Outlaw Gunman bodies
      const lo = o && o.unit && DATA.sets && DATA.sets.gunmanMult && o.unit === "gunman" ? { setMult: DATA.sets.gunmanMult } : null;
      for (let i = 0; i < n; i++) items.push(G.Items.rollLoot(rng, ilvl, rb, lo));
      if (o && o.dropWeapon) items.push(G.Items.make(o.dropWeapon, G.Items.rollRarity(rng, X.rarityBonus(), ilvl), ilvl, rng));
      if (T.orangePct && rng.chance(T.orangePct)) { const oi = Math.max(ilvl, DATA.items.rarities.orange.minIlvl || 0); items.push(G.Items.make(G.Items.rollBase(rng), "orange", oi, rng)); }   // Slice 5 §G Crater pod
    }
    const tags = loc.tags || [], mult = SD().tagWeightMult;
    for (let k = 0; k < (T.resRolls || 0); k++) {
      const medK = (SD().medWeightByKind || {})[loc.kind] ?? 1;   // Med Supplies by location kind (medical / industrial)
      const e = rng.weighted(T.table, (x) => x[1] * (x[0] && tags.includes((DATA.resources[x[0]] && DATA.resources[x[0]].tag) || x[0]) ? mult : 1) * (x[0] === "med" ? medK : 1));
      if (!e[0] || DATA.resources[e[0]].hidden) continue;
      const m = (zone.resourceMult || 1) * (DATA.resources[e[0]].dropMult || 1);   // zone x resource drop multiplier, randomly rounded
      const amt = Math.floor(rng.int(e[2], e[3]) * m + (m !== 1 ? rng() : 0));
      if (amt > 0) res[e[0]] = (res[e[0]] || 0) + amt;
    }
    X.rollExtras((T.extras || []).concat((o && o.extras) || []), res, rng);
    if (o && o.famDrops) X.rollFamilyDrops(o.famDrops, items, res, rng, X.itemLevel(node), !!o.resOnly, o.unit);   // Slice 5 §F
    return { items, res };
  };

  // Slice 3 §11: independent bonus rolls [{ res, n, chance %, minTier }] (safe Relic Tech at Marked+, Rival's pack, Elites)
  X.tierAtLeast = function (name, heat) { const th = CFG().heat.thresholds, i = th.findIndex((t) => t.name === name); return i < 0 || th.indexOf(X.heatTier(heat)) >= i; };
  X.rollExtras = function (extras, res, rng) {
    for (const x of extras || []) {
      if (x.minTier && !(G.state.run && X.tierAtLeast(x.minTier))) continue;
      if (rng.chance(x.chance)) res[x.res] = (res[x.res] || 0) + (x.n || 1);
    }
    return res;
  };

  // Debug / tests (Slice 3 §11 acceptance 1): roll a searchable's loot n times at a location and compare with its table.
  // Returns { n, type, loc, rows: [{ res, weightPct, hitPct, avg }] } (weightPct = the entry's share after tag / med mults).
  X.lootReadout = function (type, n, node) {
    node = node || (G.state.run && G.state.maps[G.state.run.zone].nodes[G.state.run.loc]) || Object.values(G.state.maps.a.nodes).find((x) => x.loc && G.Map.loc(x) && !G.Map.loc(x).extraction);
    const T = SD().types[type], loc = G.Map.loc(node), tags = loc.tags || [], rng = G.Util.makeRng(12345), hits = {}, sum = {};
    const saved = G.rng; G.rng = rng;
    try { for (let i = 0; i < n; i++) { const l = X.rollObjectLoot(node, type, { resOnly: true }); for (const k in l.res) { hits[k] = (hits[k] || 0) + 1; sum[k] = (sum[k] || 0) + l.res[k]; } } } finally { G.rng = saved; }
    const medK = (SD().medWeightByKind || {})[loc.kind] ?? 1, wOf = (x) => x[1] * (x[0] && tags.includes((DATA.resources[x[0]] && DATA.resources[x[0]].tag) || x[0]) ? SD().tagWeightMult : 1) * (x[0] === "med" ? medK : 1);
    const tot = (T.table || []).reduce((a, x) => a + wOf(x), 0), rows = [];
    for (const x of T.table || []) rows.push({ res: x[0] || "nothing", weightPct: tot ? 100 * wOf(x) / tot : 0, hitPct: x[0] ? 100 * (hits[x[0]] || 0) / n : null, avg: x[0] ? (sum[x[0]] || 0) / n : null });
    for (const k in hits) if (!rows.some((r) => r.res === k)) rows.push({ res: k, weightPct: null, hitPct: 100 * hits[k] / n, avg: sum[k] / n, extra: true });
    return { n, type, loc: loc.name, resRolls: T.resRolls || 0, rows };
  };

  // ---------- doing things ----------
  // Click on an event / survivor / grate object (no timer). Returns { confirm: "cross", pid } for the grate.
  X.useObject = function (objId) {
    const site = X.site(), o = X.obj(objId, site), why = X.objBlocked(o, site); if (why) return { error: why };
    if (o.kind === "grate") return { confirm: "cross", pid: o.pid };
    o.done = true;
    if (o.kind === "survivor") X.push({ type: "message", title: "Survivor", text: "A ragged survivor asks to come back with you. (+1 Grunt if you extract)", effects: [{ gruntsJoin: CFG().expedition.survivorsGiveGrunt }], objId });
    else X.push({ type: "event", eventId: o.eventId, nid: site.nid, objId, radio: o.eventId === "distress_hollow_creek" });
    G.State.save();
    return {};
  };
  // Reopen leftovers (no timer, no roll)
  X.reopen = function (objId) {
    const o = X.obj(objId); if (!X.hasLeft(o)) return false;
    X.push({ type: "container", items: o.left.items, res: o.left.res, opened: true, nid: run().loc, objId, title: o.name, def: { id: o.type, name: o.name } });
    o.left = null; return true;
  };

  // Called when the search progress bar completes. Resolves checks, the disturbance roll, then queues
  // [battle] + [loot]. Returns { texts, roll, disturb:{pct, roll, hit}, empty } for the UI.
  // Slice 4 §E: one-line examine text for anything in a location view (data: DATA.searchables examine fields / propInfo)
  X.examine = function (o) {
    if (!o) return null;
    const S = DATA.searchables;
    if (G.Main && (o.kind === "mural" || o.kind === "wheel" || o.kind === "pod" || o.sealed)) { const t = G.Main.examine(o); if (t) return t; }
    if (o.examine) return o.examine;
    if (o.kind === "event") return (S.eventObjects[o.eventId] || S.eventObjects.default).examine || S.examineDefault;
    if (o.kind === "survivor") return S.survivorObject.examine || S.examineDefault;
    if (o.kind === "grate") return ((DATA.zones.passages || {})[o.pid] || {}).examine || S.examineDefault;
    if (o.kind === "exit") { const E = S.access.exit; return (E.styles[o.style] || E.styles[E.default]).examine; }   // Slice 5 §D: read from data each time
    if (o.kind === "extract") { const sp = X.extractSpot(o.loc); return (X.wrecked(X.node(o.nid)) && sp.examineWrecked) || sp.examine; }
    const T = S.types[o.type];
    return (T && T.examine) || S.examineDefault;
  };
  X.propInfo = (sprite) => DATA.searchables.propInfo[sprite] || { name: "", examine: DATA.searchables.examineDefault };
  X.completeSearch = function (objId, action) {
    const r = run(), site = X.site(), o = X.obj(objId, site), node = X.node(site.nid);
    const why = X.objBlocked(o, site); if (why) return { error: why };
    action = action || X.objActions(o)[0];
    if (!X.objActions(o).includes(action)) return { error: "Can't " + action + " that." };
    const info = X.searchInfo(objId, action), T = X.typeDef(o), texts = [];
    let roll = null, loot = null;
    site.visitSearches++; site.searches++; r.stats.searches = (r.stats.searches || 0) + 1;
    if (action !== "train") G.XP.at({ obj: o.id }, () => G.State.giveXp({ kind: "body", body: X.body() }, "scavenging", CFG().leveling.xp.search));
    const openDoor = () => {
      site.rooms[o.opens].open = true; o.searched = true; texts.push("The door opens.");
      if (T.stashChance && G.rng.chance(T.stashChance)) { loot = X.rollObjectLoot(node, T.stashAs, { rarityBonus: CFG().search.doorStashRarityBonus }); texts.push("A stash was hidden behind it!"); }
    };
    const check = (c) => { const ci = G.Checks.compute(c.skill, c.dc, X.members(), X.gearItems()); const rr = G.XP.at({ obj: o.id }, () => G.Checks.roll(ci, null, "search")); X.log(rr.text, "check"); return rr; };
    if (action === "pick") {
      roll = check(T.lock.check);
      if (G.Checks.isSuccess(roll.grade)) { o.locked = false; texts.push("Lock picked."); if (o.type === "door") openDoor(); else { loot = X.rollObjectLoot(node, o.type, o); o.searched = true; } }
      else { o.jammed = true; texts.push(o.type === "door" ? "The lock jams. You'll have to kick it." : "The lock jams. You'll have to force it."); }
    } else if (action === "train") {   // Slice 5 §F: time -> skill XP, a little Heat; the disturbance roll below is the risk
      const TR = T.train; o.trainedRun = G.state.runCount; r.stats.trained = (r.stats.trained || 0) + 1;
      G.XP.at({ obj: o.id }, () => G.State.giveXp({ kind: "body", body: X.body() }, TR.skill, TR.xp));
      if (info.heatGain) { X.addHeat(info.heatGain, "train"); texts.push(`+${info.heatGain} Heat`); }
      texts.unshift(TR.line); X.log(`${TR.label || "Train"} at ${o.name}: +${TR.xp} ${DATA.skills[TR.skill].name} XP.`, "good");
    } else if (action === "force" || action === "kick") {
      if (info.heatGain) { X.addHeat(info.heatGain, action); texts.push(`+${info.heatGain} Heat`); }
      o.locked = false;
      if (o.type === "door") { o.broken = true; openDoor(); } else { loot = X.rollObjectLoot(node, o.type, o); o.searched = true; texts.push("Forced open."); }
    } else {
      if (o.type === "door") openDoor();
      else {
        if (o.heavy && T.heavy) {
          roll = check(T.heavy.check);
          if (!G.Checks.isSuccess(roll.grade)) { o.blocked = true; texts.push("Too heavy to shift."); }
        }
        if (o.trapped && T.trap && !o.blocked) {
          roll = check(T.trap.check);
          o.trapped = false;
          if (G.Checks.isSuccess(roll.grade)) texts.push("You spot a trap wire and disarm it.");
          else { texts.push("It was trapped!"); X.damageBody(roll.grade === "badFail" ? T.trap.badFailDmgPct : T.trap.failDmgPct); if (!run() || run() !== r) return { texts, roll, died: true }; }
        }
        if (!o.blocked) {
          loot = X.rollObjectLoot(node, o.type, o); o.searched = true;
          if (info.heatGain) { X.addHeat(info.heatGain, "search"); texts.push(`+${info.heatGain} Heat`); }
          if (o.guaranteed) { loot.items.unshift(G.Items.make(o.guaranteed.base, o.guaranteed.rarity, X.itemLevel(node), G.rng)); G.state.locFlags[site.loc + "_gl"] = true; }
        }
      }
    }
    // quest item: only while the quest is active and you don't already have one
    if (o.questId && (o.searched || !loot) && !o.blocked && G.Quests.itemAvailable(o.questId)) { loot = loot || { items: [], res: {} }; loot.items.push(G.Items.makeQuest(G.Quests.def(o.questId).objective.item)); texts.push("Found what you came for.");
      const qh = G.Quests.objectiveHeat(o.questId); if (qh) { X.addHeat(qh, "quest"); texts.push(`+${qh} Heat`); } }
    // disturbance
    const dr = G.rng() * 100, hit = dr < info.pct;
    X.log(`Disturbance ${o.name}: ${info.math} → rolled ${Math.floor(dr)}: ${hit ? "something heard you!" : "quiet."}`, "roll");
    const loc = G.Map.loc(node);
    if (hit) X.push({ type: "battle", family: loc.family, budgetMult: CFG().search.battleBudgetMult, nid: site.nid, why: "Disturbance! Something heard you." });
    // Slice 3: a terminal can trip a drone alarm (a machine fight); off until its enemy family exists (step 8)
    const al = T.alarm; let alarm = null;
    if (al && o.searched && !hit && DATA.enemies.families[al.family]) {
      const ar = G.rng() * 100; alarm = { pct: al.chance, roll: ar, hit: ar < al.chance };
      X.log(`Alarm ${o.name}: ${al.chance}% → rolled ${Math.floor(ar)}: ${alarm.hit ? "a drone answers!" : "quiet."}`, "roll");
      if (alarm.hit) X.push({ type: "battle", family: al.family, budgetMult: al.budgetMult, nid: site.nid, why: al.why });
    }
    if (o.searched && o.type !== "door") { X.markPicked(site); site.everPicked = true; }   // Slice 3 §12
    if (o.searched && o.type !== "door" && G.Cards) G.Cards.onSearch(site.nid, node.loc);   // Slice 4 §D: the location's card (first search here this run)
    const empty = !loot || (!loot.items.length && !Object.keys(loot.res).length);
    if (!empty) X.push({ type: "container", items: loot.items, res: loot.res, opened: true, nid: site.nid, objId: o.id, title: o.name, def: { id: o.type, name: o.name } });
    else if (o.searched && o.type !== "door") texts.push("Nothing useful.");
    G.State.save();
    return { texts, roll, disturb: { pct: info.pct, roll: dr, hit, math: info.math }, alarm, empty };
  };

  // leftovers stay in the object
  X.storeLeftovers = function (step) {
    if (!step || !step.objId) return;
    const site = X.site(step.nid); if (!site) return;
    const o = X.obj(step.objId, site); if (!o) return;
    const res = {}; for (const k in step.res) if (step.res[k] > 0) res[k] = step.res[k];
    o.left = step.items.length || Object.keys(res).length ? { items: step.items.slice(), res } : null;
  };

  // ---------- battle corpses ----------
  // Every killed enemy becomes a searchable body where the fight happened (gore kept: corpse sprite + blood decal).
  // The battle's gear drops (battleLootRolls) go into random killed human enemies as that unit's own weapon.
  X.addBattleBodies = function (nid, dead) {
    const site = X.site(nid); if (!site || !dead.length) return;
    const bodies = [];
    const openRooms = site.rooms.filter((R) => R.open);
    for (const u of dead) {
      const beast = u.family === "beasts" || (DATA.sprites.beastFamilies || []).includes(u.family), machine = !!u.metal;
      const type = machine ? "body_machine" : beast ? "body_beast" : "body_human";   // Slice 3 §4a: a killed machine is a wreck
      const o = mk(site, { type, name: (machine ? "Wreck: " : beast ? "Dead " : "Body: ") + u.name, sprite: u.corpseSprite || u.corpse || SD().types[type].sprite, fresh: true, gibbed: !!u.gibbed, unit: u.eid, rot: Math.round(G.rng() * 360) });
      if (u.elite && SD().eliteExtras && X.tierAtLeast("Marked")) o.extras = SD().eliteExtras.filter((x) => !x.minTier || X.tierAtLeast(x.minTier));   // Relic Tech on Elites at Marked+
      const ud = DATA.enemies.units[u.eid] || {};
      if (ud.relicPct) o.extras = (o.extras || []).concat([{ res: "relic", n: 1, chance: ud.relicPct }]);   // Warden: 10% Relic Tech
      if ((DATA.enemies.familyDrops || {})[u.family]) o.famDrops = u.family;   // Slice 5 §F: the family's rare table
      if (u.family === "hunters") {   // Slice 3 §4b Hunter loot: gear at iLvl +3 / +10 rarity, 12% Hunter's Garb, Data Shard 20%, Relic 8% (Captain: always 1)
        const HL = DATA.enemies.hunters.loot; o.hunter = true; o.bonusItems = 1;
        o.extras = (o.extras || []).concat([{ res: "data_shards", n: 1, chance: HL.shardPct }, ud.relicAlways ? { res: "relic", n: ud.relicAlways, chance: 100 } : { res: "relic", n: 1, chance: HL.relicPct }]);
      }
      place(site, o, G.rng.pick(openRooms).i, G.rng);
      site.decals.push({ sprite: machine ? ((DATA.sprites.machineFx || {}).pool || "fx_oil_pool") : "fx_blood_pool", x: o.x, y: o.y + 6, room: o.room });
      const wb = u.weaponBase && DATA.items.bases[u.weaponBase];
      if (!beast && !machine && wb && !wb.natural) bodies.push(o);   // beasts and machines carry no gear
    }
    const human = bodies;
    for (let k = 0; k < CFG().expedition.battleLootRolls && human.length; k++) {
      const o = human.splice(G.rng.int(0, human.length - 1), 1)[0];
      o.dropWeapon = DATA.enemies.units[o.unit].weapon;
    }
  };

  // Slice 3 §7: beaten rivals: a body per unit holding its gear (G.Rivals.lootFor chances / item level cap) + a Rival's pack
  X.addRivalBodies = function (nid, dead, snap) {
    const site = X.site(nid); if (!site) return;
    const openRooms = site.rooms.filter((R) => R.open), node = X.node(nid);
    for (const u of dead) {
      const su = u.snapUnit || snap.units[u.rivalIdx] || {}, items = G.Rivals.lootFor(su, node, G.rng);
      const o = mk(site, { type: "body_human", name: "Body: " + u.name + " (ghost)", sprite: u.corpseSprite || u.corpse || SD().types.body_human.sprite, fresh: true, gibbed: !!u.gibbed, rivalBody: snap.id, fixedLoot: { items, res: {} }, rot: Math.round(G.rng() * 360) });
      place(site, o, G.rng.pick(openRooms).i, G.rng);
      site.decals.push({ sprite: "fx_blood_pool", x: o.x, y: o.y + 6, room: o.room });
    }
    X.addSearchObject(site, "rival_pack", { name: `${snap.handle}'s pack`, rival: snap.id });
  };

  // Megan's playtest: a Grunt killed in battle leaves a body you can search, holding exactly the gear it had equipped.
  // Slice 5 §C: it also holds the dead teammate's share of the run bag (its part of the squad's capacity), and it's the
  // one player-facing "their pack" object: searchable once, gone if you move on without emptying it (X.dropBagsGone).
  X.addGruntBodies = function (nid, dead) {
    const site = X.site(nid); if (!site || !dead.length) return;
    const openRooms = site.rooms.filter((R) => R.open), r = run(), DB = CFG().carry.deadBag || {};
    const lost = dead.map((m) => X.memberCarryKg(m)), capBefore = X.capacity() + lost.reduce((a, b) => a + b, 0), kg0 = X.carried();
    dead.forEach((m, i) => {
      const share = X.takeBagShare(lost[i] / (capBefore - lost.slice(0, i).reduce((a, b) => a + b, 0)));
      const items = G.State.gruntItems(m.g).map((it) => U.clone(it)).concat(share.items), nm = G.Allies.name(m.g);
      const o = mk(site, { type: "body_human", name: "Body: " + nm, sprite: (m.died && m.died.corpse) || (G.Allies.isVeteran(m.g) ? "corpse_veteran" : SD().types.body_human.sprite), fresh: true, gibbed: !!(m.died && m.died.gibbed), gruntBody: m.g.uid, vet: G.Allies.isVeteran(m.g) || undefined, fixedLoot: { items, res: share.res }, rot: Math.round(G.rng() * 360),
        deadBag: { share: share.items.length + Object.values(share.res).reduce((a, b) => a + b, 0) }, examine: DB.examine });
      place(site, o, G.rng.pick(openRooms).i, G.rng);
      site.decals.push({ sprite: "fx_blood_pool", x: o.x, y: o.y + 6, room: o.room });
      if (m.g.gear) m.g.gear = G.State.emptyGear(m.g);   // the gear is on the body now
    });
    // the HUD's "sudden drop" note (js/ui.js carry panel) for as long as you stay here
    const cap = X.capacity(), kg = X.carried();
    r.carryDrop = { nid, names: dead.map((m) => G.Allies.name(m.g)), lostKg: lost.reduce((a, b) => a + b, 0), shareKg: Math.max(0, kg0 - kg), cap, pct: Math.round(kg / cap * 100) };
    X.log(`Carry −${U.fmt1(r.carryDrop.lostKg)} kg: ${r.carryDrop.names.join(", ")} ${dead.length > 1 ? "are" : "is"} gone. ` + (r.carryDrop.shareKg > 0 ? `${U.fmt1(r.carryDrop.shareKg)} kg of the bag they were carrying is on ${dead.length > 1 ? "their bodies" : "the body"}.` : "Their gear is on the body."), "bad");
  };
  // Slice 5 §C: moving on from nid: every dead teammate's body there that still holds something loses it
  X.dropBagsGone = function (nid) {
    const site = nid && X.site(nid), r = run(); if (!site || !(CFG().carry.deadBag || {}).vanishOnLeave) return;
    for (const o of site.objects) if (o.deadBag && !o.deadBag.gone && (!o.searched || X.hasLeft(o))) {
      o.deadBag.gone = true; o.searched = true; o.left = null; o.fixedLoot = { items: [], res: {} };
      X.log(`${o.name.replace(/^Body: /, "")}'s pack is gone: you didn't take it.`, "bad");
    }
    if (r.carryDrop && r.carryDrop.nid === nid) r.carryDrop = null;
  };

  // ---------- arrival ----------
  X.revisitInfo = function (node) {
    const base = X.baseHostiles(node), mult = CFG().revisit.hostileMult, bonus = X.heatTier().siteBonus || 0;
    const pct = U.clamp(base * mult + bonus, 0, 100);
    return { base, mult, bonus, pct, text: `Revisit Hostiles ${base}% × ${mult} = ${f1(base * mult)} + Heat bonus ${bonus} = ${f1(pct)}%` };
  };
  X.arrive = function (node, revisit) {
    const r = run(), loc = G.Map.loc(node);
    if (!loc) { r.view = "map"; return; }
    const site = X.ensureSite(node);
    site.visitSearches = 0; site.visits++;
    r.view = "site";
    { const ex = X.exitObj(site); if (ex) site.squadAt = ex.id; }   // Slice 5 §D: you arrive by the way in
    if (!revisit && loc.entryHeat) { X.addHeat(loc.entryHeat, "secret"); X.log(`${loc.name}: every Hunter in orbit saw you come in. +${loc.entryHeat} Heat.`, "heat"); }   // Slice 5 §G the Crater
    const t = X.heatTier();
    // Break away: the enemies you ran from are still here (this run only)
    if (site.escaped) { if (site.escaped.run === G.state.runCount) { const again = site.escaped.step; site.escaped = null; X.log(`${loc.name}: the fight you broke away from is still here.`, "bad"); X.push(again); return; } site.escaped = null; }
    // Slice 3 §7: a rival squad instead of the normal Hostiles roll (first entry only; Manhunt's forced battle wins)
    if (!revisit && !t.forcedBattle && G.Rivals && G.Rivals.onArrive(node)) { if (loc.passage && !G.Zones.passageVisible(loc.passage, site.zone)) X.push({ type: "spot", pid: loc.passage, nid: node.id }); return; }
    let pct, text;
    if (revisit) { const rv = X.revisitInfo(node); pct = rv.pct; text = rv.text; }
    else { const eh = X.entryHostiles(node); pct = eh.pct; text = eh.text; }   // Slice 3 §12: x restock multiplier on a picked-over site
    const dr = G.rng() * 100, hit = dr < pct || !!t.forcedBattle;
    X.log(`${loc.name}: ${text} → rolled ${Math.floor(dr)}${t.forcedBattle ? " (Manhunt: forced)" : ""}: ${hit ? "hostiles!" : "quiet."}`, "roll");
    // Slice 3 §4b: at Manhunt the forced battle is a Hunter strike team (the Marked pack + 1 Marksman)
    if (hit && t.forcedBattle && G.Hunters) X.push({ type: "battle", family: "hunters", pack: "Manhunt", hunters: true, nid: node.id, why: "A hunter strike team intercepts you!" });
    else if (hit) X.push({ type: "battle", family: loc.family, budgetMult: t.forcedBattle ? 1.5 : 1, nid: node.id, why: t.forcedBattle ? "A hunter strike team intercepts you!" : revisit ? "They were waiting for you." : "Hostiles!" });
    if (loc.passage && !G.Zones.passageVisible(loc.passage, site.zone)) X.push({ type: "spot", pid: loc.passage, nid: node.id });
  };

  // ---------- passage ----------
  // Spot check: best of the passage's skills (squad best) vs its DC
  X.spotInfo = function (pid) {
    const P = DATA.zones.passages[pid], sp = P.spot;
    let best = null;
    for (const sk of sp.skills) { const ci = G.Checks.compute(sk, sp.dc, X.members(), X.gearItems()); if (!best || ci.chance > best.chance) best = ci; }
    return best;
  };
  X.resolveSpot = function (step) {
    const info = X.spotInfo(step.pid), roll = G.Checks.roll(info, null, "spot");
    X.log(roll.text, "check");
    X.next();
    if (G.Checks.isSuccess(roll.grade)) { X.discoverPassage(step.pid); return { found: true, roll }; }
    return { found: false, roll };
  };
  X.discoverPassage = function (pid) {
    const s = G.state; if (s.passages[pid]) return;
    s.passages[pid] = true;
    const P = DATA.zones.passages[pid];
    for (const k in P.ends) {
      const z = P.ends[k].zone; if (s.zonesUnlocked[z]) continue;
      if (DATA.zones.passageUnlockOnDeath) s.zonesUnlocked[z] = true;
      else if (run()) { run().pendingUnlocks = run().pendingUnlocks || []; run().pendingUnlocks.push(z); }
    }
    const from = (run() && run().zone) || P.hiddenAt || "a";
    X.log(`You found the ${P.name || "passage"}! It leads to ${DATA.zones.list[G.Zones.otherEnd(pid, from)].name}.`, "good");
    G.State.save();
  };
  X.canCross = function (pid) {
    const r = run(); if (!r || r.queue.length) return "Finish what's in front of you first.";
    if (X.immobile()) return "You're carrying too much to move.";
    const here = X.node(); const loc = G.Map.loc(here);
    if (!loc || loc.passage !== pid) return "No passage here.";
    if (!G.Zones.passageVisible(pid, r.zone)) return "You haven't found it.";
    return null;
  };
  // Crossing: +crossHeat (not the +2 per move), counts as a move (depth, distress countdown), arrive at the other end
  X.crossPassage = function (pid) {
    const why = X.canCross(pid); if (why) return why;
    const r = run(), P = DATA.zones.passages[pid], to = G.Zones.otherEnd(pid, r.zone), nid = G.Zones.passageNode(pid, to);
    r.zone = to;
    X.addHeat(P.crossHeat != null ? P.crossHeat : CFG().heat.passageCross, "passage");
    X.log(`You ${P.crossVerb || "squeeze through"} the ${P.name || "passage"} into ${DATA.zones.list[to].name}. +${P.crossHeat} Heat.`);
    X.enterNode(nid, { noMoveHeat: true, passage: true });
    { const st = X.site(nid), gr = st && st.objects.find((o) => o.kind === "grate"); if (gr) st.squadAt = gr.id; }   // Slice 5 §D: you come up out of the grate
    return null;
  };
})(typeof window !== "undefined" ? window : globalThis);
