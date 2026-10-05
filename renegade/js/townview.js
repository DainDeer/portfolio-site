// Town view (Slice 2 §1): the outpost home screen. A 1000x600 stage scaled to fit; hotspots from DATA.town, with
// rects / overlay positions / anchors from DATA.townArt (the art agent's town_hotspots.json) when present.
// Hover: the art's lit+outlined overlay (CSS :hover), name label. Click: opens that panel. Placeholder art = labelled boxes.
(function (root) {
  const G = root.G, U = G.Util;
  const TV = G.TownView = {};
  const h = (...a) => G.UI.h(...a);
  const src = (file) => G.Assets ? G.Assets.url((DATA.sprites.basePath || "assets/") + file) : (DATA.sprites.basePath || "assets/") + file;

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

  // SP-066: the forest camp's ambient life, from Smudge's town_forest.json: the bonfire, wall torches, smoke, the tripwire
  // mines' arming lights and owls' eyes in the trees. Each is a sprite strip over the background in canvas px (1000x600),
  // like the hotspot overlays and under them. The fire and torch frame 0s are baked into the background, so a missing
  // strip only leaves the still camp. Frames come from one clock (time, not render count), so the town's frequent
  // re-renders never restart anything. Reduced motion: none of it.
  const reducedMotion = () => !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const strip = (file, x, y, fw, fh, cols, rows, cls) => {
    const el = h("div", { class: cls, style: `left:${x / 10}%;top:${y / 6}%;width:${fw / 10}%;height:${fh / 6}%;background-image:url("${src(file)}");background-size:${cols * 100}% ${rows * 100}%` });
    el._cols = cols; el._rows = rows; return el;
  };
  const show = (el, col, row) => {
    const k = col * 100 + row; if (el._f === k) return; el._f = k;
    el.style.backgroundPosition = `${el._cols > 1 ? col / (el._cols - 1) * 100 : 0}% ${el._rows > 1 ? row / (el._rows - 1) * 100 : 0}%`;
  };
  // owls: frame 0 (eyes open) most of the time; a blink 1-2-1 (70 ms a step) every periodS +-40%. Now and then one shuts
  // its eyes and is gone for a few seconds, then opens them again, in its own spot or another free one ("follow the eyes")
  const OWL = { stepS: 0.07, holdS: 0.4, vanish: 0.2, goneS: [2.5, 6] };
  let owls = null;
  const owlFrame = (O, o, t) => {
    const P = O.positions, period = () => P[o.spot].periodS * (0.6 + 0.8 * Math.random()), e = t - o.at;
    if (o.mode === "open") { if (t < o.next) return 0; o.mode = Math.random() < OWL.vanish ? "vanish" : "blink"; o.at = t; return 1; }
    if (o.mode === "blink") { if (e < 3 * OWL.stepS) return [1, 2, 1][Math.floor(e / OWL.stepS)]; o.mode = "open"; o.next = t + period(); return 0; }
    if (o.mode === "vanish") { if (e < OWL.stepS) return 1; if (e < OWL.stepS + OWL.holdS) return 2; o.mode = "gone"; o.at = t + OWL.goneS[0] + Math.random() * (OWL.goneS[1] - OWL.goneS[0]); return 3; }
    if (o.mode === "gone") {
      if (t < o.at) return 3;
      const held = new Set(owls.filter((x) => x !== o && x.mode !== "gone").map((x) => x.spot)), free = P.map((_, i) => i).filter((i) => !held.has(i));
      o.spot = free[Math.floor(Math.random() * free.length)]; o.mode = "appear"; o.at = t; return 2;
    }
    if (e < 2 * OWL.stepS) return [2, 1][Math.floor(e / OWL.stepS)];   // "appear": eyes opening
    o.mode = "open"; o.next = t + period(); return 0;
  };
  TV.ambient = function (A) {
    if (!A || !(A.fire || A.torches || A.smoke || A.owls || A.mines) || reducedMotion()) return null;
    const layer = h("div", { class: "town-anim", "aria-hidden": "true" }), parts = [];
    const add = (el, at) => { layer.appendChild(el); parts.push([el, at]); };
    const T = A.torches, F = A.fire, S = A.smoke, L = A.mines && A.mines.led, O = A.owls;
    if (T) for (const p of T.positions || []) add(strip(T.file, p.x, p.y, T.frameW, T.frameH, T.frames, T.positions.length, "anim-torch"), (t) => [(Math.floor(t * T.fps) + (p.phase || 0)) % T.frames, p.row]);
    if (F) add(strip(F.file, F.x, F.y, F.frameW, F.frameH, F.frames, 1, "anim-fire"), (t) => [Math.floor(t * F.fps) % F.frames, 0]);
    if (S) add(strip(S.file, S.x, S.y, S.frameW, S.frameH, S.frames, 1, "anim-smoke"), (t) => [Math.floor(t * S.fps) % S.frames, 0]);
    if (L) for (const p of L.positions || []) add(strip(L.file, p.x, p.y, L.frameW, L.frameH, L.frames.length, L.positions.length, "anim-mine"), (t) => [t % p.periodS < 0.12 ? 1 : 0, p.row]);
    if (O && O.positions && O.positions.length) {
      if (!owls || owls.src !== O) { const t0 = performance.now() / 1000; owls = O.positions.map((p, i) => ({ spot: i, mode: "open", at: t0, next: t0 + p.periodS * Math.random() })); owls.src = O; }
      // one element per spot in the trees (near / far owls differ); a spot shows the owl sitting there, else nothing (frame 3)
      const spots = O.positions.map((p) => { const V = O[p.variant]; const el = strip(V.file, p.x, p.y, V.frameW, V.frameH, O.frames.length, 1, "anim-owl"); layer.appendChild(el); return el; });
      parts.push([null, (t) => { const f = spots.map(() => 3); for (const o of owls) { const fr = owlFrame(O, o, t); f[o.spot] = Math.min(f[o.spot], fr); } spots.forEach((el, i) => show(el, f[i], 0)); return null; }]);
    }
    layer._parts = parts;
    return layer;
  };
  // one frame loop for whichever town is on screen; it stops when the town is gone and restarts with the next one
  let looping = false;
  const loop = () => {
    const layer = document.querySelector(".town-stage .town-anim");
    if (!layer) { looping = false; return; }
    const t = performance.now() / 1000;
    for (const [el, at] of layer._parts) { const f = at(t); if (el && f) show(el, f[0], f[1]); }
    requestAnimationFrame(loop);
  };
  TV.animate = () => { if (!looping) { looping = true; requestAnimationFrame(loop); } };

  TV.render = function (container, onOpen) {
    const A = TV.art(), act = G.Prestige ? G.Prestige.act() : null;
    const stage = h("div", { class: "town-stage" + (act && act.tint && !G.Prestige.homeId() ? " home-" + act.tint : ""), "data-act": act ? act.id : null, "data-home": G.Prestige ? G.Prestige.homeId() || "outpost" : null });
    const bgFile = A ? A.background : DATA.sprites[DATA.town.background] && DATA.sprites[DATA.town.background].file;
    const bg = h("img", { class: "town-bg", src: src(bgFile), alt: "", draggable: "false" });
    bg.addEventListener("error", () => { bg.remove(); stage.classList.add("placeholder"); });
    stage.appendChild(bg);
    const amb = TV.ambient(A); if (amb) { stage.appendChild(amb); TV.animate(); }
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
