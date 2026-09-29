// Town view (Slice 2 §1): the outpost home screen. A 1000x600 stage scaled to fit; hotspots from DATA.town, with
// rects / overlay positions / anchors from DATA.townArt (the art agent's town_hotspots.json) when present.
// Hover: the art's lit+outlined overlay (CSS :hover), name label. Click: opens that panel. Placeholder art = labelled boxes.
(function (root) {
  const G = root.G, U = G.Util;
  const TV = G.TownView = {};
  const h = (...a) => G.UI.h(...a);
  const src = (file) => (DATA.sprites.basePath || "assets/") + file;

  TV.hotspots = function () {
    const art = DATA.townArt && DATA.townArt.hotspots ? Object.fromEntries(DATA.townArt.hotspots.map((x) => [x.id, x])) : {};
    return DATA.town.hotspots.map((d) => {
      const a = art[d.id] || {};
      const rect = a.rect || [d.x, d.y, d.w, d.h];
      return Object.assign({}, d, { rect, art: a, label: d.label || a.label, labelAnchor: a.labelAnchor || [rect[0] + rect[2] / 2, rect[1] - 6], badgeAnchor: a.badgeAnchor || [rect[0] + rect[2] - 14, rect[1] + 10] });
    });
  };
  // badges: "!" (giver can turn in), Vault timer ring, Body Lab restore timer
  TV.badge = function (hs) {
    if (hs.opens && hs.opens.startsWith("giver:")) { const g = hs.opens.split(":")[1]; if (G.Quests.anyTurnIn(g)) return { cls: "bang", text: "!" }; }
    if (hs.opens === "vault") { const ms = G.Outpost.remainingMs("vault"); if (ms > 0) { const L = G.Outpost.def("vault").levels[G.Outpost.st("vault").upgrading.to]; return { cls: "ring", text: U.fmtTime(ms), frac: 1 - ms / (L.buildSec * 1000), timer: "vault" }; } }
    if (hs.opens === "body_lab") { const rs = G.state.bodies.filter((b) => !G.State.bodyReady(b)); if (rs.length) { const ms = Math.min(...rs.map((b) => b.restoreUntil - G.now())); return { cls: "timer", text: "⟳ " + U.fmtTime(ms), timer: "body" }; } }
    return null;
  };

  TV.render = function (container, onOpen) {
    const stage = h("div", { class: "town-stage" });
    const bgFile = DATA.townArt ? DATA.townArt.background : DATA.sprites[DATA.town.background] && DATA.sprites[DATA.town.background].file;
    const bg = h("img", { class: "town-bg", src: src(bgFile), alt: "", draggable: "false" });
    bg.addEventListener("error", () => { bg.remove(); stage.classList.add("placeholder"); });
    stage.appendChild(bg);
    for (const hs of TV.hotspots()) {
      const [x, y, w, hh] = hs.rect;
      const el = h("div", { class: `town-hs ${hs.state}`, "data-hs": hs.id, style: `left:${x / 10}%;top:${y / 6}%;width:${w / 10}%;height:${hh / 6}%` });
      // placeholder box (hidden once the background art is showing; stays for hotspots without art)
      el.appendChild(h("div", { class: "hs-ph" }, hs.label));
      const ov = (o, cls) => { if (!o || !o.file) return; const im = h("img", { class: cls, src: src(o.file), alt: "", draggable: "false" }); im.addEventListener("load", () => { im.style.left = ((o.x - x) / w * 100) + "%"; im.style.top = ((o.y - y) / hh * 100) + "%"; im.style.width = (im.naturalWidth / w * 100) + "%"; im.style.height = (im.naturalHeight / hh * 100) + "%"; }); im.addEventListener("error", () => im.remove()); el.appendChild(im); };
      ov(hs.art.hover, "hs-hover");
      if (hs.art.open) ov(hs.art.open, "hs-open");
      const lbl = h("div", { class: "hs-label", style: `left:${(hs.labelAnchor[0] - x) / w * 100}%;top:${(hs.labelAnchor[1] - y) / hh * 100}%` }, hs.label + (hs.state === "active" ? "" : ` · ${hs.tip}`));
      el.appendChild(lbl);
      const bd = TV.badge(hs);
      if (bd) el.appendChild(h("div", { class: "hs-badge " + bd.cls, "data-timer": bd.timer || null, style: `left:${(hs.badgeAnchor[0] - x) / w * 100}%;top:${(hs.badgeAnchor[1] - y) / hh * 100}%` + (bd.frac != null ? `;--frac:${Math.round(bd.frac * 100)}` : "") }, bd.text));
      el.addEventListener("click", () => { if (hs.state === "active") onOpen(hs.opens, hs); else G.UI.toast(`${hs.label}: ${hs.tip}`); });
      stage.appendChild(el);
    }
    container.appendChild(stage);
    return stage;
  };
})(window);
