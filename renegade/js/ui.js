// DOM UI: outpost (deploy / vault / bodies / skills / buildings), expedition screen, modals.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites;
  const UI = G.UI = { panel: null, zone: "a", battle: null, battleSpeed: 1, modalLock: false, search: null };
  const $ = (sel) => document.querySelector(sel);
  const healIco = () => DATA.sprites.healIcon ? SP.icon(DATA.sprites.healIcon, 16, "btn-icon") : null;

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === "class") e.className = v; else if (k === "html") e.innerHTML = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k === "style") e.setAttribute("style", v); else if (v !== false && v != null) e.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
    return e;
  }
  UI.h = h;
  UI.toast = function (msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(UI._tt); UI._tt = setTimeout(() => t.classList.remove("show"), 2600); };
  UI.showTip = function (html, x, y) { const t = $("#tooltip"); t.innerHTML = html; t.classList.remove("hidden"); const w = t.offsetWidth, hh = t.offsetHeight; t.style.left = Math.min(window.innerWidth - w - 8, x + 14) + "px"; t.style.top = Math.min(window.innerHeight - hh - 8, y + 14) + "px"; };
  UI.hideTip = function () { $("#tooltip").classList.add("hidden"); };
  const tipOn = (el, fn) => { el.addEventListener("mousemove", (e) => UI.showTip(typeof fn === "function" ? fn() : fn, e.clientX, e.clientY)); el.addEventListener("mouseleave", UI.hideTip); return el; };
  UI.modal = function (content, cls) { const root = $("#modal-root"); root.innerHTML = ""; const m = h("div", { class: "modal " + (cls || "") }, content); root.appendChild(h("div", { class: "modal-back" }, m)); return m; };
  UI.closeModal = function () { $("#modal-root").innerHTML = ""; UI.hideTip(); };
  const bar = (frac, color, label) => h("div", { class: "bar" }, h("div", { class: "bar-fill", style: `width:${U.clamp(frac, 0, 1) * 100}%;background:${color}` }), h("span", { class: "bar-label" }, label));

  UI.itemEl = function (item, actions, extra) {
    const row = h("div", { class: "item-row" });
    const ic = h("span", { class: "item-icon" }, SP.icon(G.Items.sprite(item), 32), SP.icon("frame_" + item.rarity, 32, "frame"));
    row.appendChild(ic);
    row.appendChild(h("span", { class: "item-name", style: `color:${G.Items.color(item)}` }, G.Items.name(item), h("small", null, ` i${item.ilvl} · ${G.Items.weight(item)}kg`)));
    if (extra) row.appendChild(h("span", { class: "item-extra" }, extra));
    const acts = h("span", { class: "item-acts" });
    for (const a of actions || []) acts.appendChild(h("button", { onclick: a.fn, disabled: a.disabled || false }, a.label));
    row.appendChild(acts);
    tipOn(row, () => `<b style="color:${G.Items.color(item)}">${G.Items.name(item)}</b><br>` + G.Items.describe(item).join("<br>"));
    return row;
  };

  // ---------- top bar ----------
  UI.renderTop = function () {
    const s = G.state, t = $("#topbar"); t.innerHTML = "";
    t.appendChild(h("span", { class: "brand" }, "RENEGADE", h("small", null, " [working title] · Slice 2")));
    const res = s.run ? s.run.bag.res : s.stash.res;
    const box = h("span", { class: "res" }, s.run ? "Bag: " : "Stockpile: ");
    for (const k in DATA.items.resources) if (!DATA.items.resources[k].hidden) box.appendChild(h("span", { class: "res-i" }, SP.icon(DATA.items.resources[k].sprite, 16), " " + (res[k] || 0)));
    t.appendChild(box);
    t.appendChild(h("span", null, `Character Lv ${G.Skills.charLevel(s)} · Runs ${s.runCount} · Extracted ${s.extractions} · Deaths ${s.deaths}`));
    t.appendChild(h("span", { class: "hint" }, "` / F1: debug"));
  };

  // ---------- main render ----------
  UI.render = function () {
    UI.hideTip();
    if (G.State.loadNotice) { const n = G.State.loadNotice; G.State.loadNotice = null; setTimeout(() => UI.modal(h("div", null, h("h2", null, "Save"), h("p", null, n), h("button", { class: "primary", onclick: () => UI.render() }, "OK"))), 0); }
    UI.renderTop();
    const s = G.state, scr = $("#screen");
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
    stockpile: ["Stockpile", (el) => UI.panelStockpile(el)], recruit: ["Recruitment", (el) => UI.panelRecruit(el)], skills: ["Skills", (el) => UI.tabSkills(el)], codex: ["Codex", (el) => UI.tabCodex(el)]
  };
  UI.openPanel = function (id) {
    if (id === "town") id = null;
    UI.panel = id; UI.render();
  };
  UI.renderOutpost = function (scr) {
    scr.innerHTML = "";
    G.Outpost.tick();
    const nav = h("nav", { class: "tabs" });
    const cur = UI.panel && UI.panel.startsWith("giver:") ? "quests" : UI.panel === "deploy" ? "zones" : UI.panel || "town";
    for (const [id, label] of DATA.town.nav.concat(DATA.town.extraNav)) nav.appendChild(h("button", { class: cur === id ? "on" : "", "data-nav": id, onclick: () => UI.openPanel(id) }, label));
    scr.appendChild(nav);
    const town = h("div", { class: "town-wrap" });
    const stage = G.TownView.render(town, (opens) => UI.openPanel(opens));
    if (UI.panel === "zones" || UI.panel === "deploy") stage.classList.add("trapdoor-open");
    scr.appendChild(town);
    if (UI.panel) {
      const giver = UI.panel.startsWith("giver:") ? UI.panel.split(":")[1] : null;
      const def = giver ? [DATA.quests.givers[giver].name, (el) => UI.panelGiver(el, giver)] : UI.panels[UI.panel];
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
      if (!open) { c.appendChild(h("div", { class: "bc-name" }, d.lockedLabel || "??? – find the way in")); c.appendChild(h("div", { class: "bc-sub" }, "Somewhere past the Scablands.")); }
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
    for (const k in DATA.resources) { const R = DATA.resources[k]; if (R.hidden) continue; t.appendChild(h("div", { class: "sp-row", "data-res": k }, SP.icon(R.sprite, 24), h("span", { class: "sp-name" }, R.name), h("b", null, String(s.stash.res[k] || 0)), h("small", null, ` ${R.kgPerUnit} kg each`))); }
    el.appendChild(t);
    el.appendChild(h("p", { class: "hint" }, "Everything you carry out goes here. No cap, no drain, no rot."));
  };

  // Recruitment lot: roster + hire button (config.grunts). Disabled when you can't afford it or the roster is full.
  UI.panelRecruit = function (el) {
    const s = G.state, O = G.Outpost, c = O.recruitCost(), cap = DATA.config.grunts.rosterCap, why = O.canRecruit();
    const costEl = h("span", { class: "recruit-cost" }, ...Object.entries(c).map(([r, n]) => h("span", { class: "rc " + ((s.stash.res[r] || 0) < n ? "short" : ""), "data-res": r }, SP.icon(DATA.resources[r].sprite, 20), ` ${n} (have ${s.stash.res[r] || 0}) `)));
    const btn = h("button", { class: "primary", "data-act": "recruit", ...(why ? { disabled: "disabled", title: why } : {}) }, "Recruit a Grunt");
    btn.addEventListener("click", () => { const res = O.recruit(); if (res.error) UI.toast(res.error); else UI.toast(res.grunt.name + " joins the roster."); UI.render(); });
    el.appendChild(h("div", { class: "recruit-row" }, btn, h("span", null, " Cost: "), costEl));
    if (why) el.appendChild(h("p", { class: "hint", "data-why": "recruit" }, why));
    el.appendChild(h("h4", null, `Grunts ${O.gruntCount()} / ${cap}`));
    const list = h("div", { class: "recruit-roster" });
    for (const g of s.grunts) list.appendChild(h("div", { class: "rr-row" }, SP.icon(G.State.gruntTpl(g).sprite, 24), ` ${g.name} · deploy cost ${G.State.gruntTpl(g).deployCost}`));
    if (!s.grunts.length) list.appendChild(h("i", null, "Nobody. Recruit someone before you deploy."));
    el.appendChild(list);
    el.appendChild(h("p", { class: "hint" }, s.tutorialDone ? "Dead Grunts are gone for good; new ones cost Food and Water from the stockpile." : "During the tutorial your two Grunts are replaced for free."));
  };

  UI.questRow = function (id) {
    const Q = G.Quests, q = Q.def(id), st = Q.status(id), p = Q.progress(id);
    const row = h("div", { class: "quest-row " + st, "data-quest": id }, h("div", null, h("b", null, q.name), h("small", null, ` · ${st}`)), h("div", { class: "hint" }, q.text), h("div", null, Q.objectiveText(id) + (st === "active" ? ` — ${p.have}/${p.need}` : "")), h("div", { class: "hint" }, "Hint: " + q.hint + " · Reward: +1 rep, " + Q.rewardText(q.reward)));
    const acts = h("div");
    if (st === "available") { const why = Q.canTake(id); acts.appendChild(h("button", { disabled: !!why, title: why || "", onclick: () => { const e = Q.take(id); if (e) UI.toast(e); G.State.save(); UI.render(); } }, "Take quest")); }
    if (st === "active") {
      const btn = h("button", { class: "primary", disabled: !Q.canTurnIn(id), onclick: () => {
        const res = G.XP.at({ el: btn }, () => Q.turnIn(id)); if (res.error) return UI.toast(res.error);
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
      h("div", { class: "hint" }, next ? `Next perk at L${lvl + 1} (${DATA.quests.repLevels[lvl]} rep): ${next.desc}` : "All Slice 2 perks unlocked: " + Object.values(gd.perks || {}).map((p) => p.desc).join(" ")))));
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
    lo.med = lo.med == null ? Math.min(2, s.stash.res.med || 0) : Math.min(lo.med, s.stash.res.med || 0);
    if (!G.State.body(lo.bodyId) || !G.State.bodyReady(G.State.body(lo.bodyId))) { const rb = s.bodies.find((b) => G.State.bodyReady(b)); if (rb) lo.bodyId = rb.uid; }
    const score = G.State.deployScore();
    // bodies
    const bsec = h("section", { class: "panel" }, h("h3", null, "1 · Body (you wear one; unworn bodies never fight)"));
    const cards = h("div", { class: "cards" });
    for (const b of s.bodies) {
      const ready = G.State.bodyReady(b);
      const c = h("div", { class: "card body-card" + (lo.bodyId === b.uid ? " sel" : "") + (ready ? "" : " disabled"), onclick: () => { if (ready) { lo.bodyId = b.uid; fixGrunts(); UI.render(); } } },
        SP.icon(G.State.bodySprite(b), 40), h("div", { class: "bc-name" }, b.name), h("div", { class: "bc-sub" }, b.cls ? `${DATA.bodies.classes[b.cls].name} / ${DATA.bodies.specialties[b.spec].name}` : "Basic (no timer)"),
        h("div", { class: "bc-sub" }, `Body Lv ${G.Skills.bodyLevel(b)} · cost ${G.State.bodyCost(b)}`), ready ? null : h("div", { class: "bc-timer", "data-restore": b.uid }, "Restoring " + U.fmtTime(b.restoreUntil - G.now())));
      tipOn(c, () => UI.bodyTip(b));
      cards.appendChild(c);
    }
    bsec.appendChild(cards); el.appendChild(bsec);
    function fixGrunts() {
      const body = G.State.body(lo.bodyId); let left = score - G.State.bodyCost(body);
      lo.grunts = lo.grunts.filter((id) => { const g = s.grunts.find((x) => x.uid === id); if (!g) return false; const c = G.State.gruntTpl(g).deployCost; if (c <= left) { left -= c; return true; } return false; });
    }
    fixGrunts();
    const body = G.State.body(lo.bodyId);
    // squad
    let used = G.State.bodyCost(body);
    for (const id of lo.grunts) { const g = s.grunts.find((x) => x.uid === id); used += G.State.gruntTpl(g).deployCost; }
    const ssec = h("section", { class: "panel" }, h("h3", null, `2 · Squad — Deployment Score ${used} / ${score}`));
    for (const g of s.grunts) {
      const on = lo.grunts.includes(g.uid), cost = G.State.gruntTpl(g).deployCost;
      const cb = h("input", { type: "checkbox", checked: on, disabled: !on && used + cost > score, onchange: () => { if (on) lo.grunts = lo.grunts.filter((x) => x !== g.uid); else lo.grunts.push(g.uid); UI.render(); } });
      ssec.appendChild(tipOn(h("label", { class: "grunt-row" }, cb, SP.icon(G.State.gruntTpl(g).sprite, 20), ` ${g.name} (${g.rank}, cost ${cost}) — ${G.Items.base(g.weapon).name}; ` + Object.entries(g.skills).map(([k, v]) => DATA.skills[k].name + " " + v.lvl).join(", ")), `${g.name}: Grunts die at 0 HP. They use fixed gear in Slice 1.`));
    }
    el.appendChild(ssec);
    // gear
    const gsec = h("section", { class: "panel" }, h("h3", null, "3 · Gear (taken from the Vault — lost if your body dies)"));
    for (const slot of ["weapon", "head", "body", "backpack"]) {
      const sel = h("select", { onchange: (e) => { if (e.target.value) lo.gear[slot] = e.target.value; else delete lo.gear[slot]; if ((lo.pouch || []).some((p) => p.uid === e.target.value)) lo.pouch = []; UI.render(); } });
      sel.appendChild(h("option", { value: "" }, slot === "weapon" ? `(natural weapon: ${G.Items.base(body.cls ? DATA.bodies.classes[body.cls].naturalWeapon : DATA.bodies.basicBody.naturalWeapon).name})` : "(none)"));
      for (const it of s.stash.items.filter((i) => G.Items.base(i.base).slot === slot)) {
        const o = h("option", { value: it.uid }, `${G.Items.name(it)} [${DATA.items.rarities[it.rarity].name} i${it.ilvl}] ${it.affixes.map(G.Items.affixText).join(", ")}`);
        if (lo.gear[slot] === it.uid) o.selected = true; sel.appendChild(o);
      }
      gsec.appendChild(h("div", { class: "gear-row" }, h("span", { class: "slot" }, slot), sel));
    }
    // pouch (one select per slot; Vault L2 = 2 slots) + med
    const slots = G.Outpost.pouchSlots(), pk = G.Outpost.pouchMaxKg();
    lo.pouch = (lo.pouch || []).slice(0, slots);
    const entryKg = (p) => (p.uid ? G.Items.weight(s.stash.items.find((i) => i.uid === p.uid) || { base: "nat_fists" }) : p.n * DATA.resources[p.res].kgPerUnit);
    for (let si = 0; si < slots; si++) {
      const otherKg = lo.pouch.reduce((t, p, j) => t + (j === si || !p ? 0 : entryKg(p)), 0), room = pk - otherKg, curP = lo.pouch[si] || {};
      const pouchSel = h("select", { "data-pouch": si, onchange: (e) => { const v = e.target.value; lo.pouch[si] = !v ? null : v.startsWith("res:") ? { res: v.split(":")[1], n: +v.split(":")[2] } : { uid: v }; lo.pouch = lo.pouch.filter(Boolean); UI.render(); } });
      pouchSel.appendChild(h("option", { value: "" }, "(empty)"));
      const taken = lo.pouch.filter((p, j) => p && j !== si).map((p) => p.uid).filter(Boolean);
      for (const it of s.stash.items.filter((i) => !G.Items.isQuest(i) && G.Items.weight(i) <= room + 1e-9 && !Object.values(lo.gear).includes(i.uid) && !taken.includes(i.uid))) pouchSel.appendChild(h("option", { value: it.uid, selected: curP.uid === it.uid }, `${G.Items.name(it)} (${G.Items.weight(it)} kg)`));
      for (const k in DATA.resources) { if (DATA.resources[k].hidden) continue; const n = Math.min(s.stash.res[k] || 0, Math.floor((room + 1e-9) / DATA.resources[k].kgPerUnit)); if (n > 0) pouchSel.appendChild(h("option", { value: `res:${k}:${n}`, selected: curP.res === k }, `${n} × ${DATA.resources[k].name}`)); }
      gsec.appendChild(h("div", { class: "gear-row" }, h("span", { class: "slot" }, `Secure Pouch ${slots > 1 ? si + 1 : ""}`), pouchSel, si === 0 ? h("small", null, ` ${slots} slot${slots > 1 ? "s" : ""}, ${pk} kg total — survives death`) : null));
    }
    // updates in place (no full re-render): a blur-triggered re-render would swallow the click on "Start"
    const medIn = h("input", { type: "number", min: 0, max: s.stash.res.med || 0, value: lo.med, oninput: (e) => { lo.med = U.clamp(+e.target.value || 0, 0, s.stash.res.med || 0); updCarry(); G.State.save(); } });
    gsec.appendChild(h("div", { class: "gear-row" }, h("span", { class: "slot" }, "Med Supplies"), medIn, h("small", null, ` of ${s.stash.res.med || 0} in the stockpile (${DATA.resources.med.kgPerUnit} kg each, carried in the bag)`)));
    // carry preview
    const carryLine = h("div");
    function updCarry() {
      const gearItems = Object.values(lo.gear).map((uid) => s.stash.items.find((i) => i.uid === uid)).filter(Boolean);
      const fake = { gear: Object.fromEntries(gearItems.map((i) => [G.Items.base(i.base).slot, i])), bag: { items: [], res: { med: lo.med } }, pouch: [], carriedCritical: [] };
      const cap = G.Exp.capacity(fake, body, gearItems), kg = G.Exp.carried(fake);
      carryLine.textContent = `Carry: ${U.fmt1(kg)} / ${U.fmt1(cap)} kg (${DATA.config.carry.baseKg} base + ${DATA.config.carry.kgPerHaulingLevel}×Hauling ${G.Skills.level(body.skills, "hauling")} + backpack/affixes${body.quirks.includes("light_frame") ? " − 5 Light Frame" : ""})`;
    }
    updCarry();
    gsec.appendChild(carryLine);
    el.appendChild(gsec);
    const err = G.Exp.validateLoadout(lo);
    const FW = DATA.config.deploy.fallbackWeapon;
    if (FW && !(lo.gear.weapon && s.stash.items.some((i) => i.uid === lo.gear.weapon))) el.appendChild(h("p", { class: "hint fallback-note", "data-note": "fallback-weapon" }, `No weapon equipped: the outpost will issue a free ${DATA.items.bases[FW.base].name} (${DATA.items.rarities[FW.rarity].name}, i${FW.ilvl}) for this deploy.`));
    el.appendChild(h("div", { class: "deploy-go" }, h("button", { class: "primary big", "data-act": "deploy", disabled: !!err, onclick: () => { const e = G.Exp.start(lo, undefined, UI.zone); if (e) UI.toast(e); else UI.panel = null; UI.render(); } }, `Deploy to ${zd.name} ▶`), err ? h("span", { class: "warn" }, " " + err) : null,
      !s.tutorialDone ? h("p", { class: "hint" }, "Tutorial: you start in a level-1 Basic body with 2 Grunts. Extract once to claim your first specialized human body. Dying here costs nothing but what you carry — the Basic body has no restore timer.") : null));
    G.State.save();
  };

  UI.bodyTip = function (b) {
    let t = `<b>${G.State.bodyTitle(b)}</b><br>Family ${DATA.bodies.families[b.family].name} · skill cap ${DATA.bodies.families[b.family].skillCap} · Body Lv ${G.Skills.bodyLevel(b)}<br>`;
    if (b.spec) t += `<i>${DATA.bodies.specialties[b.spec].name}: ${DATA.bodies.specialties[b.spec].desc}</i><br>`;
    if (b.quirks.length) t += "Quirks: " + b.quirks.map((q) => `${DATA.bodies.quirks[q].name} (${DATA.bodies.quirks[q].desc})`).join("; ") + "<br>";
    t += Object.entries(b.skills).filter(([, v]) => v.lvl > 1).map(([k, v]) => `${DATA.skills[k].name} ${v.lvl}`).join(", ") || "All body skills 1";
    const ms = G.State.restoreMs(b); t += `<br>Restore time if killed: ${ms ? U.fmtTime(ms) : "none"}`;
    return t;
  };

  UI.tabVault = function (el) {
    const s = G.state, O = G.Outpost, over = O.stashOver();
    const p = h("section", { class: "panel" }, h("h3", null, `Stash — ${O.stashCount()} / ${O.stashCap()} gear (quest items don't count; hover for stats)`));
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
      up.appendChild(h("button", { class: "primary", "data-act": "vault-upgrade", disabled: !!why, onclick: () => { const e = O.startUpgrade("vault"); if (e) UI.toast(e); G.State.save(); UI.render(); } }, `Build Vault L${nl}`));
      if (why) up.appendChild(h("span", { class: "warn" }, " " + why));
      up.appendChild(h("p", { class: "hint" }, "Paid from the stockpile when you start. Can't be cancelled."));
    } else up.appendChild(h("p", null, "Max level for Slice 2. " + (O.def("vault").levels[st.level].desc || "")));
    el.appendChild(up);
  };

  UI.tabBodies = function (el) {
    const s = G.state;
    for (const b of s.bodies) {
      const p = h("section", { class: "panel" }, h("h3", null, SP.icon(G.State.bodySprite(b), 28), " " + G.State.bodyTitle(b)));
      p.appendChild(h("div", null, `Family: ${DATA.bodies.families[b.family].name} · Body Lv ${G.Skills.bodyLevel(b)} (${Math.round(b.bodyXp)} XP) · Restore: ${G.State.bodyReady(b) ? "ready" : U.fmtTime(b.restoreUntil - G.now())}`));
      if (b.spec) p.appendChild(h("div", null, `Specialty — ${DATA.bodies.specialties[b.spec].name}: ${DATA.bodies.specialties[b.spec].desc}`));
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
      tipOn(row, DATA.skills[k].desc + (DATA.skills[k].active ? "" : "<br><i>Not active in Slice 1.</i>"));
      t.appendChild(row);
    }
    return t;
  };

  UI.tabSkills = function (el) {
    const s = G.state;
    el.appendChild(h("section", { class: "panel" }, h("h3", null, `Consciousness — Character Lv ${G.Skills.charLevel(s)} (${Math.round(s.lifetimeXp)} lifetime XP)`), h("p", { class: "hint" }, "Mind skills belong to you and are never lost. Perks & character-level UI are later."), UI.skillTable(s.mind.skills, "mind", 99)));
  };

  UI.tabCodex = function (el) {
    const s = G.state;
    const p = h("section", { class: "panel" }, h("h3", null, `Lore found: ${s.lore.length} / ${Object.keys(DATA.lore).length}`));
    for (const id of s.lore) p.appendChild(h("p", null, DATA.lore[id]));
    p.appendChild(h("h3", null, "World"));
    p.appendChild(h("p", null, `Region: ${DATA.map.regionName}. Hollow Creek: ${s.world.hollow_creek}.`));
    el.appendChild(p);
  };

  // ---------- run result / body offer ----------
  UI.showRunResult = function () {
    const s = G.state, lr = s.lastResult;
    const box = h("div");
    if (lr.kind === "extracted") {
      box.appendChild(h("h2", { class: "good" }, "EXTRACTED"));
      box.appendChild(h("p", null, `Moves ${lr.moves} · final Heat ${lr.heat} · battles ${lr.stats.battles} · kills ${lr.stats.kills}`));
      box.appendChild(h("p", null, "Brought home: " + (lr.items.map((i) => `${i.name} (${DATA.items.rarities[i.rarity].name} i${i.ilvl})`).join(", ") || "no new items")));
      const rs = Object.entries(lr.res).filter(([, n]) => n).map(([k, n]) => `${n} ${DATA.items.resources[k].name}`); if (rs.length) box.appendChild(h("p", null, "Resources: " + rs.join(", ")));
      if (lr.grunts.length) box.appendChild(h("p", null, `New recruits: ${lr.grunts.join(", ")}`));
      if (lr.bodies.length) box.appendChild(h("p", null, `New bodies: ${lr.bodies.join("; ")}`));
    } else {
      box.appendChild(h("h2", { class: "bad" }, "YOUR BODY DIED"));
      box.appendChild(h("p", null, lr.why));
      box.appendChild(h("p", null, `Lost ${lr.lost} carried/equipped items. XP is kept.` + (lr.kept.length ? ` Secure Pouch saved: ${lr.kept.join(", ")}.` : "")));
      box.appendChild(h("p", null, lr.restoreMs ? `${lr.body} enters the Restore Queue: ${U.fmtTime(lr.restoreMs)}.` : `${lr.body} has no restore timer.`));
    }
    // XP earned this run, one line per skill (floating "+N XP" next to each line, Slice 2 §10)
    const xp = lr.xp || {}, lines = Object.keys(xp).filter((k) => xp[k] >= 0.5).sort((a, b) => (a === "Character") - (b === "Character") || (a === "Body") - (b === "Body") || xp[b] - xp[a]);
    const xl = h("div", { class: "xp-lines" }, h("h4", null, "XP this run"));
    const rows = lines.map((k) => { const row = h("div", { class: "xp-line" }, `${k}: +${Math.round(xp[k])} XP`); xl.appendChild(row); return [row, k]; });
    if (!lines.length) xl.appendChild(h("div", { class: "hint" }, "None."));
    box.appendChild(xl);
    box.appendChild(h("button", { class: "primary", "data-act": "continue", onclick: () => { s.lastResult = null; UI.panel = null; G.State.save(); UI.render(); } }, "Back to town"));
    UI.modal(box, "run-result");
    if (G.XPFloat) rows.forEach(([row, k], i) => setTimeout(() => { if (row.isConnected) G.XPFloat.text(row, `+${Math.round(xp[k])} XP (${k})`, null, "right"); }, 120 * i));
  };

  UI.showBodyOffer = function () {
    const s = G.state;
    const box = h("div", null, h("h2", null, "A new body"), h("p", null, "Among the wreckage you find dormant human bodies you can claim. Pick one — this ends the tutorial."));
    const cards = h("div", { class: "cards" });
    s.humanOffer.forEach((b, i) => {
      const sp = DATA.bodies.specialties[b.spec];
      cards.appendChild(h("div", { class: "card body-card offer" }, SP.icon(G.State.bodySprite(b), 48), h("div", { class: "bc-name" }, `${b.name}, ${b.past}`),
        h("div", { class: "bc-sub" }, `${DATA.bodies.classes[b.cls].name} / ${sp.name}`), h("div", { class: "bc-desc" }, sp.desc),
        h("div", { class: "bc-desc" }, "Quirks: " + b.quirks.map((q) => DATA.bodies.quirks[q].name + " — " + DATA.bodies.quirks[q].desc).join("; ")),
        h("div", { class: "bc-desc" }, Object.entries(b.skills).filter(([, v]) => v.lvl > 1).map(([k, v]) => `${DATA.skills[k].name} ${v.lvl}`).join(", ")),
        h("div", { class: "bc-desc" }, `HP ${DATA.bodies.classes[b.cls].stats.max_hp} · Speed ${DATA.bodies.classes[b.cls].stats.move_speed} · deploy cost ${G.State.bodyCost(b)}`),
        h("button", { class: "primary", onclick: () => { G.Exp.chooseHumanBody(i); UI.render(); } }, "Claim")));
    });
    box.appendChild(cards);
    UI.modal(box, "wide");
  };

  // ================= EXPEDITION =================
  UI.renderExpedition = function (scr) {
    const s = G.state, r = s.run, X = G.Exp;
    scr.innerHTML = "";
    const layout = h("div", { class: "exp-layout" });
    const mapBox = h("div", { class: "exp-map" });
    const inSite = X.inSite(), node = X.node(), loc = G.Map.loc(node), zd = DATA.zones.list[r.zone];
    const head = h("div", { class: "exp-head" }, h("b", null, zd.name), " · ", inSite ? `${loc.name} (location view)` : "Zone map");
    if (inSite) head.appendChild(h("button", { "data-act": "leave", disabled: !!r.queue.length || !!UI.search, onclick: () => { X.leaveSite(); UI.render(); } }, "Leave to the map ↩"));
    else if (loc && X.site()) head.appendChild(h("button", { "data-act": "enter", disabled: !!r.queue.length, onclick: () => { X.enterSite(); UI.render(); } }, `Go back inside ${loc.name}`));
    mapBox.appendChild(head);
    if (inSite) G.SiteView.render(mapBox, { onObject: UI.onSiteObject, onCancel: UI.cancelSearch });
    else G.MapView.render(mapBox, (nid) => {
      if (nid === r.loc) { X.enterSite(); UI.render(); return; }
      if (!X.moveTo(nid)) UI.toast(X.immobile() ? "Over 150% carry: drop something first." : "Can't move there."); UI.render();
    });
    layout.appendChild(mapBox);
    const side = h("div", { class: "exp-side" });
    // heat
    const t = X.heatTier();
    const heat = h("section", { class: "panel" }, h("h3", null, `Heat ${r.heat} — ${t.name}`), bar(r.heat / DATA.config.heat.max, t.color, `${r.heat}/100`));
    const marks = h("div", { class: "heat-marks" }); for (const th of DATA.config.heat.thresholds) marks.appendChild(h("span", { style: `left:${th.min}%` }, "|" + th.name));
    heat.appendChild(marks);
    heat.appendChild(h("small", null, `Enemy budget ×${t.budgetMult} · loot rarity +${t.lootBonus}%` + (t.hostileBonus ? ` · hostiles +${t.hostileBonus}%` : "") + (t.closeExtractions ? ` · ${t.closeExtractions >= 99 ? "only one extraction open" : t.closeExtractions + " extraction(s) closed"}` : "") + (t.forcedBattle ? " · strike team intercepts at next location" : "")));
    side.appendChild(heat);
    // squad
    const body = X.body(), maxHp = X.maxBodyHp();
    const sq = h("section", { class: "panel" }, h("h3", null, "Squad"));
    sq.appendChild(h("div", { class: "sq-row" }, SP.icon(G.State.bodySprite(body), 22), h("span", { class: "sq-name" }, body.name + " (you)"), bar(r.bodyHp / maxHp, "#5fd35f", `${Math.ceil(r.bodyHp)}/${Math.round(maxHp)}`),
      h("button", { disabled: !(r.bag.res.med > 0) || r.bodyHp >= maxHp, onclick: () => { UI.toast(X.useMed("body")); UI.render(); } }, healIco(), "Heal")));
    r.squad.forEach((m, i) => {
      const mx = G.Battle.unitFromGrunt(m.g).maxHp, isCarried = r.carriedCritical.includes(m.g.uid);
      sq.appendChild(h("div", { class: "sq-row" + (m.hp <= 0 ? " dead" : "") }, SP.icon(G.State.gruntTpl(m.g).sprite, 18), h("span", { class: "sq-name" }, m.g.name), m.hp > 0 ? bar(m.hp / mx, "#5fd35f", `${Math.ceil(m.hp)}/${Math.round(mx)}`) : h("span", { class: "bad" }, isCarried ? "Critical (carried)" : m.left ? "left behind" : "dead"),
        m.hp > 0 ? h("button", { disabled: !(r.bag.res.med > 0) || m.hp >= mx, onclick: () => { UI.toast(X.useMed(i)); UI.render(); } }, healIco(), "Heal") : null));
    });
    side.appendChild(sq);
    // carry
    const cap = X.capacity(), kg = X.carried(), pct = (kg / cap) * 100;
    const carry = h("section", { class: "panel" }, h("h3", null, `Carry ${U.fmt1(kg)} / ${U.fmt1(cap)} kg`), bar(pct / 150, pct >= 150 ? "#e04040" : pct > 100 ? "#e0a040" : "#6aa0ff", `${Math.round(pct)}%`));
    if (pct > 100) carry.appendChild(h("div", { class: "warn" }, pct >= DATA.config.carry.immobileAtPct ? "Over 150%: you can't move until you drop something." : `Overloaded: −${Math.round(pct - 100)}% Move Speed in battle.`));
    // gear
    for (const slot of ["weapon", "head", "body", "backpack"]) { const it = r.gear[slot]; if (it) carry.appendChild(UI.itemEl(it, [{ label: "Unequip", fn: () => { X.unequip(slot); UI.render(); } }], slot)); }
    carry.appendChild(h("h4", null, "Bag"));
    for (const it of r.bag.items) carry.appendChild(UI.itemEl(it, G.Items.isQuest(it) ? [{ label: "Drop", fn: () => { X.dropItem(it.uid); UI.render(); } }] : [
      { label: "Equip", fn: () => { X.equipFromBag(it.uid); UI.render(); } },
      { label: "Pouch", fn: () => { const e = X.toPouch(it.uid); if (e) UI.toast(e); UI.render(); } },
      { label: "Drop", fn: () => { X.dropItem(it.uid); UI.render(); } }], G.Items.isQuest(it) ? "quest item" : null));
    for (const k in r.bag.res) if (r.bag.res[k] > 0) carry.appendChild(h("div", { class: "item-row" }, SP.icon(DATA.items.resources[k].sprite, 20), h("span", { class: "item-name" }, `${r.bag.res[k]} × ${DATA.items.resources[k].name}`, h("small", null, ` ${U.fmt1(r.bag.res[k] * DATA.items.resources[k].kgPerUnit)} kg`)),
      h("span", { class: "item-acts" }, h("button", { onclick: () => { const e = X.resToPouch(k); if (e) UI.toast(e); UI.render(); } }, "Pouch"), h("button", { onclick: () => { X.dropRes(k, 1); UI.render(); } }, "Drop 1"))));
    carry.appendChild(h("h4", null, `Secure Pouch (${r.pouch.length}/${G.Outpost.pouchSlots()}, max ${G.Outpost.pouchMaxKg()} kg — survives death)`));
    r.pouch.forEach((p, i) => { if (p.item) carry.appendChild(UI.itemEl(p.item, [{ label: "Take out", fn: () => { X.fromPouch(i); UI.render(); } }])); else carry.appendChild(h("div", { class: "item-row" }, `${p.n} × ${DATA.items.resources[p.res].name}`, h("button", { onclick: () => { X.fromPouch(i); UI.render(); } }, "Take out"))); });
    side.appendChild(carry);
    // extraction
    if (loc && loc.extraction) {
      const ex = X.extractionDef(node), open = X.extractionOpen(node);
      let label = ex.type === "free" ? "Extract (free)" : ex.type === "check" ? (() => { const c = G.Checks.compute(ex.skill, ex.dc, X.members(), X.gearItems()); return `Extract: ${DATA.skills[ex.skill].name} DC ${ex.dc} — ${Math.round(c.chance)}%`; })() : `Extract: hold out ${ex.surviveSec} s (defense battle)`;
      side.appendChild(h("section", { class: "panel extract" }, h("h3", null, "Extraction point: " + loc.name), open ? h("button", { class: "primary big", "data-act": "extract", disabled: !X.canExtract(), onclick: () => { const res = X.extract(); UI.toast(res.text); UI.render(); } }, label) : h("div", { class: "warn" }, "Closed at this Heat level.")));
    } else side.appendChild(h("section", { class: "panel" }, h("small", null, inSite ? "Click an object to search it. The tooltip shows the time and the disturbance chance. Leave to the map to move on." : "Click a highlighted neighbouring location to move (+2 Heat). Click where you are to go back inside. The outpost is hidden: extraction is the only way home.")));
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
    if (step.type === "message") return UI.modal(h("div", null, h("h2", null, step.title), h("p", null, step.text), h("button", { class: "primary", onclick: () => { G.Exp.resolveMessage(step); UI.render(); } }, "OK")));
    if (step.type === "critical") return UI.stepCritical(step);
    if (step.type === "spot") return UI.stepSpot(step);
  };

  UI.stepSpot = function (step) {
    const P = DATA.zones.passages[step.pid], info = G.Exp.spotInfo(step.pid);
    const box = h("div", null, h("h2", null, "Something feels off here"), h("p", { class: "ev-text" }, "Water is running somewhere under the tracks. Maybe there's a way down."),
      h("p", null, `Best of ${P.spot.skills.map((k) => DATA.skills[k].name).join(" / ")} (squad best) vs DC ${P.spot.dc}: `, h("span", { class: "chance" }, UI.checkLabel(info))));
    const btn = h("button", { class: "primary", "data-act": "spot", onclick: () => {
      const res = G.XP.at({ el: btn }, () => G.Exp.resolveSpot(step));
      const out = h("div", null, h("h2", null, res.found ? "You found a way down!" : "Nothing obvious"), h("p", { class: "roll " + (res.found ? "good" : "bad") }, res.roll.text),
        h("p", null, res.found ? `A ${P.name.toLowerCase()} hidden under the weeds leads to ${DATA.zones.list[G.Zones.otherEnd(step.pid, "a")].name}. It's on your map for good` + (DATA.zones.passageUnlockOnDeath ? ", and the zone is now a starting choice at the outpost." : ".") : "Maybe you'll spot it on a later visit."),
        h("button", { class: "primary", onclick: () => UI.render() }, "Continue"));
      UI.modal(out);
    } }, "Look around");
    box.appendChild(btn);
    UI.modal(box);
  };

  // ---------- location view interaction ----------
  UI.onSiteObject = function (o, acts, el) {
    const X = G.Exp, site = X.site();
    site.squadAt = o.id;
    if (acts[0] === "use") { const r = X.useObject(o.id); if (r.error) UI.toast(r.error); UI.render(); return; }
    if (acts[0] === "reopen") { X.reopen(o.id); UI.render(); return; }
    if (acts[0] === "cross") {
      const P = DATA.zones.passages[o.pid], to = G.Zones.otherEnd(o.pid, G.state.run.zone), why = X.canCross(o.pid);
      if (why) return UI.toast(why);
      UI.modal(h("div", null, h("h2", null, P.name), h("p", null, `Crawl through to ${DATA.zones.list[to].name}? +${P.crossHeat} Heat. You keep your carry, squad and Heat.`),
        h("button", { class: "primary", "data-act": "cross", onclick: () => { const e = X.crossPassage(o.pid); if (e) UI.toast(e); UI.closeModal(); UI.render(); } }, "Crawl through"), h("button", { onclick: () => UI.closeModal() }, "Not now")));
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
    if (res.error) { UI.toast(res.error); UI.render(); return; }
    UI.render();
    const el2 = G.SiteView.els[S.objId] || el;
    if (el2 && G.XPFloat) G.XPFloat.text(el2, `Disturbance ${U.fmt1(res.disturb.pct)}% → ${Math.floor(res.disturb.roll)}: ${res.disturb.hit ? "heard!" : "quiet"}`, res.disturb.hit ? "#ff7a6a" : "#bbb", "below");
    if (res.texts.length && (res.empty || !G.Exp.current())) UI.toast(res.texts.join(" "));
  };

  UI.stepBattleIntro = function (step) {
    const fam = DATA.enemies.families[step.family];
    UI.modal(h("div", null, h("h2", { class: "bad" }, step.why || "Hostiles!"), h("p", null, `${fam.name} ahead. You'll place your squad on the grid, then the fight plays out automatically.`),
      h("button", { class: "primary", onclick: () => { UI.closeModal(); UI.startBattle(step); } }, "To battle")));
  };

  UI.startBattle = function (step) {
    const b = G.Exp.buildBattle(step, G.Debug && G.Debug.rollMath);
    const scr = $("#screen");
    UI.battle = { step, b };
    UI.battle.v = G.BattleView.mount(scr, b, { speed: UI.battleSpeed, onEnd: (bb) => UI.battleSummary(step, bb) });
    G.log(`Battle seed ${b.seed}`);
  };

  UI.battleSummary = function (step, b) {
    const sm = G.Battle.summary(b);
    const tbl = h("table", { class: "summary" }, h("tr", null, ...["Unit", "State", "Dmg", "Hits", "Misses", "Jams", "Kills", "Heals"].map((x) => h("th", null, x))));
    for (const r of sm.rows) tbl.appendChild(h("tr", { class: r.side ? "enemy" : "" }, ...[r.name, r.state, r.dmg, r.hits, r.misses, r.jams, r.kills, r.heals].map((x) => h("td", null, String(x)))));
    const box = h("div", null, h("h2", { class: b.result === "win" ? "good" : "bad" }, b.result === "win" ? "VICTORY" : "DEFEAT"), h("p", null, `Duration ${Math.round(b.t)} s · seed ${b.seed}`), tbl,
      h("div", { class: "blog" }, ...sm.log.map((l) => h("div", null, l))),
      h("button", { class: "primary", onclick: () => { G.BattleView.unmount(UI.battle.v); UI.battle = null; UI.closeModal(); G.Exp.finishBattle(step, b); UI.render(); } }, "Continue"));
    UI.modal(box, "wide");
  };

  UI.checkLabel = function (info) {
    return `${DATA.skills[info.skill].name} DC ${info.dc} — ${Math.round(info.chance)}%` + (G.Debug && G.Debug.rollMath ? ` [d20 + ${info.mod}: skill ${info.best}/4${info.helpers ? " +" + info.helpers + " helpers" : ""}${info.gear ? " +" + info.gear + " gear" : ""}]` : ` (best skill ${info.best}${info.helpers ? ", +" + info.helpers + " helpers" : ""}${info.gear ? ", +" + info.gear + " gear" : ""})`);
  };

  UI.stepEvent = function (step) {
    const ev = G.Exp.eventDef(step);
    const box = h("div", { class: ev.radio ? "radio" : "" }, h("h2", null, ev.icon ? SP.icon(ev.icon, 32, "ev-icon") : null, (ev.radio ? "📻 " : "") + ev.title), h("p", { class: "ev-text" }, ev.text));
    const aliveGrunts = G.state.run.squad.some((m) => m.hp > 0);
    ev.options.forEach((opt, i) => {
      const info = G.Exp.optionChance(opt);
      const ob = h("button", { onclick: () => { UI._evAnchor = ob.getBoundingClientRect(); UI.eventResult(step, i, false); } }, opt.label);
      const row = h("div", { class: "ev-opt" }, ob, info ? h("span", { class: "chance" }, UI.checkLabel(info)) : null);
      if (opt.gruntSpendable && aliveGrunts) row.appendChild(h("button", { class: "grunt", onclick: () => UI.eventResult(step, i, true) }, `Send a Grunt ahead (auto-success, ${DATA.map.gruntSpendDeathChance}% they die)`));
      box.appendChild(row);
    });
    UI.modal(box, "wide");
  };

  UI.eventResult = function (step, i, grunt) {
    const res = G.XP.at({ rect: UI._evAnchor }, () => G.Exp.resolveEvent(step, i, grunt));
    const box = h("div", null, h("h2", null, G.Exp.eventDef(step).title));
    if (res.roll) box.appendChild(h("p", { class: "roll " + (G.Checks.isSuccess(res.roll.grade) ? "good" : "bad") }, res.roll.text));
    for (const t of res.texts) box.appendChild(h("p", null, t));
    box.appendChild(h("button", { class: "primary", onclick: () => UI.render() }, "Continue"));
    UI.modal(box);
  };

  UI.stepContainer = function (step) {
    const X = G.Exp, box = h("div", null, h("h2", null, step.title));
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
    step.items.forEach((it, idx) => box.appendChild(UI.itemEl(it, [{ label: "Take", fn: () => { X.takeItem(step, idx); UI.render(); } }])));
    for (const k in step.res) box.appendChild(h("div", { class: "item-row" }, SP.icon(DATA.items.resources[k].sprite, 20), ` ${step.res[k]} × ${DATA.items.resources[k].name} (${U.fmt1(step.res[k] * DATA.items.resources[k].kgPerUnit)} kg) `, h("button", { onclick: () => { X.takeRes(step, k); UI.render(); } }, "Take")));
    if (!step.items.length && !Object.keys(step.res).length) box.appendChild(h("p", { class: "hint" }, "Empty."));
    if (step.objId) box.appendChild(h("p", { class: "hint" }, "Anything you leave stays here. You can come back for it."));
    box.appendChild(h("div", { class: "row" }, h("button", { "data-act": "take-all", onclick: () => { X.takeAll(step); UI.render(); } }, "Take all"), h("button", { class: "primary", "data-act": "done", onclick: () => { X.closeContainer(); UI.render(); } }, "Done")));
    UI.modal(box, "wide");
  };

  UI.stepCritical = function (step) {
    const r = G.state.run, m = r.squad[step.squadIdx], cc = DATA.bodies.criticalCare, med = r.bag.res.med || 0;
    const box = h("div", null, h("h2", null, `${m.g.name} is Critical`), h("p", null, "Spend precious Med Supplies, carry them, or leave them."));
    const go = (c) => { const e = G.Exp.resolveCritical(step, c); if (e) UI.toast(e); UI.render(); };
    box.appendChild(h("button", { disabled: med < cc.healMed, onclick: () => go("heal") }, healIco(), `Heal (${cc.healMed} Med) → ${cc.healHpPct}% HP`));
    box.appendChild(h("button", { disabled: med < cc.stabilizeMed, onclick: () => go("stabilize") }, `Stabilize (${cc.stabilizeMed} Med) → ${cc.stabilizeHpPct}% HP`));
    box.appendChild(h("button", { onclick: () => go("carry") }, `Carry (${cc.carryKg} kg; dies if you lose a battle)`));
    box.appendChild(h("button", { onclick: () => go("leave") }, "Leave them"));
    UI.modal(box);
  };

  // live timers on the outpost screen
  UI.tick = function () {
    if (!G.state.run && G.Outpost.tick().length && !document.querySelector(".modal")) { UI.toast("Vault upgrade finished!"); UI.render(); return; }
    document.querySelectorAll("[data-timer=vault]").forEach((el) => { el.textContent = U.fmtTime(G.Outpost.remainingMs("vault")); });
    document.querySelectorAll("[data-restore]").forEach((el) => {
      const b = G.State.body(el.dataset.restore); if (!b) return;
      const ms = b.restoreUntil - G.now();
      if (ms <= 0) UI.render(); else el.textContent = "Restoring " + U.fmtTime(ms);
    });
  };
})(window);
