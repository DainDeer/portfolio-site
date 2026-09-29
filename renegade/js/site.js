// Location views (Slice 2 §5-6): per-run sites with rooms, doors and searchable objects; timed searches with a
// disturbance roll; battle corpses become searchable bodies; the passage grate. Logic only: the UI runs the
// progress bar and then calls G.Exp.completeSearch(objId, action). No DOM here.
(function (root) {
  const G = root.G, U = G.Util, X = G.Exp;
  const SD = () => DATA.searchables, CFG = () => DATA.config;
  const run = () => G.state.run;
  const f1 = (n) => (Math.round(n * 10) / 10).toString();

  X.node = (nid) => G.Zones.node(nid || run().loc);
  X.site = (nid) => (run() && run().sites ? run().sites[nid || run().loc] : null);
  X.inSite = () => !!run() && run().view === "site" && !!X.site();
  X.leaveSite = function () { const r = run(); if (r && !r.queue.length) r.view = "map"; };
  X.enterSite = function () { const r = run(); if (r && X.site()) r.view = "site"; };
  X.obj = (id, site) => (site || X.site()).objects.find((o) => o.id === id);
  X.typeDef = (o) => SD().types[o.type] || {};

  // ---------- generation ----------
  X.ensureSite = function (node) {
    const r = run(); r.sites = r.sites || {};
    if (!r.sites[node.id]) r.sites[node.id] = X.generateSite(node);
    return r.sites[node.id];
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
  function objectWeights(loc) {
    const W = SD().objectWeights, w = Object.assign({}, W.base);
    for (const t of loc.tags || []) for (const k in W.byTag[t] || {}) w[k] = (w[k] || 0) + W.byTag[t][k];
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
    const site = { nid: node.id, loc: node.loc, zone: node.zone || "a", size, rooms, objects: [], props: [], decals: [], floor: floorFor(loc), visits: 0, visitSearches: 0, searches: 0, nextId: 1 };
    // doors: each room after the first sits behind a door in the wall it shares with its parent (the door belongs to the parent)
    const D = S.types.door;
    for (let i = 1; i < nRooms; i++) {
      const R = rooms[i], P = rooms[R.parent];
      let x, y;
      if (R.row === P.row) { x = (R.col > P.col ? R.x : P.x) - V.wall / 2; y = R.y + R.h / 2; }
      else { y = (R.row > P.row ? R.y : P.y) - V.wall / 2; x = R.x + R.w / 2; }
      mk(site, { type: "door", name: "Door", sprite: D.sprite, room: P.i, opens: i, vertical: R.row === P.row, x: Math.round(x), y: Math.round(y), locked: rng.chance(D.lock.chance) });
    }
    // the searchables: fixed ones first (they take generated slots, so the count stays in the size range)
    const fixed = [];
    const gl = loc.guaranteedLoot;
    if (gl && !(gl.once !== false && G.state.locFlags[node.loc + "_gl"])) fixed.push({ type: gl.object.type, name: gl.object.name, guaranteed: gl });
    const wo = X.worldOverride(node);
    if (wo && wo.container) fixed.push({ type: wo.container.type, name: wo.container.name, bonusItems: wo.container.bonusItems, rarityBonus: wo.container.rarityBonus, salvage: true });
    for (const qid of G.Quests.findObjectsAt(site.zone, node.loc)) { const o = G.Quests.def(qid).objective.object; fixed.push({ type: o.type, name: o.name, sprite: o.sprite, searchSec: o.searchSec, noise: o.noise, questId: qid }); }
    const w = objectWeights(loc), keys = Object.keys(w).filter((k) => w[k] > 0);
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
    // event object (Slice 1 "Event %" = is there an event object here), survivor object
    const odds = X.odds(node);
    let ev = null;
    if (wo && wo.event) ev = wo.event;
    else if ((loc.events || []).length && rng.chance(odds.event)) ev = rng.pick(loc.events);
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
    if (o.kind === "grate") return null;
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
    sec = sec * Math.max(0, 1 - (C.scavTimePctPer10 / 100) * Math.floor(scav / 10));
    const forced = action === "force" || action === "kick";
    const noise = (o.noise != null ? o.noise : T.noise || 0) + (forced ? C.forceNoise : 0);
    const H = X.baseHostiles(node), heat = X.heatTier().siteBonus || 0, prior = site.visitSearches * C.perSearchPct;
    const stealth = Math.floor(X.bestSkill("stealth") / 10) * C.stealthPer10;
    const raw = noise + H / C.hostilesDiv + heat + prior - stealth;
    const tm = X.tutorialOn() && CFG().tutorial.disturbanceMult != null ? CFG().tutorial.disturbanceMult : 1;   // tutorial only
    const pct = Math.max(C.minPct, raw * tm);
    const heatGain = action === "force" ? CFG().heat.forceLock : action === "kick" ? CFG().heat.kickDoor : 0;
    let check = null;
    if (action === "pick" && T.lock) check = G.Checks.compute(T.lock.check.skill, T.lock.check.dc, X.members(), X.gearItems());
    if (action === "search" && o.heavy && T.heavy) check = G.Checks.compute(T.heavy.check.skill, T.heavy.check.dc, X.members(), X.gearItems());
    const math = `noise ${noise}${forced ? " (forced)" : ""} + Hostiles ${H}/${C.hostilesDiv} = ${f1(H / C.hostilesDiv)} + Heat ${heat} + searches ${prior} − Stealth ${stealth}${tm !== 1 ? ` = ${f1(raw)} × tutorial ${tm}` : ""} = ${f1(pct)}%`;
    return { action, sec, noise, H, heat, prior, stealth, pct, tutorialMult: tm, heatGain, check, math };
  };

  // ---------- loot ----------
  X.rollObjectLoot = function (node, type, o) {
    const T = SD().types[type], rng = G.rng, zone = DATA.zones.list[node.zone || "a"], loc = G.Map.loc(node);
    const items = [], res = {};
    const ilvl = X.itemLevel(node), rb = X.rarityBonus() + (T.rarityBonus || 0) + ((o && o.rarityBonus) || 0);
    let n = (T.gearRolls || 0) + (T.gearChance && rng.chance(T.gearChance) ? 1 : 0) + (T.bonusItems || 0) + ((o && o.bonusItems) || 0) + (o && o.heavy && T.heavy ? T.heavy.bonusItems : 0);
    for (let i = 0; i < n; i++) items.push(G.Items.rollLoot(rng, ilvl, rb));
    if (o && o.dropWeapon) items.push(G.Items.make(o.dropWeapon, G.Items.rollRarity(rng, X.rarityBonus()), ilvl, rng));
    const tags = loc.tags || [], mult = SD().tagWeightMult;
    for (let k = 0; k < (T.resRolls || 0); k++) {
      const e = rng.weighted(T.table, (x) => x[1] * (x[0] && tags.includes(x[0]) ? mult : 1));
      if (!e[0] || DATA.resources[e[0]].hidden) continue;
      const m = (zone.resourceMult || 1) * (DATA.resources[e[0]].dropMult || 1);   // zone x resource drop multiplier, randomly rounded
      const amt = Math.floor(rng.int(e[2], e[3]) * m + (m !== 1 ? rng() : 0));
      if (amt > 0) res[e[0]] = (res[e[0]] || 0) + amt;
    }
    return { items, res };
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
  X.completeSearch = function (objId, action) {
    const r = run(), site = X.site(), o = X.obj(objId, site), node = X.node(site.nid);
    const why = X.objBlocked(o, site); if (why) return { error: why };
    action = action || X.objActions(o)[0];
    if (!X.objActions(o).includes(action)) return { error: "Can't " + action + " that." };
    const info = X.searchInfo(objId, action), T = X.typeDef(o), texts = [];
    let roll = null, loot = null;
    site.visitSearches++; site.searches++; r.stats.searches = (r.stats.searches || 0) + 1;
    G.XP.at({ obj: o.id }, () => G.State.giveXp({ kind: "body", body: X.body() }, "scavenging", CFG().leveling.xp.search));
    const openDoor = () => {
      site.rooms[o.opens].open = true; o.searched = true; texts.push("The door opens.");
      if (T.stashChance && G.rng.chance(T.stashChance)) { loot = X.rollObjectLoot(node, T.stashAs, { rarityBonus: CFG().search.doorStashRarityBonus }); texts.push("A stash was hidden behind it!"); }
    };
    const check = (c) => { const ci = G.Checks.compute(c.skill, c.dc, X.members(), X.gearItems()); const rr = G.XP.at({ obj: o.id }, () => G.Checks.roll(ci)); X.log(rr.text, "check"); return rr; };
    if (action === "pick") {
      roll = check(T.lock.check);
      if (G.Checks.isSuccess(roll.grade)) { o.locked = false; texts.push("Lock picked."); if (o.type === "door") openDoor(); else { loot = X.rollObjectLoot(node, o.type, o); o.searched = true; } }
      else { o.jammed = true; texts.push(o.type === "door" ? "The lock jams. You'll have to kick it." : "The lock jams. You'll have to force it."); }
    } else if (action === "force" || action === "kick") {
      X.addHeat(info.heatGain, action); texts.push(`+${info.heatGain} Heat`);
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
          if (o.guaranteed) { loot.items.unshift(G.Items.make(o.guaranteed.base, o.guaranteed.rarity, X.itemLevel(node), G.rng)); G.state.locFlags[site.loc + "_gl"] = true; }
        }
      }
    }
    // quest item: only while the quest is active and you don't already have one
    if (o.questId && (o.searched || !loot) && !o.blocked && G.Quests.itemAvailable(o.questId)) { loot = loot || { items: [], res: {} }; loot.items.push(G.Items.makeQuest(G.Quests.def(o.questId).objective.item)); texts.push("Found what you came for."); }
    // disturbance
    const dr = G.rng() * 100, hit = dr < info.pct;
    X.log(`Disturbance ${o.name}: ${info.math} → rolled ${Math.floor(dr)}: ${hit ? "something heard you!" : "quiet."}`, "roll");
    const loc = G.Map.loc(node);
    if (hit) X.push({ type: "battle", family: loc.family, budgetMult: CFG().search.battleBudgetMult, nid: site.nid, why: "Disturbance! Something heard you." });
    const empty = !loot || (!loot.items.length && !Object.keys(loot.res).length);
    if (!empty) X.push({ type: "container", items: loot.items, res: loot.res, opened: true, nid: site.nid, objId: o.id, title: o.name, def: { id: o.type, name: o.name } });
    else if (o.searched && o.type !== "door") texts.push("Nothing useful.");
    G.State.save();
    return { texts, roll, disturb: { pct: info.pct, roll: dr, hit, math: info.math }, empty };
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
      const beast = u.family === "beasts" || (DATA.sprites.beastFamilies || []).includes(u.family);
      const type = beast ? "body_beast" : "body_human";
      const o = mk(site, { type, name: (beast ? "Dead " : "Body: ") + u.name, sprite: u.corpseSprite || u.corpse || SD().types[type].sprite, fresh: true, gibbed: !!u.gibbed, unit: u.eid, rot: Math.round(G.rng() * 360) });
      place(site, o, G.rng.pick(openRooms).i, G.rng);
      site.decals.push({ sprite: "fx_blood_pool", x: o.x, y: o.y + 6, room: o.room });
      const wb = u.weaponBase && DATA.items.bases[u.weaponBase];
      if (!beast && wb && !wb.natural) bodies.push(o);   // beasts carry no gear
    }
    const human = bodies;
    for (let k = 0; k < CFG().expedition.battleLootRolls && human.length; k++) {
      const o = human.splice(G.rng.int(0, human.length - 1), 1)[0];
      o.dropWeapon = DATA.enemies.units[o.unit].weapon;
    }
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
    const t = X.heatTier();
    let pct, text;
    if (revisit) { const rv = X.revisitInfo(node); pct = rv.pct; text = rv.text; }
    else { pct = X.odds(node).hostiles; text = `Hostiles ${f1(pct)}%`; }
    const dr = G.rng() * 100, hit = dr < pct || !!t.forcedBattle;
    X.log(`${loc.name}: ${text} → rolled ${Math.floor(dr)}${t.forcedBattle ? " (Manhunt: forced)" : ""}: ${hit ? "hostiles!" : "quiet."}`, "roll");
    if (hit) X.push({ type: "battle", family: loc.family, budgetMult: t.forcedBattle ? 1.5 : 1, nid: node.id, why: t.forcedBattle ? "A hunter strike team intercepts you!" : revisit ? "They were waiting for you." : "Hostiles!" });
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
    const info = X.spotInfo(step.pid), roll = G.Checks.roll(info);
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
    X.log(`You found the ${P.name || "passage"}! It leads to ${DATA.zones.list[G.Zones.otherEnd(pid, "a")].name}.`, "good");
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
    X.log(`You squeeze through the ${P.name || "passage"} into ${DATA.zones.list[to].name}. +${P.crossHeat} Heat.`);
    X.enterNode(nid, { noMoveHeat: true });
    return null;
  };
})(typeof window !== "undefined" ? window : globalThis);
