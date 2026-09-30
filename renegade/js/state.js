// Save state, bodies, grunts, XP routing, timers, local save.
(function (root) {
  const G = root.G, U = G.Util, S = G.Skills;
  const St = G.State = {};
  G.state = null;

  const BODY_SKILLS = () => Object.keys(DATA.skills).filter((k) => DATA.skills[k].kind === "body");
  const MIND_SKILLS = () => Object.keys(DATA.skills).filter((k) => DATA.skills[k].kind === "mind");
  St.BODY_SKILLS = BODY_SKILLS; St.MIND_SKILLS = MIND_SKILLS;

  St.makeBasicBody = function () {
    const d = DATA.bodies.basicBody;
    const skills = {};
    for (const k of BODY_SKILLS()) skills[k] = S.make(d.skills[k] || 1);
    return { uid: "body_basic", name: d.name, past: "a level-1 husk", family: "basic", cls: null, spec: null, quirks: [], skills, bodyXp: 0, restoreUntil: 0 };
  };

  St.rollHumanBody = function (rng, cls) {
    const H = DATA.bodies.humanRoll, C = DATA.bodies.classes;
    cls = cls || rng.pick(H.classPool);
    const spec = rng.pick(C[cls].specialties);
    const sp = DATA.bodies.specialties[spec];
    const skills = {};
    const cap = DATA.bodies.families.human.skillCap;
    for (const k of BODY_SKILLS()) {
      const base = sp.skills[k] || 1;
      const v = base > 1 ? base + rng.int(-H.skillVariance, H.skillVariance) : 1;
      skills[k] = S.make(U.clamp(v, 1, cap));
    }
    const nq = rng.int(H.quirksPerBody[0], H.quirksPerBody[1]);
    const quirks = rng.shuffle(Object.keys(DATA.bodies.quirks).slice()).slice(0, nq);
    return { uid: U.uid("body"), name: rng.pick(H.names), past: rng.pick(H.pasts), family: "human", cls, spec, quirks, skills, bodyXp: 0, restoreUntil: 0 };
  };

  St.rollHumanOffer = function (rng) {
    const H = DATA.bodies.humanRoll;
    const n = rng.int(H.offerCount[0], H.offerCount[1]);
    const classes = rng.shuffle(H.classPool.slice());
    const out = [];
    for (let i = 0; i < n; i++) out.push(St.rollHumanBody(rng, H.distinctClasses ? classes[i % classes.length] : null));
    // Doc Ilse L2 perk (Slice 2 §9): a Medic is guaranteed in the next human body pick (one-shot)
    if (G.Quests && G.Quests.consumeMedicPick() && !out.some((b) => b.cls === "medic")) out[out.length - 1] = St.rollHumanBody(rng, "medic");
    return out;
  };

  // Grunt record (Megan's playtest, extended in Slice 3 §1): stable uid, "First Last" name (DATA.bodies.grunt.names +
  // DATA.allies.surnames, renameable), nickname (shown First "Nick" Last), 2 traits, history (newest first, 10 lines),
  // runs / extractions / kills, gear { weapon, gear } (a Veteran: weapon / head / body / pack) equipped from the stash.
  // Dead allies move to state.fallenGrunts with dead: true (never deleted): the Memorial Wall lists them.
  St.pickGruntName = function (rng) {
    const s = G.state, names = DATA.bodies.grunt.names || ["Grunt"], sur = (DATA.allies && DATA.allies.surnames) || [];
    const used = new Set(((s && s.grunts) || []).concat((s && s.fallenGrunts) || [], (s && s.recruitCands) || []).map((g) => g.name));
    const usedFirst = new Set([...used].map((n) => n.split(" ")[0]));
    const firsts = names.filter((n) => !usedFirst.has(n)), first = rng.pick(firsts.length ? firsts : names);
    if (!sur.length) return first;
    for (let i = 0; i < 20; i++) { const n = first + " " + rng.pick(sur); if (!used.has(n)) return n; }
    return first + " " + rng.pick(sur) + " " + rng.int(2, 99);
  };
  // opts: { noNegative (default: while the tutorial is on, its free Grunts never roll a negative trait), candidate }
  St.makeGrunt = function (rng, tpl, opts) {
    tpl = tpl || DATA.bodies.grunt; opts = opts || {};
    const skills = {};
    for (const k in tpl.skills) skills[k] = S.make(tpl.skills[k]);
    const g = { uid: U.uid("grunt"), name: (tpl.rank === "core" ? tpl.name : tpl.petKey ? rng.pick(tpl.names) : St.pickGruntName(rng)), rank: tpl.rank || "grunt", tplKey: tpl === DATA.bodies.coreAllyTest ? "core" : tpl.petKey ? "pet" : "grunt",
             weapon: rng.pick(tpl.weapons), skills, hp: null, runs: 0, extractions: 0, kills: 0, history: [], s3: true };
    const noNeg = opts.noNegative != null ? opts.noNegative : !!(DATA.allies.tutorialNoNegative && G.state && !G.state.tutorialDone);
    g.traits = G.Allies.rollTraits(rng, DATA.allies.recruitTraits, { noNegative: noNeg });
    if (tpl.petKey) g.petKey = tpl.petKey;   // Slice 5 §F: a pet keeps its own natural weapon, no gear
    else if (tpl.rank !== "core" && DATA.config.grunts.innateWeapon) g.weapon = DATA.config.grunts.innateWeapon;   // Slice 4 §F: a new Grunt has just a shiv (the rng.pick above still runs, so rolls don't move)
    if (opts.candidate) g.candidate = true; else G.Allies.log(g, "recruited", "Recruited.");
    return St.repairGrunt(g, G.state ? G.state.runCount : 0);
  };
  St.repairGrunt = function (g, run) {
    g.nickname = g.nickname || null; g.traits = g.traits || []; g.history = g.history || [{ run: run || 0, what: "recruited", text: `Run ${run || 0}: Recruited.` }];
    g.gear = g.gear || St.emptyGear(g); if (G.GruntGear) G.GruntGear.migrate(g); g.dead = !!g.dead; g.tplKey = g.tplKey || (g.rank === "core" ? "core" : "grunt");
    g.runs = g.runs || 0; g.extractions = g.extractions || 0; g.kills = g.kills || 0;
    return g;
  };
  St.grunt = (uid) => G.state.grunts.find((g) => g.uid === uid);
  St.renameGrunt = function (uid, name) {
    const g = St.grunt(uid); if (!g) return "No such Grunt.";
    name = String(name || "").replace(/\s+/g, " ").trim().slice(0, DATA.config.grunts.nameMaxLen);
    if (!name) return "A name can't be empty.";
    const from = g.name; g.name = name; G.Allies.log(g, "renamed", `Renamed (was ${from}).`, { from }); St.save(); return null;
  };
  // equip slots: a Grunt has config.grunts.slots (weapon + one gear slot), a Veteran DATA.allies.veteran.slots
  St.gruntSlots = (g) => (g && g.tplKey === "pet" ? {} : g && g.tplKey === "veteran" ? DATA.allies.veteran.slots : DATA.config.grunts.slots);   // Slice 5 §F: pets: none
  St.emptyGear = (g) => { const o = {}; for (const k in St.gruntSlots(g)) o[k] = null; return o; };
  St.gruntSlotOk = (slot, item, g) => (St.gruntSlots(g)[slot] || []).includes(G.Items.base(item.base).slot);
  St.gruntPack = (g) => St.gruntItems(g).find((it) => G.Items.base(it.base).slot === "backpack") || null;
  // equip a stash item on a Grunt / Veteran (slot from St.gruntSlots), or itemUid null to unequip (back to the stash). Outpost only.
  St.equipGrunt = function (uid, slot, itemUid) {
    const s = G.state, g = St.grunt(uid); if (!g) return "No such Grunt.";
    if (s.run) return "Equip Grunts at the outpost, not during a run.";
    if (!St.gruntSlots(g)[slot]) return "Unknown slot.";
    let it = null;
    if (itemUid) {
      it = s.stash.items.find((i) => i.uid === itemUid); if (!it) return "That item isn't in the stash.";
      if (G.Items.isQuest(it) || !St.gruntSlotOk(slot, it, g)) return `${G.Allies.rankName(g)}s can't use that in the ${slot} slot.`;
      if (G.Items.isHandItem(it)) { const fit = G.Items.handFit(slot, it, (k) => g.gear[k] || null); if (fit.why) return fit.why; for (const k of fit.clear) { s.stash.items.push(g.gear[k]); g.gear[k] = null; } }   // Slice 5 §E: sets
      s.stash.items.splice(s.stash.items.indexOf(it), 1);
      for (const k in s.loadout.gear) if (s.loadout.gear[k] === itemUid) delete s.loadout.gear[k];
    }
    if (g.gear[slot]) s.stash.items.push(g.gear[slot]);
    g.gear[slot] = it; St.save(); return null;
  };
  St.gruntItems = (g) => Object.values((g && g.gear) || {}).filter(Boolean);
  // template: Grunt, Veteran (the Grunt template with DATA.allies.veteran over it) or the debug core ally
  St.gruntTpl = (g) => (g.tplKey === "pet" ? Object.assign({}, DATA.bodies.grunt, DATA.allies.pets[g.petKey] || {}) : g.tplKey === "core" ? DATA.bodies.coreAllyTest : g.tplKey === "veteran" ? Object.assign({}, DATA.bodies.grunt, DATA.allies.veteran) : DATA.bodies.grunt);

  St.defaultSettings = () => Object.assign({}, DATA.audio.defaults, DATA.config.settings);
  St.newGame = function (seed) {
    seed = seed == null ? U.randomSeed() : seed >>> 0;
    const rng = U.makeRng(seed);
    const mind = { skills: {} };
    for (const k of MIND_SKILLS()) mind.skills[k] = S.make(DATA.startingMind[k] || 1);
    const s = {
      version: DATA.config.version, seed, created: Date.now(),
      maps: null, world: { hollow_creek: "pending", sites: {} }, everSeen: {}, locFlags: {},
      zonesUnlocked: {}, passages: {}, quests: null, buildings: null, journal: [],
      mind, lifetimeXp: 0,
      bodies: [St.makeBasicBody()],
      grunts: [], fallenGrunts: [], perks: {}, stash: { items: [], res: U.clone(DATA.items.startingStash.resources) },
      loadout: { bodyId: "body_basic", gear: {}, pouch: [], grunts: [] },
      tutorialDone: false, humanOffer: null, runCount: 0, extractions: 0, deaths: 0, lore: [],
      difficulty: DATA.config.difficulty.default, difficultyLocked: false,   // Slice 4 §H: picked on the start screen, locked at Play / the first deploy
      run: null, lastResult: null, settings: St.defaultSettings(), tut: G.Tut ? G.Tut.fresh() : null, main: null, cards: G.Cards ? G.Cards.fresh() : null
    };
    if (G.Main) { const prev = G.state; G.state = s; G.Main.st(); G.state = prev; }   // Slice 4 §B: main quests + the pods solution
    { const prev = G.state; G.state = s; for (let i = 0; i < DATA.config.deploy.startingGrunts; i++) s.grunts.push(St.makeGrunt(rng)); G.state = prev; }
    if (G.GruntGear) s.grunts.forEach((g, i) => G.GruntGear.giveStartKit(g, i));   // Slice 4 §F: Grunt 1 Pipe Rifle, Grunt 2 Rust Machete
    for (const k in DATA.resources) if (!DATA.resources[k].hidden && !DATA.resources[k].bagOnly && s.stash.res[k] == null) s.stash.res[k] = 0;   // every stockpile resource shows (Slice 3: 11)
    const sg = DATA.items.startingGear;
    for (const slot in sg) { const it = G.Items.make(sg[slot].base, sg[slot].rarity, sg[slot].ilvl, rng); s.stash.items.push(it); s.loadout.gear[slot] = it.uid; }
    for (const it of DATA.items.startingStash.items) s.stash.items.push(G.Items.make(it.base, it.rarity, it.ilvl, rng));
    s.maps = G.Zones.buildAll(seed);
    for (const z of DATA.zones.order) if (DATA.zones.list[z].startUnlocked) s.zonesUnlocked[z] = true;
    s.quests = G.Quests.freshState();
    s.buildings = G.Outpost.freshState();
    G.state = s;
    s.loadout.grunts = s.grunts.slice(0, DATA.config.deploy.startingGrunts).map((g) => g.uid);
    if (G.Main) G.Main.clampAnnex(s);   // Vixie: the annex sits in rows 2-3 while Main 1 isn't done
    return s;
  };

  St.deployScore = () => (G.state.tutorialDone ? DATA.config.deploy.earlyScore : DATA.config.deploy.tutorialScore) + (G.Perks ? G.Perks.deployScore() : 0);   // + Squad Leader
  St.body = (uid) => G.state.bodies.find((b) => b.uid === uid);
  St.bodyCost = (b) => DATA.bodies.families[b.family].deployCost;
  St.bodyReady = (b) => !b.restoreUntil || b.restoreUntil <= G.now();
  St.bodySprite = (b) => (b.cls ? DATA.bodies.classes[b.cls].sprite : DATA.bodies.basicBody.sprite);
  St.bodyTitle = (b) => b.cls ? `${b.name}, ${b.past} — ${DATA.bodies.classes[b.cls].name} / ${DATA.bodies.specialties[b.spec].name}` : b.name;

  St.restoreMs = function (b) {
    const fam = DATA.bodies.families[b.family];
    if (!fam.restoreBaseSec) return 0;
    const R = DATA.config.restore;
    const trans = Math.min(R.transferenceMaxPct, S.level(G.state.mind.skills, "transference") * R.transferencePctPerLevel);
    return fam.restoreBaseSec * 1000 * (1 + S.bodyLevel(b) / 50) * R.bodyLabMult * (1 - trans / 100);
  };

  // --- XP routing. ref: {kind:'body', body} | {kind:'grunt', grunt} | null (enemies)
  // Every gain emits G.XP events (floating "+N XP (Skill)" labels, Slice 2 §10): the skill, and for the worn body
  // also the Body and Character XP it adds (derived), plus gold level-up labels.
  St.giveXp = function (ref, skillId, amount) {
    if (!ref || !amount || !DATA.skills[skillId]) return;
    const def = DATA.skills[skillId];
    const s = G.state, E = G.XP ? G.XP.emit : () => {};
    const charBefore = S.charLevel(s);
    const charAfter = () => { const c = S.charLevel(s); if (c > charBefore) { E({ levelUp: `Character ${c}!` }); if (G.Perks) G.Perks.checkReady(charBefore); } };
    if (def.kind === "mind") {
      if (ref.kind !== "body") return; // only the consciousness has mind skills
      const got = amount * DATA.config.leveling.mindXpSourceMult;
      const up = S.addXp({ name: "You", skills: s.mind.skills, cap: 99 }, skillId, amount);
      s.lifetimeXp += got;
      E({ label: def.name, n: got }); if (up) E({ levelUp: `${def.name} ${s.mind.skills[skillId].lvl}!` });
      E({ label: "Character", n: got, derived: true }); charAfter();
      return;
    }
    if (ref.kind === "body") {
      const b = ref.body, fam = DATA.bodies.families[b.family], bl = S.bodyLevel(b);
      const up = S.addXp({ name: b.name, skills: b.skills, cap: fam.skillCap, xpMult: fam.xpMult }, skillId, amount);
      b.bodyXp = (b.bodyXp || 0) + amount; s.lifetimeXp += amount;
      E({ label: def.name, n: amount }); if (up) E({ levelUp: `${def.name} ${b.skills[skillId].lvl}!` });
      E({ label: "Body", n: amount, derived: true }); if (S.bodyLevel(b) > bl) E({ levelUp: `Body ${S.bodyLevel(b)}!` });
      E({ label: "Character", n: amount, derived: true }); charAfter();
    } else if (ref.kind === "grunt") {
      const g = ref.grunt;
      if (!g.skills[skillId]) return; // grunts only level the few skills they have
      const up = S.addXp({ name: g.name, skills: g.skills, cap: 20 }, skillId, amount);
      E({ label: def.name, n: amount }); if (up) E({ levelUp: `${def.name} ${g.skills[skillId].lvl}!` });
    }
  };

  St.skillOf = function (ref, skillId) {
    const def = DATA.skills[skillId];
    if (!ref) return 1;
    if (def.kind === "mind") return ref.kind === "body" ? S.level(G.state.mind.skills, skillId) : 0;
    if (ref.kind === "body") return S.level(ref.body.skills, skillId);
    if (ref.kind === "grunt") return S.level(ref.grunt.skills, skillId);
    return 1;
  };

  // --- save / load
  St.save = function () {
    try { localStorage.setItem(DATA.config.saveKey, JSON.stringify({ s: G.state, clockOffset: G.clockOffset })); } catch (e) { /* storage may be unavailable */ }
  };
  // Load: current saves as-is; Slice 1 saves (version 1) are migrated; anything else (unknown / corrupt) is set aside
  // and a new game starts with a notice. St.loadNotice explains what happened (shown once by the UI).
  St.loadNotice = null;
  // New build → wipe progression (config.save.resetOnNewBuild). Runs once per build: the build id is stored under its own
  // key, so later loads in the same build keep the save. Wipes every key the game stores (save, set-aside save, tuning).
  St.buildNotice = null;
  St.checkBuild = function () {
    const cfg = DATA.config.save || {}, id = String((typeof window !== "undefined" && window.BUILD_ID) || "dev");
    if (id === "dev") return false;
    let stored = null; try { stored = localStorage.getItem(cfg.buildIdKey); } catch (e) { return false; }
    let wiped = false;
    if (cfg.resetOnNewBuild && stored !== id) {
      const keys = [DATA.config.saveKey, DATA.config.saveKey + "_unreadable", DATA.config.overridesKey];
      try { wiped = keys.some((k) => localStorage.getItem(k) != null); for (const k of keys) localStorage.removeItem(k); } catch (e) {}
      if (wiped) St.buildNotice = "New build (" + id + "): progress reset.";
    }
    try { localStorage.setItem(cfg.buildIdKey, id); } catch (e) {}
    return wiped;
  };
  St.load = function () {
    let raw = null;
    try { raw = localStorage.getItem(DATA.config.saveKey); } catch (e) { return false; }
    if (!raw) return false;
    try {
      const o = JSON.parse(raw);
      if (!o || !o.s) throw new Error("no state");
      let st = o.s;
      if (st.version === 1) { st = St.migrate(st); St.loadNotice = "Your Slice 1 save was carried over to Slice 2" + (St.migrateNotes.length ? ": " + St.migrateNotes.join(" ") : "."); }
      if (st.version === 2) { st = St.migrate3(st); St.loadNotice = (St.loadNotice ? St.loadNotice + " " : "") + "Your save was carried over to Slice 3: locations now remember what you searched (every place starts fully stocked)."; }
      if (st.version !== DATA.config.version) throw new Error("unknown save version " + st.version);
      St.repair(st);
      G.state = st; G.clockOffset = o.clockOffset || 0;
      return true;
    } catch (e) {
      try { localStorage.setItem(DATA.config.saveKey + "_unreadable", raw); } catch (e2) {}
      St.loadNotice = "Your old save couldn't be read (" + e.message + "), so a new save was started. The old data was kept under \"" + DATA.config.saveKey + "_unreadable\".";
      return false;
    }
  };

  // Slice 1 (version 1) -> Slice 2 (version 2). Keeps: bodies, Grunts, mind skills, stash items, resources
  // (circuits -> electronics, biomass kept but hidden), lore, world state, counters, tutorial progress.
  // An expedition in progress is rolled back to its start (the snapshot Slice 1 took at deploy). Zone A is
  // regenerated from the same seed (Slice 2 adds fixed Pump Station / Rail Yard slots), so map memory resets.
  St.migrateNotes = [];
  St.migrate = function (old) {
    St.migrateNotes = [];
    let s = old;
    if (s.run && s.run.snapshot) { try { s = JSON.parse(s.run.snapshot); St.migrateNotes.push("the expedition in progress was rolled back to its start."); } catch (e) { s.run = null; } }
    s.run = null;
    const res = s.stash && s.stash.res ? s.stash.res : {};
    for (const from in DATA.resourceRenames) if (res[from] != null) { const to = DATA.resourceRenames[from]; res[to] = (res[to] || 0) + res[from]; delete res[from]; }
    s.stash.res = res;
    for (const p of (s.loadout && s.loadout.pouch) || []) if (p.res && DATA.resourceRenames[p.res]) p.res = DATA.resourceRenames[p.res];
    s.maps = G.Zones.buildAll(s.seed >>> 0);
    delete s.map;
    s.everSeen = {};
    St.migrateNotes.push("Circuits became Electronics, and The Scablands was re-surveyed for Slice 2 (map memory reset).");
    s.version = 2;
    return s;
  };

  // Slice 2 (version 2) -> Slice 3 (version 3): sites move from the run into the world state. Every place starts fresh
  // (100% stocked); an expedition in progress keeps the sites it has built this run.
  St.migrate3 = function (s) {
    s.world = s.world || { hollow_creek: "pending" };
    s.world.sites = {};
    if (s.run && s.run.sites) { for (const nid in s.run.sites) { const site = s.run.sites[nid]; site.enteredRun = s.runCount; site.pickedOver = false; site.restock = 0; s.world.sites[nid] = site; } delete s.run.sites; }
    s.version = 3;
    return s;
  };

  // Fill any Slice 2 fields a save is missing (also used after migration). Never throws on partial saves.
  St.repair = function (s) {
    if (!s.maps || !s.maps.a) s.maps = G.Zones.buildAll((s.seed >>> 0) || 1);
    for (const z of DATA.zones.order) if (!s.maps[z] && !DATA.zones.list[z].generated) s.maps[z] = G.Zones.build(z);   // zones added later (Slice 5 §G Greyback) join old saves
    s.world = s.world || { hollow_creek: "pending" }; s.world.sites = s.world.sites || {};
    s.everSeen = s.everSeen || {}; s.locFlags = s.locFlags || {};
    s.zonesUnlocked = s.zonesUnlocked || {};
    for (const z of DATA.zones.order) if (DATA.zones.list[z].startUnlocked) s.zonesUnlocked[z] = true;
    s.passages = s.passages || {}; s.debuffs = s.debuffs || {};   // Slice 3 §4b debuffs (Marked by the Orbitals: runs left)
    s.quests = Object.assign(G.Quests.freshState(), s.quests || {});
    s.buildings = Object.assign(G.Outpost.freshState(), s.buildings || {});
    s.journal = s.journal || [];
    s.stash = s.stash || { items: [], res: {} }; s.stash.items = s.stash.items || []; s.stash.res = s.stash.res || {};
    for (const k in DATA.resources) if (s.stash.res[k] == null && !DATA.resources[k].hidden && !DATA.resources[k].bagOnly) s.stash.res[k] = 0;
    s.settings = Object.assign(St.defaultSettings(), s.settings || {});
    if (G.Tut) { s.tut = Object.assign(G.Tut.fresh(), s.tut || {}); s.tut.steps = s.tut.steps || {}; }   // Slice 4 §A: tutorial flags + Marta's choice
    if (G.Main) { const prev = G.state; G.state = s; G.Main.st(); G.state = prev; G.Main.clampAnnex(s); }   // Slice 4 §B (+ Vixie's annex rows)
    s.lore = s.lore || []; s.bodies = s.bodies && s.bodies.length ? s.bodies : [St.makeBasicBody()];
    s.grunts = s.grunts || []; s.fallenGrunts = s.fallenGrunts || []; s.perks = s.perks || {};   // Slice 3 §3: picks are derived from the level, so old saves get theirs
    // older saves: Grunts named "Grunt #NN" (or unnamed) get a random name; missing record fields are filled in
    { const rng = U.makeRng(((s.seed >>> 0) || 1) + 7331), prev = G.state; G.state = s;
      for (const g of s.grunts.concat(s.fallenGrunts)) { St.repairGrunt(g, 0); if (g.rank !== "core" && (!g.name || /^Grunt( #\d+)?$/.test(g.name))) g.name = St.pickGruntName(rng); }
      // Slice 3 §1: older Grunts get a surname (a default single first name only), 2 traits (no negative) and a
      // newest-first history; a run in progress points its squad back at the roster records (JSON breaks the link)
      const sur = DATA.allies.surnames;
      for (const g of s.grunts.concat(s.fallenGrunts)) {
        if (g.s3) continue; g.s3 = true;
        if (g.tplKey === "grunt" && DATA.bodies.grunt.names.includes(g.name)) g.name = g.name + " " + rng.pick(sur);
        if (!g.traits.length && g.tplKey !== "core") g.traits = G.Allies.rollTraits(rng, DATA.allies.recruitTraits, { noNegative: true });
        g.history = g.history.slice().reverse().map((h) => (h.text ? h : Object.assign({}, h, { text: G.Allies.lineText(h) })));
      }
      if (s.run && s.run.squad) for (const m of s.run.squad) { const g = s.grunts.find((x) => x.uid === m.g.uid); if (g) m.g = g; }
      G.state = prev; }
    if (!s.difficulty || !DATA.config.difficulty.list[s.difficulty]) { s.difficulty = DATA.config.difficulty.default; s.difficultyLocked = true; }   // Slice 4 §H: older saves are Standard
    s.loadout = s.loadout || { bodyId: "body_basic", gear: {}, pouch: [], grunts: [] };
    s.loadout.gear = s.loadout.gear || {}; s.loadout.pouch = s.loadout.pouch || []; s.loadout.grunts = s.loadout.grunts || [];
    return s;
  };
  St.wipe = function () { try { localStorage.removeItem(DATA.config.saveKey); } catch (e) {} };

  // --- tuning overrides (debug panel)
  St.saveOverrides = function (ov) { try { localStorage.setItem(DATA.config.overridesKey, JSON.stringify(ov)); } catch (e) {} };
  St.loadOverrides = function () {
    // Only overrides whose value already exists in DATA with the same type are applied (a Slice 1 tuning override
    // for a removed or renamed field is dropped instead of creating a half-defined entry).
    try {
      const o = JSON.parse(localStorage.getItem(DATA.config.overridesKey) || "{}"), kept = {};
      for (const p in o) { try { const cur = U.getPath(DATA, p); if (cur !== undefined && typeof cur === typeof o[p] && typeof cur !== "object") { U.setPath(DATA, p, o[p]); kept[p] = o[p]; } } catch (e) {} }
      return kept;
    } catch (e) { return {}; }
  };
})(typeof window !== "undefined" ? window : globalThis);
