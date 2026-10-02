// Town view (Slice 2 §1): the outpost home screen. A 1000x600 stage scaled to fit; hotspots from DATA.town, with
// rects / overlay positions / anchors from DATA.townArt (the art agent's town_hotspots.json) when present.
// Hover: the art's lit+outlined overlay (CSS :hover), name label. Click: opens that panel. Placeholder art = labelled boxes.
(function (root) {
  const G = root.G, U = G.Util;
  const TV = G.TownView = {};
  const h = (...a) => G.UI.h(...a);
  const src = (file) => (DATA.sprites.basePath || "assets/") + file;

  // Slice 5 §I: the current act's home (G.Prestige; the outpost art until a home set is committed) + its carried props
  TV.art = () => (G.Prestige ? G.Prestige.townArt() : DATA.townArt);
  TV.carried = (A) => { const C = A && A.carriedProps && A.carriedProps.props; return C && G.Prestige ? Object.values(C).filter((p) => p.file && G.Prestige.cameFrom(p.fromTown)) : []; };
  TV.hotspots = function () {
    const A = TV.art(), art = A && A.hotspots ? Object.fromEntries(A.hotspots.map((x) => [x.id, x])) : {};
    for (const cp of TV.carried(A)) if (cp.hotspotOverride && art[cp.hotspotOverride.id]) art[cp.hotspotOverride.id] = Object.assign({}, art[cp.hotspotOverride.id], cp.hotspotOverride);   // the carried prop's own outline / hover
    const O = G.Outpost;
    return DATA.town.hotspots.map((d) => {
      let a = art[d.id] || d.art || {};
      const rect = a.rect || [d.x, d.y, d.w, d.h];
      // Slice 3 §9-10: the building on this hotspot (if any). Built: its built art + name; unbuilt: the lot + "Build ..." tip
      const bk = O && O.byHotspot ? O.byHotspot(d.id) : null, built = bk && O.st(bk).level >= 1;
      if (bk && !O.enabled(bk)) return null;   // productionEnabled false hides the Water Still lot
      let label = d.label || a.label;
      if (built) { if (a.built) a = Object.assign({}, a, { outline: a.built.outline || a.outline, hover: a.built.hover || a.hover, builtSprite: a.built.sprite }); label = bk === "vault" ? label : (d.opens || "").startsWith("giver:") ? `${label} · ${O.def(bk).name}` : O.def(bk).name; }
      return Object.assign({}, d, { rect, art: a, label, building: bk, built, buildTip: bk && !built ? d.tip : null, labelAnchor: a.labelAnchor || [rect[0] + rect[2] / 2, rect[1] - 6], badgeAnchor: a.badgeAnchor || [rect[0] + rect[2] - 14, rect[1] + 10] });
    }).filter(Boolean);
  };
  // badges: "!" (giver can turn in), Vault timer ring, Body Lab restore timer
  TV.badge = function (hs) {
    if (hs.opens && hs.opens.startsWith("giver:")) { const g = hs.opens.split(":")[1]; if (G.Quests.anyTurnIn(g)) return { cls: "bang", text: "!" }; }
    // Slice 3 §9-10: any building's build / upgrade timer (ring), then its own badge (craft / bed timers, Still counts, bounties)
    if (hs.building) { const k = hs.building, ms = G.Outpost.remainingMs(k); if (ms > 0) { const L = G.Outpost.def(k).levels[G.Outpost.st(k).upgrading.to]; return { cls: "ring", text: U.fmtTime(ms), frac: 1 - ms / (L.buildSec * 1000), timer: k }; } }
    if (hs.building && hs.built && G.Buildings && G.Buildings.badge) { const bd = G.Buildings.badge(hs.building); if (bd) return bd; }
    if (hs.opens === "recruit" && G.Allies && G.Allies.promotable().length) return { cls: "promote", text: "Promote" };   // Slice 3 §1
    if (hs.opens === "body_lab") { const rs = G.state.bodies.filter((b) => !G.State.bodyReady(b)); if (rs.length) { const ms = Math.min(...rs.map((b) => b.restoreUntil - G.now())); return { cls: "timer", text: "⟳ " + U.fmtTime(ms), timer: "body" }; } }
    return null;
  };

  // "!" over a building whose quest giver has a quest you can take now (G.Quests.availableAt). Real art if delivered.
  TV.questGiver = (hs) => { const g = Object.keys(DATA.quests.givers).find((k) => DATA.quests.givers[k].hotspot === hs.id); return g || (hs.opens && hs.opens.startsWith("giver:") ? hs.opens.slice(6) : null); };
  TV.questMarker = function (hs) {
    const g = TV.questGiver(hs), bm = G.Buildings && G.Buildings.marker ? G.Buildings.marker(hs) : 0;   // Slice 3 §10b: the Radio's bounties
    const npc = hs.npc && G.Tut && G.Tut.bang(hs.npc);   // Slice 4 §A1: Old Marta until you've talked to her
    if ((!g && !bm && !npc) || hs.state !== "active") return null;
    const ids = npc ? ["talk"] : g ? G.Quests.availableAt(g) : Array(bm).fill("bounty"); if (!ids.length) return null;
    const M = DATA.town.questMarker || { px: 32, offsetY: -30 }, [x, y, w, hh] = hs.rect, a = hs.labelAnchor || [x + w / 2, y];
    const el = h("div", { class: "hs-quest", "data-quest-marker": npc ? hs.npc : g || "radio", title: npc ? "Talk to " + hs.label : g ? `${ids.length} quest${ids.length > 1 ? "s" : ""} to pick up` : `${ids.length} bount${ids.length > 1 ? "ies" : "y"} on the board`, style: `left:${(a[0] - x) / w * 100}%;top:${(a[1] + M.offsetY - y) / hh * 100}%;width:${M.px / w * 100}%;height:${M.px / hh * 100}%` });
    // real art (DATA.sprites[M.sprite], sized in town-canvas px so it scales with the town); CSS/SVG "!" if it's missing
    const d = DATA.sprites[M.sprite], ph = () => { el.innerHTML = ""; el.classList.add("placeholder"); el.innerHTML = '<svg viewBox="0 0 32 32" width="100%" height="100%"><g fill="#ffd84a" stroke="#1a1000" stroke-width="2.5" paint-order="stroke"><rect x="11.5" y="1.5" width="9" height="19" rx="2.5"/><circle cx="16" cy="26.5" r="4.5"/></g></svg>'; };
    const pending = (DATA.sprites.pendingArt || []).some((p) => M.sprite.startsWith(p));
    if (d && d.file && !pending) { const im = h("img", { src: src(d.file), alt: "", draggable: "false" }); im.addEventListener("error", ph); el.appendChild(im); } else ph();
    return el;
  };

  TV.render = function (container, onOpen) {
    const A = TV.art(), act = G.Prestige ? G.Prestige.act() : null;
    const stage = h("div", { class: "town-stage" + (act && act.tint && !G.Prestige.homeId() ? " home-" + act.tint : ""), "data-act": act ? act.id : null, "data-home": G.Prestige ? G.Prestige.homeId() || "outpost" : null });
    const bgFile = A ? A.background : DATA.sprites[DATA.town.background] && DATA.sprites[DATA.town.background].file;
    const bg = h("img", { class: "town-bg", src: src(bgFile), alt: "", draggable: "false" });
    bg.addEventListener("error", () => { bg.remove(); stage.classList.add("placeholder"); });
    stage.appendChild(bg);
    for (const cp of TV.carried(A)) { const im = h("img", { class: "town-carried", src: src(cp.file), alt: "", draggable: "false", style: `left:${cp.x / 10}%;top:${cp.y / 6}%` }); im.addEventListener("load", () => { im.style.width = (im.naturalWidth / 10) + "%"; im.style.height = (im.naturalHeight / 6) + "%"; }); stage.appendChild(im); }   // canvas px, like the hotspot overlays
    if (act && act.id > 1) stage.appendChild(h("div", { class: "town-home", "data-home-name": act.homeName }, `${act.homeName} · ${act.label}`));   // Slice 5 §I: you moved
    for (const hs of TV.hotspots()) {
      const [x, y, w, hh] = hs.rect;
      const el = h("div", { class: `town-hs ${hs.state}` + (hs.built ? " built" : ""), "data-hs": hs.id, "data-building": hs.building ? `${hs.building}:${G.Outpost.st(hs.building).level}` : null, style: `left:${x / 10}%;top:${y / 6}%;width:${w / 10}%;height:${hh / 6}%` });
      // placeholder box (hidden once the background art is showing; stays for hotspots without art)
      el.appendChild(h("div", { class: "hs-ph" }, hs.label));
      const ov = (o, cls) => { if (!o || !o.file) return; const im = h("img", { class: cls, src: src(o.file), alt: "", draggable: "false" }); im.addEventListener("load", () => { im.style.left = ((o.x - x) / w * 100) + "%"; im.style.top = ((o.y - y) / hh * 100) + "%"; im.style.width = (im.naturalWidth / w * 100) + "%"; im.style.height = (im.naturalHeight / hh * 100) + "%"; }); im.addEventListener("error", () => im.remove()); el.appendChild(im); };
      if (hs.npc) { if (hs.art.sprite && hs.art.sprite.file) ov(hs.art.sprite, "hs-npcart"); else el.appendChild(G.Sprites.icon(hs.sprite, 64, "hs-npc")); }   // Slice 4 §A1: a standing NPC (not in town_bg)
      if (hs.art.builtSprite) ov(hs.art.builtSprite, "hs-built");   // Slice 3: the built building replaces the old art (opaque)
      ov(hs.art.hover, "hs-hover");
      if (hs.art.open) ov(hs.art.open, "hs-open");
      const lbl = h("div", { class: "hs-label", style: `left:${(hs.labelAnchor[0] - x) / w * 100}%;top:${(hs.labelAnchor[1] - y) / hh * 100}%` }, hs.label + (hs.state === "active" ? (hs.buildTip ? ` · ${hs.buildTip}` : "") : ` · ${hs.tip}`));
      el.appendChild(lbl);
      const bd = TV.badge(hs);
      if (bd) el.appendChild(h("div", { class: "hs-badge " + bd.cls, "data-timer": bd.timer || null, style: `left:${(hs.badgeAnchor[0] - x) / w * 100}%;top:${(hs.badgeAnchor[1] - y) / hh * 100}%` + (bd.frac != null ? `;--frac:${Math.round(bd.frac * 100)}` : "") }, bd.text));
      const qm = TV.questMarker(hs);
      if (qm) el.appendChild(qm);
      el.addEventListener("click", () => { if (hs.state === "active") onOpen(hs.opens, hs); else G.UI.toast(`${hs.label}: ${hs.tip}`); });
      stage.appendChild(el);
    }
    container.appendChild(stage);
    return stage;
  };
})(window);
