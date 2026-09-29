// Debug panel (` or F1): live tuning editor for DATA + helper actions.
(function (root) {
  const G = root.G, U = G.Util;
  const D = G.Debug = { on: false, rollMath: false, fastSearch: false, overrides: {}, section: "config.battle" };
  const h = (...a) => G.UI.h(...a);
  const SECTIONS = ["config.tutorial", "config.deploy", "config.carry", "config.heat", "config.rolls", "config.checks", "config.battle", "config.enemies", "config.expedition", "config.loot", "config.leveling", "config.restore", "config.grunts", "config.search", "config.revisit", "config.xpFloat",
    "bodies.families", "bodies.basicBody", "bodies.classes", "bodies.specialties", "bodies.grunt", "bodies.criticalCare", "enemies.units", "enemies.elite", "items.rarities", "items.bases", "items.affixes", "items.tags", "resources", "map.locations", "events",
    "searchables", "zones", "quests", "outpost", "town"];

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
    hs.appendChild(h("label", { class: "dbg-check" }, h("input", { type: "checkbox", checked: G.Sfx.enabled, onchange: (e) => { G.Sfx.enabled = e.target.checked; } }), " SFX (plays assets/sfx/*.mp3 if present)"));
    el.appendChild(hs);
    // give item
    const gi = h("div", { class: "dbg-sec" }, h("h4", null, "Give item" + (r ? " (to bag)" : " (to stash)")));
    const bSel = h("select"); for (const k in DATA.items.bases) if (!DATA.items.bases[k].natural) bSel.appendChild(h("option", { value: k }, DATA.items.bases[k].name));
    const rSel = h("select"); for (const k in DATA.items.rarities) rSel.appendChild(h("option", { value: k }, k));
    const iIn = h("input", { type: "number", value: 5, min: 1, style: "width:50px" });
    gi.appendChild(h("div", null, bSel, rSel, iIn, btn("Give", () => { const it = G.Items.make(bSel.value, rSel.value, +iIn.value); (r ? r.bag.items : s.stash.items).push(it); return "Gave " + G.Items.name(it); })));
    gi.appendChild(btn("Give 3 random loot", () => { for (let i = 0; i < 3; i++) (r ? r.bag.items : s.stash.items).push(G.Items.rollLoot(G.rng, +iIn.value, 0)); }));
    el.appendChild(gi);
    // skills
    const sk = h("div", { class: "dbg-sec" }, h("h4", null, "XP (worn/selected body + mind)"));
    const sSel = h("select"); for (const k in DATA.skills) sSel.appendChild(h("option", { value: k }, DATA.skills[k].name + " (" + DATA.skills[k].kind + ")"));
    const xIn = h("input", { type: "number", value: 500, style: "width:60px" });
    sk.appendChild(h("div", null, sSel, xIn, btn("Add XP", () => { const b = G.State.body(r ? r.bodyUid : s.loadout.bodyId); G.State.giveXp({ kind: "body", body: b }, sSel.value, +xIn.value / (DATA.skills[sSel.value].kind === "mind" ? DATA.config.leveling.mindXpSourceMult : 1)); })));
    el.appendChild(sk);
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
    const os = h("div", { class: "dbg-sec" }, h("h4", null, `Outpost: Vault L${G.Outpost.st("vault").level}${G.Outpost.st("vault").upgrading ? " (upgrading, " + U.fmtTime(G.Outpost.remainingMs("vault")) + ")" : ""}`));
    os.appendChild(btn("Finish Vault build", () => { const u = G.Outpost.st("vault").upgrading; if (!u) return "Not building."; G.clockOffset += Math.max(0, u.until - G.now()) + 10; G.Outpost.tick(); return "Vault done."; }));
    os.appendChild(btn("Reset Vault to L1", () => { const st = G.Outpost.st("vault"); st.level = 1; st.upgrading = null; }));
    os.appendChild(h("div", { class: "dbg-small" }, `Stash ${G.Outpost.stashCount()}/${G.Outpost.stashCap()} · pouch ${G.Outpost.pouchSlots()} slot(s), ${G.Outpost.pouchMaxKg()} kg`));
    el.appendChild(os);
    // expedition
    const ex = h("div", { class: "dbg-sec" }, h("h4", null, "Expedition"));
    if (r) {
      const hIn = h("input", { type: "number", value: r.heat, style: "width:50px" });
      ex.appendChild(h("div", null, "Heat ", hIn, btn("Set", () => { r.heat = U.clamp(+hIn.value, 0, 100); })));
      ex.appendChild(btn("Heal squad", () => { r.bodyHp = G.Exp.maxBodyHp(); for (const m of r.squad) if (m.hp > 0) m.hp = G.Battle.unitFromGrunt(m.g).maxHp; }));
      ex.appendChild(btn("Reveal map", () => { for (const z in s.maps) for (const nid in s.maps[z].nodes) s.everSeen[nid] = true; }));
      if (G.Exp.site()) ex.appendChild(btn("Open all doors here", () => { for (const R of G.Exp.site().rooms) R.open = true; }));
      ex.appendChild(btn("Restart expedition", () => { if (G.UI.battle) { G.BattleView.unmount(G.UI.battle.v); G.UI.battle = null; } G.UI.closeModal(); const e = G.Exp.restart(); return e || "Expedition restarted (state rolled back)."; }, "Rolls the save back to the moment this expedition started and starts again with the same loadout"));
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
      ex.appendChild(btn("Recruit a Grunt (pays the cost)", () => { const r = G.Outpost.recruit(); return r.error || "Recruited " + r.grunt.name; }));
      ex.appendChild(btn("Add a free Grunt", () => { const g = G.State.makeGrunt(G.rng); s.grunts.push(g); return "Added " + g.name; }));
      ex.appendChild(btn("Add test core ally (Critical/Domed)", () => { const g = G.State.makeGrunt(G.rng, DATA.bodies.coreAllyTest); s.grunts.push(g); return "Added " + g.name + " (deploy cost 3)"; }));
      ex.appendChild(btn(s.humanOffer ? "Reroll body offer" : "Roll a body offer now", () => { s.humanOffer = G.State.rollHumanOffer(G.rng); }));
      ex.appendChild(btn("Give random human body", () => { s.bodies.push(G.State.rollHumanBody(G.rng)); s.tutorialDone = true; }));
    }
    el.appendChild(ex);
    // seeds
    const sd = h("div", { class: "dbg-sec" }, h("h4", null, `Zone A map seed: ${s.maps.a.seed}`));
    const seedIn = h("input", { type: "number", value: s.maps.a.seed, style: "width:110px" });
    const reseed = (v) => { if (r) return "Finish the expedition first."; s.maps.a = G.Map.generate(v >>> 0); s.seed = s.maps.a.seed; s.everSeen = {}; return "Zone A regenerated."; };
    sd.appendChild(h("div", null, seedIn, btn("Reseed map", () => reseed(+seedIn.value)), btn("Random", () => reseed(U.randomSeed()))));
    sd.appendChild(btn("NEW GAME (wipe save)", () => { if (!confirm("Wipe the save and start over?")) return; if (G.UI.battle) { G.BattleView.unmount(G.UI.battle.v); G.UI.battle = null; } G.UI.closeModal(); G.State.newGame(+seedIn.value >>> 0); G.UI.panel = null; return "New game."; }));
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
    if (e.key === "`" || e.key === "F1" || e.key === "~") { e.preventDefault(); D.toggle(); }
  });
})(window);
