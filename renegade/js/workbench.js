// Slice 3 §9: the Workbench. Recipes (DATA.recipes) are paid from the stockpile when queued; jobs run one after another
// on real timestamps (offline too, the debug fast-forward moves them) and deliver when done: gear + ammo to the stash,
// Med Supplies to the stockpile. Crafted gear gets a quality roll (Engineering check, crit = Blue) when it's queued.
(function (root) {
  const G = root.G, U = G.Util;
  const W = G.Workbench = {};
  const O = () => G.Outpost, RD = () => DATA.recipes;
  W.st = () => { const st = O().st("workbench"); st.queue = st.queue || []; return st; };
  W.recipe = (id) => RD().list[id];
  W.level = () => O().level("workbench");
  W.slots = () => O().effects("workbench").queue || 0;
  W.craftIlvl = () => O().effects("workbench").craftIlvl || 1;
  W.isAmmo = (it) => !!it && !!G.Items.base(it.base) && G.Items.base(it.base).slot === "ammo";
  // who rolls: Engineering is a mind skill, so any body ref works (the loadout body)
  W.roller = () => { const s = G.state; return { kind: "body", body: G.State.body(s.loadout && s.loadout.bodyId) || s.bodies[0] }; };
  W.qualityInfo = function () { const Q = RD().quality; return G.Checks.compute(Q.skill, Q.dc, [W.roller()], []); };
  // odds of the crit (Blue): a natural 20, or d + mod >= DC + critMargin
  W.blueChance = function (info) {
    info = info || W.qualityInfo(); const C = DATA.config.checks; let n = 0;
    for (let d = 1; d <= C.die; d++) if (d === C.die || (d !== 1 && d + info.mod >= info.dc + C.critMargin)) n++;
    return n / C.die * 100;
  };
  W.locked = function (id) {
    const r = W.recipe(id); if (!r) return "Unknown recipe.";
    if (W.level() < 1) return "Build the Workbench first.";
    if (r.tier > (O().effects("workbench").tier || 0)) return `Needs Workbench L${r.tier}.`;
    if (r.needs && r.needs.rep) for (const g in r.needs.rep) if (G.Quests.repLevel(g) < r.needs.rep[g]) return `Needs ${DATA.quests.givers[g].name} reputation L${r.needs.rep[g]}.`;
    return null;
  };
  W.reforgeable = (it) => { const order = Object.keys(DATA.items.rarities); return !!it && !G.Items.isQuest(it) && !W.isAmmo(it) && order.indexOf(it.rarity) >= order.indexOf(RD().reforgeMinRarity) && it.affixes.length > 0; };
  // opts (Reforge): { item: uid, line: index }
  W.canCraft = function (id, opts) {
    const s = G.state; if (s.run) return "Finish the expedition first.";
    const lk = W.locked(id); if (lk) return lk;
    if (W.st().queue.length >= W.slots()) return `The queue is full (${W.slots()} slot${W.slots() > 1 ? "s" : ""}).`;
    const r = W.recipe(id), miss = Object.keys(r.cost).filter((k) => (s.stash.res[k] || 0) < r.cost[k]);
    if (miss.length) return "Not enough " + miss.map((k) => DATA.resources[k].name).join(", ") + ".";
    if (r.out.reforge) {
      const it = opts && s.stash.items.find((i) => i.uid === opts.item);
      if (!it) return "Pick a Blue or better item from the stash.";
      if (!W.reforgeable(it)) return "Reforge only takes Blue or better items.";
      if (opts.line == null || !it.affixes[opts.line]) return "Pick the affix line to reroll.";
    }
    return null;
  };
  W.craft = function (id, opts) {
    const why = W.canCraft(id, opts); if (why) return why;
    const s = G.state, r = W.recipe(id), st = W.st();
    for (const k in r.cost) s.stash.res[k] -= r.cost[k];
    const last = st.queue.length ? st.queue[st.queue.length - 1].until : 0;
    const job = { id, until: Math.max(G.now(), last) + r.sec * 1000, sec: r.sec };
    if (r.out.item) {
      job.ilvl = W.craftIlvl();
      if (r.out.quality) { const info = W.qualityInfo(), roll = G.Checks.roll(info, G.rng); job.grade = roll.grade; job.rarity = roll.grade === "crit" ? RD().quality.critRarity : RD().quality.baseRarity; job.rollText = roll.text; }
    }
    if (r.out.reforge) { const i = s.stash.items.findIndex((x) => x.uid === opts.item); job.item = s.stash.items.splice(i, 1)[0]; job.line = opts.line; }   // held on the bench until it's done
    st.queue.push(job);
    G.log(`Workbench: ${r.name} queued (${U.fmtTime(r.sec * 1000)}).` + (job.rollText ? " " + job.rollText + (job.rarity === "blue" ? " → Blue!" : "") : ""));
    return null;
  };
  W.remainingMs = (job) => Math.max(0, job.until - G.now());
  // reroll one affix line at the same tier (the slot's tier from rarityAffixTiers; Complex stays Complex)
  W.reroll = function (item, line, rng) {
    const base = G.Items.base(item.base), tiers = DATA.items.rarityAffixTiers[item.rarity] || [], cur = item.affixes[line];
    let tier = tiers[line] || (DATA.items.affixes[cur.id] || {}).tier || "basic";
    if (tier === "complex_or_advanced") tier = (DATA.items.affixes[cur.id] || {}).tier === "complex" ? "complex" : "advanced";
    const taken = item.affixes.filter((a, i) => i !== line).map((a) => a.id);
    const a = G.Items.rollAffix(rng || G.rng, base, tier, item.ilvl, taken);
    if (a) item.affixes[line] = a;
    return a;
  };
  W.deliver = function (job) {
    const s = G.state, r = W.recipe(job.id), out = r.out;
    if (out.res) for (const k in out.res) s.stash.res[k] = (s.stash.res[k] || 0) + out.res[k];
    if (out.ammo) W.addAmmo(out.ammo, out.n);
    if (out.item) { const it = G.Items.make(out.item, job.rarity || "white", job.ilvl || W.craftIlvl(), G.rng); it.crafted = true; s.stash.items.push(it); job.made = it.uid; }
    if (out.reforge && job.item) { const before = G.Items.affixText(job.item.affixes[job.line]); W.reroll(job.item, job.line); s.stash.items.push(job.item); job.text = `${before} → ${G.Items.affixText(job.item.affixes[job.line])}`; }
    G.log(`Workbench: ${r.name} done` + (job.text ? ` (${job.text})` : "") + ".");
    (s.craftLog = s.craftLog || []).unshift({ id: job.id, rarity: job.rarity || null, text: job.text || null });
    if (s.craftLog.length > 8) s.craftLog.length = 8;
  };
  W.tick = function () {
    const s = G.state; if (!s || !s.buildings || !s.buildings.workbench || !s.buildings.workbench.queue) return;
    const q = s.buildings.workbench.queue; let n = 0;
    while (q.length && G.now() >= q[0].until) { W.deliver(q.shift()); n++; }
    return n > 0;
  };
  // ---- ammo stacks in the stash ----
  W.ammoStack = (base) => G.state.stash.items.find((i) => i.base === base);
  W.ammoCount = (base) => { const st = W.ammoStack(base); return st ? st.qty || 0 : 0; };
  W.addAmmo = function (base, n) {
    if (!n) return; let st = W.ammoStack(base);
    if (!st) { st = G.Items.make(base, "white", 1); st.affixes = []; st.qty = 0; G.state.stash.items.push(st); }
    st.qty += n;
  };
  W.takeAmmo = function (base, n) {
    const st = W.ammoStack(base); if (!st) return 0; const k = Math.min(n, st.qty || 0); st.qty -= k;
    if (st.qty <= 0) G.state.stash.items.splice(G.state.stash.items.indexOf(st), 1);
    return k;
  };
  W.ammoTypes = () => Object.keys(DATA.items.bases).filter((k) => DATA.items.bases[k].slot === "ammo");
  // battle start (expedition): uses 1 pack of the chosen type, applies the effect to every gun on side 0. Returns the base id or null.
  W.applyAmmo = function (run, units) {
    const a = run && run.ammo; if (!a || !a.base || !(a.n > 0)) return null;
    const def = G.Items.base(a.base).ammo || {};
    a.n--; a.used = (a.used || 0) + 1;
    for (const u of units) {
      if (u.side !== 0 || !u.weapon || u.weapon.style !== "gun") continue;
      if (def.jamPct) u.ammoJamMult = 1 + def.jamPct / 100;
      if (def.tag && !u.weapon.tags.includes(def.tag)) u.weapon.tags.push(def.tag);
      u.ammoPack = a.base;
    }
    return a.base;
  };
  if (G.Outpost) G.Outpost.tickHooks.push(W.tick);
})(typeof window !== "undefined" ? window : globalThis);
