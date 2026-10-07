// Debug panel (` or F1): live tuning editor for DATA + helper actions.
(function (root) {
  const G = root.G, U = G.Util;
  const D = G.Debug = { on: false, rollMath: false, fastSearch: false, overrides: {}, section: "config.battle" };
  const h = (...a) => G.UI.h(...a);
  const SECTIONS = ["config.tutorial", "config.deploy", "config.carry", "config.heat", "config.rolls", "config.checks", "config.battle", "config.enemies", "config.expedition", "config.world", "config.loot", "config.leveling", "config.restore", "config.grunts", "config.search", "config.revisit", "config.xpFloat", "mapsV2.walk", "mapsV2.pool", "mapsV2.alert", "mapsV2.heat.loud", "mapsV2.loot",
    "bodies.families", "bodies.basicBody", "bodies.classes", "bodies.specialties", "bodies.grunt", "bodies.criticalCare", "enemies.units", "enemies.elite", "items.rarities", "items.bases", "items.affixes", "items.tags", "resources", "map.locations", "events",
    "searchables", "zones", "quests", "outpost", "town", "abilities", "allies", "perks", "audio"];

  D.toggle = function () { D.on = !D.on; document.getElementById("debug").classList.toggle("hidden", !D.on); if (D.on) D.render(); if (G.BattleView.active) G.BattleView.renderHud(G.BattleView.active); };

  function btn(label, fn, title) { return h("button", { title: title || "", onclick: () => { try { const m = fn(); if (typeof m === "string") G.UI.toast(m); } catch (e) { console.error(e); G.UI.toast("Error: " + e.message); } G.State.save(); if (!G.UI.battle) G.UI.render(); else G.UI.renderTop(); D.render(); } }, label); }

  D.render = function () {
    const el = document.getElementById("debug"); if (!D.on) return;
    const s = G.state, r = s.run;
    el.innerHTML = "";
    el.appendChild(h("div", { class: "dbg-head" }, h("b", null, "DEBUG"), h("button", { onclick: D.toggle }, "×")));
    // --- helpers
    const hs = h("div", { class: "dbg-sec" }, h("h4", null, "Helpers"));
    const resTarget = () => (r ? r.bag.res : s.stash.res);
    // Slice 2: give resources (per resource, +50 all). During a run they go to the bag, otherwise to the stockpile.
    const resSel = h("select"); for (const k in DATA.resources) if (!DATA.resources[k].hidden) resSel.appendChild(h("option", { value: k }, DATA.resources[k].name));
    const resN = h("input", { type: "number", value: 10, style: "width:50px" });
    hs.appendChild(h("div", null, resSel, resN, btn("Give", () => { resTarget()[resSel.value] = Math.max(0, (resTarget()[resSel.value] || 0) + +resN.value); }), btn("+50 all", () => { for (const k in DATA.resources) if (!DATA.resources[k].hidden) resTarget()[k] = (resTarget()[k] || 0) + 50; })));
    hs.appendChild(btn("Finish restore timers", () => { for (const b of s.bodies) b.restoreUntil = 0; return "All bodies ready."; }));
    hs.appendChild(btn("Fast-forward 10 min", () => { G.clockOffset += 600000; G.Outpost.tick(); return "Clock +10 min (restore + Vault timers)"; }));
    hs.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: D.rollMath, onchange: (e) => { D.rollMath = e.target.checked; if (G.UI.battle) G.UI.battle.b.rollMath = D.rollMath; if (!G.UI.battle) G.UI.render(); } }), " Show roll math (checks, floating text, disturbance math in object tooltips)"));
    hs.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: D.fastSearch, onchange: (e) => { D.fastSearch = e.target.checked; } }), " Instant searches (skip the progress bar wait)"));
    hs.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: G.Sfx.enabled, onchange: (e) => { G.Sfx.enabled = e.target.checked; } }), " Audio on (assets/sfx/*.mp3, assets/amb/*)"));
    el.appendChild(hs);
    // SP-096 scenario links: share this moment as a link / .renegade file, or open one in a sandbox
    const sc = h("div", { class: "dbg-sec", "data-sec": "scenario" }, h("h4", null, "Scenario"));
    if (G.State.sandbox) sc.appendChild(h("div", { class: "dbg-small" }, "SANDBOX: " + G.State.sandbox.name + " (saves go to renegade_sandbox_* only)"));
    // (plain buttons: btn() re-renders the screen afterwards, which would close the dialog they open)
    const plain = (label, fn, title) => h("button", { title: title || "", onclick: () => { try { fn(); } catch (e) { console.error(e); G.UI.toast("Error: " + e.message); } } }, label);
    sc.appendChild(plain("Share run…", () => G.ScenarioView.shareDialog(), "A link (or .renegade file) that opens this exact moment in a sandbox"));
    sc.appendChild(plain("Download .renegade", () => G.ScenarioView.download(G.Scenario.capture({ name: "Debug capture" })), "Save this moment as a file (name it in Share run… instead to add a note)"));
    sc.appendChild(plain("Load scenario…", () => G.ScenarioView.loadDialog(), "Open a .renegade file, a scenario link or a code in a sandbox (your save stays as it is)"));
    if (G.State.sandbox) sc.appendChild(plain("Exit sandbox", () => G.ScenarioView.exit()));
    el.appendChild(sc);
    // give item
    const gi = h("div", { class: "dbg-sec" }, h("h4", null, "Give item" + (r ? " (to bag)" : " (to stash)")));
    const bSel = h("select"); for (const k in DATA.items.bases) if (!DATA.items.bases[k].natural) bSel.appendChild(h("option", { value: k }, DATA.items.bases[k].name));
    const rSel = h("select"); for (const k in DATA.items.rarities) rSel.appendChild(h("option", { value: k }, k));
    const iIn = h("input", { type: "number", value: 5, min: 1, style: "width:50px" });
    gi.appendChild(h("div", null, bSel, rSel, iIn, btn("Give", () => { const it = G.Items.make(bSel.value, rSel.value, +iIn.value); (r ? r.bag.items : s.stash.items).push(it); return "Gave " + G.Items.name(it); })));
    gi.appendChild(btn("Give 3 random loot", () => { for (let i = 0; i < 3; i++) (r ? r.bag.items : s.stash.items).push(G.Items.rollLoot(G.rng, +iIn.value, 0)); }));
    // Slice 3 §6: rarity shares at the iLvl above (no rarity bonus) vs the data weights; Purple needs iLvl 3, Orange 6
    const rs = h("div", { class: "dbg-out", "data-out": "roll10k" });
    gi.appendChild(btn("Roll 10,000 items", () => {
      const st = G.Items.rollStats(10000, +iIn.value, 0), R = DATA.items.rarities;
      rs.textContent = `iLvl ${st.ilvl}: ` + Object.keys(R).filter((k) => R[k].enabled).map((k) => `${R[k].name} ${((st.by[k] || 0) / 100).toFixed(1)}%` + (st.expected[k] != null ? ` (weight ${st.expected[k].toFixed(1)}%)` : "")).join(" · ") + ` | set pieces ${(st.sets / 100).toFixed(1)}% · Complex lines ${st.cx}`;
      return "Rolled 10,000";
    }));
    gi.appendChild(rs);
    el.appendChild(gi);
    // Slice 3 §8: play-all list with each key's load status (ok / missing / pending)
    const au = h("div", { class: "dbg-sec" }, h("h4", null, "Audio: play all"));
    for (const k of Object.keys(DATA.audio.sfx).concat(Object.keys(DATA.audio.loops))) {
      const loop = !!DATA.audio.loops[k];
      au.appendChild(h("div", { class: "dbg-audio" }, btn(k, () => { G.Sfx.unlock(); if (loop) { G.Sfx.wantLoop = k; G.Sfx.setScreen(Object.keys(DATA.audio.screens).find((x) => DATA.audio.screens[x] === k)); } else G.Sfx.play(k); setTimeout(() => D.render(), 400); return k + ": " + G.Sfx.status(k); }), h("small", null, " " + G.Sfx.status(k))));
    }
    el.appendChild(au);
    // Slice 3 §11: roll 1,000 searches of a type here (or at the first Zone A location) and compare with the table
    const lr = h("div", { class: "dbg-sec" }, h("h4", null, "Loot readout")), tSel = h("select"), out = h("pre", { class: "dbg-pre" });
    for (const k in DATA.searchables.types) if ((DATA.searchables.types[k].table || []).length) tSel.appendChild(h("option", { value: k }, k));
    lr.appendChild(h("div", null, tSel, btn("Roll 1,000 searches", () => { const x = G.Exp.lootReadout(tSel.value, 1000);
      out.textContent = `${x.type} at ${x.loc}, ${x.resRolls} roll(s) each\n` + x.rows.map((r) => `${r.res.padEnd(12)} weight ${r.weightPct == null ? "extra" : r.weightPct.toFixed(1) + "%"}${r.hitPct == null ? "" : ` · found in ${r.hitPct.toFixed(1)}% · avg ${r.avg.toFixed(2)}`}`).join("\n"); })), out);
    el.appendChild(lr);
    // skills
    const sk = h("div", { class: "dbg-sec" }, h("h4", null, "XP (worn/selected body + mind)"));
    const sSel = h("select"); for (const k in DATA.skills) sSel.appendChild(h("option", { value: k }, DATA.skills[k].name + " (" + DATA.skills[k].kind + ")"));
    const xIn = h("input", { type: "number", value: 500, style: "width:60px" });
    sk.appendChild(h("div", null, sSel, xIn, btn("Add XP", () => { const b = G.State.body(r ? r.bodyUid : s.loadout.bodyId); G.State.giveXp({ kind: "body", body: b }, sSel.value, +xIn.value / (DATA.skills[sSel.value].kind === "mind" ? DATA.config.leveling.mindXpSourceMult : 1)); })));
    el.appendChild(sk);
    // Slice 3 §7: rival snapshots: export the current squad, import one, force a rival at the next location
    if (G.Rivals) {
      const RV = G.Rivals, rst = RV.st(), rv = h("div", { class: "dbg-sec", "data-dbg": "rivals" }, h("h4", null, `Rivals (defeated ${rst.defeated}, met ${rst.met}, echoes ${rst.echoes.length}, imported ${rst.imported.length})`));
      const ta = h("textarea", { class: "dbg-export", "data-dbg": "rival-json", placeholder: "rival snapshot JSON" });
      const rSel2 = h("select", { "data-dbg": "rival-pick" }, h("option", { value: "" }, "(closest match)")); for (const x of RV.all()) rSel2.appendChild(h("option", { value: x.id }, `${x.handle} [${x.source}, zone ${x.zone}, score ${x.deployScore}]`));
      rv.appendChild(h("div", null, btn("Export current squad", () => { ta.value = JSON.stringify(RV.exportCurrent(), null, 1); setTimeout(() => { const t = document.querySelector('[data-dbg="rival-json"]'); if (t) t.value = ta.value; }, 0); return "Exported to the box below."; }),
        btn("Import JSON", () => { const t = document.querySelector('[data-dbg="rival-json"]'); const res = RV.importSnap(t ? t.value : ta.value); return res.error || `Imported ${res.snap.handle}.`; })));
      rv.appendChild(ta);
      rv.appendChild(h("div", null, rSel2, btn("Force rival at next location", () => { RV.forceNext(rSel2.value || null); return "The next location you enter has a rival squad."; })));
      if (rst.next) rv.appendChild(h("div", { class: "dbg-small" }, `Next run's pre-roll: ${(RV.byId(rst.next.id) || {}).handle || rst.next.id} in zone ${rst.next.zone} at ${rst.next.nid || "-"}${rst.force ? " · FORCED next" : ""}`));
      el.appendChild(rv);
    }
    // Slice 2: zones / passage, quests + rep, outpost
    const zs = h("div", { class: "dbg-sec" }, h("h4", null, "Zones & passage"));
    for (const z of DATA.zones.order) zs.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: !!s.zonesUnlocked[z], onchange: (e) => { s.zonesUnlocked[z] = e.target.checked; G.State.save(); if (!G.UI.battle) G.UI.render(); } }), ` ${DATA.zones.list[z].name} unlocked`));
    for (const pid in DATA.zones.passages) zs.appendChild(btn(s.passages[pid] ? `Hide ${DATA.zones.passages[pid].name}` : `Reveal ${DATA.zones.passages[pid].name}`, () => { if (s.passages[pid]) { delete s.passages[pid]; return "Passage hidden again."; } if (r) G.Exp.discoverPassage(pid); else { s.passages[pid] = true; for (const k in DATA.zones.passages[pid].ends) s.zonesUnlocked[DATA.zones.passages[pid].ends[k].zone] = true; } return "Passage revealed."; }));
    el.appendChild(zs);
    const qs = h("div", { class: "dbg-sec" }, h("h4", null, "Quests & reputation"));
    const qSel = h("select"); for (const id in DATA.quests.list) qSel.appendChild(h("option", { value: id }, `${DATA.quests.list[id].name} (${G.Quests.status(id)})`));
    qs.appendChild(h("div", null, qSel, btn("Complete", () => { const id = qSel.value, q = G.Quests.def(id); if (G.Quests.status(id) === "done") return "Already done."; G.Quests.st().active[id] = G.Quests.st().active[id] || { progress: 0 }; const o = q.objective;
      if (q.type === "turnin") s.stash.res[o.res] = Math.max(s.stash.res[o.res] || 0, o.n); if (q.type === "find" && !s.stash.items.some((i) => i.base === o.item)) s.stash.items.push(G.Items.makeQuest(o.item)); if (q.type === "kill") G.Quests.st().active[id].progress = o.n;
      if (r) { const rr = r; G.state.run = null; const res = G.Quests.turnIn(id); G.state.run = rr; return res.error || "Completed."; } const res = G.Quests.turnIn(id); return res.error || "Completed " + q.name; }),
      btn("Reset", () => { const st = G.Quests.st(); delete st.active[qSel.value]; delete st.done[qSel.value]; return "Quest reset."; }),
      btn("Take", () => G.Quests.take(qSel.value) || "Taken.")));
    for (const g in DATA.quests.givers) { const rIn = h("input", { type: "number", value: G.Quests.st().rep[g] || 0, style: "width:40px" }); qs.appendChild(h("div", null, `${DATA.quests.givers[g].name} rep (L${G.Quests.repLevel(g)}) `, rIn, btn("Set", () => { const before = G.Quests.repLevel(g); G.Quests.st().rep[g] = Math.max(0, +rIn.value); const after = G.Quests.repLevel(g); for (let l = before + 1; l <= after; l++) G.Quests.onRepLevel(g, l); }))); }
    qs.appendChild(h("div", { class: "dbg-small" }, `Ilse medic flag: ${G.Quests.st().flags.medicPick ? "armed" : "off"}`));
    el.appendChild(qs);
    // Slice 3 §9-10: every building (level, timers), the build crew, Workbench jobs, production
    const O = G.Outpost, os = h("div", { class: "dbg-sec" }, h("h4", null, "Outpost buildings" + (O.crewBusy() ? " (crew busy)" : "")));
    for (const k of O.ids()) {
      const st = O.st(k), lvIn = h("input", { type: "number", min: 0, max: O.def(k).maxLevel, value: st.level, style: "width:40px" });
      os.appendChild(h("div", { "data-dbg-building": k }, `${O.def(k).name} L${st.level}` + (st.upgrading ? ` → L${st.upgrading.to} in ${U.fmtTime(O.remainingMs(k))}` : "") + " ", lvIn,
        btn("Set", () => { st.level = U.clamp(+lvIn.value || 0, 0, O.def(k).maxLevel); st.upgrading = null; O.startProduction(k); return `${O.def(k).name} set to L${st.level}.`; }),
        btn("Finish", () => { const u = st.upgrading; if (!u) return "Not building."; G.clockOffset += Math.max(0, u.until - G.now()) + 10; O.tick(); return `${O.def(k).name} done.`; })));
    }
    os.appendChild(btn("Finish Vault build", () => { const u = G.Outpost.st("vault").upgrading; if (!u) return "Not building."; G.clockOffset += Math.max(0, u.until - G.now()) + 10; G.Outpost.tick(); return "Vault done."; }));
    os.appendChild(btn("Reset Vault to L1", () => { const st = G.Outpost.st("vault"); st.level = 1; st.upgrading = null; }));
    if (G.Workbench) { const q = G.Workbench.st().queue; os.appendChild(h("div", { class: "dbg-small" }, `Workbench queue: ${q.map((j) => DATA.recipes.list[j.id].name + " " + U.fmtTime(G.Workbench.remainingMs(j))).join(", ") || "idle"} · Blue chance ${U.fmt1(G.Workbench.blueChance())}%`));
      os.appendChild(btn("Finish crafting", () => { const q2 = G.Workbench.st().queue; if (!q2.length) return "Nothing queued."; G.clockOffset += Math.max(0, q2[q2.length - 1].until - G.now()) + 10; O.tick(); return "Crafting done."; }));
      os.appendChild(btn("+3 of each ammo", () => { for (const k of G.Workbench.ammoTypes()) G.Workbench.addAmmo(k, 3); return "Ammo added to the stash."; })); }
    os.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: !!DATA.outpost.productionEnabled, onchange: (e) => { DATA.outpost.productionEnabled = e.target.checked; G.UI.render(); D.render(); } }), " productionEnabled (Water Still lot + production)"));
    os.appendChild(h("div", { class: "dbg-small" }, `Stash ${G.Outpost.stashCount()}/${G.Outpost.stashCap()} · pouch ${G.Outpost.pouchSlots()} slot(s), ${G.Outpost.pouchMaxKg()} kg`));
    el.appendChild(os);
    // Slice 3 §12: world restocking
    { const ws = s.world.sites || {}, picked = Object.values(ws).filter((x) => x.pickedOver);
      const wr = h("div", { class: "dbg-sec" }, h("h4", null, "World (restocking)"), h("div", null, `${Object.keys(ws).length} sites remembered, ${picked.length} picked over` + (picked.length ? ": " + picked.map((x) => `${G.Map.loc(G.Zones.node(x.nid)).name} ${x.restock || 0}/${G.Exp.restockSteps(x)}`).join(", ") : "")));
      wr.appendChild(btn("Advance the world 1 run", () => { G.Exp.debugAdvanceWorld(); return "World advanced 1 run (restock +1 step, battle bodies and gore removed)."; }, "Same as a run ending, without the expedition: picked-over places restock one step"));
      wr.appendChild(btn("Restock everything", () => { G.Exp.debugRestockAll(); return "Every place is back to 100% (refills on its next entry)."; }));
      el.appendChild(wr); }
    // expedition
    // Maps, Areas & Loot: the rollout flag (new expeditions only) and this run's V2 state (development log, no analytics)
    { const MV = DATA.mapsV2, v2 = h("div", { class: "dbg-sec" }, h("h4", null, "Maps V2"));
      v2.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: MV.enabled, onchange: (e) => { MV.enabled = e.target.checked; G.UI.toast(`Maps V2 ${MV.enabled ? "on" : "off"} for the next expedition (a run keeps the ruleset it started with).`); } }), " New expeditions use Maps V2 (data/mapsv2.js enabled; this page only)"));
      if (r) {
        const on = G.V2.on(r); v2.appendChild(h("div", null, on ? `This run: ruleset 2 (schema ${r.v2.schema}, content ${r.v2.content}).` : "This run: legacy ruleset."));
        if (on) {
          const m = G.V2.inst(r.loc, false);
          v2.appendChild(h("div", null, "Heat ledger: " + (r.v2.heatLedger.map((x) => `${x.why} +${x.n}`).join(", ") || "none") + " · blocked: " + (Object.entries(r.v2.heatBlocked).map(([k, n]) => `${k} ${n}`).join(", ") || "none") + ` · loud fights ${r.v2.loud.n}`));
          if (m) v2.appendChild(h("div", null, `${m.loc} (${m.kind}, ${m.classification}${m.area ? ", Area " + m.area : ""}) pool: ` + m.pool.groups.map((g) => `${g.id}${g.area ? "@" + g.area : ""} ${g.state}${g.waiting ? " (waiting)" : ""}`).join(", ")));
          const a = G.V2.audit(); v2.appendChild(h("div", { class: a.length ? "bad" : "" }, "Audit: " + (a.join("; ") || "clean")));
          if (m) v2.appendChild(btn("Alert a group here", () => { const st = G.V2.alert(G.V2.siteKey(r.loc), "debug", "Debug: something heard you."); return st ? "A group is coming." : "No eligible group here."; }, "Reserves the next eligible group of this Map's pool for the Area you're in"));
          if (m) v2.appendChild(btn("Beat this Map's groups", () => { for (const g of m.pool.groups) if (g.state === "available") { g.state = "defeated"; m.defeated.push(g.id); } G.V2.updateOpps(m); return "Every available group here is marked beaten (opportunities update)."; }));
          v2.appendChild(btn("Log V2 events (console)", () => { console.table(r.v2.events); return `${r.v2.events.length} events in the console.`; }));
        }
      }
      el.appendChild(v2); }
    const ex = h("div", { class: "dbg-sec" }, h("h4", null, "Expedition"));
    if (r) {
      const hIn = h("input", { type: "number", value: r.heat, style: "width:50px" });
      ex.appendChild(h("div", null, "Heat ", hIn, btn("Set", () => { r.heat = U.clamp(+hIn.value, 0, 100); })));
      ex.appendChild(btn("Heal squad", () => { r.bodyHp = G.Exp.maxBodyHp(); for (const m of r.squad) if (m.hp > 0) m.hp = G.Battle.unitFromGrunt(m.g).maxHp; }));
      ex.appendChild(btn("Reveal map", () => { for (const z in s.maps) for (const nid in s.maps[z].nodes) s.everSeen[nid] = true; }));
      if (G.Exp.site()) ex.appendChild(btn("Open all doors here", () => { for (const R of G.Exp.site().rooms) R.open = true; }));
      ex.appendChild(btn("Restart expedition", () => { if (!r.snapshot) return "Restart isn't available here: a scenario doesn't carry the deploy snapshot."; if (G.UI.battle) { G.BattleView.unmount(G.UI.battle.v); G.UI.battle = null; } G.UI.closeModal(); const e = G.Exp.restart(); return e || "Expedition restarted (state rolled back)."; }, "Rolls the save back to the moment this expedition started and starts again with the same loadout"));
      ex.appendChild(btn("Kill my body (test death)", () => { if (G.UI.battle) { G.BattleView.unmount(G.UI.battle.v); G.UI.battle = null; } G.UI.closeModal(); G.Exp.die("Killed by the debug panel."); }));
      ex.appendChild(btn("Extract now", () => { if (G.UI.battle) { G.BattleView.unmount(G.UI.battle.v); G.UI.battle = null; } G.UI.closeModal(); r.queue = []; G.Exp.extractSuccess(); }));
      const step = G.Exp.current();
      if (step && step.type === "container") ex.appendChild(btn("Reroll this loot", () => { const n = G.Exp.node(step.nid || r.loc); step.items = step.items.map(() => G.Items.rollLoot(G.rng, G.Exp.itemLevel(G.Map.loc(n) ? n : { tier: 1 }), G.Exp.rarityBonus())); }));
      if (step) ex.appendChild(btn("Skip current encounter", () => { G.Exp.next(); }));
      if (G.UI.battle) {
        ex.appendChild(btn("Win battle now", () => { const b = G.UI.battle.b; if (b.phase === "place") G.Battle.start(b); for (const u of b.units) if (u.side === 1) u.state = "dead"; G.Battle.checkEnd(b); }));
        ex.appendChild(btn("Lose battle now", () => { const b = G.UI.battle.b; if (b.phase === "place") G.Battle.start(b); for (const u of b.units) if (u.rank === "body") { u.hp = 0; u.state = "dead"; } G.Battle.checkEnd(b); }));
      }
      ex.appendChild(h("div", { class: "dbg-small" }, `Run seed ${r.seed} · last battle seed ${G.UI.battle ? G.UI.battle.b.seed : "—"}`));
    } else {
      ex.appendChild(btn("Hire candidate 1 (pays the cost)", () => { const r = G.Outpost.recruit(); return r.error || "Recruited " + G.Allies.name(r.grunt); }));
      ex.appendChild(btn("Add a free Grunt", () => { const g = G.State.makeGrunt(G.rng); s.grunts.push(g); return "Added " + G.Allies.name(g); }));
      ex.appendChild(btn("Add test core ally (Critical/Domed)", () => { const g = G.State.makeGrunt(G.rng, DATA.bodies.coreAllyTest); s.grunts.push(g); return "Added " + g.name + " (deploy cost 3)"; }));
      ex.appendChild(btn(s.humanOffer ? "Reroll body offer" : "Roll a body offer now", () => { s.humanOffer = G.State.rollHumanOffer(G.rng); }));
      ex.appendChild(btn("Give random human body", () => { s.bodies.push(G.State.rollHumanBody(G.rng)); s.tutorialDone = true; }));
    }
    el.appendChild(ex);
    // Slice 3 §1 allies: give / remove any trait on any ally, nickname moments, extractions (promotion), candidates
    { const A = G.Allies, al = h("div", { class: "dbg-sec" }, h("h4", null, "Allies (traits / nicknames / promotion)"));
      const gs = s.grunts; const gSel = h("select", null, ...gs.map((g) => h("option", { value: g.uid }, A.name(g))));
      const tSel = h("select", null, ...Object.keys(DATA.allies.traits).map((t) => h("option", { value: t }, `${A.trait(t).name} (${A.kind(t)})`)));
      const nSel = h("select", null, ...Object.keys(DATA.allies.nicknames).map((k) => h("option", { value: k }, k)));
      const cur = () => gs.find((g) => g.uid === gSel.value);
      if (gs.length) {
        al.appendChild(h("div", null, "Ally ", gSel)); al.appendChild(h("div", null, "Trait ", tSel));
        al.appendChild(btn("Give trait", () => { const g = cur(); if (!g) return "No ally."; if (g.traits.includes(tSel.value)) return "Already has it."; g.traits.push(tSel.value); G.State.save(); return `${A.name(g)}: +${A.trait(tSel.value).name}`; }));
        al.appendChild(btn("Remove trait", () => { const g = cur(); if (!g) return "No ally."; g.traits = g.traits.filter((t) => t !== tSel.value); G.State.save(); return `${A.name(g)}: -${A.trait(tSel.value).name}`; }));
        al.appendChild(h("div", null, "Nickname moment ", nSel));
        al.appendChild(btn("Fire nickname moment", () => { const g = cur(); if (!g) return "No ally."; const res = A.earn(g, nSel.value); G.State.save(); return res.applied ? `Nickname "${res.applied}"` : `Offered "${res.offered}" (Keep / Take on the next extraction summary)`; }));
        al.appendChild(btn("+1 extraction", () => { const g = cur(); if (!g) return "No ally."; g.extractions = (g.extractions || 0) + 1; G.State.save(); return `${A.name(g)}: ${g.extractions} extractions`; }));
        al.appendChild(h("div", { class: "dbg-small" }, cur() ? `Traits: ${cur().traits.join(", ") || "none"}` : ""));
      } else al.appendChild(h("div", { class: "dbg-small" }, "No allies."));
      if (!r) al.appendChild(btn("Reroll recruit candidates", () => { A.rerollCandidates(); G.State.save(); }));
      el.appendChild(al); }
    // Slice 3 §3 perks: level up for testing, reset (there's no respec in the game)
    { const P = G.Perks, pk = h("div", { class: "dbg-sec" }, h("h4", null, `Perks: Lv ${P.level()}, unspent ${P.unspent().normal} + ${P.unspent().keystone} Keystone`));
      pk.appendChild(btn("+1 character level", () => { const lv = P.level() + 1, before = P.level(); s.lifetimeXp = Math.max(s.lifetimeXp, lv * lv * DATA.config.leveling.charLevelDivisor); P.checkReady(before); G.State.save(); return "Character Lv " + P.level(); }));
      pk.appendChild(btn("Reset perks", () => { P.reset(); return "Perks reset."; }));
      el.appendChild(pk); }
    // seeds
    const sd = h("div", { class: "dbg-sec" }, h("h4", null, `Zone A map seed: ${s.maps.a.seed}`));
    const seedIn = h("input", { type: "number", value: s.maps.a.seed, style: "width:110px" });
    const reseed = (v) => { if (r) return "Finish the expedition first."; s.maps.a = G.Map.generate(v >>> 0); for (const z of DATA.zones.order) if (z !== "a" && DATA.zones.list[z].generated) s.maps[z] = G.Map.generate(v >>> 0, z); if (G.Main) G.Main.clampAnnex(s); s.seed = s.maps.a.seed; s.everSeen = {}; return "Zone A (and the Scablands) regenerated."; };
    sd.appendChild(h("div", null, seedIn, btn("Reseed map", () => reseed(+seedIn.value)), btn("Random", () => reseed(U.randomSeed()))));
    sd.appendChild(btn("NEW GAME (wipe save)", () => { if (!confirm("Wipe the save and start over?")) return; if (G.UI.battle) { G.BattleView.unmount(G.UI.battle.v); G.UI.battle = null; } G.UI.closeModal(); G.State.newGame(+seedIn.value >>> 0); G.UI.panel = null; if (G.Title && G.Title.shouldShow()) { G.Title.choice = null; G.Title.step = "login"; G.Title.show(); } return "New game."; }));
    el.appendChild(sd);
    // tuning
    const tu = h("div", { class: "dbg-sec" }, h("h4", null, "Tuning (live; saved as overrides in this browser)"));
    const secSel = h("select", { onchange: (e) => { D.section = e.target.value; D.render(); } });
    for (const sct of SECTIONS) secSel.appendChild(h("option", { value: sct, selected: sct === D.section }, sct));
    const filt = h("input", { placeholder: "filter…", value: D.filter || "", oninput: (e) => { D.filter = e.target.value; D.renderFields(fields); } , style: "width:90px" });
    tu.appendChild(h("div", null, secSel, filt));
    const fields = h("div", { class: "dbg-fields" }); tu.appendChild(fields);
    D.renderFields(fields);
    tu.appendChild(h("div", null,
      h("button", { onclick: () => { const ta = h("textarea", { class: "dbg-export" }); ta.value = JSON.stringify(D.overrides, null, 1); fields.prepend(ta); ta.select(); } }, "Export overrides"),
      h("button", { onclick: () => { if (confirm("Discard all tuning overrides and reload?")) { G.State.saveOverrides({}); location.reload(); } } }, "Reset tuning")));
    tu.appendChild(h("div", { class: "dbg-small" }, `${Object.keys(D.overrides).length} override(s) active. Copy exported values into data/*.js to make them permanent.`));
    el.appendChild(tu);
  };

  D.renderFields = function (box) {
    box.innerHTML = "";
    const base = U.getPath(DATA, D.section);
    const leaves = [];
    (function walk(o, p) {
      if (o == null) return;
      if (typeof o === "number" || typeof o === "boolean") { leaves.push([p, o]); return; }
      if (typeof o === "object") for (const k in o) walk(o[k], p ? p + "." + k : k);
    })(base, "");
    const f = (D.filter || "").toLowerCase();
    let n = 0;
    for (const [p, v] of leaves) {
      if (f && !p.toLowerCase().includes(f)) continue;
      if (n++ > 250) { box.appendChild(h("div", { class: "dbg-small" }, "…more (use filter)")); break; }
      const full = D.section + "." + p;
      const inp = typeof v === "boolean"
        ? h("input", { type: "checkbox", checked: v, onchange: (e) => D.set(full, e.target.checked) })
        : h("input", { type: "number", step: "any", value: v, onchange: (e) => D.set(full, parseFloat(e.target.value)) });
      box.appendChild(h("label", { class: "dbg-field" + (full in D.overrides ? " changed" : "") }, h("span", null, p), inp));
    }
  };

  D.set = function (path, v) {
    if (typeof v === "number" && isNaN(v)) return;
    if (U.getPath(DATA, path) === v) return;
    U.setPath(DATA, path, v); D.overrides[path] = v; G.State.saveOverrides(D.overrides);
    // no synchronous re-render here: a blur-triggered change would swallow the click that caused the blur.
    // Values are read live; screens pick them up on their next render.
    G.UI.toast(`${path} = ${v} (applies live)`);
  };

  window.addEventListener("keydown", (e) => {
    if (G.Util.typing(e)) return;   // a backtick typed in the Share name field is just a backtick
    if (e.key === "`" || e.key === "F1" || e.key === "~") { e.preventDefault(); D.toggle(); }
  });
})(window);
