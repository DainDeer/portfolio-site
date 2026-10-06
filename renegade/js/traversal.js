// Maps/Areas/Loot views (V2 runs): the holographic Map panel over the paper zone map (draft §4, SP-039's paper map +
// holo overlay), the battle-loot overlay and a source's loot panel (draft §8), and the side panel's V2 sections
// (getting out, the "Here" list, Heat). Presentation only: every rule is G.V2's (js/v2.js).
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const TV = G.Traversal = { sel: null, auto: null, hideLoot: null, showAreas: false, cross: null };
  const UI = () => G.UI, h = function () { return G.UI.h.apply(null, arguments); };
  const T = () => DATA.mapsV2.text;
  const TL = () => !!(G.Touch && G.Touch.layout());
  TV.on = () => !!(G.V2 && G.V2.on());

  // ---------- the Map panel ----------
  TV.select = (nid) => { TV.sel = nid; TV.showAreas = false; UI().render(); };
  TV.close = () => { TV.sel = null; UI().render(); };
  // a crossing lands you on traversal: the panel for where you are opens by itself (Enter, or travel on)
  TV.current = function () {
    const r = G.state.run; if (!r || r.queue.length || r.view !== "map") return null;
    const k = G.state.runCount + ":" + r.loc + ":" + r.moves;
    if (TV.auto !== k && G.Map.loc(G.Exp.node())) { TV.auto = k; TV.sel = r.loc; }
    return TV.sel;
  };
  TV.mount = function (box) {
    if (TV.cross && performance.now() - TV.cross.t0 < 1400) box.appendChild(TV.crossEl());
    const nid = TV.current(); if (!nid) return;
    const el = TV.panel(nid); if (el) box.appendChild(el);
  };
  // the crossing's one encounter check, shown for a moment (SP-036: near-instant, skippable: tap it away)
  TV.crossEl = function () {
    const c = TV.cross, el = h("div", { class: "holo-cross" + (c.hit ? " hit" : ""), "data-cross": c.hit ? "hit" : "quiet", onclick: () => { TV.cross = null; el.remove(); } }, h("div", null, `Crossing to ${U.copy(c.name)}`), h("b", null, c.hit ? "Something's waiting." : "Quiet."));
    return el;
  };
  TV.enterLabel = function (nid) {
    const V = G.V2, def = V.areaDef(nid);
    if (!def) return `Enter ${U.copy(G.Map.loc(G.Zones.node(nid)).name)}`;
    const m = V.inst(nid), a = V.curArea(nid), site = G.state.world.sites[V.key(nid, a)], cont = site && site.posRun === G.state.runCount && m.seenAreas[a];
    return `${cont ? "Continue in" : "Enter"} ${U.copy(def.areas[a].name)}`;
  };
  TV.panel = function (nid) {
    const X = G.Exp, V = G.V2, r = G.state.run, I = V.intel(nid); if (!I) return null;
    const cur = I.areas && (I.areas.find((a) => a.current) || I.areas.find((a) => a.entry));
    const p = h("section", { class: "holo-panel", "data-panel": "map", "data-nid": nid, role: "dialog", "aria-label": I.name },
      h("button", { class: "holo-x", "aria-label": "Close", "data-act": "holo-close", onclick: () => TV.close() }, "×"),
      h("div", { class: "holo-crumb" }, `${U.copy(I.zone)} / `, h("b", null, U.copy(I.name)), I.here && cur ? ` / ${U.copy(cur.name)}` : ""),
      h("div", { class: "holo-tags" }, I.className ? h("span", { class: "holo-class c-" + I.classification, "data-class": I.classification }, I.className) : null,
        h("span", { class: "holo-danger", "data-danger": I.danger, title: "Danger. The scarier the place, the better the pickings." }, T().dangerLabel + " ", I.danger ? h("b", null, "☠".repeat(I.danger)) : h("i", null, "none")),
        I.here ? h("span", { class: "holo-tag" }, "You're here") : I.visited ? h("span", { class: "holo-tag" }, "Visited this run") : null),
      I.blurb ? h("p", { class: "holo-blurb" }, U.copy(I.blurb)) : null);
    const locked = I.mods.some((m) => m.locked), toggles = I.mods.some((m) => m.canDisable);
    const ml = h("div", { class: "holo-sec" }, h("h4", null, "What's known", h("small", null, locked ? " · locked in" : toggles ? " · a hazard you can see can be turned off before you go: its reward goes with it" : "")));
    for (const m of I.mods) {   // the headline and whatever skill or experience has revealed (design §1)
      const row = h("div", { class: "holo-mod" + (m.on ? "" : " off") + (m.headline ? " head" : ""), "data-mod": m.id, "data-headline": m.headline ? "1" : "0" },
        h("span", { class: "holo-tier", style: `color:${m.color};border-color:${m.color}` }, m.catName),
        h("div", { class: "holo-mod-txt" }, h("b", null, U.copy(m.name)), h("div", null, U.copy(m.effect)), m.reward ? h("div", { class: "holo-reward" }, (m.on ? "" : "Turned off, lost: ") + U.copy(m.reward)) : null));
      if (m.canDisable) row.appendChild(h("button", { class: "holo-toggle", "data-act": "mod-toggle", "aria-pressed": String(m.on), title: m.on ? "Turn it off (and lose its reward)" : "Turn it back on", onclick: () => { const e = V.setMod(nid, m.id, !m.on); if (e) UI().fail(e); UI().render(); } }, m.on ? "On" : "Off"));
      ml.appendChild(row);
    }
    if (I.hiddenMods) ml.appendChild(h("div", { class: "holo-unknown holo-hidden", "data-hidden": I.hiddenMods }, T().hiddenMods));
    p.appendChild(ml);
    p.appendChild(h("div", { class: "holo-sec" }, h("h4", null, "Enemies"),
      h("div", null, I.enemies.known ? U.copy(I.enemies.text) : h("span", { class: "holo-unknown" }, T().unknown), I.enemies.beaten ? ` · ${I.enemies.beaten} group${I.enemies.beaten === 1 ? "" : "s"} beaten here` : ""),
      I.enemies.hunters ? h("div", { class: "bad" }, "A Hunter pack is here.") : null));
    const ll = h("div", { class: "holo-sec" }, h("h4", null, "Known loot"));
    if (!I.loot.length) ll.appendChild(h("div", { class: "holo-unknown" }, T().unknown));
    for (const l of I.loot) ll.appendChild(h("div", { class: "holo-loot", "data-k": l.kind }, h("span", { class: "holo-k" }, l.kind === "known" ? "Known" : l.kind === "rumored" ? "Rumored" : "Last seen"), " ", U.copy(l.text)));
    p.appendChild(ll);
    p.appendChild(h("div", { class: "holo-sec", "data-sec": "extraction" }, h("h4", null, "Extraction"), h("div", null, U.copy(I.extraction.text || "—"))));
    if (I.here && I.areas && TV.showAreas) p.appendChild(h("div", { class: "holo-sec" }, h("h4", null, "Areas"), ...I.areas.map((a) => h("div", { class: "holo-area" + (a.current ? " cur" : "") }, U.copy(a.name), a.current ? " · you're here" : a.seen ? " · seen" : a.entry ? " · the way in" : ""))));
    const acts = h("div", { class: "holo-acts" });
    if (I.here) {
      if (I.areas || X.site(nid)) acts.appendChild(h("button", { class: "primary", "data-act": "enter", disabled: !!r.queue.length, onclick: () => { TV.sel = null; const e = X.enterSite(); if (e) UI().fail(e); UI().render(); } }, TV.enterLabel(nid)));
      if (I.extraction.canNow && (I.extraction.category === "peaceful" || I.extraction.finish)) acts.appendChild(h("button", { "data-act": "extract", onclick: () => TV.extract() }, I.extraction.finish ? T().finishExtraction : "Extract"));
      if (I.areas) acts.appendChild(h("button", { "data-act": "view-areas", onclick: () => { TV.showAreas = !TV.showAreas; UI().render(); } }, TV.showAreas ? "Hide Areas" : "View Areas"));
    } else if (X.canMoveTo(nid)) acts.appendChild(h("button", { class: "primary", "data-act": "travel", onclick: () => TV.travel(nid) }, `Travel to ${U.copy(I.name)}`));
    else {
      const next = G.Map.neighbors(G.Zones.map(), r.loc).includes(nid);
      acts.appendChild(h("div", { class: "holo-note", "data-note": next && X.immobile() ? "overloaded" : "far" }, next && X.immobile() ? X.overloadText() : next ? "Finish what's in front of you first." : "Not connected to where you are."));
    }
    acts.appendChild(h("button", { "data-act": "holo-back", onclick: () => TV.close() }, "Back"));
    p.appendChild(acts);
    return p;
  };
  TV.travel = function (nid) {
    const X = G.Exp; if (X.immobile()) return UI().fail(X.overloadText());   // SP-045
    const name = G.Map.loc(G.Zones.node(nid)).name;
    if (!X.moveTo(nid)) return UI().fail("Can't move there.");
    const r = G.state.run, ev = r && r.v2 && r.v2.events.slice().reverse().find((e) => e.type === "crossing" && e.nid === nid);
    TV.cross = { name, hit: !!(r && r.queue.some((s) => s.type === "battle")) || !!(ev && ev.group), t0: performance.now() };
    TV.sel = null; UI().render();
  };
  TV.extract = function () { const res = G.V2.extractHere(); if (res.error) UI().fail(res.error); else UI().toast(res.text); TV.sel = null; UI().render(); };

  // ---------- the side panel (V2) ----------
  // getting out of the Map you're on: the same authoritative line as the panel and the object (draft §11)
  TV.sideExtract = function () {
    const r = G.state.run, I = G.V2.extractInfo(r.loc);
    if (!I.finish && (I.category === "legacy" || I.category === "none")) return null;   // a legacy Map keeps its own panel (ui.js), unless a won defense waits on Finish extraction
    const sec = h("section", { class: "panel extract v2", "data-extract": I.category }, h("h3", null, "Getting out: " + (I.name || "")), h("p", { class: "hint" }, U.copy(I.text)));
    if (I.category === "peaceful" || I.finish) sec.appendChild(h("button", { class: "primary big", "data-act": "extract", disabled: !I.canNow, onclick: () => TV.extract() }, I.finish ? T().finishExtraction : "Extract"));
    if (I.category === "occupied" && I.item) sec.appendChild(h("button", { class: "primary big", "data-act": "escape", disabled: !I.canNow, onclick: () => { const res = G.V2.useEscape(r.loc); if (res.error) UI().fail(res.error); else UI().toast(res.text); UI().render(); } }, `Use the ${G.Items.name(I.item)}`));
    return sec;
  };
  // Sweep the area (design §4): pick the fight with whoever's here yourself, from the Map's pool
  TV.sideSweep = function () {
    if (!G.V2.canSweep()) return null;
    return h("section", { class: "panel sweep", "data-panel": "sweep" }, h("h3", null, "Trouble here"), h("p", { class: "hint" }, U.copy(T().sweepHint)),
      h("button", { class: "big", "data-act": "sweep", onclick: () => { const res = G.V2.sweep(); if (res.error) UI().fail(res.error); else if (res.text) UI().toast(res.text); UI().render(); } }, T().sweep));
  };
  // "Here": everything usable in this Area, nearest first; keyboard reachable, and the phone's reliable path to small art
  TV.sideHere = function () {
    const r = G.state.run, list = r.queue.length ? [] : G.AreaWalk.here(), sec = h("section", { class: "panel here", "data-panel": "here" }, h("h3", null, "Here"));
    if (r.queue.length) sec.appendChild(h("small", { class: "hint" }, "Finish what's in front of you first."));
    else if (!list.length) sec.appendChild(h("small", { class: "hint" }, "Nothing left to use in here."));
    for (const o of list.slice(0, 14)) sec.appendChild(h("button", { class: "here-btn" + (o.kind === "areaExit" || o.kind === "exit" ? " way" : o.loot ? " loot" : ""), "data-here": o.id, onclick: () => G.AreaWalk.go(o) }, U.copy(G.AreaWalk.label(o))));
    sec.appendChild(h("small", { class: "hint" }, `${TL() ? "Tap" : "Click"} the ground to walk; ${TL() ? "tap" : "click"} something to walk over and use it. ${TL() ? "Long-press" : "Right-click"} to look.`));
    return sec;
  };
  // Heat (SP-034): hidden while it's low; once shown, it's the Hunters' meter (no passive effects any more)
  TV.heat = function (r, bar) {
    if (!G.V2.heatShown()) return null;
    const t = G.Exp.heatTier(), sec = h("section", { class: "panel", "data-tut": "heat" }, h("h3", null, `Heat ${r.heat} — ${t.name}`), bar(r.heat / DATA.config.heat.max, t.color, `${r.heat}/100`));
    sec.appendChild(h("small", null, "Orbital attention. It only rises when you break orbital things, get into lots of loud fights or loot orbital chests, and it brings the Hunters."));
    return sec;
  };

  // ---------- battle loot (draft §8): a view onto what's on the bodies, never a second owner ----------
  // step: { type: "spoils", enc, site, finish } (all of one fight's bodies, right after the win) or
  //       { type: "loot", site, objs, title } (one source, or one fight's bodies in this Area)
  TV.lootStep = function (step) {
    const X = G.Exp, V = G.V2, r = G.state.run, site = X.site(step.site);
    if (!site) { X.next(); return UI().render(); }
    const objs = step.type === "spoils" ? V.sources(site, step.enc) : (step.objs || []).map((id) => X.obj(id, site)).filter(Boolean);
    const sid = step.enc || (step.objs || []).join(",");
    if (TV.hideLoot === sid) {   // Manage inventory: the bag is in the side panel; the loot waits, one tap away
      UI().closeModal();
      const box = document.querySelector(".exp-map"); if (box && !box.querySelector(".loot-chip")) box.appendChild(h("div", { class: "loot-chip", "data-chip": "loot" }, "Loot is waiting on the bodies. ",
        h("button", { class: "primary", "data-act": "loot-back", onclick: () => { TV.hideLoot = null; UI().render(); } }, "Back to the loot")));
      return;
    }
    const cap = X.capacity(), kg = X.carried(), left = objs.reduce((a, o) => a + V.left(o).length, 0);
    const title = step.type === "spoils" ? (step.finish ? "You held it! Take what you want, then go" : "Spoils") : U.copy(step.title || "Loot");
    const box = h("div", { class: "loot-box v2", "data-loot": step.type }, h("h2", null, title),
      h("p", { class: "loot-carry" }, `Carrying ${U.fmt1(kg)} / ${U.fmt1(cap)} kg (${Math.round(kg / cap * 100)}%). Over 100% slows you in battle; at ${DATA.config.carry.immobileAtPct}% you can't move.`));
    const take = (o, e) => { const res = V.take(step.site, o.id, e.id, { opKey: "t:" + e.id + ":" + (e.item ? e.item.uid : e.n) }); if (res.error) UI().fail(res.error); else if (G.Sfx) G.Sfx.play("sfx_ui_click"); UI().render(); };
    const order = (o) => (o.combat && o.combat.kind === "teammate" ? 0 : o.combat ? 1 : 2);
    let lastGroup = -1;
    for (const o of objs.slice().sort((a, b) => order(a) - order(b))) {
      const es = V.left(o); if (!es.length) continue;
      const g = order(o);
      if (g !== lastGroup && step.type === "spoils") { box.appendChild(h("h4", { class: "loot-group" }, g === 0 ? "Your fallen: their gear and the share of the bag they carried" : "From the enemies")); lastGroup = g; }
      if (o.gruntBody && !o.keepRun) box.appendChild(h("p", { class: "warn", "data-note": "dead-bag" }, `Take ${U.copy(o.name.replace(/^Body: /, ""))}'s things before you leave this Map, or they're gone.`));   // Slice 5 §C vanishOnLeave
      const sec = h("div", { class: "loot-src", "data-src": o.id }, h("div", { class: "loot-src-name" }, U.copy(o.name)));
      const ctx = Object.values(r.gear).filter(Boolean);
      for (const e of es) {
        if (e.item) sec.appendChild(UI().itemEl(e.item, [{ label: "Take", fn: () => take(o, e) }], null, ctx));
        else { const R = DATA.items.resources[e.res]; sec.appendChild(h("div", { class: "item-row" }, SP.icon(R.sprite, 20), ` ${e.n} × ${R.name} (${U.fmt1(e.n * R.kgPerUnit)} kg) `, h("button", { "data-act": "take", onclick: () => take(o, e) }, "Take"))); }
      }
      box.appendChild(sec);
    }
    if (!left) box.appendChild(h("p", { class: "hint" }, step.type === "spoils" ? "Nothing worth taking." : "Empty."));
    if (objs.some((o) => V.left(o).some((e) => e.item && G.Items.isRare(e.item))) && TV._rare !== sid) { TV._rare = sid; G.Sfx.play("sfx_loot_rare"); }
    box.appendChild(h("p", { class: "hint" }, objs.some((o) => o.combat) ? T().lootLeave : "Anything you leave stays here. You can come back for it."));
    const row = h("div", { class: "row loot-acts" });
    if (left) row.appendChild(h("button", { "data-act": "take-all", onclick: () => {
      const res = V.takeAll(step.site, objs.map((o) => o.id), "all:" + sid + ":" + left + ":" + U.fmt1(X.carried()));
      if (res.dup) return;
      if (res.left) UI().toast(res.taken ? `Took ${res.taken}. ${res.left} thing${res.left === 1 ? "" : "s"} didn't fit${res.needKg ? ` (${U.fmt1(res.needKg)} kg more room needed)` : ""}: still ${objs.some((o) => o.combat) ? "on the bodies" : "there"}.` : `Nothing fits: you need ${U.fmt1(res.needKg)} kg more room.`);
      else if (step.type === "loot") X.next();   // emptied: nothing left to look at
      UI().render(); } }, "Take all that fits"));
    if (left) row.appendChild(h("button", { "data-act": "manage", title: "Drop or equip things from your bag (side panel), then come back", onclick: () => { TV.hideLoot = sid; UI().render(); } }, "Manage inventory"));
    if (step.finish) row.appendChild(h("button", { class: "primary", "data-act": "finish-extraction", onclick: () => { const res = G.V2.finishExtraction(); if (res.error) UI().fail(res.error); UI().render(); } }, T().finishExtraction + (left ? " (leave the rest)" : "")));
    row.appendChild(h("button", { class: step.finish ? "" : "primary", "data-act": "done", onclick: () => { TV.hideLoot = null; X.next(); UI().render(); } }, left ? "Leave the rest" : "Done"));
    box.appendChild(row);
    UI().modal(box, "wide");
  };
})(window);
