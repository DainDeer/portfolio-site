// DOM UI: outpost (deploy / vault / bodies / skills / buildings), expedition screen, modals.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const UI = G.UI = { panel: null, zone: "a", battle: null, battleSpeed: 1, modalLock: false, search: null };
  const $ = (sel) => document.querySelector(sel);
  const TL = () => !!(G.Touch && G.Touch.layout());   // phone layout (js/touch.js): "tap" wording; desktop text unchanged
  const healIco = () => DATA.sprites.healIcon ? SP.icon(DATA.sprites.healIcon, 16, "btn-icon") : null;

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === "class") e.className = v; else if (k === "html") e.innerHTML = U.copy(v); else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style") e.setAttribute("style", v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : k === "title" ? U.copy(v) : v);
    }
    // U.copy: data text reaches the player through here (modals, panels, the log), so [DRAFT] / [PLACEHOLDER] tags never show
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(U.copy(String(kid))) : kid);
    return e;
  }
  UI.h = h;
  UI.fail = function (msg) { G.Sfx.play("sfx_ui_error"); UI.toast(msg); };   // a refused action: toast + error sound
  UI.toast = function (msg) { if (G.Dice && G.Dice.busy()) return G.Dice.whenIdle(() => UI.toast(msg));   // Slice 5 §B: a check's toast waits for its die
    const t = $("#toast"); t.textContent = U.copy(msg); t.onclick = null; t.classList.remove("clickable"); t.classList.add("show"); clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove("show"), 2600); };
  UI.showTip = function (html, x, y) { UI.tipAt = performance.now(); const t = $("#tooltip"); t.innerHTML = U.copy(html); t.classList.remove("hidden"); const w = t.offsetWidth, hh = t.offsetHeight; t.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px"; t.style.top = Math.min(window.innerHeight - hh - 8, y + 14) + "px"; };
  UI.hideTip = function () { UI.tipArmed = null; $("#tooltip").classList.add("hidden"); };   // tipAt / tipArmed: tap-to-show on touch (js/touch.js)
  const tipOn = UI.tipOn = (el, fn) => { el.addEventListener("mousemove", (e) => UI.showTip(typeof fn === "function" ? fn() : fn, e.clientX, e.clientY)); el.addEventListener("mouseleave", UI.hideTip); return el; };
  // SP-014 (Megan, Oct 2): an item's full stat tooltip (the one the stash and bag rows show) on anything that names it,
  // e.g. an equipped weapon. It wins over a tooltip on the row around it (a Grunt's row on the deploy panel).
  UI.itemTipHtml = (item, ctx) => `<b style="color:${G.Items.color(item)}">${G.Items.name(item)}</b><br>` + G.Items.describe(item, ctx).join("<br>");
  UI.itemTip = (el, item, ctx) => { el.dataset.itemTip = item.uid || item.base; el.addEventListener("mousemove", (e) => { e.stopPropagation(); UI.showTip(UI.itemTipHtml(item, ctx), e.clientX, e.clientY); }); el.addEventListener("mouseleave", UI.hideTip); return el; };
  UI.modal = function (content, cls) { const root = $("#modal-root"); root.innerHTML = ""; const m = h("div", { class: "modal " + (cls || "") }, content); root.appendChild(h("div", { class: "modal-back" }, m)); return m; };
  UI.closeModal = function () { $("#modal-root").innerHTML = ""; UI.hideTip(); };
  const bar = UI.bar = (frac, color, label) => h("div", { class: "bar" }, h("div", { class: "bar-fill", style: `width:${U.clamp(frac, 0, 1) * 100}%;background:${color}` }), h("span", { class: "bar-label" }, label));

  // ctx: the items on the same unit (set line counts those); Slice 3 §5-6: set tab over the frame, Purple / Orange frames
  UI.itemEl = function (item, actions, extra, ctx) {
    const row = h("div", { class: "item-row" + (G.Items.isRare(item) ? " rare" : "") + (G.Items.setOf(item) ? " set-piece" : "") });
    const ic = h("span", { class: "item-icon" }, SP.icon(G.Items.sprite(item), 32), SP.icon("frame_" + item.rarity, 32, "frame"), G.Items.setOf(item) ? SP.icon("frame_set", 32, "frame") : null);
    row.appendChild(ic);
    row.appendChild(h("span", { class: "item-name", style: `color:${G.Items.color(item)}` }, G.Items.name(item), item.qty != null ? h("b", { class: "qty", "data-qty": item.qty }, ` ×${item.qty}`) : null, h("small", null, item.qty != null ? ` · ${G.Items.weight(item)} kg each` : ` i${item.ilvl} · ${G.Items.weight(item)}kg`)));
    if (extra) row.appendChild(h("span", { class: "item-extra" }, extra));
    const acts = h("span", { class: "item-acts" });
    for (const a of actions || []) acts.appendChild(h("button", { onclick: a.fn, disabled: a.disabled || false }, a.label));
    row.appendChild(acts);
    tipOn(row, () => UI.itemTipHtml(item, ctx));
    return row;
  };
  // "Scav Kit (2/3): +8 kg carry" lines for one unit's items (lit bonuses green, the next one grey)
  UI.setsEl = function (items) {
    const sets = G.Items.sets(items); if (!sets.length) return null;
    const el = h("div", { class: "set-summary", "data-sets": sets.map((x) => x.id + ":" + x.n).join(",") });
    for (const st of sets) {
      const row = h("div", { class: "set-row" }, h("b", { class: "set-line" }, `${st.def.name} (${st.n}/${st.def.pieces.length})`));
      for (const k of Object.keys(st.def.bonuses)) row.appendChild(h("span", { class: "set-bonus" + (st.n >= +k ? " on" : "") }, ` · (${k}) ${st.def.bonuses[k].text}`));
      el.appendChild(row);
    }
    return el;
  };

  // ---------- top bar ----------
  UI.renderTop = function () {
    const s = G.state, t = $("#topbar"); t.innerHTML = "";
    t.appendChild(h("span", { class: "brand" }, "RENEGADE", h("small", null, " [working title] · Slice 5"), G.Cards && G.Cards.title() ? h("small", { class: "brand-title", "data-card-title": "1" }, " · ★ " + G.Cards.title()) : null));   // Slice 5 §J: the Series 1 title
    if (G.Difficulty && !G.Difficulty.pending(s)) { const d = G.Difficulty.id(s); t.appendChild(h("span", { class: "diff-badge diff-" + d, "data-diff": d, title: `Difficulty: ${G.Difficulty.name(s)} (locked for this save). ${G.Difficulty.def(s).desc.replace(/^[^:]+: /, "")}` }, SP.icon("diff_" + d + "_hud", 32), G.Difficulty.name(s))); }   // Slice 4 §H
    const res = s.run ? s.run.bag.res : s.stash.res;
    const box = h("span", { class: "res" }, s.run ? "Bag: " : "Stockpile: ");
    for (const k in DATA.items.resources) if (!DATA.items.resources[k].hidden && (!["meat", "fur", "teeth"].includes(k) || res[k] > 0)) box.appendChild(   // Slice 5 §F: the animal parts only once you have some
h("span", { class: "res-i" }, SP.icon(DATA.items.resources[k].sprite, 16), " " + (res[k] || 0)));
    t.appendChild(box);
    t.appendChild(h("span", null, `Character Lv ${G.Skills.charLevel(s)} · Runs ${s.runCount} · Extracted ${s.extractions} · Deaths ${s.deaths}`));
    t.appendChild(h("span", { class: "top-btns" }, h("button", { class: "settings-btn journal-btn", "data-act": "journal", title: "Journal (main objective, side quests)", onclick: () => UI.showJournal() }, "📖 Journal"),   // Slice 4 §B
      h("button", { class: "settings-btn", "data-act": "settings", title: "Settings (audio, aim mode)", onclick: () => UI.showSettings() }, "⚙ Settings")));
    t.appendChild(h("span", { class: "hint" }, "` / F1: debug"));
  };

  // ---------- main render ----------
  UI.render = function () {
    // The title owns this screen; town artwork and tutorial/result dialogs wait until Play.
    if (G.Title && G.Title.open) { G.Sfx.setScreen("title"); if (G.Music) G.Music.set("title"); return; }
    if (G.Dice && G.Dice.busy()) { if (!UI._renderAfterDice) { UI._renderAfterDice = true; G.Dice.whenIdle(() => { UI._renderAfterDice = false; UI.render(); }); } return; }   // Slice 5 §B: the outcome shows once the die lands
    if (G.GruntLook && G.GruntLook.loadOptions) G.GruntLook.loadOptions();
    UI.hideTip();
    if (G.TutView) setTimeout(G.TutView.check, 0);   // Slice 4 §A: a tutorial step due on the new screen (js/tutorialview.js)
    if (G.State.loadNotice) { const n = G.State.loadNotice; G.State.loadNotice = null; setTimeout(() => UI.modal(h("div", null, h("h2", null, "Save"), h("p", null, n), h("button", { class: "primary", onclick: () => UI.render() }, "OK"))), 0); }
    UI.renderTop();
    const s = G.state, scr = $("#screen");
    const title = !!(G.Title && G.Title.open);   // Slice 4 §G: the title screen is up (music_title, the camp's ambience)
    G.Sfx.setScreen(title ? "title" : s.run || UI.battle ? "run" : "outpost");   // ambient loop per screen (crossfades)
    if (G.Music) G.Music.set(title ? "title" : UI.battle ? "battle" : s.run ? "run" : "outpost", title ? null : s.run ? s.run.zone : null);   // music state (js/music.js)
    if (UI.battle) return; // battle view owns the screen
    if (s.run) { UI.renderExpedition(scr); if (!UI.search) UI.renderStep(); return; }
    UI.renderOutpost(scr);
    if (s.lastResult) UI.showRunResult();
    else if (s.humanOffer) UI.showBodyOffer();
    else UI.closeModal();
  };

  // ================= OUTPOST (town view + panels over it) =================
  UI.panels = {
    zones: ["Choose a zone", (el) => UI.panelZones(el)], deploy: ["Prepare to deploy", (el) => UI.tabDeploy(el)],
    vault: ["Vault", (el) => UI.tabVault(el)], body_lab: ["Body Lab", (el) => UI.tabBodies(el)], quests: ["Quests", (el) => UI.panelQuests(el)],
    stockpile: ["Stockpile", (el) => UI.panelStockpile(el)], recruit: ["Recruitment", (el) => UI.panelRecruit(el)], memorial: ["Memorial Wall", (el) => UI.panelMemorial(el)], skills: ["Character", (el) => UI.panelCharacter(el)], character: ["Character", (el) => UI.panelCharacter(el)], codex: ["Codex", (el) => UI.tabCodex(el)]
  };
  UI.openPanel = function (id) {
    if (id === "town") id = null;
    // Slice 4 §A1: Old Marta stands by the trapdoor; opening it before you've talked to her opens her first
    if ((id === "zones" || id === "deploy") && G.Tut && G.Tut.needsMarta()) { UI.showMarta(() => UI.openPanel(id)); return; }
    UI.panel = id; UI.render();
  };
  UI.renderOutpost = function (scr) {
    scr.innerHTML = "";
    G.Outpost.tick();
    const nav = h("nav", { class: "tabs" });
    const cur = UI.panel && UI.panel.startsWith("giver:") ? "quests" : UI.panel && UI.panel.startsWith("grunt:") ? "recruit" : UI.panel === "deploy" ? "zones" : UI.panel || "town";
    const picks = G.Perks.unspentTotal();
    for (const [id, label] of DATA.town.nav.concat(DATA.town.extraNav)) nav.appendChild(h("button", { class: cur === id ? "on" : "", "data-nav": id, onclick: () => UI.openPanel(id) }, label,
      id === "character" && picks ? h("span", { class: "nav-badge", "data-perk-badge": picks, title: `${picks} unspent perk pick${picks > 1 ? "s" : ""}` }, String(picks)) : null));
    if (G.state.perkReady && !G.state.run) { G.state.perkReady = false; setTimeout(() => UI.perkReadyToast(), 50); }   // a level-up on the run: the toast waits for the outpost
    scr.appendChild(nav);
    const town = h("div", { class: "town-wrap" });
    const stage = G.TownView.render(town, (opens) => {
      // Slice 3 §10c: clicking the Water Still collects what's waiting (then opens its panel)
      if (opens === "still" && G.Outpost.built("still")) { const got = G.Outpost.collect("still"); if (Object.keys(got).length) { UI.toast("Collected " + G.Buildings.resText(got) + "."); G.Sfx.play("sfx_ui_click"); G.State.save(); } }
      if (opens === "marta") { UI.showMarta(); return; }   // Slice 4 §A1
      UI.openPanel(opens);
    });
    if (UI.panel === "zones" || UI.panel === "deploy") stage.classList.add("trapdoor-open");
    scr.appendChild(town);
    if (UI.panel) {
      const giver = UI.panel.startsWith("giver:") ? UI.panel.split(":")[1] : null;
      const gUid = UI.panel.startsWith("grunt:") ? UI.panel.slice(6) : null, gr = gUid && G.State.grunt(gUid);
      const def = giver ? [DATA.quests.givers[giver].name, (el) => UI.panelGiver(el, giver)] : gr ? [G.Allies.name(gr), (el) => UI.panelGrunt(el, gr)] : UI.panels[UI.panel];
      if (!def) { UI.panel = null; return; }
      const body = h("div", { class: "panel-body" });
      const pnl = h("div", { class: "town-panel", "data-panel": UI.panel }, h("div", { class: "tp-head" }, h("h2", null, def[0]), h("button", { class: "tp-close", title: "Back to town (Esc)", onclick: () => UI.openPanel(null) }, "✕")), body);
      def[1](body);
      town.appendChild(pnl);
    }
  };

  UI.panelZones = function (el) {
    const cards = h("div", { class: "cards zone-cards" });
    for (const z of DATA.zones.order) {
      const d = DATA.zones.list[z], open = G.Zones.unlocked(z);
      const c = h("div", { class: "card zone-card" + (open ? "" : " disabled"), "data-zone": z, onclick: () => { if (!open) return UI.toast("Find the way in first."); UI.zone = z; UI.openPanel("deploy"); } });
      if (!open) { c.appendChild(h("div", { class: "bc-name" }, d.lockedLabel || "??? – find the way in")); c.appendChild(h("div", { class: "bc-sub" }, "Somewhere past the Hushwood.")); }
      else {
        const f = G.Zones.knownFacts(z), qs = G.Quests.questsInZone(z).map((id) => G.Quests.def(id).name);
        c.appendChild(h("div", { class: "bc-name" }, d.name));
        c.appendChild(h("div", { class: "bc-sub" }, `${d.size} · ${d.tierLabel} · ${d.familyMix || ""}`));
        c.appendChild(h("div", { class: "bc-desc" }, "Known extractions: " + (f.extractions.join(", ") || "none yet")));
        c.appendChild(h("div", { class: "bc-desc" }, "Known resources: " + (f.tags.map((t) => (DATA.resources[t] ? DATA.resources[t].name : t)).join(", ") || "none yet")));
        c.appendChild(h("div", { class: "bc-desc" }, "Your quests here: " + (qs.join(", ") || "none")));
        c.appendChild(h("button", { class: "primary" }, "Deploy here ▶"));
      }
      cards.appendChild(c);
    }
    el.appendChild(cards);
    el.appendChild(h("p", { class: "hint" }, "Every expedition starts at the zone's insertion point. The outpost stays hidden: extraction is the only way home."));
  };

  UI.panelStockpile = function (el) {
    const s = G.state, t = h("div", { class: "stockpile" });
    for (const k in DATA.resources) { const R = DATA.resources[k]; if (R.hidden || R.bagOnly) continue; t.appendChild(h("div", { class: "sp-row", "data-res": k }, SP.icon(R.sprite, 24), h("span", { class: "sp-name" }, R.name), h("b", null, String(s.stash.res[k] || 0)), h("small", null, ` ${R.kgPerUnit} kg each`))); }
    el.appendChild(t);
    el.appendChild(h("p", { class: "hint" }, "Everything you carry out goes here. No cap, no drain, no rot."));
  };

  // Slice 3 §1 trait chips: coloured by kind (green / yellow / red), effect in the tooltip. No trait icons this slice.
  UI.traitChips = function (traits) {
    const A = G.Allies;
    return h("span", { class: "trait-chips" }, ...(traits || []).map((t) => { const d = A.trait(t); return h("span", { class: "trait-chip " + d.kind, "data-trait": t, title: A.traitText(t), style: `color:${A.kindColor(t)};border-color:${A.kindColor(t)}` }, d.name); }));
  };
  UI.traitTipHtml = (traits) => (traits || []).map((t) => { const d = G.Allies.trait(t); return `<span style="color:${G.Allies.kindColor(t)}">${d.name}</span>: ${d.desc}`; }).join("<br>");

  // Recruitment lot (Slice 3 §1): 3 candidates (name, 2 traits, starting weapon; reroll after every run), the roster
  // (Grunts 5 + Veterans 3) with Promote once a Grunt has 3 extractions. Hiring costs config.grunts.recruitCost.
  UI.panelRecruit = function (el) {
    const s = G.state, O = G.Outpost, A = G.Allies, c = O.recruitCost(), cap = DATA.config.grunts.rosterCap, why = O.canRecruit(), P = DATA.allies.promotion;
    const costEl = h("span", { class: "recruit-cost" }, ...Object.entries(c).map(([r, n]) => h("span", { class: "rc " + ((s.stash.res[r] || 0) < n ? "short" : ""), "data-res": r }, SP.icon(DATA.resources[r].sprite, 20), ` ${n} (have ${s.stash.res[r] || 0}) `)));
    el.appendChild(h("div", { class: "recruit-row" }, h("b", null, "Candidates"), h("span", null, " · hire cost: "), costEl));
    if (why) el.appendChild(h("p", { class: "hint", "data-why": "recruit" }, why));
    const cards = h("div", { class: "cands" });
    A.candidates().forEach((g, i) => {
      const btn = h("button", { class: "primary", "data-act": "recruit", "data-cand": i, ...(why ? { disabled: "disabled", title: why } : {}) }, "Hire");
      btn.addEventListener("click", () => { const res = A.hire(i); if (res.error) UI.fail(res.error); else UI.toast(A.name(res.grunt) + " joins the roster."); UI.render(); });
      cards.appendChild(h("div", { class: "cand-card", "data-cand": i }, SP.icon(DATA.bodies.grunt.sprite, 32), h("div", { class: "cand-name" }, A.name(g)), UI.traitChips(g.traits),
        h("div", { class: "hint" }, "Weapon: " + G.Items.base(g.weapon).name), btn));
    });
    if (!A.candidates().length) cards.appendChild(h("i", null, "Everyone here has signed on. New faces after your next run."));
    for (const id of A.petsUnlocked()) {   // Slice 5 §F: pets you brought home
      const P = DATA.allies.pets[id], pw = A.canHirePet(id), alive = A.petAlive(id);
      const pb = h("button", { class: "primary", "data-act": "recruit-pet", "data-pet": id, ...(pw ? { disabled: "disabled", title: pw } : {}) }, alive ? "On the roster" : "Take it in");
      pb.addEventListener("click", () => { const res = A.hirePet(id); if (res.error) UI.fail(res.error); else UI.toast(A.name(res.grunt) + " joins the roster."); UI.render(); });
      cards.appendChild(h("div", { class: "cand-card pet-card", "data-pet": id }, SP.icon(P.sprite, 32), h("div", { class: "cand-name" }, P.name + " (pet)"), h("div", { class: "hint" }, P.desc),
        h("div", { class: "hint" }, "Weapon: " + G.Items.base(P.weapons[0]).name + " · cost " + Object.entries(P.cost || {}).map(([r, n]) => n + " " + DATA.resources[r].name).join(" + ")), pb));
    }
    el.appendChild(cards);
    el.appendChild(h("p", { class: "hint" }, "New candidates turn up after every run (extract or death), not when you reopen this."));
    const vets = s.grunts.filter(A.isVeteran);
    el.appendChild(h("h4", null, `Grunts ${O.gruntCount()} / ${cap} · Veterans ${vets.length} / ${P.veteranCap}`));
    const list = h("div", { class: "recruit-roster" });
    for (const g of s.grunts) {
      const pw = A.canPromote(g), promo = g.tplKey === "grunt" && pw === null;
      list.appendChild(h("div", { class: "rr-row", "data-grunt": g.uid }, UI.gruntIcon(g, 32),
        h("span", { class: "rr-name" + (A.isVeteran(g) ? " vet" : "") }, (A.isVeteran(g) ? "★ " : "") + A.name(g)), ` · ${A.rankName(g)} · deploy cost ${G.State.gruntTpl(g).deployCost} · ${g.extractions || 0} extractions · ${g.kills || 0} kills `, UI.traitChips(g.traits),
        g.rank === "grunt" || A.isVeteran(g) ? h("button", { "data-act": "grunt-equip", onclick: () => UI.openPanel("grunt:" + g.uid) }, "Equip / details") : null,
        promo ? h("button", { class: "primary promote", "data-act": "promote", title: `Free. A Veteran goes Critical instead of dying, +HP/Armor/skills, a 3rd trait, but deploy cost ${DATA.allies.veteran.deployCost}.`, onclick: () => { const e = A.promote(g.uid); if (e) UI.fail(e); else UI.toast(A.name(g) + " is now a Veteran."); UI.render(); } }, "Promote") : null));
    }
    if (!s.grunts.length) list.appendChild(h("i", null, "Nobody. Recruit someone before you deploy."));
    el.appendChild(list);
    el.appendChild(h("p", { class: "hint" }, `A Grunt with ${P.extractions} extractions can be promoted (free, your choice: it raises the deploy cost). ` + (s.tutorialDone ? "Dead allies go on the Memorial Wall." : "During the tutorial your two Grunts are replaced for free.")));
  };

  UI.gruntGearText = function (g) {
    const items = Object.entries(g.gear || {}).filter(([k, v]) => v && k !== "weapon").map(([, v]) => G.Items.name(v)), w = g.gear && g.gear.weapon;
    return `${w ? G.Items.name(w) : G.Items.base(g.weapon).name + " (own)"}${items.length ? " + " + items.join(" + ") : ""}`;
  };
  // the same line as gruntGearText, each equipped item hoverable for its stats (SP-014)
  UI.gruntGearEl = function (g) {
    const gear = g.gear || {}, w = gear.weapon, worn = Object.values(gear).filter(Boolean);
    const name = (it) => UI.itemTip(h("span", { class: "gear-name", style: "color:" + G.Items.color(it) }, G.Items.name(it)), it, worn);
    const out = h("span", { class: "gear-line" }, w ? name(w) : G.Items.base(g.weapon).name + (g.gear ? " (own)" : ""));
    for (const [k, v] of Object.entries(gear)) if (v && k !== "weapon") { out.appendChild(document.createTextNode(" + ")); out.appendChild(name(v)); }
    return out;
  };
  // Grunt / Veteran screen: slots from the Vault stash (Grunt: weapon + one gear slot; Veteran: weapon / head / body / pack),
  // rename, traits, history (newest first)
  UI.panelGrunt = function (el, g) {
    const s = G.state, A = G.Allies, SL = G.State.gruntSlots(g), itemLine = (it) => `${G.Items.name(it)} [${DATA.items.rarities[it.rarity].name} i${it.ilvl}]${it.affixes.length ? " " + it.affixes.map(G.Items.affixText).join(", ") : ""}`;
    const nameIn = h("input", { type: "text", value: g.name, maxlength: DATA.config.grunts.nameMaxLen, "data-field": "grunt-name" });
    el.appendChild(h("div", { class: "grunt-head" }, UI.gruntIcon(g, 64), h("div", null, h("div", { class: "cand-name" }, (A.isVeteran(g) ? "★ " : "") + A.name(g) + ` · ${A.rankName(g)}`), UI.traitChips(g.traits)),
      h("label", null, " Name ", nameIn),
      h("button", { "data-act": "grunt-rename", onclick: () => { const e = G.State.renameGrunt(g.uid, nameIn.value); UI.toast(e || "Renamed to " + A.name(g) + "."); UI.render(); } }, "Rename")));
    el.appendChild(UI.dollEl({ grunt: g }));   // Slice 4 §F: the paper doll (4 slots, the stash filtered by slot)
    const setsEl = UI.setsEl(G.State.gruntItems(g)); if (setsEl) el.appendChild(setsEl);
    { const ic = UI.injuryChips ? UI.injuryChips(g) : null; if (ic) el.appendChild(h("div", { class: "inj-line" }, "Injuries: ", ic)); }
    const u = G.Battle.unitFromGrunt(g), pk = G.State.gruntPack(g);
    el.appendChild(h("p", { class: "hint", "data-grunt-stats": g.uid }, `HP ${Math.round(u.maxHp)} · Armor ${u.armor} · Speed ${U.fmt1(u.speed)} ·` + (u.accBonus ? ` Accuracy ${u.accBonus >= 0 ? "+" : ""}${u.accBonus} ·` : "") + (u.asPct ? ` Attack Speed ${u.asPct >= 0 ? "+" : ""}${u.asPct}% ·` : "") + ` Jam ${u.weapon.jam} · ${u.weapon.name || G.Items.base(g.weapon).name}: ${U.fmt1(u.weapon.dmg)} dmg / ${U.fmt1(u.weapon.interval)} s, range ${u.weapon.range} m` + (pk ? ` · pack +${(G.Items.base(pk.base).carryKg || 0) + G.Items.affixSum([pk], "carry_kg")} kg squad carry` : "")));
    el.appendChild(h("p", { class: "hint" }, `${g.runs || 0} runs survived · ${g.extractions || 0} extractions · ${g.kills || 0} kills` + (g.tplKey === "grunt" ? ` · promotion at ${DATA.allies.promotion.extractions} extractions` : "")));
    const hist = h("div", { class: "ally-history" }, h("h4", null, "History"));
    for (const line of (g.history || []).slice(0, DATA.allies.history.max)) hist.appendChild(h("div", { class: "hl" }, A.lineText(line)));
    el.appendChild(hist);
    el.appendChild(h("p", { class: "hint" }, "Gear goes with them on every run. If they die in battle, the body stays in that location with the gear on it; loot it before you leave. Items go back to the stash when you unequip them."));
    el.appendChild(h("button", { onclick: () => UI.openPanel("recruit") }, "← Back to the roster"));
  };

  // Memorial Wall (Slice 3 §1, town hotspot `memorial`): every fallen named ally, newest first, no cap, scrolls.
  // Plaque background ui_memorial_plaque (320x96, 12 px border kept when stretched); Veterans get a larger plaque with a star.
  UI.panelMemorial = function (el) {
    const A = G.Allies, list = A.memorial(), M = DATA.allies.memorial, pd = DATA.sprites[M.plaque], url = pd && pd.file ? (G.Assets ? G.Assets.url(DATA.sprites.basePath + pd.file) : DATA.sprites.basePath + pd.file) : null;
    if (!list.length) { el.appendChild(h("p", { class: "hint" }, "No names on the wall yet.")); return; }
    const wall = h("div", { class: "memorial-wall" });
    for (const e of list) {
      const st = url ? `border-image: url(${url}) ${M.border} fill / ${M.border}px stretch;` : "";
      wall.appendChild(h("div", { class: "plaque" + (e.veteran ? " vet" : ""), "data-fallen": e.uid, style: st + `min-height:${Math.round(M.plaqueH * (e.veteran ? M.vetScale : 1))}px;max-width:${Math.round(M.plaqueW * (e.veteran ? M.vetScale : 1) * 1.6)}px` },
        h("div", { class: "pl-name" }, (e.veteran ? "★ " : "") + e.name, h("small", null, " · " + e.rank)),
        UI.traitChips(e.traits),
        h("div", { class: "pl-stats" }, `${e.runs} runs survived · ${e.kills} kills`),
        h("div", { class: "pl-cause", "data-cause": "1" }, e.cause),
        e.last ? h("div", { class: "pl-last" }, "“" + e.last + "”") : null));
    }
    el.appendChild(wall);
  };
  UI.questRow = function (id) {
    const Q = G.Quests, q = Q.def(id), st = Q.status(id), p = Q.progress(id);
    const row = h("div", { class: "quest-row " + st, "data-quest": id }, h("div", null, h("b", null, q.name), h("small", null, ` · ${st}`)), h("div", { class: "hint" }, q.text), h("div", null, Q.objectiveText(id) + (st === "active" ? ` — ${p.have}/${p.need}` : "") + (Q.objectiveHeat(id) ? ` (+${Q.objectiveHeat(id)} Heat when you complete it out there)` : "")), h("div", { class: "hint" }, "Hint: " + q.hint + " · Reward: +1 rep, " + Q.rewardText(q.reward)));
    const acts = h("div");
    if (st === "available") { const why = Q.canTake(id); acts.appendChild(h("button", { disabled: !!why, title: why || "", onclick: () => { const e = Q.take(id); if (e) UI.fail(e); G.State.save(); UI.render(); } }, "Take quest")); }
    if (st === "active") {
      const btn = h("button", { class: "primary", disabled: !Q.canTurnIn(id), onclick: () => {
        const res = G.XP.at({ el: btn }, () => Q.turnIn(id)); if (res.error) return UI.fail(res.error);
        G.State.save(); UI.render();
        const box = h("div", null, h("h2", null, `Quest complete: ${q.name}`), h("p", null, "Reward: " + Q.rewardText(q.reward) + ", +1 rep."));
        if (q.reward.lore) box.appendChild(h("p", { class: "ev-text" }, DATA.lore[q.reward.lore]));
        if (res.repUp) box.appendChild(h("p", { class: "good" }, `${DATA.quests.givers[q.giver].name} reputation L${res.repUp}: ${G.Quests.perk(q.giver, res.repUp).desc}`));
        box.appendChild(h("button", { class: "primary", onclick: () => { UI.closeModal(); } }, "OK"));
        UI.modal(box);
      } }, "Turn in");
      acts.appendChild(btn);
    }
    row.appendChild(acts);
    return row;
  };
  UI.panelGiver = function (el, g) {
    const Q = G.Quests, gd = DATA.quests.givers[g], lvl = Q.repLevel(g), next = Q.perk(g, lvl + 1);
    el.appendChild(h("div", { class: "giver-head" }, SP.icon(gd.portrait, 64), h("div", null, h("b", null, `${gd.name}, ${gd.title}`), h("div", null, `Reputation L${lvl} (${Q.st().rep[g] || 0} rep)`),
      h("div", { class: "hint" }, next ? `Next perk at L${lvl + 1} (${DATA.quests.repLevels[lvl]} rep): ${next.desc}` : "All perks unlocked: " + Object.values(gd.perks || {}).map((p) => p.desc).join(" ")))));
    if (G.Buildings && G.Buildings.giverExtra) G.Buildings.giverExtra(el, g);   // Slice 3 §10a: the Infirmary in Doc Ilse's Tent
    el.appendChild(h("p", { class: "hint" }, `Active quests: ${Q.activeIds().length} / ${DATA.quests.maxActive}`));
    for (const id of Q.ofGiver(g)) el.appendChild(UI.questRow(id));
    if (gd.journal) {
      const lore = Q.ofGiver(g).map((id) => Q.def(id).reward.lore).filter((l) => l && G.state.lore.includes(l));
      el.appendChild(h("h3", null, "Journal"));
      el.appendChild(lore.length ? h("div", null, ...lore.map((l) => h("p", { class: "ev-text" }, DATA.lore[l]))) : h("p", { class: "hint" }, "Nothing yet."));
    }
  };
  UI.panelQuests = function (el) {
    for (const g in DATA.quests.givers) {
      const gd = DATA.quests.givers[g];
      el.appendChild(h("h3", null, SP.icon(gd.portrait, 24), ` ${gd.name} — rep L${G.Quests.repLevel(g)} `, h("button", { onclick: () => UI.openPanel("giver:" + g) }, "Visit")));
      for (const id of G.Quests.ofGiver(g)) el.appendChild(UI.questRow(id));
    }
  };

  UI.tabDeploy = function (el) {
    const s = G.state, lo = s.loadout;
    if (!G.Zones.unlocked(UI.zone)) UI.zone = "a";
    const zd = DATA.zones.list[UI.zone];
    el.appendChild(h("div", { class: "deploy-zone" }, "Zone: ", h("b", null, zd.name), ` (${zd.size}, ${zd.tierLabel}) `, h("button", { onclick: () => UI.openPanel("zones") }, "Change zone")));
    lo.med = lo.med == null ? Math.min(DATA.config.deploy.defaultMed, s.stash.res.med || 0) : Math.min(lo.med, s.stash.res.med || 0);
    if (!G.State.body(lo.bodyId) || !G.State.bodyReady(G.State.body(lo.bodyId))) { const was = G.State.body(lo.bodyId), rb = s.bodies.find((b) => G.State.bodyReady(b)); if (rb) { if (was) UI.bodyFallbackFrom = was.uid; lo.bodyId = rb.uid; } }
    // the body you had picked is restoring, so the panel fell back to a ready one: say so (until you pick one yourself)
    const fbFrom = UI.bodyFallbackFrom && G.State.body(UI.bodyFallbackFrom);
    // Hex retest (B4): once it has restored, the auto-fallback goes back to it (only an auto-fallback: a body you
    // clicked yourself, Basic included, cleared bodyFallbackFrom). The [data-restore] tick re-renders at 0.
    if (fbFrom && G.State.bodyReady(fbFrom) && fbFrom.uid !== lo.bodyId && G.State.body(lo.bodyId)) { lo.bodyId = fbFrom.uid; UI.bodyFallbackFrom = null; }   // fixGrunts() below re-fits the squad
    if (fbFrom && (G.State.bodyReady(fbFrom) || fbFrom.uid === lo.bodyId)) UI.bodyFallbackFrom = null;
    const score = G.State.deployScore();
    // bodies
    const bsec = h("section", { class: "panel" }, h("h3", null, "1 · Body (you wear one; unworn bodies never fight)"));
    const cards = h("div", { class: "cards" });
    for (const b of s.bodies) {
      const ready = G.State.bodyReady(b);
      const c = h("div", { class: "card body-card" + (lo.bodyId === b.uid ? " sel" : "") + (ready ? "" : " disabled"), "data-body": b.uid, onclick: () => {
        if (!G.State.bodyReady(b)) return UI.fail(`${b.name} is still restoring (${U.fmtTime(b.restoreUntil - G.now())} left). Pick a ready body or wait.`);   // never a silent no-op
        UI.bodyFallbackFrom = null; lo.bodyId = b.uid; fixGrunts(); UI.render(); } },
        SP.icon(G.State.bodySprite(b), 40), h("div", { class: "bc-name" }, b.name), h("div", { class: "bc-sub" }, b.cls ? `${DATA.bodies.classes[b.cls].name} / ${DATA.bodies.specialties[b.spec].name}` : "Basic (no timer)"),
        h("div", { class: "bc-sub" }, `Body Lv ${G.Skills.bodyLevel(b)} · cost ${G.State.bodyCost(b)}`), ready ? null : h("div", { class: "bc-timer", "data-restore": b.uid }, "Restoring " + U.fmtTime(b.restoreUntil - G.now())), UI.injuryChips ? UI.injuryChips(b) : null);
      tipOn(c, () => UI.bodyTip(b));
      cards.appendChild(c);
    }
    bsec.appendChild(cards);
    if (UI.bodyFallbackFrom && G.State.body(lo.bodyId)) { const fb = G.State.body(UI.bodyFallbackFrom);
      bsec.appendChild(h("div", { class: "hint warn body-fallback-note" }, `${fb.name} is still restoring (`, h("span", { "data-until": fb.restoreUntil }, U.fmtTime(fb.restoreUntil - G.now())), ` left), so you'd deploy in ${G.State.body(lo.bodyId).name}.`)); }
    el.appendChild(bsec);
    function fixGrunts() {
      const body = G.State.body(lo.bodyId); let left = score - G.State.bodyCost(body);
      lo.grunts = lo.grunts.filter((id) => { const g = s.grunts.find((x) => x.uid === id); if (!g) return false; const c = G.State.gruntTpl(g).deployCost; if (c <= left) { left -= c; return true; } return false; });
    }
    fixGrunts();
    const body = G.State.body(lo.bodyId);
    // squad
    let used = G.State.bodyCost(body);
    for (const id of lo.grunts) { const g = s.grunts.find((x) => x.uid === id); used += G.State.gruntTpl(g).deployCost; }
    const ssec = h("section", { class: "panel", "data-tut": "squad" }, h("h3", null, `2 · Squad — Deployment Score ${used} / ${score}` + (G.Perks.deployScore() ? ` (incl. +${G.Perks.deployScore()} Squad Leader)` : "")));
    for (const g of s.grunts) {
      const on = lo.grunts.includes(g.uid), cost = G.State.gruntTpl(g).deployCost;
      const cb = h("input", { type: "checkbox", checked: on, disabled: !on && used + cost > score, onchange: () => { if (on) lo.grunts = lo.grunts.filter((x) => x !== g.uid); else lo.grunts.push(g.uid); UI.render(); } });
      ssec.appendChild(tipOn(h("label", { class: "grunt-row" }, cb, UI.gruntIcon(g, 32), ` ${G.Allies.name(g)} (${G.Allies.rankName(g)}, cost ${cost}) — `, UI.gruntGearEl(g), "; " + Object.entries(g.skills).map(([k, v]) => DATA.skills[k].name + " " + v.lvl).join(", ") + " ", UI.traitChips(g.traits), UI.injuryChips ? UI.injuryChips(g) : null,
        h("button", { class: "grunt-gear-btn", "data-act": "grunt-doll", "data-grunt": g.uid, title: "Head, body, pack, weapon", onclick: (e) => { e.preventDefault(); e.stopPropagation(); UI.showDoll({ grunt: g }); } }, "Gear…")), `<b>${G.Allies.name(g)}</b>: ${g.rank === "core" ? "goes Critical at 0 HP (can be Domed)" : "dies at 0 HP"}.` + (g.traits.length ? "<br>" + UI.traitTipHtml(g.traits) : "")));
    }
    el.appendChild(ssec);
    // gear
    const gsec = h("section", { class: "panel" }, h("h3", null, "3 · Gear (taken from the Vault — lost if your body dies)"));
    // Slice 4 §F: the body's gear goes through the same paper doll as the Grunts (items stay in the Vault until you deploy)
    { const chips = h("div", { class: "gear-chips" }), worn = Object.values(lo.gear).map((uid) => s.stash.items.find((i) => i.uid === uid)).filter(Boolean);
      for (const slot of ["weapon", "offhand", "weapon2", "offhand2", "head", "body", "backpack"]) {
        const it = lo.gear[slot] && s.stash.items.find((i) => i.uid === lo.gear[slot]);
        if (!it && (slot === "offhand" || slot === "weapon2" || slot === "offhand2")) { if (lo.gear[slot]) delete lo.gear[slot]; continue; }   // Slice 5 §E: only filled extra hands show
        if (lo.gear[slot] && !it) delete lo.gear[slot];
        const chip = h("span", { class: "gear-chip" + (it ? " r-" + it.rarity : " empty"), "data-gslot": slot }, SP.icon(it ? G.Items.sprite(it) : (DATA.sprites["slot_" + (slot === "backpack" ? "pack" : slot)] ? "slot_" + (slot === "backpack" ? "pack" : slot) : "slot_gear"), 24),
          h("span", it ? { style: "color:" + DATA.items.rarities[it.rarity].color } : null, it ? G.Items.name(it) : slot === "weapon" ? `(natural: ${G.Items.base(body.cls ? DATA.bodies.classes[body.cls].naturalWeapon : DATA.bodies.basicBody.naturalWeapon).name})` : slot === "backpack" && DATA.config.deploy.freeBackpack ? "(free School Bag)" : "(none)"));
        chips.appendChild(it ? UI.itemTip(chip, it, worn) : chip);   // SP-014: hover an equipped item for its stats
      }
      chips.appendChild(h("button", { "data-act": "body-doll", onclick: () => { UI.showDoll({ body: true }); } }, "Equip…"));
      gsec.appendChild(chips); }
    // pouch (one select per slot; Vault L2 = 2 slots) + med
    const slots = G.Outpost.pouchSlots(), pk = G.Outpost.pouchMaxKg();
    lo.pouch = (lo.pouch || []).slice(0, slots);
    const entryKg = (p) => (p.uid ? G.Items.weight(s.stash.items.find((i) => i.uid === p.uid) || { base: "nat_fists" }) : p.n * DATA.resources[p.res].kgPerUnit);
    for (let si = 0; si < slots; si++) {
      const otherKg = lo.pouch.reduce((t, p, j) => t + (j === si || !p ? 0 : entryKg(p)), 0), room = pk - otherKg, curP = lo.pouch[si] || {};
      const pouchSel = h("select", { "data-pouch": si, onchange: (e) => { const v = e.target.value; lo.pouch[si] = !v ? null : v.startsWith("res:") ? { res: v.split(":")[1], n: +v.split(":")[2] } : { uid: v }; lo.pouch = lo.pouch.filter(Boolean); UI.render(); } });
      pouchSel.appendChild(h("option", { value: "" }, "(empty)"));
      const taken = lo.pouch.filter((p, j) => p && j !== si).map((p) => p.uid).filter(Boolean);
      for (const it of s.stash.items.filter((i) => !G.Items.isQuest(i) && !G.Workbench.isAmmo(i) && G.Items.weight(i) <= room + 1e-9 && !Object.values(lo.gear).includes(i.uid) && !taken.includes(i.uid))) pouchSel.appendChild(h("option", { value: it.uid, selected: curP.uid === it.uid }, `${G.Items.name(it)} (${G.Items.weight(it)} kg)`));
      for (const k in DATA.resources) { if (DATA.resources[k].hidden || DATA.resources[k].bagOnly) continue; const n = Math.min(s.stash.res[k] || 0, Math.floor((room + 1e-9) / DATA.resources[k].kgPerUnit)); if (n > 0) pouchSel.appendChild(h("option", { value: `res:${k}:${n}`, selected: curP.res === k }, `${n} × ${DATA.resources[k].name}`)); }
      gsec.appendChild(h("div", { class: "gear-row" }, h("span", { class: "slot" }, `Secure Pouch ${slots > 1 ? si + 1 : ""}`), pouchSel, si === 0 ? h("small", null, ` ${slots} slot${slots > 1 ? "s" : ""}, ${pk} kg total — survives death`) : null));
    }
    // updates in place (no full re-render): a blur-triggered re-render would swallow the click on "Start"
    const medIn = h("input", { type: "number", min: 0, max: s.stash.res.med || 0, value: lo.med, oninput: (e) => { lo.med = U.clamp(+e.target.value || 0, 0, s.stash.res.med || 0); updCarry(); G.State.save(); } });
    gsec.appendChild(h("div", { class: "gear-row", "data-tut": "med" }, h("span", { class: "slot" }, "Med Supplies"), medIn, h("small", null, ` of ${s.stash.res.med || 0} in the stockpile (${DATA.resources.med.kgPerUnit} kg each, carried in the bag)`)));
    // Slice 3 §9 ammo: one type (or none) + how many packs to carry; 1 pack is used at the start of each battle
    { const W = G.Workbench, types = W.ammoTypes().filter((k) => W.ammoCount(k) > 0);
      if (lo.ammo && (!lo.ammo.base || W.ammoCount(lo.ammo.base) <= 0)) lo.ammo = null;
      if (lo.ammo) lo.ammo.n = U.clamp(lo.ammo.n || 0, 1, W.ammoCount(lo.ammo.base));
      const aSel = h("select", { "data-ammo": "type", onchange: (e) => { const v = e.target.value; lo.ammo = v ? { base: v, n: Math.min(3, W.ammoCount(v)) } : null; UI.render(); } },
        h("option", { value: "" }, types.length ? "(none)" : "(none: craft packs at the Workbench)"), ...types.map((k) => h("option", { value: k, selected: lo.ammo && lo.ammo.base === k }, `${G.Items.base(k).name} (${W.ammoCount(k)} in the stash): ${G.Items.base(k).desc}`)));
      const aN = lo.ammo ? h("input", { type: "number", "data-ammo": "n", min: 1, max: W.ammoCount(lo.ammo.base), value: lo.ammo.n, oninput: (e) => { lo.ammo.n = U.clamp(+e.target.value || 1, 1, W.ammoCount(lo.ammo.base)); updCarry(); G.State.save(); } }) : null;
      gsec.appendChild(h("div", { class: "gear-row", "data-row": "ammo" }, h("span", { class: "slot" }, "Ammo"), aSel, aN ? " packs: " : null, aN, h("small", null, ` 1 pack per battle, every gun in the squad; ${G.Items.base(W.ammoTypes()[0]).weight} kg each; leftovers come back if you extract`))); }
    // carry preview
    const carryLine = h("div", { "data-tut": "carry" });
    function updCarry() {
      // Hex beginning pass: the same run pieces + capacity code as the expedition (G.Exp.loadoutPreview), incl. the default backpack
      const pv = G.Exp.loadoutPreview(lo), squad = pv.run.squad, cap = pv.cap, kg = pv.kg, team = pv.team;
      carryLine.textContent = `Carry: ${U.fmt1(kg)} / ${U.fmt1(cap)} kg (${DATA.config.carry.baseKg} base + ${DATA.config.carry.kgPerHaulingLevel}×Hauling ${G.Skills.level(body.skills, "hauling")} + backpack/affixes${pv.freePack ? " (free School Bag)" : ""}${body.quirks.includes("light_frame") ? " − 5 Light Frame" : ""}` + (squad.length ? ` + ${U.fmt1(team)} from ${squad.length} teammate${squad.length > 1 ? "s" : ""}: ${DATA.config.carry.perTeammateKg} each + their packs` : "") + ")";
    }
    updCarry();
    gsec.appendChild(carryLine);
    const loSets = UI.setsEl(Object.values(lo.gear).map((uid) => s.stash.items.find((i) => i.uid === uid)).filter(Boolean)); if (loSets) gsec.appendChild(loSets);
    el.appendChild(gsec);
    const err = G.Exp.validateLoadout(lo);
    // Vixie (Slice 4): no free weapon; unarmed units fight with bare fists, and Deploy asks first
    const unarmed = G.Exp.unarmedUnits(lo);
    if (unarmed.length) el.appendChild(h("p", { class: "hint warn unarmed-note", "data-note": "unarmed" }, `${UI.unarmedText(unarmed)} Bare fists are weak (${DATA.config.unarmed.dmg} damage).`));
    const go = () => { const e = G.Exp.start(lo, undefined, UI.zone); if (e) UI.fail(e); else UI.panel = null; UI.render(); };
    el.appendChild(h("div", { class: "deploy-go" }, h("button", { class: "primary big", "data-act": "deploy", disabled: !!err, onclick: () => (unarmed.length ? UI.confirmUnarmed(unarmed, go) : go()) }, `Deploy to ${zd.name} ▶`), err ? h("span", { class: "warn" }, " " + err) : null,
      !s.tutorialDone ? h("p", { class: "hint" }, "Tutorial: you start in a level-1 Basic body with 2 Grunts. Find the working cryo pod (Journal: Main Objective) to claim your first specialized human body. Dying here costs nothing but what you carry — the Basic body has no restore timer.") : null));
    G.State.save();
  };

  // Vixie (Slice 4): "<Name> is unarmed." / "A and B are unarmed."
  UI.unarmedText = (names) => (names.length === 1 ? `${names[0]} is unarmed.` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are unarmed.`);
  // the unarmed deploy confirm: the list, Deploy / Cancel (44 px tap targets)
  UI.confirmUnarmed = function (names, onDeploy) {
    const close = () => { $("#modal-root").innerHTML = ""; };
    UI.modal([h("h3", {}, "Unarmed"), h("p", {}, `${UI.unarmedText(names)} Deploy anyway?`),
      h("ul", { class: "unarmed-list" }, names.map((n) => h("li", {}, `${n}: bare fists`))),
      h("div", { class: "confirm-row" },
        h("button", { class: "primary confirm-btn", "data-act": "unarmed-deploy", onclick: () => { close(); onDeploy(); } }, "Deploy"),
        h("button", { class: "confirm-btn", "data-act": "unarmed-cancel", onclick: close }, "Cancel"))], "confirm-unarmed");
  };

  // Slice 3 §2: a body's actives, "[1] Called Shot (6 s) · [2] Frag Grenade (18 s)"
  UI.ablText = (b) => G.Abilities ? G.Abilities.idsFor(b).map((id, i) => { const d = G.Abilities.def(id); return `[${DATA.abilities.hotkeys[i]}] ${d.name} (${d.cooldownSec} s${b.ablAuto && b.ablAuto[id] === false ? ", manual" : ""})`; }).join(" · ") : "";
  UI.bodyTip = function (b) {
    let t = `<b>${G.State.bodyTitle(b)}</b><br>Family ${DATA.bodies.families[b.family].name} · skill cap ${DATA.bodies.families[b.family].skillCap} · Body Lv ${G.Skills.bodyLevel(b)}<br>`;
    if (b.spec) t += `<i>${DATA.bodies.specialties[b.spec].name}: ${DATA.bodies.specialties[b.spec].desc}</i><br>`;
    if (UI.ablText(b)) t += `Abilities: ${UI.ablText(b)}<br>`;
    if (b.quirks.length) t += "Quirks: " + b.quirks.map((q) => `${DATA.bodies.quirks[q].name} (${DATA.bodies.quirks[q].desc})`).join("; ") + "<br>";
    t += Object.entries(b.skills).filter(([, v]) => v.lvl > 1).map(([k, v]) => `${DATA.skills[k].name} ${v.lvl}`).join(", ") || "All body skills 1";
    const ms = G.State.restoreMs(b); t += G.Difficulty && G.Difficulty.isPermadeath(G.state, b) ? "<br>Ragnarök: if killed, it's gone for good" : `<br>Restore time if killed: ${ms ? U.fmtTime(ms) : "none"}`;
    return t;
  };

  UI.tabVault = function (el) {
    const s = G.state, O = G.Outpost, over = O.stashOver();
    const p = h("section", { class: "panel" }, h("h3", null, `Stash — ${O.stashCount()} / ${O.stashCap()} gear (quest items don't count; ${TL() ? "tap" : "hover"} for stats)`));
    if (over > 0) p.appendChild(h("p", { class: "warn" }, `Over the limit by ${over}. Discard gear before your next deploy.`));
    const sorted = s.stash.items.slice().sort((a, b) => (G.Items.isQuest(b) - G.Items.isQuest(a)) || G.Items.base(a.base).slot.localeCompare(G.Items.base(b.base).slot) || b.ilvl - a.ilvl);
    for (const it of sorted) p.appendChild(UI.itemEl(it, G.Items.isQuest(it) ? [] : [{ label: "Discard", fn: () => { if (!confirm(`Discard ${G.Items.name(it)}? It's gone for good.`)) return; s.stash.items = s.stash.items.filter((x) => x !== it); G.State.save(); UI.render(); } }], G.Items.isQuest(it) ? "quest item" : G.Items.base(it.base).slot));
    if (!sorted.length) p.appendChild(h("p", { class: "hint" }, "Empty. Extract with loot to fill it."));
    el.appendChild(p);
    el.appendChild(h("section", { class: "panel" }, h("h3", null, "Secure Pouch"), h("p", null, `${O.pouchSlots()} slot${O.pouchSlots() > 1 ? "s" : ""}, ${O.pouchMaxKg()} kg total. Whatever is in it survives death. Quest items can't go in it.`)));
    // upgrade
    const st = O.st("vault"), nl = O.nextLevel("vault"), up = h("section", { class: "panel vault-upgrade" }, h("h3", null, `Vault L${st.level}`));
    if (st.upgrading) { const L = O.def("vault").levels[st.upgrading.to]; up.appendChild(h("p", null, `Upgrading to L${st.upgrading.to}: `, h("b", { "data-timer": "vault" }, U.fmtTime(O.remainingMs("vault"))), " left (keeps running while the game is closed)")); up.appendChild(bar(1 - O.remainingMs("vault") / (L.buildSec * 1000), "#b08a3a", "")); }
    else if (nl) {
      const L = O.def("vault").levels[nl], c = O.cost("vault", nl), why = O.canUpgrade("vault");
      up.appendChild(h("p", null, `Upgrade to L${nl}: ${L.desc}. Build time ${U.fmtTime(L.buildSec * 1000)}.`));
      up.appendChild(h("p", null, "Cost: ", ...Object.keys(c).map((r) => h("span", { class: (s.stash.res[r] || 0) >= c[r] ? "" : "bad" }, SP.icon(DATA.resources[r].sprite, 16), ` ${c[r]} ${DATA.resources[r].name} (have ${s.stash.res[r] || 0})  `))));
      up.appendChild(h("button", { class: "primary", "data-act": "vault-upgrade", disabled: !!why, onclick: () => { const e = O.startUpgrade("vault"); if (e) UI.fail(e); G.State.save(); UI.render(); } }, `Build Vault L${nl}`));
      if (why) up.appendChild(h("span", { class: "warn" }, " " + why));
      up.appendChild(h("p", { class: "hint" }, "Paid from the stockpile when you start. Can't be cancelled."));
    } else up.appendChild(h("p", null, "Max level for now. " + (O.def("vault").levels[st.level].desc || "")));
    el.appendChild(up);
  };

  UI.tabBodies = function (el) {
    const s = G.state;
    for (const b of s.bodies) {
      const p = h("section", { class: "panel" }, h("h3", null, SP.icon(G.State.bodySprite(b), 28), " " + G.State.bodyTitle(b)));
      p.appendChild(h("div", null, `Family: ${DATA.bodies.families[b.family].name} · Body Lv ${G.Skills.bodyLevel(b)} (${Math.round(b.bodyXp)} XP) · Restore: ${G.State.bodyReady(b) ? "ready" : U.fmtTime(b.restoreUntil - G.now())}`));
      if (G.Injuries && G.Injuries.of(b).length) { const u = G.Battle.unitFromBody(b, {}, {}); p.appendChild(h("div", { class: "inj-line" }, "Injuries: ", UI.injuryChips(b), h("small", null, ` HP ${Math.round(u.maxHp)} · Speed ${U.fmt1(u.speed)} · Accuracy ${u.accBonus >= 0 ? "+" : ""}${u.accBonus} · Attack Speed ${u.asPct >= 0 ? "+" : ""}${u.asPct}%`))); }
      if (b.spec) p.appendChild(h("div", null, `Specialty — ${DATA.bodies.specialties[b.spec].name}: ${DATA.bodies.specialties[b.spec].desc}`));
      if (UI.ablText(b)) p.appendChild(h("div", { "data-abilities": b.uid }, "Abilities: " + UI.ablText(b)));
      if (b.quirks.length) p.appendChild(h("div", null, "Quirks: " + b.quirks.map((q) => `${DATA.bodies.quirks[q].name} — ${DATA.bodies.quirks[q].desc}`).join("; ")));
      p.appendChild(UI.skillTable(b.skills, "body", DATA.bodies.families[b.family].skillCap, DATA.bodies.families[b.family].xpMult));
      el.appendChild(p);
    }
  };

  UI.skillTable = function (skills, kind, cap, xpMult) {
    const t = h("div", { class: "skill-grid" });
    for (const k in DATA.skills) {
      if (DATA.skills[k].kind !== kind) continue;
      const rec = skills[k] || { lvl: 1, xp: 0 }, need = G.Skills.xpToNext(rec.lvl, kind, xpMult);
      const row = h("div", { class: "skill-row" + (DATA.skills[k].active ? "" : " inactive") }, SP.icon("skill_" + k, 18), h("span", { class: "sk-name" }, DATA.skills[k].name), h("span", { class: "sk-lvl" }, rec.lvl + (cap ? "/" + cap : "")), bar(rec.xp / need, "#6a8cff", `${Math.floor(rec.xp)}/${need}`));
      if (!DATA.skills[k].active) row.appendChild(h("small", { class: "sk-unused" }, "not used yet"));
      tipOn(row, DATA.skills[k].desc + (DATA.skills[k].active ? "" : "<br><i>Not used yet.</i>"));
      t.appendChild(row);
    }
    return t;
  };

  // Slice 3 §3: "Perk pick ready" toast; clicking it opens the Character screen (at the outpost; on a run it just informs)
  UI.perkReadyToast = function () {
    const t = $("#toast"), run = !!G.state.run;
    UI.toast(run ? "Perk pick ready (spend it at the outpost)" : `Perk pick ready: ${TL() ? "tap" : "click"} to open the Character screen`);
    t.onclick = run ? null : () => { t.onclick = null; t.classList.remove("show"); UI.openPanel("character"); };
    t.classList.toggle("clickable", !run);
  };
  UI.tabSkills = (el) => UI.panelCharacter(el);
  // Slice 3 §3 Character screen: level + XP bar + picks, Mind skills (kept forever) | Body skills (selected body only), perks
  UI.panelCharacter = function (el) {
    const s = G.state, P = G.Perks, L = DATA.config.leveling, lvl = G.Skills.charLevel(s);
    const xpAt = (n) => n * n * L.charLevelDivisor, cur = xpAt(lvl), next = xpAt(lvl + 1), u = P.unspent(), np = P.nextPickLevel();
    el.appendChild(h("section", { class: "panel char-head" }, h("h3", null, `Character Lv ${lvl}`),
      bar((s.lifetimeXp - cur) / (next - cur), "#c9a227", `${Math.floor(s.lifetimeXp - cur)} / ${next - cur} XP to Lv ${lvl + 1}`),
      h("p", null, `Next perk pick at Lv ${np.normal}` + (np.keystone ? ` · next Keystone at Lv ${np.keystone}` : "") + ` · unspent: `, h("b", { "data-unspent": u.normal + u.keystone }, `${u.normal} perk${u.normal === 1 ? "" : "s"}, ${u.keystone} Keystone${u.keystone === 1 ? "" : "s"}`))));
    // skills: two labelled columns
    const bodies = s.bodies; UI.charBody = UI.charBody && bodies.some((b) => b.uid === UI.charBody) ? UI.charBody : (s.loadout.bodyId && bodies.some((b) => b.uid === s.loadout.bodyId) ? s.loadout.bodyId : bodies[0].uid);
    const b = bodies.find((x) => x.uid === UI.charBody), fam = DATA.bodies.families[b.family];
    const pickB = h("select", { "data-body-pick": "1", onchange: (e) => { UI.charBody = e.target.value; UI.render(); } }, ...bodies.map((x) => h("option", { value: x.uid, selected: x.uid === b.uid }, G.State.bodyTitle(x))));
    el.appendChild(h("div", { class: "char-cols" },
      h("section", { class: "panel char-col", "data-col": "mind" }, h("h3", null, "Mind skills (kept forever)"), h("p", { class: "hint" }, "Your consciousness. Never lost."), UI.skillTable(s.mind.skills, "mind", 99)),
      h("section", { class: "panel char-col", "data-col": "body" }, h("h3", null, "Body skills (this body only)"), h("p", { class: "hint" }, "Belong to this body. A new body brings its own."),
        h("div", null, "Body: ", pickB), h("p", { class: "hint" }, `Body Lv ${G.Skills.bodyLevel(b)} / ${fam.bodyLevelCap} · skill cap ${fam.skillCap}`), UI.skillTable(b.skills, "body", fam.skillCap, fam.xpMult))));
    // perks: owned, then the picks as cards (Keystones locked until Lv 10)
    const ps = h("section", { class: "panel perks" }, h("h3", null, "Perks"));
    const owned = Object.keys(DATA.perks.list).filter((id) => P.rank(id));
    ps.appendChild(h("div", { class: "perk-owned" }, owned.length ? owned.map((id) => h("span", { class: "perk-chip", "data-owned": id, title: P.def(id).desc }, SP.icon(P.def(id).icon, 20), ` ${P.def(id).name}` + (P.def(id).ranks > 1 ? ` ${P.rank(id)}/${P.def(id).ranks}` : ""))) : h("i", null, "No perks yet.")));
    const cards = h("div", { class: "perk-cards" });
    for (const id in DATA.perks.list) {
      const d = P.def(id), why = P.canPick(id), locked = d.keystone && lvl < DATA.perks.keystoneLevels[0], maxed = P.rank(id) >= d.ranks;
      if (maxed) continue;
      cards.appendChild(h("div", { class: "perk-card" + (d.keystone ? " keystone" : "") + (locked ? " locked" : "") + (why ? " off" : ""), "data-perk": id },
        SP.icon(d.icon, 32), h("div", { class: "pc-name" }, d.name + (d.keystone ? " · Keystone" : d.ranks > 1 ? ` · rank ${P.rank(id) + 1}/${d.ranks}` : "")), h("div", { class: "hint" }, d.desc),
        h("button", { class: "primary", "data-act": "perk-pick", disabled: !!why, title: why || "", onclick: () => { const e = P.pick(id); if (e) UI.fail(e); else { G.Sfx.play("sfx_level_up"); UI.toast(d.name + " learned."); } UI.render(); } }, locked ? `Locked (Lv ${DATA.perks.keystoneLevels[0]})` : "Pick")));
    }
    ps.appendChild(cards);
    ps.appendChild(h("p", { class: "hint" }, `Picks at every ${DATA.perks.pickEvery} levels, Keystones at Lv ${DATA.perks.keystoneLevels.join(" and ")}. Picked at the outpost only; no respec. Perks belong to you, so they work in every body; "your body" ones only on the body you wear.`));
    el.appendChild(ps);
  };


  UI.tabCodex = function (el) {
    const s = G.state;
    const p = h("section", { class: "panel" }, h("h3", null, `Lore found: ${s.lore.length} / ${Object.keys(DATA.lore).length}`));
    for (const id of s.lore) p.appendChild(h("p", null, DATA.lore[id]));
    p.appendChild(h("h3", null, "World"));
    p.appendChild(h("p", null, `Region: ${DATA.map.regionName}. Hollow Creek: ${s.world.hollow_creek}.`));
    if (G.Rivals) { const rs = G.Rivals.st(); p.appendChild(h("h3", null, "Rivals")); p.appendChild(h("p", { "data-codex": "rivals" }, `Rivals defeated: ${rs.defeated} · met: ${rs.met} · your echoes on record: ${rs.echoes.length}` + (G.Rivals.echoesOk() ? "" : ` (echoes of your own squads start showing up from run ${DATA.rivals.echoes.fromRun})`))); }
    el.appendChild(p);
  };

  // Slice 4 §A1: Old Marta. First talk: her 3 help choices (the tutorial mode). After that: a short line.
  // Slice 4 §B: the Journal (outpost + run top bar): the one main objective, then every accepted side quest with progress
  UI.showJournal = function () {
    const Mn = G.Main, Q = G.Quests, box = h("div", { class: "journal", "data-panel": "journal" }, h("h2", null, "Journal"));
    box.appendChild(h("h3", null, "Main Objective"));
    const cur = Mn && Mn.current();
    if (cur) {
      const q = Mn.def(cur), where = Mn.whereText(cur);
      box.appendChild(h("div", { class: "jr-main", "data-main": cur }, h("b", null, q.name), h("p", null, q.objective),
        where ? h("p", { class: "hint", "data-where": q.where }, "📍 " + where) : q.where ? h("p", { class: "hint" }, "Location not scouted yet.") : null,
        q.placeholder ? h("p", { class: "hint" }, "More to come.") : null));
    } else box.appendChild(h("p", { class: "hint" }, Mn && Mn.status("m1") === "locked" ? `Talk to ${DATA.tutorial.marta.name} by the trapdoor.` : "Nothing right now."));
    // Slice 5 §I: relocating the settlement, offered once the gate's main quest is done (data/prestige.js)
    if (G.Prestige && DATA.prestige.enabled && G.Prestige.nextAct() && (!DATA.prestige.gate.main || (Mn && Mn.status(DATA.prestige.gate.main) === "done"))) {
      const PT = DATA.prestige.text, why = G.Prestige.gateWhy();
      box.appendChild(h("h3", null, PT.title));
      box.appendChild(h("div", { class: "jr-prestige", "data-prestige": why ? "locked" : "ready" }, h("p", null, PT.offer),
        why ? h("p", { class: "hint" }, why) : h("button", { "data-act": "relocate", onclick: () => UI.showRelocate() }, `${PT.title}…`)));
    }
    box.appendChild(h("h3", null, "Side Quests"));
    const ids = Q.activeIds();
    if (!ids.length) box.appendChild(h("p", { class: "hint" }, "None accepted. Dunn and Doc Ilse have work."));
    for (const id of ids) {
      const q = Q.def(id), p = Q.progress(id), gd = DATA.quests.givers[q.giver];
      box.appendChild(h("div", { class: "jr-side", "data-quest": id }, h("b", null, q.name), h("small", null, ` · ${gd ? gd.name : q.giver}`),
        h("div", null, Q.objectiveText(id) + ` (${p.have}/${p.need})`)));
    }
    box.appendChild(h("button", { class: "primary", onclick: () => UI.closeModal() }, "Close"));
    UI.modal(box);
  };
  // Slice 5 §I: the relocation confirm: what you keep, what resets, the one item you take along
  UI.showRelocate = function () {
    const P = G.Prestige, D = DATA.prestige, T = D.text, next = P.nextAct(); if (!next) return;
    const rk = Object.keys(DATA.items.rarities), items = P.keepable().slice().sort((a, b) => rk.indexOf(b.rarity) - rk.indexOf(a.rarity) || (b.ilvl || 0) - (a.ilvl || 0));
    const sel = h("select", { "data-keep": "item" }, h("option", { value: "" }, "Nothing"), ...items.map((it) => h("option", { value: it.uid }, `${G.Items.name(it)} (${DATA.items.rarities[it.rarity].name}, i${it.ilvl || 1})`)));
    UI.modal(h("div", { class: "relocate", "data-panel": "relocate" }, h("h2", null, `${T.title}: ${next.homeName}`), h("p", null, T.offer),
      h("p", null, T.keepsLine.replace("{xp}", (P.st().xpPct || 0) + D.bonus.xpPct)), h("p", { class: "hint" }, T.resetsLine),
      h("label", null, "Take along: ", sel),
      h("div", { class: "confirm-row" }, h("button", { class: "primary confirm-btn danger", "data-act": "relocate-confirm", onclick: () => {
        const r = P.relocate(sel.value || null); if (r.error) return UI.fail(r.error);
        UI.closeModal(); UI.toast(T.done.replace("{home}", r.act.homeName)); UI.render(); } }, T.confirm),
        h("button", { class: "confirm-btn", onclick: () => UI.closeModal() }, "Not yet"))));
  };
  UI.showMarta = function (after) {
    const M = DATA.tutorial.marta, first = G.Tut.needsMarta();
    const box = h("div", { class: "marta", "data-panel": "marta" }, h("div", { class: "marta-talk" }, SP.icon(M.portrait, 64),
      h("div", null, h("h2", null, M.name, h("small", null, " · " + M.title)), h("p", null, first ? M.greeting : M.talkAgain))));
    const questBox = () => G.Main && G.Main.status("m1") === "active" ? h("div", { class: "marta-quest", "data-main": "m1" }, h("b", null, "Main quest: " + DATA.main.quests.m1.name), h("p", { class: "hint" }, DATA.main.quests.m1.objective),
      h("p", null, `“${DATA.main.martaHint}”`)) : null;   // Slice 4 §B: Marta gives Main 1 with her hint
    const done = (msg) => { UI.closeModal(); if (msg) UI.toast(`${M.name}: "${msg}"`); UI.render(); if (after) after(); };
    if (first) {
      const ch = h("div", { class: "marta-choices" });
      for (const c of M.choices) ch.appendChild(h("button", { "data-marta-choice": c.mode, onclick: () => {
        G.Tut.setMode(c.mode); if (G.Main) G.Main.onMartaTalked(); G.State.save();
        const q = questBox(); if (!q) return done(M.afterChoice[c.mode]);
        UI.modal(h("div", { class: "marta", "data-panel": "marta" }, h("div", { class: "marta-talk" }, SP.icon(M.portrait, 64), h("div", null, h("h2", null, M.name), h("p", null, M.afterChoice[c.mode]))), q,
          h("button", { class: "primary", "data-act": "marta-ok", onclick: () => done() }, "Got it")));
      } }, `“${c.label}”`));
      box.appendChild(ch);
    } else { const q = questBox(); if (q) box.appendChild(q); box.appendChild(h("button", { class: "primary", onclick: () => done() }, "Bye")); }
    UI.modal(box);
  };

  // ---------- run result / body offer ----------
  // Slice 3 §8 / §2: Settings panel (audio sliders + mute, aim mode). Saved with the game (state.settings).
  UI.showSettings = function () {
    const st = G.state.settings, box = h("div", { class: "settings", "data-panel": "settings" }, h("h2", null, "Settings"));
    const slider = (k, label) => { const val = h("b", null, Math.round(st[k] * 100) + "%");
      return h("div", { class: "set-row" }, h("label", null, label), h("input", { type: "range", min: 0, max: 100, value: Math.round(st[k] * 100), "data-set": k,
        oninput: (e) => { st[k] = +e.target.value / 100; val.textContent = e.target.value + "%"; G.Sfx.applySettings(); }, onchange: () => { G.State.save(); G.Sfx.play("sfx_ui_click"); } }), val); };
    box.appendChild(h("h3", null, "Audio"));
    box.appendChild(slider("master", "Master")); box.appendChild(slider("sfx", "Sound effects")); box.appendChild(slider("ambient", "Ambient")); box.appendChild(slider("music", "Music"));
    box.appendChild(h("div", { class: "set-row" }, h("label", null, h("input", { type: "checkbox", "data-set": "mute", checked: !!st.mute, onchange: (e) => { st.mute = e.target.checked; G.Sfx.applySettings(); G.State.save(); syncAudio(); } }), " Mute")));
    // Megan: music starts muted on every visit (G.Music.muted, never saved). Checked = music is audible; turning it on
    // lifts a saved Mute, the same as the title's sound button (G.Music.setOn)
    if (G.Music) box.appendChild(h("div", { class: "set-row" }, h("label", null, h("input", { type: "checkbox", "data-set": "music-on", checked: !G.Music.muted && !st.mute, onchange: (e) => { G.Music.setOn(e.target.checked); syncAudio(); } }), " Music on (starts off each visit)")));
    function syncAudio() { const m = box.querySelector("[data-set=mute]"), on = box.querySelector("[data-set=music-on]"); if (m) m.checked = !!st.mute; if (on) on.checked = !G.Music.muted && !st.mute; }
    box.appendChild(h("h3", null, "Battle"));
    const aim = h("select", { "data-set": "aimMode", onchange: (e) => { st.aimMode = e.target.value; G.State.save(); } });
    for (const [v, l] of [["slowmo", "Slow-mo 25% while aiming"], ["pause", "Full pause while aiming"]]) aim.appendChild(h("option", { value: v, selected: st.aimMode === v }, l));
    box.appendChild(h("div", { class: "set-row" }, h("label", null, "Aim mode"), aim));
    // SP-100 (Megan): Graphics 3D / Low (2D) + the kill cam. Their own storage key (js/gfx.js), never the save's game state
    if (G.Gfx) {
      const Gx = G.Gfx, gsel = h("select", { "data-set": "graphics", onchange: (e) => { Gx.set("graphics", e.target.value); gst.textContent = Gx.status(); G.Sfx.play("sfx_ui_click"); } });
      for (const [v, l] of [["auto", "Auto (3D; 2D on a weak device)"], ["3d", "3D"], ["low", "Low (2D)"]]) gsel.appendChild(h("option", { value: v, selected: Gx.graphics() === v }, l));
      box.appendChild(h("div", { class: "set-row" }, h("label", null, "Graphics"), gsel));
      box.appendChild(h("div", { class: "set-row" }, h("label", null, h("input", { type: "checkbox", "data-set": "killcam", checked: Gx.killcam(), onchange: (e) => { Gx.set("killcam", e.target.checked); } }), " Kill cam on every death (3D; a tap skips one)")));
      const gst = h("p", { class: "hint", "data-note": "graphics" }, Gx.status()); box.appendChild(gst);
    }
    // Slice 5 §B (Vixie): the physics d20 for out-of-combat checks; off = outcomes at once, no die, no dice sounds
    box.appendChild(h("h3", null, "Dice"));
    box.appendChild(h("div", { class: "set-row" }, h("label", null, h("input", { type: "checkbox", "data-set": "showDice", checked: st.showDice !== false, onchange: (e) => { st.showDice = e.target.checked; G.State.save(); } }), " Show dice rolls")));
    // Slice 4 §A: tutorial level (Marta's choice) + Replay tutorial (re-arms every step for the next run)
    if (G.Tut) {
      box.appendChild(h("h3", null, "Gameplay"));
      const tm = h("select", { "data-set": "tutorial", onchange: (e) => { G.Tut.setMode(e.target.value); G.State.save(); } });
      for (const [v, l] of [["full", "Full tutorial"], ["tips", "Tips when they come up"], ["none", "Off"]]) tm.appendChild(h("option", { value: v, selected: (G.Tut.mode() || "full") === v }, l));
      box.appendChild(h("div", { class: "set-row" }, h("label", null, "Tutorial"), tm));
      box.appendChild(h("div", { class: "set-row" }, h("label", null, ""), h("button", { "data-act": "replay-tutorial", onclick: () => { G.Tut.replay(); G.State.save(); tm.value = G.Tut.mode(); UI.toast("Tutorial re-armed: every step shows again."); } }, "Replay tutorial")));
    }
    box.appendChild(h("p", { class: "hint" }, "Audio starts after your first click. Missing sound files are skipped silently."));
    box.appendChild(h("button", { class: "primary", onclick: () => { UI.closeModal(); UI.render(); } }, "Done"));
    UI.modal(box);
  };

  UI.showRunResult = function () {
    const s = G.state, lr = s.lastResult;
    if (UI._resultSfx !== lr) { UI._resultSfx = lr; G.Sfx.play(lr.kind === "extracted" ? "sfx_extract" : "sfx_player_death"); }
    const box = h("div");
    if (lr.kind === "extracted") {
      box.appendChild(h("h2", { class: "good" }, "EXTRACTED"));
      if (lr.marta) box.appendChild(h("p", { class: "marta-line", "data-marta": "not-dead" }, SP.icon(DATA.tutorial.marta.portrait, 24), ` ${DATA.tutorial.marta.name}: "${lr.marta}"`));   // Slice 4 §A1
      box.appendChild(h("p", null, `Moves ${lr.moves} · final Heat ${lr.heat} · battles ${lr.stats.battles} · kills ${lr.stats.kills}`));
      box.appendChild(h("p", null, "Brought home: " + (lr.items.map((i) => `${i.name} (${DATA.items.rarities[i.rarity].name} i${i.ilvl})`).join(", ") || "no new items")));
      const rs = Object.entries(lr.res).filter(([, n]) => n).map(([k, n]) => `${n} ${DATA.items.resources[k].name}`); if (rs.length) box.appendChild(h("p", null, "Resources: " + rs.join(", ")));
      if (lr.grunts.length) box.appendChild(h("p", null, `New recruits: ${lr.grunts.join(", ")}`));
      if (lr.pets && lr.pets.length) box.appendChild(h("p", { class: "good", "data-result": "pets" }, `It followed you home: ${lr.pets.join(", ")}. Recruit it at the Recruitment lot.`));   // Slice 5 §F
      if (lr.retryToken) box.appendChild(h("p", { class: "good", "data-result": "retry-token" }, `+${lr.retryToken.got} ${DATA.config.retryTokens.name.toLowerCase()} for a hot extraction (${lr.retryToken.held}/${DATA.config.retryTokens.cap} held).`));   // Slice 5 §K
      if (lr.converted && Object.keys(lr.converted).length) box.appendChild(h("p", { class: "hint" }, Object.entries(lr.converted).map(([k, n]) => `${n} ${DATA.resources[k].name} → ${DATA.resources[DATA.resources[k].convertOnExtract.to].name}`).join(", ")));
      if ((lr.bounties || []).length) box.appendChild(h("p", { class: "good" }, `Bounty paid: ${lr.bounties.join(" · ")}`));
      if (lr.bodies.length) box.appendChild(h("p", null, `New bodies: ${lr.bodies.join("; ")}`));
      // Slice 3 §1: an ally who already had a nickname earned another: Keep / Take the new one
      for (const o of (s.nickOffers || []).filter((x) => (lr.nickOffers || []).includes(x.uid))) {
        const g = s.grunts.find((x) => x.uid === o.uid); if (!g) continue;
        box.appendChild(h("div", { class: "nick-offer", "data-nick": o.uid }, `${G.Allies.name(g)} earned a new nickname: "${o.nick}" (${DATA.allies.nicknames[o.trig].desc.split(":")[0].toLowerCase()}). `,
          h("button", { "data-act": "nick-keep", onclick: () => { G.Allies.resolveOffer(o.uid, false); UI.render(); } }, `Keep "${g.nickname}"`),
          h("button", { class: "primary", "data-act": "nick-take", onclick: () => { G.Allies.resolveOffer(o.uid, true); UI.render(); } }, `Take "${o.nick}"`)));
      }
    } else {
      box.appendChild(h("h2", { class: "bad" }, "YOUR BODY DIED"));
      box.appendChild(h("p", null, lr.why));
      if (lr.standard) {   // Slice 4 §H: Standard
        const c = lr.standard, rs = (o) => Object.keys(o).map((k) => `${o[k]} ${DATA.items.resources[k] ? DATA.items.resources[k].name : k}`);
        box.appendChild(h("p", { "data-death": "standard" }, `Standard: your equipped gear came home${c.keptGear.length ? " (" + c.keptGear.join(", ") + ")" : ""}. Each find had a ${DATA.config.difficulty.list.standard.foundLossPct}% chance to be lost. XP is kept.`));
        if (c.foundKept.length || Object.keys(c.resKept).length) box.appendChild(h("p", { class: "good" }, "Kept: " + c.foundKept.concat(rs(c.resKept)).join(", ") + "."));
        if (c.foundLost.length || Object.keys(c.resLost).length) box.appendChild(h("p", { class: "bad" }, "Lost: " + c.foundLost.concat(rs(c.resLost)).join(", ") + "."));
        if (lr.kept.length) box.appendChild(h("p", null, `Secure Pouch saved: ${lr.kept.join(", ")}.`));
      } else box.appendChild(h("p", null, `Lost ${lr.lost} carried/equipped items. XP is kept.` + (lr.kept.length ? ` Secure Pouch saved: ${lr.kept.join(", ")}.` : "")));
      if (lr.permadeath) box.appendChild(h("p", { class: "bad", "data-death": "ragnarok" }, `Ragnarök: ${lr.body} is gone for good, with everything it learned. You go on as ${lr.permadeath.next}.`));
      else box.appendChild(h("p", null, lr.restoreMs ? `${lr.body} enters the Restore Queue: ${U.fmtTime(lr.restoreMs)}.` : `${lr.body} has no restore timer.`));
    }
    if (lr.ammo) box.appendChild(h("p", { "data-ammo-result": lr.ammo.used }, `${G.Items.base(lr.ammo.base).name}: ${lr.ammo.used} pack${lr.ammo.used === 1 ? "" : "s"} used` + (lr.kind === "extracted" ? `, ${lr.ammo.left} back in the stash.` : lr.ammo.lost ? `, ${lr.ammo.lost} lost with your body.` : ".")));
    // XP earned this run, one line per skill (floating "+N XP" next to each line, Slice 2 §10)
    const xp = lr.xp || {}, lines = Object.keys(xp).filter((k) => xp[k] >= 0.5).sort((a, b) => (a === "Character") - (b === "Character") || (a === "Body") - (b === "Body") || xp[b] - xp[a]);
    const xl = h("div", { class: "xp-lines" }, h("h4", null, "XP this run"));
    const rows = lines.map((k) => { const row = h("div", { class: "xp-line" }, `${k}: +${Math.round(xp[k])} XP`); xl.appendChild(row); return [row, k]; });
    if (!lines.length) xl.appendChild(h("div", { class: "hint" }, "None."));
    box.appendChild(xl);
    box.appendChild(h("button", { class: "primary", "data-act": "continue", onclick: () => { s.nickOffers = (s.nickOffers || []).filter((o) => !(lr.nickOffers || []).includes(o.uid)); /* no choice = Keep */ s.lastResult = null; UI.panel = null; G.State.save(); UI.render(); } }, "Back to town"));
    UI.modal(box, "run-result");
    if (G.XPFloat) rows.forEach(([row, k], i) => setTimeout(() => { if (row.isConnected) G.XPFloat.text(row, `+${Math.round(xp[k])} XP (${k})`, null, "right"); }, 120 * i));
  };

  UI.showBodyOffer = function (step) {
    const s = G.state;
    const box = h("div", null, h("h2", null, "A new body"), h("p", null, step ? "Behind the frost, a few of the pods still hold dormant human bodies. Pick one. This ends the tutorial, and the body is yours whether or not you make it out." : "Among the wreckage you find dormant human bodies you can claim. Pick one — this ends the tutorial."));
    const cards = h("div", { class: "cards" });
    s.humanOffer.forEach((b, i) => {
      const sp = DATA.bodies.specialties[b.spec];
      cards.appendChild(h("div", { class: "card body-card offer" }, SP.icon(G.State.bodySprite(b), 48), h("div", { class: "bc-name" }, `${b.name}, ${b.past}`),
        h("div", { class: "bc-sub" }, `${DATA.bodies.classes[b.cls].name} / ${sp.name}`), h("div", { class: "bc-desc" }, sp.desc), h("div", { class: "bc-desc" }, "Abilities: " + UI.ablText(b)),
        h("div", { class: "bc-desc" }, "Quirks: " + b.quirks.map((q) => DATA.bodies.quirks[q].name + " — " + DATA.bodies.quirks[q].desc).join("; ")),
        h("div", { class: "bc-desc" }, Object.entries(b.skills).filter(([, v]) => v.lvl > 1).map(([k, v]) => `${DATA.skills[k].name} ${v.lvl}`).join(", ")),
        h("div", { class: "bc-desc" }, `HP ${DATA.bodies.classes[b.cls].stats.max_hp} · Speed ${DATA.bodies.classes[b.cls].stats.move_speed} · deploy cost ${G.State.bodyCost(b)}`),
        h("button", { class: "primary", "data-act": "claim-body", onclick: () => { G.Exp.chooseHumanBody(i); if (step && G.state.run && G.Exp.current() === step) G.Exp.next(); UI.render(); } }, "Claim")));
    });
    box.appendChild(cards);
    UI.modal(box, "wide");
  };

  UI.slotLabel = { weapon: "main hand", offhand: "off hand", weapon2: "backup main", offhand2: "backup off hand", head: "head", body: "body", backpack: "backpack" };   // Slice 5 §E
  // ================= EXPEDITION =================
  UI.renderExpedition = function (scr) {
    const s = G.state, r = s.run, X = G.Exp;
    scr.innerHTML = "";
    const layout = h("div", { class: "exp-layout" });
    const mapBox = h("div", { class: "exp-map" });
    const inSite = X.inSite(), node = X.node(), loc = G.Map.loc(node), zd = DATA.zones.list[r.zone], v2 = !!(G.V2 && G.V2.on());
    const area = v2 && inSite && G.V2.isAreaMap(r.loc) ? X.site() : null;   // Maps/Areas/Loot: "Hushwood / [Map] / [Area]"
    const head = h("div", { class: "exp-head" }, h("b", null, zd.name), " · ", v2 ? (loc ? `${loc.name}${area ? " / " + G.Util.copy(area.name) : ""}${inSite ? "" : " (traversal)"}` : "Traversal") : inSite ? `${loc.name} (location view)` : "Zone map");
    if (inSite) head.appendChild(h("button", { "data-act": "leave", disabled: !!r.queue.length || !!UI.search, onclick: () => { X.leaveSite(); UI.render(); } }, v2 ? DATA.mapsV2.text.backToTraversal + " ↩" : "Leave to the map ↩"));
    else if (loc && X.site()) head.appendChild(h("button", { "data-act": "enter", disabled: !!r.queue.length, onclick: () => { const e = X.enterSite(); if (e) UI.fail(e); UI.render(); } }, v2 ? G.Traversal.enterLabel(r.loc) : `Go back inside ${loc.name}`));
    mapBox.appendChild(head);
    if (inSite) G.SiteView.render(mapBox, { onObject: UI.onSiteObject, onCancel: UI.cancelSearch });
    else G.MapView.render(mapBox, v2 ? (nid) => G.Traversal.select(nid) : (nid) => {   // V2: a Map opens its panel first (Travel / Enter there)
      if (nid === r.loc) { X.enterSite(); UI.render(); return; }
      if (!X.moveTo(nid)) UI.toast(X.immobile() ? X.overloadText() : "Can't move there."); UI.render();
    });
    if (!inSite && v2) G.Traversal.mount(mapBox);
    if (!inSite && G.AreaWalk) G.AreaWalk.reset();   // off to traversal: an abandoned walk (and its action) never replays later
    layout.appendChild(mapBox);
    const side = h("div", { class: "exp-side" });
    // heat
    const t = X.heatTier();
    if (v2) { const hs = G.Traversal.heat(r, bar); if (hs) side.appendChild(hs); }   // SP-034: hidden while low, no passive effects
    else {
    const heat = h("section", { class: "panel", "data-tut": "heat" }, h("h3", null, `Heat ${r.heat} — ${t.name}`), bar(r.heat / DATA.config.heat.max, t.color, `${r.heat}/100`));
    const marks = h("div", { class: "heat-marks" }); for (const th of DATA.config.heat.thresholds) marks.appendChild(th.min >= 80 ? h("span", { class: "hm-end", style: `right:${100 - th.min}%` }, th.name + "|") : h("span", { style: `left:${th.min}%` }, "|" + th.name));   // Slice 5: a label near the end reads leftward from its tick (Manhunt at 90 overflowed the side panel)
    heat.appendChild(marks);
    { const rh = X.carriedResHeat(); heat.appendChild(h("small", { class: "heat-move", "data-heat-move": String(DATA.config.heat.perMove + rh) }, `Each move: +${DATA.config.heat.perMove}` + (rh ? ` · Relic Tech: +${rh} (+${DATA.resources.relic.heatPerMove} per unit carried)` : "") + " Heat")); heat.appendChild(h("br")); }
    heat.appendChild(h("small", null, `Enemy budget ×${t.budgetMult} · loot rarity +${t.lootBonus}%` + (G.Perks.rarityBonus() ? ` (+${G.Perks.rarityBonus()}% Scavenger's Eye)` : "") + (t.hostileBonus ? ` · hostiles +${t.hostileBonus}%` : "") + (t.closeExtractions ? ` · ${t.closeExtractions >= 99 ? "only one extraction open" : t.closeExtractions + " extraction(s) closed"}` : "") + (t.forcedBattle ? " · strike team intercepts at next location" : "")));
    side.appendChild(heat);
    }
    // squad
    const body = X.body(), maxHp = X.maxBodyHp();
    const sq = h("section", { class: "panel" }, h("h3", null, "Squad"));
    sq.appendChild(h("div", { class: "sq-row" }, SP.icon(G.State.bodySprite(body), 22), h("span", { class: "sq-name" }, body.name + " (you)"), bar(r.bodyHp / maxHp, "#5fd35f", `${Math.ceil(r.bodyHp)}/${Math.round(maxHp)}`),
      h("button", { disabled: !(r.bag.res.med > 0) || r.bodyHp >= maxHp, onclick: () => { UI.toast(X.useMed("body")); UI.render(); } }, healIco(), "Heal")));
    r.squad.forEach((m, i) => {
      const mx = G.Battle.unitFromGrunt(m.g).maxHp, isCarried = r.carriedCritical.includes(m.g.uid);
      sq.appendChild(h("div", { class: "sq-row" + (m.hp <= 0 ? " dead" : "") }, UI.gruntIcon(m.g, 18), h("span", { class: "sq-name" }, G.Allies.name(m.g)), m.hp > 0 ? bar(m.hp / mx, "#5fd35f", `${Math.ceil(m.hp)}/${Math.round(mx)}`) : h("span", { class: "bad" }, isCarried ? "Critical (carried)" : m.left ? "left behind" : "dead"),
        m.hp > 0 ? h("button", { disabled: !(r.bag.res.med > 0) || m.hp >= mx, onclick: () => { UI.toast(X.useMed(i)); UI.render(); } }, healIco(), "Heal") : null));
    });
    side.appendChild(sq);
    // carry
    const cap = X.capacity(), kg = X.carried(), pct = (kg / cap) * 100;
    const carry = h("section", { class: "panel" }, h("h3", null, `Carry ${U.fmt1(kg)} / ${U.fmt1(cap)} kg`, G.Perks.carryKg() ? h("small", { class: "hint" }, ` (incl. Mule +${G.Perks.carryKg()} kg)`) : null), bar(pct / 150, pct >= 150 ? "#e04040" : pct > 100 ? "#e0a040" : "#6aa0ff", `${Math.round(pct)}%`));
    if (r.carryDrop && r.carryDrop.nid === r.loc) { const cd = r.carryDrop; carry.classList.add("carry-drop"); carry.appendChild(h("div", { class: "warn carry-drop-note", "data-note": "carry-drop" }, `−${U.fmt1(cd.lostKg)} kg capacity: ${cd.names.join(", ")} died.` + (cd.shareKg > 0 ? ` ${U.fmt1(cd.shareKg)} kg of the bag is on ${cd.names.length > 1 ? "their bodies" : "the body"} here: take it before you move on, or it's gone.` : " Their gear is on the body here: take it before you move on, or it's gone."))); }   // Slice 5 §C
    if (pct > 100) carry.appendChild(h("div", { class: "warn", "data-note": pct >= DATA.config.carry.immobileAtPct ? "immobile" : "overloaded" }, pct >= DATA.config.carry.immobileAtPct ? X.overloadText() + " (Over 150% you can't move.)" : `Overloaded: −${Math.round(pct - 100)}% Move Speed in battle.`));   // SP-045
    // gear
    const worn = Object.values(r.gear).filter(Boolean);
    for (const slot of ["weapon", "offhand", "head", "body", "backpack"]) { const it = r.gear[slot]; if (it) carry.appendChild(UI.itemEl(it, [{ label: "Unequip", fn: () => { X.unequip(slot); UI.render(); } }], UI.slotLabel[slot] || slot, worn)); }
    if (r.gear.weapon2 || r.gear.offhand2) {   // Slice 5 §E: the Backup set (counts toward carry; in a fight: the Swap button)
      carry.appendChild(h("h4", null, "Backup set ", h("button", { "data-act": "swap-sets", disabled: !!r.queue.length, onclick: () => { X.swapSets(); UI.render(); } }, "⇄ Swap with Main")));
      for (const slot of ["weapon2", "offhand2"]) { const it = r.gear[slot]; if (it) carry.appendChild(UI.itemEl(it, [{ label: "Unequip", fn: () => { X.unequip(slot); UI.render(); } }], UI.slotLabel[slot], worn)); }
    }
    const wornSets = UI.setsEl(worn); if (wornSets) carry.appendChild(wornSets);
    carry.appendChild(h("h4", null, "Bag"));
    for (const it of r.bag.items) carry.appendChild(UI.itemEl(it, G.Items.isQuest(it) || G.Items.isPet(it) ? [{ label: "Drop", fn: () => { X.dropItem(it.uid); UI.render(); } }] : [
      { label: "Equip", fn: () => { const e = X.equipFromBag(it.uid, "main"); if (e) UI.fail(e); UI.render(); } },
      ...(G.Items.isHandItem(it) ? [{ label: "Backup", fn: () => { const e = X.equipFromBag(it.uid, "backup"); if (e) UI.fail(e); UI.render(); } }] : []),
      { label: "Pouch", fn: () => { const e = X.toPouch(it.uid); if (e) UI.fail(e); UI.render(); } },
      { label: "Drop", fn: () => { X.dropItem(it.uid); UI.render(); } }], G.Items.isQuest(it) ? "quest item" : G.Items.isPet(it) ? "pet: extract with it to keep it" : null));
    for (const k in r.bag.res) if (r.bag.res[k] > 0) carry.appendChild(h("div", { class: "item-row" }, SP.icon(DATA.items.resources[k].sprite, 20), h("span", { class: "item-name" }, `${r.bag.res[k]} × ${DATA.items.resources[k].name}`, h("small", null, ` ${U.fmt1(r.bag.res[k] * DATA.items.resources[k].kgPerUnit)} kg`)),
      h("span", { class: "item-acts" }, h("button", { onclick: () => { const e = X.resToPouch(k); if (e) UI.fail(e); UI.render(); } }, "Pouch"), h("button", { onclick: () => { X.dropRes(k, 1); UI.render(); } }, "Drop 1"))));
    carry.appendChild(h("h4", null, `Secure Pouch (${r.pouch.length}/${G.Outpost.pouchSlots()}, max ${G.Outpost.pouchMaxKg()} kg — survives death)`));
    r.pouch.forEach((p, i) => { if (p.item) carry.appendChild(UI.itemEl(p.item, [{ label: "Take out", fn: () => { X.fromPouch(i); UI.render(); } }])); else carry.appendChild(h("div", { class: "item-row" }, `${p.n} × ${DATA.items.resources[p.res].name}`, h("button", { onclick: () => { X.fromPouch(i); UI.render(); } }, "Take out"))); });
    side.appendChild(carry);
    // extraction
    if (area) side.insertBefore(G.Traversal.sideHere(), side.firstChild);   // V2 Area: what's here, nearest first
    const ve = v2 && loc ? G.Traversal.sideExtract() : null;
    if (ve) side.appendChild(ve);
    else if (loc && loc.extraction) {
      const ex = X.extractionDef(node), open = X.extractionOpen(node);
      const label = UI.extractLabel(ex);
      side.appendChild(h("section", { class: "panel extract" }, h("h3", null, "Extraction point: " + loc.name), open ? h("button", { class: "primary big", "data-act": "extract", disabled: !X.canExtract(), onclick: () => UI.extractClick() }, label)
        : X.wrecked(node) ? h("div", { class: "warn wrecked", "data-note": "wrecked" }, `${DATA.config.extraction.crash.line} ${X.otherExitsNote(node)}`) : h("div", { class: "warn" }, "Closed at this Heat level.")));
    } else if (v2) { if (!area) side.appendChild(h("section", { class: "panel" }, h("small", null, inSite ? `${TL() ? "Tap" : "Click"} an object to search it. The way you came in takes you back to traversal.` : `${TL() ? "Tap" : "Click"} a place to see what's known about it, then travel there. Walking around inside a place never starts a fight; searching, forcing and noise can.`))); }
    else side.appendChild(h("section", { class: "panel" }, h("small", null, inSite ? (TL() ? "Tap" : "Click") + " an object to search it. The tooltip shows the time and the disturbance chance. The EXIT you came in by takes you back to the zone map." : `${TL() ? "Tap" : "Click"} a highlighted neighbouring location to move (+${DATA.config.heat.perMove} Heat). ${TL() ? "Tap" : "Click"} where you are to go back inside. The outpost is hidden: extraction is the only way home.`)));
    // log
    const lg = h("section", { class: "panel log" }, h("h3", null, "Log"));
    for (const line of r.log.slice(-14).reverse()) lg.appendChild(h("div", null, line));
    side.appendChild(lg);
    layout.appendChild(side);
    scr.appendChild(layout);
  };

  // ---------- step modals ----------
  UI.renderStep = function () {
    const step = G.Exp.current();
    if (!step) { UI.closeModal(); return; }
    if (step.type === "battle") return UI.stepBattleIntro(step);
    if (step.type === "event") return UI.stepEvent(step);
    if (step.type === "container") return UI.stepContainer(step);
    if (step.type === "spoils" || step.type === "loot") return G.Traversal.lootStep(step);   // Maps/Areas/Loot: battle loot / a source's loot
    if (step.type === "message") return UI.modal(h("div", null, h("h2", null, step.title), h("p", null, step.text), h("button", { class: "primary", onclick: () => { G.Exp.resolveMessage(step); UI.render(); } }, "OK")));
    if (step.type === "critical") return UI.stepCritical(step);
    if (step.type === "spot") return UI.stepSpot(step);
    if (step.type === "hunters") return UI.stepHunters(step);
    if (step.type === "rival") return UI.stepRival(step);
    if (step.type === "bodyoffer") { if (G.state.humanOffer) return UI.showBodyOffer(step); G.Exp.next(); return UI.renderStep(); }   // Slice 4 §B pods claim
  };

  // Slice 3 §7 rival squad (a snapshot of another player's / your own past squad): Engage / Ambush / Hide / Parley
  UI.stepRival = function (step) {
    const RV = G.Rivals, D = DATA.rivals, snap = step.snap, odds = RV.odds(), R = DATA.items.rarities;
    const gearSpan = (g) => h("span", { class: "rv-item", style: `color:${(R[g.rarity] || R.white).color}` }, `${DATA.items.bases[g.base] ? DATA.items.bases[g.base].name : g.base} i${g.ilvl}`);
    const unitRow = (su) => {
      const who = su.kind === "body" ? `${su.name} — ${DATA.bodies.classes[su.cls] ? DATA.bodies.classes[su.cls].name : su.cls}${su.spec ? " / " + su.spec.replace(/_/g, " ") : ""}, Body Lv ${su.bodyLevel || 1}` : `${su.nickname ? "\u201c" + su.nickname + "\u201d " : ""}${su.name} — ${su.kind === "core" ? "Veteran" : "Grunt"} (${DATA.items.bases[su.weapon] ? DATA.items.bases[su.weapon].name : su.weapon || "fists"})`;
      const extra = (su.traits || []).map((t) => DATA.allies && DATA.allies.traits && DATA.allies.traits[t] ? DATA.allies.traits[t].name : t);
      return h("li", { class: "rv-unit" }, h("b", null, who), (su.gear || []).length ? h("span", null, ...(su.gear || []).reduce((a, g) => a.concat([" · ", gearSpan(g)]), [])) : null, extra.length ? h("small", { class: "hint" }, " · " + extra.join(", ")) : null);
    };
    const mine = RV.myScore(), theirs = snap.deployScore || 0;
    const box = h("div", { class: "rival-enc" }, h("h2", { class: "bad" }, `Renegades: ${snap.handle}`),
      h("p", { class: "ev-text" }, snap.source === "own" ? "A squad that fights exactly like you once did. Same guns, same spacing. An echo." : "Another renegade crew, working the same ground. They've seen you too."),
      h("p", null, `Heat ${snap.heat || 0} · deploy score ${theirs} (yours ${mine})` + (step.why && step.why !== "rolled" ? ` · ${step.why}` : "")),
      h("ul", { class: "rv-units" }, ...snap.units.map(unitRow)));
    const after = (res) => { if (res.error) return UI.fail(res.error); UI.toast(res.text); UI.render(); };
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { class: "primary", "data-act": "rival-engage", onclick: () => after(RV.resolve(step, "engage")) }, "Engage"), h("small", null, " A straight fight.")));
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { "data-act": "rival-ambush", onclick: () => after(RV.resolve(step, "ambush")) }, "Ambush"), h("span", { class: "chance" }, UI.checkLabel(odds.ambush)), h("small", null, ` Pass: they're frozen for the first ${D.ambush.freezeSec} s. Fail: a normal fight.`)));
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { "data-act": "rival-hide", onclick: () => after(RV.resolve(step, "hide")) }, "Hide"), h("span", { class: "chance" }, UI.checkLabel(odds.hide)), h("small", null, " Pass: they move on. Fail: a normal fight.")));
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { "data-act": "rival-parley", onclick: () => after(RV.resolve(step, "parley")) }, "Parley"), h("span", { class: "chance" }, UI.checkLabel(odds.parley)), h("small", null, ` Pass: they reveal the ${D.parley.revealNearest} nearest locations and the extractions (great pass: + 1 item from their pack). Fail: they leave. Bad fail: a trap, your squad is frozen for ${D.parley.freezeSec} s.`)));
    UI.modal(box);
  };

  // Slice 3 §4b Hunter encounter: Fight / Hide (Stealth DC 16, fail = ambush) / Bait (a Grunt, 60% death)
  UI.stepHunters = function (step) {
    const HD = DATA.enemies.hunters, info = G.Hunters.hideInfo(), r = G.state.run, grunt = r.squad.find((s) => s.hp > 0);
    const pack = HD.packs[step.pack].map((id) => DATA.enemies.units[id].name).reduce((m, n) => { m[n] = (m[n] || 0) + 1; return m; }, {});
    const box = h("div", { class: "hunter-enc" }, h("h2", null, "Hunters!"), h("p", { class: "ev-text" }, "Figures in graphite armour close in, moving like they've done this a hundred times."),
      h("p", null, "Pack: " + Object.entries(pack).map(([n, c]) => (c > 1 ? c + "× " : "") + n).join(", ") + ` (stats ×${(DATA.config.heat.thresholds.find((t) => t.name === G.Exp.heatTier().name) || { budgetMult: 1 }).budgetMult})`));
    const after = (res) => { if (res.error) return UI.fail(res.error); UI.toast(res.text); UI.render(); };
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { class: "primary", "data-act": "hunt-fight", onclick: () => after(G.Hunters.resolve(step, "fight")) }, "Fight")));
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { "data-act": "hunt-hide", onclick: () => after(G.Hunters.resolve(step, "hide")) }, "Hide"), h("span", { class: "chance" }, UI.checkLabel(info)), h("small", null, " A fail means they ambush you (Stalkers strike first).")));
    box.appendChild(h("div", { class: "ev-opt" }, h("button", { class: "grunt", "data-act": "hunt-bait", disabled: !grunt, onclick: () => after(G.Hunters.resolve(step, "bait")) }, grunt ? `Bait: send ${G.Allies.name(grunt.g)}` : "Bait (no Grunt)"),
      h("small", null, ` You escape; they have a ${HD.bait.deathPct}% chance to die, and the pack loses you for ${HD.bait.loseMoves} moves.`)));
    UI.modal(box);
  };

  UI.stepSpot = function (step) {
    // a hidden passage, or (Slice 5 §G) a secret place off this one (step.secret: its spot is the host's secretSpot)
    const P = step.secret ? null : DATA.zones.passages[step.pid], sp = G.Exp.spotDef(step.secret ? step : step.pid), info = G.Exp.spotInfo(step.secret ? step : step.pid);
    const from = (G.state.run && G.state.run.zone) || "a", flavor = step.secret ? sp.text : P.spotText || "Water is running somewhere under the tracks. Maybe there's a way down.";
    const box = h("div", null, h("h2", null, "Something feels off here"), h("p", { class: "ev-text" }, flavor),
      h("p", null, `Best of ${sp.skills.map((k) => DATA.skills[k].name).join(" / ")} (squad best) vs DC ${sp.dc}: `, h("span", { class: "chance" }, UI.checkLabel(info))));
    const btn = h("button", { class: "primary", "data-act": "spot", onclick: () => {
      const res = G.XP.at({ el: btn }, () => G.Exp.resolveSpot(step));
      const foundTxt = step.secret ? `${DATA.map.locations[step.secret].name} is tucked away just off the path. It's on your map for good.`
        : `A ${P.name.toLowerCase()} hidden ${P.hiddenWhere || "under the weeds"} leads to ${DATA.zones.list[G.Zones.otherEnd(step.pid, from)].name}. It's on your map for good` + (DATA.zones.passageUnlockOnDeath ? ", and the zone is now a starting choice at the outpost." : ".");
      const out = h("div", null, h("h2", null, res.found ? (step.secret ? "You found something!" : "You found a way through!") : "Nothing obvious"), h("p", { class: "roll " + (res.found ? "good" : "bad") }, res.roll.text),
        h("p", null, res.found ? foundTxt : "Maybe you'll spot it on a later visit."),
        h("button", { class: "primary", onclick: () => UI.render() }, "Continue"));
      UI.modal(out);
    } }, "Look around");
    box.appendChild(btn);
    UI.modal(box);
  };

  // ---------- location view interaction ----------
  // Slice 4 §B: turn a pods-room wheel (dir -1 counterclockwise, +1 clockwise). No noise, no Heat, no fail state.
  UI.spinWheel = function (o, dir) {
    const r = G.Main.spin(o.id, dir); if (r.error) return UI.fail(r.error);
    G.Sfx.play("sfx_wheel_click"); UI.hideTip();
    if (r.opened) { setTimeout(() => G.Sfx.play("sfx_door_heavy"), 150); UI.toast(DATA.main.pods.openText); }
    UI.render();
    if (r.opened) { const w = document.querySelector(".site-wrap"); if (w) w.classList.add("clunk"); }
  };
  // the extract button's line (the panel, the hotspot's tooltip and its confirm)
  UI.extractLabel = function (ex) {
    const X = G.Exp;
    return ex.type === "free" ? "Extract (free)" : ex.type === "check" ? (() => { const c = G.Checks.compute(ex.skill, ex.dc, X.members(), X.gearItems()); return `Extract: ${DATA.skills[ex.skill].name} DC ${c.dc} — ${Math.round(c.chance)}%` + (ex.wavesByGrade ? " (the better the roll, the fewer waves)" : ""); })() : `Extract: hold out ${ex.surviveSec} s (defense battle)`;
  };
  UI.onSiteObject = function (o, acts, el) {
    const X = G.Exp, site = X.site();
    // Maps/Areas/Loot (V2): through to a linked Area, a body's / a container's loot (never a search), a duck, a Contested way out
    if (acts[0] === "go") { UI.hideTip(); const e = G.V2.enterArea(G.state.run.loc, o.to, G.V2.curArea(G.state.run.loc)); if (e) UI.fail(e); UI.render(); return; }
    if (acts[0] === "loot") { UI.hideTip(); G.V2.openLoot(site, o); UI.render(); return; }
    if (acts[0] === "boop") { const res = X.useObject(o.id); if (res.text) UI.toast(res.text); return; }
    if (acts[0] === "extract" && o.opp) {
      const od = G.V2.oppDef(site.nid, o.opp), ck = od.check ? UI.checkLabel(G.Checks.compute(od.check.skill, od.check.dc, X.members(), X.gearItems())) : "No check.";
      UI.modal(h("div", { "data-hotspot": "opportunity" }, h("h2", null, o.name), h("p", { class: "examine" }, X.examine(o)), h("p", null, ck), h("p", { class: "hint" }, "A failed attempt is loud (whatever's still nearby may come), and you'll have to step away before trying again."),
        h("div", { class: "confirm-row" }, h("button", { class: "primary confirm-btn", "data-act": "extract-opportunity", onclick: () => { UI.closeModal(); const res = G.V2.attemptOpp(G.state.run.loc, o.opp); if (res.error) UI.fail(res.error); else UI.toast(res.text); UI.render(); } }, "Try it"),
          h("button", { class: "confirm-btn", onclick: () => { UI.closeModal(); UI.render(); } }, "Not now"))));
      return;
    }
    // Slice 5 §D: the way out leaves to the zone map; the extraction hotspot asks first, then runs the panel's flow
    if (acts[0] === "leave") { UI.hideTip(); X.leaveSite(); UI.render(); return; }
    site.squadAt = o.id;
    if (acts[0] === "extract") {
      const ex = X.extractionDef(X.node());
      UI.modal(h("div", { "data-hotspot": "extract" }, h("h2", null, o.name), h("p", { class: "examine" }, X.examine(o)), h("p", null, UI.extractLabel(ex)),
        h("div", { class: "confirm-row" }, h("button", { class: "primary confirm-btn", "data-act": "extract-hotspot", disabled: !X.canExtract(), onclick: () => { UI.closeModal(); UI.extractClick(); } }, ex.type === "check" ? "Try it" : ex.type === "defense" ? "Hold out" : "Extract"),
          h("button", { class: "confirm-btn", onclick: () => { UI.closeModal(); UI.render(); } }, "Not now"))));
      return;
    }
    if (acts[0] === "use") { const r = X.useObject(o.id); if (r.error) UI.fail(r.error); UI.render(); return; }
    if (acts[0] === "reopen") { X.reopen(o.id); UI.render(); return; }
    // Slice 4 §B pods room: the mural (examine: a tap on phones reads it), the working pod
    if (acts[0] === "examine") { UI.modal(h("div", { class: "examine", "data-examine": o.id }, h("h2", null, o.name), h("p", { class: "ev-text" }, G.Main.examine(o)), h("button", { class: "primary", onclick: () => UI.closeModal() }, "OK"))); return; }
    if (acts[0] === "claim") { const r = G.Main.claim(o.id); if (r.error) UI.fail(r.error); else UI.toast(r.text); UI.render(); return; }
    if (acts[0] === "cross") {
      const P = DATA.zones.passages[o.pid], to = G.Zones.otherEnd(o.pid, G.state.run.zone), why = X.canCross(o.pid);
      if (why) return UI.fail(why);
      UI.modal(h("div", null, h("h2", null, P.name), h("p", null, `Crawl through to ${DATA.zones.list[to].name}? +${P.crossHeat} Heat. You keep your carry, squad and Heat.`),
        h("button", { class: "primary", "data-act": "cross", onclick: () => { const e = X.crossPassage(o.pid); if (e) UI.fail(e); UI.closeModal(); UI.render(); } }, "Crawl through"), h("button", { onclick: () => UI.closeModal() }, "Not now")));
      return;
    }
    if (acts.length === 1) return UI.beginSearch(o.id, acts[0]);
    const box = h("div", null, h("h2", null, o.name), h("p", null, o.jammed ? "The lock is jammed." : "It's locked."));
    for (const a of acts) { const i = X.searchInfo(o.id, a); box.appendChild(h("div", { class: "ev-opt" }, h("button", { "data-act": a, onclick: () => { UI.closeModal(); UI.beginSearch(o.id, a); } }, G.SiteView.actionLabel[a]), h("span", { class: "chance" }, `${U.fmt1(i.sec)} s · disturbance ${U.fmt1(i.pct)}%` + (i.heatGain ? ` · +${i.heatGain} Heat` : "") + (i.check ? ` · ${UI.checkLabel(i.check)}` : "")))); }
    box.appendChild(h("button", { onclick: () => UI.closeModal() }, "Leave it"));
    UI.modal(box);
  };
  UI.beginSearch = function (objId, action) {
    if (UI.search) return;
    const i = G.Exp.searchInfo(objId, action), ms = (G.Debug && G.Debug.fastSearch ? 0.15 : i.sec) * 1000;
    UI.search = { objId, action, t0: performance.now(), ms, label: `${G.SiteView.actionLabel[action]}… ${U.fmt1(i.sec)} s` };
    UI.render();
    const step = () => {
      const S = UI.search; if (!S || S.objId !== objId) return;
      const f = Math.min(1, (performance.now() - S.t0) / Math.max(1, S.ms));
      const fill = document.querySelector(".site-progress .sp-fill"); if (fill) fill.style.width = (f * 100) + "%";
      if (f >= 1) { UI.finishSearch(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  UI.cancelSearch = function () { UI.search = null; UI.render(); };
  UI.finishSearch = function () {
    const S = UI.search; UI.search = null;
    const el = G.SiteView.els[S.objId];
    const res = G.Exp.completeSearch(S.objId, S.action);
    if (res.error) { UI.fail(res.error); UI.render(); return; }
    G.Sfx.play(res.roll ? (G.Checks.isSuccess(res.roll.grade) ? "sfx_check_success" : "sfx_check_fail") : "sfx_search_done");
    UI.render();
    const el2 = G.SiteView.els[S.objId] || el;
    if (el2 && G.XPFloat) G.XPFloat.text(el2, res.disturb.v2 ? (res.fight ? "Something heard you!" : res.disturb.pct > 0 ? `Quiet (${U.fmt1(res.disturb.pct)}% → ${Math.floor(res.disturb.roll)})` : "Quiet") : `Disturbance ${U.fmt1(res.disturb.pct)}% → ${Math.floor(res.disturb.roll)}: ${res.disturb.hit ? "heard!" : "quiet"}`, res.disturb.hit || res.fight ? "#ff7a6a" : "#bbb", "below");
    if (res.texts.length && (res.empty || !G.Exp.current())) UI.toast(res.texts.join(" "));
  };

  UI.stepBattleIntro = function (step) {
    const fam = DATA.enemies.families[step.family];
    const go = h("button", { class: "primary", "data-act": "to-battle", onclick: () => { UI.closeModal(); UI.startBattle(step); } }, "To battle");
    UI.modal(h("div", null, h("h2", { class: "bad" }, step.why || "Hostiles!"), h("p", null, `${fam.name} ahead. You'll place your squad on the grid, then the fight plays out automatically.`), go));
    try { go.focus({ preventScroll: true }); } catch (e) {}   // SP-008: Space / Enter = To battle (then Space = Fight!)
  };

  UI.startBattle = function (step) {
    const b = G.Exp.buildBattle(step, G.Debug && G.Debug.rollMath);
    const scr = $("#screen");
    UI.battle = { step, b };
    const bopts = { speed: UI.battleSpeed, onEnd: (bb) => UI.battleSummary(step, bb) };
    UI.battle.v = G.Gfx ? G.Gfx.mountBattle(scr, b, bopts) : G.BattleView.mount(scr, b, bopts);   // SP-100: 3D (js/gfx.js) or 2D
    if (G.Music) G.Music.set("battle", G.state.run ? G.state.run.zone : null);   // battle music: on the bar grid (js/music.js)
    G.log(`Battle seed ${b.seed}`);
  };

  UI.battleSummary = function (step, b) {
    const sm = G.Battle.summary(b);
    const tbl = h("table", { class: "summary" }, h("tr", null, ...["Unit", "State", "Dmg", "Hits", "Misses", "Jams", "Kills", "Heals"].map((x) => h("th", null, x))));
    for (const r of sm.rows) tbl.appendChild(h("tr", { class: r.side ? "enemy" : "" }, ...[r.name, r.state, r.dmg, r.hits, r.misses, r.jams, r.kills, r.heals].map((x) => h("td", null, String(x)))));
    const lost = b.result !== "win" && b.result !== "escape", retry = lost && G.Difficulty && G.Difficulty.canRetry();   // Slice 4 §H: Standard
    const DF = G.Difficulty, TKc = DATA.config.retryTokens || {}, token = retry && DF && !DF.def().retries;   // Slice 5 §K: a retry token pays for it
    const tokenNote = lost && DF && DF.tokenSave && DF.tokenSave() && DF.tokenBlocked() ? TKc.ragnarokBlocked : null;
    const box = h("div", null, h("h2", { class: b.result === "win" ? "good" : "bad" }, b.result === "win" ? "VICTORY" : b.result === "escape" ? "BROKE AWAY" : "DEFEAT"), h("p", null, `Duration ${Math.round(b.t)} s · seed ${b.seed}`), tbl,
      h("div", { class: "blog" }, ...sm.log.map((l) => h("div", null, l))),
      retry ? h("p", { class: "hint", "data-note": token ? "retry-token" : "retry" }, token ? `${TKc.defeatHint} (${DF.tokens()}/${TKc.cap} held)` : "Standard: retry this fight from its start, as often as you like. Continue accepts the defeat.") : null,
      tokenNote ? h("p", { class: "hint", "data-note": "retry-token-blocked" }, tokenNote) : null,
      h("div", { class: "confirm-row" },
        retry ? h("button", { class: "primary confirm-btn", "data-act": "retry-fight", onclick: () => UI.retryFight() }, token ? `↻ Retry fight (1 ${TKc.name.toLowerCase()})` : "↻ Retry fight") : null,
        h("button", { class: (retry ? "" : "primary ") + "confirm-btn", "data-act": "battle-continue", onclick: () => { G.BattleView.unmount(UI.battle.v); UI.battle = null; UI.closeModal(); G.Exp.finishBattle(step, b); if (G.AreaWalk) G.AreaWalk.guard(); UI.render(); } }, "Continue")));   // V2: the last battle click can't walk you somewhere
    UI.modal(box, "wide");
  };

  // Slice 5 §A: the truck crash: the heavy sound, a short line across the screen, the roll in a toast
  // Slice 5 §B: a check extraction rolls the d20 on screen first (G.Dice queue); the flash / toast / screen wait for it.
  UI.extractClick = function () {
    const res = G.Exp.extract();
    if (res.crash) UI.crashFlash(res); else UI.toast(res.text); UI.render();
    return res;
  };
  UI.crashFlash = function (res) {
    if (G.Dice && G.Dice.busy()) return G.Dice.whenIdle(() => UI.crashFlash(res));   // after the die
    if (res.sfx) G.Sfx.play(res.sfx);
    const el = h("div", { class: "crash-flash", "data-flash": "crash" }, res.line); document.body.appendChild(el);
    setTimeout(() => el.remove(), DATA.config.extraction.crash.lineMs);
    UI.toast(res.text);
  };

  // Slice 4 §H: Standard's Retry fight: back to the save as it was when this battle was built, and the same battle again
  UI.retryFight = function () {
    if (UI.battle) { G.BattleView.unmount(UI.battle.v); UI.battle = null; } UI.closeModal();
    const step = G.Difficulty.retry(); if (!step) { UI.render(); return; }
    UI.renderTop(); UI.startBattle(step);
  };

  UI.checkLabel = function (info) {
    return `${DATA.skills[info.skill].name} DC ${info.dc} — ${Math.round(info.chance)}%` + (G.Debug && G.Debug.rollMath ? ` [d20 + ${info.mod}: skill ${info.best}/4${info.helpers ? " +" + info.helpers + " helpers" : ""}${info.gear ? " +" + info.gear + " gear" : ""}]` : ` (best skill ${info.best}${info.helpers ? ", +" + info.helpers + " helpers" : ""}${info.gear ? ", +" + info.gear + " gear" : ""})`);
  };

  UI.stepEvent = function (step) {
    const ev = G.Exp.eventDef(step);
    if (ev.radio && UI._radioSfx !== step) { UI._radioSfx = step; G.Sfx.play("sfx_radio"); }
    const box = h("div", { class: ev.radio ? "radio" : "" }, h("h2", null, ev.icon ? SP.icon(ev.icon, 32, "ev-icon") : null, (ev.radio ? "📻 " : "") + ev.title), h("p", { class: "ev-text" }, ev.text));
    const aliveGrunts = G.state.run.squad.some((m) => m.hp > 0);
    ev.options.forEach((opt, i) => {
      const info = G.Exp.optionChance(opt);
      const ob = h("button", { onclick: () => { UI._evAnchor = ob.getBoundingClientRect(); UI.eventResult(step, i, false); } }, G.Exp.optionLabel(opt));
      const row = h("div", { class: "ev-opt" }, ob, info ? h("span", { class: "chance" }, UI.checkLabel(info)) : null);
      if (opt.gruntSpendable && aliveGrunts) row.appendChild(h("button", { class: "grunt", onclick: () => UI.eventResult(step, i, true) }, `Send a Grunt ahead (auto-success, ${DATA.map.gruntSpendDeathChance}% they die)`));
      box.appendChild(row);
    });
    UI.modal(box, "wide");
  };

  UI.eventResult = function (step, i, grunt) {
    const res = G.XP.at({ rect: UI._evAnchor }, () => G.Exp.resolveEvent(step, i, grunt));
    const box = h("div", null, h("h2", null, G.Exp.eventDef(step).title));
    if (res.roll) { box.appendChild(h("p", { class: "roll " + (G.Checks.isSuccess(res.roll.grade) ? "good" : "bad") }, res.roll.text)); G.Sfx.play(G.Checks.isSuccess(res.roll.grade) ? "sfx_check_success" : "sfx_check_fail"); }
    for (const t of res.texts) box.appendChild(h("p", null, t));
    box.appendChild(h("button", { class: "primary", onclick: () => UI.render() }, "Continue"));
    UI.modal(box);
  };

  UI.stepContainer = function (step) {
    const X = G.Exp, box = h("div", { class: "loot-box" }, h("h2", null, step.title));
    if (false) {
      const info = G.Checks.compute(step.def.check.skill, step.def.check.dc, X.members(), X.gearItems());
      box.appendChild(h("p", null, `${step.def.name}: needs a check.`));
      box.appendChild(h("div", { class: "ev-opt" }, h("button", { onclick: () => { const r = X.containerCheck(step); UI.toast(r.text); UI.render(); } }, "Try it"), h("span", { class: "chance" }, UI.checkLabel(info))));
      if (step.def.check.skill === "perception" && G.state.run.squad.some((m) => m.hp > 0)) box.appendChild(h("button", { class: "grunt", onclick: () => { const r = X.containerCheck(step, true); UI.toast(r.text); UI.render(); } }, `Send a Grunt (auto-success, ${DATA.map.gruntSpendDeathChance}% death)`));
      box.appendChild(h("button", { onclick: () => { X.closeContainer(); UI.render(); } }, "Leave it"));
      return UI.modal(box);
    }
    if (step.blocked) { box.appendChild(h("p", { class: "bad" }, "You couldn't get it open.")); box.appendChild(h("button", { class: "primary", onclick: () => { X.closeContainer(); UI.render(); } }, "Move on")); return UI.modal(box); }
    const cap = X.capacity(), kg = X.carried();
    box.appendChild(h("p", null, `Carrying ${U.fmt1(kg)} / ${U.fmt1(cap)} kg (${Math.round(kg / cap * 100)}%). Over 100% slows you in battle; at 150% you can't move.`));
    step.items.forEach((it, idx) => box.appendChild(UI.itemEl(it, [{ label: "Take", fn: () => { X.takeItem(step, idx); UI.render(); } }], null, Object.values(G.state.run.gear).filter(Boolean))));
    // Slice 3 §6: a Purple / Orange find flashes its name and plays sfx_loot_rare (once per container opening)
    if (step.items.some(G.Items.isRare) && !step.rareSfx) { step.rareSfx = true; G.Sfx.play("sfx_loot_rare"); }
    for (const k in step.res) box.appendChild(h("div", { class: "item-row" }, SP.icon(DATA.items.resources[k].sprite, 20), ` ${step.res[k]} × ${DATA.items.resources[k].name} (${U.fmt1(step.res[k] * DATA.items.resources[k].kgPerUnit)} kg) `, h("button", { onclick: () => { X.takeRes(step, k); UI.render(); } }, "Take")));
    if (!step.items.length && !Object.keys(step.res).length) box.appendChild(h("p", { class: "hint" }, "Empty."));
    if (step.objId) box.appendChild(h("p", { class: "hint" }, "Anything you leave stays here. You can come back for it."));
    box.appendChild(h("div", { class: "row" }, h("button", { "data-act": "take-all", onclick: () => { X.takeAll(step); UI.render(); } }, "Take all"), h("button", { class: "primary", "data-act": "done", onclick: () => { X.closeContainer(); UI.render(); } }, "Done")));
    UI.modal(box, "wide");
  };

  UI.stepCritical = function (step) {
    const r = G.state.run, m = r.squad[step.squadIdx], cc = DATA.bodies.criticalCare, med = r.bag.res.med || 0;
    const box = h("div", null, h("h2", null, `${G.Allies.name(m.g)} is Critical`), h("p", null, "Spend precious Med Supplies, carry them, or leave them."));
    const go = (c) => { const e = G.Exp.resolveCritical(step, c); if (e) UI.fail(e); UI.render(); };
    box.appendChild(h("button", { disabled: med < cc.healMed, onclick: () => go("heal") }, healIco(), `Heal (${cc.healMed} Med) → ${cc.healHpPct}% HP`));
    box.appendChild(h("button", { disabled: med < cc.stabilizeMed, onclick: () => go("stabilize") }, `Stabilize (${cc.stabilizeMed} Med) → ${cc.stabilizeHpPct}% HP`));
    box.appendChild(h("button", { onclick: () => go("carry") }, `Carry (${cc.carryKg} kg; dies if you lose a battle)`));
    box.appendChild(h("button", { onclick: () => go("leave") }, "Leave them"));
    UI.modal(box);
  };

  // live timers on the outpost screen
  UI.tick = function () {
    if (!G.state.run) {
      const done = G.Outpost.tick(), dirty = G.Outpost.dirty; G.Outpost.dirty = false;
      if ((done.length || dirty) && !document.querySelector(".modal") && !(G.Dice && G.Dice.busy())) {
        if (done.length) { const k = done[0], O = G.Outpost; UI.toast(O.st(k).level === 1 ? `${O.def(k).name} built!` : `${O.def(k).name} upgrade finished!`); }
        G.State.save(); UI.render(); return;
      }
    }
    for (const k of G.Outpost.ids()) document.querySelectorAll(`[data-timer=${k}]`).forEach((el) => { el.textContent = U.fmtTime(G.Outpost.remainingMs(k)); });
    // Slice 3: any countdown with data-until (craft jobs, beds, production); at 0 the next Outpost.tick delivers and re-renders
    document.querySelectorAll("[data-until]").forEach((el) => { el.textContent = U.fmtTime(Math.max(0, +el.dataset.until - G.now())); });
    document.querySelectorAll("[data-restore]").forEach((el) => {
      const b = G.State.body(el.dataset.restore); if (!b) return;
      const ms = b.restoreUntil - G.now();
      if (ms <= 0) UI.render(); else el.textContent = "Restoring " + U.fmtTime(ms);
    });
  };
})(window);
