// Slice 3 §9-10 building panels (presentation): the generic build / upgrade section (1 crew for the outpost), the
// Workbench (recipes, queue, quality odds, Reforge), and the town badges. Infirmary / Radio / Water Still add theirs below.
(function (root) {
  const G = root.G, U = G.Util, SP = G.Sprites, UI = G.UI;
  const h = (...a) => UI.h(...a);
  const BU = G.Buildings = G.Buildings || {};
  const O = () => G.Outpost;
  const resSpan = (c, mult) => Object.keys(c).map((r) => { const need = c[r] * (mult || 1), have = G.state.stash.res[r] || 0; return h("span", { class: "cost-i" + (have >= need ? "" : " bad"), "data-res": r }, SP.icon(DATA.resources[r].sprite, 16), ` ${need} ${DATA.resources[r].name} `, h("small", null, `(${have})`), "  "); });
  BU.resSpan = resSpan;
  const resText = (c) => Object.keys(c).map((r) => `${c[r]} ${DATA.resources[r].name}`).join(", ");
  BU.resText = resText;

  // build / upgrade section for any building
  BU.buildSection = function (k) {
    const s = G.state, o = O(), d = o.def(k), st = o.st(k), nl = o.nextLevel(k);
    const sec = h("section", { class: "panel build-sec", "data-build": k }, h("h3", null, SP.icon(d.sprite, 28), ` ${d.name} ` + (st.level ? `L${st.level}` : "(not built)")));
    if (st.level) sec.appendChild(h("p", { class: "hint" }, d.levels[st.level].desc || ""));
    if (st.upgrading) {
      const L = d.levels[st.upgrading.to];
      sec.appendChild(h("p", null, `${st.upgrading.to === 1 ? "Building" : "Upgrading to L" + st.upgrading.to}: `, h("b", { "data-timer": k }, U.fmtTime(o.remainingMs(k))), " left (keeps running while the game is closed)"));
      sec.appendChild(UI.bar(1 - o.remainingMs(k) / (L.buildSec * 1000), "#b08a3a", ""));
    } else if (nl) {
      const L = d.levels[nl], c = o.cost(k, nl), why = o.canUpgrade(k);
      sec.appendChild(h("p", null, `${nl === 1 ? "Build" : "Upgrade to L" + nl}: ${L.desc}. Build time ${U.fmtTime(L.buildSec * 1000)}.`));
      sec.appendChild(h("p", null, "Cost: ", ...resSpan(c)));
      sec.appendChild(h("button", { class: "primary", "data-act": "build-" + k, disabled: !!why, onclick: () => { const e = o.startUpgrade(k); if (e) UI.fail(e); else G.Sfx.play("sfx_ui_click"); G.State.save(); UI.render(); } }, nl === 1 ? `Build ${d.name}` : `Upgrade to L${nl}`));
      if (why) sec.appendChild(h("span", { class: "warn" }, " " + why));
      sec.appendChild(h("p", { class: "hint" }, `Paid from the stockpile when you start; nothing is refunded. One build crew: only one building builds or upgrades at a time.`));
    } else sec.appendChild(h("p", { class: "hint" }, "Max level."));
    return sec;
  };

  // ---------- Workbench (§9) ----------
  BU.recipeOutText = function (r) {
    const o = r.out;
    if (o.res) return Object.keys(o.res).map((k) => `${o.res[k]} ${DATA.resources[k].name}`).join(", ") + " → stockpile";
    if (o.ammo) return `${o.n} packs: ${G.Items.base(o.ammo).desc} → stash`;
    if (o.item) return `${G.Items.base(o.item).name} (quality roll, item level ${G.Workbench.craftIlvl()}) → stash`;
    if (o.reforge) return "Reroll one affix line on a Blue+ item (same tier)";
    return "";
  };
  BU.panelWorkbench = function (el) {
    const s = G.state, W = G.Workbench, st = W.st();
    el.appendChild(BU.buildSection("workbench"));
    if (W.level() < 1) { el.appendChild(h("p", { class: "hint" }, "Once it's built: craft Med kits, ammo packs and gear from the stockpile.")); return; }
    // queue
    const qs = h("section", { class: "panel wb-queue", "data-queue": st.queue.length }, h("h3", null, `Queue ${st.queue.length} / ${W.slots()}`));
    if (!st.queue.length) qs.appendChild(h("p", { class: "hint" }, "Idle. Jobs run one after another and keep running while the game is closed."));
    st.queue.forEach((job, i) => {
      const r = W.recipe(job.id), left = W.remainingMs(job), started = i === 0 || st.queue[i - 1].until <= G.now();
      qs.appendChild(h("div", { class: "wb-job", "data-job": job.id }, h("b", null, r.name), job.rarity ? h("span", { style: `color:${DATA.items.rarities[job.rarity].color}` }, ` [${DATA.items.rarities[job.rarity].name}]`) : null,
        job.item ? h("small", null, ` ${G.Items.name(job.item)}: line ${job.line + 1}`) : null, " — ", h("span", { "data-until": job.until }, U.fmtTime(left)), started ? "" : h("small", null, " (waiting)")));
    });
    if ((s.craftLog || []).length) qs.appendChild(h("div", { class: "hint" }, "Recent: " + s.craftLog.slice(0, 4).map((c) => W.recipe(c.id).name + (c.rarity ? ` (${DATA.items.rarities[c.rarity].name})` : "") + (c.text ? `: ${c.text}` : "")).join(" · ")));
    el.appendChild(qs);
    // quality odds
    const info = W.qualityInfo(), Q = DATA.recipes.quality, blue = W.blueChance(info);
    el.appendChild(h("p", { class: "wb-odds", "data-blue": Math.round(blue) }, `Quality roll for gear: ${DATA.skills[Q.skill].name} ${info.best} (d20 + ${info.mod}) vs DC ${info.dc}. `, h("b", { style: `color:${DATA.items.rarities.blue.color}` }, `${U.fmt1(blue)}% Blue`), ` (a crit: beat it by ${DATA.config.checks.critMargin}+ or roll 20), otherwise White. Gives ${DATA.skills[Q.skill].name} XP.`));
    // recipes by tier
    for (const tier of [1, 2]) {
      const sec = h("section", { class: "panel wb-recipes" }, h("h3", null, `Tier ${tier}` + (tier > (O().effects("workbench").tier || 0) ? " (Workbench L2)" : "")));
      for (const id in DATA.recipes.list) {
        const r = DATA.recipes.list[id]; if (r.tier !== tier) continue;
        const lock = W.locked(id);
        const row = h("div", { class: "wb-recipe" + (lock ? " locked" : ""), "data-recipe": id });
        const icon = r.out.item ? G.Items.sprite({ base: r.out.item }) : r.out.ammo ? G.Items.base(r.out.ammo).sprite : r.out.res ? DATA.resources[Object.keys(r.out.res)[0]].sprite : "res_relic_tech";
        row.appendChild(h("span", { class: "wb-ic" }, SP.icon(icon, 28)));
        const body = h("div", { class: "wb-body" }, h("b", null, r.name), h("small", null, ` · ${U.fmtTime(r.sec * 1000)} · `), h("span", { class: "hint" }, BU.recipeOutText(r)), h("div", null, ...resSpan(r.cost)));
        row.appendChild(body);
        let opts = null;
        if (r.out.reforge && !lock) {
          const cands = s.stash.items.filter(W.reforgeable);
          UI.reforge = UI.reforge && cands.some((i) => i.uid === UI.reforge.item) ? UI.reforge : { item: cands[0] ? cands[0].uid : null, line: 0 };
          const it = cands.find((i) => i.uid === UI.reforge.item);
          const selI = h("select", { "data-reforge": "item", onchange: (e) => { UI.reforge = { item: e.target.value, line: 0 }; UI.render(); } }, ...(cands.length ? cands.map((i) => h("option", { value: i.uid, selected: it && i.uid === it.uid }, `${G.Items.name(i)} [${DATA.items.rarities[i.rarity].name} i${i.ilvl}]`)) : [h("option", { value: "" }, "(no Blue+ items in the stash)")]));
          const selL = h("select", { "data-reforge": "line", onchange: (e) => { UI.reforge.line = +e.target.value; } }, ...(it ? it.affixes.map((a, i) => h("option", { value: i, selected: i === UI.reforge.line }, `Line ${i + 1}: ${G.Items.affixText(a)}`)) : []));
          body.appendChild(h("div", null, selI, " ", selL));
          opts = () => ({ item: UI.reforge.item, line: UI.reforge.line });
        }
        const why = lock || W.canCraft(id, opts ? opts() : undefined);
        row.appendChild(h("button", { class: "primary", "data-act": "craft", "data-id": id, disabled: !!why, title: why || "", onclick: () => { const e = W.craft(id, opts ? opts() : undefined); if (e) UI.fail(e); else G.Sfx.play("sfx_ui_click"); G.State.save(); UI.render(); } }, "Craft"));
        if (lock) row.appendChild(h("small", { class: "warn" }, " " + lock));
        sec.appendChild(row);
      }
      el.appendChild(sec);
    }
  };

  // town badges for built buildings (after the build timer ring): craft timer, bed timer, Still counts, bounties
  BU.badge = function (k) {
    if (k === "workbench") { const q = G.Workbench.st().queue; if (q.length) return { cls: "timer", text: "⚒ " + U.fmtTime(G.Workbench.remainingMs(q[0])) }; }
    if (BU.badges && BU.badges[k]) return BU.badges[k]();
    return null;
  };
  BU.badges = BU.badges || {};

  // ---------- injuries (§10a): red chips on the unit (deploy, Body Lab, Grunt panel) ----------
  UI.injuryChips = function (rec) {
    const J = G.Injuries; if (!J || !J.of(rec).length) return null;
    return h("span", { class: "inj-chips", "data-injuries": J.of(rec).map((x) => x.id).join(",") }, ...J.of(rec).map((x) => UI.tipOn(h("span", { class: "inj-chip" }, "✚ " + J.def(x.id).name + (J.inBed(rec.uid, x.id) ? " (in bed)" : "")),
      `<b style="color:#ff8080">${J.def(x.id).name}</b>: ${J.def(x.id).desc}<br>${J.inBed(rec.uid, x.id) ? "Being treated at the Infirmary." : `Heals by itself in ${J.runsLeft(x)} run${J.runsLeft(x) === 1 ? "" : "s"}, or treat it at the Infirmary.`}`)));
  };
  // ---------- Infirmary (§10a): inside Doc Ilse's Tent (the giver panel) ----------
  BU.panelInfirmary = function (el) {
    const J = G.Injuries, o = O(), s = G.state, box = h("div", { "data-infirmary": o.st("infirmary").level });
    box.appendChild(BU.buildSection("infirmary"));
    if (o.built("infirmary")) {
      const E = o.effects("infirmary"), beds = J.beds();
      const sec = h("section", { class: "panel inf-beds" }, h("h3", null, `Beds ${beds.length} / ${E.beds}`));
      for (const b of beds) { const u = J.find(b.uid); sec.appendChild(h("div", { class: "inf-bed", "data-bed": b.uid }, h("b", null, u ? J.name(u) : "?"), `: ${J.def(b.inj).name} — `, h("span", { "data-until": b.until }, U.fmtTime(b.until - G.now())))); }
      const hurt = J.units().filter((u) => J.of(u).length);
      if (!hurt.length) sec.appendChild(h("p", { class: "hint" }, "Nobody is injured."));
      for (const u of hurt) for (const x of J.of(u)) {
        if (J.inBed(u.uid, x.id)) continue;
        const why = J.canTreat(u.uid, x.id);
        sec.appendChild(h("div", { class: "inf-row", "data-injured": u.uid }, h("b", null, J.name(u)), ` · ${J.def(x.id).name} (${J.def(x.id).desc}; heals by itself in ${J.runsLeft(x)} run${J.runsLeft(x) === 1 ? "" : "s"}) `,
          h("button", { class: "primary", "data-act": "treat", disabled: !!why, title: why || "", onclick: () => { const e = J.treat(u.uid, x.id); if (e) UI.fail(e); else G.Sfx.play("sfx_ui_click"); G.State.save(); UI.render(); } }, `Treat (${resText(E.treatCost || {})}, ${U.fmtTime(E.treatSec * 1000)})`)));
      }
      box.appendChild(sec);
      const P = o.produce("infirmary");
      if (P) box.appendChild(BU.productionSection("infirmary"));
    } else box.appendChild(h("p", { class: "hint" }, `Injuries heal by themselves after ${J.healRuns()} runs. With the Infirmary you can treat them.`));
    el.appendChild(box);
  };
  // production holder (Water Still, Infirmary L2 Med): stored / cap, next unit timer, Collect
  BU.productionSection = function (k) {
    const o = O(), P = o.produce(k) || {}, stored = o.stored(k);
    const sec = h("section", { class: "panel prod", "data-prod": k }, h("h3", null, "Production"));
    for (const r in P) {
      const nx = o.nextUnitMs(k, r), p = o.st(k).prod[r];
      sec.appendChild(h("div", { "data-prod-res": r }, SP.icon(DATA.resources[r].sprite, 20), ` ${DATA.resources[r].name}: `, h("b", null, `${stored[r] || 0} / ${P[r].cap}`),
        ` · +1 every ${U.fmtTime(P[r].everySec * 1000)} · `, nx == null ? h("span", { class: "warn" }, "full: paused until you collect") : h("span", null, "next in ", h("span", { "data-until": p.since + P[r].everySec * 1000 }, U.fmtTime(nx)))));
    }
    const any = Object.values(stored).some((n) => n > 0);
    sec.appendChild(h("button", { class: "primary", "data-act": "collect-" + k, disabled: !any, onclick: () => { const got = o.collect(k); if (Object.keys(got).length) { UI.toast("Collected " + resText(got) + "."); G.Sfx.play("sfx_ui_click"); } G.State.save(); UI.render(); } }, "Collect"));
    sec.appendChild(h("p", { class: "hint" }, "Keeps producing while the game is closed. Stops when it's full."));
    return sec;
  };
  BU.badges.infirmary = () => { const J = G.Injuries, b = J.beds(); if (b.length) { const m = Math.min(...b.map((x) => x.until)); return { cls: "timer", text: "✚ " + U.fmtTime(Math.max(0, m - G.now())) }; } const st = O().stored("infirmary"); if (st.med) return { cls: "count", text: `+${st.med} Med` }; return null; };
  BU.giverExtra = function (el, g) { if (g === "ilse" && G.Injuries) BU.panelInfirmary(el); if (G.Quests.shop(g)) BU.panelShop(el, g); };
  // Megan (milestone 5): Dunn's Stores sells Med kits for Scrap (no town currency yet); SP-047: "(Owned: N)" counts the item, not the Scrap
  BU.panelShop = function (el, g) {
    const Q = G.Quests, sh = Q.shop(g), res = G.state.stash.res, sec = h("section", { class: "panel shop" }, h("h3", null, "Stores"));
    for (const key in sh) {
      const it = sh[key], R = DATA.resources[key], price = Object.entries(it.price).map(([r, n]) => `${n} ${DATA.resources[r].name}`).join(" + ");
      const buy = (n) => { const e = Q.buy(g, key, n); if (e) { G.UI.toast(e); G.Sfx.play("sfx_ui_error"); } else { G.Sfx.play("sfx_ui_click"); G.UI.toast(`+${n} ${R.name}`); } G.UI.render(); };
      sec.appendChild(h("div", { class: "shop-row", "data-shop": key }, SP.icon(R.sprite, 24), h("span", null, `${R.name} — ${price} each (Owned: ${res[key] || 0})`),
        h("button", { "data-buy": key + ":1", disabled: !!Q.canBuy(g, key, 1), onclick: () => buy(1) }, "Buy 1"),
        h("button", { "data-buy": key + ":5", disabled: !!Q.canBuy(g, key, 5), onclick: () => buy(5) }, "Buy 5")));
    }
    sec.appendChild(h("p", { class: "hint" }, `Stockpile: ${Object.keys(Object.values(sh)[0].price).map((r) => `${res[r] || 0} ${DATA.resources[r].name}`).join(", ")}. No stock limit.`));
    el.appendChild(sec);
  };

  // ---------- Radio (§10b): bounty board, decode ----------
  BU.bountyRow = function (b) {
    const R = G.Radio, row = h("div", { class: `bounty ${b.status}${b.hot ? " hot" : ""}`, "data-bounty": b.tpl, "data-status": b.status });
    row.appendChild(h("div", null, b.hot ? h("b", { class: "warn" }, "HOT · ") : null, h("b", null, R.text(b))));
    const prog = b.type === "kill" ? ` — ${b.progress}/${b.n} (only kills in ${DATA.zones.list[b.zone].name} count)` : b.type === "scout" ? " — reach it, then extract" : ` — you have ${G.state.stash.res[b.res] || 0}/${b.n}`;
    row.appendChild(h("div", { class: "hint" }, "Reward: " + resText(b.reward) + (b.status === "active" ? prog : "")));
    if (b.status === "open") { const why = R.canTake(b.uid); row.appendChild(h("button", { class: "primary", "data-act": "bounty-take", disabled: !!why, title: why || "", onclick: () => { const e = R.take(b.uid); if (e) UI.fail(e); else G.Sfx.play("sfx_radio"); G.State.save(); UI.render(); } }, "Take bounty")); }
    if (b.status === "active" && b.type === "turnin") { const why = R.canTurnIn(b.uid); row.appendChild(h("button", { class: "primary", "data-act": "bounty-turnin", disabled: !!why, title: why || "", onclick: () => { const e = R.turnIn(b.uid); if (e) UI.fail(e); else UI.toast("Bounty paid: " + resText(b.reward) + "."); G.State.save(); UI.render(); } }, "Turn in")); }
    if (b.status === "paid") row.appendChild(h("small", { class: "good" }, "Paid."));
    return row;
  };
  BU.panelRadio = function (el) {
    const R = G.Radio, o = O();
    el.appendChild(BU.buildSection("radio"));
    if (!R.built()) { el.appendChild(h("p", { class: "hint" }, "Once it's built: a bounty board, rival sightings, and decoding Data Shards.")); return; }
    R.refresh(false);
    const bd = R.st().board, left = Math.max(0, DATA.radio.refreshRuns - (G.state.runCount - bd.made));
    const sec = h("section", { class: "panel radio-board" }, h("h3", null, `Bounty board · ${R.active().length}/${DATA.radio.maxActive} active`), h("p", { class: "hint" }, `${DATA.radio.voice}. No quest slots, no reputation. New offers in ${left} run${left === 1 ? "" : "s"}.`));
    for (const b of bd.list) sec.appendChild(BU.bountyRow(b));
    if (!bd.list.length) sec.appendChild(h("p", { class: "hint" }, "Static."));
    el.appendChild(sec);
    const D = DATA.radio.decode, nf = R.nextFragment(), found = D.fragments.filter((f) => G.state.lore.includes(f)).length, why = R.canDecode();
    el.appendChild(h("section", { class: "panel radio-decode", "data-found": found }, h("h3", null, `Decode · ${found}/${D.fragments.length} fragments`),
      h("p", null, `Spend ${resText(D.cost)} for ${nf ? "a lore fragment (it goes in the Codex) and " : ""}+${D.loreXp} Lore XP.` + (nf ? "" : " Every fragment is found: XP only.")),
      h("button", { class: "primary", "data-act": "decode", disabled: !!why, title: why || "", onclick: () => { const res = R.decode(); if (res.error) return UI.fail(res.error); G.Sfx.play("sfx_radio"); G.State.save(); UI.render();
        const box = h("div", null, h("h2", null, "Decoded"), res.fragment ? h("p", { class: "ev-text" }, DATA.lore[res.fragment]) : h("p", null, "Nothing new, just static."), h("p", { class: "good" }, `+${res.xp} Lore XP`), h("button", { class: "primary", onclick: () => UI.closeModal() }, "OK")); UI.modal(box); } }, "Decode a shard"),
      why ? h("span", { class: "warn" }, " " + why) : null));
    el.appendChild(h("section", { class: "panel radio-intel" }, h("h3", null, "Rival sightings"), h("p", { class: "hint" }, G.Rivals && G.Rivals.intelText ? G.Rivals.intelText() : "Nothing on the air.")));
    if (o.effects("radio").fogReveal) el.appendChild(h("p", { class: "hint" }, `L2: the fog lifts ${o.effects("radio").fogReveal} ring further around the insertion point at the start of every run.`));
  };
  BU.badges.radio = () => { const n = G.Radio.active().length; return n ? { cls: "count", text: `${n} bounty` + (n > 1 ? "s" : "") } : null; };
  // yellow "!" over the Radio while a bounty can be taken (same marker as the quest givers)
  BU.marker = (hs) => (hs.building === "radio" && G.Radio && G.Radio.anyTakeable() ? G.Radio.open().length : 0);

  // ---------- Water Still (§10c, behind outpost.productionEnabled) ----------
  BU.panelStill = function (el) {
    const o = O();
    if (!o.enabled("still")) { el.appendChild(h("p", { class: "hint" }, "Production is switched off (outpost.productionEnabled).")); return; }
    el.appendChild(BU.buildSection("still"));
    if (!o.built("still")) { el.appendChild(h("p", { class: "hint" }, "A trickle of Water (L2: and Food) while you're away. It softens a bad streak; it can't replace runs.")); return; }
    el.appendChild(BU.productionSection("still"));
  };
  // Still counts on the town (click the building to collect)
  BU.badges.still = () => { const st = O().stored("still"), parts = Object.keys(st).filter((r) => st[r] > 0).map((r) => `${st[r]} ${r === "water" ? "💧" : "🌾"}`); return parts.length ? { cls: "count", text: parts.join(" ") } : null; };

  UI.panels.still = ["Water Still", (el) => BU.panelStill(el)];
  UI.panels.radio = ["Radio", (el) => BU.panelRadio(el)];
  UI.panels.workbench = ["Workbench", (el) => BU.panelWorkbench(el)];
})(window);
