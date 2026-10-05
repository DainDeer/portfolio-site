// Slice 4 §D: card DOM (the pickup pop, the Binder panel, the big-card inspect). Logic: js/cards.js. Art: Smudge's
// card frames (assets/ui/card_*). Every card is laid out in the frame's own 80x112 space as percentages, and the name
// text scales with the card (container query units), so one element works at any size.
(function (root) {
  const G = root.G, UI = G.UI, SP = G.Sprites, h = UI.h;
  const CV = G.CardView = {};
  const url = (key) => G.Assets ? G.Assets.url(DATA.sprites.basePath + SP.def(key).file) : DATA.sprites.basePath + SP.def(key).file;
  const img = (key, cls) => h("img", { class: cls, src: url(key), alt: "", draggable: "false" });
  // a card element. o: { unfound, foil, isNew, px (card width) }
  CV.card = function (c, o) {
    o = o || {};
    const el = h("div", { class: "tcard" + (o.unfound ? " unfound" : "") + (o.foil ? " foil" : ""), "data-card": c.id, "data-rarity": c.rarity });
    el.style.width = (o.px || 80) + "px";
    el.appendChild(img(o.unfound ? "card_slot_unfound" : DATA.cards.rarities[c.rarity].frame, "tc-frame"));
    const win = h("div", { class: "tc-art" + (c.portrait ? " portrait" : "") }); win.appendChild(SP.icon(c.sprite, c.portrait ? 64 : 32)); el.appendChild(win);
    if (o.foil && !o.unfound) el.appendChild(h("div", { class: "tc-foil" }));
    el.appendChild(h("div", { class: "tc-name" }, o.unfound ? "???" : c.name));
    if (o.isNew) el.appendChild(img("card_badge_new", "tc-new"));
    return el;
  };
  // ---- pickup pop (corner): back -> flip -> front; NEW! on a first copy ----
  const queue = []; let showing = false;
  CV.pickup = function (info) { queue.push(info); if (!showing) next(); };
  // Vixie (Sep 30): in a landscape phone battle the pop sat over the right column; there a small toast (thumbnail + name)
  // runs along the bottom edge instead and fades by itself (pop.toastMs). A tap opens the big card. Never pauses the fight
  // (nothing here touches the battle), and it keeps off the battle controls (CV.placeToast). Portrait / desktop: the pop.
  CV.toastMode = () => !!(G.Touch && G.Touch.landscape && G.Touch.landscape() && document.querySelector("#screen > .battle-wrap"));
  CV.TOAST_AVOID = ".touch-ctl, .ability-bar, .abl-btn, .tp-panel, .battle-hud, .bh-speed, .tc-btn, .dice-panel, .dice-mini, .tut-box";
  CV.placeToast = function (el) {
    const R = (s) => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); }, vw = root.innerWidth, vh = root.innerHeight;
    const col = R(".touch-ctl"), bw = R("#screen > .battle-wrap"), cv = R("#screen > .battle-wrap canvas"), spots = [];
    if (col && col.left > vw / 2) spots.push({ spot: "col", left: col.left, right: 6 });                        // under the right column's controls
    if (bw) spots.push({ spot: "field", left: bw.left + 6, right: Math.max(6, vw - bw.right + 6) });             // along the bottom of the battlefield
    if (cv) spots.push({ spot: "field-top", left: cv.left + 6, right: Math.max(6, vw - cv.right + 6), top: cv.top + 6 });   // portrait (the pop's fallback): over the top of the arena, where no button is
    const hit = [...document.querySelectorAll(CV.TOAST_AVOID)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    const put = (sp) => { Object.assign(el.style, { width: "", left: sp.left + "px", right: sp.right + "px", top: sp.top != null ? sp.top + "px" : "", bottom: sp.top != null ? "auto" : "" }); el.dataset.spot = sp.spot; };
    let best = null;
    for (const sp of spots) {
      put(sp);
      const a = el.getBoundingClientRect(), c = hit.reduce((s, b) => s + Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)), 0);
      if (!best || c < best.c) best = { sp, c };
      if (!c) break;
    }
    if (best && !best.c) { el.classList.remove("ct-compact"); el.style.display = ""; return put(best.sp); }
    CV.toastFallback(el, hit);
  };
  // Rivet (#6): with every spot covered the toast took the least-covered one, and in a forced test that was over a
  // button. Vixie's rule: nothing may ever cover an ability / battle button mid-fight. So then scan the screen for a
  // strip that touches no button (CV.TOAST_BTNS; the softer TOAST_AVOID panels as the tie-break), preferring the arena,
  // full size, then narrower (min 150 px), then the thumbnail alone (.ct-compact, 44 px). No room at all: it stays
  // hidden (the card is in the binder anyway) and is looked at again on the next 250 ms re-check.
  CV.TOAST_BTNS = ".abl-btn, .tc-btn, .touch-ctl button, .bh-speed, .bh-pause, .tp-panel button, .tp-q, .ability-bar button, .battle-hud button, .battle-hud input";
  CV.toastFallback = function (el, soft) {
    const vw = root.innerWidth, vh = root.innerHeight, pad = 6;
    const hard = [...document.querySelectorAll(CV.TOAST_BTNS)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    el.classList.remove("ct-compact"); el.style.display = "";
    Object.assign(el.style, { left: pad + "px", right: "auto", top: "0px", bottom: "auto", width: "" });
    const full = Math.min(300, vw - 2 * pad), hh = el.offsetHeight || 50, cvr = document.querySelector("#screen > .battle-wrap canvas");
    const arena = cvr && cvr.getBoundingClientRect();
    const softC = (x, y, w) => soft.reduce((c, b) => c + Math.max(0, Math.min(x + w, b.right) - Math.max(x, b.left)) * Math.max(0, Math.min(y + hh, b.bottom) - Math.max(y, b.top)), 0);
    const gaps = (y) => {   // free x-intervals of the row [y, y + hh] (4 px clear of every button)
      const xs = hard.filter((b) => b.top - 4 < y + hh && b.bottom + 4 > y).map((b) => [b.left - 4, b.right + 4]).sort((a, b) => a[0] - b[0]);
      const out = []; let x = pad; for (const [a, b] of xs) { if (a > x) out.push([x, a]); x = Math.max(x, b); } if (vw - pad > x) out.push([x, vw - pad]); return out;
    };
    let pick = null;
    for (const minW of [full, 150, 44]) {
      for (let y = pad; y + hh <= vh - pad; y += 2) for (const [a, b] of gaps(y)) {
        if (b - a < minW) continue;
        const w = minW === 44 ? 44 : Math.min(full, b - a), x = arena && a < arena.right && b > arena.left ? Math.min(Math.max(a, arena.left + pad), b - w) : a;
        const inArena = arena && y >= arena.top && y + hh <= arena.bottom ? 0 : 1, c = softC(x, y, w);
        if (!pick || inArena < pick.inArena || (inArena === pick.inArena && c < pick.c)) pick = { x, y, w, c, inArena };
      }
      if (pick) break;
    }
    if (!pick) { el.style.display = "none"; el.dataset.spot = "none"; return; }
    if (pick.w < 150) el.classList.add("ct-compact");
    Object.assign(el.style, { left: pick.x + "px", width: pick.w + "px", right: "auto", top: pick.y + "px", bottom: "auto" }); el.dataset.spot = "scan";
  };
  // Vixie (Sep 30): portrait phones in a battle: the pop may never cover an ability / battle button. It takes the first
  // spot (the usual corner, then over the battlefield, then the screen corners) that covers nothing in CV.TOAST_AVOID,
  // re-checked every 250 ms; with no such spot at this size it becomes the landscape toast for that pickup.
  CV.dodgeMode = () => !!(G.Touch && G.Touch.layout && G.Touch.layout() && !CV.toastMode() && document.querySelector("#screen > .battle-wrap"));
  CV.placePop = function (el) {
    const vw = root.innerWidth, vh = root.innerHeight, bw = document.querySelector("#screen > .battle-wrap canvas") || document.querySelector("#screen > .battle-wrap");
    const f = bw && bw.getBoundingClientRect(), w = el.offsetWidth, hh = el.offsetHeight, spots = [{ spot: "corner", x: vw - 30 - w, y: vh - 90 - hh }];
    if (f) spots.push({ spot: "field-r", x: f.right - 6 - w, y: f.top + 6 }, { spot: "field-l", x: f.left + 6, y: f.top + 6 }, { spot: "field-rb", x: f.right - 6 - w, y: f.bottom - 6 - hh });
    spots.push({ spot: "br", x: vw - 6 - w, y: vh - 6 - hh }, { spot: "bl", x: 6, y: vh - 6 - hh }, { spot: "tr", x: vw - 6 - w, y: 6 }, { spot: "tl", x: 6, y: 6 });
    const hit = [...document.querySelectorAll(CV.TOAST_AVOID)].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    const free = (x, y) => x >= 0 && y >= 0 && x + w <= vw && y + hh <= vh && !hit.some((b) => Math.min(x + w, b.right) > Math.max(x, b.left) && Math.min(y + hh, b.bottom) > Math.max(y, b.top));
    const sp = spots.find((s) => free(s.x, s.y)); if (!sp) return false;
    Object.assign(el.style, { left: sp.x + "px", top: sp.y + "px", right: "auto", bottom: "auto" }); el.dataset.spot = sp.spot; return true;
  };
  function toast(info, quiet) {
    const P = DATA.cards.pop;
    const el = h("div", { class: "card-toast", "data-card": info.card.id, role: "button", title: "Tap to see the card" },
      CV.card(info.card, { foil: info.foil, px: 32 }),
      h("div", { class: "ct-text" }, h("b", null, info.card.name), h("small", null, (info.isNew ? "New card!" : "×" + info.n) + (info.foil ? " · Foil" : ""))));
    let gone = false; const iv = setInterval(() => { if (!gone) CV.placeToast(el); }, 250);
    const bye = () => { if (gone) return; gone = true; clearInterval(iv); clearTimeout(el._t); el.remove(); next(); };
    el.onclick = (e) => { e.stopPropagation(); const c = info.card; bye(); const hold = CV.holdFight(); CV.inspect(c); CV.onInspectClose(hold); setTimeout(() => G.UI.hideTip(), 0); };   // (a tap also showed the toast's "Tap to see the card" tip)
    document.body.appendChild(el); CV.placeToast(el);
    if (G.Sfx && !quiet) { G.Sfx.play(info.foil ? "sfx_card_foil" : "sfx_card_pickup"); if (info.isNew) setTimeout(() => G.Sfx.play("sfx_card_new"), P.newDelayMs); }
    requestAnimationFrame(() => el.classList.add("in"));
    el._t = setTimeout(() => { el.classList.add("out"); setTimeout(bye, 400); }, P.toastMs || 3500);
  }
  function next() {
    const info = queue.shift(); if (!info) { showing = false; return; }
    showing = true;
    if (CV.toastMode()) return toast(info);
    const P = DATA.cards.pop, px = root.innerWidth >= 900 && root.innerHeight >= 600 ? 160 : 80;   // whole-pixel scales only (2x / 1x)
    const box = h("div", { class: "card-pop", "data-card": info.card.id, style: `--flip:${P.flipMs}ms;--cw:${px}px` });
    const flip = h("div", { class: "cp-flip" }, img("card_back", "cp-back"), CV.card(info.card, { foil: info.foil, isNew: info.isNew, px }));
    box.appendChild(flip);
    box.appendChild(h("div", { class: "cp-cap" }, info.isNew ? "New card!" : `${info.card.name} ×${info.n}`, info.foil ? h("b", null, " Foil") : null));
    let iv = 0; const done = () => { clearInterval(iv); box.remove(); };
    box.onclick = () => { done(); clearTimeout(box._t); next(); };
    document.body.appendChild(box);
    if (CV.dodgeMode()) {
      if (!CV.placePop(box)) { box.remove(); return toast(info); }
      iv = setInterval(() => { if (box.isConnected && !CV.placePop(box)) { done(); clearTimeout(box._t); toast(info, true); } }, 250);   // a button showed up under it: the toast takes over (no 2nd sound)
    }
    if (G.Sfx) { G.Sfx.play(info.foil ? "sfx_card_foil" : "sfx_card_pickup"); if (info.isNew) setTimeout(() => G.Sfx.play("sfx_card_new"), P.newDelayMs); }
    requestAnimationFrame(() => box.classList.add("in"));
    setTimeout(() => flip.classList.add("flipped"), 260);
    box._t = setTimeout(() => { box.classList.add("out"); setTimeout(() => { done(); next(); }, 300); }, P.holdMs);
  }
  G.Cards.onPickup = (info) => CV.pickup(info);
  G.Cards.onSet = (list) => { for (const x of list) UI.toast(x.text); };   // Slice 5 §J: set rewards
  // ---- binder panel ----
  CV.pages = function () {
    const list = G.Cards.list(), have = G.Cards.st().have, pages = [];
    for (const [gid, gname] of DATA.cards.groups) {
      const cs = list.filter((c) => c.group === gid), got = cs.filter((c) => have[c.id]).length;
      for (let i = 0; i < cs.length; i += 12) pages.push({ group: gid, name: gname, cards: cs.slice(i, i + 12), got, total: cs.length, part: i / 12 + 1, parts: Math.ceil(cs.length / 12) });
    }
    return pages;
  };
  CV.page = 0;
  // Slice 5 §J: a finished group's frame tint (class + the --set-tint colour from data)
  CV.setCls = (gid) => (G.Cards.setEarned(gid) ? " set-done" : "");
  CV.setVar = (gid) => (G.Cards.setEarned(gid) ? `;--set-tint:${(DATA.cards.sets.group.tints || {})[gid] || "#ffd84a"}` : "");
  UI.panels.binder = ["Binder", (el) => CV.panel(el)];
  CV.panel = function (el) {
    // layouts: "spread" (binder_bg, 2 pages), "page" (binder_page, portrait phones), "grid" (binder_pocket sleeves 6x2, short / landscape phones)
    const mode = root.innerHeight < 600 ? "grid" : root.innerWidth < 760 ? "page" : "spread";
    const pages = CV.pages(), per = mode === "spread" ? 2 : 1, cnt = G.Cards.count(), have = G.Cards.st().have;
    CV.page = Math.max(0, Math.min(CV.page - (CV.page % per), pages.length - 1));
    const wrap = h("div", { class: "binder " + mode });
    const head = h("div", { class: "binder-head" }, h("b", { "data-binder-count": cnt.have + "/" + cnt.total }, `Series ${DATA.cards.series} · ${cnt.have}/${cnt.total} found`));
    const go = (d) => { CV.page = Math.max(0, Math.min(pages.length - 1, CV.page + d * per)); UI.render(); };
    head.appendChild(h("span", { class: "binder-nav" },
      h("button", { "data-act": "binder-prev", disabled: CV.page === 0 ? "" : null, onclick: () => go(-1) }, "◀"),
      h("span", null, `${Math.floor(CV.page / per) + 1} / ${Math.ceil(pages.length / per)}`),
      h("button", { "data-act": "binder-next", disabled: CV.page + per >= pages.length ? "" : null, onclick: () => go(1) }, "▶")));
    for (const [gid, gname] of DATA.cards.groups) { const i = pages.findIndex((p) => p.group === gid); head.appendChild(h("button", { class: "binder-tab" + (pages[CV.page] && pages[CV.page].group === gid ? " on" : ""), "data-tab": gid, onclick: () => { CV.page = i - (i % per); UI.render(); } }, gname)); }
    // Slice 5 §J: the Series title + an unspent Foil wild card
    if (G.Cards.title() || G.Cards.wild()) wrap.appendChild(h("div", { class: "binder-sets" }, G.Cards.title() ? h("b", { "data-card-title": "1" }, "★ " + G.Cards.title()) : null,
      G.Cards.wild() ? h("span", { "data-wild": G.Cards.wild() }, DATA.cards.sets.text.wild.replace("{n}", G.Cards.wild())) : null));
    wrap.appendChild(head);
    if (mode === "grid") { CV.grid(wrap, pages[CV.page], have); el.appendChild(wrap); return; }
    const spread = h("div", { class: "binder-spread", "data-per": per }); spread.appendChild(img(per === 1 ? "binder_page" : "binder_bg", "binder-bgimg"));
    const M = per === 1 ? { pockets: [[16, 44], [116, 44], [216, 44], [316, 44], [16, 178], [116, 178], [216, 178], [316, 178], [16, 312], [116, 312], [216, 312], [316, 312]], headers: [[12, 10, 396, 24]], W: 420, H: 448 }
      : { pockets: [[80, 120], [180, 120], [280, 120], [380, 120], [80, 254], [180, 254], [280, 254], [380, 254], [80, 388], [180, 388], [280, 388], [380, 388], [532, 120], [632, 120], [732, 120], [832, 120], [532, 254], [632, 254], [732, 254], [832, 254], [532, 388], [632, 388], [732, 388], [832, 388]], headers: [[76, 86, 396, 24], [528, 86, 396, 24]], W: 1000, H: 600 };
    const pct = (x, W) => (x / W * 100) + "%";
    for (let s = 0; s < per; s++) {
      const pg = pages[CV.page + s]; if (!pg) continue;
      const [hx, hy, hw, hh] = M.headers[s];
      spread.appendChild(h("div", { class: "binder-ph" + CV.setCls(pg.group), style: `left:${pct(hx, M.W)};top:${pct(hy, M.H)};width:${pct(hw, M.W)};height:${pct(hh, M.H)}` + CV.setVar(pg.group) }, `${pg.name}${pg.parts > 1 ? ` (${pg.part}/${pg.parts})` : ""}`, h("span", null, `${pg.got}/${pg.total}`)));
      pg.cards.forEach((c, i) => {
        const [px, py] = M.pockets[s * 12 + i], hv = have[c.id];
        const pk = h("div", { class: "binder-pocket" + (hv ? " filled" : "") + (hv ? CV.setCls(pg.group) : ""), style: `left:${pct(px + 4, M.W)};top:${pct(py + 4, M.H)};width:${pct(80, M.W)}` + CV.setVar(pg.group), onclick: () => CV.inspect(c) });
        const card = CV.card(c, { unfound: !hv, foil: hv && hv.foil > 0 }); card.style.width = "100%"; pk.appendChild(card);
        if (hv) { pk.appendChild(img("binder_corners", "binder-corners")); if (hv.n > 1) pk.appendChild(h("span", { class: "binder-n" }, "×" + hv.n)); }
        spread.appendChild(pk);
      });
    }
    wrap.appendChild(spread);
    el.appendChild(wrap);
  };
  CV.grid = function (wrap, pg, have) {
    const ph = Math.max(80, Math.min(120, Math.floor((root.innerHeight - 190) / 2)));   // two rows of sleeves fit the height
    const g = h("div", { class: "binder-grid", style: `--ph:${ph}px` + CV.setVar(pg.group) });
    g.appendChild(h("div", { class: "binder-ph" + CV.setCls(pg.group) }, `${pg.name}${pg.parts > 1 ? ` (${pg.part}/${pg.parts})` : ""}`, h("span", null, `${pg.got}/${pg.total}`)));
    const cells = h("div", { class: "binder-cells" });
    pg.cards.forEach((c) => { const hv = have[c.id];
      const pk = h("div", { class: "binder-sleeve" + (hv ? " filled" : "") + (hv ? CV.setCls(pg.group) : ""), onclick: () => CV.inspect(c) }, img("binder_pocket", "binder-sleeve-bg"));
      const card = CV.card(c, { unfound: !hv, foil: hv && hv.foil > 0 }); card.style.width = ""; card.classList.add("in-sleeve"); pk.appendChild(card);
      if (hv) { pk.appendChild(img("binder_corners", "binder-corners")); if (hv.n > 1) pk.appendChild(h("span", { class: "binder-n" }, "×" + hv.n)); }
      cells.appendChild(pk); });
    g.appendChild(cells); wrap.appendChild(g);
  };
  // Vixie (Sep 30): tapping the pickup toast mid-fight opens the card AND pauses the fight, with the Space key's pause
  // (G.BattleView.togglePause: the tactical pause, when it's on); closing the card resumes, but only a pause we made
  // (already paused before the tap: it stays paused). holdFight -> the battle view we paused, or null.
  CV.holdFight = function () {
    const BV = G.BattleView, v = BV && BV.active;
    if (!v || v.done || !v.b || v.b.paused || !G.Tactical || !G.Tactical.canPause(v.b)) return null;
    BV.togglePause(v); return v.b.paused ? v : null;
  };
  CV.onInspectClose = function (v) {
    const box = document.querySelector("#modal-root .card-inspect"); if (!v || !box) return;
    let ours = true; const iv = setInterval(() => { if (!v.b.paused) ours = false; }, 100);   // they resumed (Space) meanwhile: any later pause is theirs
    const resume = () => { mo.disconnect(); clearInterval(iv); if (ours && !v.done && v.b.paused && G.Tactical.canPause(v.b)) G.BattleView.togglePause(v); };
    const mo = new MutationObserver(() => { if (!box.isConnected) resume(); });   // Close, or anything else that shuts the modal
    mo.observe(document.getElementById("modal-root"), { childList: true, subtree: true });
  };
  CV.inspect = function (c) {
    const hv = G.Cards.st().have[c.id], R = DATA.cards.rarities[c.rarity];
    const box = h("div", { class: "card-inspect", "data-inspect": c.id });
    box.appendChild(CV.card(c, { unfound: !hv, foil: hv && hv.foil > 0, px: 240 }));
    const info = h("div", { class: "ci-info" });
    if (hv) {
      info.appendChild(h("h2", null, c.name));
      info.appendChild(h("p", { class: "ci-rarity r-" + c.rarity }, `${R.name} · ${DATA.cards.groups.find((g) => g[0] === c.group)[1]}`));
      info.appendChild(h("p", null, `Copies: ${hv.n}` + (hv.foil ? ` · Foil: ${hv.foil}` : "")));
      info.appendChild(h("p", { class: "hint" }, c.blurb));
      if (G.Cards.wild() > 0) info.appendChild(h("button", { "data-act": "use-wild", onclick: () => { const r = G.Cards.useWild(c.id); if (r.error) return UI.fail(r.error); UI.closeModal(); UI.toast(r.text); UI.render(); } }, DATA.cards.sets.text.wildUse));   // Slice 5 §J
    } else { info.appendChild(h("h2", null, "???")); info.appendChild(h("p", { class: "hint" }, "Not found yet.")); }
    info.appendChild(h("button", { class: "primary", onclick: () => UI.closeModal() }, "Close"));
    box.appendChild(info);
    UI.modal(box, "card-modal");
  };
})(window);
